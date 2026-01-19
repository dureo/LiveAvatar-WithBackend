import StreamingAvatar, {
    AvatarQuality,
    StreamingEvents,
    TaskType,
} from "@heygen/streaming-avatar";

/**
 * ENV esperadas (Vite):
 * - VITE_API_BASE_URL              (tu backend, ej: https://edamgames.com o http://localhost:3000)
 * - VITE_AVATAR_NAME               (avatarName / avatarId en HeyGen Interactive Avatar)
 * - VITE_VOICE_ID                  (opcional)
 * - VITE_KNOWLEDGE_ID              (opcional, recomendado para respuestas “con personalidad”)
 * - VITE_LANGUAGE                  (ej: "es" o "en")
 *
 * Backend esperado:
 * - GET {API_BASE_URL}/api/get-access-token  => { token: "SESSION_TOKEN" }
 *   Este token sale de POST https://api.heygen.com/v1/streaming.create_token  :contentReference[oaicite:5]{index=5}
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const AVATAR_NAME = import.meta.env.VITE_AVATAR_NAME || "default";
const VOICE_ID = import.meta.env.VITE_VOICE_ID || "";
const KNOWLEDGE_ID = import.meta.env.VITE_KNOWLEDGE_ID || "";
const LANGUAGE = import.meta.env.VITE_LANGUAGE || "es";

const videoElement = document.getElementById("avatarVideo");
const startButton = document.getElementById("startSession");
const endButton = document.getElementById("endSession");

const textModeBtn = document.getElementById("textModeBtn");
const voiceModeBtn = document.getElementById("voiceModeBtn");
const textModeControls = document.getElementById("textModeControls");
const voiceModeControls = document.getElementById("voiceModeControls");
const voiceStatus = document.getElementById("voiceStatus");

const speakButton = document.getElementById("speakButton");
const userInput = document.getElementById("userInput");

const micSelect = document.getElementById("micSelect");
const speakerSelect = document.getElementById("speakerSelect");

const logEl = document.getElementById("log");
function log(...args) {
    console.log(...args);
    if (!logEl) return;
    const line = args
        .map((a) => (typeof a === "string" ? a : JSON.stringify(a, null, 2)))
        .join(" ");
    logEl.textContent += line + "\n";
    logEl.scrollTop = logEl.scrollHeight;
}

let avatar = null;
let sessionData = null;
let currentMode = "text";

// “Prewarm” mic seleccionado (no garantiza que el SDK lo use, pero ayuda a fijar permisos
// y a veces a que el navegador mantenga el device activo).
let prewarmStream = null;

async function fetchAccessToken() {
    const resp = await fetch(`${API_BASE_URL}/api/get-access-token`, {
        method: "GET",
        headers: { accept: "application/json" },
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.token) {
        throw new Error(
            `get-access-token failed (${resp.status}): ${JSON.stringify(json)}`
        );
    }
    return json.token;
}

function cleanupUI() {
    try {
        videoElement.srcObject = null;
    } catch {}

    avatar = null;
    sessionData = null;

    startButton.disabled = false;
    endButton.disabled = true;

    textModeBtn.disabled = true;
    voiceModeBtn.disabled = true;

    setModeUI("text");
    voiceStatus.textContent = "Voice mode idle.";
}

function setModeUI(mode) {
    currentMode = mode;

    if (mode === "text") {
        textModeBtn.classList.add("active");
        voiceModeBtn.classList.remove("active");
        textModeControls.style.display = "block";
        voiceModeControls.style.display = "none";
    } else {
        textModeBtn.classList.remove("active");
        voiceModeBtn.classList.add("active");
        textModeControls.style.display = "none";
        voiceModeControls.style.display = "block";
    }
}

async function setAudioOutput(deviceId) {
    // setSinkId suele estar en Chrome/Edge desktop, no siempre en Safari/Firefox.
    if (typeof videoElement.setSinkId !== "function") {
        log("[audio] setSinkId not supported in this browser");
        return;
    }
    try {
        await videoElement.setSinkId(deviceId);
        log("[audio] Audio output set to:", deviceId);
    } catch (e) {
        log("[audio] setSinkId failed:", e?.message || e);
    }
}

async function listDevices() {
    // Necesitas permisos para ver labels en muchos navegadores.
    log("[ui] Requesting mic permission + listing devices...");
    try {
        const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
        tmp.getTracks().forEach((t) => t.stop());
    } catch (e) {
        log("[devices] getUserMedia denied or failed:", e?.message || e);
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter((d) => d.kind === "audioinput");
    const speakers = devices.filter((d) => d.kind === "audiooutput");

    micSelect.innerHTML = "";
    speakerSelect.innerHTML = "";

    for (const d of mics) {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Micro (${d.deviceId.slice(0, 8)}…)`;
        micSelect.appendChild(opt);
    }

    for (const d of speakers) {
        const opt = document.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || `Speaker (${d.deviceId.slice(0, 8)}…)`;
        speakerSelect.appendChild(opt);
    }

    log(`[devices] mics=${mics.length} speakers=${speakers.length}`);

    const savedMic = localStorage.getItem("preferredMicId");
    const savedSpk = localStorage.getItem("preferredSpeakerId");

    if (savedMic && mics.some((m) => m.deviceId === savedMic)) micSelect.value = savedMic;
    if (savedSpk && speakers.some((s) => s.deviceId === savedSpk)) speakerSelect.value = savedSpk;

    // Aplica output inicial (si se puede).
    if (speakerSelect.value) await setAudioOutput(speakerSelect.value);
}

async function prewarmSelectedMic() {
    const deviceId = micSelect.value;
    localStorage.setItem("preferredMicId", deviceId);

    if (prewarmStream) {
        prewarmStream.getTracks().forEach((t) => t.stop());
        prewarmStream = null;
    }

    try {
        prewarmStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: deviceId ? { exact: deviceId } : undefined },
        });

        const t = prewarmStream.getAudioTracks()[0];
        log("[mic] prewarm ok:", {
            label: t?.label,
            readyState: t?.readyState,
            enabled: t?.enabled,
            muted: t?.muted,
        });
    } catch (e) {
        log("[mic] prewarm failed:", e?.message || e);
    }
}

async function initializeAvatarSession() {
    try {
        startButton.disabled = true;
        endButton.disabled = true;
        textModeBtn.disabled = true;
        voiceModeBtn.disabled = true;

        await listDevices();
        await prewarmSelectedMic();

        log("[ui] Starting session on backend...");
        const token = await fetchAccessToken();

        avatar = new StreamingAvatar({ token });

        avatar.on(StreamingEvents.STREAM_READY, (event) => {
            log("[avatar] STREAM_READY");
            if (!event?.detail) {
                log("[avatar] stream missing in event.detail");
                return;
            }
            videoElement.srcObject = event.detail;
            videoElement.onloadedmetadata = () => {
                videoElement.play().catch((e) => log("[video] play failed:", e?.message || e));
            };

            // Ya hay stream, permitimos voice mode.
            textModeBtn.disabled = false;
            voiceModeBtn.disabled = false;
            voiceModeBtn.disabled = false;
        });

        avatar.on(StreamingEvents.STREAM_DISCONNECTED, () => {
            log("[avatar] STREAM_DISCONNECTED");
            cleanupUI();
        });

        // Eventos útiles para status del voice chat  :contentReference[oaicite:6]{index=6}
        avatar.on(StreamingEvents.USER_START, () => {
            voiceStatus.textContent = "Listening…";
            log("[voice] USER_START");
        });
        avatar.on(StreamingEvents.USER_STOP, () => {
            voiceStatus.textContent = "Processing…";
            log("[voice] USER_STOP");
        });
        avatar.on(StreamingEvents.AVATAR_START_TALKING, () => {
            voiceStatus.textContent = "Avatar speaking…";
            log("[voice] AVATAR_START_TALKING");
        });
        avatar.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
            voiceStatus.textContent = "Waiting for you…";
            log("[voice] AVATAR_STOP_TALKING");
        });

        log("[ui] Creating session…");
        const startReq = {
            quality: AvatarQuality.High,
            avatarName: AVATAR_NAME,
            language: LANGUAGE,
            // Recomendado: evita cortes por inactividad
            activityIdleTimeout: 3600,
        };

        // Voice y Knowledge (opcionales)
        if (VOICE_ID) startReq.voice = { voiceId: VOICE_ID };
        if (KNOWLEDGE_ID) startReq.knowledgeId = KNOWLEDGE_ID;

        sessionData = await avatar.createStartAvatar(startReq);
        log("[session] sessionData:", sessionData);

        endButton.disabled = false;

        // Arrancamos en Text Mode por defecto.
        setModeUI("text");
        textModeBtn.disabled = false;
        // voiceModeBtn se habilita cuando llega STREAM_READY

    } catch (e) {
        log("[ui] Error starting session:", e?.message || e);
        cleanupUI();
    } finally {
        log("[ui] Ready.");
    }
}

async function terminateAvatarSession() {
    try {
        endButton.disabled = true;

        if (avatar) {
            try {
                await avatar.closeVoiceChat();
            } catch {}

            try {
                await avatar.stopAvatar();
            } catch {}
        }

        if (prewarmStream) {
            prewarmStream.getTracks().forEach((t) => t.stop());
            prewarmStream = null;
        }
    } finally {
        cleanupUI();
        log("[ui] Ready.");
    }
}

async function startVoiceChat() {
    if (!avatar) return;
    try {
        voiceStatus.textContent = "Starting voice chat…";

        // API ref: startVoiceChat({ useSilencePrompt?, isInputAudioMuted? }) :contentReference[oaicite:7]{index=7}
        await avatar.startVoiceChat({
            useSilencePrompt: false,
            isInputAudioMuted: false,
        });

        voiceStatus.textContent = "Waiting for you…";
        log("[voice] startVoiceChat ok");
    } catch (e) {
        voiceStatus.textContent = "Error starting voice chat.";
        log("[voice] startVoiceChat failed:", e?.message || e);
    }
}

async function switchMode(mode) {
    if (!avatar) return;

    if (mode === currentMode) return;

    if (mode === "text") {
        setModeUI("text");
        try {
            await avatar.closeVoiceChat();
            log("[voice] closeVoiceChat ok");
        } catch (e) {
            log("[voice] closeVoiceChat failed:", e?.message || e);
        }
        return;
    }

    // mode === "voice"
    setModeUI("voice");
    await prewarmSelectedMic();
    await startVoiceChat();
}

async function handleSendText() {
    if (!avatar) return;

    const text = (userInput.value || "").trim();
    if (!text) return;

    try {
        // TALK: HeyGen genera respuesta influida por KnowledgeId/KnowledgeBase. :contentReference[oaicite:8]{index=8}
        await avatar.speak({
            text,
            task_type: TaskType.TALK,
        });
        userInput.value = "";
    } catch (e) {
        log("[text] speak failed:", e?.message || e);
    }
}

// UI events
startButton.addEventListener("click", initializeAvatarSession);
endButton.addEventListener("click", terminateAvatarSession);

textModeBtn.addEventListener("click", () => switchMode("text"));
voiceModeBtn.addEventListener("click", () => switchMode("voice"));

speakButton.addEventListener("click", handleSendText);
userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSendText();
});

micSelect.addEventListener("change", async () => {
    await prewarmSelectedMic();
});

speakerSelect.addEventListener("change", async () => {
    localStorage.setItem("preferredSpeakerId", speakerSelect.value);
    await setAudioOutput(speakerSelect.value);
});

// Estado inicial
endButton.disabled = true;
textModeBtn.disabled = true;
voiceModeBtn.disabled = true;

// Lista dispositivos al cargar (sin forzar start)
listDevices().catch(() => {});

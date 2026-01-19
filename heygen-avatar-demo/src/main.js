import { Room, createLocalAudioTrack } from "livekit-client";

/**
 * ENV esperadas (Vite):
 * - VITE_API_BASE_URL  (tu backend LiveAvatar, ej: http://localhost:3000)
 * - VITE_AVATAR_ID
 * - VITE_VOICE_ID
 * - VITE_CONTEXT_ID
 * - VITE_LANGUAGE      (ej: "es" o "en")
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
const AVATAR_ID = import.meta.env.VITE_AVATAR_ID;
const VOICE_ID = import.meta.env.VITE_VOICE_ID;
const CONTEXT_ID = import.meta.env.VITE_CONTEXT_ID;
const LANGUAGE = import.meta.env.VITE_LANGUAGE || "es";

const videoElement = document.getElementById("avatarVideo");
const audioElement = document.getElementById("avatarAudio");
const startButton = document.getElementById("startSession");
const endButton = document.getElementById("endSession");
const speakButton = document.getElementById("speakButton");
const userInput = document.getElementById("userInput");
const statusEl = document.getElementById("status");

let room = null;
let micTrack = null;

let audioAttached = false;
let videoAttached = false;
const PREFERRED_AUDIO_PARTICIPANT = "heygen";

function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
}

function cleanupUI() {
    try {
        videoElement.srcObject = null;
        audioElement.srcObject = null;
    } catch {}

    room = null;
    micTrack = null;
    audioAttached = false;
    videoAttached = false;

    startButton.disabled = false;
    endButton.disabled = true;
    speakButton.disabled = true;
    userInput.disabled = true;
    setStatus("Sesión detenida.");
}

async function startSessionOnBackend() {
    const resp = await fetch(`${API_BASE_URL}/api/start-session`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
            avatar_id: AVATAR_ID,
            voice_id: VOICE_ID,
            context_id: CONTEXT_ID,
            language: LANGUAGE,
        }),
    });

    const text = await resp.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`start-session returned non-JSON (${resp.status}): ${text.slice(0, 200)}`);
    }

    if (!resp.ok) throw new Error(`start-session failed (${resp.status}): ${JSON.stringify(json)}`);
    if (!json?.livekit_url || !json?.livekit_client_token) {
        throw new Error(`start-session missing livekit creds: ${JSON.stringify(json)}`);
    }

    return json;
}

// 🔴 Envía comandos a LiveAvatar (FULL mode) por el topic agent-control
function sendAgentControl(eventObj) {
    if (!room) return;
    const payload = new TextEncoder().encode(JSON.stringify(eventObj));
    room.localParticipant.publishData(payload, { reliable: true, topic: "agent-control" });
}

function attachAgentResponseDebug(r) {
    r.on("dataReceived", (payload, participant, kind, topic) => {
        if (topic !== "agent-response") return;

        try {
            const text = new TextDecoder().decode(payload);
            const evt = JSON.parse(text);
            console.log("[agent-response]", evt);

            if (evt?.event_type === "avatar.speak_started") {
                setStatus("Avatar hablando…");
            }

            if (evt?.event_type === "avatar.speak_ended") {
                setStatus("Escuchando…");
                sendAgentControl({ event_type: "avatar.start_listening" });
            }
        } catch (e) {
            console.warn("agent-response parse failed:", e);
        }
    });
}

function attachTracks(r) {
    r.on("trackSubscribed", (track, publication, participant) => {
        const who = participant?.identity;

        if (track.kind === "video" && !videoAttached) {
            const stream = new MediaStream([track.mediaStreamTrack]);
            videoElement.srcObject = stream;
            videoAttached = true;
            videoElement.play().catch(() => {});
            return;
        }

        if (track.kind === "audio") {
            if (audioAttached && who !== PREFERRED_AUDIO_PARTICIPANT) return;

            const stream = new MediaStream([track.mediaStreamTrack]);
            audioElement.muted = false;
            audioElement.volume = 1;
            audioElement.srcObject = stream;
            audioAttached = true;

            audioElement.play().catch(() => {});
        }
    });

    r.on("disconnected", (reason) => {
        console.log("Desconectado de la sala. reason:", reason);
        cleanupUI();
    });
}

async function initializeAvatarSession() {
    try {
        startButton.disabled = true;
        endButton.disabled = true;
        speakButton.disabled = true;
        userInput.disabled = true;
        setStatus("Iniciando sesión LiveAvatar…");

        const { livekit_url, livekit_client_token } = await startSessionOnBackend();

        room = new Room();
        attachTracks(room);
        attachAgentResponseDebug(room);

        await room.connect(livekit_url, livekit_client_token);

        micTrack = await createLocalAudioTrack({
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
        });
        await room.localParticipant.publishTrack(micTrack);

        sendAgentControl({ event_type: "avatar.start_listening" });

        endButton.disabled = false;
        speakButton.disabled = false;
        userInput.disabled = false;
        setStatus("Escuchando…");
    } catch (e) {
        console.error("Error iniciando sesión:", e);
        setStatus("Error iniciando sesión.");
        cleanupUI();
    }
}

async function terminateAvatarSession() {
    try {
        if (micTrack) {
            micTrack.stop();
            micTrack = null;
        }
        if (room) {
            room.disconnect();
            room = null;
        }
    } finally {
        cleanupUI();
    }
}

async function handleSendText() {
    if (!room) return;

    const text = (userInput.value || "").trim();
    if (!text) return;

    sendAgentControl({
        event_type: "avatar.speak",
        text,
    });
    setStatus("Avatar hablando…");
    userInput.value = "";
}

startButton.addEventListener("click", initializeAvatarSession);
endButton.addEventListener("click", terminateAvatarSession);
speakButton.addEventListener("click", handleSendText);
userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSendText();
});

endButton.disabled = true;
speakButton.disabled = true;
userInput.disabled = true;
setStatus("Listo para iniciar.");

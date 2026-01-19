import { AgentEventsEnum, LiveAvatarSession, SessionEvent } from "@heygen/liveavatar-web-sdk";

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
const startButton = document.getElementById("startSession");
const endButton = document.getElementById("endSession");
const speakButton = document.getElementById("speakButton");
const userInput = document.getElementById("userInput");
const statusEl = document.getElementById("status");

let session = null;
let listeningActive = false;

function setStatus(message) {
    if (statusEl) statusEl.textContent = message;
}

function cleanupUI() {
    try {
        videoElement.srcObject = null;
    } catch {}

    session = null;
    listeningActive = false;

    startButton.disabled = false;
    endButton.disabled = true;
    speakButton.disabled = true;
    userInput.disabled = true;
    setStatus("Sesión detenida.");
}

async function fetchSessionToken() {
    const resp = await fetch(`${API_BASE_URL}/api/session-token`, {
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
    if (!json?.session_token) {
        throw new Error(`session-token missing session_token: ${JSON.stringify(json)}`);
    }

    return json;
}

function requestListening(force = false) {
    if (!session) return;
    if (listeningActive && !force) return;
    listeningActive = true;
    session.startListening();
}

function attachAgentEvents(s) {
    s.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, (evt) => {
        console.log("[agent-response]", evt);
        setStatus("Avatar hablando…");
    });

    s.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, (evt) => {
        console.log("[agent-response]", evt);
        setStatus("Escuchando…");
        requestListening(true);
    });

    s.on(AgentEventsEnum.USER_SPEAK_STARTED, (evt) => {
        console.log("[agent-response]", evt);
        setStatus("Escuchando…");
    });

    s.on(AgentEventsEnum.USER_SPEAK_ENDED, (evt) => {
        console.log("[agent-response]", evt);
        setStatus("Procesando respuesta…");
    });

    s.on(AgentEventsEnum.USER_TRANSCRIPTION, (evt) => {
        console.log("[agent-response]", evt);
    });

    s.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (evt) => {
        console.log("[agent-response]", evt);
    });
}

async function initializeAvatarSession() {
    try {
        startButton.disabled = true;
        endButton.disabled = true;
        speakButton.disabled = true;
        userInput.disabled = true;
        setStatus("Iniciando sesión LiveAvatar…");

        const { session_token } = await fetchSessionToken();

        session = new LiveAvatarSession(session_token, { voiceChat: true });
        attachAgentEvents(session);

        session.on(SessionEvent.SESSION_STREAM_READY, () => {
            session.attach(videoElement);
            videoElement.play().catch(() => {});
        });

        session.on(SessionEvent.SESSION_DISCONNECTED, (reason) => {
            console.log("Desconectado de la sesión. reason:", reason);
            cleanupUI();
        });

        await session.start();
        requestListening(true);

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
        if (session) {
            await session.stop();
            session = null;
        }
    } finally {
        cleanupUI();
    }
}

async function handleSendText() {
    if (!session) return;

    const text = (userInput.value || "").trim();
    if (!text) return;

    session.repeat(text);
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

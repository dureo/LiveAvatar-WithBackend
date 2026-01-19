const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
app.use(
    cors({
        origin: FRONTEND_ORIGIN === "*" ? true : [FRONTEND_ORIGIN, "https://edamgames.com"],
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

const LIVEAVATAR_API = "https://api.liveavatar.com/v1";
const LIVEAVATAR_API_KEY = process.env.LIVEAVATAR_API_KEY;

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/start-session", async (req, res) => {
    try {
        if (!LIVEAVATAR_API_KEY) {
            return res.status(500).json({ error: "Falta LIVEAVATAR_API_KEY en .env" });
        }

        const { avatar_id, voice_id, context_id, language = "es" } = req.body || {};
        if (!avatar_id || !voice_id || !context_id) {
            return res.status(400).json({
                error: "Faltan campos en body",
                required: ["avatar_id", "voice_id", "context_id"],
            });
        }

        // 1) Crear session_token
        const tokenResp = await fetch(`${LIVEAVATAR_API}/sessions/token`, {
            method: "POST",
            headers: {
                "X-API-KEY": LIVEAVATAR_API_KEY,
                accept: "application/json",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                mode: "FULL",
                voice_chat: true,
                avatar_id,
                avatar_persona: {
                    voice_id,
                    context_id,
                    language,
                },
            }),
        });

        const tokenJson = await tokenResp.json().catch(() => null);

        if (!tokenResp.ok) {
            console.error("LiveAvatar token error:", tokenResp.status, tokenJson);
            return res.status(tokenResp.status).json({ error: "No se pudo obtener token", details: tokenJson });
        }

        const session_token = tokenJson?.data?.session_token;
        if (!session_token) {
            return res.status(500).json({
                error: "Respuesta inesperada de LiveAvatar (no viene data.session_token)",
                raw: tokenJson,
            });
        }

        // 2) Start session (LiveKit creds)
        const startResp = await fetch(`${LIVEAVATAR_API}/sessions/start`, {
            method: "POST",
            headers: {
                accept: "application/json",
                authorization: `Bearer ${session_token}`,
            },
        });

        const startJson = await startResp.json().catch(() => null);

        if (!startResp.ok) {
            console.error("LiveAvatar start error:", startResp.status, startJson);
            return res.status(startResp.status).json({ error: "No se pudo iniciar sesión", details: startJson });
        }

        const livekit_url = startJson?.data?.livekit_url;
        const livekit_client_token = startJson?.data?.livekit_client_token;

        if (!livekit_url || !livekit_client_token) {
            return res.status(500).json({
                error: "Respuesta inesperada de LiveAvatar (faltan credenciales LiveKit)",
                raw: startJson,
            });
        }

        return res.json({ livekit_url, livekit_client_token });
    } catch (e) {
        console.error("start-session error:", e);
        return res.status(500).json({ error: "Error interno", details: String(e) });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});

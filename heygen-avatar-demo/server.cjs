const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
const allowedOrigins = new Set(
    [
        FRONTEND_ORIGIN === "*" ? null : FRONTEND_ORIGIN,
        "https://edamgames.com",
        "http://localhost:5173",
        "http://localhost:3000",
    ].filter(Boolean)
);

const corsOptions = {
    origin(origin, callback) {
        if (!origin || FRONTEND_ORIGIN === "*" || allowedOrigins.has(origin)) {
            return callback(null, true);
        }
        return callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

const LIVEAVATAR_API = "https://api.liveavatar.com/v1";
const LIVEAVATAR_API_KEY = process.env.LIVEAVATAR_API_KEY;

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/session-token", async (req, res) => {
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

        // 1) Crear session token (FULL)
        const tokenResp = await fetch(`${LIVEAVATAR_API}/sessions/token`, {
            method: "POST",
            headers: {
                "X-API-KEY": LIVEAVATAR_API_KEY,
                accept: "application/json",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                mode: "FULL",
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

        // Soportamos ambos formatos (por si cambia la API)
        const session_token = tokenJson?.data?.session_token || tokenJson?.session_token;
        const session_id = tokenJson?.data?.session_id || tokenJson?.session_id;

        if (!session_token || !session_id) {
            return res.status(500).json({
                error: "Respuesta inesperada de LiveAvatar (faltan session_id/session_token)",
                raw: tokenJson,
            });
        }

        // IMPORTANTE: devolvemos session_id para transcript si hace falta.
        return res.json({ session_token, session_id });
    } catch (e) {
        console.error("start-session error:", e);
        return res.status(500).json({ error: "Error interno", details: String(e) });
    }
});

// 3) Proxy de transcript (el navegador NO debe llamar a la API con tu X-API-KEY)
app.get("/api/session-transcript", async (req, res) => {
    try {
        if (!LIVEAVATAR_API_KEY) {
            return res.status(500).json({ error: "Falta LIVEAVATAR_API_KEY en .env" });
        }

        const session_id = (req.query.session_id || "").toString().trim();
        if (!session_id) {
            return res.status(400).json({ error: "Falta session_id en query" });
        }

        const trResp = await fetch(`${LIVEAVATAR_API}/sessions/${encodeURIComponent(session_id)}/transcript`, {
            method: "GET",
            headers: {
                "X-API-KEY": LIVEAVATAR_API_KEY,
                accept: "application/json",
            },
        });

        const trJson = await trResp.json().catch(() => null);

        if (!trResp.ok) {
            console.error("Transcript error:", trResp.status, trJson);
            return res.status(trResp.status).json({ error: "No se pudo obtener transcript", details: trJson });
        }

        return res.json(trJson);
    } catch (e) {
        console.error("session-transcript error:", e);
        return res.status(500).json({ error: "Error interno", details: String(e) });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});

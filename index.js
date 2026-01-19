const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000;  // puedes cambiar el puerto si 3000 estuviera en uso

// Middleware CORS: permite llamadas desde cualquier origen (para pruebas)
app.use(cors());

// Ruta GET /token - genera un token de sesi\u00f3n usando la API de LiveAvatar
app.get('/token', async (req, res) => {
    console.log('Solicitud a /token recibida');
    try {
        // Configura los datos para la petici\u00f3n POST a LiveAvatar
        const apiUrl = 'https://api.liveavatar.com/v1/sessions/token';
        const apiKey = '4068c91e-d420-11f0-a99e-066a7fa2e369';  
        const body = {
            mode: 'FULL',
            avatar_id: '3f291b22-0267-4fb6-a25b-847fb63604b0',
            avatar_persona: {
                voice_id: '4f3b1e99-b580-4f05-9b67-a5f585be0232',
                context_id: '833df398-46e8-4335-a8a6-b9b3ae5bf8ea',
                language: 'en'
            }
        };

        // Hacer la petici\u00f3n POST a la API de LiveAvatar para obtener el token
        const respuesta = await axios.post(apiUrl, body, {
            headers: {
                'X-API-KEY': apiKey,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log('Respuesta de LiveAvatar:', respuesta.data);

        // Extraer el token de sesi\u00f3n de la respuesta de la API
        const sessionToken = respuesta.data.data.session_token;
        // Enviar el token de sesi\u00f3n de vuelta al cliente en formato JSON
        res.json({ session_token: sessionToken });

    } catch (error) {
        console.error('Error al generar token:', error.response?.data || error.message);
        res.status(500).send('Error generando token de sesi\u00f3n');
    }
});

// Iniciar el servidor
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor backend escuchando en http://localhost:${PORT}`);
});

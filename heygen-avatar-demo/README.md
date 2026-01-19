Perfecto 🙂
Aquí tienes el **README.md listo para copiar y pegar**, claro, técnico y pensado para que **cualquier desarrollador** pueda levantar el proyecto sin contexto previo.

---

```md
# LiveAvatar Web – Deployment & Execution Guide

Este proyecto integra un **avatar conversacional con voz** usando **HeyGen LiveAvatar**, con:

- Backend en **Node.js** (local)
- Exposición pública mediante **Cloudflare Tunnel**
- Frontend compilado con **Vite** y desplegado en **FTP**
- Comunicación en tiempo real vía **LiveKit**

Este documento explica **cómo ejecutar el sistema desde cero** después de realizar cambios en el código.

---

## 📁 Estructura del proyecto

Ejemplo de estructura típica:

```

E:
├── liveavatar-backend
│   └── heygen-avatar-demo
│       ├── server.cjs
│       ├── .env
│       └── package.json
│
└── liveavatar-frontend
├── src
│   └── main.js
├── index.html
├── vite.config.js
├── .env.production
├── package.json
└── dist\   (generado)

```

El frontend se publica en:

```

[https://edamgames.com/bk-avatar/](https://edamgames.com/bk-avatar/)

````

---

## ⚠️ Estado inicial requerido

Antes de empezar:

- ❌ No debe estar corriendo `node server.cjs`
- ❌ No debe estar corriendo `cloudflared`
- ❌ No debe haber `npm run dev`
- ❌ Cierra la pestaña del navegador del avatar

Si algo está activo, deténlo con **Ctrl + C**.

---

## 1️⃣ Arrancar el BACKEND (Node.js)

### 📂 Carpeta correcta

```powershell
cd E:\liveavatar-backend\heygen-avatar-demo
````

### ▶️ Ejecutar

```powershell
node server.cjs
```

### ✅ Resultado esperado

```text
Servidor backend escuchando en http://localhost:3000
```

⚠️ **No cierres esta terminal**.

---

## 2️⃣ Abrir Cloudflare Tunnel

### 📂 Carpeta

La carpeta no importa. Abre **otra terminal distinta**.

### ▶️ Ejecutar

```powershell
cloudflared tunnel --url http://localhost:3000
```

### ✅ Resultado esperado

```text
https://xxxxx.trycloudflare.com
```

📌 Copia esta URL: será el endpoint público del backend.

⚠️ **No cierres esta terminal**.

---

## 3️⃣ Configurar el FRONTEND

### 📂 Carpeta

```powershell
cd E:\liveavatar-frontend
```

### 📝 Editar `.env.production`

```env
VITE_API_BASE_URL=https://xxxxx.trycloudflare.com
VITE_AVATAR_ID=your_avatar_id
VITE_VOICE_ID=your_voice_id
VITE_CONTEXT_ID=your_context_id
VITE_LANGUAGE=es
```

⚠️ No añadir `/api` a la URL.
Si cambia el tunnel, este archivo debe actualizarse.

---

## 4️⃣ Compilar el FRONTEND

### 📂 Carpeta

```powershell
E:\liveavatar-frontend
```

### ▶️ Ejecutar

```powershell
npm run build
```

### ✅ Qué hace

* Genera la carpeta `dist/`
* Compila `main.js`, HTML y CSS
* No levanta ningún servidor

Si hay errores, **no continúes**.

---

## 5️⃣ Subir a FTP

### 📤 Qué subir

Sube **el contenido de `dist/`**, no la carpeta en sí.

✅ Correcto:

```
/bk-avatar/
 ├── index.html
 ├── assets/
 │    └── index-XXXX.js
```

❌ Incorrecto:

```
/bk-avatar/dist/index.html
```

### ⚙️ Nota sobre Vite

Si el frontend se sirve desde una subcarpeta (`/bk-avatar/`), asegúrate de que en `vite.config.js`:

```js
export default {
  base: "/bk-avatar/"
}
```

---

## 6️⃣ Probar la aplicación

Abre en el navegador:

```
https://edamgames.com/bk-avatar/
```

Pulsa **Iniciar sesión**.

---

## 7️⃣ Verificaciones críticas (Consola del navegador)

### 7.1 Micrófono publicado correctamente

Debe aparecer algo como:

```text
Local publications: [
  { kind: "audio", source: "microphone", muted: false }
]
```

❌ Si **no** aparece `source: "microphone"`,
el agente **no escuchará al usuario**.

---

### 7.2 El agente escucha al usuario

Al hablar, deben aparecer eventos como:

```text
[agent-response] { event_type: "user.speak_started" }
[agent-response] { event_type: "user.transcription_started" }
[agent-response] { event_type: "user.transcription_ended", text: "..." }
```

Si solo aparecen eventos tipo:

```text
avatar.transcription
avatar.speak_ended
```

➡️ El agente **solo se oye a sí mismo**.

---

## 8️⃣ Finalizar una prueba

En la web:

* Pulsa **Terminar sesión**

Después:

* Cierra el navegador si quieres

Para detener todo:

* **Ctrl + C** en la terminal del backend
* **Ctrl + C** en la terminal del tunnel

---

## 🧠 Tabla resumen

| Cambio realizado              | Acción necesaria                           |
| ----------------------------- | ------------------------------------------ |
| `server.cjs` o `.env` backend | Reiniciar `node server.cjs`                |
| Nueva URL del tunnel          | Editar `.env.production` + `npm run build` |
| Cambios en `main.js`          | `npm run build` + subir `dist/`            |
| HTML / CSS                    | `npm run build`                            |
| Ningún cambio                 | No hacer nada                              |

---

## 🔚 Nota final

Si tras seguir **todos los pasos**:

* El mic aparece como `source: "microphone"`
* Pero no aparecen eventos `user.transcription_*`

Entonces el problema **no es de despliegue**, sino de:

* configuración del token LiveKit
* o limitaciones del modo FULL del agente LiveAvatar

Ese es el siguiente nivel de depuración.

---

```

Si quieres, en el siguiente paso puedo:
- traducirlo a **inglés profesional**
- adaptarlo como **documentación para cliente**
- o añadir una sección de **troubleshooting avanzado** (errores comunes y soluciones)
```

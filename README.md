# Fabula News

> Noticias de tecnología verificadas, convertidas en guion y en video para TikTok. Todo gratis.

Fabula News es una aplicación web que lee medios oficiales por RSS, elige las noticias de tecnología con más valor, escribe guiones de 45 a 60 segundos en español de México con cero alucinaciones, y los convierte en video vertical con la presentadora virtual de Fabula News: voz clonada, gestos y subtítulos sincronizados.

## Cómo se usa

1. **Noticias**: la app busca y entrega 3 guiones verificados, cada uno con ficha de hechos, fuentes con enlace, calificación editorial y evaluación de coherencia, cohesión, adecuación y veracidad.
2. **Video**: pegas un guion (o llegas desde una tarjeta con "Hacer video con este guion"), eliges una foto de la presentadora y tocas *Generar video*. Entre 10 y 15 minutos después aparece el MP4 listo para TikTok. Puedes cerrar la app mientras tanto.
3. **Historial**: guarda las notas ya usadas para no repetirlas.
4. **Configuración**: guía de estilo, guiones de ejemplo, temas prioritarios y feeds RSS.

## Cómo funciona el video

- La app envía el guion y la foto a **Kaggle**, que presta GPU gratis (30 horas a la semana).
- En Kaggle corre `src/server/kaggleJob.py`:
  - **Chatterbox** clona la voz de `assets/voz_referencia.wav` (open source, uso comercial permitido).
  - **SadTalker** anima la foto para que hable.
  - **Whisper** marca los tiempos de cada palabra para los subtítulos (frases de 4 palabras, palabra clave en rosa, centrados).
  - **ffmpeg** arma el video 1080x1920 con tarjeta de título al inicio.
- La app consulta el estado cada 30 segundos y descarga el MP4 cuando termina.
- Las fotos de la presentadora viven en `public/avatars/`; las que subas desde la app se guardan en el navegador.

## Stack

- Frontend: React 19, TypeScript, Tailwind CSS 4, Vite
- Backend: Node.js, Express
- IA: Google Gemini vía `@google/genai` (guiones), Chatterbox + SadTalker + Whisper en Kaggle (video)
- Datos y auth: Firebase Authentication y Cloud Firestore

## Variables de entorno

| Variable | Para qué |
|---|---|
| `GEMINI_API_KEY` | Redacción y evaluación de guiones |
| `ALLOWED_EMAIL` | Único correo con acceso |
| `KAGGLE_USERNAME` y `KAGGLE_KEY` | Generación de video en la GPU gratuita de Kaggle (Settings → API → Create Legacy API Key) |
| `APP_URL` | La inyecta AI Studio |

En AI Studio se configuran en el panel de Secrets. La cuenta de Kaggle necesita teléfono verificado para tener GPU e internet.

## Ejecución local

```bash
npm install
cp .env.example .env   # y rellena las variables
npm run dev            # http://localhost:3000
```

## Estructura

```
assets/voz_referencia.wav    voz de referencia para la clonación
public/avatars/              fotos de la presentadora
src/components/              pantallas: Noticias, Video, Historial, Configuración
src/server/newsWorkflow.ts   flujo editorial con Gemini
src/server/kaggle.ts         cliente de la API de Kaggle
src/server/kaggleJob.py      trabajo que corre en la GPU de Kaggle
src/services/videoService.ts fotos, envío y seguimiento del video
```

## Licencia

Uso privado de Fabula News.

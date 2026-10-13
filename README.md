# Fabula News 🚀

> **Generador de noticias y guiones verificados de tecnología para TikTok & HeyGen.**

Fabula News es una aplicación web full-stack diseñada para redactar guiones noticiosos listos para presentadores virtuales (HeyGen, TikTok, Reels), garantizando **cero alucinaciones**, lectura directa de fuentes RSS oficiales, ficha de hechos contrastada y adecuación al español neutro de México.

---

## 🛠️ Stack Tecnológico

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Vite
- **Backend**: Node.js, Express, Fast-XML-Parser, Tsx
- **Modelos IA**: Google Gemini (`gemini-3.8-flash` y `gemini-3.1-flash-lite`) vía `@google/genai`
- **Base de datos & Auth**: Firebase Authentication & Cloud Firestore

---

## ✨ Características Principales

1. **Lectura de Feeds RSS en Paralelo**:
   - Conexión a medios tecnológicos líderes (*The Verge, Google Blog, TechCrunch, Wired, Expansión, El Financiero, etc.*).
   - Filtro estricto por código para noticias publicadas en las últimas 48 horas.
   - Enlace directo a la nota oficial para verificar la autenticidad en un clic.

2. **Cero Alucinaciones & Rigor Factual**:
   - Ficha de hechos estructurada (*qué ocurrió, quién, cuándo, cifras, impacto en México/LATAM*).
   - Los datos no presentes en la fuente se marcan explícitamente como *"No especificado en el reporte original"*.

3. **Guiones para HeyGen & TikTok**:
   - Longitud optimizada (~150-180 palabras, 45-60 segundos hablados).
   - Estructura oral en español de México con tono analítico y cero polémica.
   - Aperturas rotativas y variadas para evitar sonar repetitivo.
   - Generación de caption conciso (< 150 caracteres) y 5 hashtags relevantes.

4. **Flujo de Calidad Automatizado**:
   - **Paso 3**: Calificación de candidatos por novedad y potencial de conversación.
   - **Paso 4**: Ficha de hechos estructurada.
   - **Paso 5**: Redacción del guion.
   - **Paso 6**: Revisor de estilo contra la Guía Editorial.
   - **Paso 7**: Evaluador de veracidad, coherencia, cohesión y adecuación.
   - **Paso 8**: Caption y hashtags.

5. **Paso 3: Video gratuito (sin HeyGen)**:
   - Voz clonada de los videos originales de HeyGen (`colab/voz_referencia.wav`) con Chatterbox, open source.
   - 20 imágenes del personaje precargadas en `public/avatars/`, más las que subas desde el navegador.
   - Botón *Generar video*: manda imagen + guion + título + fuente al notebook `colab/fabula_video.ipynb` (GPU gratuita de Colab) y devuelve un MP4 1080x1920 con avatar animado (SadTalker), subtítulos por palabra (Whisper), tarjeta de título y rótulo de fuente.
   - Requiere tener el notebook corriendo y pegar su link `gradio.live` en *Configurar video*.

6. **Historial & Configuración Personalizada**:
   - Marcado de notas usadas con guardado en Firestore.
   - Editor de temas prioritarios, lista de vigilancia de IA y feeds RSS.

---

## 📦 Instalación y Ejecución Local

### Prerrequisitos
- Node.js 18 o superior
- Clave de API de Google Gemini (`GEMINI_API_KEY`)
- Proyecto de Firebase (Firestore + Auth habilitados)

### Pasos

1. **Clonar el repositorio**:
   ```bash
   git clone <URL_DEL_REPOSITORIO>
   cd fabula-news
   ```

2. **Instalar dependencias**:
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**:
   Copia el archivo `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
   Rellena tus credenciales:
   ```env
   GEMINI_API_KEY=tu_api_key_de_gemini
   ALLOWED_EMAIL=tu_correo@gmail.com
   PORT=3000
   ```

4. **Ejecutar en desarrollo**:
   ```bash
   npm run dev
   ```
   Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

5. **Compilar para producción**:
   ```bash
   npm run build
   npm start
   ```

---

## 🛡️ Licencia
Este proyecto es de uso privado para Fabula News.

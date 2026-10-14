/**
 * Servicio del Paso 3 (video gratuito).
 * La configuracion vive en localStorage: solo Betsy usa la app desde su navegador
 * y asi no tocamos Firestore ni el documento de configuracion general.
 */

import { Client } from '@gradio/client';

const KEY_COLAB_URL = 'fabula.video.colabUrl';
const KEY_AVATARS = 'fabula.video.avatars';

export interface AvatarImage {
  id: string;
  name: string;
  dataUrl: string; // data URL (subida por la usuaria) o ruta /avatars/... (precargada)
  builtIn?: boolean;
}

export function getColabUrl(): string {
  return localStorage.getItem(KEY_COLAB_URL) || '';
}
export function setColabUrl(url: string) {
  localStorage.setItem(KEY_COLAB_URL, url.trim());
}

/** Imagenes subidas por la usuaria (viven en localStorage). */
export function getAvatars(): AvatarImage[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_AVATARS) || '[]');
  } catch {
    return [];
  }
}

/** Imagenes precargadas del personaje en public/avatars (se sirven con la app). */
export async function getBuiltInAvatars(): Promise<AvatarImage[]> {
  try {
    const res = await fetch('/avatars/manifest.json');
    if (!res.ok) return [];
    const names: string[] = await res.json();
    return names.map((n) => ({ id: `builtin-${n}`, name: n, dataUrl: `/avatars/${n}`, builtIn: true }));
  } catch {
    return [];
  }
}

function saveAvatars(list: AvatarImage[]) {
  localStorage.setItem(KEY_AVATARS, JSON.stringify(list));
}

/** Redimensiona a max 1024 px por lado y guarda como JPEG para que quepan varias en localStorage. */
export async function addAvatarFromFile(file: File): Promise<AvatarImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1024;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No se pudo procesar la imagen.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => reject(new Error('Imagen no valida.'));
    img.src = url;
  });

  const avatar: AvatarImage = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: file.name,
    dataUrl,
  };
  const list = getAvatars();
  list.push(avatar);
  try {
    saveAvatars(list);
  } catch {
    throw new Error('Ya no cabe otra imagen en el navegador. Borra alguna de las guardadas.');
  }
  return avatar;
}

export function removeAvatar(id: string) {
  saveAvatars(getAvatars().filter((a) => a.id !== id));
}

async function toBlob(src: string): Promise<Blob> {
  if (!src.startsWith('data:')) {
    const res = await fetch(src);
    if (!res.ok) throw new Error('No se pudo cargar la imagen del personaje.');
    return res.blob();
  }
  const [meta, b64] = src.split(',');
  const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export interface VideoRequest {
  avatar: AvatarImage;
  script: string; // guion completo; la voz se clona en Colab
  title: string; // tarjeta de entrada
  source: string; // roto inferior con la fuente
}

/**
 * Manda imagen + guion + textos al notebook de Colab (Gradio) y devuelve la URL del MP4
 * ya en 9:16 con voz clonada, tarjeta de titulo, subtitulos quemados y fuente.
 * El notebook expone un endpoint /generar con inputs [imagen, guion, titulo, fuente].
 */
export async function generateVideo(
  { avatar, script, title, source }: VideoRequest,
  onStatus?: (msg: string) => void
): Promise<string> {
  const url = getColabUrl();
  if (!url) throw new Error('Pega primero la URL de Colab en "Configurar video".');

  onStatus?.('Conectando con Colab...');
  const client = await Client.connect(url);

  onStatus?.('Clonando voz y generando video en Colab (varios minutos)...');
  const job = client.submit('/generar', [await toBlob(avatar.dataUrl), script, title, source]);

  for await (const msg of job) {
    if (msg.type === 'status') {
      if (msg.stage === 'error') {
        const detail = typeof msg.message === 'string' ? msg.message : 'Colab devolvio un error.';
        throw new Error(detail);
      }
      if (msg.queue && typeof msg.position === 'number' && msg.position > 0) {
        onStatus?.(`En fila (posicion ${msg.position})...`);
      }
    }
    if (msg.type === 'data') {
      const out = (msg.data as any)?.[0];
      const videoUrl: string | undefined = out?.video?.url || out?.url;
      if (!videoUrl) throw new Error('Colab no devolvio un archivo de video.');
      return videoUrl;
    }
  }
  throw new Error('La generacion termino sin resultado.');
}


// ---------- Kaggle (GPU gratuita, en segundo plano) ----------

export async function isKaggleAvailable(): Promise<boolean> {
  try {
    const r = await fetch('/api/kaggle/config');
    const d = await r.json();
    return !!d.configured;
  } catch {
    return false;
  }
}

async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

const KEY_KAGGLE_JOB = 'fabula.video.kaggleJob';

export interface KaggleJobRecord {
  startedAt: string;
  title: string;
}

export function getPendingKaggleJob(): KaggleJobRecord | null {
  try {
    return JSON.parse(localStorage.getItem(KEY_KAGGLE_JOB) || 'null');
  } catch {
    return null;
  }
}
export function clearPendingKaggleJob() {
  localStorage.removeItem(KEY_KAGGLE_JOB);
}

/** Envía el trabajo a Kaggle. Devuelve de inmediato; el video se consulta con pollKaggle. */
export async function startKaggleVideo({ avatar, script, title, source }: VideoRequest): Promise<KaggleJobRecord> {
  const imageBase64 = await blobToBase64(await toBlob(avatar.dataUrl));
  const res = await fetch('/api/kaggle/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ script, title, source, imageBase64 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status} al enviar a Kaggle.`);
  const rec: KaggleJobRecord = { startedAt: data.startedAt || new Date().toISOString(), title };
  localStorage.setItem(KEY_KAGGLE_JOB, JSON.stringify(rec));
  return rec;
}

export interface KaggleProgress {
  status: 'queued' | 'running' | 'complete' | 'error' | 'cancelled' | 'unknown';
  message?: string;
  log?: string;
  videoUrl?: string; // URL local del servidor que entrega el MP4
}

export async function pollKaggle(): Promise<KaggleProgress> {
  const res = await fetch('/api/kaggle/jobs/status');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status} al consultar Kaggle.`);
  if (data.status === 'complete' && data.videoUrl) {
    return { ...data, videoUrl: `/api/kaggle/jobs/video?t=${Date.now()}` };
  }
  return data;
}

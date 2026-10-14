/**
 * Servicio del Paso 3 (video gratuito).
 * Las fotos subidas y el trabajo pendiente viven en localStorage del navegador.
 * El video se genera en Kaggle (GPU gratuita) a traves del servidor.
 */

const KEY_AVATARS = 'fabula.video.avatars';

export interface AvatarImage {
  id: string;
  name: string;
  dataUrl: string; // data URL (subida por la usuaria) o ruta /avatars/... (precargada)
  builtIn?: boolean;
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
  script: string; // guion completo; la voz se clona en Kaggle
  title: string; // tarjeta de entrada
  source: string; // roto inferior con la fuente
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

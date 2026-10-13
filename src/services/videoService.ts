/**
 * Servicio del Paso 3 (video gratuito).
 * La configuracion vive en localStorage: solo Betsy usa la app desde su navegador
 * y asi no tocamos Firestore ni el documento de configuracion general.
 */

import { Client } from '@gradio/client';

const KEY_COLAB_URL = 'fabula.video.colabUrl';
const KEY_VOICE = 'fabula.video.voice';
const KEY_AVATARS = 'fabula.video.avatars';

export interface AvatarImage {
  id: string;
  name: string;
  dataUrl: string; // JPEG redimensionado, listo para mandarse
}

export const VOICES = [
  { id: 'es-MX-DaliaNeural', label: 'Dalia (mujer, Mexico)' },
  { id: 'es-MX-RenataNeural', label: 'Renata (mujer, Mexico)' },
  { id: 'es-MX-NuriaNeural', label: 'Nuria (mujer, Mexico)' },
  { id: 'es-MX-LarissaNeural', label: 'Larissa (mujer, Mexico)' },
  { id: 'es-MX-CarlotaNeural', label: 'Carlota (mujer, Mexico)' },
];

export function getColabUrl(): string {
  return localStorage.getItem(KEY_COLAB_URL) || '';
}
export function setColabUrl(url: string) {
  localStorage.setItem(KEY_COLAB_URL, url.trim());
}

export function getVoice(): string {
  return localStorage.getItem(KEY_VOICE) || VOICES[0].id;
}
export function setVoice(voice: string) {
  localStorage.setItem(KEY_VOICE, voice);
}

export function getAvatars(): AvatarImage[] {
  try {
    return JSON.parse(localStorage.getItem(KEY_AVATARS) || '[]');
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

/** Pide el audio al servidor (voces neuronales gratuitas). Devuelve un Blob MP3. */
export async function generateAudio(text: string, voice: string): Promise<Blob> {
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Error ${res.status} al generar el audio.`);
  }
  return res.blob();
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Manda imagen + audio al notebook de Colab (Gradio) y devuelve la URL del MP4.
 * El notebook expone un endpoint /generar con inputs [imagen, audio].
 */
export async function generateVideo(
  avatar: AvatarImage,
  audio: Blob,
  onStatus?: (msg: string) => void
): Promise<string> {
  const url = getColabUrl();
  if (!url) throw new Error('Pega primero la URL de Colab en "Configurar video".');

  onStatus?.('Conectando con Colab...');
  const client = await Client.connect(url);

  onStatus?.('Generando video en la GPU gratuita (puede tardar varios minutos)...');
  const job = client.submit('/generar', [dataUrlToBlob(avatar.dataUrl), audio]);

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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Cliente mínimo de la API de Kaggle para lanzar el trabajo de video en GPU gratuita.
 * Credenciales: KAGGLE_USERNAME y KAGGLE_KEY (Secrets de AI Studio).
 */

const API = 'https://www.kaggle.com/api/v1';
const KERNEL_SLUG = 'fabula-news-video';

function creds() {
  const user = process.env.KAGGLE_USERNAME;
  const key = process.env.KAGGLE_KEY;
  if (!user || !key) throw new Error('Faltan KAGGLE_USERNAME y KAGGLE_KEY en los Secrets.');
  return { user, key, auth: 'Basic ' + Buffer.from(`${user}:${key}`).toString('base64') };
}

export function isKaggleConfigured(): boolean {
  return !!(process.env.KAGGLE_USERNAME && process.env.KAGGLE_KEY);
}

function loadTemplate(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.join(here, 'kaggleJob.py'), path.resolve(process.cwd(), 'src/server/kaggleJob.py')];
  for (const c of candidates) if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  throw new Error('No se encontró kaggleJob.py');
}

function pyStr(s: string): string {
  return JSON.stringify(s); // JSON es un literal de cadena válido en Python para texto normal
}

export interface KaggleJobInput {
  script: string;
  title: string;
  source: string;
  imageBase64: string; // JPEG en base64 (sin prefijo data:)
}

/** Envía (o actualiza) el kernel y lo pone a correr. Devuelve la referencia user/slug. */
export async function pushKaggleJob(input: KaggleJobInput): Promise<{ ref: string; url: string }> {
  const { user, auth } = creds();
  const code = loadTemplate()
    .replace('__GUION__', pyStr(input.script))
    .replace('__TITULO__', pyStr(input.title))
    .replace('__FUENTE__', pyStr(input.source))
    .replace('__IMAGEN_B64__', pyStr(input.imageBase64));

  const body = {
    slug: `${user}/${KERNEL_SLUG}`,
    newTitle: 'Fabula News video',
    text: code,
    language: 'python',
    kernelType: 'script',
    isPrivate: true,
    enableGpu: true,
    enableTpu: false,
    enableInternet: true,
    datasetDataSources: [],
    competitionDataSources: [],
    kernelDataSources: [],
    modelDataSources: [],
  };

  const res = await fetch(`${API}/kernels/push`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(`Kaggle no aceptó el trabajo: ${data.error || data.message || res.status}`);
  }
  return { ref: `${user}/${KERNEL_SLUG}`, url: data.url || '' };
}

export interface KaggleStatus {
  status: 'queued' | 'running' | 'complete' | 'error' | 'cancelled' | 'unknown';
  message?: string;
}

export async function getKaggleStatus(): Promise<KaggleStatus> {
  const { user, auth } = creds();
  const res = await fetch(`${API}/kernels/status?userName=${encodeURIComponent(user)}&kernelSlug=${KERNEL_SLUG}`, {
    headers: { Authorization: auth },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Kaggle status ${res.status}: ${data.message || ''}`);
  const raw = String(data.status || 'unknown').toLowerCase();
  const status = (['queued', 'running', 'complete', 'error', 'cancelled'].includes(raw) ? raw : 'unknown') as KaggleStatus['status'];
  return { status, message: data.failureMessage || undefined };
}

export interface KaggleOutput {
  videoUrl?: string;
  log?: string;
}

export async function getKaggleOutput(): Promise<KaggleOutput> {
  const { user, auth } = creds();
  const res = await fetch(`${API}/kernels/output?userName=${encodeURIComponent(user)}&kernelSlug=${KERNEL_SLUG}`, {
    headers: { Authorization: auth },
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Kaggle output ${res.status}: ${data.message || ''}`);
  const files: Array<{ fileName?: string; url?: string }> = data.files || [];
  const mp4 = files.find((f) => (f.fileName || '').endsWith('fabula.mp4')) || files.find((f) => (f.fileName || '').endsWith('.mp4'));
  let log = '';
  if (Array.isArray(data.log)) {
    log = data.log.map((l: any) => l.data || '').join('');
  } else if (typeof data.log === 'string') {
    log = data.log;
  }
  return { videoUrl: mp4?.url, log: log.slice(-4000) };
}

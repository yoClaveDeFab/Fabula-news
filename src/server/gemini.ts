import { GoogleGenAI } from '@google/genai';

export const MODEL_CHEAP = 'gemini-3.1-flash-lite';
export const MODEL_QUALITY = 'gemini-3.8-flash';

export let activeQualityModel = MODEL_QUALITY;

export function getActiveQualityModel(): string {
  return activeQualityModel;
}

export function switchQualityModelToLite(reason: string) {
  console.warn(`Conmutando modelo de calidad a ${MODEL_CHEAP}: ${reason}`);
  activeQualityModel = MODEL_CHEAP;
}

export async function checkAndInitModels(): Promise<void> {
  try {
    const ai = getGenAI();
    await ai.models.generateContent({
      model: MODEL_QUALITY,
      contents: 'ping',
    });
    console.log(`Modelo de calidad ${MODEL_QUALITY} listo.`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
      switchQualityModelToLite(`Límite diario de ${MODEL_QUALITY} alcanzado en free tier.`);
    }
  }
}

export function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no está configurada en las variables de entorno.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Returns current date and time formatted in America/Mexico_City timezone
 */
export function getMexicoCityDateTime(): { dateStr: string; timestamp: number } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'full',
    timeStyle: 'medium',
  });
  return {
    dateStr: formatter.format(now),
    timestamp: now.getTime(),
  };
}

/**
 * Mandatory date preamble required by PARTE C in every Gemini call
 */
export function getDatePreamble(): string {
  const { dateStr } = getMexicoCityDateTime();
  return `Hoy es ${dateStr} (hora de America/Mexico_City). Tu conocimiento puede estar desactualizado: no asumas que algo es nuevo por no conocerlo, ni que algo es viejo por conocerlo. Usa solo las fechas de las fuentes.\n\n`;
}

import { GeminiLogEntry } from '../services/types.js';

export const technicalLogs: GeminiLogEntry[] = [];

export function recordGeminiLog(entry: Omit<GeminiLogEntry, 'id' | 'timestamp'>) {
  const log: GeminiLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  technicalLogs.unshift(log);
  if (technicalLogs.length > 200) {
    technicalLogs.pop();
  }
  return log;
}

export function getTechnicalLogs(): GeminiLogEntry[] {
  return [...technicalLogs];
}

/**
 * Executes a promise with strict timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 60000,
  stepName = 'Llamada a Gemini'
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Tiempo límite de ${timeoutMs / 1000}s excedido en: ${stepName}`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Robust retry wrapper for Gemini API calls:
 * - Límite de 90 segundos por llamada
 * - Máximo 1 reintento
 * - Si vuelve a fallar, lanza error real indicando en qué paso falló
 * - Registra cada llamada en el Registro Técnico
 */
export async function generateWithRetry<T>(
  fn: (modelToUse: string) => Promise<T>,
  stepName = 'Llamada a Gemini',
  retries = 1, // 1 reintento (máximo 2 intentos en total)
  timeoutMs = 60000 // 60 segundos por llamada
): Promise<T> {
  let lastError: unknown;
  const maxAttempts = retries + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Si es reintento (attempt > 1), alternar al otro modelo disponible
    const currentModel =
      attempt > 1
        ? activeQualityModel === MODEL_QUALITY
          ? MODEL_CHEAP
          : MODEL_QUALITY
        : activeQualityModel;
    const currentTimeout = attempt > 1 ? 45000 : timeoutMs;
    const start = Date.now();

    try {
      const result = await withTimeout(fn(currentModel), currentTimeout, stepName);
      const durationMs = Date.now() - start;

      // Registro exitoso
      recordGeminiLog({
        step: stepName,
        model: currentModel,
        durationMs,
        status: 'success',
      });

      return result;
    } catch (err: unknown) {
      lastError = err;
      const durationMs = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);

      console.warn(`[${stepName}] Intento ${attempt}/${maxAttempts} con ${currentModel} falló tras ${durationMs}ms: ${msg}`);

      // Registrar fallo
      recordGeminiLog({
        step: stepName,
        model: currentModel,
        durationMs,
        status: 'error',
        errorMessage: msg,
      });

      // Si falló por 429, 503 o alta demanda, conmutar modelo alternativo
      if (
        msg.includes('429') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('high demand')
      ) {
        if (activeQualityModel === MODEL_CHEAP) {
          activeQualityModel = MODEL_QUALITY;
        } else {
          switchQualityModelToLite(msg);
        }
      }

      if (attempt < maxAttempts) {
        // Pausa breve antes del reintento rápido
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }

  const finalMsg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Falló en ${stepName}: ${finalMsg}`);
}

/**
 * Code auto-validations required by PARTE E.
 * If any check fails, returns error description; otherwise returns null.
 */
export function validateScriptRules(
  script: string,
  format: 'Rápido' | 'Explicado',
  captionSources: string[]
): string | null {
  const cleanedText = script.trim();
  const words = cleanedText.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Rango de palabras (tolerancia natural para oralidad de avatar)
  if (format === 'Rápido') {
    if (wordCount < 80 || wordCount > 130) {
      return `Longitud inválida para formato Rápido: tiene ${wordCount} palabras (debe tener entre 80 y 130 palabras).`;
    }
  } else if (format === 'Explicado') {
    if (wordCount < 120 || wordCount > 195) {
      return `Longitud inválida para formato Explicado: tiene ${wordCount} palabras (debe tener entre 120 y 195 palabras).`;
    }
  }

  // 2. Palabras cortadas o sin signo de puntuación final
  const lastChar = cleanedText.slice(-1);
  if (!['.', '?', '!', '…'].includes(lastChar)) {
    return 'El guion no termina con un signo de puntuación válido (. ? !).';
  }

  // 3. Ninguna fuente del caption mencionada en el guion
  if (captionSources.length > 0) {
    const scriptLower = script.toLowerCase();
    const hasSourceMention = captionSources.some((source) => {
      const cleanSource = source.trim().toLowerCase();
      return cleanSource.length > 2 && scriptLower.includes(cleanSource);
    });
    if (!hasSourceMention) {
      return `Ninguna de las fuentes del caption (${captionSources.join(', ')}) está mencionada en el guion.`;
    }
  }

  // 4. Fórmulas vagas de atribución prohibidas
  const forbiddenAttributions = [
    'un reporte de prensa',
    'según medios',
    'según fuentes',
    'se informó',
    'de acuerdo a fuentes',
    'reportan medios',
  ];
  for (const phrase of forbiddenAttributions) {
    if (cleanedText.toLowerCase().includes(phrase)) {
      return `Contiene fórmula vaga de atribución prohibida: "${phrase}".`;
    }
  }

  // 5. Cierres genéricos prohibidos (spam CTA de redes)
  const forbiddenClosings = [
    'te leo en los comentarios',
    'sígueme para más',
    'dale like',
    'déjame saber en los comentarios',
    'comparte este video',
  ];
  const lastSentence = cleanedText.slice(-100).toLowerCase();
  for (const closing of forbiddenClosings) {
    if (lastSentence.includes(closing)) {
      return `Contiene cierre genérico prohibido: "${closing}".`;
    }
  }

  // 6. Guion largo (raya), emojis o hashtags dentro del guion
  if (cleanedText.includes('—') || cleanedText.includes('–')) {
    return 'El guion contiene guion largo o raya (— o –), lo cual está prohibido.';
  }
  if (cleanedText.includes('#')) {
    return 'El guion contiene el símbolo de hashtag (#), lo cual está prohibido dentro del guion.';
  }
  // Regex para detectar emojis comunes
  const emojiRegex = /[\u{1F300}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  if (emojiRegex.test(cleanedText)) {
    return 'El guion contiene emojis, lo cual está prohibido.';
  }

  return null;
}

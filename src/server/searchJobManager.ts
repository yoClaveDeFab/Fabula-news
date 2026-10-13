import { AppConfig, NewsScriptItem, SearchJob } from '../services/types.js';
import { executeFullSearchWorkflow } from './newsWorkflow.js';

// In-memory store of jobs for instant retrieval and background tracking
const jobs = new Map<string, SearchJob>();

const MAX_JOB_AGE_MS = 6 * 60 * 1000; // 6 minutes timeout

export function getJob(jobId: string): SearchJob | undefined {
  const job = jobs.get(jobId);
  if (job && job.status === 'running') {
    // If job has been running for more than 4 minutes without completion, mark timed out
    const elapsed = Date.now() - new Date(job.createdAt).getTime();
    if (elapsed > MAX_JOB_AGE_MS) {
      job.status = 'error';
      job.step = 'error';
      job.error = 'El tiempo de espera se agotó (más de 4 minutos). Puedes reiniciar la búsqueda.';
      job.message = job.error;
      job.updatedAt = new Date().toISOString();
    }
  }
  return job;
}

export function cancelJob(jobId: string): SearchJob | undefined {
  const job = jobs.get(jobId);
  if (job) {
    job.status = 'error';
    job.step = 'error';
    job.error = 'Búsqueda cancelada por el usuario.';
    job.message = 'Búsqueda cancelada por el usuario.';
    job.updatedAt = new Date().toISOString();
  }
  return job;
}

export function getLatestJob(userId?: string): SearchJob | undefined {
  const all = Array.from(jobs.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const found = userId ? (all.find((j) => j.userId === userId) || all[0]) : all[0];
  if (found && found.status === 'running') {
    const elapsed = Date.now() - new Date(found.createdAt).getTime();
    if (elapsed > MAX_JOB_AGE_MS) {
      found.status = 'error';
      found.step = 'error';
      found.error = 'El tiempo de espera se agotó (más de 4 minutos). Puedes reiniciar la búsqueda.';
      found.message = found.error;
      found.updatedAt = new Date().toISOString();
    }
  }
  return found;
}

export function startBackgroundSearchJob(params: {
  userId?: string;
  config: AppConfig;
  processedUrls: string[];
  recentOpenings: string[];
  seenTitles?: string[];
  searchRunIndex?: number;
}): SearchJob {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const job: SearchJob = {
    id: jobId,
    userId: params.userId,
    status: 'running',
    step: 'reading_feeds',
    message: 'Iniciando lectura de fuentes RSS en paralelo...',
    percent: 5,
    partialCards: [],
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(jobId, job);

  // Keep jobs map bounded to 50 items
  if (jobs.size > 50) {
    const oldestKey = jobs.keys().next().value;
    if (oldestKey) jobs.delete(oldestKey);
  }

  // Run asynchronously in background without blocking response
  setTimeout(async () => {
    try {
      await executeFullSearchWorkflow(
        params.config,
        params.processedUrls,
        params.recentOpenings,
        params.seenTitles || [],
        params.searchRunIndex || 0,
        (step, message, progressPercent) => {
          job.step = step;
          job.message = message;
          if (typeof progressPercent === 'number') {
            job.percent = progressPercent;
          }
          job.updatedAt = new Date().toISOString();
        },
        async (card, partialList) => {
          job.partialCards = partialList;
          job.percent = Math.min(95, 55 + partialList.length * 14);
          job.updatedAt = new Date().toISOString();
          console.log(`[Job ${jobId}] Tarjeta lista (${partialList.length}/3): ${card.title}`);
        }
      );

      job.status = 'completed';
      job.percent = 100;
      job.step = 'completed';
      job.message = '¡Búsqueda y generación completadas!';
      job.updatedAt = new Date().toISOString();
      console.log(`[Job ${jobId}] Completado con éxito. Total tarjetas: ${job.partialCards.length}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      job.status = 'error';
      job.step = 'error';
      job.error = msg;
      job.message = msg;
      job.updatedAt = new Date().toISOString();
      console.error(`[Job ${jobId}] Error:`, msg);
    }
  }, 10);

  return job;
}

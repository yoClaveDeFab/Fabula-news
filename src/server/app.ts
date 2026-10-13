import express, { Request, Response } from 'express';
import { getGenAI, MODEL_CHEAP, MODEL_QUALITY, getDatePreamble, getTechnicalLogs } from './gemini.js';
import { parseRssConfig, testSingleFeed } from './rss.js';
import { executeFullSearchWorkflow, rewriteNewsCard } from './newsWorkflow.js';
import { AppConfig, NewsScriptItem } from '../services/types.js';
import { startBackgroundSearchJob, getJob, getLatestJob, cancelJob } from './searchJobManager.js';
import { synthesizeSpeech } from './tts.js';

export const app = express();
app.use(express.json({ limit: '10mb' }));

const ALLOWED_EMAIL = process.env.ALLOWED_EMAIL || 'bfabiola.castillo@gmail.com';

// 1. Auth config endpoint
app.get('/api/auth-config', (_req: Request, res: Response) => {
  res.json({
    allowedEmail: ALLOWED_EMAIL,
  });
});

// 2. Test Gemini models endpoint
app.get('/api/test-models', async (_req: Request, res: Response) => {
  const ai = getGenAI();
  const preamble = getDatePreamble();
  const results: Record<string, { ok: boolean; message: string; latencyMs: number }> = {};

  const modelsToTest = [
    { key: 'scoring (económico)', model: MODEL_CHEAP },
    { key: 'redacción y evaluación (alta calidad)', model: MODEL_QUALITY },
  ];

  for (const m of modelsToTest) {
    const start = Date.now();
    try {
      const response = await ai.models.generateContent({
        model: m.model,
        contents: `${preamble}Responde con exactamente la palabra "OK".`,
      });
      const latencyMs = Date.now() - start;
      results[m.model] = {
        ok: true,
        message: response.text?.trim() || 'OK',
        latencyMs,
      };
    } catch (err: unknown) {
      results[m.model] = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
        latencyMs: Date.now() - start,
      };
    }
  }

  res.json({ results });
});

// 3. Technical logs endpoint
app.get('/api/gemini-logs', (_req: Request, res: Response) => {
  res.json({ logs: getTechnicalLogs() });
});

// 4. Background search jobs endpoints
app.post('/api/search-jobs', (req: Request, res: Response) => {
  try {
    const { config, processedUrls, recentOpenings, seenTitles, searchRunIndex, userId } = req.body as {
      config: AppConfig;
      processedUrls?: string[];
      recentOpenings?: string[];
      seenTitles?: string[];
      searchRunIndex?: number;
      userId?: string;
    };

    if (!config || !config.rssFeeds) {
      res.status(400).json({ error: 'Falta la configuración de fuentes RSS.' });
      return;
    }

    const job = startBackgroundSearchJob({
      config,
      processedUrls: processedUrls || [],
      recentOpenings: recentOpenings || [],
      seenTitles: seenTitles || [],
      searchRunIndex: typeof searchRunIndex === 'number' ? searchRunIndex : 0,
      userId,
    });

    res.status(202).json({ jobId: job.id, job });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/api/search-jobs/latest', (req: Request, res: Response) => {
  const userId = req.query.userId as string | undefined;
  const job = getLatestJob(userId);
  res.json({ job: job || null });
});

app.get('/api/search-jobs/:jobId', (req: Request, res: Response) => {
  const job = getJob(req.params.jobId);
  if (!job) {
    res.status(404).json({ error: 'Trabajo no encontrado.' });
    return;
  }
  res.json({ job });
});

app.post('/api/search-jobs/:jobId/cancel', (req: Request, res: Response) => {
  const job = cancelJob(req.params.jobId);
  res.json({ job: job || null, success: true });
});

// 5. Test RSS feeds endpoint
app.post('/api/test-feeds', async (req: Request, res: Response) => {
  try {
    const { rssFeeds } = req.body;
    if (typeof rssFeeds !== 'string') {
      res.status(400).json({ error: 'Configuración de feeds inválida.' });
      return;
    }
    const feeds = parseRssConfig(rssFeeds);
    const results = await Promise.all(feeds.map((feed) => testSingleFeed(feed)));
    res.json({ results });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 4. Search and generate news with Server-Sent Events (SSE)
app.post('/api/search-news', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { config, processedUrls, recentOpenings, seenTitles, searchRunIndex } = req.body as {
      config: AppConfig;
      processedUrls?: string[];
      recentOpenings?: string[];
      seenTitles?: string[];
      searchRunIndex?: number;
    };

    if (!config || !config.rssFeeds) {
      sendEvent('error', { message: 'Falta la configuración de fuentes RSS.' });
      res.end();
      return;
    }

    const cards = await executeFullSearchWorkflow(
      config,
      processedUrls || [],
      recentOpenings || [],
      seenTitles || [],
      searchRunIndex || 0,
      (step: string, message: string, progressPercent?: number) => {
        sendEvent('progress', { step, message, progressPercent });
      }
    );

    sendEvent('result', { cards });
    res.end();
  } catch (err: unknown) {
    console.error('Error en workflow de búsqueda:', err);
    sendEvent('error', {
      message: err instanceof Error ? err.message : String(err),
    });
    res.end();
  }
});

// 6. Free neural TTS (Microsoft Edge voices, sin API key ni costo)
app.post('/api/tts', async (req: Request, res: Response) => {
  try {
    const { text, voice } = req.body as { text?: string; voice?: string };
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Falta el texto del guion.' });
      return;
    }
    const selectedVoice = typeof voice === 'string' && voice.startsWith('es-') ? voice : 'es-MX-DaliaNeural';
    const mp3 = await synthesizeSpeech(text.trim(), selectedVoice);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(mp3.length));
    res.send(mp3);
  } catch (err: unknown) {
    console.error('Error en TTS:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 5. Rewrite single news card endpoint
app.post('/api/rewrite-news', async (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const { card, config, recentOpenings } = req.body as {
      card: NewsScriptItem;
      config: AppConfig;
      recentOpenings?: string[];
    };

    if (!card || !config) {
      sendEvent('error', { message: 'Datos incompletos para reescritura.' });
      res.end();
      return;
    }

    const updatedCard = await rewriteNewsCard(
      card,
      config,
      recentOpenings || [],
      (step, message, progressPercent) => {
        sendEvent('progress', { step, message, progressPercent });
      }
    );

    sendEvent('result', { card: updatedCard });
    res.end();
  } catch (err: unknown) {
    console.error('Error en reescritura:', err);
    sendEvent('error', {
      message: err instanceof Error ? err.message : String(err),
    });
    res.end();
  }
});

import { XMLParser } from 'fast-xml-parser';
import { FeedCheckResult } from '../services/types.js';

export interface RawNewsCandidate {
  title: string;
  link: string;
  normalizedUrl: string;
  pubDate: Date;
  pubDateStr: string;
  summary: string;
  sourceName: string;
  category: string;
}

export interface ParsedFeedConfig {
  category: string;
  name: string;
  url: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/**
 * Normalizes URL by removing query parameters (utm_*, fbclid, etc.) and lowercasing hostname
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    parsed.hash = '';
    // Strip common tracking and referrer query params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'source'];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }
    let clean = parsed.toString().toLowerCase();
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    return clean;
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Parse config line by line into structured objects
 */
export function parseRssConfig(rawConfig: string): ParsedFeedConfig[] {
  const lines = rawConfig.split('\n');
  const results: ParsedFeedConfig[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split('|').map((s) => s.trim());
    if (parts.length >= 3) {
      results.push({
        category: parts[0],
        name: parts[1],
        url: parts[2],
      });
    }
  }
  return results;
}

/**
 * Strips HTML tags and excessive whitespace
 */
function cleanText(rawHtml: any): string {
  if (!rawHtml) return '';
  if (typeof rawHtml === 'object') {
    if (typeof rawHtml['#text'] === 'string') rawHtml = rawHtml['#text'];
    else if (typeof rawHtml._ === 'string') rawHtml = rawHtml._;
    else if (typeof rawHtml.value === 'string') rawHtml = rawHtml.value;
    else if (typeof rawHtml.title === 'string') rawHtml = rawHtml.title;
    else rawHtml = Object.values(rawHtml).find((v) => typeof v === 'string') || '';
  }
  return String(rawHtml)
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses diverse date formats from RSS/Atom feeds
 */
function parseFeedDate(dateVal: any): Date | null {
  if (!dateVal) return null;
  const str = String(dateVal).trim();
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d;
  }
  return null;
}

/**
 * Reads a single feed and filters out items older than 48 hours or with invalid date
 */
export async function fetchFeedItems(
  feed: ParsedFeedConfig,
  maxAgeHours = 48,
  processedUrlSet = new Set<string>()
): Promise<RawNewsCandidate[]> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    try { controller.abort(); } catch {}
  }, 2800);

  try {
    const response = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    // Proteger lectura del texto contra streams truncados o colgados
    const textPromise = response.text();
    const textTimeout = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('timeout reading feed text')), 2000)
    );
    const rawXml = await Promise.race([textPromise, textTimeout]);
    const xml = rawXml.length > 600000 ? rawXml.slice(0, 600000) : rawXml;

    const parsed = parser.parse(xml);
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    const candidates: RawNewsCandidate[] = [];

    // RSS 2.0 / RSS 0.9 / RDF format
    const channel = parsed.rss?.channel || parsed['rdf:RDF']?.channel || parsed.channel;
    const items = channel?.item || parsed.feed?.entry || parsed['rdf:RDF']?.item || [];
    const itemArray = Array.isArray(items) ? items : [items];

    for (const item of itemArray) {
      if (!item) continue;
      const title = cleanText(item.title || '');
      if (!title) continue;

      // Link extraction
      let rawLink = '';
      if (typeof item.link === 'string') {
        rawLink = item.link;
      } else if (item.link?.['@_href']) {
        rawLink = item.link['@_href'];
      } else if (item.guid && typeof item.guid === 'string' && item.guid.startsWith('http')) {
        rawLink = item.guid;
      }

      if (!rawLink) continue;
      const normalized = normalizeUrl(rawLink);

      // Check if already processed
      if (processedUrlSet.has(normalized)) {
        continue;
      }

      // Date extraction & strict 48-hour check in code
      const rawDate = item.pubDate || item['dc:date'] || item.published || item.updated || item.date;
      const pubDate = parseFeedDate(rawDate);

      // PARTE C: Una fuente sin fecha verificable no cuenta.
      if (!pubDate) {
        continue;
      }

      const ageMs = now - pubDate.getTime();
      // Descartar si tiene más de 48 horas o si la fecha es en el futuro por más de 12 horas (reloj erróneo)
      if (ageMs > maxAgeMs || ageMs < -12 * 60 * 60 * 1000) {
        continue;
      }

      const summary = cleanText(item.description || item.summary || item['content:encoded'] || item.content || '');

      candidates.push({
        title,
        link: rawLink,
        normalizedUrl: normalized,
        pubDate,
        pubDateStr: pubDate.toISOString(),
        summary: summary.slice(0, 500),
        sourceName: feed.name,
        category: feed.category,
      });
    }

    return candidates;
  } catch {
    return [];
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Tests feeds for the "Probar fuentes" button
 */
export async function testSingleFeed(feed: ParsedFeedConfig): Promise<FeedCheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(feed.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FabulaNews/1.0)',
        Accept: 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        category: feed.category,
        name: feed.name,
        url: feed.url,
        status: 'error',
        error: `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const xml = await res.text();
    const parsed = parser.parse(xml);
    const channel = parsed.rss?.channel || parsed.feed || parsed['rdf:RDF'];
    if (!channel) {
      return {
        category: feed.category,
        name: feed.name,
        url: feed.url,
        status: 'error',
        error: 'Formato XML/RSS no reconocido o sin canal válido',
      };
    }

    const items = channel.item || channel.entry || [];
    const count = Array.isArray(items) ? items.length : items ? 1 : 0;
    const firstItem = Array.isArray(items) ? items[0] : items;
    const latestDate = firstItem?.pubDate || firstItem?.published || firstItem?.updated;

    return {
      category: feed.category,
      name: feed.name,
      url: feed.url,
      status: 'ok',
      itemCount: count,
      latestItemDate: latestDate ? String(latestDate) : undefined,
    };
  } catch (err: unknown) {
    return {
      category: feed.category,
      name: feed.name,
      url: feed.url,
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

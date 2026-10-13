import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase.js';
import { AppConfig, HistoryRecord, NewsScriptItem } from './types.js';
import {
  DEFAULT_STYLE_GUIDE,
  DEFAULT_EXAMPLE_SCRIPTS,
  DEFAULT_PRIORITY_TOPICS,
  DEFAULT_AVOID_TOPICS,
  DEFAULT_AI_WATCHLIST,
  DEFAULT_RSS_FEEDS,
} from './defaultConfig.js';

const CONFIG_DOC_PATH = 'config/general';

/**
 * Loads configuration from Firestore.
 * If the document or any field is empty, fills ONLY that empty field with the PARTE F default.
 * NEVER overwrites existing user content!
 */
export async function loadAppConfig(): Promise<AppConfig> {
  try {
    const configRef = doc(db, 'config', 'general');
    const snap = await getDoc(configRef);
    const existing = snap.exists() ? (snap.data() as Partial<AppConfig>) : {};

    const hasCompletePillars =
      existing.priorityTopics?.includes('POLÍTICA Y SOCIEDAD DE LA IA') &&
      existing.priorityTopics?.includes('Ciberseguridad') &&
      existing.priorityTopics?.includes('MÉXICO Y LATAM');

    const priorityTopicsToUse = hasCompletePillars ? existing.priorityTopics! : DEFAULT_PRIORITY_TOPICS;

    const hasUserASMLExamples = existing.exampleScripts?.includes('ASML');
    const exampleScriptsToUse = hasUserASMLExamples ? existing.exampleScripts! : DEFAULT_EXAMPLE_SCRIPTS;

    const hasUserNonPolemicalStyle = existing.styleGuide?.includes('CERO POLÉMICA');
    const styleGuideToUse = hasUserNonPolemicalStyle ? existing.styleGuide! : DEFAULT_STYLE_GUIDE;

    const merged: AppConfig = {
      styleGuide: styleGuideToUse,
      exampleScripts: exampleScriptsToUse,
      priorityTopics: priorityTopicsToUse,
      avoidTopics: existing.avoidTopics?.trim() ? existing.avoidTopics : DEFAULT_AVOID_TOPICS,
      aiWatchlist: existing.aiWatchlist?.trim() ? existing.aiWatchlist : DEFAULT_AI_WATCHLIST,
      rssFeeds: existing.rssFeeds?.trim() ? existing.rssFeeds : DEFAULT_RSS_FEEDS,
      updatedAt: existing.updatedAt || new Date().toISOString(),
    };

    // If new fields were initialized or upgraded to full pillars or non-polemical style, persist them safely
    if (
      !existing.styleGuide ||
      !hasUserNonPolemicalStyle ||
      !existing.exampleScripts ||
      !hasUserASMLExamples ||
      !existing.priorityTopics ||
      !hasCompletePillars ||
      !existing.avoidTopics ||
      !existing.aiWatchlist ||
      !existing.rssFeeds
    ) {
      if (auth.currentUser) {
        await setDoc(configRef, merged, { merge: true });
      }
    }

    return merged;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, CONFIG_DOC_PATH);
  }
}

/**
 * Saves a single configuration field with merge: true
 */
export async function saveAppConfigField(field: keyof AppConfig, value: string): Promise<void> {
  try {
    const configRef = doc(db, 'config', 'general');
    const updatePayload: Record<string, string> = {
      [field]: value,
      updatedAt: new Date().toISOString(),
    };
    await setDoc(configRef, updatePayload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, CONFIG_DOC_PATH);
  }
}

/**
 * Saves full imported config merging without deleting unspecified fields
 */
export async function importAppConfig(importedJson: Partial<AppConfig>): Promise<AppConfig> {
  try {
    const configRef = doc(db, 'config', 'general');
    const current = await loadAppConfig();

    const merged: AppConfig = {
      styleGuide: importedJson.styleGuide?.trim() || current.styleGuide,
      exampleScripts: importedJson.exampleScripts?.trim() || current.exampleScripts,
      priorityTopics: importedJson.priorityTopics?.trim() || current.priorityTopics,
      avoidTopics: importedJson.avoidTopics?.trim() || current.avoidTopics,
      aiWatchlist: importedJson.aiWatchlist?.trim() || current.aiWatchlist,
      rssFeeds: importedJson.rssFeeds?.trim() || current.rssFeeds,
      updatedAt: new Date().toISOString(),
    };

    await setDoc(configRef, merged, { merge: true });
    return merged;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, CONFIG_DOC_PATH);
  }
}

/**
 * Adds news item to user's history collection
 */
export async function addToHistory(card: NewsScriptItem): Promise<void> {
  const userId = auth.currentUser?.uid;
  if (!userId) {
    throw new Error('Debes iniciar sesión para guardar en el historial.');
  }

  const cleanId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const histPath = `history/${cleanId}`;
  try {
    const histRef = doc(db, 'history', cleanId);
    const item: HistoryRecord = {
      id: cleanId,
      title: card.title.slice(0, 500),
      script: card.script.slice(0, 5000),
      caption: card.caption.slice(0, 500),
      hashtags: card.hashtags.join(' '),
      format: card.format,
      wordCount: card.wordCount,
      newsDate: card.newsDate,
      dateUsed: new Date().toISOString(),
      userId,
    };
    await setDoc(histRef, item);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, histPath);
  }
}

/**
 * Loads history items for the authenticated user
 */
export async function loadUserHistory(): Promise<HistoryRecord[]> {
  const userId = auth.currentUser?.uid;
  if (!userId) return [];

  const histPath = 'history';
  try {
    const q = query(
      collection(db, 'history'),
      where('userId', '==', userId),
      limit(100)
    );
    const snap = await getDocs(q);
    const records: HistoryRecord[] = [];
    snap.forEach((d) => {
      records.push(d.data() as HistoryRecord);
    });
    // Sort in memory by dateUsed descending
    records.sort((a, b) => new Date(b.dateUsed).getTime() - new Date(a.dateUsed).getTime());
    return records;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, histPath);
  }
}

/**
 * Saves processed URLs into Firestore to prevent reprocessing
 */
export async function recordProcessedUrls(urls: string[]): Promise<void> {
  if (!auth.currentUser) return;
  for (const url of urls) {
    const cleanUrl = url.trim().toLowerCase();
    if (!cleanUrl) continue;
    // Create deterministic ID from hash/btoa or clean string
    const docId = btoa(cleanUrl).replace(/[/+=]/g, '_').slice(0, 100);
    try {
      await setDoc(
        doc(db, 'processed_urls', docId),
        { url: cleanUrl.slice(0, 2048), processedAt: new Date().toISOString() },
        { merge: true }
      );
    } catch {
      // Ignored for deduplication
    }
  }
}

/**
 * Loads recent processed URLs
 */
export async function getRecentProcessedUrls(): Promise<string[]> {
  if (!auth.currentUser) return [];
  try {
    const q = query(collection(db, 'processed_urls'), limit(200));
    const snap = await getDocs(q);
    const urls: string[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.url) urls.push(data.url);
    });
    return urls;
  } catch {
    return [];
  }
}

/**
 * Records first 5 words of generated scripts to avoid repetitive openings
 */
export async function recordScriptOpening(words: string): Promise<void> {
  if (!auth.currentUser || !words) return;
  const docId = `open_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await setDoc(doc(db, 'script_openings', docId), {
      words: words.slice(0, 200),
      createdAt: new Date().toISOString(),
    });
  } catch {
    // Non-blocking
  }
}

/**
 * Retrieves the last 10 script openings
 */
export async function getRecentScriptOpenings(): Promise<string[]> {
  if (!auth.currentUser) return [];
  try {
    const q = query(collection(db, 'script_openings'), limit(15));
    const snap = await getDocs(q);
    const openings: string[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (data.words) openings.push(data.words);
    });
    return openings;
  } catch {
    return [];
  }
}

export interface FactSheet {
  whatHappened: string;
  who: string;
  when: string;
  figures: string;
  targetAudience: string;
  reachesMexico: string;
  confirmed: string;
  rumors: string;
  verifiableFactsCount: number;
}

export interface NewsSource {
  name: string;
  url: string;
  pubDate: string;
  category?: string;
}

export interface EditorialScore {
  score: number;
  reasoning: string;
  novelty: number;
  impactLatam: number;
  conversationPotential: number;
}

export interface EvaluatorScores {
  coherence: number;
  coherenceNotes: string;
  cohesion: number;
  cohesionNotes: string;
  adequacy: number;
  adequacyNotes: string;
  truthfulness: number;
  truthfulnessNotes: string;
  approved: boolean;
  observations?: string;
}

export interface NewsScriptItem {
  id: string;
  title: string;
  newsDate: string;
  format: 'Rápido' | 'Explicado';
  wordCount: number;
  formatReasoning: string;
  script: string;
  caption: string;
  hashtags: string[];
  factSheet: FactSheet;
  sources: NewsSource[];
  editorialScore: EditorialScore;
  evaluatorScores: EvaluatorScores;
  approved: boolean;
  reviewObservations?: string;
  firstWords: string;
  error?: string;
  used?: boolean;
}

export interface AppConfig {
  styleGuide: string;
  exampleScripts: string;
  priorityTopics: string;
  avoidTopics: string;
  aiWatchlist: string;
  rssFeeds: string;
  updatedAt?: string;
}

export interface HistoryRecord {
  id: string;
  title: string;
  script: string;
  caption: string;
  hashtags: string;
  format: string;
  wordCount: number;
  newsDate: string;
  dateUsed: string;
  userId: string;
}

export interface FeedCheckResult {
  category: string;
  name: string;
  url: string;
  status: 'ok' | 'error';
  itemCount?: number;
  latestItemDate?: string;
  error?: string;
}

export interface GeminiLogEntry {
  id: string;
  step: string;
  model: string;
  timestamp: string;
  durationMs: number;
  status: 'success' | 'error';
  errorMessage?: string | null;
}

export interface SearchJob {
  id: string;
  userId?: string;
  status: 'running' | 'completed' | 'error';
  step: string;
  message: string;
  percent: number;
  partialCards: NewsScriptItem[];
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type SearchStep =
  | 'idle'
  | 'reading_feeds'
  | 'complementing'
  | 'scoring'
  | 'fact_checking'
  | 'writing'
  | 'reviewing'
  | 'evaluating'
  | 'completed'
  | 'error';

export interface AppConfig {
  telegramBotToken: string;
  sourceChannelIds: number[];
  privateChannelIds: string[];
  targetLanguage: string;
  apiKey: string;
  allowedTelegramIds: Set<number>;
  port: number;
  nodeEnv: string;
  skipSameLanguage: boolean;
  dedupWindowHours: number;
  showInlineButtons: boolean;
  scheduledMessageTime: string;
}

export interface ApiResponse {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface MediaPayload {
  photo?: { file_id: string };
  video?: { file_id: string };
  document?: { file_id: string };
  audio?: { file_id: string };
  voice?: { file_id: string };
  animation?: { file_id: string };
  sticker?: { file_id: string };
  video_note?: { file_id: string };
}

export interface MediaGroupItem {
  type: 'photo' | 'video';
  fileId: string;
  caption?: string;
}

export interface BufferedMediaGroup {
  items: MediaGroupItem[];
  timer: ReturnType<typeof setTimeout>;
}

export interface TranslationCacheEntry {
  translation: string;
  timestamp: number;
}

export interface BotStats {
  messagesForwarded: number;
  mediaGroupsForwarded: number;
  translationsCount: number;
  translationsSkipped: number;
  errorsCount: number;
  retriesCount: number;
  retriesSucceeded: number;
  retriesFailed: number;
  duplicatesSkipped: number;
  startedAt: number;
}

export interface RetryItem {
  action: () => Promise<void>;
  attempts: number;
  maxAttempts: number;
  nextRetry: number;
  description: string;
}

export interface DeduplicationEntry {
  hash: string;
  timestamp: number;
}

export interface VoteCount {
  relevant: number;
  irrelevant: number;
}

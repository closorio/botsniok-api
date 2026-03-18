import { createRequire } from 'module';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { incrementTranslations, incrementTranslationsSkipped } from './statsService.js';
import type { TranslationCacheEntry } from '../types/index.js';

const require = createRequire(import.meta.url);
const { Translate } = require('@google-cloud/translate').v2;

const translate = new Translate();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, TranslationCacheEntry>();

function getCacheKey(text: string, targetLanguage: string): string {
  return `${targetLanguage}:${text}`;
}

function cleanExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

async function detectLanguage(text: string): Promise<string | null> {
  try {
    const [detections] = await translate.detect(text);
    const detection = Array.isArray(detections) ? detections[0] : detections;
    return detection?.language || null;
  } catch {
    return null;
  }
}

export async function translateText(text: string, targetLanguage: string): Promise<string> {
  const key = getCacheKey(text, targetLanguage);
  const cached = cache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.translation;
  }

  // Detect language and skip if same as target
  if (config.skipSameLanguage && text.length > 20) {
    const detectedLang = await detectLanguage(text);
    if (detectedLang === targetLanguage) {
      logger.debug({ detectedLang, targetLanguage }, 'Text already in target language, skipping translation');
      incrementTranslationsSkipped();
      cache.set(key, { translation: text, timestamp: Date.now() });
      return text;
    }
  }

  try {
    const [translation] = await translate.translate(text, targetLanguage);
    incrementTranslations();
    cache.set(key, { translation, timestamp: Date.now() });

    if (cache.size > 1000) {
      cleanExpiredEntries();
    }

    return translation;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: error }, `Translation error: ${message}`);
    throw error;
  }
}

export function clearTranslationCache(): void {
  cache.clear();
}

export function getTranslationCacheSize(): number {
  return cache.size;
}

import { createRequire } from 'module';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { incrementTranslations, incrementTranslationsSkipped, incrementGoogleRateLimits, incrementCircuitBreakerTrips } from './statsService.js';
import type { TranslationCacheEntry } from '../types/index.js';

const require = createRequire(import.meta.url);
const { Translate } = require('@google-cloud/translate').v2;

const translate = new Translate();

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, TranslationCacheEntry>();

// Retry configuration for Google API calls
const TRANSLATE_MAX_RETRIES = 3;
const TRANSLATE_BASE_DELAY_MS = 5000;

// Circuit breaker state
let circuitOpen = false;
let circuitOpenedAt = 0;
const CIRCUIT_COOLDOWN_MS = 60_000; // 1 minute

// Google Translate rate limiter (sliding window)
const googleApiTimestamps: number[] = [];

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

function isGoogleRateLimitError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes('rate limit') ||
    msg.includes('ratelimitexceeded') ||
    msg.includes('resource exhausted') ||
    msg.includes('quota')
  );
}

async function waitForGoogleRateLimit(): Promise<void> {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = config.googleTranslateRpm;

  // Remove timestamps outside the window
  while (googleApiTimestamps.length > 0 && googleApiTimestamps[0] <= now - windowMs) {
    googleApiTimestamps.shift();
  }

  if (googleApiTimestamps.length >= limit) {
    const oldestInWindow = googleApiTimestamps[0];
    const waitMs = oldestInWindow + windowMs - now + 100; // +100ms buffer
    logger.warn({ waitMs, currentCount: googleApiTimestamps.length, limit }, 'Google Translate rate limit reached, waiting');
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  googleApiTimestamps.push(Date.now());
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateWithRetry(text: string, targetLanguage: string): Promise<string> {
  // Circuit breaker check
  if (circuitOpen) {
    if (Date.now() - circuitOpenedAt < CIRCUIT_COOLDOWN_MS) {
      throw new Error('Translation circuit breaker open - Google API rate limited');
    }
    circuitOpen = false;
    logger.info('Translation circuit breaker closed, retrying Google API');
  }

  await waitForGoogleRateLimit();

  for (let attempt = 0; attempt <= TRANSLATE_MAX_RETRIES; attempt++) {
    try {
      const [translation] = await translate.translate(text, targetLanguage);
      return translation;
    } catch (error) {
      if (!isGoogleRateLimitError(error) || attempt === TRANSLATE_MAX_RETRIES) {
        if (isGoogleRateLimitError(error)) {
          // All retries exhausted for rate limit - open circuit breaker
          circuitOpen = true;
          circuitOpenedAt = Date.now();
          incrementCircuitBreakerTrips();
          logger.error({ cooldownMs: CIRCUIT_COOLDOWN_MS }, 'Translation circuit breaker opened');
        }
        throw error;
      }

      incrementGoogleRateLimits();
      const waitMs = TRANSLATE_BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 1000;
      logger.warn({ attempt: attempt + 1, maxRetries: TRANSLATE_MAX_RETRIES, waitMs }, 'Google Translate rate limited, retrying');
      await delay(waitMs);
    }
  }

  // Should not reach here, but TypeScript requires a return
  throw new Error('Unexpected: translateWithRetry exhausted without throwing');
}

async function detectLanguage(text: string): Promise<string | null> {
  try {
    await waitForGoogleRateLimit();
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
    const translation = await translateWithRetry(text, targetLanguage);
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

import { createHash } from 'crypto';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';
import { incrementDuplicatesSkipped } from './statsService.js';
import type { DeduplicationEntry } from '../types/index.js';

const seen = new Map<string, DeduplicationEntry>();

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hashText(text: string): string {
  return createHash('sha256').update(normalizeText(text)).digest('hex');
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s]+/gi;
  return text.match(urlRegex) || [];
}

function cleanExpired(): void {
  const cutoff = Date.now() - config.dedupWindowHours * 3600 * 1000;
  for (const [key, entry] of seen) {
    if (entry.timestamp < cutoff) {
      seen.delete(key);
    }
  }
}

export function isDuplicate(text?: string, fileId?: string): boolean {
  if (seen.size > 5000) cleanExpired();

  const cutoff = Date.now() - config.dedupWindowHours * 3600 * 1000;

  // Check by file_id
  if (fileId) {
    const key = `file:${fileId}`;
    const existing = seen.get(key);
    if (existing && existing.timestamp > cutoff) {
      incrementDuplicatesSkipped();
      logger.debug({ fileId }, 'Duplicate detected (file_id)');
      return true;
    }
    seen.set(key, { hash: fileId, timestamp: Date.now() });
  }

  // Check by text hash
  if (text && text.length > 10) {
    const hash = hashText(text);
    const key = `text:${hash}`;
    const existing = seen.get(key);
    if (existing && existing.timestamp > cutoff) {
      incrementDuplicatesSkipped();
      logger.debug({ hash }, 'Duplicate detected (text hash)');
      return true;
    }
    seen.set(key, { hash, timestamp: Date.now() });

    // Check by URLs
    const urls = extractUrls(text);
    for (const url of urls) {
      const urlKey = `url:${url}`;
      const existingUrl = seen.get(urlKey);
      if (existingUrl && existingUrl.timestamp > cutoff) {
        incrementDuplicatesSkipped();
        logger.debug({ url }, 'Duplicate detected (URL)');
        return true;
      }
      seen.set(urlKey, { hash: url, timestamp: Date.now() });
    }
  }

  return false;
}

export function getDeduplicationCacheSize(): number {
  return seen.size;
}

export function clearDeduplicationCache(): void {
  seen.clear();
}

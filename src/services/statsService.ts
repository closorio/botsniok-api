import type { BotStats } from '../types/index.js';

const stats: BotStats = {
  messagesForwarded: 0,
  mediaGroupsForwarded: 0,
  translationsCount: 0,
  translationsSkipped: 0,
  errorsCount: 0,
  retriesCount: 0,
  retriesSucceeded: 0,
  retriesFailed: 0,
  duplicatesSkipped: 0,
  startedAt: Date.now(),
};

export function incrementForwarded(): void { stats.messagesForwarded++; }
export function incrementMediaGroups(): void { stats.mediaGroupsForwarded++; }
export function incrementTranslations(): void { stats.translationsCount++; }
export function incrementTranslationsSkipped(): void { stats.translationsSkipped++; }
export function incrementErrors(): void { stats.errorsCount++; }
export function incrementRetries(): void { stats.retriesCount++; }
export function incrementRetriesSucceeded(): void { stats.retriesSucceeded++; }
export function incrementRetriesFailed(): void { stats.retriesFailed++; }
export function incrementDuplicatesSkipped(): void { stats.duplicatesSkipped++; }

export function getStats(): BotStats {
  return { ...stats };
}

export function getUptime(): string {
  const seconds = Math.floor((Date.now() - stats.startedAt) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

export function resetStats(): void {
  stats.messagesForwarded = 0;
  stats.mediaGroupsForwarded = 0;
  stats.translationsCount = 0;
  stats.translationsSkipped = 0;
  stats.errorsCount = 0;
  stats.retriesCount = 0;
  stats.retriesSucceeded = 0;
  stats.retriesFailed = 0;
  stats.duplicatesSkipped = 0;
  stats.startedAt = Date.now();
}

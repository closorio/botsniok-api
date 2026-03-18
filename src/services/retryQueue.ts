import { logger } from '../utils/logger.js';
import { incrementRetries, incrementRetriesSucceeded, incrementRetriesFailed } from './statsService.js';
import type { RetryItem } from '../types/index.js';

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 2000;
const queue: RetryItem[] = [];
let processingTimer: ReturnType<typeof setInterval> | null = null;

function getBackoffDelay(attempt: number, retryAfter?: number): number {
  if (retryAfter) return retryAfter * 1000;
  return BASE_DELAY_MS * Math.pow(2, attempt);
}

export function isRecoverableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes('etelegram: 429') ||
    message.includes('too many requests') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('enetunreach') ||
    message.includes('socket hang up') ||
    message.includes('network')
  );
}

function extractRetryAfter(error: unknown): number | undefined {
  if (error instanceof Error && error.message.includes('retry_after')) {
    const match = error.message.match(/retry_after.*?(\d+)/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

export function enqueue(action: () => Promise<void>, description: string, error?: unknown): void {
  const retryAfter = extractRetryAfter(error);
  const item: RetryItem = {
    action,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextRetry: Date.now() + getBackoffDelay(0, retryAfter),
    description,
  };
  queue.push(item);
  incrementRetries();
  logger.info({ description, queueSize: queue.length }, 'Enqueued for retry');
}

async function processQueue(): Promise<void> {
  const now = Date.now();
  const readyItems = queue.filter((item) => item.nextRetry <= now);

  for (const item of readyItems) {
    const index = queue.indexOf(item);
    if (index === -1) continue;

    item.attempts++;

    try {
      await item.action();
      queue.splice(index, 1);
      incrementRetriesSucceeded();
      logger.info({ description: item.description, attempt: item.attempts }, 'Retry succeeded');
    } catch (error) {
      if (item.attempts >= item.maxAttempts) {
        queue.splice(index, 1);
        incrementRetriesFailed();
        logger.error(
          { err: error, description: item.description, attempts: item.attempts },
          'Retry exhausted, message lost',
        );
      } else {
        const retryAfter = extractRetryAfter(error);
        item.nextRetry = Date.now() + getBackoffDelay(item.attempts, retryAfter);
        logger.warn(
          { description: item.description, attempt: item.attempts, nextRetryIn: item.nextRetry - Date.now() },
          'Retry failed, will retry again',
        );
      }
    }
  }
}

export function startProcessing(): void {
  if (processingTimer) return;
  processingTimer = setInterval(() => { processQueue().catch(() => {}); }, 1000);
}

export function stopProcessing(): void {
  if (processingTimer) {
    clearInterval(processingTimer);
    processingTimer = null;
  }
}

export function getQueueSize(): number {
  return queue.length;
}

export function clearQueue(): void {
  queue.length = 0;
}

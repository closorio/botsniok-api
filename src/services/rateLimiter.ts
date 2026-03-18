import { logger } from '../utils/logger.js';

const GLOBAL_LIMIT = 25; // conservative under 30 msg/s
const PER_CHAT_LIMIT = 18; // conservative under 20 msg/min
const GLOBAL_WINDOW_MS = 1000;
const PER_CHAT_WINDOW_MS = 60000;

const globalTimestamps: number[] = [];
const chatTimestamps = new Map<string, number[]>();

function cleanOldTimestamps(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }
  return timestamps;
}

export async function waitForRateLimit(chatId: string): Promise<void> {
  // Check global limit
  cleanOldTimestamps(globalTimestamps, GLOBAL_WINDOW_MS);
  if (globalTimestamps.length >= GLOBAL_LIMIT) {
    const waitTime = globalTimestamps[0] + GLOBAL_WINDOW_MS - Date.now();
    if (waitTime > 0) {
      logger.debug({ waitTime, chatId }, 'Rate limit: waiting (global)');
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  // Check per-chat limit
  let chatTs = chatTimestamps.get(chatId) || [];
  chatTs = cleanOldTimestamps(chatTs, PER_CHAT_WINDOW_MS);
  chatTimestamps.set(chatId, chatTs);

  if (chatTs.length >= PER_CHAT_LIMIT) {
    const waitTime = chatTs[0] + PER_CHAT_WINDOW_MS - Date.now();
    if (waitTime > 0) {
      logger.debug({ waitTime, chatId }, 'Rate limit: waiting (per-chat)');
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  // Record this request
  globalTimestamps.push(Date.now());
  chatTs.push(Date.now());
}

export function getRateLimiterInfo(): { globalUsage: number; trackedChats: number } {
  cleanOldTimestamps(globalTimestamps, GLOBAL_WINDOW_MS);
  return {
    globalUsage: globalTimestamps.length,
    trackedChats: chatTimestamps.size,
  };
}

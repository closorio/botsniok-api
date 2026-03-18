import { config as dotenvConfig } from 'dotenv';
import type { AppConfig } from '../types/index.js';

dotenvConfig();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseChannelIds(raw: string): string[] {
  return raw.split(',').map((id) => id.trim()).filter(Boolean);
}

function parseNumberList(raw: string): number[] {
  return raw.split(',').map((id) => Number(id.trim())).filter((id) => !isNaN(id));
}

function parseTelegramIds(raw: string): Set<number> {
  return new Set(parseNumberList(raw));
}

function parseSourceChannels(): number[] {
  const sourceIds = process.env.SOURCE_CHANNEL_IDS;
  if (sourceIds) return parseNumberList(sourceIds);

  // Backward compatibility
  const auxId = process.env.AUX_CHANNEL_ID;
  if (auxId) return [Number(auxId)];

  throw new Error('Missing required environment variable: SOURCE_CHANNEL_IDS (or AUX_CHANNEL_ID)');
}

export const config: AppConfig = {
  telegramBotToken: requireEnv('TELEGRAM_BOT_TOKEN'),
  sourceChannelIds: parseSourceChannels(),
  privateChannelIds: parseChannelIds(requireEnv('PRIVATE_CHANNEL_IDS')),
  targetLanguage: process.env.TARGET_LANGUAGE || 'es',
  apiKey: requireEnv('API_KEY'),
  allowedTelegramIds: parseTelegramIds(requireEnv('ALLOWED_TELEGRAM_IDS')),
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  skipSameLanguage: process.env.SKIP_SAME_LANGUAGE !== 'false',
  dedupWindowHours: Number(process.env.DEDUP_WINDOW_HOURS) || 24,
  showInlineButtons: process.env.SHOW_INLINE_BUTTONS === 'true',
  scheduledMessageTime: process.env.SCHEDULED_MESSAGE_TIME || '',
};

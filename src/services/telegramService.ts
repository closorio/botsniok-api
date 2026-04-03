import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/config.js';
import { translateText } from './translationService.js';
import { logger } from '../utils/logger.js';
import { waitForRateLimit } from './rateLimiter.js';
import { incrementPollingErrors } from './statsService.js';
import type { MediaGroupItem, MediaPayload } from '../types/index.js';

let bot: TelegramBot | null = null;
let pollingErrorCount = 0;
let isRecoveringPolling = false;

const TELEGRAM_CAPTION_LIMIT = 1024;

function truncateCaption(text: string): string {
  if (text.length <= TELEGRAM_CAPTION_LIMIT) return text;
  return text.slice(0, TELEGRAM_CAPTION_LIMIT - 3) + '...';
}

/**
 * Parses a channel ID that may include a topic/thread suffix.
 * Format: "chatId" or "chatId_threadId" (e.g., "-1001972778539_1")
 */
function parseChatId(raw: string): { chatId: string; threadId?: number } {
  const parts = raw.split('_');
  if (parts.length === 2 && !isNaN(Number(parts[1]))) {
    return { chatId: parts[0], threadId: Number(parts[1]) };
  }
  return { chatId: raw };
}

export function initializeBot(): TelegramBot {
  bot = new TelegramBot(config.telegramBotToken, { polling: true });

  bot.on('polling_error', (error) => {
    pollingErrorCount++;
    incrementPollingErrors();
    logger.error({ err: error, pollingErrorCount }, 'Telegram polling error');

    if (isRecoveringPolling) return;
    isRecoveringPolling = true;

    const backoffMs = Math.min(1000 * Math.pow(2, pollingErrorCount), 300_000);
    logger.warn({ backoffMs, pollingErrorCount }, 'Stopping polling, will restart after backoff');

    bot?.stopPolling();
    setTimeout(() => {
      bot?.startPolling();
      isRecoveringPolling = false;
      logger.info({ backoffMs }, 'Polling restarted after backoff');
    }, backoffMs);
  });

  bot.on('channel_post', () => {
    if (pollingErrorCount > 0) {
      logger.info({ previousErrorCount: pollingErrorCount }, 'Polling recovered, resetting error count');
      pollingErrorCount = 0;
    }
  });

  logger.info('Bot initialized successfully');
  return bot;
}

export function getBot(): TelegramBot {
  if (!bot) {
    throw new Error('Bot has not been initialized. Call initializeBot() first.');
  }
  return bot;
}

export function isAllowedUser(userId: number): boolean {
  return config.allowedTelegramIds.has(userId);
}

export async function sendTextMessage(rawChatId: string, text: string, targetLanguage: string): Promise<void> {
  const currentBot = getBot();
  const { chatId, threadId } = parseChatId(rawChatId);
  await waitForRateLimit(chatId);
  const translatedText = await translateText(text, targetLanguage);
  await currentBot.sendMessage(chatId, translatedText, {
    ...(threadId ? { message_thread_id: threadId } : {}),
  });
}

export async function sendMedia(
  rawChatId: string,
  media: MediaPayload,
  caption: string | undefined,
  targetLanguage: string,
  replyMarkup?: TelegramBot.InlineKeyboardMarkup,
): Promise<TelegramBot.Message> {
  const currentBot = getBot();
  const { chatId, threadId } = parseChatId(rawChatId);
  await waitForRateLimit(chatId);
  const threadOpt = threadId ? { message_thread_id: threadId } : {};
  const options: Record<string, unknown> = { ...threadOpt };

  if (caption) {
    const translated = await translateText(caption, targetLanguage);
    options.caption = truncateCaption(translated);
  }
  if (replyMarkup) {
    options.reply_markup = replyMarkup;
  }

  if (media.photo) {
    return await currentBot.sendPhoto(chatId, media.photo.file_id, options);
  } else if (media.video) {
    return await currentBot.sendVideo(chatId, media.video.file_id, options);
  } else if (media.document) {
    return await currentBot.sendDocument(chatId, media.document.file_id, options);
  } else if (media.audio) {
    return await currentBot.sendAudio(chatId, media.audio.file_id, options);
  } else if (media.voice) {
    return await currentBot.sendVoice(chatId, media.voice.file_id, options);
  } else if (media.animation) {
    return await currentBot.sendAnimation(chatId, media.animation.file_id, options);
  } else if (media.sticker) {
    return await currentBot.sendSticker(chatId, media.sticker.file_id, { ...threadOpt });
  } else if (media.video_note) {
    return await currentBot.sendVideoNote(chatId, media.video_note.file_id, { ...threadOpt });
  }

  throw new Error('Unknown media type');
}

export async function sendMediaGroup(
  rawChatId: string,
  items: MediaGroupItem[],
  targetLanguage: string,
): Promise<void> {
  const currentBot = getBot();
  const { chatId, threadId } = parseChatId(rawChatId);
  await waitForRateLimit(chatId);

  const mediaArray: TelegramBot.InputMedia[] = await Promise.all(
    items.map(async (item, index) => {
      let caption: string | undefined;
      if (index === 0 && item.caption) {
        const translated = await translateText(item.caption, targetLanguage);
        caption = truncateCaption(translated);
      }

      return {
        type: item.type as 'photo' | 'video',
        media: item.fileId,
        ...(caption ? { caption } : {}),
      };
    }),
  );

  // @ts-expect-error - message_thread_id is valid but not in type definitions
  await currentBot.sendMediaGroup(chatId, mediaArray, { ...(threadId ? { message_thread_id: threadId } : {}) });
}

export async function sendLocation(rawChatId: string, latitude: number, longitude: number): Promise<void> {
  const currentBot = getBot();
  const { chatId, threadId } = parseChatId(rawChatId);
  await waitForRateLimit(chatId);
  await currentBot.sendLocation(chatId, latitude, longitude, {
    ...(threadId ? { message_thread_id: threadId } : {}),
  });
}

export async function sendContact(rawChatId: string, phoneNumber: string, firstName: string, lastName?: string): Promise<void> {
  const currentBot = getBot();
  const { chatId, threadId } = parseChatId(rawChatId);
  await waitForRateLimit(chatId);
  await currentBot.sendContact(chatId, phoneNumber, firstName, {
    last_name: lastName,
    ...(threadId ? { message_thread_id: threadId } : {}),
  });
}

export async function sendPoll(rawChatId: string, question: string, pollOptions: string[]): Promise<void> {
  const currentBot = getBot();
  const { chatId, threadId } = parseChatId(rawChatId);
  await waitForRateLimit(chatId);
  await currentBot.sendPoll(chatId, question, pollOptions, {
    ...(threadId ? { message_thread_id: threadId } : {}),
  } as TelegramBot.SendPollOptions);
}

export async function sendAndPinMessage(rawChatId: string, text: string): Promise<void> {
  const currentBot = getBot();
  const { chatId, threadId } = parseChatId(rawChatId);
  await waitForRateLimit(chatId);
  const sentMessage = await currentBot.sendMessage(chatId, text, {
    disable_web_page_preview: false,
    ...(threadId ? { message_thread_id: threadId } : {}),
  });
  await currentBot.pinChatMessage(chatId, sentMessage.message_id, {
    disable_notification: false,
  });
}

export function stopBot(): void {
  if (bot) {
    bot.stopPolling();
    bot = null;
    logger.info('Bot stopped successfully');
  }
}

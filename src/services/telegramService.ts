import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config/config.js';
import { translateText } from './translationService.js';
import { logger } from '../utils/logger.js';
import { waitForRateLimit } from './rateLimiter.js';
import type { MediaGroupItem, MediaPayload } from '../types/index.js';

let bot: TelegramBot | null = null;

export function initializeBot(): TelegramBot {
  bot = new TelegramBot(config.telegramBotToken, { polling: true });
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

export async function sendTextMessage(chatId: string, text: string, targetLanguage: string): Promise<void> {
  const currentBot = getBot();
  await waitForRateLimit(chatId);
  const translatedText = await translateText(text, targetLanguage);
  await currentBot.sendMessage(chatId, translatedText);
}

export async function sendMedia(
  chatId: string,
  media: MediaPayload,
  caption: string | undefined,
  targetLanguage: string,
  replyMarkup?: TelegramBot.InlineKeyboardMarkup,
): Promise<TelegramBot.Message> {
  const currentBot = getBot();
  await waitForRateLimit(chatId);
  const options: TelegramBot.SendPhotoOptions & TelegramBot.SendVideoOptions & TelegramBot.SendDocumentOptions & TelegramBot.SendAnimationOptions & TelegramBot.SendAudioOptions & TelegramBot.SendVoiceOptions = {};

  if (caption) {
    options.caption = await translateText(caption, targetLanguage);
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
    return await currentBot.sendSticker(chatId, media.sticker.file_id);
  } else if (media.video_note) {
    return await currentBot.sendVideoNote(chatId, media.video_note.file_id);
  }

  throw new Error('Unknown media type');
}

export async function sendMediaGroup(
  chatId: string,
  items: MediaGroupItem[],
  targetLanguage: string,
): Promise<void> {
  const currentBot = getBot();
  await waitForRateLimit(chatId);

  const mediaArray: TelegramBot.InputMedia[] = await Promise.all(
    items.map(async (item, index) => {
      let caption: string | undefined;
      if (index === 0 && item.caption) {
        caption = await translateText(item.caption, targetLanguage);
      }

      return {
        type: item.type as 'photo' | 'video',
        media: item.fileId,
        ...(caption ? { caption } : {}),
      };
    }),
  );

  await currentBot.sendMediaGroup(chatId, mediaArray);
}

export async function sendLocation(chatId: string, latitude: number, longitude: number): Promise<void> {
  const currentBot = getBot();
  await waitForRateLimit(chatId);
  await currentBot.sendLocation(chatId, latitude, longitude);
}

export async function sendContact(chatId: string, phoneNumber: string, firstName: string, lastName?: string): Promise<void> {
  const currentBot = getBot();
  await waitForRateLimit(chatId);
  await currentBot.sendContact(chatId, phoneNumber, firstName, { last_name: lastName });
}

export async function sendPoll(chatId: string, question: string, pollOptions: string[]): Promise<void> {
  const currentBot = getBot();
  await waitForRateLimit(chatId);
  await currentBot.sendPoll(chatId, question, pollOptions);
}

export async function sendAndPinMessage(chatId: string, text: string): Promise<void> {
  const currentBot = getBot();
  await waitForRateLimit(chatId);
  const sentMessage = await currentBot.sendMessage(chatId, text, {
    disable_web_page_preview: false,
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

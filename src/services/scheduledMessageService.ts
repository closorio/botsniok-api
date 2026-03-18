import { getBot } from './telegramService.js';
import { translateText } from './translationService.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { waitForRateLimit } from './rateLimiter.js';

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
let lastSentDate: string | null = null;

function parseTime(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

function getTodayDateStr(): string {
  return new Date().toISOString().split('T')[0];
}

function isTimeToSend(): boolean {
  if (!config.scheduledMessageTime) return false;

  const parsed = parseTime(config.scheduledMessageTime);
  if (!parsed) return false;

  const now = new Date();
  const today = getTodayDateStr();

  if (lastSentDate === today) return false;

  return now.getHours() === parsed.hours && now.getMinutes() === parsed.minutes;
}

async function sendScheduledMessage(): Promise<void> {
  const bot = getBot();

  for (const sourceChannelId of config.sourceChannelIds) {
    try {
      const chat = await bot.getChat(sourceChannelId);
      const pinnedMessage = chat.pinned_message;

      if (!pinnedMessage) {
        logger.info({ channelId: sourceChannelId }, 'No pinned message found in source channel');
        continue;
      }

      for (const destChannelId of config.privateChannelIds) {
        await waitForRateLimit(destChannelId);

        try {
          if (pinnedMessage.text) {
            const translated = await translateText(pinnedMessage.text, config.targetLanguage);
            await bot.sendMessage(destChannelId, translated);
          }

          if (pinnedMessage.photo) {
            const photo = pinnedMessage.photo[pinnedMessage.photo.length - 1];
            const caption = pinnedMessage.caption
              ? await translateText(pinnedMessage.caption, config.targetLanguage)
              : undefined;
            await bot.sendPhoto(destChannelId, photo.file_id, caption ? { caption } : {});
          }

          if (pinnedMessage.video) {
            const caption = pinnedMessage.caption
              ? await translateText(pinnedMessage.caption, config.targetLanguage)
              : undefined;
            await bot.sendVideo(destChannelId, pinnedMessage.video.file_id, caption ? { caption } : {});
          }

          logger.info({ sourceChannelId, destChannelId }, 'Scheduled message sent');
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Unknown error';
          logger.error({ err: error, destChannelId }, `Failed to send scheduled message: ${msg}`);
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ err: error, sourceChannelId }, `Failed to read pinned message: ${msg}`);
    }
  }

  lastSentDate = getTodayDateStr();
}

async function checkSchedule(): Promise<void> {
  if (isTimeToSend()) {
    await sendScheduledMessage();
  }
}

export function startScheduler(): void {
  if (!config.scheduledMessageTime) {
    logger.info('Scheduled messages disabled (SCHEDULED_MESSAGE_TIME not set)');
    return;
  }

  if (schedulerTimer) return;

  schedulerTimer = setInterval(() => { checkSchedule().catch(() => {}); }, 60000);
  logger.info({ time: config.scheduledMessageTime }, 'Scheduled message service started');
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

export function getSchedulerInfo(): { enabled: boolean; time: string; lastSentDate: string | null } {
  return {
    enabled: !!config.scheduledMessageTime,
    time: config.scheduledMessageTime || 'disabled',
    lastSentDate,
  };
}

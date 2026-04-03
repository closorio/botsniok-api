import { sendTextMessage, sendMedia, sendMediaGroup, sendLocation, sendContact, sendPoll } from './telegramService.js';
import { isRecoverableError, enqueue } from './retryQueue.js';
import { incrementForwarded, incrementMediaGroups, incrementErrors } from './statsService.js';
import { getInlineKeyboard } from '../handlers/callbackHandler.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import type { ForwardingQueueItem, MediaPayload } from '../types/index.js';

const queue: ForwardingQueueItem[] = [];
let isProcessing = false;

const QUEUE_WARNING_THRESHOLD = 20;
const TELEGRAM_CAPTION_LIMIT = 1024;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Strips source metadata footer from messages.
 * Scans from the bottom up and removes the contiguous metadata block.
 */
function isMetadataLine(line: string): boolean {
  const stripped = line.trim();
  if (stripped === '') return true;

  const normalized = stripped.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim();

  return (
    /\bid\s*:\s*\d/i.test(stripped) ||
    /https?:\/\/t\.me\//i.test(stripped) ||
    /\b(map|mapa|karte|carte|карта)\s*:/i.test(stripped) ||
    /militarysummary\.com/i.test(stripped) ||
    /\b(boost|apoya|поддерж|soutenir|unterstütz)/i.test(stripped) ||
    /^📧/u.test(stripped) ||
    /^💻/u.test(stripped) ||
    /^(source|fuente|quelle|источник)\s*:/i.test(normalized)
  );
}

function stripSourceMetadata(text: string): string {
  const lines = text.split('\n');
  let cutIndex = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isMetadataLine(lines[i])) {
      cutIndex = i;
    } else {
      break;
    }
  }
  return lines.slice(0, cutIndex).join('\n').trimEnd();
}

function cleanCaption(caption?: string): string | undefined {
  if (!caption) return undefined;
  const cleaned = stripSourceMetadata(caption);
  if (!cleaned) return undefined;
  // Telegram caption limit is 1024 characters
  if (cleaned.length > TELEGRAM_CAPTION_LIMIT) {
    return cleaned.slice(0, TELEGRAM_CAPTION_LIMIT - 3) + '...';
  }
  return cleaned;
}

/**
 * Forward a single message to one specific channel.
 */
async function forwardToChannel(item: ForwardingQueueItem, channelId: string): Promise<void> {
  const { msg } = item;
  const { targetLanguage } = item;
  const replyMarkup = config.showInlineButtons ? getInlineKeyboard() : undefined;

  if (msg.text) {
    const cleanText = stripSourceMetadata(msg.text);
    if (!cleanText) return;
    await sendTextMessage(channelId, cleanText, targetLanguage);
    return;
  }

  if (msg.photo) {
    const photo = msg.photo[msg.photo.length - 1];
    const media: MediaPayload = { photo: { file_id: photo.file_id } };
    await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
    return;
  }

  if (msg.video) {
    const media: MediaPayload = { video: { file_id: msg.video.file_id } };
    await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
    return;
  }

  if (msg.document) {
    const media: MediaPayload = { document: { file_id: msg.document.file_id } };
    await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
    return;
  }

  if (msg.audio) {
    const media: MediaPayload = { audio: { file_id: msg.audio.file_id } };
    await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
    return;
  }

  if (msg.voice) {
    const media: MediaPayload = { voice: { file_id: msg.voice.file_id } };
    await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
    return;
  }

  if (msg.animation) {
    const media: MediaPayload = { animation: { file_id: msg.animation.file_id } };
    await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
    return;
  }

  if (msg.sticker) {
    const media: MediaPayload = { sticker: { file_id: msg.sticker.file_id } };
    await sendMedia(channelId, media, undefined, targetLanguage);
    return;
  }

  if (msg.video_note) {
    const media: MediaPayload = { video_note: { file_id: msg.video_note.file_id } };
    await sendMedia(channelId, media, undefined, targetLanguage);
    return;
  }

  if (msg.location) {
    await sendLocation(channelId, msg.location.latitude, msg.location.longitude);
    return;
  }

  if (msg.contact) {
    await sendContact(channelId, msg.contact.phone_number, msg.contact.first_name, msg.contact.last_name);
    return;
  }

  if (msg.poll) {
    const options = msg.poll.options.map((o: { text: string }) => o.text);
    await sendPoll(channelId, msg.poll.question, options);
    return;
  }
}

/**
 * Process the queue sequentially with a delay between each send.
 * Re-checks queue after processing to avoid race conditions where
 * items arrive during the final delay.
 */
async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  try {
    // Outer loop: re-check queue after each full drain to catch items
    // that arrived during the last delay cycle
    while (queue.length > 0) {
      const item = queue.shift()!;

      // Media group items
      if (item.isMediaGroup && item.mediaGroupItems) {
        incrementMediaGroups();
        for (const channelId of item.privateChannelIds) {
          try {
            await sendMediaGroup(channelId, item.mediaGroupItems, item.targetLanguage);
            incrementForwarded();
          } catch (error) {
            incrementErrors();
            if (isRecoverableError(error)) {
              const mediaItems = item.mediaGroupItems;
              enqueue(
                () => sendMediaGroup(channelId, mediaItems, item.targetLanguage),
                `media group → ${channelId}`,
                error,
              );
            } else {
              const message = error instanceof Error ? error.message : 'Unknown error';
              logger.error({ err: error, channelId }, `Error forwarding media group: ${message}`);
            }
          }
          // Only delay if there's more work to do
          if (queue.length > 0 || item.privateChannelIds.indexOf(channelId) < item.privateChannelIds.length - 1) {
            await delay(config.forwardingDelayMs);
          }
        }
        continue;
      }

      // Single message items
      for (const channelId of item.privateChannelIds) {
        try {
          await forwardToChannel(item, channelId);
          incrementForwarded();
        } catch (error) {
          incrementErrors();
          if (isRecoverableError(error)) {
            enqueue(
              () => forwardToChannel(item, channelId),
              `message → ${channelId}`,
              error,
            );
          } else {
            const message = error instanceof Error ? error.message : 'Unknown error';
            logger.error({ err: error, channelId }, `Error forwarding post: ${message}`);
          }
        }
        // Only delay if there's more work to do
        if (queue.length > 0 || item.privateChannelIds.indexOf(channelId) < item.privateChannelIds.length - 1) {
          await delay(config.forwardingDelayMs);
        }
      }
    }
  } finally {
    isProcessing = false;
    // Final safety check: if items arrived during the last iteration,
    // kick off processing again
    if (queue.length > 0) {
      processQueue().catch((error) => {
        logger.error({ err: error }, 'Unexpected error restarting forwarding queue');
      });
    }
  }
}

/**
 * Add a message to the forwarding queue.
 */
export function addToForwardingQueue(item: ForwardingQueueItem): void {
  queue.push(item);

  if (queue.length > QUEUE_WARNING_THRESHOLD) {
    logger.warn({ queueSize: queue.length }, 'Forwarding queue is growing large');
  }

  logger.debug({ queueSize: queue.length, isMediaGroup: !!item.isMediaGroup }, 'Message added to forwarding queue');

  // Start processing if not already running
  if (!isProcessing) {
    processQueue().catch((error) => {
      logger.error({ err: error }, 'Unexpected error in forwarding queue processor');
    });
  }
}

export function getForwardingQueueSize(): number {
  return queue.length;
}

export function clearForwardingQueue(): void {
  queue.length = 0;
}

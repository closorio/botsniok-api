import { getBot, sendTextMessage, sendMedia, sendMediaGroup, sendLocation, sendContact, sendPoll } from '../services/telegramService.js';
import { isPaused } from './commandHandler.js';
import { isDuplicate } from '../services/deduplicationService.js';
import { isRecoverableError, enqueue } from '../services/retryQueue.js';
import { incrementForwarded, incrementMediaGroups, incrementErrors } from '../services/statsService.js';
import { getInlineKeyboard } from './callbackHandler.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import type { MediaGroupItem, MediaPayload, BufferedMediaGroup } from '../types/index.js';

const MEDIA_GROUP_WAIT_MS = 2000;
const mediaGroupBuffer = new Map<string, BufferedMediaGroup>();

/**
 * Checks if a line is part of the source metadata footer.
 * Matches patterns like: 💻 id:, 📧source:, Map:, Boost the Channel, etc.
 * Uses loose matching to handle any language and emoji variants.
 */
function isMetadataLine(line: string): boolean {
  const stripped = line.trim();
  if (stripped === '') return true;

  // Normalize: remove all emoji/special chars for pattern matching
  const normalized = stripped.replace(/[\u{1F000}-\u{1FFFF}]/gu, '').trim();

  return (
    // id: 14112024.0906 (with or without emoji prefix)
    /\bid\s*:\s*\d/i.test(stripped) ||
    // source/fuente/quelle/источник etc. followed by : and a URL
    /https?:\/\/t\.me\//i.test(stripped) ||
    // Map/Mapa/Karte/Карта: militarysummary.com
    /\b(map|mapa|karte|carte|карта)\s*:/i.test(stripped) ||
    /militarysummary\.com/i.test(stripped) ||
    // Boost the Channel / Apoya el canal (any language)
    /\b(boost|apoya|поддерж|soutenir|unterstütz)/i.test(stripped) ||
    // 📧 emoji line (source link)
    /^📧/u.test(stripped) ||
    // 💻 emoji line (id)
    /^💻/u.test(stripped) ||
    // Standalone "source:" or "fuente:" at start
    /^(source|fuente|quelle|источник)\s*:/i.test(normalized)
  );
}

/**
 * Strips source metadata footer from messages.
 * Scans from the bottom up and removes the contiguous metadata block.
 */
function stripSourceMetadata(text: string): string {
  const lines = text.split('\n');

  // Find where the metadata block starts (search from bottom)
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

function flushMediaGroup(
  mediaGroupId: string,
  privateChannelIds: string[],
  targetLanguage: string,
): void {
  const group = mediaGroupBuffer.get(mediaGroupId);
  if (!group) return;

  mediaGroupBuffer.delete(mediaGroupId);
  incrementMediaGroups();

  for (const privateChannelId of privateChannelIds) {
    const sendAction = () => sendMediaGroup(privateChannelId, group.items, targetLanguage);

    sendAction().catch((error) => {
      incrementErrors();
      if (isRecoverableError(error)) {
        enqueue(sendAction, `media group → ${privateChannelId}`, error);
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ err: error, channelId: privateChannelId, mediaGroupId }, `Error forwarding media group: ${message}`);
      }
    });
  }
}

function getMessageText(msg: { text?: string; caption?: string }): string | undefined {
  return msg.text || msg.caption;
}

function getMessageFileId(msg: {
  photo?: { file_id: string }[];
  video?: { file_id: string };
  document?: { file_id: string };
  audio?: { file_id: string };
  voice?: { file_id: string };
  animation?: { file_id: string };
  sticker?: { file_id: string };
  video_note?: { file_id: string };
}): string | undefined {
  if (msg.photo) return msg.photo[msg.photo.length - 1].file_id;
  if (msg.video) return msg.video.file_id;
  if (msg.document) return msg.document.file_id;
  if (msg.audio) return msg.audio.file_id;
  if (msg.voice) return msg.voice.file_id;
  if (msg.animation) return msg.animation.file_id;
  if (msg.sticker) return msg.sticker.file_id;
  if (msg.video_note) return msg.video_note.file_id;
  return undefined;
}

function cleanCaption(caption?: string): string | undefined {
  if (!caption) return undefined;
  const cleaned = stripSourceMetadata(caption);
  return cleaned || undefined;
}

async function forwardSingleMessage(
  msg: any,
  privateChannelIds: string[],
  targetLanguage: string,
): Promise<void> {
  const replyMarkup = config.showInlineButtons ? getInlineKeyboard() : undefined;

  for (const channelId of privateChannelIds) {
    try {
      // Text-only message
      if (msg.text) {
        const cleanText = stripSourceMetadata(msg.text);
        if (!cleanText) continue;
        await sendTextMessage(channelId, cleanText, targetLanguage);
        incrementForwarded();
        continue;
      }

      // Photo
      if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        const media: MediaPayload = { photo: { file_id: photo.file_id } };
        await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
        incrementForwarded();
        continue;
      }

      // Video
      if (msg.video) {
        const media: MediaPayload = { video: { file_id: msg.video.file_id } };
        await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
        incrementForwarded();
        continue;
      }

      // Document
      if (msg.document) {
        const media: MediaPayload = { document: { file_id: msg.document.file_id } };
        await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
        incrementForwarded();
        continue;
      }

      // Audio
      if (msg.audio) {
        const media: MediaPayload = { audio: { file_id: msg.audio.file_id } };
        await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
        incrementForwarded();
        continue;
      }

      // Voice
      if (msg.voice) {
        const media: MediaPayload = { voice: { file_id: msg.voice.file_id } };
        await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
        incrementForwarded();
        continue;
      }

      // Animation (GIF)
      if (msg.animation) {
        const media: MediaPayload = { animation: { file_id: msg.animation.file_id } };
        await sendMedia(channelId, media, cleanCaption(msg.caption), targetLanguage, replyMarkup);
        incrementForwarded();
        continue;
      }

      // Sticker
      if (msg.sticker) {
        const media: MediaPayload = { sticker: { file_id: msg.sticker.file_id } };
        await sendMedia(channelId, media, undefined, targetLanguage);
        incrementForwarded();
        continue;
      }

      // Video note
      if (msg.video_note) {
        const media: MediaPayload = { video_note: { file_id: msg.video_note.file_id } };
        await sendMedia(channelId, media, undefined, targetLanguage);
        incrementForwarded();
        continue;
      }

      // Location
      if (msg.location) {
        await sendLocation(channelId, msg.location.latitude, msg.location.longitude);
        incrementForwarded();
        continue;
      }

      // Contact
      if (msg.contact) {
        await sendContact(channelId, msg.contact.phone_number, msg.contact.first_name, msg.contact.last_name);
        incrementForwarded();
        continue;
      }

      // Poll
      if (msg.poll) {
        const options = msg.poll.options.map((o: { text: string }) => o.text);
        await sendPoll(channelId, msg.poll.question, options);
        incrementForwarded();
        continue;
      }
    } catch (error) {
      incrementErrors();
      if (isRecoverableError(error)) {
        enqueue(
          () => forwardSingleMessage(msg, [channelId], targetLanguage),
          `message → ${channelId}`,
          error,
        );
      } else {
        const message = error instanceof Error ? error.message : 'Unknown error';
        logger.error({ err: error, channelId }, `Error forwarding post: ${message}`);
      }
    }
  }
}

export function forwardChannelPosts(
  sourceChannelIds: number[],
  privateChannelIds: string[],
  targetLanguage: string,
): void {
  const bot = getBot();

  bot.on('channel_post', async (msg) => {
    // Check if message is from a monitored source channel
    if (!sourceChannelIds.includes(msg.chat.id)) return;

    // Check if paused
    if (isPaused()) return;

    // Check for duplicates
    const text = getMessageText(msg);
    const fileId = getMessageFileId(msg);
    if (isDuplicate(text, fileId)) {
      logger.debug({ chatId: msg.chat.id }, 'Duplicate message skipped');
      return;
    }

    // Handle media groups (albums)
    if (msg.media_group_id) {
      const groupId = msg.media_group_id;
      let item: MediaGroupItem | null = null;

      if (msg.photo) {
        const photo = msg.photo[msg.photo.length - 1];
        item = { type: 'photo', fileId: photo.file_id, caption: cleanCaption(msg.caption) };
      } else if (msg.video) {
        item = { type: 'video', fileId: msg.video.file_id, caption: cleanCaption(msg.caption) };
      }

      if (!item) return;

      const existing = mediaGroupBuffer.get(groupId);
      if (existing) {
        clearTimeout(existing.timer);
        existing.items.push(item);
        existing.timer = setTimeout(() => flushMediaGroup(groupId, privateChannelIds, targetLanguage), MEDIA_GROUP_WAIT_MS);
      } else {
        const timer = setTimeout(() => flushMediaGroup(groupId, privateChannelIds, targetLanguage), MEDIA_GROUP_WAIT_MS);
        mediaGroupBuffer.set(groupId, { items: [item], timer });
      }

      return;
    }

    // Handle single messages
    await forwardSingleMessage(msg, privateChannelIds, targetLanguage);
  });

  logger.info(
    { sourceChannelIds, privateChannelIds },
    'Channel post forwarding configured',
  );
}

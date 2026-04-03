import { getBot } from '../services/telegramService.js';
import { isPaused } from './commandHandler.js';
import { isDuplicate } from '../services/deduplicationService.js';
import { addToForwardingQueue } from '../services/forwardingQueue.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import type { MediaGroupItem, BufferedMediaGroup } from '../types/index.js';

const MEDIA_GROUP_WAIT_MS = 2000;
const mediaGroupBuffer = new Map<string, BufferedMediaGroup>();

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

/**
 * Checks if a line is part of the source metadata footer.
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

/**
 * Strips source metadata footer from messages.
 */
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

function flushMediaGroup(
  mediaGroupId: string,
  privateChannelIds: string[],
  targetLanguage: string,
): void {
  const group = mediaGroupBuffer.get(mediaGroupId);
  if (!group) return;

  mediaGroupBuffer.delete(mediaGroupId);

  addToForwardingQueue({
    msg: {},
    privateChannelIds,
    targetLanguage,
    isMediaGroup: true,
    mediaGroupItems: group.items,
  });
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

    // Enqueue single message for sequential processing
    addToForwardingQueue({
      msg,
      privateChannelIds,
      targetLanguage,
    });
  });

  logger.info(
    { sourceChannelIds, privateChannelIds },
    'Channel post forwarding configured',
  );
}

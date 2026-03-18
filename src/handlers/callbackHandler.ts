import TelegramBot from 'node-telegram-bot-api';
import { getBot } from '../services/telegramService.js';
import { logger } from '../utils/logger.js';
import type { VoteCount } from '../types/index.js';

const votes = new Map<number, VoteCount>();

export function getInlineKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      { text: '👍 Relevante', callback_data: 'vote_relevant' },
      { text: '👎 No relevante', callback_data: 'vote_irrelevant' },
    ]],
  };
}

export function setupCallbackHandler(): void {
  const bot = getBot();

  bot.on('callback_query', async (query) => {
    if (!query.message || !query.data) return;

    const messageId = query.message.message_id;
    const chatId = query.message.chat.id;

    let count = votes.get(messageId);
    if (!count) {
      count = { relevant: 0, irrelevant: 0 };
      votes.set(messageId, count);
    }

    if (query.data === 'vote_relevant') {
      count.relevant++;
    } else if (query.data === 'vote_irrelevant') {
      count.irrelevant++;
    }

    try {
      await bot.answerCallbackQuery(query.id, { text: '¡Voto registrado!' });
      await bot.editMessageReplyMarkup(
        {
          inline_keyboard: [[
            { text: `👍 ${count.relevant}`, callback_data: 'vote_relevant' },
            { text: `👎 ${count.irrelevant}`, callback_data: 'vote_irrelevant' },
          ]],
        },
        { chat_id: chatId, message_id: messageId },
      );
    } catch (error) {
      logger.debug({ err: error, messageId }, 'Failed to update vote buttons');
    }

    // Clean old votes (keep last 500)
    if (votes.size > 500) {
      const keys = Array.from(votes.keys());
      for (let i = 0; i < keys.length - 500; i++) {
        votes.delete(keys[i]);
      }
    }
  });

  logger.info('Callback handler registered');
}

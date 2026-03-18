import { config } from './config/config.js';
import { forwardChannelPosts } from './handlers/messageHandler.js';
import { initializeBot } from './services/telegramService.js';
import { setupCommands } from './handlers/commandHandler.js';
import { setupCallbackHandler } from './handlers/callbackHandler.js';
import { startProcessing as startRetryQueue } from './services/retryQueue.js';
import { startScheduler } from './services/scheduledMessageService.js';
import { logger } from './utils/logger.js';

export async function main(): Promise<void> {
  try {
    initializeBot();
    setupCommands();

    if (config.showInlineButtons) {
      setupCallbackHandler();
    }

    forwardChannelPosts(config.sourceChannelIds, config.privateChannelIds, config.targetLanguage);
    startRetryQueue();
    startScheduler();

    logger.info('Bot is running!');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ err: error }, `Error starting bot: ${message}`);
    throw error;
  }
}

import express from 'express';
import { main as startBot } from './index.js';
import { stopBot } from './services/telegramService.js';
import { stopProcessing as stopRetryQueue, getQueueSize } from './services/retryQueue.js';
import { stopScheduler } from './services/scheduledMessageService.js';
import { getTranslationCacheSize } from './services/translationService.js';
import { getStats, getUptime } from './services/statsService.js';
import { getDeduplicationCacheSize } from './services/deduplicationService.js';
import { apiKeyAuth } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import { config } from './config/config.js';
import type { ApiResponse } from './types/index.js';

const app = express();
let botRunning = false;

app.use(express.json());

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'OK',
    data: {
      botRunning,
      uptime: getUptime(),
      translationCacheSize: getTranslationCacheSize(),
      retryQueueSize: getQueueSize(),
      deduplicationCacheSize: getDeduplicationCacheSize(),
    },
  });
});

// Stats endpoint (no auth required)
app.get('/stats', (_req, res) => {
  res.json({
    success: true,
    message: 'OK',
    data: getStats(),
  });
});

// Protected routes
app.post('/start-bot', apiKeyAuth, async (_req, res: express.Response<ApiResponse>, next) => {
  if (botRunning) {
    res.status(400).json({ success: false, message: 'Bot is already running' });
    return;
  }
  try {
    await startBot();
    botRunning = true;
    res.json({ success: true, message: 'Bot started successfully' });
  } catch (error) {
    next(error);
  }
});

app.post('/stop-bot', apiKeyAuth, (_req, res: express.Response<ApiResponse>, next) => {
  if (!botRunning) {
    res.status(400).json({ success: false, message: 'Bot is not running' });
    return;
  }
  try {
    stopBot();
    stopRetryQueue();
    stopScheduler();
    botRunning = false;
    res.json({ success: true, message: 'Bot stopped successfully' });
  } catch (error) {
    next(error);
  }
});

app.use(errorHandler);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, `Server is running on port ${config.port}`);
});

// Graceful shutdown
function gracefulShutdown(signal: string): void {
  logger.info({ signal }, `Received ${signal}, shutting down gracefully...`);

  if (botRunning) {
    stopBot();
    stopRetryQueue();
    stopScheduler();
    botRunning = false;
  }

  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

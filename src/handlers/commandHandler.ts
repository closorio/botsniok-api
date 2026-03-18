import { getBot, isAllowedUser, sendAndPinMessage } from '../services/telegramService.js';
import { getStats, getUptime } from '../services/statsService.js';
import { getQueueSize } from '../services/retryQueue.js';
import { getTranslationCacheSize } from '../services/translationService.js';
import { getDeduplicationCacheSize } from '../services/deduplicationService.js';
import { getSchedulerInfo } from '../services/scheduledMessageService.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

let paused = false;

export function isPaused(): boolean {
  return paused;
}

function authorize(msg: { chat: { id: number }; from?: { id: number } }): boolean {
  const userId = msg.from?.id;
  if (!userId || !isAllowedUser(userId)) {
    const bot = getBot();
    bot.sendMessage(msg.chat.id, 'No tienes permisos para usar este bot.');
    logger.warn({ userId, chatId: msg.chat.id }, 'Unauthorized command attempt');
    return false;
  }
  return true;
}

export function setupCommands(): void {
  const bot = getBot();

  bot.onText(/\/start/, (msg) => {
    if (!authorize(msg)) return;
    bot.sendMessage(msg.chat.id, '¿Qué pashó? ¡¡im online bby!!');
  });

  bot.onText(/\/help/, (msg) => {
    if (!authorize(msg)) return;
    const help = `*Comandos disponibles:*

/start \\- Verificar que el bot está online
/p \\<msg\\> \\- Enviar y fijar mensaje en canales destino
/status \\- Estado del bot
/stats \\- Estadísticas de uso
/sources \\- Canales fuente activos
/pause \\- Pausar reenvío de mensajes
/resume \\- Reanudar reenvío
/scheduled \\- Info de mensajes programados
/help \\- Este mensaje`;

    bot.sendMessage(msg.chat.id, help, { parse_mode: 'MarkdownV2' });
  });

  bot.onText(/\/status/, (msg) => {
    if (!authorize(msg)) return;
    const stats = getStats();
    const scheduler = getSchedulerInfo();

    const status = `🤖 *Estado del Bot*
━━━━━━━━━━━━━━━
▸ Estado: ${paused ? '⏸ Pausado' : '✅ Activo'}
▸ Uptime: ${getUptime()}
▸ Canales fuente: ${config.sourceChannelIds.length}
▸ Canales destino: ${config.privateChannelIds.length}
▸ Cola reintentos: ${getQueueSize()}
▸ Caché traducciones: ${getTranslationCacheSize()}
▸ Caché dedup: ${getDeduplicationCacheSize()}
▸ Msg programado: ${scheduler.enabled ? scheduler.time : 'Desactivado'}`;

    bot.sendMessage(msg.chat.id, status, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/stats/, (msg) => {
    if (!authorize(msg)) return;
    const stats = getStats();

    const statsMsg = `📊 *Estadísticas*
━━━━━━━━━━━━━━━
▸ Mensajes reenviados: ${stats.messagesForwarded}
▸ Media groups: ${stats.mediaGroupsForwarded}
▸ Traducciones: ${stats.translationsCount}
▸ Traducciones omitidas: ${stats.translationsSkipped}
▸ Duplicados omitidos: ${stats.duplicatesSkipped}
▸ Errores: ${stats.errorsCount}
▸ Reintentos: ${stats.retriesCount}
▸ Reintentos exitosos: ${stats.retriesSucceeded}
▸ Reintentos fallidos: ${stats.retriesFailed}
▸ Desde: hace ${getUptime()}`;

    bot.sendMessage(msg.chat.id, statsMsg, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/sources/, (msg) => {
    if (!authorize(msg)) return;
    const sources = config.sourceChannelIds
      .map((id, i) => `▸ Canal ${i + 1}: \`${id}\``)
      .join('\n');

    bot.sendMessage(msg.chat.id, `📡 *Canales fuente:*\n${sources}`, { parse_mode: 'Markdown' });
  });

  bot.onText(/\/pause/, (msg) => {
    if (!authorize(msg)) return;
    if (paused) {
      bot.sendMessage(msg.chat.id, '⏸ El reenvío ya está pausado.');
      return;
    }
    paused = true;
    logger.info('Message forwarding paused by user');
    bot.sendMessage(msg.chat.id, '⏸ Reenvío de mensajes pausado. Usa /resume para reanudar.');
  });

  bot.onText(/\/resume/, (msg) => {
    if (!authorize(msg)) return;
    if (!paused) {
      bot.sendMessage(msg.chat.id, '✅ El reenvío ya está activo.');
      return;
    }
    paused = false;
    logger.info('Message forwarding resumed by user');
    bot.sendMessage(msg.chat.id, '✅ Reenvío de mensajes reanudado.');
  });

  bot.onText(/\/p (.+)/, async (msg, match) => {
    if (!authorize(msg)) return;

    const content = match?.[1]?.trim();
    if (!content) {
      bot.sendMessage(msg.chat.id, '⚠️ Uso: /p <mensaje o URL>');
      return;
    }

    const channelIds = config.privateChannelIds;
    if (channelIds.length === 0) {
      bot.sendMessage(msg.chat.id, '⚠️ No hay canales destino configurados.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const channelId of channelIds) {
      try {
        await sendAndPinMessage(channelId, content);
        successCount++;
      } catch (error) {
        errorCount++;
        logger.error({ channelId, error }, 'Failed to pin message in channel');
      }
    }

    const result = successCount === channelIds.length
      ? `📌 Mensaje fijado en ${successCount}/${channelIds.length} canales.`
      : `📌 Fijado en ${successCount}/${channelIds.length} canales. ❌ ${errorCount} errores.`;

    bot.sendMessage(msg.chat.id, result);
  });

  bot.onText(/\/scheduled/, (msg) => {
    if (!authorize(msg)) return;
    const info = getSchedulerInfo();

    const scheduledMsg = info.enabled
      ? `⏰ *Mensaje programado*
━━━━━━━━━━━━━━━
▸ Estado: Activo
▸ Hora de envío: ${info.time}
▸ Último envío: ${info.lastSentDate || 'Nunca'}
▸ Fuente: Mensaje pineado del canal auxiliar`
      : '⏰ Mensajes programados desactivados (SCHEDULED\\_MESSAGE\\_TIME no configurado)';

    bot.sendMessage(msg.chat.id, scheduledMsg, { parse_mode: 'Markdown' });
  });

  logger.info('Bot commands registered');
}

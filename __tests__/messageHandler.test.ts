import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockOn = vi.fn();
const mockAddToForwardingQueue = vi.fn();

vi.mock('../src/services/telegramService.js', () => ({
  getBot: () => ({ on: mockOn }),
  sendTextMessage: vi.fn(),
  sendMedia: vi.fn(),
  sendMediaGroup: vi.fn(),
  sendLocation: vi.fn(),
  sendContact: vi.fn(),
  sendPoll: vi.fn(),
  initializeBot: vi.fn(),
  stopBot: vi.fn(),
  isAllowedUser: vi.fn(() => true),
}));

vi.mock('../src/services/forwardingQueue.js', () => ({
  addToForwardingQueue: (...args: unknown[]) => mockAddToForwardingQueue(...args),
}));

vi.mock('../src/handlers/commandHandler.js', () => ({
  isPaused: vi.fn(() => false),
}));

vi.mock('../src/services/deduplicationService.js', () => ({
  isDuplicate: vi.fn(() => false),
}));

vi.mock('../src/services/retryQueue.js', () => ({
  isRecoverableError: vi.fn(() => false),
  enqueue: vi.fn(),
}));

vi.mock('../src/services/statsService.js', () => ({
  incrementForwarded: vi.fn(),
  incrementMediaGroups: vi.fn(),
  incrementErrors: vi.fn(),
}));

vi.mock('../src/handlers/callbackHandler.js', () => ({
  getInlineKeyboard: vi.fn(() => undefined),
}));

vi.mock('../src/config/config.js', () => ({
  config: {
    showInlineButtons: false,
    sourceChannelIds: [-100123],
    privateChannelIds: ['-100456'],
    targetLanguage: 'es',
  },
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('MessageHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should register channel_post listener', async () => {
    const { forwardChannelPosts } = await import('../src/handlers/messageHandler.js');
    forwardChannelPosts([-100123], ['-100456'], 'es');
    expect(mockOn).toHaveBeenCalledWith('channel_post', expect.any(Function));
  });

  it('should enqueue text messages for forwarding', async () => {
    const { forwardChannelPosts } = await import('../src/handlers/messageHandler.js');
    forwardChannelPosts([-100123], ['-100456', '-100789'], 'es');

    const handler = mockOn.mock.calls[0][1];
    await handler({
      chat: { id: -100123 },
      text: 'Hello world',
    });

    expect(mockAddToForwardingQueue).toHaveBeenCalledTimes(1);
    expect(mockAddToForwardingQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.objectContaining({ text: 'Hello world' }),
        privateChannelIds: ['-100456', '-100789'],
        targetLanguage: 'es',
      }),
    );
  });

  it('should ignore messages from other channels', async () => {
    const { forwardChannelPosts } = await import('../src/handlers/messageHandler.js');
    forwardChannelPosts([-100123], ['-100456'], 'es');

    const handler = mockOn.mock.calls[0][1];
    await handler({
      chat: { id: -999999 },
      text: 'Should be ignored',
    });

    expect(mockAddToForwardingQueue).not.toHaveBeenCalled();
  });

  it('should enqueue photos with captions for forwarding', async () => {
    const { forwardChannelPosts } = await import('../src/handlers/messageHandler.js');
    forwardChannelPosts([-100123], ['-100456'], 'es');

    const handler = mockOn.mock.calls[0][1];
    await handler({
      chat: { id: -100123 },
      photo: [{ file_id: 'small' }, { file_id: 'large' }],
      caption: 'A photo',
    });

    expect(mockAddToForwardingQueue).toHaveBeenCalledTimes(1);
    expect(mockAddToForwardingQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: expect.objectContaining({
          photo: [{ file_id: 'small' }, { file_id: 'large' }],
          caption: 'A photo',
        }),
        privateChannelIds: ['-100456'],
        targetLanguage: 'es',
      }),
    );
  });

  it('should enqueue messages even for multiple channels', async () => {
    const { forwardChannelPosts } = await import('../src/handlers/messageHandler.js');
    forwardChannelPosts([-100123], ['-100456', '-100789'], 'es');

    const handler = mockOn.mock.calls[0][1];
    await handler({
      chat: { id: -100123 },
      photo: [{ file_id: 'test' }],
      caption: 'test',
    });

    // Should enqueue once with both channels (queue handles sequential delivery)
    expect(mockAddToForwardingQueue).toHaveBeenCalledTimes(1);
    expect(mockAddToForwardingQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        privateChannelIds: ['-100456', '-100789'],
      }),
    );
  });
});

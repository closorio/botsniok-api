import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSendTextMessage = vi.fn();
const mockSendMedia = vi.fn();
const mockSendMediaGroup = vi.fn();
const mockSendLocation = vi.fn();
const mockSendContact = vi.fn();
const mockSendPoll = vi.fn();
const mockOn = vi.fn();

vi.mock('../src/services/telegramService.js', () => ({
  getBot: () => ({ on: mockOn }),
  sendTextMessage: (...args: unknown[]) => mockSendTextMessage(...args),
  sendMedia: (...args: unknown[]) => mockSendMedia(...args),
  sendMediaGroup: (...args: unknown[]) => mockSendMediaGroup(...args),
  sendLocation: (...args: unknown[]) => mockSendLocation(...args),
  sendContact: (...args: unknown[]) => mockSendContact(...args),
  sendPoll: (...args: unknown[]) => mockSendPoll(...args),
  initializeBot: vi.fn(),
  stopBot: vi.fn(),
  isAllowedUser: vi.fn(() => true),
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

  it('should forward text messages to all private channels', async () => {
    const { forwardChannelPosts } = await import('../src/handlers/messageHandler.js');
    forwardChannelPosts([-100123], ['-100456', '-100789'], 'es');

    const handler = mockOn.mock.calls[0][1];
    await handler({
      chat: { id: -100123 },
      text: 'Hello world',
    });

    expect(mockSendTextMessage).toHaveBeenCalledTimes(2);
  });

  it('should ignore messages from other channels', async () => {
    const { forwardChannelPosts } = await import('../src/handlers/messageHandler.js');
    forwardChannelPosts([-100123], ['-100456'], 'es');

    const handler = mockOn.mock.calls[0][1];
    await handler({
      chat: { id: -999999 },
      text: 'Should be ignored',
    });

    expect(mockSendTextMessage).not.toHaveBeenCalled();
  });

  it('should forward photos with captions', async () => {
    const { forwardChannelPosts } = await import('../src/handlers/messageHandler.js');
    forwardChannelPosts([-100123], ['-100456'], 'es');

    const handler = mockOn.mock.calls[0][1];
    await handler({
      chat: { id: -100123 },
      photo: [{ file_id: 'small' }, { file_id: 'large' }],
      caption: 'A photo',
    });

    expect(mockSendMedia).toHaveBeenCalledWith(
      '-100456',
      { photo: { file_id: 'large' } },
      'A photo',
      'es',
      undefined,
    );
  });

  it('should continue processing other channels if one fails', async () => {
    mockSendMedia
      .mockRejectedValueOnce(new Error('Channel error'))
      .mockResolvedValueOnce(undefined);

    const { forwardChannelPosts } = await import('../src/handlers/messageHandler.js');
    forwardChannelPosts([-100123], ['-100456', '-100789'], 'es');

    const handler = mockOn.mock.calls[0][1];
    await handler({
      chat: { id: -100123 },
      photo: [{ file_id: 'test' }],
      caption: 'test',
    });

    expect(mockSendMedia).toHaveBeenCalledTimes(2);
  });
});

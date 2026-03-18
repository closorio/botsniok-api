import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('dotenv', () => ({
  config: vi.fn(),
}));

describe('Config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should throw if TELEGRAM_BOT_TOKEN is missing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', '');
    vi.stubEnv('AUX_CHANNEL_ID', '-100123');
    vi.stubEnv('PRIVATE_CHANNEL_IDS', '-100456');
    vi.stubEnv('API_KEY', 'test-key');
    vi.stubEnv('ALLOWED_TELEGRAM_IDS', '123');
    delete process.env.TELEGRAM_BOT_TOKEN;

    await expect(
      import('../src/config/config.js'),
    ).rejects.toThrow('Missing required environment variable: TELEGRAM_BOT_TOKEN');
  });

  it('should throw if no source channel is configured', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('PRIVATE_CHANNEL_IDS', '-100456');
    vi.stubEnv('API_KEY', 'test-key');
    vi.stubEnv('ALLOWED_TELEGRAM_IDS', '123');
    delete process.env.AUX_CHANNEL_ID;
    delete process.env.SOURCE_CHANNEL_IDS;

    await expect(
      import('../src/config/config.js'),
    ).rejects.toThrow('Missing required environment variable: SOURCE_CHANNEL_IDS (or AUX_CHANNEL_ID)');
  });

  it('should throw if API_KEY is missing', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('AUX_CHANNEL_ID', '-100123');
    vi.stubEnv('PRIVATE_CHANNEL_IDS', '-100456');
    vi.stubEnv('API_KEY', '');
    vi.stubEnv('ALLOWED_TELEGRAM_IDS', '123');
    delete process.env.API_KEY;

    await expect(
      import('../src/config/config.js'),
    ).rejects.toThrow('Missing required environment variable: API_KEY');
  });

  it('should parse config correctly with SOURCE_CHANNEL_IDS', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('SOURCE_CHANNEL_IDS', '-100123,-100456');
    vi.stubEnv('PRIVATE_CHANNEL_IDS', '-100789,-100111');
    vi.stubEnv('API_KEY', 'test-key');
    vi.stubEnv('ALLOWED_TELEGRAM_IDS', '111,222');
    vi.stubEnv('TARGET_LANGUAGE', 'en');
    vi.stubEnv('SHOW_INLINE_BUTTONS', 'true');

    const { config } = await import('../src/config/config.js');

    expect(config.telegramBotToken).toBe('test-token');
    expect(config.sourceChannelIds).toEqual([-100123, -100456]);
    expect(config.privateChannelIds).toEqual(['-100789', '-100111']);
    expect(config.apiKey).toBe('test-key');
    expect(config.allowedTelegramIds.has(111)).toBe(true);
    expect(config.allowedTelegramIds.has(222)).toBe(true);
    expect(config.targetLanguage).toBe('en');
    expect(config.showInlineButtons).toBe(true);
  });

  it('should use AUX_CHANNEL_ID as fallback', async () => {
    vi.stubEnv('TELEGRAM_BOT_TOKEN', 'test-token');
    vi.stubEnv('AUX_CHANNEL_ID', '-100999');
    vi.stubEnv('PRIVATE_CHANNEL_IDS', '-100456');
    vi.stubEnv('API_KEY', 'test-key');
    vi.stubEnv('ALLOWED_TELEGRAM_IDS', '123');
    delete process.env.SOURCE_CHANNEL_IDS;
    delete process.env.TARGET_LANGUAGE;

    const { config } = await import('../src/config/config.js');
    expect(config.sourceChannelIds).toEqual([-100999]);
    expect(config.targetLanguage).toBe('es');
  });
});

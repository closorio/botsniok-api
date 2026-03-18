import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/config/config.js', () => ({
  config: {
    telegramBotToken: 'test-token',
    auxChannelId: -100123,
    privateChannelIds: ['-100456'],
    targetLanguage: 'es',
    apiKey: 'test-key',
    allowedTelegramIds: new Set([123]),
    port: 3000,
    nodeEnv: 'test',
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

const mockTranslate = vi.fn();

vi.mock('module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('module')>();
  return {
    ...actual,
    createRequire: () => () => ({
      v2: {
        Translate: class {
          translate = mockTranslate;
        },
      },
    }),
  };
});

describe('TranslationService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockTranslate.mockImplementation(async (text: string) => [`translated_${text}`]);
    const { clearTranslationCache } = await import('../src/services/translationService.js');
    clearTranslationCache();
  });

  it('should translate text', async () => {
    const { translateText } = await import('../src/services/translationService.js');
    const result = await translateText('hello', 'es');
    expect(result).toBe('translated_hello');
    expect(mockTranslate).toHaveBeenCalledWith('hello', 'es');
  });

  it('should cache translations and avoid duplicate API calls', async () => {
    const { translateText } = await import('../src/services/translationService.js');

    await translateText('cached_test', 'es');
    await translateText('cached_test', 'es');

    // Should only call the API once
    expect(mockTranslate).toHaveBeenCalledTimes(1);
  });

  it('should clear cache', async () => {
    const { translateText, clearTranslationCache, getTranslationCacheSize } = await import('../src/services/translationService.js');

    await translateText('to_clear', 'es');
    expect(getTranslationCacheSize()).toBe(1);

    clearTranslationCache();
    expect(getTranslationCacheSize()).toBe(0);
  });

  it('should throw and log on translation error', async () => {
    mockTranslate.mockRejectedValueOnce(new Error('API error'));
    const { translateText } = await import('../src/services/translationService.js');

    await expect(translateText('fail', 'es')).rejects.toThrow('API error');
  });
});

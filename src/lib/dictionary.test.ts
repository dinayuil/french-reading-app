import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookupFrToZh } from './dictionary';

describe('lookupFrToZh', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(body: unknown, ok = true) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        return {
          ok,
          status: ok ? 200 : 500,
          url,
          json: async () => body,
        } as Response;
      }),
    );
  }

  it('returns translated text for a valid response', async () => {
    stubFetch({ responseData: { translatedText: '  埃菲尔铁塔  ' } });

    const result = await lookupFrToZh('tour Eiffel');

    expect(result).toBe('埃菲尔铁塔');
  });

  it('includes langpair=fr|zh-CN in the request URL', async () => {
    stubFetch({ responseData: { translatedText: '巴黎' } });

    await lookupFrToZh('Paris');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('langpair=fr|zh-CN');
    expect(url).toContain('q=Paris');
  });

  it('returns null on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const result = await lookupFrToZh('bonjour');

    expect(result).toBeNull();
  });

  it('returns null on non-ok response', async () => {
    stubFetch({}, false);

    const result = await lookupFrToZh('chat');

    expect(result).toBeNull();
  });

  it('returns null for empty or whitespace text', async () => {
    stubFetch({ responseData: { translatedText: 'ignored' } });

    expect(await lookupFrToZh('')).toBeNull();
    expect(await lookupFrToZh('   ')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns null when translatedText is missing', async () => {
    stubFetch({ responseData: {} });

    const result = await lookupFrToZh('chien');

    expect(result).toBeNull();
  });
});

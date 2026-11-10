const API_URL = 'https://api.mymemory.translated.net/get';
const TIMEOUT_MS = 8_000;

export async function lookupFrToZh(
  text: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), TIMEOUT_MS);

  if (signal) {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const url = `${API_URL}?q=${encodeURIComponent(trimmed)}&langpair=fr|zh-CN`;
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) return null;

    const data = (await response.json()) as {
      responseData?: { translatedText?: string };
    };
    const translated = data.responseData?.translatedText?.trim();
    return translated || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

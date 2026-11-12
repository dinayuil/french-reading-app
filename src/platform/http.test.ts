import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativeApp: vi.fn(),
  request: vi.fn(),
}));

vi.mock('./runtime', () => ({
  isNativeApp: mocks.isNativeApp,
}));

vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { request: mocks.request },
}));

import { nativeHttpRequest } from './http';

describe('nativeHttpRequest', () => {
  beforeEach(() => {
    mocks.isNativeApp.mockReset();
    mocks.request.mockReset();
  });

  it('rejects web callers before touching native HTTP', async () => {
    mocks.isNativeApp.mockReturnValue(false);
    const originalFetch = globalThis.fetch;

    await expect(
      nativeHttpRequest({
        url: 'https://example.test/progress.json',
        method: 'GET',
        headers: {},
      }),
    ).rejects.toMatchObject({ code: 'nativeOnly' });

    expect(mocks.request).not.toHaveBeenCalled();
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it('sends an explicit GET with redirects disabled and timeouts', async () => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.request.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: '{"ok":true}',
      url: 'https://example.test/progress.json',
    });
    const headers = { Authorization: 'Basic abc' };

    const response = await nativeHttpRequest({
      url: 'https://example.test/progress.json',
      method: 'GET',
      headers,
    });

    expect(mocks.request).toHaveBeenCalledTimes(1);
    const request = mocks.request.mock.calls[0][0] as {
      url: string;
      method: string;
      headers: Record<string, string>;
      data?: string;
      disableRedirects: boolean;
      connectTimeout: number;
      readTimeout: number;
    };
    expect(request).toMatchObject({
      url: 'https://example.test/progress.json',
      method: 'GET',
      headers,
      disableRedirects: true,
    });
    expect(request.data).toBeUndefined();
    expect(request.connectTimeout).toBeGreaterThan(0);
    expect(request.readTimeout).toBeGreaterThan(0);
    expect(response).toEqual({
      status: 200,
      headers: { 'content-type': 'application/json' },
      data: '{"ok":true}',
    });
  });

  it('sends an explicit PUT body without changing it', async () => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.request.mockResolvedValue({
      status: 201,
      headers: { etag: '"v1"' },
      data: 'created',
      url: 'https://example.test/progress.json',
    });
    const body = '{"format":"frp-study-backup","version":1}';

    await nativeHttpRequest({
      url: 'https://example.test/progress.json',
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: body,
    });

    const request = mocks.request.mock.calls[0][0] as {
      method: string;
      data?: string;
    };
    expect(request.method).toBe('PUT');
    expect(request.data).toBe(body);
  });

  it('passes string responses through unchanged', async () => {
    mocks.isNativeApp.mockReturnValue(true);
    const headers = { etag: 'W/"weak"' };
    mocks.request.mockResolvedValue({
      status: 200,
      headers,
      data: 'not json',
      url: 'https://example.test/progress.json',
    });

    const response = await nativeHttpRequest({
      url: 'https://example.test/progress.json',
      method: 'GET',
      headers: {},
    });

    expect(response).toEqual({ status: 200, headers, data: 'not json' });
  });

  it('passes object responses through unchanged', async () => {
    mocks.isNativeApp.mockReturnValue(true);
    const data = { format: 'frp-study-backup', version: 1 };
    mocks.request.mockResolvedValue({
      status: 200,
      headers: {},
      data,
      url: 'https://example.test/progress.json',
    });

    const response = await nativeHttpRequest({
      url: 'https://example.test/progress.json',
      method: 'GET',
      headers: {},
    });

    expect(response).toEqual({ status: 200, headers: {}, data });
    expect(response.data).toBe(data);
  });
});

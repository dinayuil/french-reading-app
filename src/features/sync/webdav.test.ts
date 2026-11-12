import { describe, expect, it, vi } from 'vitest';
import type { StudyBackup } from '../data/backup';
import type { NativeHttpRequest, NativeHttpResponse } from '../../platform/http';
import {
  WebDavError,
  syncWebDavWithDeps,
  type WebDavConfig,
  type WebDavDeps,
} from './webdav';

const CONFIG: WebDavConfig = {
  url: 'https://dav.example.com/books/',
  username: 'reader',
  password: 'top-secret-password',
};

function backup(marker: string): StudyBackup {
  return { marker } as unknown as StudyBackup;
}

function response(
  status: number,
  options: { data?: unknown; headers?: Record<string, string> } = {},
): NativeHttpResponse {
  return {
    status,
    headers: options.headers ?? {},
    data: options.data ?? '',
  };
}

type Handler = (request: NativeHttpRequest) => Promise<NativeHttpResponse>;

function sequence(...responses: Array<NativeHttpResponse | Error>): Handler {
  let index = 0;
  return async () => {
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (next instanceof Error) throw next;
    return next;
  };
}

function basicAuthValue(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

interface HarnessOptions {
  native?: boolean;
  request?: Handler;
  createBackup?: () => StudyBackup;
  parseBackup?: (input: string | unknown) => StudyBackup;
  mergeBackups?: (local: StudyBackup, remote: StudyBackup) => StudyBackup;
  applyBackup?: (backup: StudyBackup, mode: 'merge' | 'replace') => void;
}

function createHarness(options: HarnessOptions = {}) {
  const request = vi.fn<Handler>(options.request ?? (async () => response(500)));
  const createBackup = vi.fn<() => StudyBackup>(
    options.createBackup ?? (() => backup('local')),
  );
  const parseBackup = vi.fn<(input: string | unknown) => StudyBackup>(
    options.parseBackup ??
      ((input: string | unknown) => {
        const value = typeof input === 'string' ? JSON.parse(input) : input;
        return value as StudyBackup;
      }),
  );
  const mergeBackups = vi.fn<
    (local: StudyBackup, remote: StudyBackup) => StudyBackup
  >(options.mergeBackups ?? ((_local, remote) => remote));
  const applyBackup = vi.fn<(backup: StudyBackup, mode: 'merge' | 'replace') => void>(
    options.applyBackup ?? (() => undefined),
  );

  const deps: WebDavDeps = {
    isNativeApp: () => options.native ?? true,
    nativeHttpRequest: request,
    createBackup,
    parseBackup,
    mergeBackups,
    applyBackup,
  };

  return { deps, request, createBackup, parseBackup, mergeBackups, applyBackup };
}

function requests(harness: ReturnType<typeof createHarness>): NativeHttpRequest[] {
  return harness.request.mock.calls.map(([request]) => request);
}

async function errorOf(promise: Promise<unknown>): Promise<WebDavError> {
  try {
    await promise;
  } catch (error) {
    return error as WebDavError;
  }
  throw new Error('Expected syncWebDavWithDeps to reject');
}

describe('syncWebDavWithDeps', () => {
  it('refuses web/PWA callers before any network request', async () => {
    const harness = createHarness({ native: false });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error).toBeInstanceOf(WebDavError);
    expect(error.code).toBe('nativeOnly');
    expect(harness.request).not.toHaveBeenCalled();
  });

  it('applies the native gate before URL validation', async () => {
    const harness = createHarness({ native: false });

    const error = await errorOf(
      syncWebDavWithDeps({ ...CONFIG, url: 'http://insecure.test/books/' }, harness.deps),
    );

    expect(error.code).toBe('nativeOnly');
    expect(harness.request).not.toHaveBeenCalled();
  });

  const invalidUrls: Array<[string, string]> = [
    ['http://dav.example.com/books/', 'non-HTTPS'],
    ['https://user:secret@dav.example.com/books/', 'user info'],
    ['https://dav.example.com/books/?token=secret', 'query'],
    ['https://dav.example.com/books/#fragment', 'fragment'],
    ['not a url', 'malformed'],
  ];

  it.each(invalidUrls)('rejects %s (%s) without sending credentials', async (url) => {
    const harness = createHarness();

    const error = await errorOf(syncWebDavWithDeps({ ...CONFIG, url }, harness.deps));

    expect(error.code).toBe('invalidUrl');
    expect(error.message).not.toContain('secret');
    expect(harness.request).not.toHaveBeenCalled();
  });

  it('creates the fixed file in an existing directory with UTF-8 Basic auth', async () => {
    const local = backup('local');
    const harness = createHarness({
      createBackup: () => local,
      request: sequence(response(404), response(201)),
    });
    const config: WebDavConfig = {
      url: 'https://dav.example.com/books/',
      username: 'üser',
      password: 'pässwörd',
    };

    const result = await syncWebDavWithDeps(config, harness.deps);

    expect(result.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const [getRequest, putRequest] = requests(harness);
    expect(getRequest).toMatchObject({
      url: 'https://dav.example.com/books/french-reading-progress.json',
      method: 'GET',
    });
    expect(getRequest.headers.Authorization).toBe(basicAuthValue('üser:pässwörd'));
    expect(putRequest).toMatchObject({
      url: 'https://dav.example.com/books/french-reading-progress.json',
      method: 'PUT',
    });
    expect(putRequest.headers.Authorization).toBe(basicAuthValue('üser:pässwörd'));
    expect(putRequest.headers['Content-Type']).toContain('application/json');
    expect(putRequest.headers['If-None-Match']).toBe('*');
    expect(putRequest.headers['If-Match']).toBeUndefined();
    expect(JSON.parse(putRequest.data as string)).toEqual(local);
    expect(harness.parseBackup).not.toHaveBeenCalled();
    expect(harness.applyBackup).toHaveBeenCalledWith(local, 'merge');
  });

  it('appends the fixed file name without doubling the path separator', async () => {
    const harness = createHarness({
      request: sequence(response(404), response(201)),
    });

    await syncWebDavWithDeps({ ...CONFIG, url: 'https://dav.example.com/books' }, harness.deps);

    expect(requests(harness)[0].url).toBe(
      'https://dav.example.com/books/french-reading-progress.json',
    );
  });

  it('merges an object response and updates it with If-Match', async () => {
    const local = backup('local');
    const remote = backup('remote');
    const merged = backup('merged');
    const harness = createHarness({
      createBackup: () => local,
      mergeBackups: () => merged,
      request: sequence(
        response(200, { data: remote, headers: { ETag: '"v1"' } }),
        response(200),
      ),
    });

    const result = await syncWebDavWithDeps(CONFIG, harness.deps);

    expect(result.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(harness.parseBackup).toHaveBeenCalledWith(remote);
    expect(harness.mergeBackups).toHaveBeenCalledWith(local, remote);
    const [getRequest, putRequest] = requests(harness);
    expect(getRequest.method).toBe('GET');
    expect(putRequest.method).toBe('PUT');
    expect(putRequest.headers['If-Match']).toBe('"v1"');
    expect(putRequest.headers['If-None-Match']).toBeUndefined();
    expect(JSON.parse(putRequest.data as string)).toEqual(merged);
    expect(harness.applyBackup).toHaveBeenCalledWith(merged, 'merge');
  });

  it('accepts a JSON string response', async () => {
    const remote = backup('remote');
    const serialized = JSON.stringify(remote);
    const harness = createHarness({
      request: sequence(
        response(200, { data: serialized, headers: { ETag: '"string-response"' } }),
        response(204),
      ),
    });

    await syncWebDavWithDeps(CONFIG, harness.deps);

    expect(harness.parseBackup).toHaveBeenCalledWith(serialized);
    expect(requests(harness)[1].headers['If-Match']).toBe('"string-response"');
  });

  it('reads strong ETag headers case-insensitively and preserves their value', async () => {
    const harness = createHarness({
      request: sequence(
        response(200, { data: backup('remote'), headers: { eTaG: '"MiXeD-Case"' } }),
        response(204),
      ),
    });

    await syncWebDavWithDeps(CONFIG, harness.deps);

    expect(requests(harness)[1].headers['If-Match']).toBe('"MiXeD-Case"');
  });

  it.each([undefined, 'W/"v1"', 'w/"v1"', 'v1', ''])(
    'rejects a missing, weak or malformed ETag %s',
    async (etag) => {
      const headers: Record<string, string> = etag === undefined ? {} : { ETag: etag };
      const harness = createHarness({
        request: sequence(response(200, { data: backup('remote'), headers })),
      });

      const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

      expect(error.code).toBe('unsupportedServer');
      expect(harness.request).toHaveBeenCalledTimes(1);
      expect(harness.applyBackup).not.toHaveBeenCalled();
    },
  );

  it('re-reads local data and retries on 409/412 before succeeding', async () => {
    const locals = [backup('local-1'), backup('local-2'), backup('local-3')];
    const merged = [backup('merged-1'), backup('merged-2'), backup('merged-3')];
    let createIndex = 0;
    let mergeIndex = 0;
    const harness = createHarness({
      createBackup: () => locals[createIndex++],
      mergeBackups: () => merged[mergeIndex++],
      request: sequence(
        response(200, { data: backup('remote-1'), headers: { ETag: '"v1"' } }),
        response(412),
        response(200, { data: backup('remote-2'), headers: { ETag: '"v2"' } }),
        response(409),
        response(200, { data: backup('remote-3'), headers: { ETag: '"v3"' } }),
        response(204),
      ),
    });

    const result = await syncWebDavWithDeps(CONFIG, harness.deps);

    expect(result.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(harness.createBackup).toHaveBeenCalledTimes(3);
    expect(harness.mergeBackups).toHaveBeenCalledTimes(3);
    expect(harness.mergeBackups.mock.calls[1][0]).toBe(locals[1]);
    expect(harness.mergeBackups.mock.calls[2][0]).toBe(locals[2]);
    expect(harness.applyBackup).toHaveBeenCalledTimes(1);
    expect(harness.applyBackup).toHaveBeenCalledWith(merged[2], 'merge');
    const sent = requests(harness);
    expect(sent).toHaveLength(6);
    expect(sent[1].headers['If-Match']).toBe('"v1"');
    expect(sent[3].headers['If-Match']).toBe('"v2"');
    expect(sent[5].headers['If-Match']).toBe('"v3"');
  });

  it('fails with conflict after two re-read and merge retries', async () => {
    const harness = createHarness({
      request: sequence(
        response(200, { data: backup('remote-1'), headers: { ETag: '"v1"' } }),
        response(412),
        response(200, { data: backup('remote-2'), headers: { ETag: '"v2"' } }),
        response(409),
        response(200, { data: backup('remote-3'), headers: { ETag: '"v3"' } }),
        response(412),
      ),
    });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('conflict');
    expect(harness.request).toHaveBeenCalledTimes(6);
    expect(harness.createBackup).toHaveBeenCalledTimes(3);
    expect(harness.applyBackup).not.toHaveBeenCalled();
  });

  it('re-reads and merges when a safe create loses a race', async () => {
    const local = backup('local');
    const merged = backup('merged');
    const harness = createHarness({
      createBackup: () => local,
      mergeBackups: () => merged,
      request: sequence(
        response(404),
        response(412),
        response(200, { data: backup('remote'), headers: { ETag: '"raced"' } }),
        response(204),
      ),
    });

    await syncWebDavWithDeps(CONFIG, harness.deps);

    const sent = requests(harness);
    expect(sent).toHaveLength(4);
    expect(sent[1].headers['If-None-Match']).toBe('*');
    expect(sent[3].headers['If-Match']).toBe('"raced"');
    expect(JSON.parse(sent[3].data as string)).toEqual(merged);
    expect(harness.applyBackup).toHaveBeenCalledWith(merged, 'merge');
  });

  it.each([404, 409])(
    'reports remoteMissingDirectory when creation keeps failing with %i',
    async (status) => {
      const responses = Array.from({ length: 6 }, (_, index) =>
        index % 2 === 0 ? response(404) : response(status),
      );
      const harness = createHarness({ request: sequence(...responses) });

      const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

      expect(error.code).toBe('remoteMissingDirectory');
      expect(harness.request).toHaveBeenCalledTimes(6);
      expect(harness.applyBackup).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403])('maps GET %i to auth without leaking credentials', async (status) => {
    const harness = createHarness({
      request: sequence(response(status, { data: 'Authorization: Basic sekrit' })),
    });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('auth');
    expect(error.message).not.toContain(CONFIG.password);
    expect(error.message).not.toContain('Authorization');
    expect(String(error)).not.toContain('sekrit');
  });

  it('maps a PUT 403 to auth and does not apply local data', async () => {
    const harness = createHarness({
      request: sequence(
        response(200, { data: backup('remote'), headers: { ETag: '"v1"' } }),
        response(403),
      ),
    });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('auth');
    expect(harness.applyBackup).not.toHaveBeenCalled();
  });

  it('rejects an invalid remote backup without writing or applying it', async () => {
    const harness = createHarness({
      parseBackup: () => {
        throw new Error('invalid backup containing top-secret-password');
      },
      request: sequence(response(200, { data: { bad: true }, headers: { ETag: '"v1"' } })),
    });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('invalidRemote');
    expect(error.message).not.toContain(CONFIG.password);
    expect(harness.request).toHaveBeenCalledTimes(1);
    expect(harness.mergeBackups).not.toHaveBeenCalled();
    expect(harness.applyBackup).not.toHaveBeenCalled();
  });

  it.each([405, 501])('maps GET %i to unsupportedServer', async (status) => {
    const harness = createHarness({ request: sequence(response(status)) });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('unsupportedServer');
    expect(harness.request).toHaveBeenCalledTimes(1);
  });

  it('maps a PUT 405 to unsupportedServer', async () => {
    const harness = createHarness({
      request: sequence(
        response(200, { data: backup('remote'), headers: { ETag: '"v1"' } }),
        response(405),
      ),
    });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('unsupportedServer');
    expect(harness.applyBackup).not.toHaveBeenCalled();
  });

  it('maps transport exceptions to network without leaking raw details', async () => {
    const harness = createHarness({
      request: async () => {
        throw new Error(`Authorization: Basic ${CONFIG.password} / secret`);
      },
    });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('network');
    expect(error.message).not.toContain(CONFIG.password);
    expect(error.message).not.toContain('Authorization');
    expect(String(error)).not.toContain(CONFIG.password);
  });

  it.each([500, 503])('maps HTTP %i to network', async (status) => {
    const harness = createHarness({ request: sequence(response(status)) });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('network');
  });

  it('reports storage failures after a successful PUT instead of success', async () => {
    const harness = createHarness({
      request: sequence(response(404), response(201)),
      applyBackup: () => {
        throw new Error('QuotaExceededError containing top-secret-password');
      },
    });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('storage');
    expect(error.message).not.toContain(CONFIG.password);
    expect(harness.request).toHaveBeenCalledTimes(2);
  });

  it('does not send a create request when reading local data fails', async () => {
    const harness = createHarness({
      createBackup: () => {
        throw new Error('QuotaExceededError');
      },
      request: sequence(response(404)),
    });

    const error = await errorOf(syncWebDavWithDeps(CONFIG, harness.deps));

    expect(error.code).toBe('storage');
    expect(harness.request).toHaveBeenCalledTimes(1);
  });
});

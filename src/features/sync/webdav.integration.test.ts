import { beforeEach, describe, expect, it } from 'vitest';
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  applyBackup,
  createBackup,
  getStudySummary,
  mergeBackups,
  parseBackup,
  readStudyData,
} from '../data/backup';
import { savePracticeSession, saveReadingSession } from '../data/studyData';
import { DEFAULT_SETTINGS } from '../../lib/settings';
import type { PracticeSession, ReadingSession } from '../../types/progress';
import type { NativeHttpRequest, NativeHttpResponse } from '../../platform/http';
import type { StudyBackup } from '../data/backup';
import {
  syncWebDavWithDeps,
  type WebDavConfig,
  type WebDavDeps,
} from './webdav';

const T1 = '2026-11-10T09:00:00.000Z';
const T2 = '2026-11-11T09:00:00.000Z';
const T3 = '2026-11-12T09:00:00.000Z';
const FIXTURE_ORIGIN = 'https://fixture.invalid';
const FIXTURE_PATH = '/directory/french-reading-progress.json';

const CONFIG: WebDavConfig = {
  url: `${FIXTURE_ORIGIN}/directory`,
  username: 'fixture-reader',
  password: 'fixture-session-password',
};

const EXPECTED_AUTHORIZATION = (() => {
  const bytes = new TextEncoder().encode(
    `${CONFIG.username}:${CONFIG.password}`,
  );
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
})();

type StoredReadingSession = ReadingSession & { id: string };
type StoredPracticeSession = PracticeSession & { id: string };

interface RecordedRequest {
  method: string;
  path: string;
  authorizationMatches: boolean;
  ifMatch: string | undefined;
  ifNoneMatch: string | undefined;
  body: string | undefined;
}

interface FixtureState {
  remote: StudyBackup | null;
  etag: string | null;
  etagVersion: number;
  injected: boolean;
  requests: RecordedRequest[];
}

interface FixtureOptions {
  initialRemote?: StudyBackup | null;
  injectOnFirstConditionalPut?: StudyBackup;
  objectResponses?: boolean;
}

interface TestWebDavFixture {
  origin: string;
  port: number;
  requests: RecordedRequest[];
  objectResponses: boolean;
  readonly remote: StudyBackup | null;
}

function readingSession(
  id: string,
  articleId: string,
  startedAt: string,
  durationMs: number,
): StoredReadingSession {
  return { id, articleId, startedAt, durationMs };
}

function practiceSession(
  id: string,
  articleId: string,
  startedAt: string,
  durationMs: number,
): StoredPracticeSession {
  return {
    id,
    articleId,
    startedAt,
    durationMs,
    score: 1,
    total: 2,
    answers: [],
    markedWords: [],
  };
}

function makeBackup(
  readingSessions: StoredReadingSession[] = [],
  practiceSessions: StoredPracticeSession[] = [],
): StudyBackup {
  return {
    format: 'frp-study-backup',
    version: 1,
    exportedAt: T3,
    data: {
      readingSessions,
      practiceSessions,
      readingProgress: [],
      settings: { ...DEFAULT_SETTINGS },
    },
  };
}

function ids(items: Array<{ id?: string }>): string[] {
  return items.map((item) => item.id ?? '').sort();
}

function requestHeader(
  request: IncomingMessage,
  name: string,
): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function advanceEtag(state: FixtureState): void {
  state.etagVersion += 1;
  state.etag = `"fixture-${state.etagVersion}"`;
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function handleFixtureRequest(
  state: FixtureState,
  options: FixtureOptions,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? '';
  const path = request.url ?? '';
  const body = method === 'PUT' ? await readBody(request) : undefined;

  state.requests.push({
    method,
    path,
    authorizationMatches:
      requestHeader(request, 'authorization') === EXPECTED_AUTHORIZATION,
    ifMatch: requestHeader(request, 'if-match'),
    ifNoneMatch: requestHeader(request, 'if-none-match'),
    body,
  });

  if (method === 'GET') {
    if (state.remote === null) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      ETag: state.etag as string,
    });
    response.end(JSON.stringify(state.remote));
    return;
  }

  if (method === 'PUT') {
    const ifMatch = requestHeader(request, 'if-match');
    const ifNoneMatch = requestHeader(request, 'if-none-match');

    // Simulate another device writing between the read and the first
    // conditional write. The sync must re-read this record, not overwrite it.
    if (
      options.injectOnFirstConditionalPut &&
      !state.injected &&
      ifMatch !== undefined &&
      state.remote !== null
    ) {
      state.injected = true;
      state.remote = mergeBackups(
        state.remote,
        options.injectOnFirstConditionalPut,
      );
      advanceEtag(state);
      response.writeHead(412);
      response.end();
      return;
    }

    if (ifNoneMatch === '*') {
      if (state.remote !== null) {
        response.writeHead(412);
        response.end();
        return;
      }
      state.remote = parseBackup(body as string);
      advanceEtag(state);
      response.writeHead(201, { ETag: state.etag as string });
      response.end();
      return;
    }

    if (ifMatch !== undefined) {
      if (
        state.remote === null ||
        state.etag === null ||
        ifMatch !== state.etag
      ) {
        response.writeHead(412);
        response.end();
        return;
      }
      state.remote = parseBackup(body as string);
      advanceEtag(state);
      response.writeHead(204, { ETag: state.etag as string });
      response.end();
      return;
    }

    response.writeHead(428);
    response.end();
    return;
  }

  response.writeHead(405);
  response.end();
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function withTestServer(
  options: FixtureOptions,
  run: (fixture: TestWebDavFixture) => Promise<void>,
): Promise<void> {
  const state: FixtureState = {
    remote: options.initialRemote ?? null,
    etag: options.initialRemote ? '"fixture-1"' : null,
    etagVersion: options.initialRemote ? 1 : 0,
    injected: false,
    requests: [],
  };
  const server = createServer((request, response) => {
    void handleFixtureRequest(state, options, request, response).catch(() => {
      if (!response.headersSent) {
        response.writeHead(500, { 'Content-Type': 'text/plain' });
      }
      response.end('fixture failure');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const fixture: TestWebDavFixture = {
    origin: `http://127.0.0.1:${address.port}`,
    port: address.port,
    requests: state.requests,
    objectResponses: options.objectResponses ?? false,
    get remote() {
      return state.remote;
    },
  };

  try {
    await run(fixture);
  } finally {
    await closeServer(server);
  }
}

function requestLocal(
  fixture: TestWebDavFixture,
  request: NativeHttpRequest,
): Promise<NativeHttpResponse> {
  return new Promise((resolve, reject) => {
    const localRequest = httpRequest(
      {
        hostname: '127.0.0.1',
        port: fixture.port,
        path: FIXTURE_PATH,
        method: request.method,
        headers: request.headers,
        agent: false,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          const headers: Record<string, string> = {};
          for (const [name, value] of Object.entries(response.headers)) {
            if (typeof value === 'string') headers[name] = value;
            else if (Array.isArray(value)) headers[name] = value.join(', ');
          }
          resolve({
            status: response.statusCode ?? 0,
            headers,
            data: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    localRequest.on('error', reject);
    if (request.data !== undefined) localRequest.write(request.data);
    localRequest.end();
  });
}

function realDeps(fixture: TestWebDavFixture): WebDavDeps {
  return {
    isNativeApp: () => true,
    nativeHttpRequest: async (request) => {
      const target = new URL(request.url);
      if (
        target.origin !== FIXTURE_ORIGIN ||
        target.pathname !== FIXTURE_PATH
      ) {
        throw new Error('Integration test blocked a non-fixture WebDAV request.');
      }
      const response = await requestLocal(fixture, request);
      if (
        fixture.objectResponses &&
        request.method === 'GET' &&
        response.status === 200
      ) {
        return { ...response, data: JSON.parse(response.data as string) };
      }
      return response;
    },
    createBackup,
    parseBackup,
    mergeBackups,
    applyBackup,
  };
}

function sync(fixture: TestWebDavFixture): Promise<{ syncedAt: string }> {
  return syncWebDavWithDeps(CONFIG, realDeps(fixture));
}

describe('WebDAV sync with real backup storage and a local WebDAV fixture', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('unions local and remote sessions through real merge/apply and stays idempotent', async () => {
    const remoteBackup = makeBackup(
      [readingSession('reading-remote', 'article-remote', T2, 2_000)],
      [practiceSession('practice-remote', 'article-remote', T2, 700)],
    );

    await withTestServer(
      { initialRemote: remoteBackup, objectResponses: true },
      async (fixture) => {
      saveReadingSession(
        readingSession('reading-local', 'article-local', T1, 1_000),
      );
      savePracticeSession(
        practiceSession('practice-local', 'article-local', T1, 500),
      );

      const first = await sync(fixture);
      expect(first.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const afterFirst = readStudyData();
      expect(ids(afterFirst.readingSessions)).toEqual([
        'reading-local',
        'reading-remote',
      ]);
      expect(ids(afterFirst.practiceSessions)).toEqual([
        'practice-local',
        'practice-remote',
      ]);
      expect(ids(fixture.remote?.data.readingSessions ?? [])).toEqual([
        'reading-local',
        'reading-remote',
      ]);
      expect(ids(fixture.remote?.data.practiceSessions ?? [])).toEqual([
        'practice-local',
        'practice-remote',
      ]);

      const firstSummary = getStudySummary(afterFirst);
      expect(firstSummary.readingMs).toBe(3_000);
      expect(firstSummary.practiceMs).toBe(1_200);

      await sync(fixture);
      const afterSecond = readStudyData();
      expect(ids(afterSecond.readingSessions)).toEqual([
        'reading-local',
        'reading-remote',
      ]);
      expect(ids(afterSecond.practiceSessions)).toEqual([
        'practice-local',
        'practice-remote',
      ]);
      expect(getStudySummary(afterSecond)).toEqual(firstSummary);
      expect(ids(fixture.remote?.data.readingSessions ?? [])).toEqual([
        'reading-local',
        'reading-remote',
      ]);
      expect(ids(fixture.remote?.data.practiceSessions ?? [])).toEqual([
        'practice-local',
        'practice-remote',
      ]);

      expect(fixture.requests.filter((item) => item.method === 'GET')).toHaveLength(2);
      const puts = fixture.requests.filter((item) => item.method === 'PUT');
      expect(puts).toHaveLength(2);
      for (const request of fixture.requests) {
        expect(request.path).toBe(FIXTURE_PATH);
        expect(request.authorizationMatches).toBe(true);
      }
      for (const put of puts) {
        expect(put.ifMatch).toBeTruthy();
        expect(put.ifNoneMatch).toBeUndefined();
        expect(() => parseBackup(put.body)).not.toThrow();
      }
    });
  });

  it('creates a missing remote file with If-None-Match * and then uses ETags', async () => {
    await withTestServer({ initialRemote: null }, async (fixture) => {
      const local = readingSession(
        'reading-only-local',
        'article-local',
        T1,
        1_200,
      );
      saveReadingSession(local);

      await sync(fixture);

      const firstPut = fixture.requests.find((item) => item.method === 'PUT');
      expect(firstPut).toBeDefined();
      expect(firstPut?.ifNoneMatch).toBe('*');
      expect(firstPut?.ifMatch).toBeUndefined();
      expect(firstPut?.authorizationMatches).toBe(true);
      expect(firstPut?.path).toBe(FIXTURE_PATH);
      expect(ids(fixture.remote?.data.readingSessions ?? [])).toEqual([
        local.id,
      ]);
      expect(ids(readStudyData().readingSessions)).toEqual([local.id]);

      await sync(fixture);

      const puts = fixture.requests.filter((item) => item.method === 'PUT');
      expect(puts).toHaveLength(2);
      expect(puts[1].ifNoneMatch).toBeUndefined();
      expect(puts[1].ifMatch).toBeTruthy();
      expect(ids(fixture.remote?.data.readingSessions ?? [])).toEqual([
        local.id,
      ]);
    });
  });

  it('re-reads after a 412 caused by another device and keeps all three records', async () => {
    const remoteB = readingSession(
      'reading-remote-b',
      'article-b',
      T2,
      2_000,
    );
    const injectedC = readingSession(
      'reading-device-c',
      'article-c',
      T3,
      3_000,
    );

    await withTestServer(
      {
        initialRemote: makeBackup([remoteB]),
        injectOnFirstConditionalPut: makeBackup([injectedC]),
      },
      async (fixture) => {
        const localA = readingSession(
          'reading-local-a',
          'article-a',
          T1,
          1_000,
        );
        saveReadingSession(localA);

        const result = await sync(fixture);
        expect(result.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

        const expected = [
          'reading-device-c',
          'reading-local-a',
          'reading-remote-b',
        ].sort();
        expect(ids(readStudyData().readingSessions)).toEqual(expected);
        expect(ids(fixture.remote?.data.readingSessions ?? [])).toEqual(
          expected,
        );

        const gets = fixture.requests.filter((item) => item.method === 'GET');
        expect(gets).toHaveLength(2);
        const puts = fixture.requests.filter((item) => item.method === 'PUT');
        expect(puts).toHaveLength(2);
        expect(puts[0].ifMatch).toBe('"fixture-1"');
        expect(puts[1].ifMatch).toBeTruthy();
        expect(puts[1].ifMatch).not.toBe(puts[0].ifMatch);

        const firstPayload = parseBackup(puts[0].body);
        expect(ids(firstPayload.data.readingSessions)).toEqual([
          'reading-local-a',
          'reading-remote-b',
        ]);
        const secondPayload = parseBackup(puts[1].body);
        expect(ids(secondPayload.data.readingSessions)).toEqual(expected);

        for (const request of fixture.requests) {
          expect(request.path).toBe(FIXTURE_PATH);
          expect(request.authorizationMatches).toBe(true);
        }
      },
    );
  });
});

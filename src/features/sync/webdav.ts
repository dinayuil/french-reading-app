import type { StudyBackup } from '../data/backup';
import type { NativeHttpRequest, NativeHttpResponse } from '../../platform/http';
import { applyBackup, createBackup, mergeBackups, parseBackup } from '../data/backup';
import { nativeHttpRequest } from '../../platform/http';
import { isNativeApp } from '../../platform/runtime';
import { readJSON, writeJSON } from '../../lib/storage';

export interface WebDavConfig {
  url: string;
  username: string;
  password: string;
}

export interface WebDavSettings {
  url: string;
  username: string;
}

export type WebDavErrorCode =
  | 'nativeOnly'
  | 'invalidUrl'
  | 'auth'
  | 'network'
  | 'invalidRemote'
  | 'unsupportedServer'
  | 'conflict'
  | 'remoteMissingDirectory'
  | 'storage';

const ERROR_MESSAGES: Record<WebDavErrorCode, string> = {
  nativeOnly: 'WebDAV sync is only available in the native app.',
  invalidUrl: 'The WebDAV URL must be an HTTPS directory without credentials, query or fragment.',
  auth: 'WebDAV authentication failed.',
  network: 'The WebDAV server could not be reached.',
  invalidRemote: 'The remote WebDAV backup is not a valid study backup.',
  unsupportedServer: 'The WebDAV server does not support safe conditional updates.',
  conflict: 'The remote backup changed repeatedly; nothing was overwritten.',
  remoteMissingDirectory: 'The WebDAV directory does not exist.',
  storage: 'Local study data could not be saved.',
};

export class WebDavError extends Error {
  readonly code: WebDavErrorCode;

  constructor(code: WebDavErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = 'WebDavError';
    this.code = code;
  }
}

export interface WebDavDeps {
  isNativeApp: () => boolean;
  nativeHttpRequest: (request: NativeHttpRequest) => Promise<NativeHttpResponse>;
  createBackup: () => StudyBackup;
  parseBackup: (input: string | unknown) => StudyBackup;
  mergeBackups: (local: StudyBackup, remote: StudyBackup) => StudyBackup;
  applyBackup: (backup: StudyBackup, mode: 'merge' | 'replace') => void;
}

export const WEBDAV_FILE_NAME = 'french-reading-progress.json';

const WEBDAV_SETTINGS_KEY = 'webdav-settings';
export const WEBDAV_SETTINGS_STORAGE_KEY = `frp:${WEBDAV_SETTINGS_KEY}`;

const MAX_CONFLICT_RETRIES = 2;

interface RemoteBackup {
  backup: StudyBackup;
  etag: string;
}

function buildFileUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebDavError('invalidUrl');
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new WebDavError('invalidUrl');
  }

  const directory = url.pathname.replace(/\/+$/, '');
  url.pathname = `${directory}/${WEBDAV_FILE_NAME}`;
  return url.toString();
}

function basicAuthorization(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

function headerValue(
  headers: Record<string, string> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && typeof value === 'string') return value;
  }
  return undefined;
}

function requireStrongETag(headers: Record<string, string> | undefined): string {
  const raw = headerValue(headers, 'etag');
  if (raw === undefined) throw new WebDavError('unsupportedServer');

  const etag = raw.trim();
  if (
    etag === '' ||
    /^w\//i.test(etag) ||
    !etag.startsWith('"') ||
    !etag.endsWith('"')
  ) {
    throw new WebDavError('unsupportedServer');
  }
  return etag;
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

async function send(
  deps: WebDavDeps,
  request: NativeHttpRequest,
): Promise<NativeHttpResponse> {
  try {
    return await deps.nativeHttpRequest(request);
  } catch (error) {
    if (error instanceof WebDavError) throw error;
    throw new WebDavError('network');
  }
}

async function readRemote(
  fileUrl: string,
  headers: Record<string, string>,
  deps: WebDavDeps,
): Promise<RemoteBackup | null> {
  const response = await send(deps, {
    url: fileUrl,
    method: 'GET',
    headers,
  });

  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) {
    throw new WebDavError('auth');
  }
  if (response.status === 405 || response.status === 501) {
    throw new WebDavError('unsupportedServer');
  }
  if (response.status !== 200) throw new WebDavError('network');

  const etag = requireStrongETag(response.headers);
  let backup: StudyBackup;
  try {
    backup = deps.parseBackup(response.data);
  } catch {
    throw new WebDavError('invalidRemote');
  }
  return { backup, etag };
}

function createLocalBackup(deps: WebDavDeps): StudyBackup {
  try {
    return deps.createBackup();
  } catch {
    throw new WebDavError('storage');
  }
}

function mergeLocalBackup(deps: WebDavDeps, remote: StudyBackup): StudyBackup {
  const local = createLocalBackup(deps);
  try {
    return deps.mergeBackups(local, remote);
  } catch {
    throw new WebDavError('invalidRemote');
  }
}

function serializeBackup(backup: StudyBackup): string {
  try {
    return JSON.stringify(backup);
  } catch {
    throw new WebDavError('storage');
  }
}

function applyLocalBackup(deps: WebDavDeps, backup: StudyBackup): void {
  try {
    deps.applyBackup(backup, 'merge');
  } catch {
    throw new WebDavError('storage');
  }
}

async function putRemote(
  fileUrl: string,
  payload: string,
  headers: Record<string, string>,
  deps: WebDavDeps,
): Promise<number> {
  const response = await send(deps, {
    url: fileUrl,
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
    },
    data: payload,
  });
  return response.status;
}

/**
 * Protocol core with injectable platform/storage ports. `syncWebDav` below wires
 * the real Task 1/2 implementations; this export exists so the WebDAV protocol
 * can be tested without the native runtime or real learner data.
 */
export async function syncWebDavWithDeps(
  config: WebDavConfig,
  deps: WebDavDeps,
): Promise<{ syncedAt: string }> {
  if (!deps.isNativeApp()) throw new WebDavError('nativeOnly');

  const fileUrl = buildFileUrl(config.url);
  const authorization = basicAuthorization(config.username, config.password);
  const getHeaders = {
    Authorization: authorization,
    Accept: 'application/json',
  };
  let conflictRetries = 0;

  for (;;) {
    const remote = await readRemote(fileUrl, getHeaders, deps);

    if (remote) {
      const merged = mergeLocalBackup(deps, remote.backup);
      const status = await putRemote(
        fileUrl,
        serializeBackup(merged),
        {
          Authorization: authorization,
          'If-Match': remote.etag,
        },
        deps,
      );

      if (isSuccess(status)) {
        applyLocalBackup(deps, merged);
        return { syncedAt: new Date().toISOString() };
      }
      if (status === 401 || status === 403) throw new WebDavError('auth');
      if (status === 405 || status === 501) {
        throw new WebDavError('unsupportedServer');
      }
      if (status === 404 || status === 409 || status === 412) {
        if (conflictRetries >= MAX_CONFLICT_RETRIES) {
          throw new WebDavError('conflict');
        }
        conflictRetries += 1;
        continue;
      }
      throw new WebDavError('network');
    }

    const local = createLocalBackup(deps);
    const status = await putRemote(
      fileUrl,
      serializeBackup(local),
      {
        Authorization: authorization,
        'If-None-Match': '*',
      },
      deps,
    );

    if (isSuccess(status)) {
      applyLocalBackup(deps, local);
      return { syncedAt: new Date().toISOString() };
    }
    if (status === 401 || status === 403) throw new WebDavError('auth');
    if (status === 405 || status === 501) {
      throw new WebDavError('unsupportedServer');
    }
    if (status === 404 || status === 409 || status === 412) {
      if (conflictRetries >= MAX_CONFLICT_RETRIES) {
        if (status === 404 || status === 409) {
          throw new WebDavError('remoteMissingDirectory');
        }
        throw new WebDavError('conflict');
      }
      conflictRetries += 1;
      continue;
    }
    throw new WebDavError('network');
  }
}

export async function syncWebDav(
  config: WebDavConfig,
): Promise<{ syncedAt: string }> {
  return syncWebDavWithDeps(config, {
    isNativeApp,
    nativeHttpRequest,
    createBackup,
    parseBackup,
    mergeBackups,
    applyBackup,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadWebDavSettings(): WebDavSettings {
  const stored = readJSON<unknown>(WEBDAV_SETTINGS_KEY, {});
  if (!isRecord(stored)) return { url: '', username: '' };

  return {
    url: typeof stored.url === 'string' ? stored.url : '',
    username: typeof stored.username === 'string' ? stored.username : '',
  };
}

export function saveWebDavSettings(settings: WebDavSettings): void {
  // Only the allow-listed fields are persisted; callers may pass extra runtime
  // fields (notably a password) and they are deliberately dropped.
  writeJSON(WEBDAV_SETTINGS_KEY, {
    url: typeof settings.url === 'string' ? settings.url : '',
    username: typeof settings.username === 'string' ? settings.username : '',
  });
}

import { CapacitorHttp } from '@capacitor/core';
import { isNativeApp } from './runtime';

export interface NativeHttpRequest {
  url: string;
  method: 'GET' | 'PUT';
  headers: Record<string, string>;
  data?: string;
}

export interface NativeHttpResponse {
  status: number;
  headers: Record<string, string>;
  data: unknown;
}

declare global {
  interface Window {
    frenchReadingDesktop?: {
      webdavRequest(options: NativeHttpRequest): Promise<NativeHttpResponse>;
    };
  }
}

export function supportsWebDav(): boolean {
  return Boolean(window.frenchReadingDesktop) || isNativeApp();
}

export class NativeHttpUnavailableError extends Error {
  readonly code = 'nativeOnly';

  constructor() {
    super('Native HTTP is only available in the installed app.');
    this.name = 'NativeHttpUnavailableError';
  }
}

const CONNECT_TIMEOUT_MS = 15_000;
const READ_TIMEOUT_MS = 30_000;

/**
 * Send WebDAV requests through the installed app's HTTP bridge. Both bridges
 * disable redirects to keep credentials on the configured server.
 */
export async function nativeHttpRequest(
  options: NativeHttpRequest,
): Promise<NativeHttpResponse> {
  const desktop = window.frenchReadingDesktop;
  if (desktop) return desktop.webdavRequest(options);

  if (!isNativeApp()) {
    throw new NativeHttpUnavailableError();
  }

  const response = await CapacitorHttp.request({
    url: options.url,
    method: options.method,
    headers: options.headers,
    data: options.data,
    disableRedirects: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    readTimeout: READ_TIMEOUT_MS,
  });

  return {
    status: response.status,
    headers: response.headers,
    data: response.data,
  };
}

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
 * Perform an explicit GET or PUT through Capacitor's native HTTP bridge.
 * Redirects are disabled so credentials cannot be forwarded to another host,
 * and responses are returned exactly as Capacitor delivered them (string or
 * parsed JSON object). The global fetch is deliberately left untouched.
 */
export async function nativeHttpRequest(
  options: NativeHttpRequest,
): Promise<NativeHttpResponse> {
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

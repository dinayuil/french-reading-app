import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudyBackup } from '../data/backup';
import type { NativeHttpRequest, NativeHttpResponse } from '../../platform/http';

const port = vi.hoisted(() => ({
  isNativeApp: vi.fn(),
  nativeHttpRequest: vi.fn(),
  createBackup: vi.fn(),
  parseBackup: vi.fn(),
  mergeBackups: vi.fn(),
  applyBackup: vi.fn(),
}));

vi.mock('../../platform/runtime', () => ({
  isNativeApp: port.isNativeApp,
}));

vi.mock('../../platform/http', () => ({
  nativeHttpRequest: port.nativeHttpRequest,
}));

vi.mock('../data/backup', () => ({
  createBackup: port.createBackup,
  parseBackup: port.parseBackup,
  mergeBackups: port.mergeBackups,
  applyBackup: port.applyBackup,
}));

import { syncWebDav, type WebDavConfig } from './webdav';

const CONFIG: WebDavConfig = {
  url: 'https://dav.example.com/books',
  username: 'reader',
  password: 'session-password',
};

function backup(marker: string): StudyBackup {
  return { marker } as unknown as StudyBackup;
}

function response(status: number): NativeHttpResponse {
  return { status, headers: {}, data: '' };
}

describe('syncWebDav', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the native gate in front of the platform HTTP call', async () => {
    port.isNativeApp.mockReturnValue(false);

    await expect(syncWebDav(CONFIG)).rejects.toMatchObject({
      code: 'nativeOnly',
    });
    expect(port.nativeHttpRequest).not.toHaveBeenCalled();
  });

  it('wires the platform and data modules for a first sync', async () => {
    const local = backup('local');
    port.isNativeApp.mockReturnValue(true);
    port.createBackup.mockReturnValue(local);
    port.nativeHttpRequest
      .mockResolvedValueOnce(response(404))
      .mockResolvedValueOnce(response(201));

    await expect(syncWebDav(CONFIG)).resolves.toMatchObject({
      syncedAt: expect.any(String),
    });

    expect(port.nativeHttpRequest).toHaveBeenCalledTimes(2);
    expect(port.createBackup).toHaveBeenCalledTimes(1);
    const put = port.nativeHttpRequest.mock.calls[1][0] as NativeHttpRequest;
    expect(put.url).toBe(
      'https://dav.example.com/books/french-reading-progress.json',
    );
    expect(put.method).toBe('PUT');
    expect(JSON.parse(put.data as string)).toEqual(local);
    expect(port.applyBackup).toHaveBeenCalledWith(local, 'merge');
  });
});

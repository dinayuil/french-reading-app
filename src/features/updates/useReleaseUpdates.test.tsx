import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { version as currentVersion } from '../../../package.json';
import { useReleaseUpdates } from './useReleaseUpdates';

vi.mock('../../platform/runtime', () => ({ isNativeApp: () => false }));

function windowsRelease(version: string) {
  return Response.json([{
    tag_name: `v${version}`,
    draft: false,
    assets: [{ name: `FrenchReading-Setup-${version}-x64.exe`, state: 'uploaded' }],
  }]);
}

afterEach(() => vi.unstubAllGlobals());

it('reports release updates in the installed client, supports dismissal and can retry', async () => {
  const higherMajor = Number(currentVersion.split('.')[0]) + 1;
  const newerVersion = `${higherMajor}.0.0`;
  const nextVersion = `${higherMajor}.0.1`;
  const fetchRelease = vi.fn()
    .mockResolvedValueOnce(windowsRelease(newerVersion))
    .mockRejectedValueOnce(new TypeError('Network unavailable'))
    .mockResolvedValueOnce(windowsRelease(nextVersion));

  vi.stubGlobal('frenchReadingDesktop', { webdavRequest: vi.fn() });
  vi.stubGlobal('fetch', fetchRelease);

  const { result } = renderHook(() => useReleaseUpdates());
  await waitFor(() => expect(result.current).toMatchObject({
    currentVersion,
    status: 'available',
    release: { version: newerVersion },
    showNotice: true,
  }));

  act(() => result.current?.dismiss());
  expect(result.current).toMatchObject({
    status: 'available',
    release: { version: newerVersion },
    showNotice: false,
  });

  act(() => result.current?.check());
  expect(result.current?.status).toBe('checking');
  await waitFor(() => expect(result.current?.status).toBe('error'));

  act(() => result.current?.check());
  await waitFor(() => expect(result.current).toMatchObject({
    status: 'available',
    release: { version: nextVersion },
    showNotice: true,
  }));
  expect(fetchRelease).toHaveBeenCalledTimes(3);
});

it('skips release requests in the browser', () => {
  const fetchRelease = vi.fn();
  vi.stubGlobal('fetch', fetchRelease);

  const { result } = renderHook(() => useReleaseUpdates());

  expect(result.current).toBeNull();
  expect(fetchRelease).not.toHaveBeenCalled();
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { findReleaseUpdate } from './releases';

const releaseUrl = 'https://github.com/dinayuil/french-reading-app/releases/tag/';
const installableRelease = (version: string) => ({
  tag_name: `v${version}`,
  draft: false,
  prerelease: true,
  assets: [
    { name: `FrenchReading-Android-v${version}.apk`, state: 'uploaded' },
    { name: `FrenchReading-Setup-${version}-x64.exe`, state: 'uploaded' },
  ],
});

afterEach(() => vi.unstubAllGlobals());

describe('findReleaseUpdate', () => {
  it('finds the highest installable version across source pages, including prereleases', async () => {
    const androidOnly = installableRelease('0.20.0');
    androidOnly.assets.pop();
    const pendingWindows = installableRelease('0.19.0');
    pendingWindows.assets[1].state = 'open';

    const request = vi.fn()
      .mockResolvedValueOnce(Response.json([
        { ...installableRelease('0.21.0'), draft: true },
        androidOnly,
        pendingWindows,
        installableRelease('0.9.0'),
      ], { headers: { Link: '<https://api.github.com/example>; rel="next"' } }))
      .mockResolvedValueOnce(Response.json([installableRelease('0.10.0')]));
    vi.stubGlobal('fetch', request);

    const signal = new AbortController().signal;
    await expect(findReleaseUpdate('0.8.0', 'windows', signal)).resolves.toEqual({
      version: '0.10.0',
      url: `${releaseUrl}v0.10.0`,
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith(
      'https://api.github.com/repos/dinayuil/french-reading-app/releases?per_page=100&page=2',
      { signal, cache: 'no-cache', credentials: 'omit' },
    );
  });

  it('offers only a newer APK to Android and derives the destination from its version', async () => {
    const windowsOnly = installableRelease('2.0.0');
    windowsOnly.assets.shift();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([
      windowsOnly,
      { ...installableRelease('1.0.1'), html_url: 'https://example.com' },
      installableRelease('1.0.0'),
    ])));

    await expect(findReleaseUpdate('1.0.0', 'android', new AbortController().signal)).resolves.toEqual({
      version: '1.0.1',
      url: `${releaseUrl}v1.0.1`,
    });
  });

  it('does not offer an older or equal build and reports a failed request as an error', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(Response.json([installableRelease('1.0.0'), installableRelease('0.9.0')]))
      .mockResolvedValueOnce(new Response(null, { status: 403 }));
    vi.stubGlobal('fetch', request);
    const signal = new AbortController().signal;

    await expect(findReleaseUpdate('1.0.0', 'android', signal)).resolves.toBeNull();
    await expect(findReleaseUpdate('1.0.0', 'android', signal)).rejects.toThrow('403');
  });
});

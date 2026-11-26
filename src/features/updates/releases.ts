const REPOSITORY = 'dinayuil/french-reading-app';
const RELEASE_PAGE = `https://github.com/${REPOSITORY}/releases/tag/`;
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases`;
const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;

export type InstalledPlatform = 'android' | 'windows';

export interface ReleaseUpdate {
  version: string;
  url: string;
}

function parseVersion(version: string): number[] | null {
  if (!VERSION_PATTERN.test(version)) return null;
  const parts = version.split('.').map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}

function isNewer(candidate: number[], installed: number[]): boolean {
  for (const [index, part] of candidate.entries()) {
    if (part !== installed[index]) return part > installed[index];
  }
  return false;
}

function hasInstaller(assets: unknown[], name: string): boolean {
  return assets.some((asset: unknown) =>
    typeof asset === 'object' && asset !== null &&
    'name' in asset && asset.name === name &&
    'state' in asset && asset.state === 'uploaded',
  );
}

export async function findReleaseUpdate(
  currentVersion: string,
  platform: InstalledPlatform,
  signal: AbortSignal,
): Promise<ReleaseUpdate | null> {
  let newestVersion = parseVersion(currentVersion);
  if (!newestVersion) throw new Error('Invalid installed app version.');

  let update: ReleaseUpdate | null = null;
  for (let page = 1; ; page += 1) {
    // The latest-release endpoint omits GitHub prereleases, including our test installers.
    const response = await fetch(`${RELEASES_API}?per_page=100&page=${page}`, {
      signal,
      cache: 'no-cache',
      credentials: 'omit',
    });
    if (!response.ok) throw new Error(`GitHub Releases returned ${response.status}.`);
    const releases: unknown = await response.json();
    if (!Array.isArray(releases)) throw new Error('Invalid GitHub Releases response.');

    const entries: unknown[] = releases;
    for (const release of entries) {
      if (typeof release !== 'object' || release === null ||
        !('draft' in release) || release.draft !== false ||
        !('tag_name' in release) || typeof release.tag_name !== 'string' ||
        !release.tag_name.startsWith('v') ||
        !('assets' in release) || !Array.isArray(release.assets)) continue;

      const version = release.tag_name.slice(1);
      const parts = parseVersion(version);
      if (!parts || !isNewer(parts, newestVersion)) continue;

      const installer = platform === 'android'
        ? `FrenchReading-Android-${release.tag_name}.apk`
        : `FrenchReading-Setup-${version}-x64.exe`;
      if (!hasInstaller(release.assets, installer)) continue;

      newestVersion = parts;
      update = { version, url: `${RELEASE_PAGE}${release.tag_name}` };
    }

    if (!response.headers.get('Link')?.includes('rel="next"')) return update;
  }
}

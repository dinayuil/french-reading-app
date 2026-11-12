import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isNativeApp: vi.fn(),
  writeFile: vi.fn(),
  share: vi.fn(),
}));

vi.mock('./runtime', () => ({
  isNativeApp: mocks.isNativeApp,
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: { writeFile: mocks.writeFile },
}));

vi.mock('@capacitor/share', () => ({
  Share: { share: mocks.share },
}));

import { exportDataFile } from './files';

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;

function restoreUrlMethod(
  name: 'createObjectURL' | 'revokeObjectURL',
  original: typeof URL.createObjectURL | typeof URL.revokeObjectURL,
): void {
  if (original) {
    Object.defineProperty(URL, name, { configurable: true, value: original });
    return;
  }
  delete (URL as unknown as Record<string, unknown>)[name];
}

describe('exportDataFile', () => {
  beforeEach(() => {
    mocks.isNativeApp.mockReset();
    mocks.writeFile.mockReset();
    mocks.share.mockReset();

    createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:export');
    revokeObjectURL = vi.fn<(url: string) => void>();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    restoreUrlMethod('createObjectURL', originalCreateObjectURL);
    restoreUrlMethod('revokeObjectURL', originalRevokeObjectURL);
    document.querySelectorAll('a').forEach((anchor) => anchor.remove());
  });

  it('downloads the exact contents as a JSON file in the browser', async () => {
    mocks.isNativeApp.mockReturnValue(false);
    let clickedAnchor: HTMLAnchorElement | undefined;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedAnchor = this;
      });
    const contents = '{"format":"frp-study-backup","note":"é"}';

    await exportDataFile('frp-study-backup.json', contents);

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe('application/json;charset=utf-8');
    await expect(blob.text()).resolves.toBe(contents);

    expect(click).toHaveBeenCalledTimes(1);
    expect(clickedAnchor?.download).toBe('frp-study-backup.json');
    expect(clickedAnchor?.href).toBe('blob:export');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export');
    expect(document.querySelector('a')).toBeNull();
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.share).not.toHaveBeenCalled();
  });

  it('cleans up the download URL and anchor when the click fails', async () => {
    mocks.isNativeApp.mockReturnValue(false);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('download blocked');
    });

    await expect(exportDataFile('backup.json', '{}')).rejects.toThrow(
      'download blocked',
    );

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export');
    expect(document.querySelector('a')).toBeNull();
  });

  it('writes UTF-8 contents to the cache and shares the file natively', async () => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.writeFile.mockResolvedValue({ uri: 'file:///cache/backup.json' });
    mocks.share.mockResolvedValue({ activityType: 'send' });
    const contents = '{"note":"français"}';

    await exportDataFile('backup.json', contents);

    expect(mocks.writeFile).toHaveBeenCalledWith({
      path: 'backup.json',
      data: contents,
      directory: 'CACHE',
      encoding: 'utf8',
    });
    expect(mocks.share).toHaveBeenCalledWith({
      title: 'backup.json',
      url: 'file:///cache/backup.json',
    });
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('distinguishes cancelling the native share sheet from export failures', async () => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.writeFile.mockResolvedValue({ uri: 'file:///cache/backup.json' });
    mocks.share.mockRejectedValue(new Error('Share canceled'));

    await expect(exportDataFile('backup.json', '{}')).rejects.toMatchObject({
      code: 'exportCancelled',
    });
  });

  it('does not share when writing the cache file fails', async () => {
    mocks.isNativeApp.mockReturnValue(true);
    mocks.writeFile.mockRejectedValue(new Error('disk full'));

    await expect(exportDataFile('backup.json', '{}')).rejects.toThrow(
      'disk full',
    );

    expect(mocks.share).not.toHaveBeenCalled();
  });
});

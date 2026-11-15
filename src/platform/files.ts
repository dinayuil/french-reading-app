import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeApp } from './runtime';

const JSON_MIME_TYPE = 'application/json;charset=utf-8';

function shareCancelledError(): Error {
  return Object.assign(new Error('File sharing was cancelled.'), {
    code: 'exportCancelled',
  });
}

/**
 * Export a text file. The browser downloads it; the native app writes it to
 * the cache and hands the file to the system share sheet so the reader can
 * save or send it without extra permissions.
 */
export async function exportDataFile(
  filename: string,
  contents: string,
): Promise<void> {
  if (!isNativeApp()) {
    downloadInBrowser(filename, new Blob([contents], { type: JSON_MIME_TYPE }));
    return;
  }

  const file = await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  await shareFile(filename, file.uri);
}

/** Saves or shares a generated PNG with the same platform conventions. */
export async function exportPngFile(
  filename: string,
  blob: Blob,
): Promise<void> {
  if (!isNativeApp()) {
    downloadInBrowser(filename, blob);
    return;
  }

  const file = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });

  await shareFile(filename, file.uri);
}

async function shareFile(filename: string, uri: string): Promise<void> {
  try {
    await Share.share({ title: filename, url: uri });
  } catch (error) {
    if (error instanceof Error && error.message === 'Share canceled') {
      throw shareCancelledError();
    }
    throw error;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Read failed.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      if (comma === -1) {
        reject(new Error('Encode failed.'));
        return;
      }
      resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function downloadInBrowser(filename: string, blob: Blob): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  }
}

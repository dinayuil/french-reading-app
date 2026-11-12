import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNativeApp } from './runtime';

const JSON_MIME_TYPE = 'application/json;charset=utf-8';

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
    downloadInBrowser(filename, contents);
    return;
  }

  const file = await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });

  try {
    await Share.share({ title: filename, url: file.uri });
  } catch (error) {
    if (error instanceof Error && error.message === 'Share canceled') {
      throw Object.assign(new Error('File sharing was cancelled.'), {
        code: 'exportCancelled',
      });
    }
    throw error;
  }
}

function downloadInBrowser(filename: string, contents: string): void {
  const blob = new Blob([contents], { type: JSON_MIME_TYPE });
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

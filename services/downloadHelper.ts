import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { saveAs } from 'file-saver';

/**
 * Converts a string into a base64 string safely supporting UTF-8 characters.
 */
function stringToBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

/**
 * Converts a Blob into a base64 string asynchronously.
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read blob'));
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      } else {
        reject(new Error('Invalid reader result type'));
      }
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Universally saves or shares a file.
 * - On Native platforms (Capacitor Android/iOS): Writes the file to the app's cache directory
 *   and triggers the native system Share Sheet to let the user save or send it.
 * - On Web platforms: Falls back to the standard browser download using file-saver (saveAs).
 * 
 * @param content The file content (either plain text string or Blob object).
 * @param fileName The desired name of the file (e.g., 'playlist.m3u', 'data.csv').
 * @param mimeType The optional MIME type (defaults to 'text/plain').
 */
export async function downloadPlaylistFile(
  content: string | Blob,
  fileName: string,
  mimeType: string = 'text/plain'
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      let base64Data = '';
      if (content instanceof Blob) {
        base64Data = await blobToBase64(content);
      } else {
        base64Data = stringToBase64(content);
      }

      // Write the file to the cache directory
      await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
      });

      // Retrieve the native file URI
      const uriResult = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache,
      });

      // Open the native system Share Sheet
      await Share.share({
        title: fileName,
        text: `Share or Save: ${fileName}`,
        url: uriResult.uri,
        dialogTitle: `Save ${fileName}`,
      });
    } catch (error) {
      console.error('Capacitor native file download failed:', error);
      alert(`Error saving file: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    // Web fallback
    if (content instanceof Blob) {
      saveAs(content, fileName);
    } else {
      const blob = new Blob([content], { type: mimeType });
      saveAs(blob, fileName);
    }
  }
}

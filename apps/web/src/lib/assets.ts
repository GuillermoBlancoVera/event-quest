import type { PresignedUpload } from '@event-quest/shared';

const assetsBase = (import.meta.env.VITE_ASSETS_URL as string | undefined)?.replace(/\/$/, '');

/** Public URL of an avatar or community image. They are served through the CDN, never straight from the bucket. */
export const assetsUrl = (key: string | undefined) => key && assetsBase ? `${assetsBase}/${key.split('/').map(encodeURIComponent).join('/')}` : undefined;

/** Absolute link to a page of this app, for QR codes. */
export const appUrl = (path: string) => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}${path}`;

export class UploadCancelledError extends Error { constructor() { super('La subida se ha cancelado.'); } }

/** Sends a file straight to storage with the one-time form the API prepared. The file must be the last field. */
export const uploadFile = (upload: PresignedUpload, body: Blob, onProgress?: (loaded: number) => void, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const form = new FormData();
  Object.entries(upload.fields).forEach(([name, value]) => form.append(name, value));
  form.append('file', body);
  const request = new XMLHttpRequest();
  const abort = () => request.abort();
  const cleanup = () => signal?.removeEventListener('abort', abort);
  request.open('POST', upload.url);
  request.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(Math.min(event.loaded, body.size)); };
  request.onload = () => { cleanup(); request.status >= 200 && request.status < 300 ? resolve() : reject(new Error(request.responseText.includes('EntityTooLarge') ? 'El archivo es demasiado grande.' : 'No se ha podido subir el archivo.')); };
  request.onerror = () => { cleanup(); reject(new Error('No se ha podido subir el archivo.')); };
  request.onabort = () => { cleanup(); reject(new UploadCancelledError()); };
  if (signal?.aborted) { reject(new UploadCancelledError()); return; }
  signal?.addEventListener('abort', abort, { once: true });
  request.send(form);
});

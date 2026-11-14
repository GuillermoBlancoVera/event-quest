export type MediaKind = 'image' | 'video';

/** The only formats the gallery accepts. Anything else (SVG, HTML, executables…) is refused before S3 is involved. */
const formats: Record<string, { kind: MediaKind; extensions: string[] }> = {
  'image/jpeg': { kind: 'image', extensions: ['jpg', 'jpeg'] },
  'image/png': { kind: 'image', extensions: ['png'] },
  'image/gif': { kind: 'image', extensions: ['gif'] },
  'image/webp': { kind: 'image', extensions: ['webp'] },
  'image/heic': { kind: 'image', extensions: ['heic'] },
  'image/heif': { kind: 'image', extensions: ['heif'] },
  'image/avif': { kind: 'image', extensions: ['avif'] },
  'image/bmp': { kind: 'image', extensions: ['bmp'] },
  'video/mp4': { kind: 'video', extensions: ['mp4', 'm4v'] },
  'video/quicktime': { kind: 'video', extensions: ['mov'] },
  'video/webm': { kind: 'video', extensions: ['webm'] },
  'video/3gpp': { kind: 'video', extensions: ['3gp'] },
  'video/x-matroska': { kind: 'video', extensions: ['mkv'] },
  'video/x-msvideo': { kind: 'video', extensions: ['avi'] },
  'video/mpeg': { kind: 'video', extensions: ['mpeg', 'mpg'] },
};

const megabytes = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return (Number.isFinite(value) && value > 0 ? value : fallback) * 1024 * 1024;
};
export const maxBytes = (kind: MediaKind) => kind === 'video' ? megabytes('MEDIA_MAX_VIDEO_MB', 500) : megabytes('MEDIA_MAX_IMAGE_MB', 40);
/** Display copies and video thumbnails are small JPEGs generated in the browser. */
export const previewMaxBytes = 8 * 1024 * 1024;

/** Objects are tagged as pending on upload; an S3 lifecycle rule removes any that are never published. */
export const pendingTagging = '<Tagging><TagSet><Tag><Key>state</Key><Value>pending</Value></Tag></TagSet></Tagging>';

/**
 * Picks the canonical type for an upload. Phones often send an empty or generic type (for example for HEIC),
 * so the file extension is used as a fallback, but only for formats in the allow-list.
 */
export const resolveMediaType = (contentType: unknown, fileName: string) => {
  const declared = typeof contentType === 'string' ? contentType.trim().toLocaleLowerCase() : '';
  if (formats[declared]) return { contentType: declared, kind: formats[declared].kind, extension: formats[declared].extensions[0] };
  const extension = fileName.trim().toLocaleLowerCase().split('.').pop() ?? '';
  const match = Object.entries(formats).find(([, format]) => format.extensions.includes(extension));
  if (!match) return undefined;
  const generic = !declared || declared === 'application/octet-stream' || declared === `${match[1].kind}/*` || declared.startsWith(`${match[1].kind}/`);
  return generic ? { contentType: match[0], kind: match[1].kind, extension: match[1].extensions[0] } : undefined;
};

const ascii = (bytes: Uint8Array, start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((byte, index) => bytes[index] === byte);

/** Checks the first bytes of a file against the containers used by real photos and videos. */
export const matchesSignature = (kind: MediaKind, bytes: Uint8Array) => {
  if (bytes.length < 12) return false;
  // ISO base media: HEIC, HEIF, AVIF, MP4, MOV, 3GP, M4V.
  if (ascii(bytes, 4, 4) === 'ftyp') return true;
  if (kind === 'image') {
    return startsWith(bytes, [0xff, 0xd8, 0xff])
      || startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      || ['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))
      || (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP')
      || ascii(bytes, 0, 2) === 'BM';
  }
  return ['moov', 'mdat', 'wide', 'free', 'skip'].includes(ascii(bytes, 4, 4))
    || startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])
    || (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'AVI ')
    || startsWith(bytes, [0x00, 0x00, 0x01, 0xba])
    || startsWith(bytes, [0x00, 0x00, 0x01, 0xb3]);
};

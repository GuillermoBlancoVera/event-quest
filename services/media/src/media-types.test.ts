import { describe, expect, it } from 'vitest';
import { matchesSignature, resolveMediaType } from './media-types.js';

const bytes = (...values: Array<number | string>) => Uint8Array.from([...values.flatMap(value => typeof value === 'string' ? [...value].map(char => char.charCodeAt(0)) : [value]), ...new Array(32).fill(0)]).slice(0, 32);

describe('resolveMediaType', () => {
  it('accepts known photo and video formats', () => {
    expect(resolveMediaType('image/jpeg', 'boda.JPG')).toEqual({ contentType: 'image/jpeg', kind: 'image', extension: 'jpg' });
    expect(resolveMediaType('video/quicktime', 'baile.mov')).toMatchObject({ kind: 'video', extension: 'mov' });
  });

  it('falls back to the extension when the phone sends no usable type', () => {
    expect(resolveMediaType('', 'IMG_0012.HEIC')).toMatchObject({ contentType: 'image/heic' });
    expect(resolveMediaType('video/*', 'clip.mp4')).toMatchObject({ contentType: 'video/mp4' });
  });

  it('refuses anything that is not a photo or a video', () => {
    expect(resolveMediaType('image/svg+xml', 'logo.svg')).toBeUndefined();
    expect(resolveMediaType('text/html', 'page.html')).toBeUndefined();
    expect(resolveMediaType('text/html', 'disguised.jpg')).toBeUndefined();
    expect(resolveMediaType('application/x-msdownload', 'virus.exe')).toBeUndefined();
  });
});

describe('matchesSignature', () => {
  it('recognises real image and video containers', () => {
    expect(matchesSignature('image', bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(matchesSignature('image', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(matchesSignature('image', bytes('RIFF', 0, 0, 0, 0, 'WEBP'))).toBe(true);
    expect(matchesSignature('image', bytes(0, 0, 0, 0x18, 'ftypheic'))).toBe(true);
    expect(matchesSignature('video', bytes(0, 0, 0, 0x20, 'ftypisom'))).toBe(true);
    expect(matchesSignature('video', bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
  });

  it('rejects files that only claim to be media', () => {
    expect(matchesSignature('image', bytes('<svg xmlns="http://www.w3.org/2000/svg">'))).toBe(false);
    expect(matchesSignature('image', bytes('<!doctype html><script>'))).toBe(false);
    expect(matchesSignature('video', bytes('MZ', 0x90, 0))).toBe(false);
    expect(matchesSignature('image', new Uint8Array(4))).toBe(false);
  });
});

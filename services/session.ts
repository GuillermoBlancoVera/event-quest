import type { User } from '@event-quest/shared';

type MediaSession = { aud: 'media-upload'; exp: number; iat: number; sub: string };

const encoder = new TextEncoder();
const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const decode = (value: string) => JSON.parse(atob(value.replace(/-/g, '+').replace(/_/g, '/'))) as unknown;
const secret = () => {
  const value = process.env.MEDIA_SESSION_SECRET;
  if (!value) throw new Error('MEDIA_SESSION_SECRET is not configured.');
  return value;
};
const key = () => crypto.subtle.importKey('raw', encoder.encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const toBase64Url = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromBase64Url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
const signature = async (value: string) => toBase64Url(await crypto.subtle.sign('HMAC', await key(), encoder.encode(value)));

export const createMediaSession = async (user: User) => {
  const now = Math.floor(Date.now() / 1000);
  const payload: MediaSession = { aud: 'media-upload', sub: user.userId, iat: now, exp: now + 60 * 60 * 24 };
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
  return `${unsigned}.${await signature(unsigned)}`;
};

export const verifyMediaSession = async (authorization: string | undefined) => {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return undefined;
  const [header, payload, receivedSignature] = token.split('.');
  if (!header || !payload || !receivedSignature) return undefined;
  const valid = await crypto.subtle.verify('HMAC', await key(), fromBase64Url(receivedSignature), encoder.encode(`${header}.${payload}`));
  if (!valid) return undefined;
  try {
    const claims = decode(payload) as MediaSession;
    return claims.aud === 'media-upload' && typeof claims.sub === 'string' && Number.isInteger(claims.exp) && claims.exp > Math.floor(Date.now() / 1000) ? claims : undefined;
  } catch {
    return undefined;
  }
};

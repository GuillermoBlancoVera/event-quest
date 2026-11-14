import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 32;
const cost = 16384;
const derive = (password: string, salt: Buffer, n: number) => new Promise<Buffer>((resolve, reject) => scrypt(password.normalize('NFKC'), salt, keyLength, { N: n, r: 8, p: 1 }, (error, key) => error ? reject(error) : resolve(key)));

/** Returns `scrypt$<N>$<salt>$<hash>`; the plain password is never stored. */
export const hashPassword = async (password: string) => {
  const salt = randomBytes(16);
  return `scrypt$${cost}$${salt.toString('base64url')}$${(await derive(password, salt, cost)).toString('base64url')}`;
};

export const verifyPassword = async (password: string, stored: unknown) => {
  if (typeof stored !== 'string') return false;
  const [scheme, n, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash || Number(n) !== cost) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = await derive(password, Buffer.from(salt, 'base64url'), cost);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

/** Constant-time comparison for short secrets such as the event code. */
export const safeEqual = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

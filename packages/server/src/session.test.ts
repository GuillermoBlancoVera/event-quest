import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, safeEqual, verifyPassword } from './passwords.js';
import { createSession, qrSignature, qrSignatureMatches, requireSession, verifySession } from './session.js';
import { configureTestEnvironment, request } from './testing.js';

configureTestEnvironment();
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('sessions', () => {
  afterEach(() => vi.useRealTimers());

  it('round-trips the identity and role it was issued for', async () => {
    const session = await verifySession(`Bearer ${await createSession('user-1', 'player')}`);
    expect(session).toMatchObject({ sub: 'user-1', role: 'player', aud: 'event-quest' });
  });

  it('rejects a token whose payload was edited to gain the admin role', async () => {
    const [header, payload, signature] = (await createSession('user-1', 'player')).split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    expect(await verifySession(`Bearer ${header}.${encode({ ...claims, role: 'admin' })}.${signature}`)).toBeUndefined();
  });

  it('rejects unsigned tokens and tokens that declare another algorithm', async () => {
    const [, payload, signature] = (await createSession('user-1', 'admin')).split('.');
    expect(await verifySession(`Bearer ${encode({ alg: 'none', typ: 'JWT' })}.${payload}.`)).toBeUndefined();
    expect(await verifySession(`Bearer ${encode({ alg: 'none', typ: 'JWT' })}.${payload}.${signature}`)).toBeUndefined();
  });

  it('rejects garbage without throwing', async () => {
    for (const value of [undefined, '', 'Bearer', 'Bearer a.b.c', 'Bearer %%%.###.@@@', 'Basic abc']) expect(await verifySession(value)).toBeUndefined();
  });

  it('expires', async () => {
    vi.useFakeTimers();
    const token = await createSession('user-1', 'admin');
    vi.setSystemTime(Date.now() + 13 * 60 * 60 * 1000);
    expect(await verifySession(`Bearer ${token}`)).toBeUndefined();
  });

  it('answers 401 without a session and 403 for the wrong role', async () => {
    await expect(requireSession(request({ path: '/admin/players' }), ['admin'])).rejects.toMatchObject({ statusCode: 401 });
    const token = await createSession('user-1', 'player');
    await expect(requireSession(request({ path: '/admin/players', token }), ['admin'])).rejects.toMatchObject({ statusCode: 403 });
    await expect(requireSession(request({ path: '/ranking', token }), ['admin', 'player'])).resolves.toMatchObject({ sub: 'user-1' });
  });
});

describe('QR signatures', () => {
  it('only match the item they were issued for', async () => {
    const code = await qrSignature('challenge', 3);
    expect(await qrSignatureMatches('challenge', 3, code)).toBe(true);
    expect(await qrSignatureMatches('challenge', 4, code)).toBe(false);
    expect(await qrSignatureMatches('scan', 3, code)).toBe(false);
    expect(await qrSignatureMatches('challenge', 3, undefined)).toBe(false);
  });
});

describe('passwords', () => {
  it('are stored as salted hashes that verify only the right password', async () => {
    const hash = await hashPassword('girasol');
    expect(hash).toMatch(/^scrypt\$16384\$/);
    expect(hash).not.toContain('girasol');
    expect(await hashPassword('girasol')).not.toBe(hash);
    expect(await verifyPassword('girasol', hash)).toBe(true);
    expect(await verifyPassword('girasoles', hash)).toBe(false);
    expect(await verifyPassword('girasol', 'girasol')).toBe(false);
    expect(await verifyPassword('girasol', undefined)).toBe(false);
  });

  it('compares short secrets safely', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

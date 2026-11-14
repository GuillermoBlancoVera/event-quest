import { DynamoDBDocumentClient, GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, configureTestEnvironment, hashPassword, verifyPassword, verifySession } from '@event-quest/server';
import { handler } from './handler.js';

configureTestEnvironment();
const db = mockClient(DynamoDBDocumentClient);
const user = { PK: 'USER#u1', SK: 'PROFILE', entity: 'USER', userId: 'u1', name: 'sara', team: 't', group: 'g', challengeAttempts: [], createdAt: 'x', updatedAt: 'x' };
const login = (password: string) => call(handler, { method: 'POST', path: '/login', body: { name: ' Sara ', password } });

describe('POST /login', () => {
  beforeEach(() => { db.reset(); db.on(UpdateCommand).resolves({}); });

  it('signs in with a hashed password and never returns credentials', async () => {
    db.on(QueryCommand).resolves({ Items: [{ ...user, passwordHash: await hashPassword('girasol') }] });
    const { status, body } = await login('girasol');
    expect(status).toBe(200);
    expect(body).not.toHaveProperty('passwordHash');
    expect(body).not.toHaveProperty('PK');
    expect(await verifySession(`Bearer ${body.sessionToken}`)).toMatchObject({ sub: 'u1', role: 'player' });
    expect(db.commandCalls(QueryCommand)[0].args[0].input).toMatchObject({ IndexName: 'name-index', ExpressionAttributeValues: { ':name': 'sara' } });
  });

  it('upgrades a legacy plain-text password to a hash on first login', async () => {
    db.on(QueryCommand).resolves({ Items: [{ ...user, password: 'girasol' }] });
    const { status, body } = await login('girasol');
    expect(status).toBe(200);
    expect(body).not.toHaveProperty('password');
    const update = db.commandCalls(UpdateCommand)[0].args[0].input;
    expect(update.UpdateExpression).toContain('REMOVE #legacyPassword');
    expect(await verifyPassword('girasol', update.ExpressionAttributeValues?.[':hash'])).toBe(true);
  });

  it('rejects a wrong password and counts the failure', async () => {
    db.on(QueryCommand).resolves({ Items: [{ ...user, passwordHash: await hashPassword('girasol'), failedLogins: 2 }] });
    const { status, body } = await login('amapola');
    expect(status).toBe(401);
    expect(body.code).toBe('INVALID_LOGIN');
    expect(db.commandCalls(UpdateCommand)[0].args[0].input.ExpressionAttributeValues).toEqual({ ':failed': 3 });
  });

  it('locks the account after repeated failures and refuses while locked', async () => {
    db.on(QueryCommand).resolves({ Items: [{ ...user, passwordHash: await hashPassword('girasol'), failedLogins: 9 }] });
    await login('amapola');
    expect(db.commandCalls(UpdateCommand)[0].args[0].input.UpdateExpression).toContain('lockedUntil');
    db.on(QueryCommand).resolves({ Items: [{ ...user, passwordHash: await hashPassword('girasol'), lockedUntil: Math.floor(Date.now() / 1000) + 60 }] });
    expect((await login('girasol')).status).toBe(429);
  });

  it('gives the same answer for an unknown user and tolerates malformed input', async () => {
    db.on(QueryCommand).resolves({ Items: [] });
    expect((await login('girasol')).body.code).toBe('INVALID_LOGIN');
    expect((await call(handler, { method: 'POST', path: '/login', body: '{not json' })).status).toBe(400);
    expect((await call(handler, { method: 'POST', path: '/login', body: { name: { $ne: '' }, password: ['x'] } })).status).toBe(400);
  });

  it('issues admin sessions only to users stored as admins', async () => {
    db.on(QueryCommand).resolves({ Items: [{ ...user, role: 'admin', passwordHash: await hashPassword('girasol') }] });
    expect(await verifySession(`Bearer ${(await login('girasol')).body.sessionToken}`)).toMatchObject({ role: 'admin' });
  });
});

describe('POST /event-session', () => {
  beforeEach(() => db.reset());
  const redeem = (code: unknown) => call(handler, { method: 'POST', path: '/event-session', body: { code } });

  it('exchanges the wedding code for a guest session tied to that code version', async () => {
    db.on(GetCommand).resolves({ Item: { eventCode: 'Olivos2027', eventCodeVersion: 7 } });
    const { status, body } = await redeem(' olivos2027 ');
    expect(status).toBe(200);
    expect(await verifySession(`Bearer ${body.sessionToken}`)).toMatchObject({ role: 'guest', ev: 7 });
  });

  it('refuses a wrong code, and any code when none is configured', async () => {
    db.on(GetCommand).resolves({ Item: { eventCode: 'olivos2027' } });
    expect((await redeem('olivos2028')).status).toBe(401);
    db.on(GetCommand).resolves({ Item: {} });
    expect((await redeem('')).status).toBe(400);
    expect((await redeem('anything')).status).toBe(401);
  });
});

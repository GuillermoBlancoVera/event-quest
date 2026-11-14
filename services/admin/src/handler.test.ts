import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, configureTestEnvironment, qrSignature, tokenFor, verifyPassword } from '@event-quest/server';
import { handler } from './handler.js';

configureTestEnvironment();
const db = mockClient(DynamoDBDocumentClient);
const admin = { PK: 'USER#a1', SK: 'PROFILE', entity: 'USER', userId: 'a1', name: 'guille', role: 'admin', challengeAttempts: [], updatedAt: 'x' };
const asAdmin = () => tokenFor('a1', 'admin');

beforeEach(() => {
  db.reset();
  db.on(GetCommand, { TableName: 'users', Key: { PK: 'USER#a1', SK: 'PROFILE' } }).resolves({ Item: admin });
  db.on(PutCommand).resolves({}); db.on(DeleteCommand).resolves({}); db.on(QueryCommand).resolves({ Items: [] });
});

describe('admin API access', () => {
  it('is closed to anonymous callers, guests and players on every resource', async () => {
    for (const path of ['/admin/players', '/admin/challenges', '/admin/por-la-cara', '/admin/affiliations', '/admin/settings', '/admin/uploads']) {
      expect((await call(handler, { path })).status).toBe(401);
      expect((await call(handler, { method: 'POST', path, body: {}, token: await tokenFor('u1', 'player') })).status).toBe(403);
      expect((await call(handler, { method: 'DELETE', path: `${path}/x`, token: await tokenFor('guest:1', 'guest') })).status).toBe(403);
    }
    expect(db.calls()).toHaveLength(0);
  });

  it('stops working as soon as the account loses its admin role, even with a valid admin token', async () => {
    db.on(GetCommand, { TableName: 'users', Key: { PK: 'USER#a1', SK: 'PROFILE' } }).resolves({ Item: { ...admin, role: 'player' } });
    expect((await call(handler, { path: '/admin/players', token: await asAdmin() })).status).toBe(401);
  });
});

describe('players', () => {
  it('creates a player with a hashed password and audits who did it', async () => {
    const { status, body } = await call(handler, { method: 'POST', path: '/admin/players', token: await asAdmin(), body: { name: ' Sara ', password: 'girasol' } });
    expect(status).toBe(201);
    expect(body).toMatchObject({ name: 'sara', role: 'player', score: 0 });
    expect(body).not.toHaveProperty('passwordHash');
    const [player, audit] = db.commandCalls(PutCommand).map(item => item.args[0].input);
    expect(player.Item).not.toHaveProperty('password');
    expect(await verifyPassword('girasol', player.Item?.passwordHash)).toBe(true);
    expect(player.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(audit.Item).toMatchObject({ action: 'ADMIN_CREATE_PLAYER', userId: 'a1' });
  });

  it('rejects duplicate names and missing passwords', async () => {
    const token = await asAdmin();
    expect((await call(handler, { method: 'POST', path: '/admin/players', token, body: { name: 'sara' } })).status).toBe(400);
    db.on(QueryCommand).resolves({ Items: [{ entity: 'USER', userId: 'other', name: 'sara' }] });
    expect((await call(handler, { method: 'POST', path: '/admin/players', token, body: { name: 'sara', password: 'girasol' } })).body.code).toBe('NAME_TAKEN');
  });

  it('lists players without credentials', async () => {
    db.on(ScanCommand).resolves({ Items: [{ ...admin, passwordHash: 'scrypt$…', password: 'legacy', failedLogins: 2 }] });
    const { body } = await call(handler, { path: '/admin/players', token: await asAdmin() });
    expect(Object.keys(body[0])).not.toEqual(expect.arrayContaining(['passwordHash', 'password', 'failedLogins', 'PK']));
  });

  it('keeps progress on edit, closes old sessions on a password change, and protects the own account', async () => {
    const stored = { PK: 'USER#u1', SK: 'PROFILE', entity: 'USER', userId: 'u1', name: 'sara', team: 't', group: 'g', challengeAttempts: [{ challengeId: 1, correct: true, awardedPoints: 50, answeredAt: 'x' }], updatedAt: '2027-01-01' };
    db.on(GetCommand, { TableName: 'users', Key: { PK: 'USER#u1', SK: 'PROFILE' } }).resolves({ Item: stored });
    const token = await asAdmin();
    const { status, body } = await call(handler, { method: 'PUT', path: '/admin/players/u1', token, body: { name: 'sara', password: 'amapola' } });
    expect(status).toBe(200);
    expect(body.score).toBe(50);
    const put = db.commandCalls(PutCommand)[0].args[0].input;
    expect(put.Item).toMatchObject({ sessionsValidFrom: expect.any(Number), challengeAttempts: stored.challengeAttempts });
    expect(put).toMatchObject({ ConditionExpression: 'updatedAt = :previous', ExpressionAttributeValues: { ':previous': '2027-01-01' } });
    expect((await call(handler, { method: 'DELETE', path: '/admin/players/a1', token })).status).toBe(400);
    expect((await call(handler, { method: 'PUT', path: '/admin/players/a1', token, body: { name: 'guille', role: 'player' } })).status).toBe(400);
  });
});

describe('challenges', () => {
  it('validates the question and returns the signed QR path', async () => {
    db.on(ScanCommand).resolves({ Items: [{ PK: 'CHALLENGE#4', challengeId: 4 }] });
    const token = await asAdmin();
    const input = { title: 'La pedida', question: '¿Dónde fue?', answers: ['Roma', 'Lisboa'], correctAnswer: 'Lisboa', points: 100 };
    expect((await call(handler, { method: 'POST', path: '/admin/challenges', token, body: { ...input, correctAnswer: 'París' } })).status).toBe(400);
    expect((await call(handler, { method: 'POST', path: '/admin/challenges', token, body: { ...input, answers: ['Lisboa'] } })).status).toBe(400);
    const { status, body } = await call(handler, { method: 'POST', path: '/admin/challenges', token, body: input });
    expect(status).toBe(201);
    expect(body).toMatchObject({ challengeId: 5, qrProtected: true, qrPath: `/juego/reto/5?code=${await qrSignature('challenge', 5)}` });
  });
});

describe('settings', () => {
  it('bumps the code version when the wedding code changes, signing guests out', async () => {
    db.on(GetCommand, { TableName: 'settings' }).resolves({ Item: { eventCode: 'olivos2027', eventCodeVersion: 1 } });
    db.on(UpdateCommand).resolves({ Attributes: { eventCode: 'encinas2027', gameEnabled: true } });
    const token = await asAdmin();
    expect((await call(handler, { method: 'PUT', path: '/admin/settings', token, body: { eventCode: 'abc' } })).status).toBe(400);
    const { body } = await call(handler, { method: 'PUT', path: '/admin/settings', token, body: { eventCode: 'encinas2027', rankingFrozen: true } });
    expect(body).toEqual({ gameEnabled: true, maintenanceMode: false, rankingFrozen: false, eventCode: 'encinas2027' });
    const update = db.commandCalls(UpdateCommand)[0].args[0].input;
    expect(update.UpdateExpression).toContain('eventCodeVersion = :version');
    expect(update.UpdateExpression).toContain('rankingFrozenAt = :now');
  });
});

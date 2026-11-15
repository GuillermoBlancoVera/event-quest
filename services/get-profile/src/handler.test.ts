import { BatchGetCommand, DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, configureTestEnvironment, tokenFor } from '@event-quest/server';
import { handler } from './handler.js';

configureTestEnvironment();
const db = mockClient(DynamoDBDocumentClient);
const attempt = { challengeId: 3, answer: 'lisboa', correct: true, awardedPoints: 100, answeredAt: '2027-01-01T10:00:00.000Z' };
const user = (userId: string, extra: object = {}) => ({ PK: `USER#${userId}`, SK: 'PROFILE', entity: 'USER', userId, name: userId, team: 't', group: 'g', challengeAttempts: [attempt], passwordHash: 'scrypt$secret', failedLogins: 1, createdAt: 'x', updatedAt: 'x', ...extra });
const store = (...users: Array<ReturnType<typeof user>>) => {
  for (const item of users) db.on(GetCommand, { TableName: 'users', Key: { PK: item.PK, SK: 'PROFILE' } }).resolves({ Item: item });
};

beforeEach(() => {
  db.reset();
  db.on(GetCommand).resolves({});
  db.on(BatchGetCommand).resolves({ Responses: { challenges: [{ challengeId: 3, title: 'la pedida' }] } });
});

describe('GET /profile/{id}', () => {
  it('requires a player or admin session', async () => {
    expect((await call(handler, { path: '/profile/u2', id: 'u2' })).status).toBe(401);
    expect((await call(handler, { path: '/profile/u2', id: 'u2', token: await tokenFor('guest:1', 'guest') })).status).toBe(403);
    expect(db.calls()).toHaveLength(0);
  });

  it('returns the full profile, with history and scan code, to its owner', async () => {
    store(user('u1', { description: 'Baila fatal.' }));
    const { status, body } = await call(handler, { path: '/profile/me', id: 'me', token: await tokenFor('u1', 'player') });
    expect(status).toBe(200);
    expect(body).toMatchObject({ userId: 'u1', score: 100, description: 'Baila fatal.', history: [{ challengeId: 3, title: 'la pedida' }] });
    expect(body.scanCode).toMatch(/^u1\./);
    expect(body).not.toHaveProperty('passwordHash');
  });

  it("shows another player only the public card: name, photo and description, never answers or credentials", async () => {
    store(user('u1'), user('u2', { name: 'sara', gender: 'female', avatarKey: 'avatars/sara.jpg', description: 'La que más baila.', affiliationId: 'a1' }));
    const { status, body } = await call(handler, { path: '/profile/u2', id: 'u2', token: await tokenFor('u1', 'player') });
    expect(status).toBe(200);
    expect(body).toEqual({ userId: 'u2', name: 'sara', gender: 'female', avatarKey: 'avatars/sara.jpg', description: 'La que más baila.' });
    expect(db.commandCalls(BatchGetCommand)).toHaveLength(0);
  });

  it('hides admin accounts, unknown players and malformed ids from other players', async () => {
    store(user('u1'), user('a1', { role: 'admin' }));
    const token = await tokenFor('u1', 'player');
    expect((await call(handler, { path: '/profile/a1', id: 'a1', token })).status).toBe(404);
    expect((await call(handler, { path: '/profile/nadie', id: 'nadie', token })).status).toBe(404);
    const calls = db.calls().length;
    expect((await call(handler, { path: '/profile/x', id: '../SETTINGS#', token })).status).toBe(404);
    expect(db.calls()).toHaveLength(calls + 1); // only the caller's own session lookup
  });

  it('still gives an admin the full profile of any player', async () => {
    store(user('a1', { role: 'admin' }), user('u2'));
    const { body } = await call(handler, { path: '/profile/u2', id: 'u2', token: await tokenFor('a1', 'admin') });
    expect(body).toMatchObject({ userId: 'u2', score: 100 });
    expect(body.history).toHaveLength(1);
    expect(body).not.toHaveProperty('scanCode');
  });
});

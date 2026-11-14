import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, configureTestEnvironment, qrSignature, tokenFor } from '@event-quest/server';
import { handler } from './handler.js';

configureTestEnvironment();
const db = mockClient(DynamoDBDocumentClient);
const challenge = { PK: 'CHALLENGE#3', SK: 'DETAIL', challengeId: 3, title: 'la pedida', question: '¿dónde fue?', answers: ['roma', 'lisboa'], correctAnswer: 'lisboa', points: 100, enabled: true };
const player = (attempts: unknown[] = []) => ({ PK: 'USER#u1', SK: 'PROFILE', entity: 'USER', userId: 'u1', name: 'sara', challengeAttempts: attempts });
const mock = (storedChallenge: object, user: object) => {
  db.reset();
  db.on(GetCommand, { TableName: 'challenges' }).resolves({ Item: storedChallenge });
  db.on(GetCommand, { TableName: 'users' }).resolves({ Item: user });
};

describe('GET /question/{id}', () => {
  beforeEach(() => db.reset());

  it('requires a session', async () => {
    expect((await call(handler, { path: '/question/3', id: '3' })).status).toBe(401);
    expect((await call(handler, { path: '/question/3', id: '3', token: await tokenFor('guest:1', 'guest') })).status).toBe(403);
  });

  it('hides the solution until the caller has answered', async () => {
    mock(challenge, player());
    const { status, body } = await call(handler, { path: '/question/3', id: '3', token: await tokenFor('u1', 'player') });
    expect(status).toBe(200);
    expect(body).not.toHaveProperty('correctAnswer');
    expect(body.answers).toEqual(['roma', 'lisboa']);
  });

  it('ignores a userId in the query string: someone else having answered reveals nothing', async () => {
    mock(challenge, player());
    const { body } = await call(handler, { path: '/question/3', id: '3', query: { userId: 'someone-who-answered' }, token: await tokenFor('u1', 'player') });
    expect(body).not.toHaveProperty('correctAnswer');
    expect(db.commandCalls(GetCommand).filter(item => item.args[0].input.TableName === 'users').map(item => item.args[0].input.Key)).toEqual([{ PK: 'USER#u1', SK: 'PROFILE' }]);
  });

  it('shows the solution once the caller has used their attempt', async () => {
    mock(challenge, player([{ challengeId: 3, correct: false, awardedPoints: 0, answeredAt: 'x' }]));
    expect((await call(handler, { path: '/question/3', id: '3', token: await tokenFor('u1', 'player') })).body.correctAnswer).toBe('lisboa');
  });

  it('opens QR-protected challenges only with the code from the QR', async () => {
    mock({ ...challenge, qrProtected: true }, player());
    const token = await tokenFor('u1', 'player');
    expect((await call(handler, { path: '/question/3', id: '3', token })).body.code).toBe('QR_REQUIRED');
    expect((await call(handler, { path: '/question/3', id: '3', token, query: { code: 'guess' } })).status).toBe(403);
    expect((await call(handler, { path: '/question/3', id: '3', token, query: { code: await qrSignature('challenge', 3) } })).status).toBe(200);
  });

  it('rejects sessions of deleted users', async () => {
    db.on(GetCommand).resolves({});
    expect((await call(handler, { path: '/challenges', token: await tokenFor('gone', 'player') })).status).toBe(401);
  });
});

import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, configureTestEnvironment, tokenFor } from '@event-quest/server';
import { handler } from './handler.js';

configureTestEnvironment();
const db = mockClient(DynamoDBDocumentClient);
const challenge = { challengeId: 3, title: 'la pedida', question: '¿dónde fue?', answers: ['Roma', 'Lisboa'], correctAnswer: 'Lisboa', points: 100, enabled: true };
const user = (attempts: unknown[] = []) => ({ PK: 'USER#u1', SK: 'PROFILE', entity: 'USER', userId: 'u1', name: 'sara', challengeAttempts: attempts });
const submit = async (body: unknown, token?: string) => call(handler, { method: 'POST', path: '/submit-answer/3', id: '3', body, token });

describe('POST /submit-answer/{id}', () => {
  beforeEach(() => {
    db.reset();
    db.on(GetCommand, { TableName: 'challenges' }).resolves({ Item: challenge });
    db.on(GetCommand, { TableName: 'users' }).resolves({ Item: user() });
    db.on(GetCommand, { TableName: 'settings' }).resolves({});
    db.on(TransactWriteCommand).resolves({});
  });

  it('requires a session', async () => {
    expect((await submit({ answer: 'Lisboa' })).status).toBe(401);
  });

  it('records the answer for the session user, whatever userId the body claims', async () => {
    const { status, body } = await submit({ answer: ' lisboa ', userId: 'victim', challengeId: 99 }, await tokenFor('u1', 'player'));
    expect(status).toBe(200);
    expect(body).toMatchObject({ correct: true, awardedPoints: 100, score: 100 });
    const [update, audit] = db.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems!;
    expect(update.Update?.Key).toEqual({ PK: 'USER#u1', SK: 'PROFILE' });
    expect(audit.Put?.Item).toMatchObject({ action: 'SUBMIT_CHALLENGE', userId: 'u1', sourceIp: '203.0.113.7', metadata: { challengeId: 3 } });
  });

  it('scores a wrong option as zero and refuses answers that are not options', async () => {
    const token = await tokenFor('u1', 'player');
    expect((await submit({ answer: 'Roma' }, token)).body).toMatchObject({ correct: false, awardedPoints: 0 });
    expect((await submit({ answer: 'París' }, token)).status).toBe(400);
    expect((await submit({ answer: { $gt: '' } }, token)).status).toBe(400);
  });

  it('allows a single attempt per challenge', async () => {
    db.on(GetCommand, { TableName: 'users' }).resolves({ Item: user([{ challengeId: 3, correct: false, awardedPoints: 0, answeredAt: 'x' }]) });
    expect((await submit({ answer: 'Lisboa' }, await tokenFor('u1', 'player'))).body.code).toBe('ALREADY_PLAYED');
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('respects the game being closed and QR protection', async () => {
    const token = await tokenFor('u1', 'player');
    db.on(GetCommand, { TableName: 'settings' }).resolves({ Item: { gameEnabled: false } });
    expect((await submit({ answer: 'Lisboa' }, token)).status).toBe(503);
    db.on(GetCommand, { TableName: 'settings' }).resolves({});
    db.on(GetCommand, { TableName: 'challenges' }).resolves({ Item: { ...challenge, qrProtected: true } });
    expect((await submit({ answer: 'Lisboa' }, token)).body.code).toBe('QR_REQUIRED');
  });
});

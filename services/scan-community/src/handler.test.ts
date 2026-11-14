import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, configureTestEnvironment, qrSignature, tokenFor } from '@event-quest/server';
import { handler } from './handler.js';

configureTestEnvironment();
const db = mockClient(DynamoDBDocumentClient);
const user = (userId: string, affiliationId: string) => ({ PK: `USER#${userId}`, SK: 'PROFILE', entity: 'USER', userId, name: userId, affiliationId, challengeAttempts: [], communityScans: [] });
const scan = async (code: string, token?: string) => call(handler, { method: 'POST', path: `/community-scan/${code}`, id: code, body: {}, token });

describe('POST /community-scan/{code}', () => {
  beforeEach(() => {
    db.reset();
    db.on(GetCommand, { TableName: 'users', Key: { PK: 'USER#u1', SK: 'PROFILE' } }).resolves({ Item: user('u1', 'olivos') });
    db.on(GetCommand, { TableName: 'users', Key: { PK: 'USER#u2', SK: 'PROFILE' } }).resolves({ Item: user('u2', 'encinas') });
    db.on(GetCommand, { TableName: 'affiliations', Key: { PK: 'AFFILIATION#olivos', SK: 'PROFILE' } }).resolves({ Item: { affiliationId: 'olivos', name: 'olivos' } });
    db.on(GetCommand, { TableName: 'affiliations', Key: { PK: 'AFFILIATION#encinas', SK: 'PROFILE' } }).resolves({ Item: { affiliationId: 'encinas', name: 'encinas' } });
    db.on(GetCommand, { TableName: 'settings' }).resolves({});
    db.on(TransactWriteCommand).resolves({});
  });

  it('refuses a bare user id taken from the ranking', async () => {
    const token = await tokenFor('u1', 'player');
    expect((await scan('u2', token)).body.code).toBe('INVALID_SCAN');
    expect((await scan('u2.AAAAAAAAAAAAAAAA', token)).body.code).toBe('INVALID_SCAN');
    expect(db.commandCalls(TransactWriteCommand)).toHaveLength(0);
  });

  it('registers the meeting for the session user when the QR signature is genuine', async () => {
    const { status, body } = await scan(`u2.${await qrSignature('scan', 'u2')}`, await tokenFor('u1', 'player'));
    expect(status).toBe(200);
    expect(body).toMatchObject({ awardedPoints: 50, progress: 1, community: { affiliationId: 'encinas' } });
    expect(db.commandCalls(TransactWriteCommand)[0].args[0].input.TransactItems![0].Update?.Key).toEqual({ PK: 'USER#u1', SK: 'PROFILE' });
  });

  it('does not let players scan themselves and requires a session', async () => {
    const own = `u1.${await qrSignature('scan', 'u1')}`;
    expect((await scan(own, await tokenFor('u1', 'player'))).body.code).toBe('INVALID_SCAN');
    expect((await scan(own)).status).toBe(401);
  });
});

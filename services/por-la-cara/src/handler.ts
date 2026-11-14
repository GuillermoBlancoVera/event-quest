import { BatchGetCommand, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { ClaimPorLaCaraResponse, PorLaCaraAttempt, PorLaCaraChallenge, PorLaCaraChallengeListItem } from '@event-quest/shared';
import { api, assertGameOpen, auditItem, db, getSettings, HttpError, porLaCaraKey, reply, requireSession, requireUser, scoreOf, tables, userKey } from '@event-quest/server';

type StoredPorLaCara = PorLaCaraChallenge & { type?: string };

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  const session = await requireSession(event, ['admin', 'player']);
  const user = await requireUser(session);
  const attempts = user.porLaCaraAttempts ?? [];
  const id = event.pathParameters?.id;

  if (!id) {
    // The id of a "por la cara" is the secret in its QR, so players only ever see the ones they already claimed.
    const claimed = [...new Set(attempts.map(attempt => attempt.porLaCaraId))];
    const challenges: StoredPorLaCara[] = [];
    for (let index = 0; index < claimed.length; index += 100) {
      const result = await db.send(new BatchGetCommand({ RequestItems: { [tables.challenges()]: { Keys: claimed.slice(index, index + 100).map(porLaCaraKey) } } }));
      challenges.push(...(result.Responses?.[tables.challenges()] ?? []) as StoredPorLaCara[]);
    }
    const response: PorLaCaraChallengeListItem[] = challenges.map(({ porLaCaraId, title, description, points }) => ({ porLaCaraId, title, description, points })).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    return reply(200, response);
  }

  const challengeResult = await db.send(new GetCommand({ TableName: tables.challenges(), Key: porLaCaraKey(id) }));
  const stored = challengeResult.Item as StoredPorLaCara | undefined;
  if (!stored || stored.type !== 'POR_LA_CARA' || !stored.enabled) throw new HttpError(404, 'NOT_FOUND', 'este reto por la cara no está disponible.');
  const { porLaCaraId, title, description, points, enabled, createdAt, updatedAt } = stored;
  const challenge: PorLaCaraChallenge = { porLaCaraId, title, description, points, enabled, createdAt, updatedAt };
  if (event.requestContext.http.method === 'GET') return reply(200, challenge);

  assertGameOpen(await getSettings());
  if (attempts.some(attempt => attempt.porLaCaraId === id)) throw new HttpError(409, 'ALREADY_CLAIMED', 'ya has usado este qr.');
  const now = new Date().toISOString();
  const attempt: PorLaCaraAttempt = { porLaCaraId: id, awardedPoints: challenge.points, claimedAt: now };
  try {
    await db.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: tables.users(), Key: userKey(user.userId), UpdateExpression: 'SET porLaCaraAttempts = list_append(if_not_exists(porLaCaraAttempts, :empty), :attempt), updatedAt = :now', ConditionExpression: 'attribute_not_exists(porLaCaraAttempts) OR size(porLaCaraAttempts) = :count', ExpressionAttributeValues: { ':empty': [], ':attempt': [attempt], ':count': attempts.length, ':now': now } } },
      { Put: { TableName: tables.audit(), Item: auditItem('CLAIM_POR_LA_CARA', event, session, { porLaCaraId: id, awardedPoints: attempt.awardedPoints }) } },
    ] }));
  } catch (error) {
    if ((error as { name?: string }).name === 'TransactionCanceledException') throw new HttpError(409, 'CLAIM_CONFLICT', 'este qr ya se está registrando. vuelve a intentarlo.');
    throw error;
  }
  const response: ClaimPorLaCaraResponse = { awardedPoints: attempt.awardedPoints, score: scoreOf(user) + attempt.awardedPoints, attempt };
  return reply(200, response);
});

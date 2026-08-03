import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { ClaimPorLaCaraResponse, PorLaCaraChallenge, PorLaCaraChallengeListItem, PorLaCaraAttempt, Settings, User } from '@event-quest/shared';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
const score = (user: User) => (user.challengeAttempts ?? []).reduce((total, attempt) => total + attempt.awardedPoints, 0) + (user.communityScans ?? []).reduce((total, scan) => total + scan.awardedPoints, 0) + (user.porLaCaraAttempts ?? []).reduce((total, attempt) => total + attempt.awardedPoints, 0);

export const handler: APIGatewayProxyHandlerV2 = async event => {
  const path = event.requestContext.http.path;
  if (path === '/por-la-cara') {
    const result = await db.send(new ScanCommand({ TableName: process.env.CHALLENGES_TABLE, FilterExpression: '#type = :type AND enabled = :enabled', ExpressionAttributeNames: { '#type': 'type' }, ExpressionAttributeValues: { ':type': 'POR_LA_CARA', ':enabled': true } }));
    const challenges = (result.Items ?? []) as PorLaCaraChallenge[];
    const response: PorLaCaraChallengeListItem[] = challenges.map(({ porLaCaraId, title, description, points }) => ({ porLaCaraId, title, description, points })).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    return reply(200, response);
  }

  const id = event.pathParameters?.id;
  if (!id) return reply(400, { code: 'VALIDATION_ERROR', message: 'el identificador es obligatorio.' });
  const challengeResult = await db.send(new GetCommand({ TableName: process.env.CHALLENGES_TABLE, Key: { PK: `POR_LA_CARA#${id}`, SK: 'DETAIL' } }));
  const challenge = challengeResult.Item as (PorLaCaraChallenge & { type?: string }) | undefined;
  if (!challenge || challenge.type !== 'POR_LA_CARA' || !challenge.enabled) return reply(404, { code: 'NOT_FOUND', message: 'este reto por la cara no está disponible.' });
  if (event.requestContext.http.method === 'GET') return reply(200, challenge);

  const input = JSON.parse(event.body ?? '{}') as { userId?: string };
  if (!input.userId) return reply(400, { code: 'VALIDATION_ERROR', message: 'falta el jugador.' });
  const [userResult, settingsResult] = await Promise.all([
    db.send(new GetCommand({ TableName: process.env.USERS_TABLE, Key: { PK: `USER#${input.userId}`, SK: 'PROFILE' } })),
    db.send(new GetCommand({ TableName: process.env.SETTINGS_TABLE, Key: { PK: 'SETTINGS', SK: 'GAME' } }))
  ]);
  const user = userResult.Item as User | undefined;
  const settings = settingsResult.Item as Settings | undefined;
  if (!user) return reply(404, { code: 'NOT_FOUND', message: 'no se ha encontrado el jugador.' });
  if (settings?.maintenanceMode || settings?.gameEnabled === false) return reply(503, { code: 'GAME_UNAVAILABLE', message: 'el juego no está disponible ahora mismo.' });
  const attempts = user.porLaCaraAttempts ?? [];
  if (attempts.some(attempt => attempt.porLaCaraId === id)) return reply(409, { code: 'ALREADY_CLAIMED', message: 'ya has usado este qr.' });
  const now = new Date().toISOString();
  const attempt: PorLaCaraAttempt = { porLaCaraId: id, awardedPoints: challenge.points, claimedAt: now };
  try {
    await db.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: process.env.USERS_TABLE, Key: { PK: `USER#${user.userId}`, SK: 'PROFILE' }, UpdateExpression: 'SET porLaCaraAttempts = list_append(if_not_exists(porLaCaraAttempts, :empty), :attempt), updatedAt = :now', ConditionExpression: 'attribute_not_exists(porLaCaraAttempts) OR size(porLaCaraAttempts) = :count', ExpressionAttributeValues: { ':empty': [], ':attempt': [attempt], ':count': attempts.length, ':now': now } } },
      { Put: { TableName: process.env.AUDIT_TABLE, Item: { PK: `AUDIT#${now.slice(0, 10)}`, SK: `${now}#POR_LA_CARA`, timestamp: now, action: 'CLAIM_POR_LA_CARA', userId: user.userId, metadata: { porLaCaraId: id, awardedPoints: attempt.awardedPoints } } } }
    ] }));
  } catch {
    return reply(409, { code: 'CLAIM_CONFLICT', message: 'este qr ya se está registrando. vuelve a intentarlo.' });
  }
  const response: ClaimPorLaCaraResponse = { awardedPoints: attempt.awardedPoints, score: score(user) + attempt.awardedPoints, attempt };
  return reply(200, response);
};

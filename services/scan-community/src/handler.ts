import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { Affiliation, CommunityScan, CommunityScanResponse, Settings, User } from '@event-quest/shared';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
const target = 5;

async function communityFor(user: User) {
  if (!user.affiliationId) return undefined;
  const affiliationResult = await db.send(new GetCommand({ TableName: process.env.AFFILIATIONS_TABLE, Key: { PK: `AFFILIATION#${user.affiliationId}`, SK: 'PROFILE' } }));
  const affiliation = affiliationResult.Item as Affiliation | undefined;
  if (!affiliation) return undefined;
  if (!affiliation.parentAffiliationId) return affiliation;
  const parentResult = await db.send(new GetCommand({ TableName: process.env.AFFILIATIONS_TABLE, Key: { PK: `AFFILIATION#${affiliation.parentAffiliationId}`, SK: 'PROFILE' } }));
  return parentResult.Item as Affiliation | undefined;
}

export const handler: APIGatewayProxyHandlerV2 = async event => {
  const playerId = event.pathParameters?.id;
  const input = JSON.parse(event.body ?? '{}') as { userId?: string };
  if (!playerId || !input.userId) return reply(400, { code: 'VALIDATION_ERROR', message: 'faltan los datos del encuentro.' });
  if (playerId === input.userId) return reply(400, { code: 'INVALID_SCAN', message: 'no puedes escanear tu propio qr.' });

  const [sourceResult, playerResult, settingsResult] = await Promise.all([
    db.send(new GetCommand({ TableName: process.env.USERS_TABLE, Key: { PK: `USER#${input.userId}`, SK: 'PROFILE' } })),
    db.send(new GetCommand({ TableName: process.env.USERS_TABLE, Key: { PK: `USER#${playerId}`, SK: 'PROFILE' } })),
    db.send(new GetCommand({ TableName: process.env.SETTINGS_TABLE, Key: { PK: 'SETTINGS', SK: 'GAME' } }))
  ]);
  const source = sourceResult.Item as User | undefined;
  const player = playerResult.Item as User | undefined;
  const settings = settingsResult.Item as Settings | undefined;
  if (!source || !player) return reply(404, { code: 'NOT_FOUND', message: 'no hemos encontrado a ese jugador.' });
  if (settings?.maintenanceMode || settings?.gameEnabled === false) return reply(503, { code: 'GAME_UNAVAILABLE', message: 'el juego no está disponible ahora mismo.' });

  const [sourceCommunity, playerCommunity] = await Promise.all([communityFor(source), communityFor(player)]);
  if (!sourceCommunity || !playerCommunity) return reply(400, { code: 'MISSING_COMMUNITY', message: 'ambos jugadores deben pertenecer a una comunidad.' });
  if (sourceCommunity.affiliationId === playerCommunity.affiliationId) return reply(400, { code: 'SAME_COMMUNITY', message: 'este jugador pertenece a tu misma comunidad.' });
  const scans = source.communityScans ?? [];
  const existingScan = scans.find(scan => scan.communityId === playerCommunity.affiliationId);
  if (existingScan) {
    const response: CommunityScanResponse = { awardedPoints: 0, progress: scans.length, target, alreadyScanned: true, scan: existingScan, player: { userId: player.userId, name: player.name, avatarKey: player.avatarKey }, community: playerCommunity };
    return reply(200, response);
  }
  if (scans.length >= target) return reply(409, { code: 'CHALLENGE_COMPLETE', message: 'ya has completado este reto.' });

  const now = new Date().toISOString();
  const scan: CommunityScan = { communityId: playerCommunity.affiliationId, scannedPlayerId: player.userId, awardedPoints: 50, scannedAt: now };
  try {
    await db.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: process.env.USERS_TABLE, Key: { PK: `USER#${source.userId}`, SK: 'PROFILE' }, UpdateExpression: 'SET communityScans = list_append(if_not_exists(communityScans, :empty), :scan), updatedAt = :now', ConditionExpression: 'attribute_not_exists(communityScans) OR size(communityScans) = :count', ExpressionAttributeValues: { ':empty': [], ':scan': [scan], ':count': scans.length, ':now': now } } },
      { Put: { TableName: process.env.AUDIT_TABLE, Item: { PK: `AUDIT#${now.slice(0, 10)}`, SK: `${now}#SCAN`, timestamp: now, action: 'SCAN_COMMUNITY', userId: source.userId, metadata: { playerId: player.userId, communityId: playerCommunity.affiliationId, awardedPoints: scan.awardedPoints } } } }
    ] }));
  } catch {
    return reply(409, { code: 'SCAN_CONFLICT', message: 'el encuentro ya se está registrando. vuelve a intentarlo.' });
  }
  const response: CommunityScanResponse = { awardedPoints: scan.awardedPoints, progress: scans.length + 1, target, scan, player: { userId: player.userId, name: player.name, avatarKey: player.avatarKey }, community: playerCommunity };
  return reply(200, response);
};

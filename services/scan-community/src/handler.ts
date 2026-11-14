import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { Affiliation, CommunityScan, CommunityScanResponse, User } from '@event-quest/shared';
import { affiliationKey, api, assertGameOpen, auditItem, db, getSettings, getUser, HttpError, qrSignatureMatches, reply, requireSession, requireUser, tables, userKey } from '@event-quest/server';

const target = 5;

const getAffiliation = async (affiliationId: string) => {
  const result = await db.send(new GetCommand({ TableName: tables.affiliations(), Key: affiliationKey(affiliationId) }));
  return result.Item as Affiliation | undefined;
};

async function communityFor(user: User) {
  if (!user.affiliationId) return undefined;
  const affiliation = await getAffiliation(user.affiliationId);
  if (!affiliation?.parentAffiliationId) return affiliation;
  return getAffiliation(affiliation.parentAffiliationId);
}

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  const session = await requireSession(event, ['admin', 'player']);
  // The QR carries "<userId>.<signature>", so knowing someone's id from the ranking is not enough to register a meeting.
  const [playerId, signature] = (event.pathParameters?.id ?? '').split('.');
  if (!playerId || !await qrSignatureMatches('scan', playerId, signature)) throw new HttpError(400, 'INVALID_SCAN', 'este qr no es válido. pide a la otra persona que te enseñe el suyo desde su perfil.');

  const [source, player, settings] = await Promise.all([requireUser(session), getUser(playerId), getSettings()]);
  if (playerId === source.userId) throw new HttpError(400, 'INVALID_SCAN', 'no puedes escanear tu propio qr.');
  if (!player) throw new HttpError(404, 'NOT_FOUND', 'no hemos encontrado a ese jugador.');
  assertGameOpen(settings);

  const [sourceCommunity, playerCommunity] = await Promise.all([communityFor(source), communityFor(player)]);
  if (!sourceCommunity || !playerCommunity) throw new HttpError(400, 'MISSING_COMMUNITY', 'ambos jugadores deben pertenecer a una comunidad.');
  if (sourceCommunity.affiliationId === playerCommunity.affiliationId) throw new HttpError(400, 'SAME_COMMUNITY', 'este jugador pertenece a tu misma comunidad.');
  const scans = source.communityScans ?? [];
  const summary = { userId: player.userId, name: player.name, avatarKey: player.avatarKey };
  const existingScan = scans.find(scan => scan.communityId === playerCommunity.affiliationId);
  if (existingScan) {
    const response: CommunityScanResponse = { awardedPoints: 0, progress: scans.length, target, alreadyScanned: true, scan: existingScan, player: summary, community: playerCommunity };
    return reply(200, response);
  }
  if (scans.length >= target) throw new HttpError(409, 'CHALLENGE_COMPLETE', 'ya has completado este reto.');

  const now = new Date().toISOString();
  const scan: CommunityScan = { communityId: playerCommunity.affiliationId, scannedPlayerId: player.userId, awardedPoints: 50, scannedAt: now };
  try {
    await db.send(new TransactWriteCommand({ TransactItems: [
      { Update: { TableName: tables.users(), Key: userKey(source.userId), UpdateExpression: 'SET communityScans = list_append(if_not_exists(communityScans, :empty), :scan), updatedAt = :now', ConditionExpression: 'attribute_not_exists(communityScans) OR size(communityScans) = :count', ExpressionAttributeValues: { ':empty': [], ':scan': [scan], ':count': scans.length, ':now': now } } },
      { Put: { TableName: tables.audit(), Item: auditItem('SCAN_COMMUNITY', event, session, { playerId: player.userId, communityId: playerCommunity.affiliationId, awardedPoints: scan.awardedPoints }) } },
    ] }));
  } catch (error) {
    if ((error as { name?: string }).name === 'TransactionCanceledException') throw new HttpError(409, 'SCAN_CONFLICT', 'el encuentro ya se está registrando. vuelve a intentarlo.');
    throw error;
  }
  const response: CommunityScanResponse = { awardedPoints: scan.awardedPoints, progress: scans.length + 1, target, scan, player: summary, community: playerCommunity };
  return reply(200, response);
});

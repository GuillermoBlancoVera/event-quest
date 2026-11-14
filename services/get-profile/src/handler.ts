import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { Challenge, PlayerProfile } from '@event-quest/shared';
import { api, challengeKey, db, getUser, HttpError, publicUser, qrSignature, reply, requireSession, requireUser, scoreOf, tables } from '@event-quest/server';

const titlesFor = async (challengeIds: number[]) => {
  const titles = new Map<number, string>();
  for (let index = 0; index < challengeIds.length; index += 100) {
    const result = await db.send(new BatchGetCommand({ RequestItems: { [tables.challenges()]: { Keys: challengeIds.slice(index, index + 100).map(challengeKey) } } }));
    for (const challenge of (result.Responses?.[tables.challenges()] ?? []) as Array<Pick<Challenge, 'challengeId' | 'title'>>) titles.set(challenge.challengeId, challenge.title);
  }
  return titles;
};

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  const session = await requireSession(event, ['admin', 'player']);
  const caller = await requireUser(session);
  const requested = event.pathParameters?.id;
  const own = !requested || requested === 'me' || requested === caller.userId;
  // A profile includes the full answer history, so only its owner (or an admin) may read it.
  if (!own && session.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Solo puedes ver tu propio perfil.');
  const stored = own ? caller : await getUser(requested);
  if (!stored) throw new HttpError(404, 'NOT_FOUND', 'No se ha encontrado el jugador.');

  const user = publicUser(stored);
  const titles = await titlesFor([...new Set(user.challengeAttempts.map(attempt => attempt.challengeId))]);
  const history = user.challengeAttempts.map(attempt => ({ ...attempt, title: titles.get(attempt.challengeId) ?? `Reto ${attempt.challengeId}` })).sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
  const profile: PlayerProfile = { ...user, score: scoreOf(user), history, scanCode: own ? `${user.userId}.${await qrSignature('scan', user.userId)}` : undefined };
  return reply(200, profile);
});

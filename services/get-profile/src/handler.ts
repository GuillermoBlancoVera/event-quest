import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { Challenge, PlayerProfile, PublicProfile } from '@event-quest/shared';
import { api, challengeKey, db, getUser, HttpError, publicUser, qrSignature, reply, requireSession, requireUser, scoreOf, tables } from '@event-quest/server';

const titlesFor = async (challengeIds: number[]) => {
  const titles = new Map<number, string>();
  for (let index = 0; index < challengeIds.length; index += 100) {
    const result = await db.send(new BatchGetCommand({ RequestItems: { [tables.challenges()]: { Keys: challengeIds.slice(index, index + 100).map(challengeKey) } } }));
    for (const challenge of (result.Responses?.[tables.challenges()] ?? []) as Array<Pick<Challenge, 'challengeId' | 'title'>>) titles.set(challenge.challengeId, challenge.title);
  }
  return titles;
};

const userIdPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const notFound = () => new HttpError(404, 'NOT_FOUND', 'No se ha encontrado el jugador.');

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  const session = await requireSession(event, ['admin', 'player']);
  const caller = await requireUser(session);
  const requested = event.pathParameters?.id;
  const own = !requested || requested === 'me' || requested === caller.userId;
  if (!own && !userIdPattern.test(requested)) throw notFound();
  const stored = own ? caller : await getUser(requested);
  if (!stored) throw notFound();
  // A full profile includes the answer history, so only its owner (or an admin) may read it.
  // Everyone else gets the public card, built field by field so nothing new leaks by default.
  if (!own && session.role !== 'admin') {
    // Admin accounts are not players: they stay out of the ranking and have no public profile.
    if (stored.role === 'admin') throw notFound();
    const card: PublicProfile = { userId: stored.userId, name: stored.name, gender: stored.gender, avatarKey: stored.avatarKey, description: stored.description };
    return reply(200, card);
  }

  const user = publicUser(stored);
  const titles = await titlesFor([...new Set(user.challengeAttempts.map(attempt => attempt.challengeId))]);
  const history = user.challengeAttempts.map(attempt => ({ ...attempt, title: titles.get(attempt.challengeId) ?? `Reto ${attempt.challengeId}` })).sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
  const profile: PlayerProfile = { ...user, score: scoreOf(user), history, scanCode: own ? `${user.userId}.${await qrSignature('scan', user.userId)}` : undefined };
  return reply(200, profile);
});

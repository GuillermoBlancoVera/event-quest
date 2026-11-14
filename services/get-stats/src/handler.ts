import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { Challenge, RankingEntry, Stats, User } from '@event-quest/shared';
import { api, projection, reply, requireSession, requireUser, scanAll, scoreOf, tables } from '@event-quest/server';

const communityChallenges = 5;
const completed = (user: User) => new Set((user.challengeAttempts ?? []).filter(attempt => attempt.correct).map(attempt => attempt.challengeId)).size + new Set((user.communityScans ?? []).map(scan => scan.communityId)).size;
const entry = (user: User | undefined): RankingEntry | undefined => user && ({ rank: 0, userId: user.userId, name: user.name, team: user.team, group: user.group, score: scoreOf(user), completed: completed(user), lastActivityAt: user.updatedAt, attempted: 0 });

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  await requireUser(await requireSession(event, ['admin', 'player']));
  const [users, challenges] = await Promise.all([
    scanAll<User>({ TableName: tables.users(), FilterExpression: '#p_entity = :entity', ExpressionAttributeValues: { ':entity': 'USER' }, ...projection(['entity', 'userId', 'name', 'role', 'team', 'group', 'challengeAttempts', 'communityScans', 'porLaCaraAttempts', 'updatedAt']) }),
    scanAll<Challenge>({ TableName: tables.challenges() }),
  ]);
  const players = users.filter(user => user.role !== 'admin');
  const total = challenges.filter(challenge => challenge.enabled && typeof challenge.challengeId === 'number').length + communityChallenges;
  const mostActive = [...players].sort((a, b) => completed(b) - completed(a))[0];
  const fastest = [...players].sort((a, b) => (a.updatedAt ?? '').localeCompare(b.updatedAt ?? ''))[0];
  const stats: Stats = {
    players: players.length,
    challenges: total,
    completionPercentage: players.length && total ? Math.round(players.reduce((sum, user) => sum + completed(user), 0) / (players.length * total) * 100) : 0,
    mostActivePlayer: entry(mostActive),
    fastestPlayer: entry(fastest),
  };
  return reply(200, stats);
});

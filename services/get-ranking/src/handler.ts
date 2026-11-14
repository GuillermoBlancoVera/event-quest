import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { Affiliation, RankingEntry, RankingResponse, RankingScope, User } from '@event-quest/shared';
import { affiliationKey, api, db, getSettings, projection, reply, requireSession, requireUser, scanAll, scoreOf, tables } from '@event-quest/server';

const loadProfiles = async (ids: string[]) => {
  const results: Affiliation[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const response = await db.send(new BatchGetCommand({ RequestItems: { [tables.affiliations()]: { Keys: ids.slice(index, index + 100).map(affiliationKey) } } }));
    results.push(...(response.Responses?.[tables.affiliations()] ?? []) as Affiliation[]);
  }
  return results;
};
const cleanAffiliation = (item: Affiliation | undefined): Affiliation | undefined => item && { affiliationId: item.affiliationId, name: item.name, parentAffiliationId: item.parentAffiliationId, avatarKey: item.avatarKey, story: item.story, createdAt: item.createdAt, updatedAt: item.updatedAt };

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  await requireUser(await requireSession(event, ['admin', 'player']));
  const requestedScope = event.queryStringParameters?.scope;
  const scope: RankingScope = requestedScope === 'team' || requestedScope === 'group' ? requestedScope : 'global';
  const filter = event.queryStringParameters?.filter;
  // Credentials are never read here: the projection leaves the password attributes in the table.
  const [allUsers, settings] = await Promise.all([
    scanAll<User>({ TableName: tables.users(), FilterExpression: '#p_entity = :entity', ExpressionAttributeValues: { ':entity': 'USER' }, ...projection(['entity', 'userId', 'name', 'role', 'gender', 'team', 'group', 'affiliationId', 'challengeAttempts', 'communityScans', 'porLaCaraAttempts', 'avatarKey', 'updatedAt']) }),
    getSettings(),
  ]);
  const users = allUsers.filter(user => user.role !== 'admin');
  // While the ranking is frozen, points earned after the freeze stay hidden until it is released.
  const frozenAt = settings?.rankingFrozenAt || undefined;
  const score = (user: User) => scoreOf(user, frozenAt);

  const profilesById = new Map<string, Affiliation>();
  const requested = new Set<string>();
  let pending = [...new Set(users.flatMap(user => user.affiliationId ? [user.affiliationId] : []))];
  while (pending.length) {
    pending.forEach(id => requested.add(id));
    const profiles = await loadProfiles(pending);
    profiles.forEach(profile => profilesById.set(profile.affiliationId, cleanAffiliation(profile)!));
    pending = [...new Set(profiles.flatMap(profile => profile.parentAffiliationId && !requested.has(profile.parentAffiliationId) ? [profile.parentAffiliationId] : []))];
  }
  const scoreByAffiliation = new Map<string, number>();
  for (const user of users) {
    const visited = new Set<string>();
    let affiliationId = user.affiliationId;
    while (affiliationId && !visited.has(affiliationId)) {
      visited.add(affiliationId);
      scoreByAffiliation.set(affiliationId, (scoreByAffiliation.get(affiliationId) ?? 0) + score(user));
      affiliationId = profilesById.get(affiliationId)?.parentAffiliationId;
    }
  }
  const entries = users.filter(user => !filter || scope === 'global' || user[scope] === filter).sort((a, b) => score(b) - score(a) || (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '')).map((user, index): RankingEntry => {
    const affiliation = user.affiliationId ? profilesById.get(user.affiliationId) : undefined;
    const parentAffiliation = affiliation?.parentAffiliationId ? profilesById.get(affiliation.parentAffiliationId) : undefined;
    const attempts = user.challengeAttempts ?? [];
    const communities = new Set((user.communityScans ?? []).map(scan => scan.communityId)).size;
    const attempted = new Set(attempts.map(attempt => attempt.challengeId)).size + communities;
    const completed = new Set(attempts.filter(attempt => attempt.correct).map(attempt => attempt.challengeId)).size + communities;
    return { rank: index + 1, userId: user.userId, name: user.name, gender: user.gender, team: user.team, group: user.group, score: score(user), completed, attempted, avatarKey: user.avatarKey, affiliation, parentAffiliation, lastActivityAt: user.updatedAt };
  });
  const response: RankingResponse = { scope, entries, affiliationScores: Object.fromEntries(scoreByAffiliation), frozen: Boolean(frozenAt) };
  return reply(200, response);
});

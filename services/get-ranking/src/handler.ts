import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { Affiliation, RankingEntry, Settings, User } from '@event-quest/shared';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
const score = (user: User) => (user.challengeAttempts ?? []).reduce((total, attempt) => total + attempt.awardedPoints, 0) + (user.communityScans ?? []).reduce((total, scan) => total + scan.awardedPoints, 0) + (user.porLaCaraAttempts ?? []).reduce((total, attempt) => total + attempt.awardedPoints, 0);
const loadProfiles = async (ids: string[]) => {
  const results: Affiliation[] = [];
  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100);
    const response = await db.send(new BatchGetCommand({ RequestItems: { [process.env.AFFILIATIONS_TABLE!]: { Keys: batch.map(affiliationId => ({ PK: `AFFILIATION#${affiliationId}`, SK: 'PROFILE' })) } } }));
    results.push(...(response.Responses?.[process.env.AFFILIATIONS_TABLE!] ?? []) as Affiliation[]);
  }
  return results;
};

export const handler: APIGatewayProxyHandlerV2 = async event => {
  const scope = event.queryStringParameters?.scope ?? 'global';
  const filter = event.queryStringParameters?.filter;
  const [usersResult, settingsResult] = await Promise.all([db.send(new ScanCommand({ TableName: process.env.USERS_TABLE, FilterExpression: 'entity = :entity', ExpressionAttributeValues: { ':entity': 'USER' } })), db.send(new GetCommand({ TableName: process.env.SETTINGS_TABLE, Key: { PK: 'SETTINGS', SK: 'GAME' } }))]);
  const users = (usersResult.Items ?? []) as User[];
  const profilesById = new Map<string, Affiliation>();
  let pending = [...new Set(users.flatMap(user => user.affiliationId ? [user.affiliationId] : []))];
  while (pending.length) {
    const profiles = await loadProfiles(pending);
    profiles.forEach(profile => profilesById.set(profile.affiliationId, profile));
    pending = [...new Set(profiles.flatMap(profile => profile.parentAffiliationId && !profilesById.has(profile.parentAffiliationId) ? [profile.parentAffiliationId] : []))];
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
  const entries = users.filter(user => !filter || user[scope as 'team' | 'group'] === filter).sort((a, b) => score(b) - score(a) || a.updatedAt.localeCompare(b.updatedAt)).map((user, index): RankingEntry => {
    const affiliation = user.affiliationId ? profilesById.get(user.affiliationId) : undefined;
    const parentAffiliation = affiliation?.parentAffiliationId ? profilesById.get(affiliation.parentAffiliationId) : undefined;
    const attempts = user.challengeAttempts ?? [];
    const attempted = new Set(attempts.map(attempt => attempt.challengeId)).size + new Set((user.communityScans ?? []).map(scan => scan.communityId)).size;
    const completed = new Set(attempts.filter(attempt => attempt.correct).map(attempt => attempt.challengeId)).size + new Set((user.communityScans ?? []).map(scan => scan.communityId)).size;
    return { rank: index + 1, userId: user.userId, name: user.name, gender: user.gender, team: user.team, group: user.group, score: score(user), completed, attempted, avatarKey: user.avatarKey, affiliation, parentAffiliation, lastActivityAt: user.updatedAt };
  });
  return reply(200, { scope, entries, affiliationScores: Object.fromEntries(scoreByAffiliation), frozen: Boolean((settingsResult.Item as Settings | undefined)?.rankingFrozenAt) });
};

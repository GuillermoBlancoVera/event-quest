import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const reply = (status: number, body: unknown) => ({ statusCode: status, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

export const handler: APIGatewayProxyHandlerV2 = async event => {
  const operation = event.requestContext.http.path.split('/').pop() ?? '';
  const body = JSON.parse(event.body ?? '{}');
  const now = new Date().toISOString();
  if (['disable-question', 'enable-question'].includes(operation)) {
    const id = Number(body.challengeId);
    if (!id) return reply(400, { message: 'challengeId is required.' });
    await db.send(new UpdateCommand({ TableName: process.env.CHALLENGES_TABLE, Key: { PK: `CHALLENGE#${id}`, SK: 'DETAIL' }, UpdateExpression: 'SET enabled = :enabled', ExpressionAttributeValues: { ':enabled': operation === 'enable-question' } }));
  } else if (['freeze-ranking', 'unfreeze-ranking'].includes(operation)) {
    await db.send(new UpdateCommand({ TableName: process.env.SETTINGS_TABLE, Key: { PK: 'SETTINGS', SK: 'GAME' }, UpdateExpression: 'SET rankingFrozenAt = :value', ExpressionAttributeValues: { ':value': operation === 'freeze-ranking' ? now : null } }));
  } else if (operation === 'upsert-affiliation') {
    const { affiliationId, name, parentAffiliationId, avatarKey, story } = body;
    if (typeof affiliationId !== 'string' || typeof name !== 'string' || !affiliationId.trim() || !name.trim() || (parentAffiliationId !== undefined && typeof parentAffiliationId !== 'string')) return reply(400, { message: 'affiliationId and name are required; parentAffiliationId is optional.' });
    if (avatarKey !== undefined && (typeof avatarKey !== 'string' || !avatarKey.startsWith('affiliations/'))) return reply(400, { message: 'avatarKey must be stored under affiliations/.' });
    await db.send(new UpdateCommand({ TableName: process.env.AFFILIATIONS_TABLE, Key: { PK: `AFFILIATION#${affiliationId.trim()}`, SK: 'PROFILE' }, UpdateExpression: 'SET affiliationId = :id, #name = :name, parentAffiliationId = :parent, avatarKey = :avatar, story = :story, updatedAt = :now, createdAt = if_not_exists(createdAt, :now)', ExpressionAttributeNames: { '#name': 'name' }, ExpressionAttributeValues: { ':id': affiliationId.trim(), ':name': name.trim(), ':parent': parentAffiliationId?.trim() || null, ':avatar': avatarKey?.trim() || null, ':story': story?.trim() || null, ':now': now } }));
  } else if (operation === 'assign-user-affiliation') {
    const { userId, affiliationId } = body;
    if (typeof userId !== 'string' || typeof affiliationId !== 'string' || !userId.trim() || !affiliationId.trim()) return reply(400, { message: 'userId and affiliationId are required.' });
    await db.send(new UpdateCommand({ TableName: process.env.USERS_TABLE, Key: { PK: `USER#${userId.trim()}`, SK: 'PROFILE' }, UpdateExpression: 'SET affiliationId = :affiliationId, updatedAt = :now', ExpressionAttributeValues: { ':affiliationId': affiliationId.trim(), ':now': now } }));
  } else return reply(404, { message: 'Unknown admin action.' });
  await db.send(new PutCommand({ TableName: process.env.AUDIT_TABLE, Item: { PK: `AUDIT#${now.slice(0, 10)}`, SK: `${now}#ADMIN`, timestamp: now, action: operation.toUpperCase().replaceAll('-', '_') } }));
  return reply(200, { ok: true, operation });
};

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { RegisterUserRequest, User } from '@event-quest/shared';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const json = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

export const handler: APIGatewayProxyHandlerV2 = async event => {
  const input = JSON.parse(event.body ?? '{}') as RegisterUserRequest;
  const name = input.name?.trim().toLocaleLowerCase();
  const password = input.password?.trim();
  if (!name || !password) return json(400, { code: 'VALIDATION_ERROR', message: 'El nombre y la contraseña son obligatorios.' });
  const existing = await db.send(new ScanCommand({ TableName: process.env.USERS_TABLE, FilterExpression: 'entity = :entity AND #name = :name', ExpressionAttributeNames: { '#name': 'name' }, ExpressionAttributeValues: { ':entity': 'USER', ':name': name } }));
  if (existing.Items?.length) return json(409, { code: 'NAME_TAKEN', message: 'Ese nombre ya está registrado.' });
  const now = new Date().toISOString();
  const user: User = { userId: crypto.randomUUID(), name, team: input.team?.trim().toLocaleLowerCase() || 'sin afiliación', group: input.group?.trim().toLocaleLowerCase() || 'sin afiliación', affiliationId: input.affiliationId?.trim(), challengeAttempts: [], createdAt: now, updatedAt: now };
  await db.send(new PutCommand({ TableName: process.env.USERS_TABLE, Item: { PK: `USER#${user.userId}`, SK: 'PROFILE', entity: 'USER', password, ...user } }));
  return json(201, user);
};

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { Challenge, ChallengeListItem, User } from '@event-quest/shared';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

export const handler: APIGatewayProxyHandlerV2 = async event => {
  if (event.requestContext.http.path === '/challenges') {
    const result = await db.send(new ScanCommand({ TableName: process.env.CHALLENGES_TABLE }));
    const challenges = (result.Items ?? []) as Challenge[];
    const response: ChallengeListItem[] = challenges.filter(challenge => challenge.enabled && typeof challenge.challengeId === 'number').map(({ challengeId, title }) => ({ challengeId, title })).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    return reply(200, response);
  }

  const id = Number(event.pathParameters?.id);
  if (!Number.isInteger(id)) return reply(400, { code: 'VALIDATION_ERROR', message: 'El identificador del reto debe ser un número.' });
  const result = await db.send(new GetCommand({ TableName: process.env.CHALLENGES_TABLE, Key: { PK: `CHALLENGE#${id}`, SK: 'DETAIL' } }));
  if (!result.Item || !result.Item.enabled) return reply(404, { code: 'NOT_FOUND', message: 'Este reto no está disponible.' });
  const challenge = result.Item as Challenge;
  const userId = event.queryStringParameters?.userId;
  const userResult = userId ? await db.send(new GetCommand({ TableName: process.env.USERS_TABLE, Key: { PK: `USER#${userId}`, SK: 'PROFILE' } })) : undefined;
  const user = userResult?.Item as User | undefined;
  const hasAttempted = Boolean(user?.challengeAttempts?.some(attempt => attempt.challengeId === id));
  const { correctAnswer, ...question } = challenge;
  return reply(200, hasAttempted ? { ...question, correctAnswer } : question);
};

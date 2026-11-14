import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand, type QueryCommandInput, type ScanCommandInput } from '@aws-sdk/lib-dynamodb';

export const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

const table = (name: string) => () => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
};

export const tables = {
  users: table('USERS_TABLE'),
  challenges: table('CHALLENGES_TABLE'),
  settings: table('SETTINGS_TABLE'),
  audit: table('AUDIT_TABLE'),
  affiliations: table('AFFILIATIONS_TABLE'),
  media: table('MEDIA_TABLE'),
};

export const userKey = (userId: string) => ({ PK: `USER#${userId}`, SK: 'PROFILE' });
export const challengeKey = (challengeId: number) => ({ PK: `CHALLENGE#${challengeId}`, SK: 'DETAIL' });
export const porLaCaraKey = (porLaCaraId: string) => ({ PK: `POR_LA_CARA#${porLaCaraId}`, SK: 'DETAIL' });
export const affiliationKey = (affiliationId: string) => ({ PK: `AFFILIATION#${affiliationId}`, SK: 'PROFILE' });
export const settingsKey = { PK: 'SETTINGS', SK: 'GAME' };

/** DynamoDB returns at most 1 MB per call, so every full read has to follow LastEvaluatedKey. */
export const scanAll = async <T>(input: ScanCommandInput): Promise<T[]> => {
  const items: T[] = [];
  let ExclusiveStartKey: ScanCommandInput['ExclusiveStartKey'];
  do {
    const page = await db.send(new ScanCommand({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items ?? []) as T[]);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
};

export const queryAll = async <T>(input: QueryCommandInput): Promise<T[]> => {
  const items: T[] = [];
  let ExclusiveStartKey: QueryCommandInput['ExclusiveStartKey'];
  do {
    const page = await db.send(new QueryCommand({ ...input, ExclusiveStartKey }));
    items.push(...(page.Items ?? []) as T[]);
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
};

/** Builds a projection with every attribute aliased, so DynamoDB reserved words (name, role, group…) are always safe. */
export const projection = (attributes: string[]) => ({
  ProjectionExpression: attributes.map(attribute => `#p_${attribute}`).join(', '),
  ExpressionAttributeNames: Object.fromEntries(attributes.map(attribute => [`#p_${attribute}`, attribute])),
});

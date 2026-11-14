// Creates an administrator account, or turns an existing player into one and resets their password.
// The admin panel can do everything else, but the very first admin has to be created from outside.
//
//   node scripts/create-admin.mjs <name>
//
// Needs Node 24 (it imports the TypeScript password helper directly) and AWS credentials that can
// write to the users table. Set USERS_TABLE to target a table other than the production one.
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { hashPassword } from '../packages/server/src/passwords.ts';

const require = createRequire(resolve(import.meta.dirname, '../packages/server/package.json'));
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const name = process.argv[2]?.trim().toLocaleLowerCase();
if (!name) {
  console.error('Usage: node scripts/create-admin.mjs <name>');
  process.exit(1);
}
const table = process.env.USERS_TABLE ?? 'event-quest-production-users';

const prompt = createInterface({ input: process.stdin, output: process.stdout });
const password = (await prompt.question(`Password for "${name}" (it will be visible while you type): `)).trim();
prompt.close();
if (password.length < 8) {
  console.error('Use at least 8 characters for an administrator.');
  process.exit(1);
}

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const passwordHash = await hashPassword(password);
const now = new Date().toISOString();
const existing = (await db.send(new QueryCommand({ TableName: table, IndexName: 'name-index', KeyConditionExpression: '#name = :name', ExpressionAttributeNames: { '#name': 'name' }, ExpressionAttributeValues: { ':name': name } }))).Items?.[0];

if (existing) {
  await db.send(new UpdateCommand({
    TableName: table, Key: { PK: existing.PK, SK: existing.SK },
    UpdateExpression: 'SET #role = :admin, passwordHash = :hash, sessionsValidFrom = :epoch, failedLogins = :zero REMOVE #legacyPassword, lockedUntil',
    ExpressionAttributeNames: { '#role': 'role', '#legacyPassword': 'password' },
    ExpressionAttributeValues: { ':admin': 'admin', ':hash': passwordHash, ':epoch': Math.floor(Date.now() / 1000), ':zero': 0 },
  }));
  console.log(`"${name}" already existed: it is now an administrator with the new password.`);
} else {
  const userId = randomUUID();
  await db.send(new PutCommand({
    TableName: table, ConditionExpression: 'attribute_not_exists(PK)',
    Item: { PK: `USER#${userId}`, SK: 'PROFILE', entity: 'USER', userId, name, role: 'admin', passwordHash, team: 'sin afiliación', group: 'sin afiliación', challengeAttempts: [], communityScans: [], porLaCaraAttempts: [], createdAt: now, updatedAt: now },
  }));
  console.log(`Administrator "${name}" created. Sign in at /admin.`);
}

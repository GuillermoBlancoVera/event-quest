import { randomUUID } from 'node:crypto';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { Settings, User } from '@event-quest/shared';
import { db, queryAll, settingsKey, tables, userKey } from './db.js';
import { HttpError } from './http.js';
import type { Session } from './session.js';

/** A user exactly as stored: profile fields plus credentials and bookkeeping that must never leave the API. */
export type StoredUser = User & {
  PK: string;
  SK: string;
  entity: 'USER';
  passwordHash?: string;
  /** Legacy plain-text password; replaced by passwordHash the first time the user logs in. */
  password?: string;
  failedLogins?: number;
  lockedUntil?: number;
  /** Sessions issued before this epoch second are rejected (password reset, forced logout). */
  sessionsValidFrom?: number;
};

export const publicUser = (item: StoredUser): User => {
  const { PK, SK, entity, passwordHash, password, failedLogins, lockedUntil, sessionsValidFrom, ...user } = item;
  return { ...user, challengeAttempts: user.challengeAttempts ?? [] };
};

export const scoreOf = (user: Pick<User, 'challengeAttempts' | 'communityScans' | 'porLaCaraAttempts'>, until?: string) => {
  const counts = (at: string) => !until || at <= until;
  return (user.challengeAttempts ?? []).reduce((total, attempt) => total + (counts(attempt.answeredAt) ? attempt.awardedPoints : 0), 0)
    + (user.communityScans ?? []).reduce((total, scan) => total + (counts(scan.scannedAt) ? scan.awardedPoints : 0), 0)
    + (user.porLaCaraAttempts ?? []).reduce((total, attempt) => total + (counts(attempt.claimedAt) ? attempt.awardedPoints : 0), 0);
};

export const getUser = async (userId: string) => {
  const result = await db.send(new GetCommand({ TableName: tables.users(), Key: userKey(userId) }));
  return result.Item as StoredUser | undefined;
};

export const findUserByName = async (name: string) => {
  const items = await queryAll<StoredUser>({ TableName: tables.users(), IndexName: 'name-index', KeyConditionExpression: '#name = :name', ExpressionAttributeNames: { '#name': 'name' }, ExpressionAttributeValues: { ':name': name } });
  return items.find(item => item.entity === 'USER');
};

/** Loads the user behind a player or admin session and rejects sessions that were revoked or whose user was deleted. */
export const requireUser = async (session: Session) => {
  const user = session.role === 'guest' ? undefined : await getUser(session.sub);
  if (!user || (user.sessionsValidFrom && session.iat < user.sessionsValidFrom) || (session.role === 'admin' && user.role !== 'admin')) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Tu sesión ha caducado. Vuelve a iniciar sesión.');
  }
  return user;
};

export const getSettings = async () => {
  const result = await db.send(new GetCommand({ TableName: tables.settings(), Key: settingsKey }));
  return result.Item as Partial<Settings> | undefined;
};

export const assertGameOpen = (settings: Partial<Settings> | undefined) => {
  if (settings?.maintenanceMode || settings?.gameEnabled === false) throw new HttpError(503, 'GAME_UNAVAILABLE', 'El juego no está disponible ahora mismo.');
};

/** Builds an audit record. The random suffix keeps two actions in the same millisecond from overwriting each other. */
export const auditItem = (action: string, event: APIGatewayProxyEventV2, session: Session | undefined, metadata?: Record<string, unknown>) => {
  const now = new Date().toISOString();
  return { PK: `AUDIT#${now.slice(0, 10)}`, SK: `${now}#${randomUUID()}`, timestamp: now, action, userId: session?.sub, role: session?.role, sourceIp: event.requestContext?.http?.sourceIp, metadata };
};

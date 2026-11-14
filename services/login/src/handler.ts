import { randomUUID } from 'node:crypto';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { EventSessionRequest, EventSessionResponse, LoginRequest, SessionUser } from '@event-quest/shared';
import { api, createSession, db, findUserByName, getSettings, hashPassword, HttpError, parseBody, publicUser, reply, safeEqual, tables, userKey, verifyPassword, type StoredUser } from '@event-quest/server';

const maxFailedLogins = 10;
const lockSeconds = 5 * 60;
const invalidLogin = () => new HttpError(401, 'INVALID_LOGIN', 'El nombre o la contraseña no son correctos.');

const checkPassword = async (user: StoredUser, password: string) => {
  if (user.passwordHash) return verifyPassword(password, user.passwordHash);
  // Accounts created before passwords were hashed: accept the stored value once and upgrade it below.
  return typeof user.password === 'string' && safeEqual(user.password, password);
};

const login = async (input: Partial<LoginRequest>) => {
  const name = typeof input.name === 'string' ? input.name.trim().toLocaleLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password.trim() : '';
  if (!name || !password || name.length > 80 || password.length > 200) throw new HttpError(400, 'VALIDATION_ERROR', 'El nombre y la contraseña son obligatorios.');

  const user = await findUserByName(name);
  const now = Math.floor(Date.now() / 1000);
  if (!user) {
    // Spend the same time as a real check so response time does not reveal which names exist.
    await hashPassword(password);
    throw invalidLogin();
  }
  if (user.lockedUntil && user.lockedUntil > now) throw new HttpError(429, 'LOGIN_LOCKED', 'Demasiados intentos. Espera unos minutos y vuelve a probar.');

  if (!await checkPassword(user, password)) {
    const failed = (user.failedLogins ?? 0) + 1;
    await db.send(new UpdateCommand({
      TableName: tables.users(), Key: userKey(user.userId),
      UpdateExpression: failed >= maxFailedLogins ? 'SET failedLogins = :zero, lockedUntil = :until' : 'SET failedLogins = :failed',
      ExpressionAttributeValues: failed >= maxFailedLogins ? { ':zero': 0, ':until': now + lockSeconds } : { ':failed': failed },
    }));
    throw invalidLogin();
  }

  if (!user.passwordHash || user.failedLogins || user.lockedUntil) {
    await db.send(new UpdateCommand({
      TableName: tables.users(), Key: userKey(user.userId),
      UpdateExpression: 'SET passwordHash = :hash, failedLogins = :zero REMOVE #legacyPassword, lockedUntil',
      ExpressionAttributeNames: { '#legacyPassword': 'password' },
      ExpressionAttributeValues: { ':hash': user.passwordHash ?? await hashPassword(password), ':zero': 0 },
    }));
  }
  const role = user.role === 'admin' ? 'admin' : 'player';
  const response: SessionUser = { ...publicUser(user), sessionToken: await createSession(user.userId, role) };
  return reply(200, response);
};

/** Exchanges the shared wedding code for a guest session that can view and add to the gallery. */
const eventSession = async (input: Partial<EventSessionRequest>) => {
  const code = typeof input.code === 'string' ? input.code.trim().toLocaleLowerCase() : '';
  if (!code || code.length > 100) throw new HttpError(400, 'VALIDATION_ERROR', 'Introduce el código de la boda.');
  const settings = await getSettings();
  const expected = settings?.eventCode?.trim().toLocaleLowerCase();
  if (!expected || !safeEqual(expected, code)) throw new HttpError(401, 'INVALID_CODE', 'Ese código no es correcto.');
  const response: EventSessionResponse = { role: 'guest', sessionToken: await createSession(`guest:${randomUUID()}`, 'guest', { ev: settings?.eventCodeVersion ?? 0 }) };
  return reply(200, response);
};

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  const path = event.requestContext.http.path;
  if (event.requestContext.http.method !== 'POST') throw new HttpError(404, 'NOT_FOUND', 'Ruta no encontrada.');
  if (path.endsWith('/event-session')) return eventSession(parseBody<EventSessionRequest>(event));
  return login(parseBody<LoginRequest>(event));
});

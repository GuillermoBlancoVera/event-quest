import { createHmac, timingSafeEqual } from 'node:crypto';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { SessionRole } from '@event-quest/shared';
import { HttpError } from './http.js';

export type Session = {
  aud: 'event-quest';
  sub: string;
  role: SessionRole;
  iat: number;
  exp: number;
  /** Guest sessions only: the event-code version they were issued for. */
  ev?: number;
};

const day = 60 * 60 * 24;
const lifetime: Record<SessionRole, number> = { admin: day / 2, player: day * 30, guest: day * 30 };

let cachedSecret: Promise<string> | undefined;
const loadSecret = async () => {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const name = process.env.SESSION_SECRET_PARAMETER;
  if (!name) throw new Error('SESSION_SECRET_PARAMETER is not configured.');
  const result = await new SSMClient({}).send(new GetParameterCommand({ Name: name, WithDecryption: true }));
  if (!result.Parameter?.Value) throw new Error('The session secret parameter is empty.');
  return result.Parameter.Value;
};
/** The signing secret lives in SSM Parameter Store and is fetched once per Lambda container. */
const secret = () => {
  cachedSecret ??= loadSecret().catch(error => { cachedSecret = undefined; throw error; });
  return cachedSecret;
};

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = async (value: string) => createHmac('sha256', await secret()).update(value).digest();
const header = encode({ alg: 'HS256', typ: 'JWT' });

export const createSession = async (sub: string, role: SessionRole, extra: Pick<Session, 'ev'> = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const payload: Session = { aud: 'event-quest', sub, role, iat: now, exp: now + lifetime[role], ...extra };
  const unsigned = `${header}.${encode(payload)}`;
  return `${unsigned}.${(await sign(unsigned)).toString('base64url')}`;
};

export const verifySession = async (authorization: string | undefined): Promise<Session | undefined> => {
  const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return undefined;
  const [tokenHeader, payload, signature, ...rest] = token.split('.');
  // Only the exact header this service issues is accepted, so the algorithm can never be negotiated.
  if (tokenHeader !== header || !payload || !signature || rest.length) return undefined;
  const expected = await sign(`${tokenHeader}.${payload}`);
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return undefined;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Session;
    const valid = claims.aud === 'event-quest' && typeof claims.sub === 'string' && ['admin', 'player', 'guest'].includes(claims.role)
      && Number.isInteger(claims.iat) && Number.isInteger(claims.exp) && claims.exp > Math.floor(Date.now() / 1000);
    return valid ? claims : undefined;
  } catch {
    return undefined;
  }
};

/** Returns the caller's session or fails with 401/403. Identity always comes from here, never from the request body. */
export const requireSession = async (event: APIGatewayProxyEventV2, roles: SessionRole[] = ['admin', 'player', 'guest']) => {
  const session = await verifySession(event.headers.authorization ?? event.headers.Authorization);
  if (!session) throw new HttpError(401, 'UNAUTHORIZED', 'Inicia sesión para continuar.');
  if (!roles.includes(session.role)) throw new HttpError(403, 'FORBIDDEN', 'No tienes permiso para hacer esto.');
  return session;
};

export type QrScope = 'scan' | 'challenge';

/** Short keyed tag that makes a QR link unguessable without storing a code per item. */
export const qrSignature = async (scope: QrScope, id: string | number) =>
  createHmac('sha256', await secret()).update(`qr:${scope}:${id}`).digest('base64url').slice(0, 16);

export const qrSignatureMatches = async (scope: QrScope, id: string | number, received: unknown) => {
  if (typeof received !== 'string') return false;
  const expected = Buffer.from(await qrSignature(scope, id));
  const actual = Buffer.from(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

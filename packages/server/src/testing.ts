import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import type { SessionRole } from '@event-quest/shared';
import { createSession } from './session.js';

/** Test-only helpers: fake configuration and API Gateway events for calling handlers directly. */
export const configureTestEnvironment = () => Object.assign(process.env, {
  SESSION_SECRET: 'test-secret-that-is-long-enough-for-hmac',
  USERS_TABLE: 'users', CHALLENGES_TABLE: 'challenges', SETTINGS_TABLE: 'settings', AUDIT_TABLE: 'audit', AFFILIATIONS_TABLE: 'affiliations', MEDIA_TABLE: 'media',
  MEDIA_BUCKET: 'test-bucket', AWS_REGION: 'eu-west-1', AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test',
});

type Request = { method?: string; path: string; body?: unknown; token?: string; id?: string; query?: Record<string, string> };

export const request = ({ method = 'GET', path, body, token, id, query }: Request) => ({
  headers: token ? { authorization: `Bearer ${token}` } : {},
  body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  isBase64Encoded: false,
  pathParameters: id === undefined ? undefined : { id },
  queryStringParameters: query,
  requestContext: { http: { method, path, sourceIp: '203.0.113.7' } },
}) as unknown as APIGatewayProxyEventV2;

export const call = async (handler: APIGatewayProxyHandlerV2, input: Request) => {
  const result = await handler(request(input), {} as never, () => undefined) as APIGatewayProxyStructuredResultV2;
  return { status: result.statusCode, body: JSON.parse(result.body ?? 'null') };
};

export const tokenFor = (sub: string, role: SessionRole, ev?: number) => createSession(sub, role, role === 'guest' ? { ev } : {});

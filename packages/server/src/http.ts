import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

/** An error that is safe to show to the caller. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
  }
}

export const reply = (statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

export const parseBody = <T extends object>(event: APIGatewayProxyEventV2): Partial<T> => {
  const raw = event.isBase64Encoded && event.body ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Partial<T>;
  } catch { /* handled below */ }
  throw new HttpError(400, 'INVALID_BODY', 'El cuerpo de la petición no es válido.');
};

/** A trimmed, length-capped string, or undefined when the value is missing or not text. */
export const text = (value: unknown, maxLength: number) => typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : undefined;

/** Wraps a handler so malformed input and expected failures never surface as unhandled 500s. */
export const api = (run: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyStructuredResultV2>): APIGatewayProxyHandlerV2 => async event => {
  try {
    return await run(event);
  } catch (error) {
    if (error instanceof HttpError) return reply(error.statusCode, { code: error.code, message: error.message });
    console.error('ERROR', error);
    return reply(500, { code: 'INTERNAL_ERROR', message: 'Ha ocurrido un error inesperado.' });
  }
};

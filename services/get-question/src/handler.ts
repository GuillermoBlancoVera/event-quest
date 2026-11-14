import { GetCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { Challenge, ChallengeListItem, QuestionResponse } from '@event-quest/shared';
import { api, challengeKey, db, HttpError, qrSignatureMatches, reply, requireSession, requireUser, scanAll, tables } from '@event-quest/server';

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  const session = await requireSession(event, ['admin', 'player']);
  const user = await requireUser(session);

  if (event.requestContext.http.path.endsWith('/challenges')) {
    const challenges = await scanAll<Challenge>({ TableName: tables.challenges() });
    const response: ChallengeListItem[] = challenges.filter(challenge => challenge.enabled && typeof challenge.challengeId === 'number').map(({ challengeId, title }) => ({ challengeId, title })).sort((a, b) => a.title.localeCompare(b.title, 'es'));
    return reply(200, response);
  }

  const id = Number(event.pathParameters?.id);
  if (!Number.isInteger(id)) throw new HttpError(400, 'VALIDATION_ERROR', 'El identificador del reto debe ser un número.');
  const result = await db.send(new GetCommand({ TableName: tables.challenges(), Key: challengeKey(id) }));
  const challenge = result.Item as Challenge | undefined;
  if (!challenge || !challenge.enabled) throw new HttpError(404, 'NOT_FOUND', 'Este reto no está disponible.');

  const hasAttempted = (user.challengeAttempts ?? []).some(attempt => attempt.challengeId === id);
  if (challenge.qrProtected && !hasAttempted && !await qrSignatureMatches('challenge', id, event.queryStringParameters?.code)) {
    throw new HttpError(403, 'QR_REQUIRED', 'Escanea el QR de este reto para poder jugarlo.');
  }
  const { challengeId, title, question, answers, points, enabled, affiliationId } = challenge;
  // The solution is only revealed to a player who has already used their single attempt.
  const response: QuestionResponse = { challengeId, title, question, answers, points, enabled, affiliationId, correctAnswer: hasAttempted ? challenge.correctAnswer : undefined };
  return reply(200, response);
});

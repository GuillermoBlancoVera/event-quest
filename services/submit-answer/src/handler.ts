import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { normalizeAnswer, type Challenge, type ChallengeAttempt, type SubmitAnswerRequest, type SubmitAnswerResponse } from '@event-quest/shared';
import { api, assertGameOpen, auditItem, challengeKey, db, getSettings, HttpError, parseBody, qrSignatureMatches, reply, requireSession, requireUser, scoreOf, tables, userKey } from '@event-quest/server';

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  const session = await requireSession(event, ['admin', 'player']);
  const input = parseBody<SubmitAnswerRequest>(event);
  const id = Number(event.pathParameters?.id);
  if (!Number.isInteger(id) || typeof input.answer !== 'string' || !input.answer.trim() || input.answer.length > 500) throw new HttpError(400, 'VALIDATION_ERROR', 'El reto y la respuesta son obligatorios.');

  const [challengeResult, user, settings] = await Promise.all([db.send(new GetCommand({ TableName: tables.challenges(), Key: challengeKey(id) })), requireUser(session), getSettings()]);
  const challenge = challengeResult.Item as Challenge | undefined;
  if (!challenge || !challenge.enabled) throw new HttpError(404, 'NOT_FOUND', 'No se ha encontrado el reto activo.');
  assertGameOpen(settings);

  const attempts = user.challengeAttempts ?? [];
  if (attempts.some(attempt => attempt.challengeId === id)) throw new HttpError(409, 'ALREADY_PLAYED', 'Ya has jugado a este reto.');
  if (challenge.qrProtected && !await qrSignatureMatches('challenge', id, input.code)) throw new HttpError(403, 'QR_REQUIRED', 'Escanea el QR de este reto para poder jugarlo.');
  const answer = (challenge.answers ?? []).find(option => normalizeAnswer(option) === normalizeAnswer(input.answer!));
  if (answer === undefined) throw new HttpError(400, 'VALIDATION_ERROR', 'Esa respuesta no es una de las opciones del reto.');

  const correct = normalizeAnswer(answer) === normalizeAnswer(challenge.correctAnswer);
  const now = new Date().toISOString();
  const awardedPoints = correct ? challenge.points : 0;
  const attempt: ChallengeAttempt = { challengeId: id, answer: answer.toLocaleLowerCase(), correct, awardedPoints, answeredAt: now };
  try {
    await db.send(new TransactWriteCommand({ TransactItems: [
      // The size check makes a second simultaneous submission fail instead of counting twice.
      { Update: { TableName: tables.users(), Key: userKey(user.userId), UpdateExpression: 'SET challengeAttempts = list_append(if_not_exists(challengeAttempts, :empty), :attempt), updatedAt = :now', ConditionExpression: 'attribute_not_exists(challengeAttempts) OR size(challengeAttempts) = :count', ExpressionAttributeValues: { ':empty': [], ':attempt': [attempt], ':count': attempts.length, ':now': now } } },
      { Put: { TableName: tables.audit(), Item: auditItem('SUBMIT_CHALLENGE', event, session, { challengeId: id, correct, awardedPoints }) } },
    ] }));
  } catch (error) {
    if ((error as { name?: string }).name === 'TransactionCanceledException') throw new HttpError(409, 'ANSWER_CONFLICT', 'Tu respuesta ya se está registrando. Vuelve a intentarlo.');
    throw error;
  }
  const response: SubmitAnswerResponse = { correct, awardedPoints, score: scoreOf(user) + awardedPoints, attempt };
  return reply(200, response);
});

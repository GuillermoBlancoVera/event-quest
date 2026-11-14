import { randomBytes, randomUUID } from 'node:crypto';
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { AdminAffiliationInput, AdminAssetUploadRequest, AdminAssetUploadResponse, AdminChallenge, AdminChallengeInput, AdminPlayer, AdminPlayerInput, AdminPorLaCara, AdminPorLaCaraInput, AdminSettings, AdminSettingsInput, Affiliation, Challenge, PorLaCaraChallenge } from '@event-quest/shared';
import { affiliationKey, api, auditItem, challengeKey, db, findUserByName, getSettings, getUser, hashPassword, HttpError, parseBody, porLaCaraKey, publicUser, qrSignature, reply, requireSession, requireUser, scanAll, scoreOf, settingsKey, tables, text, userKey, type Session, type StoredUser } from '@event-quest/server';

const s3 = new S3Client({});
const invalid = (message: string) => new HttpError(400, 'VALIDATION_ERROR', message);
const notFound = (message: string) => new HttpError(404, 'NOT_FOUND', message);
const idPattern = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const optionalId = (value: unknown, label: string) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !idPattern.test(value.trim())) throw invalid(`${label} solo puede tener letras, números y guiones.`);
  return value.trim();
};
const assetKey = (value: unknown, prefix: 'avatars/' | 'affiliations/') => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !value.startsWith(prefix) || value.includes('..') || value.length > 200) throw invalid(`La imagen debe estar guardada en ${prefix}.`);
  return value;
};
type StoredPorLaCara = PorLaCaraChallenge & { PK: string; SK: string; type: 'POR_LA_CARA' };
type Context = { event: APIGatewayProxyEventV2; session: Session; method: string; id?: string };
const audit = ({ event, session }: Context, action: string, metadata?: Record<string, unknown>) => db.send(new PutCommand({ TableName: tables.audit(), Item: auditItem(action, event, session, metadata) }));

// ---------------------------------------------------------------- players

const adminPlayer = (item: StoredUser): AdminPlayer => ({ ...publicUser(item), score: scoreOf(item) });

const players = async (context: Context) => {
  const { method, id, event } = context;
  if (method === 'GET') {
    const items = await scanAll<StoredUser>({ TableName: tables.users(), FilterExpression: 'entity = :entity', ExpressionAttributeValues: { ':entity': 'USER' } });
    return reply(200, items.map(adminPlayer).sort((a, b) => a.name.localeCompare(b.name, 'es')));
  }
  if (method === 'DELETE' && id) {
    if (id === context.session.sub) throw invalid('No puedes borrar tu propia cuenta de administración.');
    await db.send(new DeleteCommand({ TableName: tables.users(), Key: userKey(id) }));
    await audit(context, 'ADMIN_DELETE_PLAYER', { userId: id });
    return reply(200, { ok: true });
  }

  const input = parseBody<AdminPlayerInput>(event);
  const existing = id ? await getUser(id) : undefined;
  if (!(method === 'POST' && !id) && !(method === 'PUT' && id)) throw notFound('Ruta de administración no encontrada.');
  if (id && !existing) throw notFound('No se ha encontrado el jugador.');

  const name = text(input.name, 80)?.toLocaleLowerCase();
  if (!name) throw invalid('El nombre es obligatorio.');
  const password = typeof input.password === 'string' ? input.password.trim() : '';
  if (!existing && !password) throw invalid('La contraseña es obligatoria al crear un jugador.');
  if (password && (password.length < 4 || password.length > 200)) throw invalid('La contraseña debe tener al menos 4 caracteres.');
  if (input.role !== undefined && input.role !== 'admin' && input.role !== 'player') throw invalid('El rol no es válido.');
  if (input.gender !== undefined && input.gender !== null && input.gender !== 'male' && input.gender !== 'female') throw invalid('El género no es válido.');
  if (existing?.userId === context.session.sub && input.role === 'player') throw invalid('No puedes quitarte a ti mismo el rol de administración.');
  const sameName = await findUserByName(name);
  if (sameName && sameName.userId !== existing?.userId) throw new HttpError(409, 'NAME_TAKEN', 'Ese nombre ya está registrado.');
  const affiliationId = optionalId(input.affiliationId, 'La comunidad');
  if (affiliationId && !(await db.send(new GetCommand({ TableName: tables.affiliations(), Key: affiliationKey(affiliationId) }))).Item) throw invalid('Esa comunidad no existe.');

  const now = new Date().toISOString();
  const base: StoredUser = existing ?? { ...userKey(randomUUID()), entity: 'USER', userId: '', name, team: 'sin afiliación', group: 'sin afiliación', challengeAttempts: [], communityScans: [], porLaCaraAttempts: [], createdAt: now, updatedAt: now };
  const item: StoredUser = {
    ...base,
    userId: existing?.userId ?? base.PK.slice('USER#'.length),
    name,
    role: input.role ?? base.role ?? 'player',
    gender: input.gender === null ? undefined : input.gender ?? base.gender,
    team: text(input.team, 80)?.toLocaleLowerCase() ?? base.team,
    group: text(input.group, 80)?.toLocaleLowerCase() ?? base.group,
    affiliationId: input.affiliationId === undefined ? base.affiliationId : affiliationId,
    avatarKey: input.avatarKey === undefined ? base.avatarKey : assetKey(input.avatarKey, 'avatars/'),
    updatedAt: existing ? base.updatedAt : now,
  };
  if (password) {
    item.passwordHash = await hashPassword(password);
    delete item.password;
    item.failedLogins = 0;
    delete item.lockedUntil;
    // A new password closes every session opened with the old one.
    if (existing) item.sessionsValidFrom = Math.floor(Date.now() / 1000);
  }
  if (input.resetProgress) { item.challengeAttempts = []; item.communityScans = []; item.porLaCaraAttempts = []; item.updatedAt = now; }
  try {
    // The player may be answering a challenge right now; refuse to overwrite a profile that changed since it was read.
    await db.send(new PutCommand({ TableName: tables.users(), Item: item, ConditionExpression: !existing ? 'attribute_not_exists(PK)' : existing.updatedAt ? 'updatedAt = :previous' : 'attribute_not_exists(updatedAt)', ExpressionAttributeValues: existing?.updatedAt ? { ':previous': existing.updatedAt } : undefined }));
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') throw new HttpError(409, 'CONFLICT', 'El jugador ha cambiado mientras lo editabas. Vuelve a intentarlo.');
    throw error;
  }
  await audit(context, existing ? 'ADMIN_UPDATE_PLAYER' : 'ADMIN_CREATE_PLAYER', { userId: item.userId, passwordChanged: Boolean(password), resetProgress: Boolean(input.resetProgress) });
  return reply(existing ? 200 : 201, adminPlayer(item));
};

// ---------------------------------------------------------------- challenges

const adminChallenge = async (challenge: Challenge): Promise<AdminChallenge> => {
  const { challengeId, title, question, answers, correctAnswer, points, enabled, affiliationId, qrProtected } = challenge;
  const code = qrProtected ? `?code=${await qrSignature('challenge', challengeId)}` : '';
  return { challengeId, title, question, answers: answers ?? [], correctAnswer, points, enabled: Boolean(enabled), affiliationId, qrProtected: Boolean(qrProtected), qrPath: `/juego/reto/${challengeId}${code}` };
};
const allChallenges = async () => (await scanAll<Challenge & { PK: string }>({ TableName: tables.challenges() })).filter(item => item.PK.startsWith('CHALLENGE#') && typeof item.challengeId === 'number');

const challenges = async (context: Context) => {
  const { method, id, event } = context;
  if (method === 'GET') return reply(200, await Promise.all((await allChallenges()).sort((a, b) => a.challengeId - b.challengeId).map(adminChallenge)));
  const pathId = id === undefined ? undefined : Number(id);
  if (pathId !== undefined && !Number.isInteger(pathId)) throw invalid('El identificador del reto debe ser un número.');
  if (method === 'DELETE' && pathId !== undefined) {
    await db.send(new DeleteCommand({ TableName: tables.challenges(), Key: challengeKey(pathId) }));
    await audit(context, 'ADMIN_DELETE_CHALLENGE', { challengeId: pathId });
    return reply(200, { ok: true });
  }
  if (!(method === 'POST' && pathId === undefined) && !(method === 'PUT' && pathId !== undefined)) throw notFound('Ruta de administración no encontrada.');

  const input = parseBody<AdminChallengeInput>(event);
  const title = text(input.title, 120);
  const question = text(input.question, 1000);
  const answers = Array.isArray(input.answers) ? [...new Set(input.answers.map(answer => text(answer, 200)).filter((answer): answer is string => Boolean(answer)))] : [];
  const correctAnswer = text(input.correctAnswer, 200);
  if (!title || !question) throw invalid('El título y la pregunta son obligatorios.');
  if (answers.length < 2 || answers.length > 8) throw invalid('Añade entre 2 y 8 respuestas distintas.');
  if (!correctAnswer || !answers.includes(correctAnswer)) throw invalid('La respuesta correcta debe ser una de las opciones.');
  if (!Number.isInteger(input.points) || Math.abs(input.points!) > 10000) throw invalid('Los puntos deben ser un número entero.');

  let challengeId = pathId;
  if (challengeId === undefined) {
    const existing = (await allChallenges()).map(item => item.challengeId);
    challengeId = Number.isInteger(input.challengeId) && input.challengeId! > 0 ? input.challengeId! : Math.max(0, ...existing) + 1;
    if (existing.includes(challengeId)) throw new HttpError(409, 'ID_TAKEN', `Ya existe un reto con el número ${challengeId}.`);
  } else if (!(await db.send(new GetCommand({ TableName: tables.challenges(), Key: challengeKey(challengeId) }))).Item) {
    throw notFound('No se ha encontrado el reto.');
  }
  const challenge: Challenge = { challengeId, title, question, answers, correctAnswer, points: input.points!, enabled: input.enabled !== false, affiliationId: optionalId(input.affiliationId, 'La comunidad'), qrProtected: input.qrProtected !== false };
  await db.send(new PutCommand({ TableName: tables.challenges(), Item: { ...challengeKey(challengeId), ...challenge, updatedAt: new Date().toISOString() } }));
  await audit(context, pathId === undefined ? 'ADMIN_CREATE_CHALLENGE' : 'ADMIN_UPDATE_CHALLENGE', { challengeId });
  return reply(pathId === undefined ? 201 : 200, await adminChallenge(challenge));
};

// ---------------------------------------------------------------- por la cara

const adminPorLaCara = ({ porLaCaraId, title, description, points, enabled, createdAt, updatedAt }: PorLaCaraChallenge): AdminPorLaCara => ({ porLaCaraId, title, description, points, enabled: Boolean(enabled), createdAt, updatedAt, qrPath: `/juego/por-la-cara/${encodeURIComponent(porLaCaraId)}` });

const porLaCara = async (context: Context) => {
  const { method, id, event } = context;
  if (method === 'GET') {
    const items = (await scanAll<StoredPorLaCara>({ TableName: tables.challenges() })).filter(item => item.type === 'POR_LA_CARA');
    return reply(200, items.map(adminPorLaCara).sort((a, b) => a.title.localeCompare(b.title, 'es')));
  }
  if (method === 'DELETE' && id) {
    await db.send(new DeleteCommand({ TableName: tables.challenges(), Key: porLaCaraKey(id) }));
    await audit(context, 'ADMIN_DELETE_POR_LA_CARA', { porLaCaraId: id });
    return reply(200, { ok: true });
  }
  if (!(method === 'POST' && !id) && !(method === 'PUT' && id)) throw notFound('Ruta de administración no encontrada.');

  const input = parseBody<AdminPorLaCaraInput>(event);
  const title = text(input.title, 120)?.toLocaleLowerCase();
  const description = text(input.description, 1000)?.toLocaleLowerCase();
  if (!title || !description) throw invalid('El título y la descripción son obligatorios.');
  if (!Number.isInteger(input.points) || Math.abs(input.points!) > 10000) throw invalid('Los puntos deben ser un número entero.');
  const existing = id ? (await db.send(new GetCommand({ TableName: tables.challenges(), Key: porLaCaraKey(id) }))).Item as StoredPorLaCara | undefined : undefined;
  if (id && !existing) throw notFound('No se ha encontrado el reto por la cara.');
  // The id is the secret inside the QR, so new ones are always random and never chosen by hand.
  const porLaCaraId = id ?? randomBytes(12).toString('base64url');
  const now = new Date().toISOString();
  const item: StoredPorLaCara = { ...porLaCaraKey(porLaCaraId), type: 'POR_LA_CARA', porLaCaraId, title, description, points: input.points!, enabled: input.enabled !== false, createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.send(new PutCommand({ TableName: tables.challenges(), Item: item }));
  await audit(context, existing ? 'ADMIN_UPDATE_POR_LA_CARA' : 'ADMIN_CREATE_POR_LA_CARA', { title });
  return reply(existing ? 200 : 201, adminPorLaCara(item));
};

// ---------------------------------------------------------------- affiliations

const cleanAffiliation = ({ affiliationId, name, parentAffiliationId, avatarKey, story, createdAt, updatedAt }: Affiliation): Affiliation => ({ affiliationId, name, parentAffiliationId: parentAffiliationId || undefined, avatarKey: avatarKey || undefined, story: story || undefined, createdAt, updatedAt });

const affiliations = async (context: Context) => {
  const { method, id, event } = context;
  if (method === 'GET') return reply(200, (await scanAll<Affiliation>({ TableName: tables.affiliations() })).map(cleanAffiliation).sort((a, b) => a.name.localeCompare(b.name, 'es')));
  if (method === 'DELETE' && id) {
    const all = await scanAll<Affiliation>({ TableName: tables.affiliations() });
    if (all.some(item => item.parentAffiliationId === id)) throw new HttpError(409, 'IN_USE', 'Esta comunidad tiene cabañas. Bórralas o muévelas primero.');
    await db.send(new DeleteCommand({ TableName: tables.affiliations(), Key: affiliationKey(id) }));
    await audit(context, 'ADMIN_DELETE_AFFILIATION', { affiliationId: id });
    return reply(200, { ok: true });
  }
  if (!(method === 'POST' && !id) && !(method === 'PUT' && id)) throw notFound('Ruta de administración no encontrada.');

  const input = parseBody<AdminAffiliationInput>(event);
  const name = text(input.name, 80)?.toLocaleLowerCase();
  if (!name) throw invalid('El nombre es obligatorio.');
  const affiliationId = id ?? optionalId(input.affiliationId, 'El identificador') ?? randomUUID();
  const existing = (await db.send(new GetCommand({ TableName: tables.affiliations(), Key: affiliationKey(affiliationId) }))).Item as Affiliation | undefined;
  if (id && !existing) throw notFound('No se ha encontrado la comunidad.');
  if (!id && existing) throw new HttpError(409, 'ID_TAKEN', 'Ya existe una comunidad con ese identificador.');
  const parentAffiliationId = optionalId(input.parentAffiliationId, 'La comunidad a la que pertenece');
  if (parentAffiliationId === affiliationId) throw invalid('Una comunidad no puede pertenecer a sí misma.');
  if (parentAffiliationId && !(await db.send(new GetCommand({ TableName: tables.affiliations(), Key: affiliationKey(parentAffiliationId) }))).Item) throw invalid('La comunidad a la que pertenece no existe.');
  const now = new Date().toISOString();
  const item: Affiliation = { affiliationId, name, parentAffiliationId, avatarKey: input.avatarKey === undefined ? existing?.avatarKey || undefined : assetKey(input.avatarKey, 'affiliations/'), story: input.story === undefined ? existing?.story || undefined : text(input.story, 2000)?.toLocaleLowerCase(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await db.send(new PutCommand({ TableName: tables.affiliations(), Item: { ...affiliationKey(affiliationId), ...item } }));
  await audit(context, existing ? 'ADMIN_UPDATE_AFFILIATION' : 'ADMIN_CREATE_AFFILIATION', { affiliationId });
  return reply(existing ? 200 : 201, item);
};

// ---------------------------------------------------------------- settings

const adminSettings = (settings: Awaited<ReturnType<typeof getSettings>>): AdminSettings => ({ gameEnabled: settings?.gameEnabled !== false, maintenanceMode: Boolean(settings?.maintenanceMode), rankingFrozen: Boolean(settings?.rankingFrozenAt), eventCode: settings?.eventCode ?? '' });

const settings = async (context: Context) => {
  const current = await getSettings();
  if (context.method === 'GET') return reply(200, adminSettings(current));
  if (context.method !== 'PUT') throw notFound('Ruta de administración no encontrada.');
  const input = parseBody<AdminSettingsInput>(context.event);
  const sets: string[] = ['updatedAt = :now'];
  const removes: string[] = [];
  const values: Record<string, unknown> = { ':now': new Date().toISOString() };
  for (const flag of ['gameEnabled', 'maintenanceMode'] as const) {
    if (input[flag] === undefined) continue;
    if (typeof input[flag] !== 'boolean') throw invalid('Los ajustes del juego deben ser sí o no.');
    sets.push(`${flag} = :${flag}`);
    values[`:${flag}`] = input[flag];
  }
  if (input.rankingFrozen !== undefined) {
    if (typeof input.rankingFrozen !== 'boolean') throw invalid('Los ajustes del juego deben ser sí o no.');
    if (!input.rankingFrozen) removes.push('rankingFrozenAt');
    else if (!current?.rankingFrozenAt) { sets.push('rankingFrozenAt = :now'); }
  }
  if (input.eventCode !== undefined) {
    const eventCode = typeof input.eventCode === 'string' ? input.eventCode.trim() : '';
    if (eventCode && (eventCode.length < 6 || eventCode.length > 100)) throw invalid('El código de la boda debe tener al menos 6 caracteres.');
    if (eventCode !== (current?.eventCode ?? '')) {
      // Changing the code bumps its version, which signs every guest out of the gallery.
      sets.push('eventCodeVersion = :version');
      values[':version'] = Date.now();
      if (eventCode) { sets.push('eventCode = :eventCode'); values[':eventCode'] = eventCode; } else removes.push('eventCode');
    }
  }
  const result = await db.send(new UpdateCommand({ TableName: tables.settings(), Key: settingsKey, UpdateExpression: `SET ${sets.join(', ')}${removes.length ? ` REMOVE ${removes.join(', ')}` : ''}`, ExpressionAttributeValues: values, ReturnValues: 'ALL_NEW' }));
  await audit(context, 'ADMIN_UPDATE_SETTINGS', { changed: Object.keys(input) });
  return reply(200, adminSettings(result.Attributes));
};

// ---------------------------------------------------------------- image uploads

const imageTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const uploads = async (context: Context) => {
  if (context.method !== 'POST') throw notFound('Ruta de administración no encontrada.');
  const input = parseBody<AdminAssetUploadRequest>(context.event);
  const extension = typeof input.contentType === 'string' ? imageTypes[input.contentType] : undefined;
  if (!extension) throw invalid('La imagen debe ser JPG, PNG o WebP.');
  if (input.kind !== 'avatar' && input.kind !== 'affiliation') throw invalid('El tipo de imagen no es válido.');
  const limit = 5 * 1024 * 1024;
  if (!Number.isInteger(input.size) || input.size! < 1 || input.size! > limit) throw invalid('La imagen no puede superar los 5 MB.');
  if (!process.env.MEDIA_BUCKET) throw new Error('MEDIA_BUCKET is not configured.');
  const key = `${input.kind === 'avatar' ? 'avatars' : 'affiliations'}/${randomUUID()}.${extension}`;
  const { url, fields } = await createPresignedPost(s3, { Bucket: process.env.MEDIA_BUCKET, Key: key, Expires: 300, Fields: { 'Content-Type': input.contentType!, 'Cache-Control': 'public, max-age=31536000, immutable' }, Conditions: [['content-length-range', 1, limit]] });
  const response: AdminAssetUploadResponse = { key, upload: { url, fields } };
  return reply(201, response);
};

const resources: Record<string, (context: Context) => ReturnType<typeof players>> = { players, challenges, 'por-la-cara': porLaCara, affiliations, settings, uploads };

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  const session = await requireSession(event, ['admin']);
  // The role is re-read from the database, so removing someone's admin role takes effect immediately.
  await requireUser(session);
  const [, resource, rawId] = event.requestContext.http.path.replace(/^.*\/admin(?=\/|$)/, '').split('/');
  const run = resources[resource ?? ''];
  if (!run) throw notFound('Ruta de administración no encontrada.');
  return run({ event, session, method: event.requestContext.http.method, id: rawId ? decodeURIComponent(rawId) : undefined });
});

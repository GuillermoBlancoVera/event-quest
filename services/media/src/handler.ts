import { randomUUID } from 'node:crypto';
import { DeleteCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectTaggingCommand, S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyEventV2, APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { CancelMediaUploadsRequest, CreateMediaUploadRequest, CreateMediaUploadResponse, EventMedia, MediaPage, PresignedUpload, UpdateMediaRequest } from '@event-quest/shared';
import { api, auditItem, db, getSettings, HttpError, parseBody, queryAll, reply, requireSession, requireUser, tables, text, type Session } from '@event-quest/server';
import { matchesSignature, maxBytes, pendingTagging, previewMaxBytes, resolveMediaType } from './media-types.js';

const s3 = new S3Client({});
const eventKey = 'EVENT#WEDDING';
const pageSize = 10;
const uploadExpirySeconds = 15 * 60;
const pendingTtlSeconds = 2 * 24 * 60 * 60;
const bucket = () => {
  if (!process.env.MEDIA_BUCKET) throw new Error('MEDIA_BUCKET is not configured.');
  return process.env.MEDIA_BUCKET;
};

type MediaItem = {
  PK: string; SK: string; mediaId: string; batchId?: string; key: string; thumbnailKey?: string; displayKey?: string;
  cancellationToken: string; authorId?: string; authorName: string; message?: string; contentType: string; createdAt: string;
  status: 'PENDING' | 'UPLOADED' | 'DELETED'; expiresAt?: number;
};

/** Gallery access: players, admins, and guests whose session was issued for the current wedding code. */
const requireGallerySession = async (event: APIGatewayProxyEventV2) => {
  const session = await requireSession(event);
  if (session.role === 'guest') {
    const settings = await getSettings();
    if (!settings?.eventCode || (settings.eventCodeVersion ?? 0) !== (session.ev ?? 0)) throw new HttpError(401, 'UNAUTHORIZED', 'El código de la boda ha cambiado. Vuelve a introducirlo.');
  }
  return session;
};

const findMedia = async (mediaId: string) => {
  const items = await queryAll<MediaItem>({ TableName: tables.media(), IndexName: 'mediaId-index', KeyConditionExpression: 'mediaId = :mediaId', ExpressionAttributeValues: { ':mediaId': mediaId } });
  return items[0];
};

const objectKeys = (item: MediaItem) => [item.key, item.displayKey, item.thumbnailKey].filter((key): key is string => Boolean(key));

/** Removes the files from S3 and then the record, so a deleted memory is really gone. */
const destroyMedia = async (item: MediaItem) => {
  const result = await s3.send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: objectKeys(item).map(Key => ({ Key })), Quiet: true } }));
  if (result.Errors?.length) throw new Error(`Could not delete ${result.Errors.length} media objects.`);
  await db.send(new DeleteCommand({ TableName: tables.media(), Key: { PK: item.PK, SK: item.SK } }));
};

const presignUpload = async (key: string, contentType: string, limit: number): Promise<PresignedUpload> => {
  // A presigned POST lets S3 itself enforce the size limit and content type, which a presigned PUT cannot do.
  const { url, fields } = await createPresignedPost(s3, {
    Bucket: bucket(), Key: key, Expires: uploadExpirySeconds,
    Fields: { 'Content-Type': contentType, tagging: pendingTagging },
    Conditions: [['content-length-range', 1, limit]],
  });
  return { url, fields };
};

// Signing against the start of the hour keeps the URL stable for that hour, so browsers can cache the file.
const signedView = (key: string) => {
  const signingDate = new Date();
  signingDate.setUTCMinutes(0, 0, 0);
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseCacheControl: 'private, max-age=3600' }), { expiresIn: 2 * 60 * 60, signingDate });
};

const cursorFor = (item: MediaItem) => JSON.stringify({ PK: item.PK, SK: item.SK });
const parseCursor = (cursor?: string) => {
  if (!cursor) return undefined;
  try {
    const key = JSON.parse(cursor) as { PK?: unknown; SK?: unknown };
    if (key.PK === eventKey && typeof key.SK === 'string') return { PK: key.PK, SK: key.SK };
  } catch { /* handled below */ }
  throw new HttpError(400, 'VALIDATION_ERROR', 'La página solicitada no es válida.');
};

const list = async (event: APIGatewayProxyEventV2, session: Session) => {
  const visible: MediaItem[] = [];
  let startKey = parseCursor(event.queryStringParameters?.cursor) as Record<string, unknown> | undefined;
  let more = false;
  // Keep reading until a full page of published items is collected; hidden items never shrink a page.
  do {
    const result = await db.send(new QueryCommand({ TableName: tables.media(), KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': eventKey }, ScanIndexForward: false, Limit: pageSize * 3, ExclusiveStartKey: startKey }));
    const items = (result.Items ?? []) as MediaItem[];
    for (const [index, item] of items.entries()) {
      if (item.status !== 'UPLOADED') continue;
      visible.push(item);
      if (visible.length === pageSize) { more = index < items.length - 1 || Boolean(result.LastEvaluatedKey); break; }
    }
    startKey = result.LastEvaluatedKey;
  } while (visible.length < pageSize && startKey);

  const items = await Promise.all(visible.map(async (item): Promise<EventMedia> => ({
    mediaId: item.mediaId, batchId: item.batchId ?? item.mediaId, authorName: item.authorName, message: item.message, contentType: item.contentType, createdAt: item.createdAt,
    canManage: session.role === 'admin' || item.authorId === session.sub,
    url: await signedView(item.key),
    displayUrl: item.displayKey ? await signedView(item.displayKey) : undefined,
    thumbnailUrl: item.thumbnailKey ? await signedView(item.thumbnailKey) : undefined,
  })));
  const page: MediaPage = { items, nextCursor: more ? cursorFor(visible[visible.length - 1]) : undefined };
  return reply(200, page);
};

const createUpload = async (event: APIGatewayProxyEventV2, session: Session) => {
  const body = parseBody<CreateMediaUploadRequest>(event);
  const media = typeof body.fileName === 'string' ? resolveMediaType(body.contentType, body.fileName) : undefined;
  if (!media) throw new HttpError(400, 'UNSUPPORTED_MEDIA', 'Solo se pueden subir fotos y vídeos (JPG, PNG, HEIC, WebP, GIF, MP4, MOV…).');
  const limit = maxBytes(media.kind);
  const megabytes = Math.round(limit / 1024 / 1024);
  if (!Number.isInteger(body.size) || body.size! < 1) throw new HttpError(400, 'VALIDATION_ERROR', 'No se ha podido leer el tamaño del archivo.');
  if (body.size! > limit) throw new HttpError(413, 'FILE_TOO_LARGE', `${media.kind === 'video' ? 'El vídeo' : 'La foto'} supera el máximo de ${megabytes} MB.`);
  const wantsPreview = (size: unknown) => Number.isInteger(size) && (size as number) > 0 && (size as number) <= previewMaxBytes;

  const author = session.role === 'guest' ? undefined : await requireUser(session);
  const now = new Date().toISOString();
  const mediaId = randomUUID();
  const item: MediaItem = {
    PK: eventKey, SK: `${now}#${mediaId}`, mediaId,
    batchId: typeof body.batchId === 'string' && /^[a-z0-9-]{1,64}$/i.test(body.batchId) ? body.batchId : mediaId,
    key: `media/${now.slice(0, 10)}/${mediaId}.${media.extension}`,
    thumbnailKey: wantsPreview(body.thumbnailSize) ? `media/thumbnails/${mediaId}.jpg` : undefined,
    displayKey: media.kind === 'image' && wantsPreview(body.displaySize) ? `media/display/${mediaId}.jpg` : undefined,
    cancellationToken: randomUUID(),
    authorId: session.sub, authorName: author?.name ?? 'anónimo',
    message: text(body.message, 500) ?? 'recuerditos',
    contentType: media.contentType, createdAt: now, status: 'PENDING',
    // Uploads that are never completed disappear on their own (DynamoDB TTL here, a lifecycle rule in S3).
    expiresAt: Math.floor(Date.now() / 1000) + pendingTtlSeconds,
  };
  await db.send(new PutCommand({ TableName: tables.media(), Item: item }));
  const response: CreateMediaUploadResponse = {
    mediaId, cancellationToken: item.cancellationToken, contentType: media.contentType,
    upload: await presignUpload(item.key, media.contentType, limit),
    thumbnailUpload: item.thumbnailKey ? await presignUpload(item.thumbnailKey, 'image/jpeg', previewMaxBytes) : undefined,
    displayUpload: item.displayKey ? await presignUpload(item.displayKey, 'image/jpeg', previewMaxBytes) : undefined,
  };
  return reply(201, response);
};

const firstBytes = async (key: string) => {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket(), Key: key, Range: 'bytes=0-31' }));
  return object.Body ? await object.Body.transformToByteArray() : new Uint8Array();
};

const complete = async (event: APIGatewayProxyEventV2, session: Session, mediaId: string) => {
  const item = await findMedia(mediaId);
  // Only the session that started an upload can publish it, and only once.
  if (!item || item.authorId !== session.sub) throw new HttpError(404, 'NOT_FOUND', 'No se ha encontrado la subida.');
  if (item.status === 'UPLOADED') return reply(200, { ok: true });
  if (item.status !== 'PENDING') throw new HttpError(409, 'NOT_PENDING', 'Esta subida ya no se puede completar.');

  const kind = item.contentType.startsWith('video/') ? 'video' : 'image';
  try {
    const head = await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: item.key }));
    if ((head.ContentLength ?? 0) > maxBytes(kind)) throw new HttpError(413, 'FILE_TOO_LARGE', 'El archivo es demasiado grande.');
    for (const key of [item.displayKey, item.thumbnailKey]) if (key) await s3.send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (error) {
    if (error instanceof HttpError) { await destroyMedia(item); throw error; }
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    // Without s3:ListBucket a missing object is reported as 403 rather than 404; both mean "not uploaded yet".
    if (status === 404 || status === 403) throw new HttpError(409, 'UPLOAD_INCOMPLETE', 'La subida todavía no se ha completado.');
    throw error;
  }
  // The declared type is only a label; check that the bytes really are a photo or a video before publishing.
  const previews = [item.displayKey, item.thumbnailKey].filter((key): key is string => Boolean(key));
  const genuine = matchesSignature(kind, await firstBytes(item.key)) && (await Promise.all(previews.map(async key => matchesSignature('image', await firstBytes(key))))).every(Boolean);
  if (!genuine) {
    await destroyMedia(item);
    await db.send(new PutCommand({ TableName: tables.audit(), Item: auditItem('REJECT_MEDIA', event, session, { mediaId, contentType: item.contentType }) }));
    throw new HttpError(422, 'UNSUPPORTED_MEDIA', 'El archivo no parece una foto ni un vídeo válido.');
  }
  await Promise.all(objectKeys(item).map(Key => s3.send(new PutObjectTaggingCommand({ Bucket: bucket(), Key, Tagging: { TagSet: [{ Key: 'state', Value: 'ready' }] } }))));
  try {
    await db.send(new UpdateCommand({ TableName: tables.media(), Key: { PK: item.PK, SK: item.SK }, UpdateExpression: 'SET #status = :uploaded, uploadedAt = :now REMOVE expiresAt', ConditionExpression: '#status = :pending', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':uploaded': 'UPLOADED', ':pending': 'PENDING', ':now': new Date().toISOString() } }));
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') throw new HttpError(409, 'NOT_PENDING', 'Esta subida ya no se puede completar.');
    throw error;
  }
  return reply(200, { ok: true });
};

const cancel = async (event: APIGatewayProxyEventV2, session: Session) => {
  const body = parseBody<CancelMediaUploadsRequest>(event);
  const uploads = Array.isArray(body.uploads) ? body.uploads.slice(0, 100) : [];
  if (!uploads.length || uploads.some(upload => typeof upload?.mediaId !== 'string' || typeof upload?.cancellationToken !== 'string')) throw new HttpError(400, 'VALIDATION_ERROR', 'No se han encontrado archivos para cancelar.');
  await Promise.all(uploads.map(async upload => {
    const item = await findMedia(upload.mediaId);
    if (item && item.authorId === session.sub && item.cancellationToken === upload.cancellationToken) await destroyMedia(item);
  }));
  return reply(200, { ok: true });
};

const manage = async (event: APIGatewayProxyEventV2, session: Session, mediaId: string) => {
  const item = await findMedia(mediaId);
  if (!item || item.status !== 'UPLOADED') throw new HttpError(404, 'NOT_FOUND', 'No se ha encontrado el recuerdo.');
  if (session.role !== 'admin' && item.authorId !== session.sub) throw new HttpError(403, 'FORBIDDEN', 'No puedes gestionar este recuerdo.');
  if (event.requestContext.http.method === 'DELETE') {
    await destroyMedia(item);
    await db.send(new PutCommand({ TableName: tables.audit(), Item: auditItem('DELETE_MEDIA', event, session, { mediaId, authorId: item.authorId }) }));
    return reply(200, { ok: true });
  }
  const body = parseBody<UpdateMediaRequest>(event);
  await db.send(new UpdateCommand({ TableName: tables.media(), Key: { PK: item.PK, SK: item.SK }, UpdateExpression: 'SET message = :message, updatedAt = :now', ConditionExpression: 'attribute_exists(PK)', ExpressionAttributeValues: { ':message': text(body.message, 500) ?? 'recuerditos', ':now': new Date().toISOString() } }));
  return reply(200, { ok: true });
};

export const handler: APIGatewayProxyHandlerV2 = api(async event => {
  const { method, path } = event.requestContext.http;
  const session = await requireGallerySession(event);
  const mediaId = event.pathParameters?.id;

  if (method === 'GET') return list(event, session);
  if (method === 'POST' && path.endsWith('/uploads')) return createUpload(event, session);
  if (method === 'POST' && path.endsWith('/cancel')) return cancel(event, session);
  if (method === 'POST' && mediaId && path.endsWith('/complete')) return complete(event, session, mediaId);
  if ((method === 'PATCH' || method === 'DELETE') && mediaId) return manage(event, session, mediaId);
  throw new HttpError(404, 'NOT_FOUND', 'Ruta de recuerdos no encontrada.');
});

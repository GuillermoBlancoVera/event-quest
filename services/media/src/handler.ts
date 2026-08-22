import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import type { CreateMediaUploadRequest, EventMedia } from '@event-quest/shared';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const reply = (statusCode: number, body: unknown) => ({ statusCode, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const eventKey = 'EVENT#WEDDING';
const isMedia = (contentType: unknown) => typeof contentType === 'string' && /^(image|video)\/(?:[\w.+-]+|\*)$/i.test(contentType);

export const handler: APIGatewayProxyHandlerV2 = async event => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  if (method === 'GET') {
    const result = await db.send(new QueryCommand({ TableName: process.env.MEDIA_TABLE, KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': eventKey }, ScanIndexForward: false, Limit: 100 }));
    const visible = (result.Items ?? []).filter(item => item.status === 'UPLOADED');
    const media = await Promise.all(visible.map(async item => ({ mediaId: item.mediaId, authorName: item.authorName, message: item.message, contentType: item.contentType, createdAt: item.createdAt, url: await getSignedUrl(s3, new GetObjectCommand({ Bucket: process.env.MEDIA_BUCKET, Key: item.key }), { expiresIn: 900 }) } satisfies EventMedia)));
    return reply(200, media);
  }

  const body = JSON.parse(event.body ?? '{}') as CreateMediaUploadRequest;
  if (method === 'POST' && path.endsWith('/uploads')) {
    if (typeof body.fileName !== 'string' || !isMedia(body.contentType)) return reply(400, { message: 'Selecciona una imagen o un vídeo válido.' });
    const now = new Date().toISOString();
    const mediaId = crypto.randomUUID();
    const extension = body.fileName.trim().split('.').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 12);
    const key = `media/${now.slice(0, 10)}/${mediaId}${extension ? `.${extension}` : ''}`;
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : undefined;
    await db.send(new PutCommand({ TableName: process.env.MEDIA_TABLE, Item: { PK: eventKey, SK: `${now}#${mediaId}`, mediaId, key, authorName: 'anónimo', message, contentType: body.contentType, createdAt: now, status: 'PENDING' } }));
    const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: process.env.MEDIA_BUCKET, Key: key, ContentType: body.contentType }), { expiresIn: 900 });
    return reply(201, { mediaId, key, uploadedAt: now, uploadUrl });
  }

  const mediaId = event.pathParameters?.id;
  if (method === 'POST' && mediaId && path.endsWith('/complete')) {
    const result = await db.send(new QueryCommand({ TableName: process.env.MEDIA_TABLE, KeyConditionExpression: 'PK = :pk', FilterExpression: 'mediaId = :mediaId', ExpressionAttributeValues: { ':pk': eventKey, ':mediaId': mediaId } }));
    const item = result.Items?.[0];
    if (!item) return reply(404, { message: 'No se ha encontrado la subida.' });
    try { await s3.send(new HeadObjectCommand({ Bucket: process.env.MEDIA_BUCKET, Key: item.key })); } catch { return reply(409, { message: 'La subida todavía no se ha completado.' }); }
    await db.send(new UpdateCommand({ TableName: process.env.MEDIA_TABLE, Key: { PK: item.PK, SK: item.SK }, UpdateExpression: 'SET #status = :status, uploadedAt = :now', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':status': 'UPLOADED', ':now': new Date().toISOString() } }));
    return reply(200, { ok: true });
  }
  return reply(404, { message: 'Ruta de recuerdos no encontrada.' });
};

import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectTaggingCommand, S3Client } from '@aws-sdk/client-s3';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { call, configureTestEnvironment, tokenFor } from '@event-quest/server';
import { handler } from './handler.js';

configureTestEnvironment();
const db = mockClient(DynamoDBDocumentClient);
const s3 = mockClient(S3Client);
const item = (overrides: object = {}) => ({ PK: 'EVENT#WEDDING', SK: '2027-09-24T10:00:00.000Z#m1', mediaId: 'm1', key: 'media/2027-09-24/m1.jpg', cancellationToken: 'cancel-1', authorId: 'guest:a', authorName: 'anónimo', contentType: 'image/jpeg', createdAt: '2027-09-24T10:00:00.000Z', status: 'UPLOADED', ...overrides });
const body = (bytes: number[]) => ({ Body: { transformToByteArray: async () => Uint8Array.from([...bytes, ...new Array(32).fill(0)]) } }) as never;
const jpeg = [0xff, 0xd8, 0xff, 0xe0];
const settings = (value: object) => db.on(GetCommand, { TableName: 'settings' }).resolves({ Item: value });
const guest = (id = 'a', version = 1) => tokenFor(`guest:${id}`, 'guest', version);

beforeEach(() => {
  db.reset(); s3.reset();
  settings({ eventCode: 'olivos2027', eventCodeVersion: 1 });
  db.on(PutCommand).resolves({}); db.on(UpdateCommand).resolves({}); db.on(DeleteCommand).resolves({});
  s3.on(DeleteObjectsCommand).resolves({}); s3.on(PutObjectTaggingCommand).resolves({});
});

describe('gallery access', () => {
  it('is closed without a session and to guests holding an old wedding code', async () => {
    expect((await call(handler, { path: '/media' })).status).toBe(401);
    expect((await call(handler, { path: '/media', token: await guest('a', 0) })).status).toBe(401);
    settings({});
    expect((await call(handler, { path: '/media', token: await guest() })).status).toBe(401);
  });

  it('lists published items with signed links and marks only the caller’s own as manageable', async () => {
    db.on(QueryCommand).resolves({ Items: [item(), item({ mediaId: 'm2', SK: 'x#m2', authorId: 'guest:b' }), item({ mediaId: 'm3', SK: 'x#m3', status: 'PENDING' })] });
    const { status, body: page } = await call(handler, { path: '/media', token: await guest() });
    expect(status).toBe(200);
    expect(page.items.map((entry: { mediaId: string; canManage: boolean }) => [entry.mediaId, entry.canManage])).toEqual([['m1', true], ['m2', false]]);
    expect(page.items[0].url).toContain('X-Amz-Signature');
    expect(page.nextCursor).toBeUndefined();
  });
});

describe('POST /media/uploads', () => {
  const create = async (input: object) => call(handler, { method: 'POST', path: '/media/uploads', token: await guest(), body: { fileName: 'foto.jpg', contentType: 'image/jpeg', size: 1000, ...input } });

  it('returns a one-time form whose policy caps the size and pins the type', async () => {
    const { status, body: upload } = await create({});
    expect(status).toBe(201);
    const policy = JSON.parse(Buffer.from(upload.upload.fields.Policy, 'base64').toString());
    expect(policy.conditions).toContainEqual(['content-length-range', 1, 40 * 1024 * 1024]);
    expect(policy.conditions).toContainEqual({ 'Content-Type': 'image/jpeg' });
    expect(policy.conditions).toContainEqual({ key: expect.stringMatching(/^media\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]{36}\.jpg$/) });
    expect(upload.upload.fields.tagging).toContain('pending');
    expect(db.commandCalls(PutCommand)[0].args[0].input.Item).toMatchObject({ status: 'PENDING', authorId: 'guest:a', authorName: 'anónimo', expiresAt: expect.any(Number) });
  });

  it('refuses unsupported formats, oversized files and missing sizes', async () => {
    expect((await create({ fileName: 'logo.svg', contentType: 'image/svg+xml' })).body.code).toBe('UNSUPPORTED_MEDIA');
    expect((await create({ fileName: 'page.html', contentType: 'text/html' })).status).toBe(400);
    expect((await create({ size: 41 * 1024 * 1024 })).status).toBe(413);
    expect((await create({ size: undefined })).status).toBe(400);
    expect(db.commandCalls(PutCommand)).toHaveLength(0);
  });
});

describe('POST /media/{id}/complete', () => {
  const complete = async (token: string) => call(handler, { method: 'POST', path: '/media/m1/complete', id: 'm1', token, body: {} });

  it('cannot be used by anyone but the uploader, nor to republish a deleted item', async () => {
    db.on(QueryCommand).resolves({ Items: [item({ status: 'PENDING' })] });
    expect((await complete(await guest('b'))).status).toBe(404);
    db.on(QueryCommand).resolves({ Items: [item({ status: 'DELETED' })] });
    expect((await complete(await guest('a'))).status).toBe(409);
    expect(db.commandCalls(UpdateCommand)).toHaveLength(0);
  });

  it('publishes a genuine photo and clears its pending tag', async () => {
    db.on(QueryCommand).resolves({ Items: [item({ status: 'PENDING' })] });
    s3.on(HeadObjectCommand).resolves({ ContentLength: 1000 });
    s3.on(GetObjectCommand).resolves(body(jpeg));
    expect((await complete(await guest('a'))).status).toBe(200);
    expect(s3.commandCalls(PutObjectTaggingCommand)[0].args[0].input.Tagging).toEqual({ TagSet: [{ Key: 'state', Value: 'ready' }] });
    expect(db.commandCalls(UpdateCommand)[0].args[0].input).toMatchObject({ ConditionExpression: '#status = :pending' });
  });

  it('deletes and rejects a file whose bytes are not a photo', async () => {
    db.on(QueryCommand).resolves({ Items: [item({ status: 'PENDING' })] });
    s3.on(HeadObjectCommand).resolves({ ContentLength: 1000 });
    s3.on(GetObjectCommand).resolves(body([...'<script>alert(1)</script>'].map(char => char.charCodeAt(0))));
    expect((await complete(await guest('a'))).status).toBe(422);
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(1);
    expect(db.commandCalls(DeleteCommand)).toHaveLength(1);
    expect(db.commandCalls(UpdateCommand)).toHaveLength(0);
  });
});

describe('DELETE /media/{id}', () => {
  const remove = async (token: string) => call(handler, { method: 'DELETE', path: '/media/m1', id: 'm1', token });

  it('is limited to the author, and really removes the files', async () => {
    db.on(QueryCommand).resolves({ Items: [item({ displayKey: 'media/display/m1.jpg' })] });
    expect((await remove(await guest('b'))).status).toBe(403);
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0);
    expect((await remove(await guest('a'))).status).toBe(200);
    expect(s3.commandCalls(DeleteObjectsCommand)[0].args[0].input.Delete?.Objects).toEqual([{ Key: 'media/2027-09-24/m1.jpg' }, { Key: 'media/display/m1.jpg' }]);
    expect(db.commandCalls(DeleteCommand)).toHaveLength(1);
  });

  it('lets an admin moderate any item', async () => {
    db.on(QueryCommand).resolves({ Items: [item()] });
    expect((await remove(await tokenFor('admin-1', 'admin'))).status).toBe(200);
  });
});

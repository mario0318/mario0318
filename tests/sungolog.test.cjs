'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const { createSungolog, LocalStore, GCSStore, createVerifier, contentHash, bskySnapshot } = require('../lib/sungolog.cjs');

async function fixture(t, overrides = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'sungolog-test-'));
  const app = createSungolog({ directory, env: {}, verifyOwner: async token => { if (token !== 'test-owner') { const error = new Error('invalid token'); error.status = 401; throw error; } return {}; }, ...overrides });
  t.after(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  const request = async (route, { owner = false, body, raw, method = body ? 'POST' : 'GET', headers = {} } = {}) => {
    const req = Readable.from(raw ? [Buffer.from(raw)] : body ? [Buffer.from(JSON.stringify(body))] : []);
    req.url = '/api/sungolog' + route; req.method = method;
    req.headers = { ...(owner ? { authorization: 'Bearer test-owner' } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers };
    let status, responseHeaders, bytes;
    const res = { writeHead(code, values) { status = code; responseHeaders = values; }, end(value) { bytes = Buffer.from(value || ''); } };
    assert.equal(await app.handle(req, res), true);
    return { status, headers: responseHeaders, body: (responseHeaders['content-type'] || '').includes('application/json') ? JSON.parse(bytes) : bytes };
  };
  return { app, request, directory };
}
const remote = (value = 'first', count = 1) => ({ uri: 'at://did:plc:owner/app.bsky.feed.post/one', cid: value, author: { did: 'did:plc:owner', handle: 'example.bsky.social' }, record: { $type: 'app.bsky.feed.post', text: value, createdAt: '2020-01-01T00:00:00.000Z' }, likeCount: count });
const source = { did: 'did:plc:owner', handle: 'example.bsky.social' };

test('owner auth gates writes and private posts stay out of public list, detail, and media', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/posts', { body: { text: 'no' } })).status, 401);
  assert.equal((await request('/posts', { headers: { authorization: 'Bearer wrong' } })).status, 401);
  const created = await request('/posts', { owner: true, body: { text: 'private', media: [{ data: Buffer.from('image-bytes').toString('base64'), type: 'image/png' }] } });
  assert.equal(created.status, 201);
  const id = created.body.id, hash = created.body.media[0].hash;
  assert.deepEqual((await request('/posts')).body.posts, []);
  assert.equal((await request('/posts/' + id)).status, 404);
  assert.equal((await request('/media/' + hash)).status, 404);
  assert.equal((await request('/media/' + hash, { owner: true })).body.toString(), 'image-bytes');
  assert.equal((await request('/posts/' + id, { owner: true, method: 'PATCH', body: { visibility: 'public' } })).status, 200);
  assert.equal((await request('/posts')).body.posts[0].text, 'private');
  assert.equal((await request('/media/' + hash)).status, 200);
  await request('/posts/' + id, { owner: true, method: 'PATCH', body: { visibility: 'private' } });
  assert.equal((await request('/media/' + hash)).status, 404);
});

test('original edits preserve revisions and survive application restart', async t => {
  const { app, request, directory } = await fixture(t);
  const created = await request('/posts', { owner: true, body: { text: 'before', title: 'hello', visibility: 'public' } });
  const edited = await request('/posts/' + created.body.id, { owner: true, method: 'PATCH', body: { text: 'after' } });
  assert.equal(edited.body.revisionCount, 2);
  assert.equal(edited.body.revisions[0].text, 'before');
  const second = createSungolog({ directory, env: {} });
  const stored = await second.load(true);
  assert.equal(stored.posts[created.body.id].revisions[1].text, 'after');
  const snapshotNames = await fs.readdir(path.join(directory, 'snapshots', created.body.id));
  assert.equal(snapshotNames.length, 2);
  assert.equal((await app.load()).posts[created.body.id].revisions[0].text, 'before');
});

test('social snapshots deduplicate count changes, preserve source edits, and reject archive editing', async t => {
  const { app, request } = await fixture(t);
  await app.mutate(state => app.archiveBsky(state, remote('first', 1), source));
  await app.mutate(state => app.archiveBsky(state, remote('first', 99), source));
  await app.mutate(state => app.archiveBsky(state, remote('edited', 100), source));
  const list = await request('/posts', { owner: true });
  const post = list.body.posts[0];
  assert.equal(post.revisionCount, 2);
  assert.equal(post.publishedAt, '2020-01-01T00:00:00.000Z');
  assert.notEqual(post.capturedAt, post.publishedAt);
  assert.equal((await request('/posts/' + post.id, { owner: true, method: 'PATCH', body: { text: 'fake history' } })).status, 409);
  assert.equal((await request('/import', { owner: true, body: { sourceURL: post.source.url, platform: 'bluesky', sourceId: post.source.id, text: 'fake API revision' } })).status, 409);
  assert.equal((await request('/posts/' + post.id, { owner: true, method: 'PATCH', body: { visibility: 'public' } })).status, 200);
  const detail = await request('/posts/' + post.id);
  assert.equal(detail.body.revisions[0].text, 'first');
  assert.equal(detail.body.revisions[0].record, undefined);
  assert.equal(contentHash(bskySnapshot(remote('first', 1))), contentHash(bskySnapshot(remote('first', 99))));
});

test('failed social media is explicit and arbitrary hosts are never fetched', async t => {
  const requested = [];
  const { app, request } = await fixture(t, { fetch: async url => { requested.push(String(url)); throw new Error('offline'); } });
  const value = remote();
  value.embed = { images: [{ fullsize: 'https://metadata.google.internal/secret', alt: 'blocked' }, { fullsize: 'https://cdn.bsky.app/image/missing', alt: 'unavailable' }] };
  await app.mutate(state => app.archiveBsky(state, value, source));
  const post = (await request('/posts', { owner: true })).body.posts[0];
  assert.equal(post.media[0].status, 'not-copied');
  assert.equal(post.media[1].status, 'not-copied');
  assert.deepEqual(requested, ['https://cdn.bsky.app/image/missing']);
});

test('media recovery is retried and labelled separately from source edits', async t => {
  let offline = true;
  const { app, request } = await fixture(t, { fetch: async () => { if (offline) throw new Error('offline'); return new Response('later-image', { headers: { 'content-type': 'image/png' } }); } });
  const value = remote(); value.embed = { images: [{ fullsize: 'https://cdn.bsky.app/image/example', alt: 'a picture' }] };
  await app.mutate(state => app.archiveBsky(state, value, source));
  offline = false;
  await app.mutate(state => app.archiveBsky(state, value, source));
  const post = (await request('/posts', { owner: true })).body.posts[0];
  const detail = (await request('/posts/' + post.id, { owner: true })).body;
  assert.equal(detail.revisionCount, 2);
  assert.equal(detail.revisions[0].media[0].status, 'not-copied');
  assert.equal(detail.revisions[1].media[0].status, 'copied');
  assert.equal(detail.revisions[1].changeType, 'media-recovery');
  assert.equal(detail.revisions[0].sourceContentHash, detail.revisions[1].sourceContentHash);
});

test('manual imports are private, provenance labelled, and immutable through editing', async t => {
  const { request } = await fixture(t);
  const imported = await request('/import', { owner: true, body: { sourceURL: 'https://www.instagram.com/p/example/', platform: 'instagram', text: 'from an export', visibility: 'public' } });
  assert.equal(imported.status, 201);
  assert.equal(imported.body.visibility, 'private');
  assert.equal(imported.body.provenance, 'owner-import');
  assert.equal((await request('/posts/' + imported.body.id, { owner: true, method: 'PATCH', body: { text: 'rewrite' } })).status, 409);
});

test('local generation preconditions reject stale writes, and production refuses ephemeral storage', async t => {
  const { directory } = await fixture(t);
  const store = new LocalStore(directory);
  const first = await store.write('example.json', Buffer.from('first'), '0');
  await store.write('example.json', Buffer.from('second'), first);
  await assert.rejects(store.write('example.json', Buffer.from('lost update'), first), error => error.status === 409);
  const production = createSungolog({ env: { K_SERVICE: 'prod' } });
  await assert.rejects(production.load(), error => error.status === 503);
});

test('GCS adapter uses runtime identity and generation preconditions without public object URLs', async () => {
  const calls = [];
  const store = new GCSStore('private-archive', async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'runtime-token', expires_in: 3600 });
    if (options.method === 'POST') return Response.json({ generation: '2' });
    return new Response(JSON.stringify({ saved: true }), { headers: { 'x-goog-generation': '1' } });
  });
  assert.equal((await store.read('state.json')).generation, '1');
  assert.equal(await store.write('state.json', Buffer.from(JSON.stringify({ value: 'new' })), '1'), '2');
  assert.equal(calls[0].options.headers['Metadata-Flavor'], 'Google');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer runtime-token');
  assert.equal(new URL(calls[2].url).searchParams.get('ifGenerationMatch'), '1');
  assert.equal(new URL(calls[2].url).searchParams.get('name'), 'sungolog/state.json');
  assert.equal(calls.length, 3);
});

test('JWT verifier checks signature, audience, expiry, owner identity, and verified email', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const now = 1800000000000;
  const verifier = createVerifier(async () => new Response(JSON.stringify({ signing: publicKey.export({ type: 'spki', format: 'pem' }) }), { headers: { 'content-type': 'application/json' } }), () => now);
  function token(overrides = {}) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'signing' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'owner-uid', email: 'mario0318@gmail.com', email_verified: true, iss: 'https://securetoken.google.com/mario0318-terminal-live', aud: 'mario0318-terminal-live', exp: now / 1000 + 60, iat: now / 1000, ...overrides })).toString('base64url');
    const signature = crypto.sign('RSA-SHA256', Buffer.from(header + '.' + payload), privateKey).toString('base64url');
    return header + '.' + payload + '.' + signature;
  }
  assert.equal((await verifier.owner(token())).email, 'mario0318@gmail.com');
  await assert.rejects(verifier.owner(token({ email_verified: false })), error => error.status === 403);
  await assert.rejects(verifier.owner(token({ email: 'other@example.com' })), error => error.status === 403);
  await assert.rejects(verifier.owner(token({ aud: 'wrong-project' })), error => error.status === 401);
  await assert.rejects(verifier.owner(token({ exp: now / 1000 - 1 })), error => error.status === 401);
  const valid = token(); await assert.rejects(verifier.owner(valid.slice(0, -6) + 'aaaaaa'), error => error.status === 401);
});

test('sync never treats missing records as proof of deletion and authenticates scheduler calls', async t => {
  let available = true;
  const { app, request } = await fixture(t, { fetch: async url => {
    const value = String(url);
    if (value.includes('getAuthorFeed')) return Response.json({ feed: [] });
    if (value.includes('getPosts')) return Response.json({ posts: available ? [remote()] : [] });
    throw new Error('unexpected URL');
  } });
  await app.mutate(async state => { state.sources.push(source); await app.archiveBsky(state, remote(), source); });
  assert.equal((await request('/sync', { method: 'POST', headers: { 'x-sungolog-sync': 'wrong' } })).status, 401);
  assert.equal((await request('/sync', { owner: true, method: 'POST' })).status, 200);
  available = false;
  assert.equal((await request('/sync', { owner: true, method: 'POST' })).status, 200);
  const post = (await request('/posts', { owner: true })).body.posts[0];
  assert.equal(post.sourceAvailability, 'unavailable');
  assert.equal(post.revisionCount, 1);
  assert.equal(post.text, 'first');
});

test('privacy changes bypass another instance cache for lists, details, and media', async t => {
  const first = await fixture(t);
  const created = (await first.request('/posts', { owner: true, body: { text: 'public for now', visibility: 'public', media: [{ data: Buffer.from('public-image').toString('base64'), type: 'image/png' }] } })).body;
  const second = await fixture(t, { directory: first.directory });
  assert.equal((await second.request('/posts')).body.posts.length, 1);
  assert.equal((await second.request('/posts/' + created.id)).status, 200);
  assert.equal((await second.request('/media/' + created.media[0].hash)).status, 200);
  await first.request('/posts/' + created.id, { owner: true, method: 'PATCH', body: { visibility: 'private' } });
  assert.equal((await second.request('/posts')).body.posts.length, 0);
  assert.equal((await second.request('/posts/' + created.id)).status, 404);
  assert.equal((await second.request('/media/' + created.media[0].hash)).status, 404);
});

test('media ETags skip unchanged blob reads but visibility is checked before returning 304', async t => {
  const { app, request } = await fixture(t); const read = app.store.read.bind(app.store); let blobReads = 0;
  app.store.read = async key => { if (key.startsWith('media/')) blobReads++; return read(key); };
  const created = (await request('/posts', { owner: true, body: { text: 'public image', visibility: 'public', media: [{ data: Buffer.from('unchanged-image').toString('base64'), type: 'image/png' }] } })).body;
  const route = '/media/' + created.media[0].hash; blobReads = 0;
  const initial = await request(route);
  assert.equal(initial.status, 200); assert.equal(initial.headers.etag, '"' + created.media[0].hash + '"'); assert.equal(initial.headers['cache-control'], 'private, no-cache'); assert.equal(blobReads, 1);
  const cached = await request(route, { headers: { 'if-none-match': initial.headers.etag } });
  assert.equal(cached.status, 304); assert.equal(cached.body.length, 0); assert.equal(blobReads, 1);
  assert.equal((await request(route, { headers: { 'if-none-match': 'W/' + initial.headers.etag } })).status, 304);
  await request('/posts/' + created.id, { owner: true, method: 'PATCH', body: { visibility: 'private' } });
  assert.equal((await request(route, { headers: { 'if-none-match': initial.headers.etag } })).status, 404); assert.equal(blobReads, 1);
  assert.equal((await request(route, { owner: true, headers: { 'if-none-match': initial.headers.etag } })).status, 304);
});

test('Cloud Run safe request and combined attachment limits reject before publishing', async t => {
  const { app, request } = await fixture(t);
  const oversized = await request('/posts', { owner: true, method: 'POST', raw: Buffer.alloc(30 * 1024 * 1024 + 1, 32) });
  assert.equal(oversized.status, 413);
  const hash = 'a'.repeat(64);
  await app.mutate(state => { state.media[hash] = { hash, type: 'image/png', bytes: 8 * 1024 * 1024 }; });
  const combined = await request('/posts', { owner: true, body: { text: 'too much', media: [{ hash }, { hash }, { hash }] } });
  assert.equal(combined.status, 413);
  assert.equal((await request('/posts', { owner: true })).body.posts.length, 0);
});

test('sync time budget preserves completed posts and keeps an unfinished page cursor', async t => {
  let time = Date.now(); const next = remote('second'); next.uri = next.uri.replace('/one', '/two');
  const first = remote(); first.embed = { images: Array.from({ length: 4 }, (_, n) => ({ fullsize: 'https://cdn.bsky.app/' + n, alt: 'picture' })) };
  let mediaCalls = 0;
  const { app } = await fixture(t, { now: () => time, fetch: async url => {
    if (String(url).includes('getAuthorFeed')) return Response.json({ feed: [{ post: first }, { post: next }], cursor: 'next-page' });
    if (String(url).startsWith('https://cdn.bsky.app/')) { mediaCalls++; time += 80000; return new Response('image-' + mediaCalls, { headers: { 'content-type': 'image/png' } }); }
    throw new Error('unexpected fetch after time budget');
  } });
  await app.mutate(state => { state.sources.push({ ...source, backfillComplete: false }); });
  const result = await app.sync();
  const state = await app.load(true);
  assert.equal(Object.keys(state.posts).length, 1);
  assert.equal(mediaCalls, 2);
  assert.equal(result.reports[0].deferred, true);
  assert.equal(state.sources[0].backfillComplete, false);
  assert.equal(state.sources[0].backfillCursor, null);
  assert.equal(Object.values(state.posts)[0].revisions[0].media[2].status, 'not-copied');
});

test('missing GCS generation header falls back to a generation-pinned object read', async () => {
  const urls = [];
  const store = new GCSStore('archive', async url => {
    urls.push(String(url));
    if (String(url).startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'runtime', expires_in: 3600 });
    if (String(url).includes('fields=generation')) return Response.json({ generation: '1234' });
    return new Response(JSON.stringify({ value: String(url).includes('generation=1234') ? 'pinned' : 'unversioned' }));
  });
  const result = await store.read('state.json');
  assert.equal(result.generation, '1234'); assert.equal(JSON.parse(result.data).value, 'pinned');
  assert.ok(urls.at(-1).includes('alt=media&generation=1234'));
});

test('GCS gzip state retains logical JSON and exact media bytes while legacy JSON remains readable', async () => {
  let stored, contentType, legacy = false, time = 1000;
  const originalMedia = Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x45, 0x58, 0x49, 0x46, 0x00]);
  const store = new GCSStore('archive', async (url, options) => {
    if (String(url).startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'runtime', expires_in: 3600 });
    if (options.method === 'POST') {
      const key = new URL(url).searchParams.get('name');
      if (key === 'sungolog/state.json') { stored = Buffer.from(options.body); contentType = options.headers['content-type']; }
      else assert.deepEqual(Buffer.from(options.body), originalMedia);
      return Response.json({ generation: '7' });
    }
    return new Response(legacy ? JSON.stringify({ oldState: true }) : stored, { headers: { 'x-goog-generation': '7' } });
  }, { now: () => time, sleep: async ms => { time += ms; } });
  const logical = { version: '3.1', text: 'a repeating thought '.repeat(1000), posts: {} };
  await store.write('state.json', Buffer.from(JSON.stringify(logical)), '0');
  assert.equal(contentType, 'application/gzip'); assert.equal(stored[0], 0x1f); assert.equal(stored[1], 0x8b);
  assert.ok(stored.length < Buffer.byteLength(JSON.stringify(logical)) / 10);
  const restored = JSON.parse((await store.read('state.json')).data); const writtenAt = restored._storageWrittenAt; delete restored._storageWrittenAt;
  assert.deepEqual(restored, logical); assert.equal(writtenAt, 1000);
  await store.write('media/exact', originalMedia, '0');
  legacy = true; assert.deepEqual(JSON.parse((await store.read('state.json')).data), { oldState: true });
});

test('GCS hot-object uploads space every attempt and bound transient retries', async () => {
  let time = 0, attempts = 0; const times = [];
  const store = new GCSStore('archive', async (url, options) => {
    if (String(url).startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'runtime', expires_in: 3600 });
    if (options.method === 'POST') {
      times.push(time); attempts++; assert.equal(JSON.parse(gunzipSync(options.body))._storageWrittenAt, time);
      return attempts === 1 ? new Response('', { status: 429 }) : attempts === 2 ? new Response('', { status: 503 }) : Response.json({ generation: String(attempts) });
    }
    throw new Error('unexpected read');
  }, { now: () => time, sleep: async ms => { time += ms; } });
  await store.write('state.json', Buffer.from('{}'), '0'); await store.write('state.json', Buffer.from('{}'), '3');
  assert.equal(times.length, 4);
  for (let n = 1; n < times.length; n++) assert.ok(times[n] - times[n - 1] >= 1000);
  const short = new GCSStore('archive', async url => String(url).startsWith('http://metadata.google.internal/') ? Response.json({ access_token: 'runtime', expires_in: 3600 }) : new Response('', { status: 503 }), { now: () => time, sleep: async ms => { time += ms; }, deadline: () => time + 1 });
  await assert.rejects(short.write('state.json', Buffer.from('{}'), '0'), error => error.status === 503);
});

test('GCS decompression refuses an index over the logical eight-MiB bound', async () => {
  const compressed = gzipSync(Buffer.alloc(8 * 1024 * 1024 + 1, 32));
  const store = new GCSStore('archive', async url => String(url).startsWith('http://metadata.google.internal/') ? Response.json({ access_token: 'runtime', expires_in: 3600 }) : new Response(compressed, { headers: { 'x-goog-generation': '2' } }));
  await assert.rejects(store.read('state.json'), error => error.status === 503 && error.message.includes('compression'));
});

test('unchanged mutations do not replace the state object and sync checkpoints batch ten posts', async t => {
  const { directory } = await fixture(t); const local = new LocalStore(directory); let writes = 0;
  const counting = { kind: 'local', read: key => local.read(key), async write(key, data, generation) { if (key === 'state.json') writes++; return local.write(key, data, generation); } };
  const remotes = Array.from({ length: 10 }, (_, i) => { const value = remote('post ' + i); value.uri = value.uri.replace('/one', '/post' + i); return value; });
  const app = createSungolog({ store: counting, env: {}, fetch: async url => String(url).includes('getAuthorFeed') ? Response.json({ feed: remotes.map(post => ({ post })) }) : Response.json({ posts: remotes }) });
  await app.mutate(state => { state.sources.push(source); }); const before = writes;
  await app.mutate(() => {}); assert.equal(writes, before);
  writes = 0; const result = await app.sync();
  assert.equal(Object.keys((await app.load(true)).posts).length, 10);
  assert.ok(writes <= 6, 'ten posts should not each overwrite state.json');
  assert.equal(result.reports[0].changed, 10); assert.equal((await app.load(true)).syncLease, undefined);
});

test('two instances share a CAS sync lease, skip its live holder, and recover after expiry', async t => {
  const { directory } = await fixture(t); let time = Date.now(); let unblock, entered;
  const blocked = new Promise(resolve => { unblock = resolve; }); const firstFetch = new Promise(resolve => { entered = resolve; });
  const first = createSungolog({ directory, env: {}, now: () => time, fetch: async () => { entered(); await blocked; return Response.json({ feed: [] }); } });
  const second = createSungolog({ directory, env: {}, now: () => time, fetch: async () => Response.json({ feed: [] }) });
  await first.mutate(state => { state.sources.push(source); });
  const pending = first.sync(); await firstFetch;
  const skipped = await second.sync(); assert.equal(skipped.skipped, true); assert.match(skipped.reason, /lease/);
  assert.ok((await second.load(true)).syncLease.expiresAt > time);
  unblock(); await pending; assert.equal((await first.load(true)).syncLease, undefined);
  await second.mutate(state => { state.syncLease = { id: 'crashed-worker', expiresAt: time + 1000 }; });
  time += 1001; const recovered = await second.sync(); assert.equal(recovered.skipped, undefined); assert.equal((await second.load(true)).syncLease, undefined);
});

test('batch failure commits earlier posts without advancing its incomplete source cursor', async t => {
  const { directory } = await fixture(t); const local = new LocalStore(directory); let snapshots = 0;
  const failing = { kind: 'local', read: key => local.read(key), async write(key, data, generation) { if (key.startsWith('snapshots/') && ++snapshots === 2) { const error = new Error('unavailable'); error.status = 503; throw error; } return local.write(key, data, generation); } };
  const remotes = [remote('first'), remote('second')]; remotes[1].uri = remotes[1].uri.replace('/one', '/two');
  const app = createSungolog({ store: failing, env: {}, fetch: async () => Response.json({ feed: remotes.map(post => ({ post })), cursor: 'next-page' }) });
  await app.mutate(state => { state.sources.push({ ...source, backfillCursor: 'original-cursor', backfillComplete: false }); });
  const result = await app.sync(); const state = await app.load(true);
  assert.equal(Object.keys(state.posts).length, 1); assert.equal(state.sources[0].backfillCursor, 'original-cursor'); assert.equal(state.syncLease, undefined);
  assert.equal(result.reports[0].errors.length, 1); assert.equal(result.reports[0].changed, 1);
});

test('a new GCS instance honors the previous manifest write timestamp', async () => {
  let time = 10025, uploadedAt;
  const store = new GCSStore('archive', async (url, options) => {
    if (String(url).startsWith('http://metadata.google.internal/')) return Response.json({ access_token: 'runtime', expires_in: 3600 });
    if (options.method === 'POST') { uploadedAt = time; return Response.json({ generation: '10' }); }
    return new Response(gzipSync(Buffer.from(JSON.stringify({ _storageWrittenAt: 10000, old: true }))), { headers: { 'x-goog-generation': '9' } });
  }, { now: () => time, sleep: async ms => { time += ms; } });
  const previous = await store.read('state.json'); await store.write('state.json', previous.data, previous.generation);
  assert.ok(uploadedAt - 10000 >= 1000);
});

test('a worker that loses its sync lease never removes the replacement lease', async t => {
  const { directory } = await fixture(t); let unblock, entered;
  const blocked = new Promise(resolve => { unblock = resolve; }); const firstFetch = new Promise(resolve => { entered = resolve; });
  const app = createSungolog({ directory, env: {}, fetch: async () => { entered(); await blocked; return Response.json({ feed: [] }); } });
  const other = createSungolog({ directory, env: {} });
  await app.mutate(state => { state.sources.push(source); }); const pending = app.sync(); await firstFetch;
  await other.mutate(state => { state.syncLease = { id: 'replacement-worker', expiresAt: Date.now() + 300000 }; });
  unblock(); await assert.rejects(pending, error => error.status === 409);
  assert.equal((await other.load(true)).syncLease.id, 'replacement-worker');
});

test('unknown JWT signing key refreshes cached Google certificates once for rotation', async () => {
  const old = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }); const rotated = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }); let calls = 0;
  const now = 1800000000000;
  const verifier = createVerifier(async () => { calls++; return Response.json(calls === 1 ? { old: old.publicKey.export({ type: 'spki', format: 'pem' }) } : { rotated: rotated.publicKey.export({ type: 'spki', format: 'pem' }) }); }, () => now);
  function token(kid, pair) {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'uid', email: 'mario0318@gmail.com', email_verified: true, iss: 'https://securetoken.google.com/mario0318-terminal-live', aud: 'mario0318-terminal-live', exp: now / 1000 + 60, iat: now / 1000 })).toString('base64url');
    return header + '.' + payload + '.' + crypto.sign('RSA-SHA256', Buffer.from(header + '.' + payload), pair.privateKey).toString('base64url');
  }
  await verifier.owner(token('old', old)); await verifier.owner(token('rotated', rotated)); assert.equal(calls, 2);
  await assert.rejects(verifier.owner(token('not-a-google-key', rotated)), error => error.status === 401); assert.equal(calls, 2);
});

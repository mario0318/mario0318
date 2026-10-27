'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { setTimeout: pause } = require('node:timers/promises');
const { AsyncLocalStorage } = require('node:async_hooks');
const { gzipSync, gunzipSync } = require('node:zlib');

const OWNER = 'mario0318@gmail.com';
const PROJECT = 'mario0318-terminal-live';
const PREFIX = '/api/sungolog';
const MAX_MEDIA = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 20 * 1024 * 1024;
const MAX_REQUEST = 30 * 1024 * 1024;
const MAX_STATE = 8 * 1024 * 1024;
const MAX_TOTAL = 1024 * 1024 * 1024;
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'audio/mpeg', 'audio/ogg']);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stable(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function blank() { return { version: '3.1', posts: {}, media: {}, sources: [], bytesUsed: 0, lastSync: null }; }
function text(value, max, name) {
  if (typeof value !== 'string' || value.length > max) fail(400, 'invalid ' + name);
  return value;
}
function visibility(value) {
  if (!['public', 'private'].includes(value)) fail(400, 'visibility must be public or private');
  return value;
}
function safeURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
async function boundedBody(response, max) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > max) { await response.body?.cancel(); fail(413, 'response exceeds archive limit'); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > max) fail(413, 'response exceeds archive limit');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function jsonFetch(fetcher, url, options = {}, max = MAX_STATE) {
  const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) fail(502, 'upstream request failed (' + response.status + ')');
  return JSON.parse((await boundedBody(response, max)).toString('utf8'));
}

class LocalStore {
  constructor(directory) { this.directory = directory; this.kind = 'local'; }
  location(key) { if (!/^[a-zA-Z0-9_./-]+$/.test(key) || key.includes('..')) fail(500, 'invalid object key'); return path.join(this.directory, key); }
  async read(key) {
    try { const data = await fs.readFile(this.location(key)); return { data, generation: digest(data) }; }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  async write(key, data, generation = undefined) {
    const target = this.location(key); await fs.mkdir(path.dirname(target), { recursive: true });
    let lock;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { lock = await fs.open(target + '.lock', 'wx'); break; }
      catch (error) { if (error.code !== 'EEXIST') throw error; await pause(20); }
    }
    if (!lock) fail(503, 'archive is busy');
    try {
      const previous = await this.read(key);
      if (generation !== undefined && String(previous?.generation || '0') !== String(generation)) fail(409, 'archive changed concurrently');
      const temporary = target + '.' + crypto.randomUUID() + '.tmp';
      await fs.writeFile(temporary, data); await fs.rename(temporary, target);
      return digest(data);
    } finally { await lock.close(); await fs.unlink(target + '.lock'); }
  }
}

class GCSStore {
  constructor(bucket, fetcher, options = {}) {
    this.bucket = bucket; this.fetch = fetcher; this.kind = 'gcs'; this.token = null;
    this.now = options.now || Date.now; this.sleep = options.sleep || pause;
    this.deadline = options.deadline || (() => null);
    this.lastStateWrite = -Infinity; this.stateQueue = Promise.resolve();
  }
  async wait(ms) {
    const deadline = this.deadline();
    if (deadline != null && this.now() + ms >= deadline) fail(503, 'source check reached its time limit; saved captures were retained');
    if (ms > 0) await this.sleep(ms);
  }
  async request(url, options) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const deadline = this.deadline();
      if (deadline != null && this.now() >= deadline) fail(503, 'source check reached its time limit; saved captures were retained');
      const response = await this.fetch(url, options);
      if (![429, 503].includes(response.status) || attempt === 3) return response;
      const retryAfter = Number(response.headers.get('retry-after')) * 1000;
      await response.body?.cancel();
      await this.wait(Math.min(5000, Math.max(500 * (2 ** attempt), Number.isFinite(retryAfter) ? retryAfter : 0)));
    }
  }
  async authorization() {
    if (!this.token || this.token.until < this.now()) {
      const result = await jsonFetch(this.fetch, 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', { headers: { 'Metadata-Flavor': 'Google' } }, 8192);
      this.token = { value: result.access_token, until: this.now() + (result.expires_in - 60) * 1000 };
    }
    return { Authorization: 'Bearer ' + this.token.value, 'User-Agent': 'gcs-skills/1.0 (skill:google-cloud-storage-basics)' };
  }
  async read(key) {
    const base = 'https://storage.googleapis.com/storage/v1/b/' + encodeURIComponent(this.bucket) + '/o/' + encodeURIComponent('sungolog/' + key);
    let response = await this.request(base + '?alt=media', { headers: await this.authorization(), redirect: 'error', signal: AbortSignal.timeout(20000) });
    if (response.status === 404) return null;
    if (!response.ok) fail(503, 'archive storage is unavailable');
    let generation = response.headers.get('x-goog-generation');
    if (!generation || !/^[1-9][0-9]*$/.test(generation)) {
      await response.body?.cancel();
      const metadata = await jsonFetch((url, init) => this.request(url, init), base + '?fields=generation', { headers: await this.authorization() }, 10000);
      generation = metadata.generation;
      if (typeof generation !== 'string' || !/^[1-9][0-9]*$/.test(generation)) fail(503, 'archive storage returned no object generation');
      // Pin the second download to the metadata generation, so the bytes and
      // compare-and-swap version still refer to the same object revision.
      response = await this.request(base + '?alt=media&generation=' + encodeURIComponent(generation), { headers: await this.authorization(), redirect: 'error', signal: AbortSignal.timeout(20000) });
      if (!response.ok) fail(503, 'archive changed during storage read; try again');
    }
    let data = await boundedBody(response, Math.max(MAX_STATE, MAX_MEDIA));
    if (key === 'state.json') {
      if (data[0] === 0x1f && data[1] === 0x8b) {
        try { data = gunzipSync(data, { maxOutputLength: MAX_STATE }); }
        catch { fail(503, 'archive index compression is invalid or exceeds the logical size limit'); }
      }
      if (data.length > MAX_STATE) fail(503, 'archive index exceeds the logical size limit');
      const storedAt = JSON.parse(data)._storageWrittenAt;
      if (Number.isFinite(storedAt)) this.lastStateWrite = Math.max(this.lastStateWrite, storedAt);
    }
    return { data, generation };
  }
  async write(key, data, generation = undefined) {
    const operation = () => this.writeObject(key, data, generation);
    if (key !== 'state.json') return operation();
    const pending = this.stateQueue.then(operation, operation);
    this.stateQueue = pending.catch(() => {}); return pending;
  }
  async writeObject(key, data, generation) {
    const url = new URL('https://storage.googleapis.com/upload/storage/v1/b/' + encodeURIComponent(this.bucket) + '/o');
    url.searchParams.set('uploadType', 'media'); url.searchParams.set('name', 'sungolog/' + key);
    if (generation !== undefined) url.searchParams.set('ifGenerationMatch', String(generation));
    const headers = { ...await this.authorization(), 'content-type': 'application/octet-stream' };
    let response;
    for (let attempt = 0; attempt < 4; attempt++) {
      let payload = data;
      if (key === 'state.json') {
        await this.wait(Math.max(0, this.lastStateWrite + 1100 - this.now()));
        this.lastStateWrite = this.now();
        const state = JSON.parse(data); state._storageWrittenAt = this.lastStateWrite;
        const logical = Buffer.from(JSON.stringify(state));
        if (logical.length > MAX_STATE) fail(507, 'archive index exceeds the logical size limit');
        payload = gzipSync(logical); headers['content-type'] = 'application/gzip';
      }
      response = await this.fetch(url, { method: 'POST', headers, body: payload, redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (![429, 503].includes(response.status) || attempt === 3) break;
      const retryAfter = Number(response.headers.get('retry-after')) * 1000;
      await response.body?.cancel();
      await this.wait(Math.min(5000, Math.max(500 * (2 ** attempt), Number.isFinite(retryAfter) ? retryAfter : 0)));
    }
    if (response.status === 412) fail(409, 'archive changed concurrently');
    if (!response.ok) fail(503, 'archive storage is unavailable');
    const result = await response.json(); return result.generation;
  }
}

function createVerifier(fetcher, now = () => Date.now()) {
  const cached = new Map();
  async function verify(token, { issuer, audience, certURL }) {
    if (typeof token !== 'string' || token.length > 16000) fail(401, 'sign in required');
    const pieces = token.split('.'); if (pieces.length !== 3) fail(401, 'invalid sign-in token');
    let header, payload;
    try { header = JSON.parse(Buffer.from(pieces[0], 'base64url')); payload = JSON.parse(Buffer.from(pieces[1], 'base64url')); }
    catch { fail(401, 'invalid sign-in token'); }
    const seconds = Math.floor(now() / 1000);
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' || payload.aud !== audience || !issuer.includes(payload.iss) || !payload.sub || payload.exp <= seconds || !Number.isFinite(payload.exp) || !Number.isFinite(payload.iat) || payload.iat > seconds + 60 || (payload.nbf && payload.nbf > seconds)) fail(401, 'invalid or expired sign-in token');
    let certs = cached.get(certURL);
    if (!certs || certs.until < now()) {
      certs = { keys: await jsonFetch(fetcher, certURL, {}, 100000), until: now() + 60 * 60 * 1000, unknownRefreshAt: -Infinity }; cached.set(certURL, certs);
    }
    if (typeof certs.keys[header.kid] !== 'string' && now() - certs.unknownRefreshAt >= 30000) {
      // A newly rotated signing key can appear before the existing cache TTL.
      // Unknown IDs refresh once, with a cooldown against random-kid flooding.
      certs.unknownRefreshAt = now();
      certs.keys = await jsonFetch(fetcher, certURL, {}, 100000); certs.until = now() + 60 * 60 * 1000;
    }
    const certificate = certs.keys[header.kid];
    if (typeof certificate !== 'string' || !crypto.verify('RSA-SHA256', Buffer.from(pieces[0] + '.' + pieces[1]), certificate, Buffer.from(pieces[2], 'base64url'))) fail(401, 'invalid sign-in token');
    return payload;
  }
  return {
    async owner(token) {
      const payload = await verify(token, { issuer: ['https://securetoken.google.com/' + PROJECT], audience: PROJECT, certURL: 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com' });
      if (payload.email !== OWNER || payload.email_verified !== true) fail(403, 'this account cannot manage sungolog');
      return payload;
    },
    async scheduler(token, email, audience) {
      if (!email || !audience) fail(401, 'scheduled sync is not configured');
      const payload = await verify(token, { issuer: ['accounts.google.com', 'https://accounts.google.com'], audience, certURL: 'https://www.googleapis.com/oauth2/v1/certs' });
      if (payload.email !== email || payload.email_verified !== true) fail(403, 'invalid scheduler identity');
      return payload;
    }
  };
}

function bskySnapshot(post) {
  const record = post.record || {};
  const embedded = post.embed?.media || post.embed || {};
  const media = (embedded.images || []).map(item => ({ sourceURL: item.fullsize, alt: item.alt || '', type: 'image' }));
  if (embedded.$type?.includes('video')) media.push({ sourceURL: null, alt: embedded.alt || '', type: 'video', status: 'not-copied', reason: 'streaming video needs a downloadable source file' });
  if (embedded.external) media.push({ sourceURL: null, type: 'link', status: 'not-copied', reason: 'external link metadata retained in the source record; destination media is not copied' });
  if (post.embed?.record) media.push({ sourceURL: null, type: 'quoted-post', status: 'not-copied', reason: 'quoted post retained in raw source data; quoted media is not copied' });
  return { text: typeof record.text === 'string' ? record.text : '', publishedAt: typeof record.createdAt === 'string' && Number.isFinite(Date.parse(record.createdAt)) ? record.createdAt : null, sourceUpdatedAt: null, sourceURL: 'https://bsky.app/profile/' + post.author.did + '/post/' + post.uri.split('/').pop(), sourceId: post.uri, sourceVersion: post.cid || null, author: { did: post.author.did, handle: post.author.handle }, media, record };
}
function contentHash(snapshot) {
  return digest(stable({ text: snapshot.text, title: snapshot.title || '', tags: snapshot.tags || [], record: snapshot.record || null, media: (snapshot.media || []).map(m => ({ sourceURL: m.sourceURL || null, hash: m.hash || null, alt: m.alt || '', type: m.type })) }));
}

function createSungolog(options = {}) {
  const clock = options.now || (() => Date.now());
  const syncScope = new AsyncLocalStorage();
  const rawFetch = options.fetch || fetch;
  const fetcher = async (url, init = {}) => {
    const scope = syncScope.getStore();
    if (!scope) return rawFetch(url, init);
    const remaining = scope.deadline - clock();
    if (remaining <= 0) fail(503, 'source check reached its time limit; saved captures were retained');
    const deadlineSignal = AbortSignal.timeout(Math.max(1, Math.ceil(remaining)));
    return rawFetch(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, deadlineSignal]) : deadlineSignal });
  };
  const workExpired = () => { const scope = syncScope.getStore(); return !!scope && clock() >= scope.workUntil; };
  const env = options.env || process.env;
  const store = options.store || (env.SUNGOLOG_BUCKET ? new GCSStore(env.SUNGOLOG_BUCKET, fetcher, { now: clock, sleep: options.sleep, deadline: () => syncScope.getStore()?.deadline }) : !env.K_SERVICE ? new LocalStore(options.directory || path.join(__dirname, '../output/sungolog-data')) : null);
  const verifier = createVerifier(fetcher, clock);
  const verifyOwner = options.verifyOwner || (token => verifier.owner(token));
  let cache = null, serial = Promise.resolve(), syncing = false;
  const timestamp = () => new Date(clock()).toISOString();
  async function load(fresh = false) {
    if (!store) fail(503, 'durable archive storage is not configured');
    if (!fresh && cache && clock() - cache.at < 30000) return clone(cache.state);
    const object = await store.read('state.json'); const state = object ? JSON.parse(object.data) : blank();
    cache = { state, at: clock(), generation: object?.generation || '0' }; return clone(state);
  }
  async function mutate(callback) {
    const run = async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const state = await load(true); const generation = cache.generation; const previous = JSON.stringify(state);
        const result = await callback(state);
        const bytes = Buffer.from(JSON.stringify(state));
        if (bytes.toString() === previous) return result;
        if (bytes.length > MAX_STATE) fail(507, 'archive index is full; export it before expanding storage');
        if (state.bytesUsed + bytes.length > MAX_TOTAL) fail(507, 'archive storage safety limit reached');
        try {
          const nextGeneration = await store.write('state.json', bytes, generation);
          cache = { state, generation: nextGeneration, at: clock() }; return result;
        } catch (error) { if (error.status !== 409 || attempt === 3) throw error; }
      }
    };
    const result = serial.then(run, run); serial = result.catch(() => {}); return result;
  }
  async function objectOnce(key, bytes) {
    try { await store.write(key, bytes, '0'); } catch (error) { if (error.status !== 409) throw error; }
  }
  async function saveMedia(state, bytes, type, alt = '') {
    if (!MEDIA_TYPES.has(type) || bytes.length > MAX_MEDIA || !bytes.length) fail(400, 'unsupported or oversized media');
    const hash = digest(bytes);
    if (!state.media[hash]) {
      if (state.bytesUsed + bytes.length > MAX_TOTAL - MAX_STATE) fail(507, 'archive storage safety limit reached');
      await objectOnce('media/' + hash, bytes);
      state.media[hash] = { hash, bytes: bytes.length, type }; state.bytesUsed += bytes.length;
    }
    return { hash, url: PREFIX + '/media/' + hash, type: state.media[hash].type, alt: String(alt).slice(0, 2000), status: 'copied' };
  }
  async function attachments(state, values = []) {
    if (!Array.isArray(values) || values.length > 4) fail(400, 'up to four media files per post');
    const out = [];
    let totalBytes = 0;
    for (const value of values) {
      if (!value || typeof value !== 'object') fail(400, 'invalid media attachment');
      const knownBytes = value.hash && state.media[value.hash]?.bytes;
      const decodedBytes = knownBytes || (typeof value.data === 'string' ? Buffer.byteLength(value.data, 'base64') : 0);
      if (!knownBytes && (typeof value.data !== 'string' || value.data.length > Math.ceil(MAX_MEDIA * 4 / 3) + 4 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(value.data) || !MEDIA_TYPES.has(value.type) || decodedBytes > MAX_MEDIA || !decodedBytes)) fail(400, 'invalid or oversized media data');
      totalBytes += decodedBytes;
      if (totalBytes > MAX_ATTACHMENTS) fail(413, 'combined media exceeds the 20 MiB post limit');
    }
    for (const value of values) {
      if (value.hash && state.media[value.hash]) { out.push({ ...state.media[value.hash], url: PREFIX + '/media/' + value.hash, alt: String(value.alt || '').slice(0, 2000), status: 'copied' }); continue; }
      if (typeof value.data !== 'string' || value.data.length > Math.ceil(MAX_MEDIA * 4 / 3) + 4 || !/^[a-zA-Z0-9+/]*={0,2}$/.test(value.data)) fail(400, 'invalid media data');
      out.push(await saveMedia(state, Buffer.from(value.data, 'base64'), value.type, value.alt));
    }
    return out;
  }
  async function preserve(state, post, snapshot, provenance) {
    const capturedAt = timestamp(); const hash = contentHash(snapshot);
    if (post.revisions.at(-1)?.contentHash === hash) { post.lastCheckedAt = capturedAt; return false; }
    const revision = { ...clone(snapshot), capturedAt, contentHash: hash, provenance, number: post.revisions.length + 1 };
    const raw = Buffer.from(JSON.stringify(revision));
    await objectOnce('snapshots/' + post.id + '/' + digest(raw) + '.json', raw);
    state.bytesUsed += raw.length;
    post.revisions.push(revision); post.lastCheckedAt = capturedAt;
    if (!post.capturedAt) post.capturedAt = capturedAt;
    return true;
  }
  function publicPost(post, owner, details = false) {
    const latest = post.revisions.at(-1);
    const result = { id: post.id, kind: post.kind, visibility: post.visibility, title: latest.title || '', text: latest.text || '', tags: latest.tags || [], publishedAt: latest.publishedAt, capturedAt: post.capturedAt, lastCheckedAt: post.lastCheckedAt, source: post.source || null, media: latest.media || [], revisionCount: post.revisions.length, provenance: latest.provenance, sourceAvailability: post.sourceAvailability || 'unknown' };
    if (details) result.revisions = post.revisions.map(revision => {
      const value = { ...revision }; if (!owner) { delete value.record; delete value.rawSource; } return value;
    });
    return result;
  }
  async function copySocialMedia(state, media) {
    const result = [];
    for (const item of media.slice(0, 4)) {
      if (workExpired()) { result.push({ ...item, status: 'not-copied', reason: 'media capture deferred until the next source check' }); continue; }
      if (!item.sourceURL) { result.push(item); continue; }
      const url = safeURL(item.sourceURL);
      if (!url || new URL(url).hostname !== 'cdn.bsky.app') { result.push({ ...item, status: 'not-copied', reason: 'unrecognized media host' }); continue; }
      try {
        const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error('media fetch failed');
        const type = (response.headers.get('content-type') || '').split(';')[0];
        const bytes = await boundedBody(response, MAX_MEDIA);
        result.push({ ...item, ...await saveMedia(state, bytes, type, item.alt) });
      } catch (error) { result.push({ ...item, status: 'not-copied', reason: error.status === 413 ? 'file exceeds 10 MiB limit' : 'media copy failed' }); }
    }
    return result;
  }
  async function archiveBsky(state, remote, source) {
    if (remote.author?.did !== source.did || !remote.uri?.startsWith('at://' + source.did + '/app.bsky.feed.post/')) return false;
    const snapshot = bskySnapshot(remote); const id = digest(snapshot.sourceId).slice(0, 32);
    const post = state.posts[id] || { id, kind: 'archive', visibility: 'private', source: { platform: 'bluesky', id: snapshot.sourceId, url: snapshot.sourceURL, handle: source.handle }, revisions: [] };
    const incomingHash = contentHash(snapshot);
    const previous = post.revisions.at(-1);
    const sameSource = previous?.sourceContentHash === incomingHash;
    const retryMedia = sameSource && previous.media?.some(item => item.status === 'not-copied' && item.sourceURL);
    if (sameSource && !retryMedia) { post.lastCheckedAt = timestamp(); post.sourceAvailability = 'available'; return false; }
    snapshot.media = await copySocialMedia(state, snapshot.media);
    snapshot.sourceContentHash = incomingHash;
    snapshot.rawSource = clone(remote);
    snapshot.changeType = sameSource ? 'media-recovery' : previous ? 'source-content-change' : 'first-capture';
    const changed = await preserve(state, post, snapshot, 'platform-api');
    post.sourceAvailability = 'available'; state.posts[id] = post;
    return changed;
  }
  async function performSync() {
    if (syncing) return { skipped: true, reason: 'a source check is already running', reports: [], at: timestamp() };
    syncing = true;
    const leaseId = crypto.randomUUID(); let acquired = false, released = false;
    const assertLease = state => { if (state.syncLease?.id !== leaseId || state.syncLease.expiresAt <= clock()) fail(409, 'source check lease is no longer current'); };
    async function checkpoint(remotes, source) {
      let offset = 0, changed = 0;
      while (offset < remotes.length && !workExpired()) {
        const start = offset;
        const batch = await mutate(async state => {
          assertLease(state);
          const batchStarted = clock(); let processed = 0, changed = 0, error = null;
          while (start + processed < remotes.length && processed < 10 && !workExpired() && (processed === 0 || clock() - batchStarted < 10000)) {
            // A failed current post cannot contaminate the checkpoint containing
            // earlier completed posts. Its immutable blobs can be reused later.
            const candidate = clone(state);
            try {
              if (await archiveBsky(candidate, remotes[start + processed], source)) changed++;
              Object.assign(state, candidate); processed++;
            } catch (caught) { error = caught; break; }
          }
          return { processed, changed, error };
        });
        offset += batch.processed; changed += batch.changed;
        if (batch.error) { batch.error.partialProcessed = offset; batch.error.partialChanged = changed; throw batch.error; }
        if (!batch.processed) break;
      }
      return { processed: offset, changed, complete: offset === remotes.length };
    }
    try {
      acquired = await mutate(state => {
        if (state.syncLease && state.syncLease.expiresAt > clock()) return false;
        state.syncLease = { id: leaseId, expiresAt: clock() + 5 * 60 * 1000 }; return true;
      });
      if (!acquired) return { skipped: true, reason: 'another source check holds the archive lease', reports: [], at: timestamp() };
      const sources = (await load(true)).sources.filter(s => s.enabled !== false); const reports = [];
      for (const source of sources.slice(0, 5)) {
        if (workExpired()) { reports.push({ handle: source.handle, checked: 0, changed: 0, completeHistory: false, deferred: true, errors: ['time budget reached; this account will be checked next time'] }); continue; }
        const report = { handle: source.handle, checked: 0, changed: 0, completeHistory: false, errors: [] };
        try {
          let cursor = source.backfillComplete ? undefined : source.backfillCursor || undefined;
          let nextCursor = source.backfillComplete ? null : source.backfillCursor || null;
          // Every check starts with current posts, then advances one historical page.
          for (const selectedCursor of [undefined, ...(cursor ? [cursor] : [])]) {
            if (workExpired()) { report.deferred = true; break; }
            const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed');
            url.searchParams.set('actor', source.did); url.searchParams.set('limit', '10'); url.searchParams.set('filter', 'posts_with_replies');
            if (selectedCursor) url.searchParams.set('cursor', selectedCursor);
            const feed = await jsonFetch(fetcher, url);
            const remotes = (feed.feed || []).map(item => item.post).filter(p => p?.author?.did === source.did);
            const batch = await checkpoint(remotes, source);
            const pageComplete = batch.complete; report.checked += batch.processed; report.changed += batch.changed;
            if (!pageComplete) report.deferred = true;
            if (pageComplete && !source.backfillComplete) nextCursor = feed.cursor || null;
            if (!pageComplete) { nextCursor = source.backfillCursor || null; break; }
          }
          const archived = Object.values((await load(true)).posts).filter(p => p.source?.platform === 'bluesky' && p.source.id.startsWith('at://' + source.did + '/'));
          const start = source.recheckOffset || 0; const selection = archived.slice(start, start + 10); let rechecked = 0;
          if (selection.length && !workExpired()) {
            const url = new URL('https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts');
            for (const post of selection) url.searchParams.append('uris', post.source.id);
            const remote = await jsonFetch(fetcher, url);
            const batch = await checkpoint(remote.posts || [], source);
            report.checked += batch.processed; report.changed += batch.changed; rechecked = batch.processed;
            if (!batch.complete) report.deferred = true;
            // An omitted record could be blocked, moderated, or unavailable. It is not proof of deletion.
            const returned = new Set((remote.posts || []).map(p => p.uri));
            await mutate(state => { assertLease(state); for (const post of selection) if (!returned.has(post.source.id)) state.posts[post.id].sourceAvailability = 'unavailable'; });
            if (!report.deferred) rechecked = selection.length;
          }
          await mutate(state => {
            assertLease(state);
            const current = state.sources.find(s => s.did === source.did); if (!current) return;
            current.backfillCursor = nextCursor; current.backfillComplete = report.deferred ? !!source.backfillComplete : !nextCursor;
            current.recheckOffset = start + rechecked >= archived.length ? 0 : start + rechecked;
            current.lastCheckedAt = timestamp(); current.lastError = null;
          });
          report.completeHistory = !report.deferred && !nextCursor;
        } catch (error) {
          report.checked += error.partialProcessed || 0; report.changed += error.partialChanged || 0;
          report.errors.push(error.status === 507 ? error.message : 'source check failed; archived copies were retained');
          await mutate(state => { assertLease(state); const current = state.sources.find(s => s.did === source.did); if (current) current.lastError = report.errors[0]; });
        }
        reports.push(report);
      }
      released = await mutate(state => { assertLease(state); state.lastSync = { at: timestamp(), reports }; delete state.syncLease; return true; });
      return { reports, at: timestamp() };
    } finally {
      if (acquired && !released && clock() < syncScope.getStore().deadline) {
        try { await mutate(state => { if (state.syncLease?.id === leaseId) delete state.syncLease; }); } catch { /* The five-minute expiry recovers a crashed or unreachable worker. */ }
      }
      syncing = false;
    }
  }
  async function sync() {
    const started = clock();
    const total = options.syncBudgetMS || 180000;
    return syncScope.run({ deadline: started + total, workUntil: started + Math.max(1, total - Math.min(30000, total / 6)) }, performSync);
  }
  async function readJSON(request) {
    let size = 0; const parts = [];
    for await (const chunk of request) { size += chunk.length; if (size > MAX_REQUEST) fail(413, 'post exceeds the 30 MiB request limit'); parts.push(chunk); }
    try { const value = JSON.parse(Buffer.concat(parts).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'a JSON object is required'); return value; } catch { fail(400, 'invalid JSON object'); }
  }
  function send(response, status, value) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' }); response.end(JSON.stringify(value));
  }
  async function handle(request, response) {
    let url;
    try { url = new URL(request.url, 'http://localhost'); } catch { return false; }
    if (!url.pathname.startsWith(PREFIX + '/')) return false;
    try {
      const route = url.pathname.slice(PREFIX.length); const method = request.method;
      const authorization = request.headers.authorization || '';
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      let owner = false;
      if (route === '/sync' && method === 'POST' && request.headers['x-sungolog-sync']) {
        const given = String(request.headers['x-sungolog-sync']); const expected = env.SUNGOLOG_SYNC_TOKEN || '';
        if (expected.length < 32 || Buffer.byteLength(given) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) fail(401, 'invalid sync authorization');
        send(response, 200, await sync()); return true;
      }
      if (token) {
        if (route === '/sync' && method === 'POST' && env.SUNGOLOG_SYNC_EMAIL) {
          try { await verifier.scheduler(token, env.SUNGOLOG_SYNC_EMAIL, env.SUNGOLOG_SYNC_AUDIENCE); owner = true; }
          catch { await verifyOwner(token); owner = true; }
        } else { await verifyOwner(token); owner = true; }
      }
      const requireOwner = () => { if (!owner) fail(401, 'sign in to manage sungolog'); };
      if (route === '/status' && method === 'GET') {
        if (!owner) { send(response, 200, { version: '3.1', configured: !!store, owner: false }); return true; }
        const state = await load(); send(response, 200, { version: '3.1', configured: !!store, owner: true, storage: store.kind, warning: store.kind === 'local' ? 'local development storage is not a deployed archive' : null, bytesUsed: state.bytesUsed, byteLimit: MAX_TOTAL, sources: state.sources, lastSync: state.lastSync, postCount: Object.keys(state.posts).length }); return true;
      }
      if (route === '/posts' && method === 'GET') {
        const state = await load(true); const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
        const offset = Math.max(0, Number(url.searchParams.get('cursor')) || 0);
        const posts = Object.values(state.posts).filter(post => owner || post.visibility === 'public').sort((a, b) => (b.revisions.at(-1).publishedAt || b.capturedAt).localeCompare(a.revisions.at(-1).publishedAt || a.capturedAt));
        send(response, 200, { posts: posts.slice(offset, offset + limit).map(p => publicPost(p, owner)), nextCursor: posts.length > offset + limit ? String(offset + limit) : null }); return true;
      }
      const match = route.match(/^\/posts\/([a-f0-9-]{16,64})$/);
      if (match && method === 'GET') {
        const post = (await load(true)).posts[match[1]];
        if (!post || (!owner && post.visibility !== 'public')) fail(404, 'post not found');
        send(response, 200, publicPost(post, owner, true)); return true;
      }
      const mediaMatch = route.match(/^\/media\/([a-f0-9]{64})$/);
      if (mediaMatch && method === 'GET') {
        const state = await load(true); const hash = mediaMatch[1]; const meta = state.media[hash];
        const allowed = owner || Object.values(state.posts).some(post => post.visibility === 'public' && post.revisions.some(revision => revision.media?.some(media => media.hash === hash)));
        if (!meta || !allowed) fail(404, 'media not found');
        const etag = '"' + hash + '"';
        const validators = String(request.headers['if-none-match'] || '').split(',').map(value => value.trim().replace(/^W\//, ''));
        if (validators.includes(etag) || validators.includes('*')) {
          response.writeHead(304, { etag, 'cache-control': 'private, no-cache', 'x-content-type-options': 'nosniff' }); response.end(); return true;
        }
        const object = await store.read('media/' + hash); if (!object) fail(404, 'media not found');
        response.writeHead(200, { 'content-type': meta.type, 'content-length': object.data.length, etag, 'cache-control': 'private, no-cache', 'x-content-type-options': 'nosniff', 'content-security-policy': "default-src 'none'; sandbox" }); response.end(object.data); return true;
      }
      requireOwner();
      if (route === '/sync' && method === 'POST') { send(response, 200, await sync()); return true; }
      if (route === '/export' && method === 'GET') {
        const state = await load(true); send(response, 200, { exportedAt: timestamp(), ...state }); return true;
      }
      if (route === '/sources' && method === 'POST') {
        const body = await readJSON(request);
        if (body.platform !== 'bluesky') fail(400, 'only Bluesky public API syncing is currently supported');
        const handle = text(body.handle, 253, 'Bluesky handle').replace(/^@/, '').toLowerCase();
        if (!/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/.test(handle)) fail(400, 'enter a Bluesky handle, not a profile URL');
        const profile = await jsonFetch(fetcher, 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=' + encodeURIComponent(handle), {}, 500000);
        if (!/^did:[a-z]+:[a-zA-Z0-9._:%-]+$/.test(profile.did || '')) fail(502, 'could not resolve source identity');
        const result = await mutate(state => {
          const existing = state.sources.find(s => s.did === profile.did); if (existing) return existing;
          if (state.sources.length >= 5) fail(400, 'source limit reached');
          const source = { platform: 'bluesky', did: profile.did, handle, enabled: true, visibility: 'private', connectedAt: timestamp(), backfillComplete: false }; state.sources.push(source); return source;
        });
        send(response, 201, result); return true;
      }
      if (route === '/posts' && method === 'POST') {
        const body = await readJSON(request);
        const result = await mutate(async state => {
          const title = text(body.title || '', 300, 'title'); const content = text(body.text || '', 100000, 'text');
          const media = await attachments(state, body.media);
          if (!title.trim() && !content.trim() && !media.length) fail(400, 'add text or an image');
          const id = crypto.randomUUID(); const post = { id, kind: 'original', visibility: visibility(body.visibility || 'private'), revisions: [] };
          const tags = Array.isArray(body.tags) ? body.tags.slice(0, 10).map(t => text(t, 50, 'tag')) : [];
          await preserve(state, post, { title, text: content, tags, media, publishedAt: timestamp() }, 'sungolog-original'); state.posts[id] = post; return publicPost(post, true, true);
        }); send(response, 201, result); return true;
      }
      if (match && method === 'PATCH') {
        const body = await readJSON(request);
        if (Object.keys(body).some(key => !['title', 'text', 'tags', 'media', 'visibility'].includes(key))) fail(400, 'unsupported post field');
        const result = await mutate(async state => {
          const post = state.posts[match[1]]; if (!post) fail(404, 'post not found');
          const contentChange = Object.keys(body).some(key => key !== 'visibility');
          if (post.kind === 'archive' && contentChange) fail(409, 'historical content can only change when its source changes');
          if (body.visibility !== undefined) post.visibility = visibility(body.visibility);
          if (contentChange) {
            const previous = clone(post.revisions.at(-1));
            for (const key of ['capturedAt', 'contentHash', 'number', 'provenance']) delete previous[key];
            if (body.title !== undefined) previous.title = text(body.title, 300, 'title');
            if (body.text !== undefined) previous.text = text(body.text, 100000, 'text');
            if (body.media !== undefined) previous.media = await attachments(state, body.media);
            if (body.tags !== undefined) { if (!Array.isArray(body.tags) || body.tags.length > 10) fail(400, 'invalid tags'); previous.tags = body.tags.map(t => text(t, 50, 'tag')); }
            if (!previous.title.trim() && !previous.text.trim() && !previous.media.length) fail(400, 'add text or an image');
            await preserve(state, post, previous, 'sungolog-original');
          }
          return publicPost(post, true, true);
        }); send(response, 200, result); return true;
      }
      if (route === '/import' && method === 'POST') {
        const body = await readJSON(request);
        const result = await mutate(async state => {
          const sourceURL = safeURL(body.sourceURL); if (!sourceURL) fail(400, 'a secure source URL is required');
          const platform = text(body.platform || 'other', 50, 'platform'); const sourceId = text(body.sourceId || sourceURL, 2000, 'source ID');
          if (body.publishedAt && !Number.isFinite(Date.parse(body.publishedAt))) fail(400, 'invalid original posting date');
          const publishedAt = body.publishedAt ? new Date(body.publishedAt).toISOString() : null;
          const id = digest(platform + ':' + sourceId).slice(0, 32);
          const existingAPIArchive = Object.values(state.posts).find(post => post.kind === 'archive' && post.source?.platform === platform && post.source.id === sourceId && post.revisions.some(revision => revision.provenance === 'platform-api'));
          if (existingAPIArchive) fail(409, 'this source is managed by its platform API; owner imports cannot revise it');
          const post = state.posts[id] || { id, kind: 'archive', visibility: 'private', source: { platform, id: sourceId, url: sourceURL }, revisions: [] };
          const snapshot = { title: text(body.title || '', 300, 'title'), text: text(body.text || '', 100000, 'text'), media: await attachments(state, body.media), publishedAt, sourceURL, sourceId };
          if (!snapshot.title && !snapshot.text && !snapshot.media.length) fail(400, 'add the original post content');
          await preserve(state, post, snapshot, 'owner-import'); state.posts[id] = post; return publicPost(post, true, true);
        }); send(response, 201, result); return true;
      }
      fail(404, 'endpoint not found');
    } catch (error) {
      send(response, error.status || 500, { error: error.status ? error.message : 'sungolog could not complete this request' }); return true;
    }
  }
  return { handle, sync, load, mutate, archiveBsky, store };
}

module.exports = { createSungolog, LocalStore, GCSStore, createVerifier, bskySnapshot, contentHash, digest, MAX_MEDIA };

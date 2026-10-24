// The admin's save flow over HTTP against the in-memory emulator: the same requests it sends to S3.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { JSDOM } from 'jsdom';
import { createEmulator, memoryBackend } from '../src/emulator/index.ts';
import { createCache, createStorage, ConflictError } from '../src/admin/storage.ts';
import { loadSite, readEntry, saveEntry } from '../src/admin/site.ts';

const { DOMParser } = new JSDOM('').window;
const json = (value) => JSON.stringify(value, null, 2) + '\n';

const bucket = () => memoryBackend({
  '_gratis/schema.json': json({
    collections: { site: { single: true, storage: { path: 'site.json', source: 'src/data/site.json' }, fields: { title: { type: 'text', label: 'Title' } } } },
  }),
  '_gratis/routes.json': json({
    pages: { '/': { template: '/', file: 'index.html', deps: { entries: ['site'], collections: {} }, updated: '' } },
    _pending: [],
  }),
  '_gratis/templates/index.html': '<!DOCTYPE html><html><head><title>{{gratis:entry:site:title}}</title></head><body><h1>{{gratis:entry:site:title}}</h1></body></html>',
  '_gratis/content/site.json': json({ title: 'Before' }),
  'index.html': '<!DOCTYPE html><html><head><title>Before</title></head><body><h1>Before</h1></body></html>',
  'about/index.html': 'about',
});

let backend, server, endpoint;
before(async () => {
  server = createServer((req, res) => createEmulator(backend, { website: true })(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  endpoint = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const open = () => loadSite(createCache(createStorage({ endpoint, region: 'local', accessKeyId: 'local', secretAccessKey: 'local' })));
const text = (key) => new TextDecoder().decode(backend.objects.get(key));

test('a save writes the entry, re-renders its pages and clears the pending list', async () => {
  backend = bucket();
  const site = await open();
  const pages = await saveEntry(site, 'site', { title: 'A & B' }, { DOMParser });
  assert.deepEqual(pages, ['/']);
  assert.deepEqual(JSON.parse(text('_gratis/content/site.json')), { title: 'A & B' });
  assert.match(text('index.html'), /<h1>A &amp; B<\/h1>/);
  assert.deepEqual(JSON.parse(text('_gratis/routes.json'))._pending, []);
});

test('a save from a stale version conflicts and leaves the entry alone', async () => {
  backend = bucket();
  const mine = await open();
  const theirs = await open();
  const { etag } = await readEntry(mine, 'site');
  await saveEntry(theirs, 'site', { title: 'Theirs' }, { DOMParser });
  // Mine is stale twice over: routes.json and the entry both changed.
  await assert.rejects(saveEntry(mine, 'site', { title: 'Mine' }, { DOMParser, etag }), ConflictError);
  assert.deepEqual(JSON.parse(text('_gratis/content/site.json')), { title: 'Theirs' });
  const fresh = await readEntry(mine, 'site', { fresh: true });
  assert.deepEqual(fresh.fields, { title: 'Theirs' });
});

test('PUT honours If-None-Match: *, as deploy uses it', async () => {
  backend = bucket();
  const put = (key) => fetch(`${endpoint}/${key}`, { method: 'PUT', body: '{}', headers: { 'If-None-Match': '*' } });
  assert.equal((await put('_gratis/content/site.json')).status, 412);
  assert.equal((await put('_gratis/content/new.json')).status, 200);
});

test('reads act like the website endpoint', async () => {
  backend = bucket();
  const root = await fetch(`${endpoint}/`);
  assert.equal(root.status, 200);
  assert.match(root.headers.get('content-type'), /text\/html/);
  assert.match(root.headers.get('etag'), /^"[0-9a-f]{32}"$/);
  const dir = await fetch(`${endpoint}/about`, { redirect: 'manual' });
  assert.equal(dir.status, 301);
  assert.equal(dir.headers.get('location'), '/about/');
  assert.equal((await fetch(`${endpoint}/missing`)).status, 404);
});

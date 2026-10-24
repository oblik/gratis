#!/usr/bin/env node
// gratis deploy --bucket <name>   pull content, build, upload dist/
// gratis pull --bucket <name>     copy the bucket's content files into the repo
// gratis preview [--port 4321]    serve dist/ with the storage emulator, as if it were the bucket
//
// Credentials and region come from the standard AWS environment (AWS_PROFILE or keys, AWS_REGION).

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { createServer } from 'node:http';
import { parseArgs } from 'node:util';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { createEmulator, folderBackend, contentType, type Backend } from '../emulator/index.ts';
import { encryptCredentials } from '../admin/auth.ts';
import type { Schema } from '../admin/site.ts';

const { positionals: [command], values: args } = parseArgs({
  allowPositionals: true,
  options: { bucket: { type: 'string' }, root: { type: 'string', default: process.cwd() }, port: { type: 'string', default: '4321' } },
});
if (!(['deploy', 'pull'].includes(command!) && args.bucket) && command !== 'preview') {
  console.error('usage: gratis <deploy|pull> --bucket <name> [--root <dir>]\n       gratis preview [--root <dir>] [--port <port>]');
  process.exit(1);
}

const s3 = new S3Client({});
const bucket = args.bucket!;
const root = args.root!;

// Never overwritten by a deploy: editors own these once the site is live.
const EDITOR_OWNED = ['_gratis/content/', '_gratis/auth/', 'uploads/'];
// Content-hashed, so cacheable forever.
const IMMUTABLE = ['_astro/', 'admin/assets/'];

async function get(key: string) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await res.Body!.transformToString();
  } catch (error) {
    if ((error as Error).name === 'NoSuchKey') return null;
    throw error;
  }
}

async function pull() {
  const schema = await get('_gratis/schema.json');
  if (!schema) return console.log('nothing to pull: the bucket has no schema.json yet');
  for (const [name, { storage }] of Object.entries((JSON.parse(schema) as Schema).collections)) {
    const text = await get(`_gratis/content/${storage.path}`);
    if (text == null) continue;
    await mkdir(dirname(join(root, storage.source)), { recursive: true });
    await writeFile(join(root, storage.source), text);
    console.log(`pulled ${name} -> ${storage.source}`);
  }
}

async function* files(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

async function upload(dist: string) {
  let uploaded = 0;
  for await (const path of files(dist)) {
    const key = relative(dist, path).split('\\').join('/');
    const editorOwned = EDITOR_OWNED.some((prefix) => key.startsWith(prefix));
    if (key.startsWith('_gratis/auth/') || key.startsWith('uploads/')) continue;
    try {
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: await readFile(path),
        ContentType: contentType(key),
        CacheControl: IMMUTABLE.some((prefix) => key.startsWith(prefix)) ? 'public, max-age=31536000, immutable' : 'no-cache',
        // Content files are seeded on the first deploy and never replaced after.
        IfNoneMatch: editorOwned ? '*' : undefined,
      }));
      uploaded++;
    } catch (error) {
      if (editorOwned && (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) continue;
      throw error;
    }
  }
  console.log(`uploaded ${uploaded} file(s) to ${bucket}`);
}

// The built site as the bucket, on localhost (a secure context, so the admin's WebCrypto works).
// Saves write into dist/, so a rebuild starts over from the repo's content.
async function preview(dist: string) {
  const port = Number(args.port);
  const origin = `http://localhost:${port}`;
  const password = process.env.GRATIS_PREVIEW_PASSWORD ?? 'gratis-preview';
  // A login like the real one, for keys the emulator doesn't check.
  const blob = JSON.stringify(await encryptCredentials({ accessKeyId: 'local', secretAccessKey: 'local' }, password, { endpoint: origin, region: 'local' }));
  const files = folderBackend(dist);
  const backend: Backend = { ...files, read: async (key) => (key === '_gratis/auth/admin.json' ? new TextEncoder().encode(blob) : files.read(key)) };
  const handle = createEmulator(backend, { website: true });
  createServer((req, res) => handle(req, res)).listen(port, 'localhost', () => {
    console.log(`serving ${relative(process.cwd(), dist) || '.'} at ${origin}/`);
    console.log(`admin: ${origin}/admin/, log in as admin / ${password}`);
  });
}

if (command === 'preview') {
  await preview(join(root, 'dist'));
} else if (command === 'pull') {
  await pull();
} else {
  await pull();
  const { build } = await import('astro');
  await build({ root });
  await upload(join(root, 'dist'));
}

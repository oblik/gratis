#!/usr/bin/env node
// gratis deploy --bucket <name>   pull content, build, upload dist/
// gratis pull --bucket <name>     copy the bucket's content files into the repo
//
// Credentials and region come from the standard AWS environment (AWS_PROFILE or keys, AWS_REGION).

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, relative, extname, dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const { positionals: [command], values: args } = parseArgs({
  allowPositionals: true,
  options: { bucket: { type: 'string' }, root: { type: 'string', default: process.cwd() } },
});
if (!['deploy', 'pull'].includes(command) || !args.bucket) {
  console.error('usage: gratis <deploy|pull> --bucket <name> [--root <dir>]');
  process.exit(1);
}

const s3 = new S3Client({});
const { bucket, root } = args;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
};

// Never overwritten by a deploy: editors own these once the site is live.
const EDITOR_OWNED = ['_gratis/content/', '_gratis/auth/', 'uploads/'];
// Content-hashed, so cacheable forever.
const IMMUTABLE = ['_astro/', 'admin/assets/'];

async function get(key) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return await res.Body.transformToString();
  } catch (error) {
    if (error.name === 'NoSuchKey') return null;
    throw error;
  }
}

async function pull() {
  const schema = await get('_gratis/schema.json');
  if (!schema) return console.log('nothing to pull: the bucket has no schema.json yet');
  for (const [name, { storage }] of Object.entries(JSON.parse(schema).collections)) {
    const text = await get(`_gratis/content/${storage.path}`);
    if (text == null) continue;
    await mkdir(dirname(join(root, storage.source)), { recursive: true });
    await writeFile(join(root, storage.source), text);
    console.log(`pulled ${name} -> ${storage.source}`);
  }
}

async function* files(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

async function upload(dist) {
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
        ContentType: TYPES[extname(key)] ?? 'application/octet-stream',
        CacheControl: IMMUTABLE.some((prefix) => key.startsWith(prefix)) ? 'public, max-age=31536000, immutable' : 'no-cache',
        // Content files are seeded on the first deploy and never replaced after.
        IfNoneMatch: editorOwned ? '*' : undefined,
      }));
      uploaded++;
    } catch (error) {
      if (editorOwned && error.$metadata?.httpStatusCode === 412) continue;
      throw error;
    }
  }
  console.log(`uploaded ${uploaded} file(s) to ${bucket}`);
}

if (command === 'pull') {
  await pull();
} else {
  await pull();
  const { build } = await import('astro');
  await build({ root });
  await upload(join(root, 'dist'));
}

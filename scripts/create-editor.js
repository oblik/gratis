// Writes /_gratis/auth/<username>.json: the editor key from .env encrypted with a password.
// The password is GRATIS_EDITOR_PASSWORD, generated into .env on first run. Nothing secret is printed.
//
//   node --env-file=.env scripts/create-editor.js admin

import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { encryptCredentials } from '../packages/gratis/src/admin/auth.js';
import { bucket, region, s3Endpoint } from './config.js';

const username = process.argv[2];
if (!/^[a-z0-9_-]+$/.test(username ?? '')) throw new Error('usage: create-editor.js <username> (lowercase letters, digits, - and _)');

let password = process.env.GRATIS_EDITOR_PASSWORD;
if (!password) {
  password = randomBytes(18).toString('base64url');
  appendFileSync('.env', `GRATIS_EDITOR_PASSWORD=${password}\n`);
  console.log('generated a password, saved to .env as GRATIS_EDITOR_PASSWORD');
}

const blob = await encryptCredentials(
  { accessKeyId: process.env.GRATIS_EDITOR_ACCESS_KEY_ID, secretAccessKey: process.env.GRATIS_EDITOR_SECRET_ACCESS_KEY },
  password,
  { endpoint: s3Endpoint, region },
);

await new S3Client({ region }).send(new PutObjectCommand({
  Bucket: bucket,
  Key: `_gratis/auth/${username}.json`,
  Body: JSON.stringify(blob, null, 2) + '\n',
  ContentType: 'application/json',
  CacheControl: 'no-cache',
}));
console.log(`wrote _gratis/auth/${username}.json`);

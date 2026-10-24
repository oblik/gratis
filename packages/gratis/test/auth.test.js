import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptCredentials, decryptCredentials } from '../src/admin/auth.ts';

const keys = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret/example+key' };
const storage = { endpoint: 'https://s3.eu-central-1.amazonaws.com/example.com', region: 'eu-central-1' };

test('round-trips with the right password', async () => {
  const blob = await encryptCredentials(keys, 'correct horse battery', storage);
  assert.deepEqual(blob.storage, storage);
  assert.ok(!JSON.stringify(blob).includes(keys.secretAccessKey));
  assert.deepEqual(await decryptCredentials(blob, 'correct horse battery'), keys);
});

test('fails with the wrong password', async () => {
  const blob = await encryptCredentials(keys, 'correct horse battery', storage);
  await assert.rejects(decryptCredentials(blob, 'wrong horse battery'));
});

test('refuses short passwords', async () => {
  await assert.rejects(encryptCredentials(keys, 'short', storage), /at least 12/);
});

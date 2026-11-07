import { expect, test } from 'vitest'

import { decryptCredentials, encryptCredentials } from './auth.ts'

const keys = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'secret/example+key',
}
const storage = {
  endpoint: 'https://s3.eu-central-1.amazonaws.com/example.com',
  region: 'eu-central-1',
}

test('round-trips with the right password', async () => {
  const blob = await encryptCredentials(keys, 'correct horse battery', storage)
  expect(blob.storage).toStrictEqual(storage)
  expect(!JSON.stringify(blob).includes(keys.secretAccessKey)).toBeTruthy()
  expect(await decryptCredentials(blob, 'correct horse battery')).toStrictEqual(
    keys,
  )
})

test('fails with the wrong password', async () => {
  const blob = await encryptCredentials(keys, 'correct horse battery', storage)
  await expect(
    decryptCredentials(blob, 'wrong horse battery'),
  ).rejects.toThrow()
})

test('refuses short passwords', async () => {
  await expect(encryptCredentials(keys, 'short', storage)).rejects.toThrow(
    /at least 12/,
  )
})

// Password-encrypted editor credentials (docs/auth.md). WebCrypto only, so it runs unchanged in
// the browser and in Node.
//
// In the blob, the storage location is plaintext: it isn't secret, and the SPA needs it to know where to sign.

const ITERATIONS = 600_000
export const MIN_PASSWORD_LENGTH = 12

const b64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function deriveKey(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export interface Keys {
  accessKeyId: string
  secretAccessKey: string
}
export interface StorageLocation {
  endpoint: string
  region: string
}
export interface AuthBlob {
  v: 1
  storage: StorageLocation
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string }
  iv: string
  ciphertext: string
}

export async function encryptCredentials(
  { accessKeyId, secretAccessKey }: Keys,
  password: string,
  storage: StorageLocation,
): Promise<AuthBlob> {
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new Error(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    )
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt, ITERATIONS)
  const plaintext = new TextEncoder().encode(
    JSON.stringify({ accessKeyId, secretAccessKey }),
  )
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  )
  return {
    v: 1,
    storage,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: ITERATIONS,
      salt: b64(salt),
    },
    iv: b64(iv),
    ciphertext: b64(ciphertext),
  }
}

/** Throws on a wrong password: AES-GCM authentication fails. */
export async function decryptCredentials(
  blob: AuthBlob,
  password: string,
): Promise<Keys> {
  const key = await deriveKey(
    password,
    unb64(blob.kdf.salt),
    blob.kdf.iterations,
  )
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(blob.iv) },
    key,
    unb64(blob.ciphertext),
  )
  return JSON.parse(new TextDecoder().decode(plaintext))
}

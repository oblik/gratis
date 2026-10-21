// Password-encrypted editor credentials (docs/auth.md). WebCrypto only, so it runs unchanged in
// the browser and in Node.
//
// Blob: { v, storage: { endpoint, region }, kdf: { name, hash, iterations, salt }, iv, ciphertext }
// The storage location is plaintext: it isn't secret, and the SPA needs it to know where to sign.

const ITERATIONS = 600_000;
export const MIN_PASSWORD_LENGTH = 12;

const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptCredentials({ accessKeyId, secretAccessKey }, password, storage) {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ITERATIONS);
  const plaintext = new TextEncoder().encode(JSON.stringify({ accessKeyId, secretAccessKey }));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return {
    v: 1,
    storage,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: b64(salt) },
    iv: b64(iv),
    ciphertext: b64(ciphertext),
  };
}

/** Throws on a wrong password: AES-GCM authentication fails. */
export async function decryptCredentials(blob, password) {
  const key = await deriveKey(password, unb64(blob.kdf.salt), blob.kdf.iterations);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ciphertext));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

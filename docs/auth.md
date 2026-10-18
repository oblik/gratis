# Authentication

This is the part that forces the design, so it's worth being precise about.

A bucket can verify exactly one kind of credential: a SigV4 signature made with an IAM access key. There is no session, no cookie, no password it understands. So every serverless auth scheme reduces to one question: how does the editor's browser come to hold an IAM key? Gratis answers it with the pattern password managers use: a password that unlocks an encrypted credential.

## Setup

- The developer creates one IAM user per editor, with an inline policy allowing `GetObject`, `PutObject`, `DeleteObject` and `ListBucket` on this one bucket and nothing else, and generates an access key pair.
- For each editor, `/_gratis/auth/<username>.json` stores that key pair encrypted with AES-GCM under a key derived from the editor's password with PBKDF2 (WebCrypto, high iteration count; Argon2id via a small wasm module is a later option).

## Login

1. SPA fetches the editor's blob.
2. Derives the key from the password, decrypts the key pair, keeps it in `sessionStorage`.
3. Signs every storage request directly with `aws4fetch` or equivalent. No credential is ever sent anywhere except in the form of a signature to S3.

## User management

The super user (first editor, created by the developer) can add editors from the SPA: the developer supplies a key pair, the super user sets a password, the SPA writes the blob. Removing an editor is deleting the blob and deactivating their key in IAM. One key per editor means revocation is a single click with no re-encryption.

## Threat model, stated plainly

What this protects against: an attacker without an editor's password cannot write to the bucket. The bucket is never publicly writable. No bearer token travels in a URL or header.

What it doesn't:

- The auth blobs are publicly readable (they're on a public site; a WAF rule on the path is trivially bypassed), so a weak password can be brute-forced offline. The defense is a high KDF cost and an enforced password minimum (12+ characters). This is the main accepted compromise.
- No MFA, no lockout, no audit trail beyond S3 access logs / CloudTrail.
- An editor can, by design, upload anything to the site, including scripts. Editors are trusted.

This is the right level for a bakery's website. It is the wrong level for anything handling money or personal data, and the docs say so.

## Variant: device-bound, nothing stored

For an even smaller surface, the developer can onboard an editor with a one-time link `/admin/#setup=<encrypted-keys>`. The fragment never reaches a server or a log; the SPA stores the keys in that device's IndexedDB. No blob exists anywhere. The trade-off is that a new device needs the developer again.

## Why not something stronger

Cognito, Cloudflare Access, a tiny Worker or a Lambda would each fix the weaknesses above, and any of them could be offered as an optional adapter later (see [Roadmap](roadmap.md#optional-hardening-adapters)). They are not in the core because each is another service to configure and another thing that can change under the site. The core promise is "a bucket, a CDN and a browser"; auth has to fit inside that.

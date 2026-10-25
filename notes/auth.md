# Authentication

A bucket can verify exactly one kind of credential: a SigV4 signature made with an IAM access key. No session, no cookie, no password it understands. So every serverless auth scheme reduces to one question: how does the editor's browser come to hold an IAM key? Gratis answers it the way password managers do: a password that unlocks an encrypted credential.

## How it works

The developer creates one IAM user per editor, allowed to get, put, delete, and list on this one bucket and nothing else, and generates a key pair. For each editor, `/_gratis/auth/<username>.json` holds:

- The key pair, encrypted with AES-GCM under a key derived from the editor's password with PBKDF2.
- In plaintext, the KDF parameters.
- In plaintext, where the key is for: the path-style S3 REST endpoint (a bucket named after a hostname has dots, which breaks virtual-hosted TLS) and the region.

Logging in:

1. Fetch the blob.
2. Derive the key from the password and decrypt the pair into `sessionStorage`.
3. Sign every storage request with it.

No credential is ever sent anywhere except as a signature to S3. One key per editor means revoking one is deleting the blob and deactivating the key, with no re-encryption.

## Threat model, stated plainly

An attacker without an editor's password cannot write to the bucket, the bucket is never publicly writable, and no bearer token travels in a URL or header.

What it doesn't cover:

- The blobs are publicly readable, so a weak password can be brute-forced offline. The defense is a high KDF cost and an enforced password minimum.
- No MFA, no lockout, no audit trail beyond S3 access logs.
- Editors can upload anything, scripts included. They're trusted.
- Nothing can be generated per request, so there are no short-lived tokens: whatever logs an editor in is static and can only be rotated after the fact.

This is the right level for a small business owner's website and the wrong level for anything handling e.g. money or personal data.

Cognito, Cloudflare Access, a tiny Worker or a Lambda would each fix the weaknesses above and could be offered as optional adapters later, kept out of the serving path so the site stays up if they disappear. They're not in the core because each is another service to configure and another thing that can change under the site. The core promise is a bucket, a CDN, and a browser; auth has to fit inside that.

One variant for an even smaller surface: onboard an editor with a one-time link `/admin/#setup=<encrypted-keys>`. The fragment never reaches a server or a log, the admin stores the keys in that device's IndexedDB, and no blob exists anywhere. A new device needs the developer again, though.

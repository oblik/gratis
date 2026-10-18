# Setup

`gratis init` does, or prints exact instructions for:

1. Create the bucket with static website hosting, versioning, a CORS rule allowing `GET`/`PUT`/`DELETE` from the site origin with `ETag` exposed, and a public-read bucket policy (optionally restricted to Cloudflare IPs).
2. Create the IAM user(s) and keys (see [Authentication](auth.md#setup)).
3. Upload the built site, templates, schema, an initial `content.json`, the admin SPA and the super user's auth blob.
4. Point a Cloudflare DNS record at the website endpoint with the proxy on, SSL mode Flexible (see [Caching and the CDN](caching.md)).

The developer experience of this step matters as much as the editor. If setup is an hour of console clicking, nobody reaches the "no maintenance forever" part.

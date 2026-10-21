# Caching and the CDN

Cloudflare proxies the S3 website endpoint. The site needs no cache purging, ever:

- Cloudflare doesn't cache HTML by default, and every HTML page and JSON file is uploaded with `Cache-Control: no-cache`, so edits are visible on the next request.
- Astro content-hashes its CSS and JS filenames; uploads have unique names. Those can be cached forever.

Writes never pass through the CDN: the SPA talks to the S3 REST endpoint directly over HTTPS. The S3 website endpoint is HTTP-only, so Cloudflare runs in Flexible SSL mode toward the origin; that is acceptable for public site content and irrelevant to the admin path. The admin itself must be opened over HTTPS, through the CDN: browsers expose WebCrypto, which unlocking the credentials and signing requests both need, only in secure contexts, so `/admin/` on the bare website endpoint can't log in. Optionally the bucket policy limits anonymous `GetObject` to Cloudflare's IP ranges so the bucket can't be read around the CDN.

Other CDNs (CloudFront caches HTML and needs invalidations) are discussed in the [Roadmap](roadmap.md#other-cdns).

// Shared settings for the setup scripts. Run every script with `node --env-file=.env`.
// The site is GRATIS_SITE, defaulting to the demo; the bucket is named after it.

export const bucket = process.env.GRATIS_SITE ?? 'demo.gratis.build'
export const region = process.env.AWS_REGION
export const cloudflareToken = process.env.CLOUDFLARE_API_TOKEN

// eu-central-1 and newer regions use the dot form of the website endpoint.
export const websiteHost = `${bucket}.s3-website.${region}.amazonaws.com`
export const websiteOrigin = `http://${websiteHost}`
export const siteOrigin = `https://${bucket}`
// Path style, because a dotted bucket name breaks the wildcard certificate of virtual-hosted style.
export const s3Endpoint = `https://s3.${region}.amazonaws.com/${bucket}`

export const editorUser = `gratis-editor-${bucket.replaceAll('.', '-')}`

if (!region)
  throw new Error('AWS_REGION is not set; run with node --env-file=.env')

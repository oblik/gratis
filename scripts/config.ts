// Shared settings for the setup scripts, which run with `--env-file=.env`. The
// site is GRATIS_SITE, defaulting to the demo; the bucket is named after it.

export function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set; run with --env-file=.env`)
  return value
}

export const bucket = process.env.GRATIS_SITE ?? 'demo.gratis.build'
export const region = env('AWS_REGION')

/** `eu-central-1` and newer regions use the website endpoint's dot form. */
export const websiteHost = `${bucket}.s3-website.${region}.amazonaws.com`
export const websiteOrigin = `http://${websiteHost}`
export const siteOrigin = `https://${bucket}`
/**
 * Path style, because a dotted bucket name breaks the wildcard certificate of
 * virtual-hosted style.
 */
export const s3Endpoint = `https://s3.${region}.amazonaws.com/${bucket}`

export const editorUser = `gratis-editor-${bucket.replaceAll('.', '-')}`

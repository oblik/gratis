// Puts the bucket behind Cloudflare: a proxied CNAME to the S3 website endpoint, and a
// Configuration Rule setting SSL to Flexible for this hostname only (the website endpoint is
// HTTP-only). The zone-wide SSL mode is not touched. Safe to rerun.
//
//   node --env-file=.env scripts/setup-cloudflare.js [--dry-run]

import { bucket, cloudflareToken, websiteHost, zone } from './config.js'

const dryRun = process.argv.includes('--dry-run')
const RULE_REF = 'gratis_flexible_ssl'

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cloudflareToken}`,
      'Content-Type': 'application/json',
    },
    body: body && JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.success && !(method === 'GET' && res.status === 404)) {
    throw new Error(
      `${method} ${path}: ${res.status} ${JSON.stringify(data.errors)}`,
    )
  }
  return { status: res.status, ...data }
}

const {
  result: [{ id: zoneId } = {}],
} = await cf('GET', `/zones?name=${zone}`)
if (!zoneId)
  throw new Error(`zone ${zone} not found; the token needs Zone read on it`)

// DNS
const record = {
  type: 'CNAME',
  name: bucket,
  content: websiteHost,
  proxied: true,
  ttl: 1,
  comment: 'gratis',
}
const { result: existing } = await cf(
  'GET',
  `/zones/${zoneId}/dns_records?name=${bucket}`,
)
const conflicting = existing.filter((r) => r.type !== 'CNAME')
if (conflicting.length)
  throw new Error(
    `${bucket} already has ${conflicting.map((r) => r.type).join(', ')} records; remove them first`,
  )
const cname = existing.find((r) => r.type === 'CNAME')
if (cname?.content === record.content && cname.proxied) {
  console.log(`CNAME ${bucket} already points at ${websiteHost}`)
} else if (dryRun) {
  console.log(
    `would ${cname ? 'update' : 'create'} CNAME ${bucket} -> ${websiteHost} (proxied)`,
  )
} else {
  await cf(
    cname ? 'PUT' : 'POST',
    `/zones/${zoneId}/dns_records${cname ? `/${cname.id}` : ''}`,
    record,
  )
  console.log(
    `${cname ? 'updated' : 'created'} CNAME ${bucket} -> ${websiteHost} (proxied)`,
  )
}

// Configuration Rule, in the zone's http_config_settings entry point, other rules left as they are.
const rule = {
  ref: RULE_REF,
  description: `gratis: Flexible SSL for ${bucket} (S3 website endpoints are HTTP-only)`,
  expression: `(http.host eq "${bucket}")`,
  action: 'set_config',
  action_parameters: { ssl: 'flexible' },
  enabled: true,
}
const entry = await cf(
  'GET',
  `/zones/${zoneId}/rulesets/phases/http_config_settings/entrypoint`,
)
if (entry.status === 404) {
  if (dryRun)
    console.log('would create the http_config_settings ruleset with the rule')
  else {
    await cf(
      'PUT',
      `/zones/${zoneId}/rulesets/phases/http_config_settings/entrypoint`,
      { rules: [rule] },
    )
    console.log('created Configuration Rule')
  }
} else {
  const current = entry.result.rules?.find((r) => r.ref === RULE_REF)
  if (
    current &&
    current.expression === rule.expression &&
    current.action_parameters?.ssl === 'flexible'
  ) {
    console.log('Configuration Rule already in place')
  } else if (dryRun) {
    console.log(
      `would ${current ? 'update' : 'add'} the Configuration Rule (${entry.result.rules?.length ?? 0} other rule(s) untouched)`,
    )
  } else if (current) {
    await cf(
      'PATCH',
      `/zones/${zoneId}/rulesets/${entry.result.id}/rules/${current.id}`,
      rule,
    )
    console.log('updated Configuration Rule')
  } else {
    await cf('POST', `/zones/${zoneId}/rulesets/${entry.result.id}/rules`, rule)
    console.log('added Configuration Rule')
  }
}

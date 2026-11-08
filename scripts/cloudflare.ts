import { bucket, env } from './config.ts'

export const RULE_REF = 'gratis_flexible_ssl'
export const ruleExpression = `(http.host eq "${bucket}")`

export interface DnsRecord {
  id: string
  type: string
  content: string
  proxied: boolean
}
export interface Rule {
  id: string
  ref: string
  expression: string
  action_parameters?: { ssl?: string }
}
export interface Ruleset {
  id: string
  rules?: Rule[]
}

/**
 * A 404 on GET or DELETE is returned rather than thrown: it means there's
 * nothing to read or delete.
 */
export async function cf<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; result: T }> {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env('CLOUDFLARE_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json()) as {
    success: boolean
    errors: unknown
    result: T
  }
  const absent = res.status === 404 && (method === 'GET' || method === 'DELETE')
  if (!data.success && !absent)
    throw new Error(
      `${method} ${path}: ${res.status} ${JSON.stringify(data.errors)}`,
    )
  return { status: res.status, result: data.result }
}

/**
 * The zone is whichever parent domain of the bucket the token can see, so
 * `demo.gratis.build` finds `gratis.build` without a public suffix list.
 */
export async function findZone(): Promise<{ id: string; name: string }> {
  const labels = bucket.split('.')
  for (let i = 0; i < labels.length - 1; i++) {
    const name = labels.slice(i).join('.')
    const { result } = await cf<{ id: string }[]>('GET', `/zones?name=${name}`)
    if (result[0]) return { id: result[0].id, name }
  }
  throw new Error(
    `no Cloudflare zone found for ${bucket}; the token needs Zone read on it`,
  )
}

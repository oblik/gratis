// A collection query: all the filtering a page may do (notes/rendering.md). The getters run it at
// build time, the renderer runs it again when the admin re-renders the page.

export interface Query {
  sort?: string
  limit?: number
  where?: Record<string, unknown>
}
export interface QueryEntry {
  id: string
  fields: Record<string, unknown>
}

const compare = (a: unknown, b: unknown) =>
  a == null ? (b == null ? 0 : 1) : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0

/** Equality filter, sort (ties by id), limit. */
export function runQuery<T extends QueryEntry>(
  entries: T[],
  { sort, limit, where }: Query = {},
): T[] {
  const matches = entries.filter(({ fields }) =>
    Object.entries(where ?? {}).every(([key, value]) => fields[key] === value),
  )
  const field = sort?.replace(/^-/, '')
  const direction = sort?.startsWith('-') ? -1 : 1
  const sorted = matches.toSorted(
    (a, b) =>
      (field && direction * compare(a.fields[field], b.fields[field])) ||
      compare(a.id, b.id),
  )
  return limit == null ? sorted : sorted.slice(0, limit)
}

/** The fields a query's result depends on beyond its entries: a change to them can change the matches. */
export const queryFields = ({ sort, where }: Query) => [
  ...new Set([
    ...(sort ? [sort.replace(/^-/, '')] : []),
    ...Object.keys(where ?? {}),
  ]),
]

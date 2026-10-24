// render(template, { content, entry }, { DOMParser }) -> { html, deps }
//
// Pure: the same template and content give the same bytes in the browser and in Node, as long as
// DOMParser is the browser's own or jsdom's (see docs/rendering.md#output-equivalence).
// `content` maps an entry key (`site` for a single, `posts/hello` for an entry) to its fields.
// `entry` is the key of the page's own entry, which `route` sentinels read.

export type Content = Record<string, Record<string, unknown>>
export interface Deps {
  entries: string[]
  collections: Record<string, string[]>
}
export interface Dom {
  DOMParser: new () => DOMParser
}
export interface Query {
  sort?: string
  limit?: number
  where?: Record<string, unknown>
}
export interface QueryEntry {
  id: string
  fields: Record<string, unknown>
}

const SENTINEL = /\{\{gratis:([^}]+)\}\}/g
const SHOW_ELEMENT = 0x1,
  SHOW_TEXT = 0x4,
  SHOW_COMMENT = 0x80

const compare = (a: unknown, b: unknown) =>
  a == null ? (b == null ? 0 : 1) : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0

/** A collection query, the same in the getters and here: equality filter, sort (ties by id), limit. */
export function runQuery<T extends QueryEntry>(
  entries: T[],
  { sort, limit, where }: Query = {},
): T[] {
  let result = entries.filter(({ fields }) =>
    Object.entries(where ?? {}).every(([key, value]) => fields[key] === value),
  )
  const field = sort?.replace(/^-/, '')
  const direction = sort?.startsWith('-') ? -1 : 1
  result = result.toSorted(
    (a, b) =>
      (field && direction * compare(a.fields[field], b.fields[field])) ||
      compare(a.id, b.id),
  )
  return limit == null ? result : result.slice(0, limit)
}

/** The fields a query's result depends on beyond its entries: a change to them can change the matches. */
export const queryFields = ({ sort, where }: Query) => [
  ...new Set([
    ...(sort ? [sort.replace(/^-/, '')] : []),
    ...Object.keys(where ?? {}),
  ]),
]

/** The entries of a collection in `content`, by their `<collection>/<id>` keys. */
export const collectionEntries = (
  content: Content,
  collection: string,
): QueryEntry[] =>
  Object.keys(content)
    .filter((key) => key.startsWith(`${collection}/`))
    .map((key) => ({
      id: key.slice(collection.length + 1),
      fields: content[key],
    }))

export function render(
  template: string,
  { content, entry }: { content: Content; entry?: string },
  { DOMParser }: Dom,
): { html: string; deps: Deps } {
  const doc = new DOMParser().parseFromString(template, 'text/html')
  const entries = new Set<string>(entry ? [entry] : [])
  const collections: Record<string, Set<string>> = {}

  // A value by its sentinel ref: `entry:site:title`, `route:title`, `item:title` (with `item`).
  const read = (ref: string, item?: string): unknown => {
    const [scope, ...rest] = ref.split(':')
    let key: string, field: string
    if (scope === 'entry') [key, field] = rest
    else if (scope === 'route') {
      if (!entry)
        throw new Error(
          `gratis: {{gratis:${ref}}} on a page with no entry of its own`,
        )
      ;[key, field] = [entry, rest[0]]
    } else if (scope === 'item') {
      if (!item) throw new Error(`gratis: {{gratis:${ref}}} outside an each`)
      ;[key, field] = [item, rest[0]]
    } else
      throw new Error(
        `gratis: unsupported sentinel scope "${scope}" in {{gratis:${ref}}}`,
      )
    entries.add(key)
    if (field === 'id') return key.slice(key.indexOf('/') + 1)
    return content[key]?.[field]
  }
  const text = (value: unknown) => (value == null ? '' : String(value))

  // Comment markers under `root`, in document order.
  const markers = (root: Node, kind: string) => {
    const found: Comment[] = []
    const walker = doc.createTreeWalker(root, SHOW_COMMENT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const data = (node as Comment).data
      if (data.startsWith(`gratis:${kind} `) || data === `/gratis:${kind}`)
        found.push(node as Comment)
      else if (
        /^\/?gratis:/.test(data) &&
        !/^\/?gratis:(each|if)( |$)/.test(data)
      )
        throw new Error(`gratis: unknown marker <!--${data}-->`)
    }
    return found
  }
  // The siblings between a start marker and its end, counting nested pairs of the same kind.
  const between = (start: Comment, kind: string) => {
    const nodes: Node[] = []
    let depth = 0
    for (let node = start.nextSibling; node; node = node.nextSibling) {
      if (node.nodeType === 8) {
        const data = (node as Comment).data
        if (data.startsWith(`gratis:${kind} `)) depth++
        else if (data === `/gratis:${kind}`) {
          if (!depth--) return { nodes, end: node as Comment }
        }
      }
      nodes.push(node)
    }
    throw new Error(`gratis: <!--${start.data}--> has no end`)
  }

  // Removes the content of falsy `if`s and every `if` marker under `root`.
  const conditionals = (root: Node, item?: string) => {
    for (const start of markers(root, 'if')) {
      if (!start.parentNode || start.data.startsWith('/')) continue
      const { nodes, end } = between(start, 'if')
      if (!read(start.data.slice('gratis:if '.length), item))
        for (const node of nodes) node.parentNode?.removeChild(node)
      start.remove()
      end.remove()
    }
  }

  // Fills every sentinel in text and attributes under `root`, in one pass so values are never re-read.
  const fill = (root: Node, item?: string) => {
    const replace = (s: string) =>
      s.replace(SENTINEL, (_, ref: string) => text(read(ref, item)))
    const walker = doc.createTreeWalker(root, SHOW_ELEMENT | SHOW_TEXT)
    for (
      let node: Node | null = walker.currentNode;
      node;
      node = walker.nextNode()
    ) {
      if (node.nodeType === 1) {
        for (const attr of (node as Element).attributes)
          if (attr.value.includes('{{gratis:')) attr.value = replace(attr.value)
      } else if (node.nodeType === 3) {
        const parent = node.parentNode?.nodeName
        if (parent === 'SCRIPT' || parent === 'STYLE') continue
        if ((node as Text).data.includes('{{gratis:'))
          (node as Text).data = replace((node as Text).data)
      }
    }
  }

  // 1. Lift each item template out of the page, so the page's own pass never sees item sentinels.
  const lists = markers(doc, 'each')
    .filter((m) => !m.data.startsWith('/'))
    .map((start) => {
      const { nodes, end } = between(start, 'each')
      const item = doc.createDocumentFragment()
      item.append(...nodes)
      start.remove()
      return { ref: start.data.slice('gratis:each '.length), item, end }
    })

  // 2. The page itself.
  conditionals(doc)
  fill(doc.documentElement)

  // 3. One clone of the item template per item, in place of the end marker.
  for (const { ref, item, end } of lists) {
    if (!end.parentNode) continue // inside an `if` that was false
    const match = ref.match(/^query:([^ ]+)(?: (.*))?$/)
    if (!match)
      throw new Error(
        `gratis: <!--gratis:each ${ref}--> lists other than queries are not supported yet`,
      )
    const [, collection, json] = match
    const query: Query = json ? JSON.parse(json) : {}
    collections[collection] ??= new Set()
    for (const field of queryFields(query)) collections[collection].add(field)
    for (const { id } of runQuery(
      collectionEntries(content, collection),
      query,
    )) {
      const key = `${collection}/${id}`
      entries.add(key)
      const clone = item.cloneNode(true) as DocumentFragment
      conditionals(clone, key)
      for (const node of [...clone.childNodes]) fill(node, key)
      end.before(clone)
    }
    end.remove()
  }

  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : ''
  return {
    html: doctype + doc.documentElement.outerHTML,
    deps: {
      entries: [...entries].sort(),
      collections: Object.fromEntries(
        Object.keys(collections)
          .sort()
          .map((name) => [name, [...collections[name]].sort()]),
      ),
    },
  }
}

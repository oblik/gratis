import { entryKey, parseKey, type EntryKey } from '../bucket.ts'
import { queryFields, runQuery, type QueryEntry } from './query.ts'
import {
  formatValue,
  hasValues,
  LIST_KEY,
  parseList,
  parseMarker,
  parseValue,
  replaceValues,
  type ListRef,
  type Marker,
  type ValueRef,
} from './sentinels.ts'

export type Content = Record<EntryKey, Record<string, unknown>>
/**
 * What a page read: entries, and the fields each collection's queries sort or
 * filter by.
 */
export interface Deps {
  entries: EntryKey[]
  collections: Record<string, string[]>
}
export interface Dom {
  DOMParser: new () => DOMParser
}

/**
 * A value in an island's props as Astro serializes it: a type, 0 for a plain
 * value or 1 for an array, and the value, whose objects and arrays hold pairs
 * in turn. The other types, like dates, can't hold content.
 */
type Prop = [type: number, value?: unknown]
const VALUE = 0,
  ARRAY = 1

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const mapValues = <T, U>(object: Record<string, T>, f: (value: T) => U) =>
  Object.fromEntries(Object.entries(object).map(([k, v]) => [k, f(v)]))

/** A value read from content, which is only JSON, in Astro's form. */
const toProp = (value: unknown): Prop =>
  value === undefined
    ? [VALUE]
    : Array.isArray(value)
      ? [ARRAY, value.map(toProp)]
      : isObject(value)
        ? [VALUE, mapValues(value, toProp)]
        : [VALUE, value]

const SHOW_ALL = 0xffffffff

/**
 * Every node from `root` on, in document order. That includes the content of a
 * <template>, which the DOM keeps apart from its element, and where Astro puts
 * the children of an island that it doesn't render on the server.
 */
function* descendants(root: Node): Generator<Node> {
  const doc = root.ownerDocument ?? (root as Document)
  const walker = doc.createTreeWalker(root, SHOW_ALL)
  for (let node: Node | null = root; node; node = walker.nextNode()) {
    yield node
    if (node.nodeName === 'TEMPLATE')
      yield* descendants((node as HTMLTemplateElement).content)
  }
}

const collectionEntries = (
  content: Content,
  collection: string,
): QueryEntry[] =>
  Object.keys(content)
    .filter(
      (key) => parseKey(key).collection === collection && key.includes('/'),
    )
    .map((key) => ({ id: parseKey(key).id!, fields: content[key] }))

/**
 * `entry` is the page's own entry, which `route` sentinels read. The output is
 * the same in the browser and in Node, with jsdom's DOMParser.
 */
export function render(
  template: string,
  { content, entry }: { content: Content; entry?: string },
  { DOMParser }: Dom,
): { html: string; deps: Deps } {
  const doc = new DOMParser().parseFromString(template, 'text/html')
  const entries = new Set<string>(entry ? [entry] : [])
  const collections: Record<string, Set<string>> = {}

  // `item` is the entry key of the current `each` item, and `own` the one
  // `route` sentinels read, which is the page's own entry except in a list in
  // an island's props.
  const read = (ref: ValueRef, item?: string, own = entry): unknown => {
    let key: string
    if (ref.scope === 'entry') key = ref.key
    else if (ref.scope === 'route') {
      if (!own)
        throw new Error(
          `gratis: ${formatValue(ref)} on a page with no entry of its own`,
        )
      key = own
    } else {
      if (!item) throw new Error(`gratis: ${formatValue(ref)} outside an each`)
      key = item
    }
    entries.add(key)
    if (ref.field === 'id') return parseKey(key).id
    return content[key]?.[ref.field]
  }
  const text = (value: unknown) => (value == null ? '' : String(value))

  // The entries a list's query matches, recorded with the fields it reads.
  const matches = ({ collection, query }: ListRef) => {
    collections[collection] ??= new Set()
    for (const field of queryFields(query)) collections[collection].add(field)
    return runQuery(collectionEntries(content, collection), query).map(
      ({ id }) => {
        const key = entryKey(collection, id)
        entries.add(key)
        return key
      },
    )
  }

  // The start markers of `kind` under `root`, in document order.
  const starts = <K extends 'if' | 'each'>(root: Node, kind: K) => {
    const found: { start: Comment; marker: Extract<Marker, { kind: K }> }[] = []
    for (const node of descendants(root)) {
      if (node.nodeType !== 8) continue
      const marker = parseMarker((node as Comment).data)
      if (marker?.kind === kind)
        found.push({
          start: node as Comment,
          marker: marker as Extract<Marker, { kind: K }>,
        })
    }
    return found
  }
  // The siblings between a start marker and its end, counting nested pairs of
  // the same kind.
  const between = (start: Comment, kind: 'if' | 'each') => {
    const nodes: Node[] = []
    let depth = 0
    for (let node = start.nextSibling; node; node = node.nextSibling) {
      if (node.nodeType === 8) {
        const marker = parseMarker((node as Comment).data)
        if (marker?.kind === kind) depth++
        else if (marker?.kind === 'end' && marker.of === kind && !depth--)
          return { nodes, end: node as Comment }
      }
      nodes.push(node)
    }
    throw new Error(`gratis: <!--${start.data}--> has no end`)
  }

  // Removes the content of falsy `if`s and every `if` marker under `root`.
  const conditionals = (root: Node, item?: string) => {
    for (const { start, marker } of starts(root, 'if')) {
      if (!start.parentNode) continue
      const { nodes, end } = between(start, 'if')
      if (!read(marker.value, item))
        for (const node of nodes) node.parentNode?.removeChild(node)
      start.remove()
      end.remove()
    }
  }

  const fillProp = (
    [type, value]: Prop,
    item: string | undefined,
    own: string | undefined,
  ): Prop => {
    if (type === VALUE && typeof value === 'string') {
      // A sentinel that is the whole string gets the value with its type, so a
      // boolean stays a boolean.
      const ref = parseValue(value)
      if (ref) return toProp(read(ref, item, own))
      return [VALUE, replaceValues(value, (ref) => text(read(ref, item, own)))]
    }

    if (type === VALUE && isObject(value)) {
      // A stand-in entry's id isn't a sentinel but a placeholder, because the
      // template pass builds a route at it, so it's replaced by name.
      const standIn = LIST_KEY in value
      const object: Record<string, Prop> = {}
      for (const [key, prop] of Object.entries(value as Record<string, Prop>))
        if (key === LIST_KEY) continue
        else if (standIn && key === 'id')
          object.id = toProp(read({ scope: 'route', field: 'id' }, item, own))
        else object[key] = fillProp(prop, item, own)
      return [VALUE, object]
    }

    if (type === ARRAY && Array.isArray(value)) {
      // A list is a single stand-in entry, so it gets one entry per match, with
      // the match as the entry its fields read.
      const [first] = value as Prop[]
      const list =
        value.length === 1 && first[0] === VALUE && isObject(first[1])
          ? (first[1][LIST_KEY] as Prop | undefined)?.[1]
          : undefined
      if (typeof list === 'string')
        return [
          ARRAY,
          matches(parseList(list)).map((key) => fillProp(first, item, key)),
        ]
      return [ARRAY, value.map((prop: Prop) => fillProp(prop, item, own))]
    }

    return [type, value]
  }

  const fill = (root: Node, item?: string) => {
    const replace = (s: string) =>
      replaceValues(s, (ref) => text(read(ref, item)))
    // Astro writes an island's props as JSON, so they're filled as JSON.
    const props = (json: string) =>
      JSON.stringify(
        mapValues(JSON.parse(json) as Record<string, Prop>, (prop) =>
          fillProp(prop, item, entry),
        ),
      )
    for (const node of descendants(root)) {
      if (node.nodeType === 1) {
        const isIsland = node.nodeName === 'ASTRO-ISLAND'
        for (const attr of (node as Element).attributes)
          if (isIsland && attr.name === 'props') {
            if (hasValues(attr.value) || attr.value.includes(LIST_KEY))
              attr.value = props(attr.value)
          } else if (hasValues(attr.value)) attr.value = replace(attr.value)
      } else if (node.nodeType === 3) {
        const parent = node.parentNode?.nodeName
        if (parent === 'SCRIPT' || parent === 'STYLE') continue
        if (hasValues((node as Text).data))
          (node as Text).data = replace((node as Text).data)
      }
    }
  }

  // 1. Lift each item template out of the page, so the page's own pass never
  // sees item sentinels.
  const lists = starts(doc, 'each').map(({ start, marker }) => {
    const { nodes, end } = between(start, 'each')
    const item = doc.createDocumentFragment()
    item.append(...nodes)
    start.remove()
    return { list: marker.list, item, end }
  })

  // 2. The page itself.
  conditionals(doc)
  fill(doc.documentElement)

  // 3. One clone of the item template per item, in place of the end marker.
  for (const { list, item, end } of lists) {
    if (!end.parentNode) continue // inside an `if` that was false
    for (const key of matches(list)) {
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

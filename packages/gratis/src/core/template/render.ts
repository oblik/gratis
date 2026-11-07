import { entryKey, parseKey, type EntryKey } from '../bucket.ts'
import { queryFields, runQuery, type QueryEntry } from './query.ts'
import {
  formatValue,
  hasValues,
  parseMarker,
  replaceValues,
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

const SHOW_ELEMENT = 0x1,
  SHOW_TEXT = 0x4,
  SHOW_COMMENT = 0x80

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

  // `item` is the entry key of the current `each` item.
  const read = (ref: ValueRef, item?: string): unknown => {
    let key: string
    if (ref.scope === 'entry') key = ref.key
    else if (ref.scope === 'route') {
      if (!entry)
        throw new Error(
          `gratis: ${formatValue(ref)} on a page with no entry of its own`,
        )
      key = entry
    } else {
      if (!item) throw new Error(`gratis: ${formatValue(ref)} outside an each`)
      key = item
    }
    entries.add(key)
    if (ref.field === 'id') return parseKey(key).id
    return content[key]?.[ref.field]
  }
  const text = (value: unknown) => (value == null ? '' : String(value))

  // The start markers of `kind` under `root`, in document order.
  const starts = <K extends 'if' | 'each'>(root: Node, kind: K) => {
    const found: { start: Comment; marker: Extract<Marker, { kind: K }> }[] = []
    const walker = doc.createTreeWalker(root, SHOW_COMMENT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
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

  const fill = (root: Node, item?: string) => {
    const replace = (s: string) =>
      replaceValues(s, (ref) => text(read(ref, item)))
    const walker = doc.createTreeWalker(root, SHOW_ELEMENT | SHOW_TEXT)
    for (
      let node: Node | null = walker.currentNode;
      node;
      node = walker.nextNode()
    ) {
      if (node.nodeType === 1) {
        for (const attr of (node as Element).attributes)
          if (hasValues(attr.value)) attr.value = replace(attr.value)
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
    const { collection, query } = list
    collections[collection] ??= new Set()
    for (const field of queryFields(query)) collections[collection].add(field)
    for (const { id } of runQuery(
      collectionEntries(content, collection),
      query,
    )) {
      const key = entryKey(collection, id)
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

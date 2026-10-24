// render(template, { content }, { DOMParser }) -> { html, deps }
//
// Pure: the same template and content give the same bytes in the browser and in Node, as long as
// DOMParser is the browser's own or jsdom's (see docs/rendering.md#output-equivalence).
// `content` maps an entry key (`site` for a single, `posts/hello` for an entry) to its fields.

export type Content = Record<string, Record<string, unknown>>;
export interface Deps { entries: string[]; collections: Record<string, unknown> }
export interface Dom { DOMParser: new () => DOMParser }

const SENTINEL = /\{\{gratis:([^}]+)\}\}/g;

export function render(template: string, { content }: { content: Content }, { DOMParser }: Dom): { html: string; deps: Deps } {
  const doc = new DOMParser().parseFromString(template, 'text/html');
  const entries = new Set<string>();

  const resolve = (ref: string) => {
    const [scope, ...rest] = ref.split(':');
    if (scope !== 'entry') throw new Error(`gratis: unsupported sentinel scope "${scope}" in {{gratis:${ref}}}`);
    const [key, field] = rest;
    entries.add(key);
    const value = content[key]?.[field];
    return value == null ? '' : String(value);
  };
  const fill = (s: string) => s.replace(SENTINEL, (_, ref: string) => resolve(ref));

  const walker = doc.createTreeWalker(doc.documentElement, 0x1 | 0x4 | 0x80); // elements, text, comments
  for (let node: Node | null = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType === 1) {
      for (const attr of (node as Element).attributes) if (attr.value.includes('{{gratis:')) attr.value = fill(attr.value);
    } else if (node.nodeType === 3) {
      const text = node as Text;
      const parent = text.parentNode!.nodeName;
      if (parent === 'SCRIPT' || parent === 'STYLE') continue;
      if (text.data.includes('{{gratis:')) text.data = fill(text.data);
    } else if (/^\/?gratis:/.test((node as Comment).data)) {
      throw new Error(`gratis: <!--${(node as Comment).data}--> markers are not supported yet`);
    }
  }

  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '';
  return {
    html: doctype + doc.documentElement.outerHTML,
    deps: { entries: [...entries].sort(), collections: {} },
  };
}

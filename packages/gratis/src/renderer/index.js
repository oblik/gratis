// render(template, { content }, { DOMParser }) -> { html, deps }
//
// Pure: the same template and content give the same bytes in the browser and in Node, as long as
// DOMParser is the browser's own or jsdom's (see docs/rendering.md#output-equivalence).
// `content` maps an entry key (`site` for a single, `posts/hello` for an entry) to its fields.

const SENTINEL = /\{\{gratis:([^}]+)\}\}/g;

export function render(template, { content }, { DOMParser }) {
  const doc = new DOMParser().parseFromString(template, 'text/html');
  const entries = new Set();

  const resolve = (ref) => {
    const [scope, ...rest] = ref.split(':');
    if (scope !== 'entry') throw new Error(`gratis: unsupported sentinel scope "${scope}" in {{gratis:${ref}}}`);
    const [key, field] = rest;
    entries.add(key);
    const value = content[key]?.[field];
    return value == null ? '' : String(value);
  };
  const fill = (s) => s.replace(SENTINEL, (_, ref) => resolve(ref));

  const walker = doc.createTreeWalker(doc.documentElement, 0x1 | 0x4 | 0x80); // elements, text, comments
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType === 1) {
      for (const attr of node.attributes) if (attr.value.includes('{{gratis:')) attr.value = fill(attr.value);
    } else if (node.nodeType === 3) {
      const parent = node.parentNode.nodeName;
      if (parent === 'SCRIPT' || parent === 'STYLE') continue;
      if (node.data.includes('{{gratis:')) node.data = fill(node.data);
    } else if (/^\/?gratis:/.test(node.data)) {
      throw new Error(`gratis: <!--${node.data}--> markers are not supported yet`);
    }
  }

  const doctype = doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : '';
  return {
    html: doctype + doc.documentElement.outerHTML,
    deps: { entries: [...entries].sort(), collections: {} },
  };
}

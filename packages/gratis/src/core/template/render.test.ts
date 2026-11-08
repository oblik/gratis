import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'

import type { Query } from './query.ts'
import { render } from './render.ts'
import { formatList } from './sentinels.ts'

const { DOMParser } = new JSDOM('').window
const template =
  '<!DOCTYPE html><html><head><meta property="og:title" content="{{gratis:entry:site:title}}"><title>{{gratis:entry:site:title}} · Home</title></head><body><h1>{{gratis:entry:site:title}}</h1></body></html>'

test('fills text nodes, attributes and <title>, escaping through the DOM', () => {
  const { html, deps } = render(
    template,
    { content: { site: { title: 'A & B <i>"q"</i>' } } },
    { DOMParser },
  )
  expect(html).toBe(
    '<!DOCTYPE html><html><head><meta property="og:title" content="A &amp; B <i>&quot;q&quot;</i>"><title>A &amp; B &lt;i&gt;"q"&lt;/i&gt; · Home</title></head><body><h1>A &amp; B &lt;i&gt;"q"&lt;/i&gt;</h1></body></html>',
  )
  expect(deps).toStrictEqual({ entries: ['site'], collections: {} })
})

test('a missing value renders empty', () => {
  const { html } = render(template, { content: {} }, { DOMParser })
  expect(html).toMatch(/<h1><\/h1>/)
})

test('rejects markers it cannot render yet', () => {
  expect(() =>
    render(
      '<ul><!--gratis:each entry:site:nav--><li></li><!--/gratis:each--></ul>',
      { content: {} },
      { DOMParser },
    ),
  ).toThrow(/not supported yet/)
})

const posts = {
  site: { title: 'Blog' },
  'posts/a': { title: 'A', date: '2026-01-01', featured: true },
  'posts/b': { title: 'B <b>', date: '2026-03-01', featured: false },
  'posts/c': { title: 'C', date: '2026-02-01', featured: false },
}
const body = (html: string) => html.match(/<body>(.*)<\/body>/)![1]

test('an each over a query clones its item per entry, in query order, with conditionals per item', () => {
  const list =
    '<!DOCTYPE html><html><head></head><body><ul><!--gratis:each query:posts {"sort":"-date","limit":2}--><li><a href="/blog/{{gratis:item:id}}/">{{gratis:item:title}}</a><!--gratis:if item:featured--><b>!</b><!--/gratis:if--></li><!--/gratis:each--></ul></body></html>'
  const { html, deps } = render(list, { content: posts }, { DOMParser })
  expect(body(html)).toBe(
    '<ul><li><a href="/blog/b/">B &lt;b&gt;</a></li><li><a href="/blog/c/">C</a></li></ul>',
  )
  expect(deps).toStrictEqual({
    entries: ['posts/b', 'posts/c'],
    collections: { posts: ['date'] },
  })
  const all = render(
    list.replace(',"limit":2', '').replace('"-date"', '"date"'),
    { content: posts },
    { DOMParser },
  )
  expect(body(all.html)).toBe(
    '<ul><li><a href="/blog/a/">A</a><b>!</b></li><li><a href="/blog/c/">C</a></li><li><a href="/blog/b/">B &lt;b&gt;</a></li></ul>',
  )
})

test('a query filters by equality and an empty result leaves nothing', () => {
  const list =
    '<!DOCTYPE html><html><head></head><body><ul><!--gratis:each query:posts {"where":{"featured":true}}--><li>{{gratis:item:title}}</li><!--/gratis:each--></ul></body></html>'
  const { html, deps } = render(list, { content: posts }, { DOMParser })
  expect(body(html)).toBe('<ul><li>A</li></ul>')
  expect(deps.collections).toStrictEqual({ posts: ['featured'] })
  expect(
    body(render(list, { content: { site: {} } }, { DOMParser }).html),
  ).toBe('<ul></ul>')
})

test('route sentinels read the page entry, and a false if removes its content', () => {
  const page =
    '<!DOCTYPE html><html><head><title>{{gratis:route:title}} · {{gratis:entry:site:title}}</title></head><body><!--gratis:if route:featured--><p>Featured</p><!--/gratis:if--><h1>{{gratis:route:title}}</h1></body></html>'
  const b = render(page, { content: posts, entry: 'posts/b' }, { DOMParser })
  expect(b.html).toBe(
    '<!DOCTYPE html><html><head><title>B &lt;b&gt; · Blog</title></head><body><h1>B &lt;b&gt;</h1></body></html>',
  )
  expect(b.deps).toStrictEqual({
    entries: ['posts/b', 'site'],
    collections: {},
  })
  expect(
    render(page, { content: posts, entry: 'posts/a' }, { DOMParser }).html,
  ).toMatch(/<body><p>Featured<\/p><h1>A<\/h1>/)
  expect(() => render(page, { content: posts }, { DOMParser })).toThrow(
    /no entry of its own/,
  )
})

test('a value that looks like a sentinel is never read again', () => {
  const content = {
    site: { title: '{{gratis:entry:site:secret}}', secret: 'leaked' },
    'posts/a': { title: '{{gratis:item:secret}}', secret: 'leaked' },
  }
  const page =
    '<!DOCTYPE html><html><head></head><body><h1>{{gratis:entry:site:title}}</h1><!--gratis:each query:posts--><p>{{gratis:item:title}}</p><!--/gratis:each--></body></html>'
  const { html } = render(page, { content }, { DOMParser })
  expect(html).not.toMatch(/leaked/)
})

// An island as Astro writes it, with its props in [type, value] pairs, on a
// page of its own, and the props a render gives it.
const islandTag = (props: object, children = '') =>
  `<astro-island client="only" props="${JSON.stringify(props).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${children}</astro-island>`
const page = (body: string) =>
  `<!DOCTYPE html><html><head></head><body>${body}</body></html>`
const island = (props: object, children?: string) =>
  page(islandTag(props, children))
const props = (html: string) =>
  JSON.parse(
    new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('astro-island')!
      .getAttribute('props')!,
  )

test("an island's props are filled as JSON, with each value's own type", () => {
  const content = {
    site: { title: 'Blog' },
    'posts/a': { title: 'Say "hi" \\ there\nnow', featured: false },
  }
  const { html } = render(
    island({
      title: [0, '{{gratis:route:title}}'],
      featured: [0, '{{gratis:route:featured}}'],
      byline: [0, 'On {{gratis:entry:site:title}}: {{gratis:route:title}}'],
      tags: [1, [[0, '{{gratis:route:featured}}']]],
      missing: [0, '{{gratis:route:subtitle}}'],
      date: [3, '2026-01-01T00:00:00.000Z'],
    }),
    { content, entry: 'posts/a' },
    { DOMParser },
  )
  expect(props(html)).toStrictEqual({
    title: [0, 'Say "hi" \\ there\nnow'],
    featured: [0, false],
    byline: [0, 'On Blog: Say "hi" \\ there\nnow'],
    tags: [1, [[0, false]]],
    missing: [0],
    date: [3, '2026-01-01T00:00:00.000Z'],
  })
})

// The template pass stands for a getCollection result with a single entry,
// which is also the page's own entry. In an island's props, that entry carries
// the list's query.
const standIn = (query: Query) => ({
  id: [0, 'gratis-placeholder-posts'],
  collection: [0, 'posts'],
  title: [0, '{{gratis:route:title}}'],
  featured: [0, '{{gratis:route:featured}}'],
  'gratis:list': [0, formatList({ collection: 'posts', query })],
})

test("a list in an island's props, a single stand-in entry in the template, becomes the entries its query matches", () => {
  const { html, deps } = render(
    island({ posts: [1, [[0, standIn({ sort: '-date', limit: 2 })]]] }),
    { content: posts },
    { DOMParser },
  )
  expect(props(html)).toStrictEqual({
    posts: [
      1,
      [
        [
          0,
          {
            id: [0, 'b'],
            collection: [0, 'posts'],
            title: [0, 'B <b>'],
            featured: [0, false],
          },
        ],
        [
          0,
          {
            id: [0, 'c'],
            collection: [0, 'posts'],
            title: [0, 'C'],
            featured: [0, false],
          },
        ],
      ],
    ],
  })
  expect(deps).toStrictEqual({
    entries: ['posts/b', 'posts/c'],
    collections: { posts: ['date'] },
  })
})

test("the stand-in entry alone in an island's props is the page's own entry", () => {
  const own = render(
    island({ post: [0, standIn({})], open: [0, true] }),
    { content: posts, entry: 'posts/a' },
    { DOMParser },
  )
  expect(props(own.html)).toStrictEqual({
    post: [
      0,
      {
        id: [0, 'a'],
        collection: [0, 'posts'],
        title: [0, 'A'],
        featured: [0, true],
      },
    ],
    open: [0, true],
  })
  expect(own.deps.entries).toStrictEqual(['posts/a'])
})

test("an <Each>'s item in an island's props is the entry of each match", () => {
  const item = {
    id: [0, '{{gratis:item:id}}'],
    collection: [0, 'posts'],
    title: [0, '{{gratis:item:title}}'],
  }
  const { html } = render(
    page(
      `<!--gratis:each query:posts {"where":{"featured":false}}-->${islandTag({ post: [0, item] })}<!--/gratis:each-->`,
    ),
    { content: posts },
    { DOMParser },
  )
  const doc = new DOMParser().parseFromString(html, 'text/html')
  expect(
    [...doc.querySelectorAll('astro-island')].map(
      (island) => JSON.parse(island.getAttribute('props')!).post[1].title,
    ),
  ).toStrictEqual([
    [0, 'B <b>'],
    [0, 'C'],
  ])
})

test("an island's children are filled, also in the <template> Astro puts them in when it doesn't render the island", () => {
  const { html } = render(
    island(
      {},
      '<template data-astro-template><p>{{gratis:route:title}}</p><!--gratis:each query:posts {"where":{"featured":true}}--><i>{{gratis:item:title}}</i><!--/gratis:each--></template>',
    ),
    { content: posts, entry: 'posts/b' },
    { DOMParser },
  )
  expect(body(html)).toBe(
    '<astro-island client="only" props="{}"><template data-astro-template=""><p>B &lt;b&gt;</p><i>A</i></template></astro-island>',
  )
})

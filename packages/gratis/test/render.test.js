import assert from 'node:assert/strict'
import { test } from 'node:test'

import { JSDOM } from 'jsdom'

import { render } from '../src/core/render.ts'

const { DOMParser } = new JSDOM('').window
const template =
  '<!DOCTYPE html><html><head><meta property="og:title" content="{{gratis:entry:site:title}}"><title>{{gratis:entry:site:title}} · Home</title></head><body><h1>{{gratis:entry:site:title}}</h1></body></html>'

test('fills text nodes, attributes and <title>, escaping through the DOM', () => {
  const { html, deps } = render(
    template,
    { content: { site: { title: 'A & B <i>"q"</i>' } } },
    { DOMParser },
  )
  assert.equal(
    html,
    '<!DOCTYPE html><html><head><meta property="og:title" content="A &amp; B <i>&quot;q&quot;</i>"><title>A &amp; B &lt;i&gt;"q"&lt;/i&gt; · Home</title></head><body><h1>A &amp; B &lt;i&gt;"q"&lt;/i&gt;</h1></body></html>',
  )
  assert.deepEqual(deps, { entries: ['site'], collections: {} })
})

test('a missing value renders empty', () => {
  const { html } = render(template, { content: {} }, { DOMParser })
  assert.match(html, /<h1><\/h1>/)
})

test('rejects markers it cannot render yet', () => {
  assert.throws(
    () =>
      render(
        '<ul><!--gratis:each entry:site:nav--><li></li><!--/gratis:each--></ul>',
        { content: {} },
        { DOMParser },
      ),
    /not supported yet/,
  )
})

const posts = {
  site: { title: 'Blog' },
  'posts/a': { title: 'A', date: '2026-01-01', featured: true },
  'posts/b': { title: 'B <b>', date: '2026-03-01', featured: false },
  'posts/c': { title: 'C', date: '2026-02-01', featured: false },
}
const body = (html) => html.match(/<body>(.*)<\/body>/)[1]

test('an each over a query clones its item per entry, in query order, with conditionals per item', () => {
  const list =
    '<!DOCTYPE html><html><head></head><body><ul><!--gratis:each query:posts {"sort":"-date","limit":2}--><li><a href="/blog/{{gratis:item:id}}/">{{gratis:item:title}}</a><!--gratis:if item:featured--><b>!</b><!--/gratis:if--></li><!--/gratis:each--></ul></body></html>'
  const { html, deps } = render(list, { content: posts }, { DOMParser })
  assert.equal(
    body(html),
    '<ul><li><a href="/blog/b/">B &lt;b&gt;</a></li><li><a href="/blog/c/">C</a></li></ul>',
  )
  assert.deepEqual(deps, {
    entries: ['posts/b', 'posts/c'],
    collections: { posts: ['date'] },
  })
  const all = render(
    list.replace(',"limit":2', '').replace('"-date"', '"date"'),
    { content: posts },
    { DOMParser },
  )
  assert.equal(
    body(all.html),
    '<ul><li><a href="/blog/a/">A</a><b>!</b></li><li><a href="/blog/c/">C</a></li><li><a href="/blog/b/">B &lt;b&gt;</a></li></ul>',
  )
})

test('a query filters by equality and an empty result leaves nothing', () => {
  const list =
    '<!DOCTYPE html><html><head></head><body><ul><!--gratis:each query:posts {"where":{"featured":true}}--><li>{{gratis:item:title}}</li><!--/gratis:each--></ul></body></html>'
  const { html, deps } = render(list, { content: posts }, { DOMParser })
  assert.equal(body(html), '<ul><li>A</li></ul>')
  assert.deepEqual(deps.collections, { posts: ['featured'] })
  assert.equal(
    body(render(list, { content: { site: {} } }, { DOMParser }).html),
    '<ul></ul>',
  )
})

test('route sentinels read the page entry, and a false if removes its content', () => {
  const page =
    '<!DOCTYPE html><html><head><title>{{gratis:route:title}} · {{gratis:entry:site:title}}</title></head><body><!--gratis:if route:featured--><p>Featured</p><!--/gratis:if--><h1>{{gratis:route:title}}</h1></body></html>'
  const b = render(page, { content: posts, entry: 'posts/b' }, { DOMParser })
  assert.equal(
    b.html,
    '<!DOCTYPE html><html><head><title>B &lt;b&gt; · Blog</title></head><body><h1>B &lt;b&gt;</h1></body></html>',
  )
  assert.deepEqual(b.deps, { entries: ['posts/b', 'site'], collections: {} })
  assert.match(
    render(page, { content: posts, entry: 'posts/a' }, { DOMParser }).html,
    /<body><p>Featured<\/p><h1>A<\/h1>/,
  )
  assert.throws(
    () => render(page, { content: posts }, { DOMParser }),
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
  assert.doesNotMatch(html, /leaked/)
})

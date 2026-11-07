// The template pass: what Gratis content reads as when the build runs in template mode.

import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

import {
  eachBlock,
  ifBlock,
  inTemplateMode,
  isTemplateMode,
  placeholderList,
  routeBinding,
  singleEntry,
} from '../src/astro/template-mode.ts'

beforeEach(() => (process.env.GRATIS_MODE = 'template'))
afterEach(() => delete process.env.GRATIS_MODE)

test('inTemplateMode turns the mode on for the build only', async () => {
  delete process.env.GRATIS_MODE
  assert.equal(await inTemplateMode(async () => isTemplateMode()), true)
  assert.equal(isTemplateMode(), false)
  await assert.rejects(inTemplateMode(() => Promise.reject(new Error('x'))))
  assert.equal(isTemplateMode(), false)
})

test("a single's entry is its sentinels", () => {
  assert.deepEqual(singleEntry('site', ['title', 'tagline']), {
    title: '{{gratis:entry:site:title}}',
    tagline: '{{gratis:entry:site:tagline}}',
  })
})

test("getCollection's placeholder is the page's own entry, with the placeholder id", () => {
  const [post] = placeholderList('posts', {})
  assert.equal(post.id, 'gratis-placeholder-posts')
  assert.equal(post.collection, 'posts')
  assert.equal(post.title, '{{gratis:route:title}}')
})

test('an Each over a getCollection result renders one placeholder item between markers carrying the query', () => {
  const block = eachBlock(placeholderList('posts', { sort: '-date' }))
  assert.equal(block.start, '<!--gratis:each query:posts {"sort":"-date"}-->')
  assert.equal(block.end, '<!--/gratis:each-->')
  assert.equal(block.items[0].title, '{{gratis:item:title}}')
  assert.equal(eachBlock([1, 2]), undefined)
  assert.throws(
    () => eachBlock('{{gratis:entry:site:nav}}'),
    /<Each> over a field/,
  )
})

test('an If over a field wraps its content in markers carrying the value', () => {
  assert.deepEqual(ifBlock('{{gratis:route:featured}}'), {
    start: '<!--gratis:if route:featured-->',
    end: '<!--/gratis:if-->',
  })
  assert.equal(ifBlock(true), undefined)
  assert.throws(() => ifBlock(placeholderList('posts', {})), /<If> over a list/)
})

test('outside the template pass nothing is a block', () => {
  delete process.env.GRATIS_MODE
  assert.equal(eachBlock(placeholderList('posts', {})), undefined)
  assert.equal(ifBlock('{{gratis:route:featured}}'), undefined)
})

test('a route built at a placeholder id is bound to its collection', () => {
  assert.deepEqual(
    routeBinding('/blog/[slug]', 'blog/gratis-placeholder-posts/index.html'),
    { collection: 'posts', param: 'slug', file: 'blog/[slug]/index.html' },
  )
  assert.equal(routeBinding('/', 'index.html'), undefined)
  assert.equal(routeBinding('/tags/[tag]', 'tags/x/index.html'), undefined)
})

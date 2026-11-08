import { afterEach, beforeEach, expect, test } from 'vitest'

import { state } from './state.ts'
import {
  eachBlock,
  ifBlock,
  inTemplateMode,
  isTemplateMode,
  placeholderList,
  routeBinding,
  singleEntry,
} from './template-mode.ts'

beforeEach(() => {
  process.env.GRATIS_MODE = 'template'
  state().collections = {
    posts: {
      single: false,
      label: 'Posts',
      source: 'src/data/posts/',
      fields: {
        title: { type: 'text', label: 'Title' },
        featured: { type: 'boolean', label: 'Featured' },
      },
    },
  }
})
afterEach(() => {
  delete process.env.GRATIS_MODE
  state().collections = {}
})

test('inTemplateMode turns the mode on for the build only', async () => {
  delete process.env.GRATIS_MODE
  expect(await inTemplateMode(async () => isTemplateMode())).toBe(true)
  expect(isTemplateMode()).toBe(false)
  await expect(
    inTemplateMode(() => Promise.reject(new Error('x'))),
  ).rejects.toThrow()
  expect(isTemplateMode()).toBe(false)
})

test("a single's entry is its sentinels", () => {
  expect(singleEntry('site', ['title', 'tagline'])).toStrictEqual({
    title: '{{gratis:entry:site:title}}',
    tagline: '{{gratis:entry:site:tagline}}',
  })
})

test("getCollection's placeholder is the page's own entry, with the placeholder id", () => {
  const [post] = placeholderList('posts', {})
  expect(post.id).toBe('gratis-placeholder-posts')
  expect(post.collection).toBe('posts')
  expect(post.title).toBe('{{gratis:route:title}}')
})

// Astro serializes an island's props with Object.entries, and a page may spread
// an entry, so both see the same fields as reading them by name.
const readByName = (entry: Record<string, string>) =>
  Object.fromEntries(Object.keys(entry).map((key) => [key, entry[key]]))

test("the page's own entry lists its fields, and the query of the list it stands for", () => {
  const [post] = placeholderList('posts', { sort: '-date' })
  expect(readByName(post)).toStrictEqual({
    id: 'gratis-placeholder-posts',
    collection: 'posts',
    title: '{{gratis:route:title}}',
    featured: '{{gratis:route:featured}}',
    'gratis:list': 'query:posts {"sort":"-date"}',
  })
  expect(Object.fromEntries(Object.entries(post))).toStrictEqual(
    readByName(post),
  )
  expect({ ...post }).toStrictEqual(readByName(post))
})

test("an Each's item lists its fields", () => {
  const [item] = eachBlock(placeholderList('posts', {}))!.items
  expect(readByName(item)).toStrictEqual({
    id: '{{gratis:item:id}}',
    collection: 'posts',
    title: '{{gratis:item:title}}',
    featured: '{{gratis:item:featured}}',
  })
  expect(Object.fromEntries(Object.entries(item))).toStrictEqual(
    readByName(item),
  )
  expect({ ...item }).toStrictEqual(readByName(item))
})

test('an Each over a getCollection result renders one placeholder item between markers carrying the query', () => {
  const block = eachBlock(placeholderList('posts', { sort: '-date' }))!
  expect(block.start).toBe('<!--gratis:each query:posts {"sort":"-date"}-->')
  expect(block.end).toBe('<!--/gratis:each-->')
  expect(block.items[0].title).toBe('{{gratis:item:title}}')
  expect(eachBlock([1, 2])).toBe(undefined)
  expect(() => eachBlock('{{gratis:entry:site:nav}}')).toThrow(
    /<Each> over a field/,
  )
})

test('an If over a field wraps its content in markers carrying the value', () => {
  expect(ifBlock('{{gratis:route:featured}}')).toStrictEqual({
    start: '<!--gratis:if route:featured-->',
    end: '<!--/gratis:if-->',
  })
  expect(ifBlock(true)).toBe(undefined)
  expect(() => ifBlock(placeholderList('posts', {}))).toThrow(
    /<If> over a list/,
  )
})

test('outside the template pass nothing is a block', () => {
  delete process.env.GRATIS_MODE
  expect(eachBlock(placeholderList('posts', {}))).toBe(undefined)
  expect(ifBlock('{{gratis:route:featured}}')).toBe(undefined)
})

test('a route built at a placeholder id is bound to its collection', () => {
  expect(
    routeBinding('/blog/[slug]', 'blog/gratis-placeholder-posts/index.html'),
  ).toStrictEqual({
    collection: 'posts',
    param: 'slug',
    file: 'blog/[slug]/index.html',
  })
  expect(routeBinding('/', 'index.html')).toBe(undefined)
  expect(routeBinding('/tags/[tag]', 'tags/x/index.html')).toBe(undefined)
})

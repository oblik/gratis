// The template pass: what Gratis content reads as when the build runs in template mode.

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  eachBlock,
  ifBlock,
  inTemplateMode,
  isTemplateMode,
  placeholderList,
  routeBinding,
  singleEntry,
} from './template-mode.ts'

beforeEach(() => (process.env.GRATIS_MODE = 'template'))
afterEach(() => delete process.env.GRATIS_MODE)

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

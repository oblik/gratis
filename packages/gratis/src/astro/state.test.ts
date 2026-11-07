import { beforeEach, expect, test } from 'vitest'

import type { Collection } from '../core/schema.ts'
import { register, state } from './state.ts'

const collection: Collection = {
  single: false,
  label: 'Posts',
  source: 'src/data/posts/',
  fields: {},
}

beforeEach(() => {
  globalThis.__gratis = undefined
})

test('collections keep the content config order whatever order they load in', () => {
  register('posts', 1, collection)
  register('site', 0, collection)
  register('authors', 2, collection)
  expect(Object.keys(state().collections)).toEqual(['site', 'posts', 'authors'])
})

test('a reloaded collection keeps its place', () => {
  register('site', 0, collection)
  register('posts', 1, collection)
  register('site', 0, { ...collection, label: 'Site' })
  expect(Object.keys(state().collections)).toEqual(['site', 'posts'])
  expect(state().collections.site.label).toBe('Site')
})

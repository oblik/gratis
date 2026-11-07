import { expect, test } from 'vitest'

import { changedFields } from './schema.ts'

test('changedFields compares values structurally, including removed fields', () => {
  expect(
    changedFields(
      { title: 'A', tags: ['x'], featured: true },
      { title: 'A', tags: ['x'], date: '2026-01-01' },
    ),
  ).toStrictEqual(['featured', 'date'])
})

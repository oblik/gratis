import { JSDOM } from 'jsdom'
import { expect, test } from 'vitest'

import { checkIslands } from './build.ts'

const { DOMParser } = new JSDOM('').window

// An island as the template pass writes it.
const island = (client: string, props: object, children = '') =>
  `<!DOCTYPE html><html><head></head><body><astro-island client="${client}" props="${JSON.stringify(props).replace(/"/g, '&quot;')}" opts="{&quot;name&quot;:&quot;Card&quot;,&quot;value&quot;:true}">${children}</astro-island></body></html>`
const check = (template: string) =>
  checkIslands(template, '/blog/[slug]', { DOMParser })

test('content in the props of an island rendered on the server fails the build', () => {
  expect(() =>
    check(island('load', { title: [0, '{{gratis:route:title}}'] })),
  ).toThrow(
    /\/blog\/\[slug\]: <Card client:load> gets content through its props(.|\n)*client:only(.|\n)*as children/,
  )
  // The page's own entry's id is a placeholder rather than a sentinel, but
  // it's content all the same.
  expect(() =>
    check(island('idle', { id: [0, 'gratis-placeholder-posts'] })),
  ).toThrow(/<Card client:idle>/)
  // A client:visible island passed as a child of a client:only one is still
  // rendered on the server. Astro puts it in a <template>, though, whose
  // content the DOM keeps apart, so the check has to look inside to find it.
  expect(() =>
    check(
      island(
        'only',
        {},
        `<template data-astro-template>${island('visible', { title: [0, '{{gratis:entry:site:title}}'] }).match(/<astro-island.*<\/astro-island>/)![0]}</template>`,
      ),
    ),
  ).toThrow(/<Card client:visible>/)
})

test('content passes into the props of a client:only island, and into the children of any', () => {
  check(island('only', { title: [0, '{{gratis:route:title}}'] }))
  check(
    island(
      'load',
      { summary: [0, 'More'] },
      '<astro-slot><p>{{gratis:route:title}}</p></astro-slot>',
    ),
  )
})

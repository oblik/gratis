// Buckets for tests: a backend with a built site in it, as `astro build` would leave in dist/.

import { memoryBackend } from '../src/emulator/index.ts'

export const json = (value) => JSON.stringify(value, null, 2) + '\n'

// A single page showing the site's title.
export const bucket = () =>
  memoryBackend({
    '_gratis/schema.json': json({
      collections: {
        site: {
          single: true,
          label: 'Site',
          source: 'src/data/site.json',
          fields: { title: { type: 'text', label: 'Title' } },
        },
      },
      routes: {},
    }),
    '_gratis/routes.json': json({
      pages: {
        '/': {
          template: '/',
          file: 'index.html',
          deps: { entries: ['site'], collections: {} },
          updated: '',
        },
      },
      _pending: [],
    }),
    '_gratis/templates/index.html':
      '<!DOCTYPE html><html><head><title>{{gratis:entry:site:title}}</title></head><body><h1>{{gratis:entry:site:title}}</h1></body></html>',
    '_gratis/content/site.json': json({ title: 'Before' }),
    'index.html':
      '<!DOCTYPE html><html><head><title>Before</title></head><body><h1>Before</h1></body></html>',
    'about/index.html': 'about',
  })

// A blog: a home page listing posts by date, and a page per post.
export const blog = () =>
  memoryBackend({
    '_gratis/schema.json': json({
      collections: {
        site: {
          single: true,
          label: 'Site',
          source: 'src/data/site.json',
          fields: { title: { type: 'text', label: 'Title' } },
        },
        posts: {
          single: false,
          label: 'Posts',
          source: 'src/data/posts/',
          fields: {
            title: { type: 'text', label: 'Title' },
            date: { type: 'text', label: 'Date' },
            featured: { type: 'boolean', label: 'Featured' },
          },
        },
      },
      routes: {
        '/blog/[slug]': {
          collection: 'posts',
          param: 'slug',
          file: 'blog/[slug]/index.html',
        },
      },
    }),
    '_gratis/routes.json': json({
      pages: {
        '/': {
          template: '/',
          file: 'index.html',
          deps: {
            entries: ['posts/a', 'site'],
            collections: { posts: ['date'] },
          },
          updated: '',
        },
        '/blog/a': {
          template: '/blog/[slug]',
          file: 'blog/a/index.html',
          entry: 'posts/a',
          deps: { entries: ['posts/a', 'site'], collections: {} },
          updated: '',
        },
      },
      _pending: [],
    }),
    '_gratis/templates/index.html':
      '<!DOCTYPE html><html><head></head><body><ul><!--gratis:each query:posts {"sort":"-date"}--><li><a href="/blog/{{gratis:item:id}}/">{{gratis:item:title}}</a></li><!--/gratis:each--></ul></body></html>',
    '_gratis/templates/blog/[slug].html':
      '<!DOCTYPE html><html><head><title>{{gratis:route:title}} · {{gratis:entry:site:title}}</title></head><body><!--gratis:if route:featured--><p>Featured</p><!--/gratis:if--></body></html>',
    '_gratis/content/site.json': json({ title: 'Blog' }),
    '_gratis/content/posts/a.json': json({
      title: 'A',
      date: '2026-01-01',
      featured: false,
    }),
    'index.html': 'old',
    'blog/a/index.html': 'old',
  })

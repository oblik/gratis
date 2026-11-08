import { boolean, defineCollection, file, glob, text } from 'gratis/astro'

const site = defineCollection({
  single: true,
  loader: file('src/data/site.json'),
  schema: {
    title: text(),
  },
})

const posts = defineCollection({
  loader: glob({ pattern: '*.json', base: 'src/data/posts' }),
  schema: {
    title: text(),
    date: text(),
    featured: boolean(),
    body: text({ multiline: true }),
  },
})

const links = defineCollection({
  loader: file('src/data/links.json'),
  schema: {
    title: text(),
    url: text({ label: 'URL' }),
  },
})

export const collections = { site, posts, links }

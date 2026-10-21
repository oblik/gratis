import { defineCollection, file, text } from 'gratis/astro';

const site = defineCollection({
  single: true,
  loader: file('src/data/site.json'),
  schema: {
    title: text(),
  },
});

export const collections = { site };

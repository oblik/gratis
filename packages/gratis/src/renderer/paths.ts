// The template id is the route pattern with the locale segment removed; `/` for the root.
export const templateId = (pattern: string) => pattern.replace(/\/\[(\.\.\.)?lang\]/, '') || '/';

// Where a template lives under _gratis/templates/: `/` is index.html, `/blog/[slug]` is blog/[slug].html.
export const templateFile = (id: string) => (id === '/' ? 'index' : id.slice(1)) + '.html';

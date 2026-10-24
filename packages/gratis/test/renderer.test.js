import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { render } from '../src/renderer/index.ts';

const { DOMParser } = new JSDOM('').window;
const template = '<!DOCTYPE html><html><head><meta property="og:title" content="{{gratis:entry:site:title}}"><title>{{gratis:entry:site:title}} · Home</title></head><body><h1>{{gratis:entry:site:title}}</h1></body></html>';

test('fills text nodes, attributes and <title>, escaping through the DOM', () => {
  const { html, deps } = render(template, { content: { site: { title: 'A & B <i>"q"</i>' } } }, { DOMParser });
  assert.equal(html, '<!DOCTYPE html><html><head><meta property="og:title" content="A &amp; B <i>&quot;q&quot;</i>"><title>A &amp; B &lt;i&gt;"q"&lt;/i&gt; · Home</title></head><body><h1>A &amp; B &lt;i&gt;"q"&lt;/i&gt;</h1></body></html>');
  assert.deepEqual(deps, { entries: ['site'], collections: {} });
});

test('a missing value renders empty', () => {
  const { html } = render(template, { content: {} }, { DOMParser });
  assert.match(html, /<h1><\/h1>/);
});

test('rejects markers it cannot render yet', () => {
  assert.throws(() => render('<ul><!--gratis:each entry:site:nav--><li></li><!--/gratis:each--></ul>', { content: {} }, { DOMParser }), /not supported yet/);
});

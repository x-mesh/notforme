import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({ URL, location: { hostname: 'news.example.com', origin: 'https://news.example.com', pathname: '/news', search: '', href: 'https://news.example.com/news' }, document: { querySelector: () => null } });
vm.runInContext(readFileSync(new URL('../extension/src/adapters.js', import.meta.url), 'utf8'), context);
const adapter = vm.runInContext('nfPickAdapter()', context);
assert.equal(adapter.name, 'common');
function card({ href = '/article/123?utm_source=feed', nav = false, body = false, nested = false, titles = 1 } = {}) {
  const link = { getAttribute: () => href };
  const heading = { textContent: '신제품 출시와 기능을 소개합니다', closest: () => link };
  return { closest: () => nav ? {} : null, querySelectorAll: () => Array(titles).fill(heading), querySelector: (selector) => {
    if (selector.includes('articleBody')) return body ? {} : null;
    if (selector.startsWith('article,')) return nested ? {} : null;
    if (selector.startsWith('p')) return { textContent: '요약 '.repeat(100) };
    return null;
  } };
}
const result = adapter.extract(card());
assert.equal(result.id, 'common:https://news.example.com/article/123');
assert.equal(result.summary.length, 200);
for (const options of [{ nav: true }, { body: true }, { nested: true }, { titles: 0 }, { href: 'https://other.example.com/article/123' }, { href: '/news' }]) assert.equal(adapter.extract(card(options)), null);
context.document.querySelector = () => ({});
assert.equal(adapter.extract(card()), null, 'article body pages are excluded');
console.log('common adapter tests passed');

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync(new URL('../extension/src/adapters.js', import.meta.url), 'utf8');
const sites = [
  ['www.hankyung.com', '/all-news', '/article/202610294210i', 'hankyung'],
  ['www.donga.com', '/news/List', '/news/Economy/article/all/20261029/134934698/1', 'donga'],
  ['www.yna.co.kr', '/news', '/view/AKR20261029182600003', 'yonhap'],
  ['www.hani.co.kr', '/arti', '/arti/society/society_general/1284848.html', 'hani'],
  ['www.khan.co.kr', '/newest/articles', '/article/202610291716011', 'khan'],
];
for (const [hostname, pathname, article, name] of sites) {
  const context = vm.createContext({ URL, location: { hostname, pathname, href: `https://${hostname}${pathname}` } });
  vm.runInContext(source, context);
  const adapter = vm.runInContext('nfPickAdapter()', context);
  assert.equal(adapter.name, name);
  let href = article + '?source=list';
  const link = { getAttribute: () => href, textContent: '기사 제목' };
  const element = { querySelector: (selector) => selector === adapter.linkSelector ? link : selector.startsWith('a') || selector.endsWith(' a') || selector.includes(' > a') ? link : { textContent: selector.includes('title') ? '기사 제목' : '요약 '.repeat(100) } };
  const record = adapter.extract(element);
  assert.equal(record.id, `${name}:${article}`);
  assert.ok(record.title.length > 0 && record.title.length <= 140);
  assert.ok(record.summary.length <= 200);
  href = 'https://example.com' + article;
  assert.equal(adapter.extract(element), null);
  href = '/not-an-article';
  assert.equal(adapter.extract(element), null);
  assert.equal(adapter.extract({ querySelector: () => null }), null);
  context.location.pathname = article;
  assert.equal(vm.runInContext('nfPickAdapter().name', context), "common", "unsupported routes use the common extractor");
}
console.log('adapter tests passed');

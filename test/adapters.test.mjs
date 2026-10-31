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
  ['www.edaily.co.kr', '/', '/News/Read?newsId=02466566645618496&mediaCodeNo=257', 'edaily', 'edaily:02466566645618496'],
  ['www.etnews.com', '/', '/20261031000026', 'etnews'],
  ['www.bloter.net', '/', '/news/articleView.html?idxno=677299', 'bloter'],
  ['www.digitaltoday.co.kr', '/', '/news/articleView.html?idxno=711129', 'digitaltoday'],
  ['www.techm.kr', '/', '/news/articleView.html?idxno=156706', 'techm'],
  ['www.boannews.com', '/', '/news/articleView.html?idxno=146900', 'boannews'],
  ['www.dailysecu.com', '/', '/news/articleView.html?idxno=209198', 'dailysecu'],
  ['www.aitimes.com', '/', '/news/articleView.html?idxno=216840', 'aitimes'],
  ['www.ddaily.co.kr', '/', '/page/view/2026103022462437117', 'ddaily'],
  ['www.venturesquare.net', '/', '/1124534/', 'venturesquare'],
  ['platum.kr', '/', '/archives/297157', 'platum'],
];
for (const [hostname, pathname, article, name, expectedId = `${name}:${article}`] of sites) {
  const context = vm.createContext({ URL, location: { hostname, pathname, href: `https://${hostname}${pathname}` } });
  vm.runInContext(source, context);
  const adapter = vm.runInContext('nfPickAdapter()', context);
  assert.equal(adapter.name, name);
  let href = article;
  const link = { getAttribute: () => href, textContent: '검증용 기사 제목' };
  const element = { getAttribute: () => href, textContent: '검증용 기사 제목', querySelector: (selector) => selector === adapter.linkSelector ? link : selector.startsWith('a') || selector.endsWith(' a') || selector.includes(' > a') ? link : { textContent: selector.includes('title') ? '검증용 기사 제목' : '요약 '.repeat(100) } };
  const record = adapter.extract(element);
  assert.equal(record.id, expectedId);
  assert.ok(record.title.length > 0 && record.title.length <= 140);
  assert.ok(record.summary.length <= 200);
  href = 'https://example.com' + article;
  assert.equal(adapter.extract(element), null);
  href = '/not-an-article';
  assert.equal(adapter.extract(element), null);
  assert.equal(adapter.extract({ getAttribute: () => null, querySelector: () => null }), null);
  context.location.pathname = article;
  assert.equal(vm.runInContext('nfPickAdapter().name', context), "common", "unsupported routes use the common extractor");
}
console.log('adapter tests passed');

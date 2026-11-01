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
  ['www.yna.co.kr', '/', '/view/AKR20261031034400003?section=industry/all', 'yonhap', 'yonhap:/view/AKR20261031034400003'],
  ['www.hani.co.kr', '/', '/arti/politics/politics_general/1285130.html', 'hani'],
  ['www.khan.co.kr', '/', '/article/202610311716011', 'khan'],
  ['www.hankyung.com', '/', '/article/2026103176667', 'hankyung'],
  ['www.donga.com', '/', '/news/It/article/all/20261031/134942839/2', 'donga'],
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
  assert.equal(record.visualTarget, element, "list and anchor adapters retain the complete discovered row when no broader card exists");
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

{
  const context = vm.createContext({ URL, location: { hostname: 'www.etnews.com', pathname: '/', href: 'https://www.etnews.com/' } });
  vm.runInContext(source, context);
  const adapter = vm.runInContext('nfPickAdapter()', context);
  const articleLink = {
    getAttribute: () => '/20261031000026',
    querySelector: () => ({ textContent: '완전한 기사 카드 제목입니다' }),
  };
  const otherLink = { getAttribute: () => '/20261031000027' };
  const card = {
    querySelectorAll: () => [articleLink],
  };
  articleLink.closest = () => card;
  assert.equal(adapter.extract(articleLink).visualTarget, card, 'single article cards use the complete card');

  const grouped = {
    querySelectorAll: () => [articleLink, otherLink],
  };
  articleLink.closest = () => grouped;
  assert.equal(adapter.extract(articleLink).visualTarget, articleLink, 'grouped ancestors fall back to the source anchor');

  const malformedLink = { getAttribute: () => 'https://[' };
  articleLink.closest = () => ({ querySelectorAll: () => [articleLink, malformedLink] });
  assert.equal(adapter.extract(articleLink).id, 'etnews:/20261031000026', 'malformed sibling links do not stop extraction');
}
console.log('adapter visual target tests passed');

{
  const context = vm.createContext({ URL, location: { hostname: 'www.venturesquare.net', pathname: '/', href: 'https://www.venturesquare.net/' } });
  vm.runInContext(source, context);
  const adapter = vm.runInContext('nfPickAdapter()', context);
  const link = {
    getAttribute: () => 'https://www.venturesquare.net/1124534/',
    querySelector: () => ({ textContent: '검증하지 않은 카드의 기사 제목입니다' }),
    closest: () => ({ querySelectorAll: () => [link] }),
  };
  assert.equal(adapter.extract(link).visualTarget, link, 'sites without a verified card selector stay at the article link');
}
console.log('adapter unverified card fallback tests passed');

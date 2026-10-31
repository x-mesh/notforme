// Site adapters. Each adapter finds article rows and extracts a compact record.
// Add a new site by pushing another object to NF_ADAPTERS and adding its match pattern to manifest.json.
const nfListAdapter = ({ name, host, path, itemSelector, linkSelector, titleSelector, summarySelector, articlePattern }) => ({
  name,
  match: (hostname) => hostname === host && path.test(location.pathname),
  itemSelector,
  extract(el) {
    const link = el.querySelector(linkSelector);
    if (!link) return null;
    const url = new URL(link.getAttribute("href"), location.href);
    if (url.hostname !== host || !articlePattern.test(url.pathname)) return null;
    const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
    const title = clean((titleSelector ? el.querySelector(titleSelector) : link)?.textContent);
    if (!title) return null;
    return {
      id: `${name}:${url.pathname}`,
      title: title.slice(0, 140),
      summary: clean(el.querySelector(summarySelector)?.textContent).slice(0, 200),
    };
  },
});

const nfAnchorAdapter = ({ name, host, itemSelector, articlePattern, titleSelector = "h1, h2, h3, h4, strong, .v2-sp__title, .tptn_title", summarySelector }) => ({
  name,
  match: (hostname) => hostname === host && location.pathname === "/",
  itemSelector,
  extract(el) {
    const href = el.getAttribute("href");
    if (!href) return null;
    const url = new URL(href, location.href);
    const canonical = new URL(url);
    canonical.searchParams.delete("source");
    if (url.hostname !== host || !articlePattern.test(canonical.pathname + canonical.search)) return null;
    const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
    const title = clean(el.querySelector(titleSelector)?.textContent || el.textContent);
    if (title.length < 8) return null;
    return {
      id: name + ":" + canonical.pathname + canonical.search,
      title: title.slice(0, 140),
      summary: clean(el.querySelector(summarySelector)?.textContent).slice(0, 200),
    };
  },
});

const NF_ADAPTERS = [
  nfAnchorAdapter({
    name: "etnews", host: "www.etnews.com", itemSelector: 'a[href^="/20"]',
    articlePattern: /^\/[0-9]{14}$/,
  }),
  nfAnchorAdapter({
    name: "bloter", host: "www.bloter.net", itemSelector: 'a[href^="/news/articleView.html?idxno="]',
    articlePattern: /^\/news\/articleView\.html\?idxno=[0-9]+$/, summarySelector: ".auto-sums",
  }),
  nfAnchorAdapter({
    name: "digitaltoday", host: "www.digitaltoday.co.kr", itemSelector: 'a[href^="/news/articleView.html?idxno="]',
    articlePattern: /^\/news\/articleView\.html\?idxno=[0-9]+$/, summarySelector: ".auto-sums",
  }),
  nfAnchorAdapter({
    name: "techm", host: "www.techm.kr", itemSelector: 'a[href^="/news/articleView.html?idxno="]',
    articlePattern: /^\/news\/articleView\.html\?idxno=[0-9]+$/, summarySelector: ".auto-sums",
  }),
  nfAnchorAdapter({
    name: "boannews", host: "www.boannews.com", itemSelector: 'a[href*="/news/articleView.html?idxno="]',
    articlePattern: /^\/news\/articleView\.html\?idxno=[0-9]+$/, summarySelector: ".auto-sums",
  }),
  nfAnchorAdapter({
    name: "dailysecu", host: "www.dailysecu.com", itemSelector: 'a[href*="/news/articleView.html?idxno="]',
    articlePattern: /^\/news\/articleView\.html\?idxno=[0-9]+$/, summarySelector: ".auto-sums",
  }),
  nfAnchorAdapter({
    name: "aitimes", host: "www.aitimes.com", itemSelector: 'a[href*="/news/articleView.html?idxno="]',
    articlePattern: /^\/news\/articleView\.html\?idxno=[0-9]+$/, summarySelector: ".auto-sums",
  }),
  nfAnchorAdapter({
    name: "ddaily", host: "www.ddaily.co.kr", itemSelector: 'a[href^="/page/view/"]',
    articlePattern: /^\/page\/view\/[0-9]{19}$/,
  }),
  nfAnchorAdapter({
    name: "venturesquare", host: "www.venturesquare.net", itemSelector: 'a[href^="https://www.venturesquare.net/"]',
    articlePattern: /^\/[0-9]+\/$/,
  }),
  nfAnchorAdapter({
    name: "platum", host: "platum.kr", itemSelector: 'a[href^="https://platum.kr/archives/"]',
    articlePattern: /^\/archives\/[0-9]+$/,
  }),
  nfListAdapter({
    name: "hankyung", host: "www.hankyung.com", path: /^\/all-news\/?$/,
    itemSelector: "li[data-aid]", linkSelector: "h2.news-tit a",
    summarySelector: ".news-item .txt-cont p:not(.txt-date)", articlePattern: /^\/article\/[0-9]+[a-z]?$/,
  }),
  nfListAdapter({
    name: "donga", host: "www.donga.com", path: /^\/news\/List\/?$/,
    itemSelector: "article.news_card", linkSelector: "h4.tit a",
    summarySelector: "p.desc", articlePattern: /^\/news\/[^/]+\/article\/all\/[0-9]+\/[0-9]+\/[0-9]+\/?$/,
  }),
  nfListAdapter({
    name: "yonhap", host: "www.yna.co.kr", path: /^\/news\/?$/,
    itemSelector: "ul.list01 > li[data-cid]", linkSelector: "a.tit-news",
    summarySelector: "p.lead", articlePattern: /^\/view\/AKR[0-9]+$/,
  }),
  nfListAdapter({
    name: "hani", host: "www.hani.co.kr", path: /^\/arti\/?$/,
    itemSelector: 'li[class*="ArticleList_item__"]',
    linkSelector: 'a[class*="BaseArticleCard_link__"]', titleSelector: '[class*="BaseArticleCard_title__"]',
    summarySelector: 'p[class*="BaseArticleCard_prologue__"]', articlePattern: /^\/arti\/.+\/[0-9]+\.html$/,
  }),
  nfListAdapter({
    name: "khan", host: "www.khan.co.kr", path: /^\/newest\/articles\/?$/,
    itemSelector: ".list > ul > li", linkSelector: 'article > div > a[href*="/article/"]',
    summarySelector: "p.desc", articlePattern: /^\/article\/[0-9]+$/,
  }),
  {
    name: "edaily",
    match: (host) => host === "www.edaily.co.kr" && location.pathname === "/",
    itemSelector: "a.newsbox_md, a.newsbox_sm",
    extract(el) {
      const href = el.getAttribute("href");
      if (!href) return null;
      const url = new URL(href, location.href);
      if (url.hostname !== "www.edaily.co.kr" || url.pathname !== "/News/Read" || !/^\d+$/.test(url.searchParams.get("newsId") || "") || !/^\d+$/.test(url.searchParams.get("mediaCodeNo") || "")) return null;
      const title = (el.querySelector("p.title_md, p.title_sm")?.textContent || "").replace(/\s+/g, " ").trim();
      if (!title) return null;
      return { id: `edaily:${url.searchParams.get("newsId")}`, title: title.slice(0, 140), summary: "" };
    },
  },
  {
    name: "zdnet",
    match: (host) => host === "zdnet.co.kr" || host.endsWith(".zdnet.co.kr"),
    itemSelector: ".newsPost",
    extract(el) {
      const link = el.querySelector('a[href*="/view/"]');
      if (!link) return null;
      const url = new URL(link.getAttribute("href"), location.href);
      const idMatch = url.search.match(/[?&]no=(\d+)/);
      const id = idMatch ? idMatch[1] : url.pathname + url.search;

      const clean = (s) => (s || "").replace(/\s+/g, " ").trim();
      const heading = el.querySelector("h2, h3, h4");
      const title = clean(heading ? heading.textContent : el.querySelector(".assetText a")?.textContent);
      if (!title) return null;

      let summary = clean(el.querySelector(".assetText p:not(.byline)")?.textContent);
      if (!summary) {
        const byline = clean(el.querySelector(".byline")?.textContent);
        summary = clean(el.textContent).replace(title, "").replace(byline, "").trim();
      }
      return { id, title: title.slice(0, 140), summary: summary.slice(0, 200) };
    },
  },
];

const NF_COMMON_ADAPTER = {
  name: "common",
  itemSelector: "article, li:has(h2), li:has(h3), li:has(h4)",
  extract(el) {
    if (el.closest("nav, header, footer, aside, [role=navigation]")) return null;
    if (el.querySelector("h1, [itemprop=articleBody]")) return null;
    if (document.querySelector("[itemprop=articleBody]")) return null;
    const headings = [...el.querySelectorAll("h2, h3, h4")];
    const links = headings.map((heading) => heading.closest("a[href]") || heading.querySelector("a[href]"));
    if (!links.length || links.some((link) => !link)) return null;
    const urls = links.map((link) => new URL(link.getAttribute("href"), location.href));
    if (urls.some((url) => url.origin !== location.origin || url.pathname === location.pathname && url.search === location.search)) return null;
    if (new Set(urls.map((url) => url.pathname + url.search)).size !== 1) return null;
    if (el.querySelector("article, li:has(h2), li:has(h3), li:has(h4)")) return null;
    const url = urls[0];
    if (!/^https?:$/.test(url.protocol)) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_")) url.searchParams.delete(key);
    }
    const clean = (text) => (text || "").replace(/\s+/g, " ").trim();
    const title = clean(headings[0].textContent);
    if (title.length < 8) return null;
    return {
      id: `common:${url.href}`,
      title: title.slice(0, 140),
      summary: clean(el.querySelector("p:not(.byline)")?.textContent).slice(0, 200),
    };
  },
};

function nfPickAdapter() {
  return NF_ADAPTERS.find((a) => a.match(location.hostname)) || NF_COMMON_ADAPTER;
}

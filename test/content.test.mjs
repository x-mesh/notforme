import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

let settings = { mode: "collapse" };
let changed;
const listeners = {};
const parts = Object.fromEntries([".nf-tag", ".nf-title", ".nf-toggle"].map((key) => [key, { textContent: "" }]));
let stub;
let panel;
const classes = new Set();
const el = {
  dataset: {},
  classList: {
    add: (...names) => names.forEach((name) => classes.add(name)),
    remove: (...names) => names.forEach((name) => classes.delete(name)),
    contains: (name) => classes.has(name),
    toggle: (name) => { if (classes.has(name)) { classes.delete(name); return false; } classes.add(name); return true; },
  },
  querySelector: () => stub,
  prepend: (value) => { stub = value; },
  append: (value) => { panel = value; },
};
const document = {
  body: {},
  querySelectorAll: () => [el],
  createElement: (tag) => {
    if (tag !== "button") {
      let value = "";
      const node = {
        dataset: {}, className: "", children: [],
        get textContent() { return value + this.children.map((child) => child.textContent).join(""); },
        set textContent(text) { value = text; this.children = []; },
        append(...children) { this.children.push(...children); },
        querySelector(selector) {
          for (const child of this.children) {
            if (child.className.split(" ").includes(selector.slice(1))) return child;
            const nested = child.querySelector(selector);
            if (nested) return nested;
          }
          return null;
        },
        remove() { panel = null; },
      };
      return node;
    }
    assert.equal(tag, "button");
    return { setAttribute: () => {}, querySelector: (key) => parts[key], addEventListener: (name, fn) => { listeners[name] = fn; }, remove: () => { stub = null; } };
  },
};
vm.runInNewContext(readFileSync(new URL("../extension/src/content.js", import.meta.url), "utf8"), {
  document, MutationObserver: class { observe() {} },
  setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {},
  nfPickAdapter: () => ({ itemSelector: "article", extract: () => ({ id: "ad", title: "[PR] 행사", summary: "" }) }),
  chrome: {
    storage: { sync: { get: async (defaults) => ({ ...defaults, ...settings }) }, onChanged: { addListener: (fn) => { changed = fn; } } },
    runtime: { getURL: (path) => `chrome-extension://test/${path}`, onMessage: { addListener: () => {} }, sendMessage: () => { throw new Error("Local PR tags must not call API"); } },
  },
});
const settle = () => new Promise((resolve) => setImmediate(resolve));
await settle();
for (const [mode, className] of [["collapse", "nf-collapsed"], ["blur", "nf-blur"], ["dim", "nf-dim"], ["remove", "nf-removed"]]) {
  settings.mode = mode;
  await changed({}, "sync");
  await settle();
  assert.ok(classes.has(className), mode);
  assert.equal(classes.size, 1);
  if (mode !== "remove") {
    listeners.click({ preventDefault() {} });
    assert.ok(classes.has("nf-open"));
  }
}
settings.debug = true;
await changed({ debug: {} }, "sync");
await settle();
assert.ok(classes.has("nf-collapsed"));
assert.ok(!classes.has("nf-removed"));
assert.match(panel.textContent, /NotForMe 디버그/);
assert.equal(panel.querySelector(".nf-debug-icon").src, "chrome-extension://test/icons/icon-32.png");
assert.equal(panel.querySelector(".nf-debug-metrics").children.length, 5);
assert.match(panel.textContent, /로컬 규칙/);
assert.match(panel.textContent, /광고성 PR 1.000/);
assert.match(panel.textContent, /현재 기준: 0.80/);
assert.equal(panel.dataset.nfStyle, "lens");
panel.querySelector(".nf-debug-details").open = true;
settings.debugStyle = "strip";
await changed({ debugStyle: {} }, "sync");
await settle();
assert.equal(panel.dataset.nfStyle, "strip");
assert.equal(panel.querySelector(".nf-debug-details").open, true, "changing style preserves expanded details");
assert.match(panel.textContent, /광고성 PR 1.000/);

settings.debug = false;
await changed({ debug: {} }, "sync");
await settle();
assert.equal(panel, null);
assert.ok(classes.has("nf-removed"));
settings.enabled = false;
await changed({}, "sync");
await settle();
assert.equal(classes.size, 0);
assert.equal(el.dataset.nfReason, undefined);
console.log("content display mode tests passed");

el.dataset = {};
classes.clear();
stub = null;
settings = { debug: true };
let requests = 0;
let remoteResult = { ok: false, error: "Jev API HTTP 401" };
vm.runInNewContext(readFileSync(new URL("../extension/src/content.js", import.meta.url), "utf8"), {
  document, MutationObserver: class { observe() {} },
  setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {},
  nfPickAdapter: () => ({ itemSelector: "article", extract: () => ({ id: "remote", title: "게임 OST 공개", summary: "출시 홍보" }) }),
  chrome: {
    storage: { sync: { get: async (defaults) => ({ ...defaults, ...settings }) }, onChanged: { addListener: (fn) => { changed = fn; } } },
    runtime: { getURL: (path) => `chrome-extension://test/${path}`, onMessage: { addListener: () => {} }, sendMessage: async (message) => { if (message.badge) return { ok: true }; requests++; return JSON.parse(JSON.stringify(remoteResult)); } },
  },
});
await settle();
assert.match(panel.textContent, /미판정: Jev API HTTP 401/);
assert.match(panel.textContent, /표시 유지/);
settings.debugStyle = "strip";
await changed({ debugStyle: {} }, "sync");
await settle();
assert.equal(requests, 1, "debug style must not retry a failed API call");
settings.debug = false;
await changed({ debug: {} }, "sync");
await settle();
assert.equal(requests, 1, "debug toggle must not retry a failed API call");
assert.equal(panel, null);
console.log("debug error and toggle tests passed");

{
  el.dataset = {};
  classes.clear();
  stub = null;
  settings = { debug: true };
  let resolveRequest;
  vm.runInNewContext(readFileSync(new URL("../extension/src/content.js", import.meta.url), "utf8"), {
    document, MutationObserver: class { observe() {} },
    setTimeout: (fn) => { fn(); return 1; }, clearTimeout: () => {},
    nfPickAdapter: () => ({ itemSelector: "article", extract: () => ({ id: "pending", title: "판정 대기 중인 기사", summary: "" }) }),
    chrome: {
      storage: { sync: { get: async (defaults) => ({ ...defaults, ...settings }) }, onChanged: { addListener: () => {} } },
      runtime: { getURL: (path) => path, onMessage: { addListener: () => {} }, sendMessage: (message) => message.badge ? Promise.resolve({ ok: true }) : new Promise((resolve) => { resolveRequest = resolve; }) },
    },
  });
  await settle();
  assert.match(panel.textContent, /판정 중/, "in-flight requests update the debug card before the response");
  assert.doesNotMatch(panel.textContent, /요청 대기/);
  resolveRequest({ ok: true, results: { pending: { kind: { news: 1 }, source: "model" } } });
  await settle();
  assert.match(panel.textContent, /표시 유지/);
}
console.log("debug in-flight status tests passed");


settings = { debug: true, hideAd: false, hideOffTopic: true, topics: ["자동차"], hideExcludedTopic: true, excludedTopics: ["전기차"] };
remoteResult = { ok: true, results: { remote: { kind: { news: 1 }, topic: { on_topic: 1 }, excludedTopic: { on_topic: 1 }, source: "model" } } };
await changed({ topics: {}, excludedTopics: {} }, "sync");
await settle();
assert.equal(el.dataset.nfReason, "excludedTopic", "exclusion wins even when the article matches a kept topic");
assert.match(panel.textContent, /제외 주제/);
settings.excludedTopics = ["게임"];
remoteResult.results.remote.excludedTopic = { off_topic: 1 };
await changed({ excludedTopics: {} }, "sync");
await settle();
assert.equal(el.dataset.nfReason, undefined, "keep matching articles outside excluded topics");
settings.hideOffTopic = false;
remoteResult.results.remote.excludedTopic = { on_topic: 1 };
await changed({ hideOffTopic: {} }, "sync");
await settle();
assert.equal(el.dataset.nfReason, "excludedTopic", "exclusion works without a keep filter");
console.log("topic filter tests passed");

const contentSource = readFileSync(new URL("../extension/src/content.js", import.meta.url), "utf8");
const makeContentHarness = ({ withObserver = true, items: initialItems = [], settings: initialSettings = { mode: "remove" }, failFirstBatch = false, viewport = false } = {}) => {
  const items = [...initialItems];
  const calls = [];
  let settingsValue = { enabled: true, hideAd: true, hideProduct: false, hideOffTopic: false, hideExcludedTopic: false, topics: [], excludedTopics: [], debug: false, threshold: 0.8, ...initialSettings };
  let mutationCallback;
  let messageCallback;
  let observer;
  const node = (name) => ({ name, dataset: {}, classList: { values: new Set(), add(...values) { values.forEach((value) => this.values.add(value)); }, remove(...values) { values.forEach((value) => this.values.delete(value)); }, toggle(value) { if (this.values.has(value)) { this.values.delete(value); return false; } this.values.add(value); return true; } }, querySelector: (selector) => selector === ".nf-tag" || selector === ".nf-title" || selector === ".nf-toggle" ? { textContent: "" } : null, setAttribute: () => {}, addEventListener: () => {}, prepend: () => {}, append: () => {} });
  for (const item of items) { item.node ??= node(item.id); item.record.visualTarget ??= node(`${item.id}-target`); }
  const targets = new Set(items.map((item) => item.record.visualTarget));
  const document = {
    body: {},
    querySelectorAll: (selector) => selector === "article" ? items.map((item) => item.node) : selector === "[data-nf-reason]" ? [...targets].filter((target) => target.dataset.nfReason) : selector === "[data-nf-id]" ? [...targets].filter((target) => target.dataset.nfId) : [],
    createElement: (tag) => node(tag),
  };
  class MutationObserverFake { constructor(callback) { mutationCallback = callback; } observe() {} }
  class IntersectionObserverFake {
    constructor(callback, options) { this.callback = callback; this.options = options; this.targets = new Set(); observer = this; }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    trigger(intersecting) { this.callback(intersecting.map((target) => ({ target, isIntersecting: true }))); }
  }
  const context = {
    URL, ...(viewport ? { innerHeight: 800, innerWidth: 1200 } : {}), location: { href: "https://example.com/" }, document, MutationObserver: MutationObserverFake, ...(withObserver ? { IntersectionObserver: IntersectionObserverFake } : {}), setTimeout: (callback) => { callback(); return 1; }, clearTimeout: () => {},
    nfPickAdapter: () => ({ itemSelector: "article", extract: (element) => items.find((item) => item.node === element)?.record || null }),
    chrome: {
      storage: { sync: { get: async (defaults) => ({ ...defaults, ...settingsValue }), set: async (value) => { settingsValue = { ...settingsValue, ...value }; await context.changed(Object.fromEntries(Object.keys(value).map((key) => [key, {}])), "sync"); } }, onChanged: { addListener: (callback) => { context.changed = callback; } } },
      runtime: { getURL: (path) => path, onMessage: { addListener: (callback) => { messageCallback = callback; } }, sendMessage: async (message) => { if (message.badge) return { ok: true }; calls.push(message); if (failFirstBatch && calls.length === 1) return { ok: false, error: "batch failed" }; return { ok: true, results: Object.fromEntries(message.items.map((item) => [item.id, { kind: { ad_pr: 1 }, topic: message.topics.length ? { off_topic: 1 } : null, excludedTopic: message.excludedTopics.length ? { on_topic: 1 } : null, source: "model" }])) }; } },
    },
  };
  vm.runInNewContext(contentSource, context);
  return {
    items, targets, calls,
    async settle() { await new Promise((resolve) => setImmediate(resolve)); },
    observer: () => observer,
    add(item) { item.node ??= node(item.id); item.record.visualTarget ??= node(`${item.id}-target`); items.push(item); targets.add(item.record.visualTarget); mutationCallback(); },
    setSettings(next) { settingsValue = { ...settingsValue, ...next }; },
    changed(changes, area = "sync") { return context.changed(changes, area); },
    stats() { let response; messageCallback({ type: "stats" }, {}, (value) => { response = value; }); return response; },
  };
};
const contentItem = (id, title = `기사 ${id}`, url = "") => ({ id, record: { id, title, summary: `요약 ${id}`, url, visualTarget: nodeForTest(id) } });
function nodeForTest(name) { return { name, dataset: {}, classList: { add() {}, remove() {}, toggle() { return false; } }, querySelector: () => null, setAttribute() {}, addEventListener() {}, prepend() {}, append() {} }; }

{
  const harness = makeContentHarness({ items: [contentItem("offscreen")] });
  await harness.settle();
  assert.equal(harness.calls.length, 0, "offscreen articles wait for intersection");
  assert.equal(harness.observer().options.root, null);
  assert.equal(harness.observer().options.rootMargin, "100% 0px");
  assert.equal(harness.observer().options.threshold, 0);
  const target = [...harness.targets][0];
  harness.observer().trigger([target]);
  harness.observer().trigger([target]);
  await harness.settle();
  assert.equal(harness.calls.length, 1, "repeated intersections queue one request");
  assert.equal([...harness.calls[0].items].map((item) => item.id).join(","), "offscreen");
  assert.equal(harness.observer().targets.has(target), false, "classified targets leave the observer");
}
console.log("content visibility deferral tests passed");

{
  const visible = contentItem("visible-without-observer-event");
  visible.record.visualTarget.getBoundingClientRect = () => ({ top: 100, bottom: 200, left: 0, right: 500, width: 500, height: 100 });
  const offscreen = contentItem("still-offscreen");
  offscreen.record.visualTarget.getBoundingClientRect = () => ({ top: 3000, bottom: 3100, left: 0, right: 500, width: 500, height: 100 });
  const harness = makeContentHarness({ items: [visible, offscreen], viewport: true });
  await harness.settle();
  assert.equal(harness.calls.length, 1, "visible articles are queued without an observer callback");
  assert.equal(harness.calls[0].items[0].id, "visible-without-observer-event");
  assert.ok(harness.observer().targets.has(offscreen.record.visualTarget), "distant articles remain deferred");
}
console.log("content visible fallback tests passed");

{
  const first = contentItem("duplicate");
  const second = contentItem("duplicate");
  const harness = makeContentHarness({ items: [first, second] });
  await harness.settle();
  harness.observer().trigger([...harness.targets]);
  await harness.settle();
  assert.equal(harness.calls.length, 1, "duplicate cards use one request");
  assert.equal(first.record.visualTarget.dataset.nfId, "duplicate");
  assert.equal(second.record.visualTarget.dataset.nfId, "duplicate");
  assert.equal(first.record.visualTarget.dataset.nfReason, "ad");
  assert.equal(second.record.visualTarget.dataset.nfReason, "ad");
}
console.log("content duplicate target tests passed");

{
  const first = contentItem("existing");
  const harness = makeContentHarness({ items: [first] });
  await harness.settle();
  const dynamic = contentItem("dynamic");
  harness.add(dynamic);
  await harness.settle();
  assert.equal(harness.calls.length, 0, "dynamic offscreen cards wait for intersection");
  assert.ok(harness.observer().targets.has(dynamic.record.visualTarget), "dynamic cards enter the observer");
  harness.observer().trigger([dynamic.record.visualTarget]);
  await harness.settle();
  assert.equal(harness.calls.length, 1);
  assert.equal(harness.calls[0].items[0].id, "dynamic");
}
console.log("content dynamic target tests passed");

{
  const local = contentItem("local", "[PR] 로컬 규칙 기사");
  const harness = makeContentHarness({ items: [local] });
  await harness.settle();
  assert.equal(harness.calls.length, 0, "local PR rules classify before intersection");
  assert.equal(local.record.visualTarget.dataset.nfReason, "ad");
}
console.log("content local rule tests passed");

{
  const local = contentItem("local-topic", "[PR] 주제 판정 유지 기사");
  const harness = makeContentHarness({ items: [local], settings: { mode: "remove", hideAd: false, hideOffTopic: true, topics: ["AI"] } });
  await harness.settle();
  harness.observer().trigger([local.record.visualTarget]);
  await harness.settle();
  assert.equal(harness.calls.length, 1, "local PR articles request enabled topic fields once");
  assert.equal(local.record.visualTarget.dataset.nfReason, "offTopic");
  await harness.changed({ threshold: {} }, "sync");
  await harness.settle();
  assert.equal(harness.calls.length, 1, "display-only settings preserve local article topic results");
  assert.equal(local.record.visualTarget.dataset.nfReason, "offTopic");
}
console.log("content local topic preservation tests passed");

{
  const hate = contentItem("hate", "특정 집단을 향한 혐오 표현 확산");
  const harness = makeContentHarness({ items: [hate], settings: { mode: "remove", hideAd: false, hideExcludedTopic: true, excludedTopics: ["혐오"] } });
  await harness.settle();
  harness.observer().trigger([hate.record.visualTarget]);
  await harness.settle();
  assert.deepEqual([...harness.calls[0].excludedTopics], ["혐오"]);
  assert.equal(hate.record.visualTarget.dataset.nfReason, "excludedTopic", "Unicode excluded topics hide matching articles");
}
console.log("content Unicode excluded topic tests passed");

{
  const hate = contentItem("hate-keep", "혐오 범죄 방지 정책");
  const harness = makeContentHarness({ items: [hate], settings: { mode: "remove", hideAd: false, hideOffTopic: true, topics: ["혐오"] } });
  await harness.settle();
  harness.observer().trigger([hate.record.visualTarget]);
  await harness.settle();
  assert.deepEqual([...harness.calls[0].topics], ["혐오"]);
  assert.equal(hate.record.visualTarget.dataset.nfReason, "offTopic", "Unicode keep topics consume the model topic result");
}
console.log("content Unicode keep topic tests passed");

{
  const url = "https://example.com/news/123?utm_source=test";
  const keep = contentItem("manual-keep", "모델이 PR로 분류한 기사", url);
  const hide = contentItem("manual-hide", "모델이 일반 뉴스로 분류한 기사", "https://example.com/news/456");
  const harness = makeContentHarness({ items: [keep, hide], settings: { mode: "remove", userOverrides: { "https://example.com/news/123": "keep", "https://example.com/news/456": "hide" } } });
  await harness.settle();
  assert.equal(harness.calls.length, 0, "URL overrides skip remote classification");
  assert.equal(keep.record.visualTarget.dataset.nfReason, undefined, "keep overrides any model decision");
  assert.equal(hide.record.visualTarget.dataset.nfReason, "manual", "hide overrides any model decision");
}
console.log("content URL override tests passed");

{
  const article = contentItem("toggle");
  const harness = makeContentHarness({ items: [article] });
  await harness.settle();
  harness.setSettings({ enabled: false });
  await harness.changed({ enabled: {} });
  await harness.settle();
  assert.equal(harness.observer().targets.has(article.record.visualTarget), false, "disabled filters leave no observed targets");
  harness.setSettings({ enabled: true });
  await harness.changed({ enabled: {} });
  await harness.settle();
  assert.equal(harness.observer().targets.has(article.record.visualTarget), true, "enabled filters observe unresolved visible candidates again");
  assert.equal(harness.calls.length, 0, "reactivation waits for a fresh intersection");
  harness.observer().trigger([article.record.visualTarget]);
  await harness.settle();
  assert.equal(harness.calls.length, 1, "reactivated filters classify after intersection");
  assert.equal(article.record.visualTarget.dataset.nfReason, "ad");
  assert.equal(harness.observer().targets.size, 0, "reactivated classification leaves no observer registrations");
}
console.log("content filter reactivation tests passed");

{
  const items = Array.from({ length: 31 }, (_, index) => contentItem(`batch-${index}`));
  const harness = makeContentHarness({ items });
  await harness.settle();
  harness.observer().trigger([...harness.targets]);
  await harness.settle();
  assert.equal(harness.calls.length, 2, "classification uses bounded batches");
  assert.equal(harness.calls[0].items.length, 30);
  assert.equal(harness.calls[1].items.length, 1);
}
console.log("content batching tests passed");

{
  const items = Array.from({ length: 31 }, (_, index) => contentItem(`failed-batch-${index}`));
  const harness = makeContentHarness({ items, failFirstBatch: true });
  await harness.settle();
  harness.observer().trigger([...harness.targets]);
  await harness.settle();
  assert.equal(harness.calls.length, 2, "a failed batch must not strand later queued articles");
  assert.equal(items[30].record.visualTarget.dataset.nfReason, "ad");
}
console.log("content batch failure recovery tests passed");

{
  const eager = contentItem("eager");
  const harness = makeContentHarness({ withObserver: false, items: [eager] });
  await harness.settle();
  assert.equal(harness.calls.length, 1, "observer absence uses eager classification");
  assert.equal(eager.record.visualTarget.dataset.nfReason, "ad");
  assert.match(harness.stats().error, /IntersectionObserver/);
}
console.log("content observer fallback tests passed");

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
    runtime: { getURL: (path) => `chrome-extension://test/${path}`, onMessage: { addListener: () => {} }, sendMessage: async () => { requests++; return JSON.parse(JSON.stringify(remoteResult)); } },
  },
});
await settle();
assert.match(panel.textContent, /미판정: Jev API HTTP 401/);
assert.match(panel.textContent, /표시 유지/);
settings.debug = false;
await changed({ debug: {} }, "sync");
await settle();
assert.equal(requests, 1, "debug toggle must not retry a failed API call");
assert.equal(panel, null);
console.log("debug error and toggle tests passed");

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

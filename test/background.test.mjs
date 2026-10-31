import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const local = { apiKey: "test-key", endpoint: "https://api.typesafe.ai/v1/systemone", model: "jev-latest" };
let listener;
let calls = 0;
let status = 200;
let access;
const chrome = {
  permissions: { contains: async () => true },
  storage: { local: {
    setAccessLevel: async (value) => { access = value.accessLevel; },
    get: async (defaults) => typeof defaults === "string" ? { [defaults]: local[defaults] } : { ...defaults, ...local },
    set: async (value) => Object.assign(local, value),
    remove: async (key) => { delete local[key]; },
  } },
  runtime: { onMessage: { addListener: (value) => { listener = value; } } },
};
vm.runInNewContext(readFileSync(new URL("../extension/src/background.js", import.meta.url), "utf8"), {
  chrome, AbortSignal, URL, Date, console,
  fetch: async (url, init) => {
    calls++;
    assert.equal(url, local.endpoint);
    assert.equal(init.headers.Authorization, "Bearer test-key");
    assert.equal(init.redirect, "error");
    const body = JSON.parse(init.body);
    assert.equal(body.model, local.model);
    const answers = Object.fromEntries(Object.keys(body.questions).map((key) => [key, { probabilities: (key.endsWith("__topic") || key.endsWith("__excludedTopic")) ? { on_topic: 0.9 } : { ad_pr: 0.9 } }]));
    return { ok: status === 200, status, json: async () => ({ answers }) };
  },
});
const ask = (msg) => new Promise((resolve) => listener(msg, {}, resolve));
const oldCacheKey = `2#${JSON.stringify([local.endpoint, local.model, ""])}#t1`;
local.classificationCache = { [oldCacheKey]: { kind: { news: 1 }, topic: null, t: Date.now() } };
const request = { type: "classify", items: [{ id: "t1", title: "할인 행사", summary: "세일" }], topics: [] };
assert.equal((await ask(request)).results.t1.kind.ad_pr, 0.9);
assert.equal(calls, 1, "old definition cache must trigger a new request");
assert.equal(access, "TRUSTED_CONTEXTS");
assert.equal((await ask(request)).results.t1.source, "cache");
assert.equal(calls, 1);
assert.ok((await ask({ ...request, topics: ["AI"] })).results.t1.topic);
assert.equal(calls, 2);
local.model = "custom-model";
await ask(request);
assert.equal(calls, 3);
const exclusionRequest = { ...request, topics: ["자동차"], excludedTopics: ["전기차"] };
const excluded = await ask(exclusionRequest);
assert.ok(excluded.results.t1.topic);
assert.ok(excluded.results.t1.excludedTopic);
const previousCalls = calls;
assert.equal((await ask(exclusionRequest)).results.t1.source, "cache");
assert.equal(calls, previousCalls);
await ask({ ...exclusionRequest, excludedTopics: ["게임"] });
assert.equal(calls, previousCalls + 1, "excluded topics must partition the cache");
status = 401;
assert.equal((await ask({ type: "health" })).error, "Jev API HTTP 401");
assert.equal((await ask({ type: "clearCache" })).ok, true);
assert.equal(local.classificationCache, undefined);
local.apiKey = "";
const before = calls;
assert.equal((await ask(request)).ok, false);
assert.equal(calls, before);
console.log("background tests passed");

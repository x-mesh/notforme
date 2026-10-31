#!/usr/bin/env node
// Local relay between the NotForMe extension and the TypeSafe Jev API.
// The API key stays in this process's environment; the extension never sees it.
//
//   TYPESAFE_API_KEY (or JEV_API_KEY)   required
//   TYPESAFE_BASE_URL                   default https://api.typesafe.ai
//   JEV_ENDPOINT                        optional full endpoint override
//   TYPESAFE_DEFAULT_MODEL / JEV_MODEL  default jev-latest
//   NF_PORT                             default 8787
//   NF_EXTENSION_ID                     optional, accept only this extension id

import http from "node:http";

const HOST = "127.0.0.1";
const PORT = Number(process.env.NF_PORT || 8787);
const API_KEY = process.env.TYPESAFE_API_KEY || process.env.JEV_API_KEY || "";
const BASE_URL = (process.env.TYPESAFE_BASE_URL || "https://api.typesafe.ai").replace(/\/$/, "");
const ENDPOINT = process.env.JEV_ENDPOINT || `${BASE_URL}/v1/systemone`;
const MODEL = process.env.TYPESAFE_DEFAULT_MODEL || process.env.JEV_MODEL || "jev-latest";
const EXTENSION_ID = process.env.NF_EXTENSION_ID || "";

const MAX_ITEMS = 100;
const CHUNK_SIZE = 30;
const MAX_BODY_BYTES = 256 * 1024;
const MAX_TOPICS = 10;
const MAX_RETRIES = 2;
const TIMEOUT_MS = 30_000;
const RETRY_BASE_MS = 250;

const KIND_CRITERIA = {
  ad_pr:
    "Marketing-driven article: sales or discount events, store openings, pop-ups, brand collaborations or limited editions, brand ambassadors, event turnout or anniversary promotion, brand-supplied statistics, event or forum announcements, store visits that read as promotion, sponsored or company-written promotion. When the main purpose is promotion, choose this over every other label.",
  product_launch:
    "The main subject is a company announcing, unveiling or releasing a specific product, service, model or feature, and the article is not primarily marketing.",
  news: "Substantive news, technology, policy, earnings or analysis that is neither promotion nor a product launch announcement.",
  needs_review: "Ambiguous: cannot tell from the title and summary.",
};

function topicCriteria(topics) {
  const list = topics.join(", ");
  return {
    on_topic: `The article is mainly about at least one of these topics: ${list}.`,
    off_topic: `The article is not mainly about any of these topics: ${list}.`,
    needs_review: "Ambiguous: cannot tell from the title and summary.",
  };
}

function buildRequest(items, topics) {
  const questions = {};
  for (const it of items) {
    questions[`${it.id}__kind`] = {
      type: "choice",
      instructions: `Classify the article "${it.id}" by its title and summary. Apply the definitions literally.`,
      criteria: KIND_CRITERIA,
    };
    if (topics.length) {
      questions[`${it.id}__topic`] = {
        type: "choice",
        instructions: `Decide whether the article "${it.id}" is about one of the user's topics.`,
        criteria: topicCriteria(topics),
      };
    }
  }
  return {
    model: MODEL,
    state: {
      goal: "Filter a news list for a reader who wants technology news without marketing.",
      items: items.map((it) => ({ id: it.id, title: it.title, summary: it.summary })),
    },
    questions,
  };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callJev(body) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if ((response.status === 429 || response.status === 529) && attempt < MAX_RETRIES) {
        await wait(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Jev API returned HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < MAX_RETRIES && error.name === "TimeoutError") {
        await wait(RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const probsOf = (answer) => (answer && answer.probabilities ? answer.probabilities : null);

async function classify(items, topics) {
  const results = {};
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const response = await callJev(buildRequest(chunk, topics));
    for (const it of chunk) {
      const kind = probsOf(response.answers?.[`${it.id}__kind`]);
      if (!kind) continue; // leave the item unclassified rather than guessing
      results[it.id] = { kind, topic: topics.length ? probsOf(response.answers?.[`${it.id}__topic`]) : null };
    }
  }
  return results;
}

function validate(payload) {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return "items must be a non-empty array";
  if (payload.items.length > MAX_ITEMS) return `at most ${MAX_ITEMS} items per request`;
  for (const it of payload.items) {
    if (typeof it.id !== "string" || typeof it.title !== "string") return "each item needs string id and title";
  }
  if (payload.topics !== undefined && (!Array.isArray(payload.topics) || payload.topics.length > MAX_TOPICS)) {
    return `topics must be an array of at most ${MAX_TOPICS}`;
  }
  return null;
}

function originAllowed(origin) {
  if (!origin) return true; // curl and other non-browser clients
  const match = origin.match(/^chrome-extension:\/\/([a-p]{32})$/);
  if (!match) return false; // blocks web pages from spending the user's API credits
  return !EXTENSION_ID || match[1] === EXTENSION_ID;
}

function send(res, status, body, origin) {
  const headers = { "Content-Type": "application/json" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers.Vary = "Origin";
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) return send(res, 403, { error: "origin not allowed" });
  if (req.method === "OPTIONS") return send(res, 204, {}, origin);

  if (req.method === "GET" && req.url === "/health") {
    return send(res, API_KEY ? 200 : 503, API_KEY ? { ok: true, endpoint: new URL(ENDPOINT).host } : { ok: false, error: "API key not set" }, origin);
  }

  if (req.method === "POST" && req.url === "/classify") {
    if (!API_KEY) return send(res, 503, { error: "API key not set in relay environment" }, origin);
    let payload;
    try {
      payload = await readBody(req);
    } catch (error) {
      return send(res, 400, { error: error.message }, origin);
    }
    const problem = validate(payload);
    if (problem) return send(res, 400, { error: problem }, origin);
    try {
      return send(res, 200, { results: await classify(payload.items, (payload.topics || []).filter(Boolean)) }, origin);
    } catch (error) {
      return send(res, 502, { error: error.message }, origin);
    }
  }
  return send(res, 404, { error: "not found" }, origin);
});

server.listen(PORT, HOST, () => {
  console.log(`notforme relay listening on http://${HOST}:${PORT} (API key ${API_KEY ? "set" : "NOT set"})`);
});

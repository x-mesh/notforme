(() => {
  if (globalThis.nfContentActive) return;
  globalThis.nfContentActive = true;
  const adapter = nfPickAdapter();
  if (!adapter) return;

  const DEFAULTS = {
    debug: false,
  enabled: true,
    hideAd: true,
    hideProduct: false,
    hideOffTopic: false,
    topics: [],
  hideExcludedTopic: false,
  excludedTopics: [],
    mode: "collapse",
    threshold: 0.8,
    userOverrides: {},
  };
  const BATCH_SIZE = 30;
  const DEBOUNCE_MS = 300;
  // Deterministic labels written by the publisher. These never need a model call.
  const AD_PREFIX = /^\s*[\[\(]\s*(광고|AD|PR|협찬|보도자료|스폰서|sponsored)\s*[\]\)]/i;

  const TAGS = {
    ad: "광고성 PR",
    product: "제품 공개",
    offTopic: "남길 주제 아님",
    excludedTopic: "제외 주제",
    manual: "항상 가리기",
  };

  let settings = { ...DEFAULTS };
  const rows = new Map(); // id -> { els: Element[], title: string, summary: string }
  const decisions = new Map(); // id -> { kind: {label: prob}, topic: {label: prob} | null, source }
  const tried = new Set(); // ids already sent since the last settings change; prevents request loops on failure
  const queued = new Set();
  const targetIds = new WeakMap();
  const observedTargets = new Set();
  const debugPanels = new Map();
  const errors = new Map();
  const hasIntersectionObserver = typeof IntersectionObserver === "function";
  const visibilityDiagnostic = hasIntersectionObserver ? "" : "IntersectionObserver를 사용할 수 없어 모든 기사를 즉시 판정합니다.";
  let visibilityObserver = null;
  let timer = null;
  let running = false;
  let rerun = false;
  let lastError = "";

  const loadSettings = async () => {
    const stored = await chrome.storage.sync.get(DEFAULTS);
    settings = { ...DEFAULTS, ...stored };
  };

  const canonicalUrl = (value) => {
    if (!value) return "";
    const url = new URL(value, location.href);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key === "source" || key.startsWith("utm_")) url.searchParams.delete(key);
    }
    return url.href;
  };

  const anyFilterOn = () => settings.enabled && (settings.hideAd || settings.hideProduct || settings.hideOffTopic || settings.hideExcludedTopic);
  const needsTopic = () => settings.hideOffTopic && settings.topics.length > 0;

  const needsExcludedTopic = () => settings.hideExcludedTopic && settings.excludedTopics.length > 0;

  const needsRemote = (id) => {
    if (tried.has(id)) return false;
    if (settings.userOverrides?.[rows.get(id)?.url]) return false;
    const decision = decisions.get(id);
    return !decision || (needsTopic() && !decision.topic) || (needsExcludedTopic() && !decision.excludedTopic);
  };

  const queue = (id) => {
    if (anyFilterOn() && needsRemote(id)) queued.add(id);
  };

  const observeTarget = (id, target) => {
    if (!target || typeof target !== "object") return;
    let ids = targetIds.get(target);
    if (!ids) {
      ids = new Set();
      targetIds.set(target, ids);
    }
    ids.add(id);
    if (anyFilterOn() && visibilityObserver && !observedTargets.has(target) && needsRemote(id)) {
      observedTargets.add(target);
      visibilityObserver.observe(target);
    }
  };

  const unobserveRow = (id, row) => {
    if (!visibilityObserver || !row) return;
    for (const target of row.els) {
      const ids = targetIds.get(target);
      ids?.delete(id);
      if (!ids?.size || [...ids].every((targetId) => !needsRemote(targetId))) {
        visibilityObserver.unobserve(target);
        observedTargets.delete(target);
      }
    }
  };

  const collect = () => {
    for (const el of document.querySelectorAll(adapter.itemSelector)) {
      if (el.dataset.nfSeen) continue;
      el.dataset.nfSeen = "1";
      const rec = adapter.extract(el);
      if (!rec) continue;
      const target = rec.visualTarget || el;
      target.dataset.nfId = rec.id;
      const row = rows.get(rec.id) || { els: [], title: rec.title, summary: rec.summary || "", url: canonicalUrl(rec.url) };
      if (!rows.has(rec.id)) rows.set(rec.id, row);
      if (!row.els.includes(target)) row.els.push(target);
      row.title = rec.title;
      row.summary = rec.summary || row.summary;
      row.url ||= canonicalUrl(rec.url);
      classifyLocal(rec);
      observeTarget(rec.id, target);
    }
  };

  const classifyLocal = (rec) => {
    if (AD_PREFIX.test(rec.title)) {
      const previous = decisions.get(rec.id);
      decisions.set(rec.id, { ...previous, kind: { ad_pr: 1 }, topic: previous?.topic || null, excludedTopic: previous?.excludedTopic || null, source: "rule" });
      return true;
    }
    return false;
  };

  const missing = () => {
    const out = [];
    for (const [id, row] of rows) {
      if (needsRemote(id)) out.push({ id, title: row.title, summary: row.summary || "" });
    }
    return out;
  };

  const queuedItems = () => {
    const out = [];
    for (const id of queued) {
      if (!needsRemote(id)) continue;
      const row = rows.get(id);
      if (row) out.push({ id, title: row.title, summary: row.summary || "" });
    }
    queued.clear();
    return out;
  };

  const classifyRemote = async (items) => {
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = items.slice(i, i + BATCH_SIZE);
      for (const it of batch) tried.add(it.id);
      let res;
      try {
        res = await chrome.runtime.sendMessage({
        type: "classify",
        items: batch,
        topics: needsTopic() ? settings.topics : [],
        excludedTopics: needsExcludedTopic() ? settings.excludedTopics : [],
        });
      } catch {
        res = { ok: false, error: "확장 프로그램과 통신하지 못했습니다." };
      }
      if (!res || !res.ok) {
        lastError = (res && res.error) || "no response";
        for (const item of batch) {
          errors.set(item.id, lastError);
          unobserveRow(item.id, rows.get(item.id));
        }
        apply();
        return false;
      }
      lastError = "";
      for (const item of batch) {
        const result = res.results?.[item.id];
        if (result) {
          const previous = decisions.get(item.id);
          decisions.set(item.id, previous?.source === "rule" ? { ...result, kind: previous.kind, source: "rule" } : result);
          errors.delete(item.id);
        } else errors.set(item.id, "응답에 기사 판정이 없습니다.");
        unobserveRow(item.id, rows.get(item.id));
      }
      apply();
    }
    return true;
  };

  const reasonFor = (id, d) => {
    const override = settings.userOverrides?.[rows.get(id)?.url];
    if (override === "keep") return null;
    if (override === "hide") return "manual";
    if (!d) return null;
    const t = settings.threshold;
    const p = (group, label) => (group && typeof group[label] === "number" ? group[label] : 0);
    if (needsExcludedTopic() && p(d.excludedTopic, "on_topic") >= t) return "excludedTopic";
    if (settings.hideAd && p(d.kind, "ad_pr") >= t) return "ad";
    if (settings.hideProduct && p(d.kind, "product_launch") >= t) return "product";
    if (needsTopic() && p(d.topic, "off_topic") >= t) return "offTopic";
    return null;
  };

  const restore = (el) => {
    el.classList.remove("nf-collapsed", "nf-open", "nf-removed", "nf-blur", "nf-dim");
    el.querySelector(":scope > .nf-stub")?.remove();
    delete el.dataset.nfReason;
    delete el.dataset.nfMode;
  };

  const hide = (el, reason, title) => {
    const mode = reason === "manual" && settings.mode === "remove" ? "collapse" : settings.debug && settings.mode === "remove" ? "collapse" : settings.mode;
    if (el.dataset.nfReason === reason && el.dataset.nfMode === mode) return;
    restore(el);
    el.dataset.nfReason = reason;
    el.dataset.nfMode = mode;
    if (mode === "remove") {
      el.classList.add("nf-removed");
      return;
    }
    const stub = document.createElement("button");
    stub.type = "button";
    stub.setAttribute("aria-expanded", "false");
    stub.className = "nf-stub";
    stub.innerHTML = '<span class="nf-tag"></span><span class="nf-title"></span><span class="nf-toggle">보기</span>';
    stub.querySelector(".nf-tag").textContent = TAGS[reason];
    stub.querySelector(".nf-title").textContent = title;
    stub.addEventListener("click", (ev) => {
      ev.preventDefault();
      const open = el.classList.toggle("nf-open");
      stub.setAttribute("aria-expanded", String(open));
      stub.querySelector(".nf-toggle").textContent = open ? "접기" : "보기";
    });
    el.classList.add(mode === "blur" ? "nf-blur" : mode === "dim" ? "nf-dim" : "nf-collapsed");
    el.prepend(stub);
  };

  const setOverride = async (url, value) => {
    if (!url) return;
    const userOverrides = { ...(settings.userOverrides || {}) };
    if (value) userOverrides[url] = value;
    else delete userOverrides[url];
    await chrome.storage.sync.set({ userOverrides });
  };

  const renderOverrideControls = (el, row) => {
    const previous = el.querySelector(":scope > .nf-override-controls");
    if (!row.url) { previous?.remove(); return; }
    const value = settings.userOverrides?.[row.url];
    if (previous?.dataset.nfOverride === (value || "")) return;
    previous?.remove();
    const controls = document.createElement("div");
    controls.className = "nf-override-controls";
    controls.dataset.nfOverride = value || "";
    const addButton = (label, next, pressed) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-pressed", String(pressed));
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await setOverride(row.url, next);
      });
      controls.append(button);
    };
    addButton("유지하기", "keep", value === "keep");
    addButton("항상 가리기", "hide", value === "hide");
    if (value) addButton("필터로 되돌리기", null, false);
    el.append(controls);
  };

  const debugText = (id, decision, reason) => {
    const lines = ["NotForMe 디버그 · 판정 정보"];
    if (!settings.enabled) lines.push("필터 사용 꺼짐 → 표시 유지");
    else if (!anyFilterOn()) lines.push("선택한 필터 없음 → 표시 유지");
    else if (errors.has(id)) lines.push(`미판정: ${errors.get(id)}${decision ? " · 이전 판정 유지" : " → 표시 유지"}`);
    else if (!decision) lines.push(tried.has(id) ? "판정 중" : "미판정: 요청 대기");
    else lines.push(reason ? `판정: ${TAGS[reason]} → 가리기${settings.mode === "remove" ? " (디버깅 중에는 접어서 표시)" : ""}` : settings.userOverrides?.[rows.get(id)?.url] === "keep" ? "사용자 설정: 유지" : "표시 유지 (활성 필터 기준 미달)");
    lines.splice(0, 2, `${lines[0]} · ${lines[1]}`);
    let source = "";
    if (decision) {
      const labels = { ad_pr: "광고성 PR", product_launch: "제품 공개", news: "일반 뉴스", needs_review: "판단 유보", on_topic: "관심 주제", off_topic: "관심 주제 아님" };
      for (const [name, group] of [["", decision.kind], ["남길 주제 · ", decision.topic], ["제외 주제 · ", decision.excludedTopic]]) {
        if (group) lines.push(name + Object.entries(group).map(([key, value]) => `${labels[key] || key} ${Number(value).toFixed(3)}`).join(" · "));
      }
      source = `출처: ${{ rule: "로컬 규칙", cache: "캐시", model: "Jev API" }[decision.source] || "알 수 없음"}`;
    }
    lines.push(`${source ? `${source} · ` : ""}현재 기준: ${Number(settings.threshold).toFixed(2)} · PR ${settings.hideAd ? "켜짐" : "꺼짐"} · 제품 ${settings.hideProduct ? "켜짐" : "꺼짐"} · 남기기 ${needsTopic() ? "켜짐" : settings.hideOffTopic ? "주제 입력 필요" : "꺼짐"} · 제외 ${needsExcludedTopic() ? "켜짐" : settings.hideExcludedTopic ? "주제 입력 필요" : "꺼짐"}`);
    if (visibilityDiagnostic) lines.push(`진단: ${visibilityDiagnostic}`);
    return lines.join("\n");
  };

  const renderDebug = (node, id, decision, reason, text) => {
    const make = (tag, className, value = "") => {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = value;
      return element;
    };
    const wasOpen = node.querySelector(".nf-debug-details")?.open || false;
    node.textContent = "";
    node.dataset.nfText = text;
    const header = make("div", "nf-debug-header");
    const brand = make("div", "nf-debug-brand");
    const icon = make("img", "nf-debug-icon");
    icon.src = chrome.runtime.getURL("icons/icon-32.png");
    icon.alt = "";
    icon.width = 24;
    icon.height = 24;
    brand.append(icon, make("span", "nf-debug-name", "NotForMe 디버그"));
    const result = !settings.enabled || !anyFilterOn() ? "필터 꺼짐" : errors.has(id) ? "요청 실패" : !decision ? "미판정" : reason ? TAGS[reason] : "표시 유지";
    const badge = make("span", reason ? "nf-debug-result nf-debug-result-hidden" : "nf-debug-result", result);
    header.append(brand, badge);
    const metrics = make("div", "nf-debug-metrics");
    const probability = (group, key) => typeof group?.[key] === "number" ? group[key].toFixed(3) : "—";
    const entries = [
      ["PR", probability(decision?.kind, "ad_pr")],
      ["제품", probability(decision?.kind, "product_launch")],
      ["뉴스", probability(decision?.kind, "news")],
    ];
    if (needsTopic()) entries.push(["남길 주제", probability(decision?.topic, "on_topic")]);
    if (needsExcludedTopic()) entries.push(["제외 일치", probability(decision?.excludedTopic, "on_topic")]);
    entries.push(["기준", Number(settings.threshold).toFixed(2)], ["출처", { cache: "캐시", model: "API", rule: "규칙" }[decision?.source] || "—"]);
    for (const [label, value] of entries) {
      const cell = make("div", "nf-debug-metric");
      cell.append(make("span", "nf-debug-label", label), make("strong", "nf-debug-value", value));
      metrics.append(cell);
    }
    const details = make("details", "nf-debug-details");
    details.open = wasOpen;
    details.append(make("summary", "nf-debug-summary", "상세"), make("div", "nf-debug-description", text));
    node.append(header, metrics, details);
  };

  const apply = () => {
    for (const [id, row] of rows) {
      const reason = anyFilterOn() ? reasonFor(id, decisions.get(id)) : null;
      for (const el of row.els) {
        if (reason) hide(el, reason, row.title);
        else if (el.dataset.nfReason) restore(el);
        const panel = debugPanels.get(el);
        if (settings.debug) {
          const text = debugText(id, decisions.get(id), reason);
          if (!panel) {
            const node = document.createElement("div");
            node.className = "nf-debug";
            renderDebug(node, id, decisions.get(id), reason, text);
            el.append(node);
            debugPanels.set(el, node);
          } else if (panel.dataset.nfText !== text) {
            renderDebug(panel, id, decisions.get(id), reason, text);
          }
          el.classList.add("nf-debugging");
        } else {
          panel?.remove();
          debugPanels.delete(el);
          el.classList.remove("nf-debugging");
        }
        renderOverrideControls(el, row);
      }
    }
  };

  const run = async () => {
    if (running) {
      rerun = true;
      return;
    }
    running = true;
    try {
      collect();
      if (anyFilterOn()) {
        if (!hasIntersectionObserver) for (const item of missing()) queue(item.id);
        const todo = queuedItems();
        if (todo.length) {
          apply();
          await classifyRemote(todo);
        }
      }
      apply();
    } finally {
      running = false;
      if (rerun) {
        rerun = false;
        schedule();
      }
    }
  };

  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(run, DEBOUNCE_MS);
  };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "stats") {
      const hidden = document.querySelectorAll("[data-nf-reason]").length;
      sendResponse({ adapter: adapter.name, hidden, total: document.querySelectorAll("[data-nf-id]").length, error: lastError || visibilityDiagnostic });
    }
  });

  chrome.storage.onChanged.addListener(async (_changes, area) => {
    if (area !== "sync") return;
    if (Object.keys(_changes).some((key) => !["debug", "mode", "threshold"].includes(key))) {
      tried.clear();
      errors.clear();
    }
    if (["topics", "excludedTopics", "hideOffTopic", "hideExcludedTopic"].some((key) => key in _changes)) {
      for (const decision of decisions.values()) {
        decision.topic = null;
        decision.excludedTopic = null;
      }
    }
    await loadSettings();
    for (const [id, row] of rows) {
      classifyLocal({ id, title: row.title });
      if (hasIntersectionObserver) {
        if (anyFilterOn() && needsRemote(id)) for (const target of row.els) observeTarget(id, target);
        else unobserveRow(id, row);
      }
      if (!hasIntersectionObserver) queue(id);
    }
    schedule();
  });

  if (hasIntersectionObserver) {
    visibilityObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const id of targetIds.get(entry.target) || []) queue(id);
      }
      schedule();
    }, { root: null, rootMargin: "100% 0px", threshold: 0 });
  }

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });

  loadSettings().then(run);
})();

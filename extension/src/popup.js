const DEFAULTS = {
  debug: false,
  debugStyle: "lens",
  enabled: true,
  hideAd: true,
  hideProduct: false,
  hideOffTopic: false,
  topics: [],
  hideExcludedTopic: false,
  excludedTopics: [],
  mode: "collapse",
  threshold: 0.8,
};

const $ = (id) => document.getElementById(id);
const parseTopics = (text) => text.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);

async function load() {
  const s = { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  for (const key of ["enabled", "hideAd", "hideProduct", "hideOffTopic", "hideExcludedTopic", "debug"]) $(key).checked = s[key];
  document.querySelector(`input[name="debugStyle"][value="${s.debugStyle === "strip" ? "strip" : "lens"}"]`).checked = true;
  $("debugStyleOptions").disabled = !s.debug;
  $("topics").value = s.topics.join(", ");
  $("excludedTopics").value = s.excludedTopics.join(", ");
  document.querySelector(`input[name="mode"][value="${s.mode}"]`).checked = true;
  $("threshold").value = s.threshold;
  $("thresholdValue").textContent = Number(s.threshold).toFixed(2);
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const connection = await chrome.storage.local.get({ apiKey: "", endpoint: "https://api.typesafe.ai/v1/systemone", model: "jev-latest" });
  for (const key of ["apiKey", "endpoint", "model"]) $(key).value = connection[key];
  $("topics").disabled = !s.hideOffTopic;
  $("excludedTopics").disabled = !s.hideExcludedTopic;
}

const save = () =>
  chrome.storage.sync.set({
    debug: $("debug").checked,
    debugStyle: document.querySelector('input[name="debugStyle"]:checked').value,
    enabled: $("enabled").checked,
    hideAd: $("hideAd").checked,
    hideProduct: $("hideProduct").checked,
    hideOffTopic: $("hideOffTopic").checked,
    topics: parseTopics($("topics").value),
    hideExcludedTopic: $("hideExcludedTopic").checked,
    excludedTopics: parseTopics($("excludedTopics").value),
    mode: document.querySelector('input[name="mode"]:checked').value,
    threshold: Number($("threshold").value),
  });

async function refreshStatus() {
  const status = $("status");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let stats = null;
  if (tab) stats = await chrome.tabs.sendMessage(tab.id, { type: "stats" }).catch(() => null);

  const lines = [];
  lines.push($("apiKey").value ? "Jev 설정을 확인하려면 연결 테스트를 눌러 주세요." : "Jev API 키를 설정해 주세요.");
  if (stats) {
    lines.push(`${stats.adapter === "common" ? "공통 추출기" : "이 페이지"}: 기사 ${stats.total}건 감지 · ${stats.hidden}건 가림 · 판정 중 ${stats.pending || 0}건 · 실패 ${stats.failed || 0}건${stats.error ? ` / 오류: ${stats.error}` : ""}`);
    if (stats.skipped?.multiple_articles) lines.push(`여러 기사 링크가 섞인 영역 ${stats.skipped.multiple_articles}건 제외`);
  }
  else lines.push("이 페이지는 지원하지 않거나 아직 로드 중입니다.");
  status.textContent = lines.join("\n");
  status.style.whiteSpace = "pre-line";
  status.classList.toggle("bad", Boolean(stats && stats.error));
}

for (const id of ["enabled", "hideAd", "hideProduct", "hideOffTopic", "hideExcludedTopic", "debug"]) {
  $(id).addEventListener("change", () => {
    $("debugStyleOptions").disabled = !$("debug").checked;
    $("topics").disabled = !$("hideOffTopic").checked;
    $("excludedTopics").disabled = !$("hideExcludedTopic").checked;
    save();
  });
}
for (const r of document.querySelectorAll('input[name="debugStyle"]')) r.addEventListener("change", save);
$("topics").addEventListener("change", save);
$("excludedTopics").addEventListener("change", save);
async function saveConnection() {
  const endpoint = new URL($("endpoint").value.trim());
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) throw new Error("HTTPS API 주소를 입력해 주세요.");
  if (!$("apiKey").value.trim()) throw new Error("Jev API 키를 입력해 주세요.");
  if (!$("model").value.trim()) throw new Error("Jev 모델을 입력해 주세요.");
  const allowed = await chrome.permissions.request({ origins: [`${endpoint.origin}/*`] });
  if (!allowed) throw new Error("API 주소 접근 권한이 필요합니다.");
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  await chrome.storage.local.set({ apiKey: $("apiKey").value.trim(), endpoint: endpoint.href, model: $("model").value.trim() });
  await chrome.storage.sync.set({ connectionUpdatedAt: Date.now() });
}

$("saveConnection").addEventListener("click", async () => {
  try {
    await saveConnection();
    $("status").textContent = "연결 설정을 저장했습니다.";
  } catch (error) {
    $("status").textContent = error.message;
  }
});
$("testConnection").addEventListener("click", async () => {
  const button = $("testConnection");
  button.disabled = true;
  $("status").textContent = "입력한 설정을 저장하고 Jev에 연결하는 중...";
  try {
    await saveConnection();
    const result = await chrome.runtime.sendMessage({ type: "health" });
    $("status").textContent = result?.ok ? "Jev 연결을 확인했습니다." : (result?.error || "Jev 연결 테스트 응답이 올바르지 않습니다.");
  } catch (error) {
    $("status").textContent = error.message || "Jev 연결 테스트를 시작하지 못했습니다. 확장 프로그램을 다시 로드해 주세요.";
  } finally {
    button.disabled = false;
  }
});
$("threshold").addEventListener("input", () => {
  $("thresholdValue").textContent = Number($("threshold").value).toFixed(2);
});
$("threshold").addEventListener("change", save);
for (const r of document.querySelectorAll('input[name="mode"]')) r.addEventListener("change", save);
$("clearCache").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "clearCache" });
  $("clearCache").textContent = "비웠습니다";
});

load().then(() => { refreshStatus(); renderSavedArticles(); });


$("enableSite").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab.url);
    if (url.protocol !== "https:") throw new Error("HTTPS 뉴스 목록에서 사용해 주세요.");
    const match = `${url.origin}/*`;
    const allowed = await chrome.permissions.request({ origins: [match] });
    if (!allowed) throw new Error("이 사이트 접근 권한이 필요해요.");
    const id = `nf-common-${url.hostname.replace(/[^a-z0-9]/gi, "-")}`;
    const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    if (!registered.length) await chrome.scripting.registerContentScripts([{
      id, matches: [match], js: ["src/adapters.js", "src/content.js"], css: ["src/content.css"], runAt: "document_idle",
    }]);
    const [active] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => Boolean(globalThis.nfContentActive) });
    if (!active.result) {
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ["src/content.css"] });
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["src/adapters.js", "src/content.js"] });
    }
    $("status").textContent = "이 사이트에 적용했어요. 기사별 판정은 디버깅 모드에서 확인해 주세요.";
  } catch (error) {
    $("status").textContent = error.message;
  }
});

$("pickArticle").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("현재 페이지를 찾을 수 없습니다.");
    await chrome.tabs.sendMessage(tab.id, { type: "pickArticle" });
    window.close();
  } catch {
    $("status").textContent = "먼저 이 사이트에서 사용을 눌러 주세요.";
  }
});

async function renderSavedArticles() {
  const data = await chrome.storage.sync.get({ userOverrides: {}, manualArticles: {} });
  const list = $("savedArticles");
  list.textContent = "";
  const entries = [
    ...Object.entries(data.userOverrides).map(([url, value]) => ({ url, type: "userOverrides", label: value === "keep" ? "유지" : "항상 가리기" })),
    ...Object.entries(data.manualArticles).map(([url, title]) => ({ url, type: "manualArticles", label: `직접 지정 · ${title}` })),
  ];
  if (!entries.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "저장한 기사 설정이 없습니다.";
    list.append(empty);
    return;
  }
  for (const entry of entries) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = `${entry.label} · ${entry.url}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "해제";
    remove.setAttribute("aria-label", `${entry.label} 해제: ${entry.url}`);
    remove.addEventListener("click", async () => {
      try {
        const current = await chrome.storage.sync.get({ [entry.type]: {} });
        delete current[entry.type][entry.url];
        await chrome.storage.sync.set({ [entry.type]: current[entry.type] });
        await renderSavedArticles();
      } catch { $("status").textContent = "설정을 해제하지 못했습니다. 다시 시도해 주세요."; }
    });
    item.append(label, remove);
    list.append(item);
  }
}

$("previewDetection").addEventListener("click", async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error();
    await chrome.tabs.sendMessage(tab.id, { type: "previewDetection" });
    window.close();
  } catch { $("status").textContent = "먼저 이 사이트에서 사용을 눌러 주세요."; }
});

$("retryFailed").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try { await chrome.tabs.sendMessage(tab.id, { type: "retryFailed" }); $("status").textContent = "실패한 기사 판정을 다시 요청합니다."; }
  catch { $("status").textContent = "페이지에 연결하지 못했습니다."; }
});
const backupDefaults = { ...DEFAULTS, userOverrides: {}, manualArticles: {} };
$("exportSettings").addEventListener("click", async () => {
  try {
    const data = await chrome.storage.sync.get(backupDefaults);
    const blob = new Blob([JSON.stringify({ version: 1, settings: data }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "notforme-settings.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { $("status").textContent = "설정을 내보내지 못했습니다."; }
});
$("importSettings").addEventListener("change", async (event) => {
  try {
    const file = event.target.files[0];
    if (!file || file.size > 1000000) throw new Error("올바른 백업 파일을 선택해 주세요.");
    const backup = JSON.parse(await file.text());
    const data = backup.settings;
    if (backup.version !== 1 || !data || typeof data !== "object") throw new Error("지원하지 않는 백업 형식입니다.");
    const valid = {};
    for (const key of Object.keys(backupDefaults)) {
      const value = data[key];
      if (value === undefined) continue;
      if (typeof backupDefaults[key] === "boolean" && typeof value === "boolean") valid[key] = value;
      else if (["topics", "excludedTopics"].includes(key) && Array.isArray(value) && value.every(v => typeof v === "string")) valid[key] = value;
      else if (key === "mode" && ["collapse", "blur", "dim", "remove"].includes(value)) valid[key] = value;
      else if (key === "debugStyle" && ["lens", "strip"].includes(value)) valid[key] = value;
      else if (key === "threshold" && typeof value === "number" && value >= 0.5 && value <= 0.99) valid[key] = value;
      else if (["userOverrides", "manualArticles"].includes(key) && value && typeof value === "object" && !Array.isArray(value) && Object.entries(value).every(([url, v]) => { try { return new URL(url).protocol === "https:" && typeof v === "string" && (key !== "userOverrides" || ["keep", "hide"].includes(v)); } catch { return false; } })) valid[key] = value;
      else throw new Error("백업에 올바르지 않은 설정이 있습니다.");
    }
    await chrome.storage.sync.set(valid);
    await load(); await renderSavedArticles(); await refreshStatus();
    $("status").textContent = "설정을 가져왔습니다.";
  } catch (error) { $("status").textContent = error.message || "설정을 가져오지 못했습니다."; }
  event.target.value = "";
});

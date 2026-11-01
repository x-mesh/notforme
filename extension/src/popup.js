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
  if (stats) lines.push(`${stats.adapter === "common" ? "공통 추출기" : "이 페이지"}: ${stats.total}건 중 ${stats.hidden}건 가림${stats.error ? ` / 오류: ${stats.error}` : ""}`);
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

load().then(refreshStatus);


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

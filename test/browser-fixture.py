from pathlib import Path
from playwright.sync_api import sync_playwright
import os
import shutil

root = Path(__file__).resolve().parent.parent
fixture = (root / "test/fixtures/yonhap-section.html").read_text()
with sync_playwright() as playwright:
    executable = os.environ.get("CHROME_BIN") or shutil.which("chromium") or shutil.which("google-chrome")
    if not executable and Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome").exists():
        executable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    browser = playwright.chromium.launch(headless=True, executable_path=executable, args=["--no-sandbox"])
    page = browser.new_page()
    page.route("**/*", lambda route: route.fulfill(status=200, content_type="text/html", body=fixture) if route.request.is_navigation_request() else route.abort())
    page.goto("https://www.yna.co.kr/politics/index", wait_until="domcontentloaded")
    page.add_script_tag(path=str(root / "extension/src/adapters.js"))
    page.add_script_tag(content="""globalThis.messageListener = null; globalThis.requests = []; globalThis.saved = {}; globalThis.chrome = { storage: {sync: {get: async defaults => ({...defaults, debug: true, ...saved}), set: async value => Object.assign(saved, value)}, onChanged: {addListener() {}}}, runtime: {getURL: path => path, onMessage: {addListener(fn) {messageListener = fn}}, sendMessage: async msg => (requests.push(msg), msg.type === 'classify' ? {ok:true, results:Object.fromEntries(msg.items.map(item => [item.id, {kind:{news:1},source:'model'}]))} : {ok:true})} };""")
    page.add_script_tag(path=str(root / "extension/src/content.js"))
    page.add_style_tag(path=str(root / "extension/src/content.css"))
    page.wait_for_timeout(800)
    stats = page.evaluate("() => { let value; messageListener({type:'stats'}, {}, x => value=x); return value; }")
    assert stats["adapter"] == "common" and stats["total"] == 2, stats
    assert stats["skipped"]["multiple_articles"] == 1, stats
    assert page.locator("nav [data-nf-id], #mixed [data-nf-id]").count() == 0
    page.evaluate("""() => { const card = document.querySelector('article[data-nf-id]'); card.classList.remove('nf-debugging'); card.style.display = 'flex'; card.style.width = '400px'; for (const child of card.children) child.style.flex = '0 0 180px'; }""")
    before = page.evaluate("""() => { const card = document.querySelector('article[data-nf-id]'); const next = card.nextElementSibling; const a = card.getBoundingClientRect(), b = next.getBoundingClientRect(); return {height:a.height, nextTop:b.top}; }""")
    page.locator("article[data-nf-id]").hover()
    layout = page.evaluate("""() => { const card = document.querySelector('article[data-nf-id]'); const controls = document.querySelector('body > .nf-override-controls.nf-visible'); const button = controls.querySelector('button'); const r = button.getBoundingClientRect(); const c = card.getBoundingClientRect(), n = card.nextElementSibling.getBoundingClientRect(); return { width: r.width, height: r.height, cardHeight:c.height, nextTop:n.top, text: getComputedStyle(button).whiteSpace, cardDisplay: getComputedStyle(card).display, position: getComputedStyle(controls).position }; }""")
    assert layout["cardDisplay"] == "flex" and layout["position"] == "fixed", layout
    assert layout["text"] == "nowrap" and layout["width"] > layout["height"], layout
    assert layout["cardHeight"] == before["height"] and layout["nextTop"] == before["nextTop"], (before, layout)
    page.locator("body > .nf-override-controls.nf-visible button").first.focus()
    assert page.locator("body > .nf-override-controls.nf-visible").count() == 1
    page.evaluate("() => messageListener({type:'pickArticle'}, {}, () => {})")
    page.locator("#manual a").click()
    page.wait_for_timeout(800)
    assert page.locator("#manual .nf-manual-target[data-nf-id]").count() == 1
    assert page.locator("#manual .nf-debug").count() == 1
    assert page.evaluate("() => Object.keys(saved.manualArticles).length") == 1
    assert page.locator(".nf-picker-banner").count() == 0
    page.locator("#manual .nf-debug-summary").click()
    page.locator("#manual .nf-debug-retry").click()
    page.wait_for_timeout(100)
    assert page.evaluate("() => requests.some(msg => msg.type === 'classify' && msg.force === true && msg.items.length === 1)"), "retry bypasses cache for one article"
    page.evaluate("() => messageListener({type:'pickArticle'}, {}, () => {})")
    page.keyboard.press("Escape")
    assert page.locator(".nf-picker-banner").count() == 0
    stored = page.evaluate("() => saved.manualArticles")
    page.reload(wait_until="domcontentloaded")
    page.add_script_tag(path=str(root / "extension/src/adapters.js"))
    import json
    page.add_script_tag(content="globalThis.saved = " + json.dumps({"manualArticles": stored}) + ";" + """globalThis.messageListener = null; globalThis.storageListener = null; globalThis.chrome = { storage: {sync: {get: async defaults => ({...defaults, debug: true, ...saved}), set: async value => Object.assign(saved, value)}, onChanged: {addListener(fn) {storageListener=fn}}}, runtime: {getURL: path => path, onMessage: {addListener(fn) {messageListener = fn}}, sendMessage: async msg => msg.type === 'classify' ? {ok:true, results:Object.fromEntries(msg.items.map(item => [item.id, {kind:{news:1},source:'model'}]))} : {ok:true}} };""")
    page.add_script_tag(path=str(root / "extension/src/content.js"))
    page.add_style_tag(path=str(root / "extension/src/content.css"))
    page.wait_for_timeout(800)
    assert page.locator("#manual .nf-manual-target[data-nf-id]").count() == 1, "manual selection is restored on reload"
    page.evaluate("() => messageListener({type:'previewDetection'}, {}, () => {})")
    assert page.locator(".nf-preview-detected").count() >= 2
    assert page.locator("#mixed.nf-preview-skipped").count() == 1
    page.set_viewport_size({"width": 320, "height": 500})
    page.locator("article[data-nf-id] a.tit-news").focus()
    page.keyboard.press("Alt+ArrowDown")
    assert page.evaluate("() => document.activeElement.closest('.nf-override-controls') !== null"), "keyboard shortcut focuses article controls"
    rect = page.evaluate("""() => { const r = document.activeElement.closest('.nf-override-controls').getBoundingClientRect(); return {left:r.left,right:r.right,width:innerWidth}; }""")
    assert rect["left"] >= 0 and rect["right"] <= rect["width"], rect
    page.evaluate("async () => { saved.manualArticles = {}; await storageListener({manualArticles:{}}, 'sync'); }")
    page.wait_for_timeout(500)
    assert page.locator("#manual .nf-manual-target").count() == 0, "removing a selection restores the original link without a reload"
    assert page.locator("#manual > a").count() == 1
    baseline = page.locator("body > .nf-override-controls").count()
    page.evaluate("""() => { const group=document.createElement('div'); group.id='long-list'; for(let i=0;i<100;i++){ const article=document.createElement('article'); const heading=document.createElement('h2'); const a=document.createElement('a'); a.href='/view/AKR2026'+String(i).padStart(11,'0'); a.textContent='긴 목록에서 새로 추가한 기사 제목 '+i; heading.append(a); article.append(heading); group.append(article); } document.querySelector('main').append(group); }""")
    page.wait_for_timeout(1000)
    assert page.locator("#long-list [data-nf-id]").count() == 100
    page.locator("#long-list").evaluate("el => el.remove()")
    page.wait_for_timeout(1000)
    assert page.locator("body > .nf-override-controls").count() == baseline, "removed cards release their overlay controls"
    fixture = (root / "test/fixtures/zdnet-list.html").read_text()
    page.goto("https://zdnet.co.kr/news/", wait_until="domcontentloaded")
    page.add_script_tag(path=str(root / "extension/src/adapters.js"))
    zdnet = page.evaluate("""() => { const a=nfPickAdapter(); const rows=[...document.querySelectorAll(a.itemSelector)].map(el => a.extract(el)).filter(Boolean); return {name:a.name, count:rows.length, summary:rows[0]?.summary}; }""")
    assert zdnet["name"] == "zdnet" and zdnet["count"] == 2 and zdnet["summary"] == "기술 기사 요약입니다.", zdnet
    fixture = (root / "test/fixtures/article-body.html").read_text()
    page.goto("https://news.example.com/article/123", wait_until="domcontentloaded")
    page.add_script_tag(path=str(root / "extension/src/adapters.js"))
    found = page.evaluate("""() => { const a=nfPickAdapter(); return [...document.querySelectorAll(a.itemSelector)].map(el => a.extract(el)).filter(Boolean).length; }""")
    assert found == 0, "article bodies must not be treated as news list cards"
    spacing = browser.new_page(viewport={"width": 700, "height": 600})
    spacing.set_content('<style>.story { margin-bottom: 32px; height: 80px; }</style><div class="story" id="before">기사</div><div class="story nf-collapsed"><button class="nf-stub">접힌 기사</button><div>숨긴 기사</div></div><div class="story" id="after">기사</div>')
    spacing.add_style_tag(path=str(root / "extension/src/content.css"))
    gaps = spacing.evaluate("""() => { const a=document.querySelector('#before').getBoundingClientRect(), b=document.querySelector('.nf-stub').getBoundingClientRect(), c=document.querySelector('#after').getBoundingClientRect(); return {top:b.top-a.bottom,bottom:c.top-b.bottom}; }""")
    assert abs(gaps["top"] - gaps["bottom"]) <= 1, gaps
    popup = browser.new_page(viewport={"width": 360, "height": 800})
    popup.set_content((root / "extension/src/popup.html").read_text())
    popup.add_script_tag(content="""globalThis.saved={ userOverrides:{'https://news.example.com/article/1':'keep'}, manualArticles:{'https://news.example.com/article/2':'직접 지정 제목'} }; globalThis.chrome={storage:{sync:{get:async d=>({...d,...saved}),set:async v=>Object.assign(saved,v)},local:{setAccessLevel:async()=>{},get:async d=>d}},tabs:{query:async()=>[]},runtime:{sendMessage:async()=>({ok:true})}};""")
    popup.add_script_tag(path=str(root / "extension/src/popup.js"))
    popup.locator("summary", has_text="저장한 기사 설정").click()
    popup.wait_for_timeout(100)
    assert popup.locator("#savedArticles li").count() == 2
    popup.locator("#savedArticles button").first.click()
    popup.wait_for_timeout(100)
    assert popup.locator("#savedArticles li").count() == 1
    assert popup.evaluate("() => Object.keys(saved.userOverrides).length") == 0
    popup.locator("summary", has_text="설정 백업").click()
    popup.locator("#importSettings").set_input_files({"name":"settings.json", "mimeType":"application/json", "buffer":b'{"version":1,"settings":{"enabled":false,"apiKey":"must-not-import"}}'})
    popup.wait_for_timeout(100)
    assert popup.evaluate("() => saved.enabled === false && saved.apiKey === undefined"), "import accepts only allowed preference keys"
    popup.locator("#importSettings").set_input_files({"name":"bad.json", "mimeType":"application/json", "buffer":b'{"version":1,"settings":{"mode":"invalid"}}'})
    popup.wait_for_timeout(100)
    assert "올바르지" in popup.locator("#status").inner_text()
    popup.screenshot(path="/tmp/notforme-saved-settings.png")
    browser.close()
print("browser section fixture and manual selection tests passed")

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
    page.add_script_tag(content="""globalThis.messageListener = null; globalThis.chrome = { storage: {sync: {get: async defaults => ({...defaults, debug: true})}, onChanged: {addListener() {}}}, runtime: {getURL: path => path, onMessage: {addListener(fn) {messageListener = fn}}, sendMessage: async msg => msg.type === 'classify' ? {ok:true, results:Object.fromEntries(msg.items.map(item => [item.id, {kind:{news:1},source:'model'}]))} : {ok:true}} };""")
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
    assert page.locator(".nf-picker-banner").count() == 0
    page.evaluate("() => messageListener({type:'pickArticle'}, {}, () => {})")
    page.keyboard.press("Escape")
    assert page.locator(".nf-picker-banner").count() == 0
    browser.close()
print("browser section fixture and manual selection tests passed")

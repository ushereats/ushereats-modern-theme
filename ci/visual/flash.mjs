// Opening a title from the home page, recorded as a video, to catch flashes between pages.
// Writes <out>/flash/video.webm, a frame-by-frame brightness list, frame pictures and the click times.
// node ci/visual/flash.mjs <outdir>   (needs ci-session.json from setup.sh)
import { chromium, webkit, devices } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const out = (process.argv[2] || "shots") + "/flash";
fs.mkdirSync(out + "/frames", { recursive: true });
const s = JSON.parse(fs.readFileSync("ci-session.json", "utf8"));
const H = { Authorization: `MediaBrowser Client="ci", Device="ci", DeviceId="ci-flash", Version="1.0", Token="${s.token}"`, "Content-Type": "application/json" };
const PID = "01c723cc-57de-4e19-b13c-514b644491a5";
const cfg = await fetch(s.server + `/Plugins/${PID}/Configuration`, { headers: H }).then((r) => r.ok ? r.json() : null).catch(() => null);
if (cfg) { cfg.AmbientBackground = true; await fetch(s.server + `/Plugins/${PID}/Configuration`, { method: "POST", headers: H, body: JSON.stringify(cfg) }).catch(() => {}); }

const creds = JSON.stringify({ Servers: [{ ManualAddress: s.server, manualAddressOnly: true, Id: s.serverId, Name: "ci", DateLastAccessed: Date.now(), LastConnectionMode: 2, AccessToken: s.token, UserId: s.userId }] });
const ffSet = s.forceFeatures ? `localStorage.setItem('tb-force-features', ${JSON.stringify(s.forceFeatures)});` : "";
const init = `(function(){ try{ sessionStorage.setItem('jf-welcomed','1'); localStorage.setItem('jellyfin_credentials', ${JSON.stringify(creds)}); ${ffSet} }catch(e){} })();`;

const chromiumExe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined;
const browser = await chromium.launch({ executablePath: chromiumExe, args: ["--force-color-profile=srgb"] });
const ctx = await browser.newContext({ locale: "en-US", timezoneId: "Australia/Sydney", viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
await ctx.addInitScript(init);
const page = await ctx.newPage();
const t0 = Date.now();
const marks = [];
const mark = (what) => { marks.push({ t: (Date.now() - t0) / 1000, what }); console.log(marks[marks.length - 1]); };

await page.goto(s.server + "/web/index.html#/home", { waitUntil: "load" });
await page.waitForTimeout(7000);
// cards of movies / shows on the home page
const ids = await page.evaluate(() => {
  const meta = window.tbItemMeta || {};
  const typeOf = (c) => c.getAttribute("data-type") || (meta[c.getAttribute("data-id")] || {}).Type || "";
  return Array.from(document.querySelectorAll(".card[data-id]")).filter((c) => c.getClientRects().length && /^(Movie|Series)$/.test(typeOf(c)))
    .map((c) => c.getAttribute("data-id")).filter((id, i, a) => a.indexOf(id) === i).slice(0, 3);
});
const swInfo = await page.evaluate(async () => ({ regs: navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope + " " + (r.active && r.active.scriptURL)) : "no sw api", ctrl: !!(navigator.serviceWorker && navigator.serviceWorker.controller), file: await fetch("serviceworker.js").then((r) => r.status + " " + r.headers.get("content-type") + "\n" + r.headers.get("cache-control")).catch((e) => String(e)), body: await fetch("serviceworker.js").then((r) => r.text()).then((t) => t.length + " chars: " + t.slice(0, 1500)).catch(() => "") }));
fs.writeFileSync(out + "/sw.json", JSON.stringify(swInfo, null, 1));
const radius = await page.evaluate(() => [...document.querySelectorAll("#indexPage .card[data-id]")].slice(0, 12).map((c) => { const sc = c.querySelector(".cardScalable"), im = c.querySelector(".cardImageContainer"); return c.className.split(" ").slice(0, 3).join(".") + " scalable=" + (sc && getComputedStyle(sc).borderRadius) + " image=" + (im && getComputedStyle(im).borderRadius) + " w=" + Math.round(c.getBoundingClientRect().width); }));
fs.writeFileSync(out + "/radius.txt", radius.join("\n"));
const counts = await page.evaluate(() => ({ cards: document.querySelectorAll(".card[data-id]").length, types: Array.from(document.querySelectorAll(".card[data-id]")).slice(0, 8).map((c) => c.getAttribute("data-type")) }));
mark("home " + JSON.stringify(counts));
mark("cards " + ids.join(","));
async function open(id, label) {
  const card = page.locator(`.card[data-id="${id}"]`).first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(600);
  mark("click " + label);
  // a click on the poster, as the browser sends it (a covering layer can stop Playwright's own click)
  await card.evaluate((c) => { const t = c.querySelector("a.cardImageContainer, .cardImageContainer, a") || c; t.click(); });
  // requests the server really got for this click (to spot the same thing asked for twice)
  if (label === "another") { const seen = []; const on = (r) => seen.push(r.url().replace(/^https?:\/\/[^/]+/, "").slice(0, 120) + (/config\.json/.test(r.url()) ? " [" + r.resourceType() + " " + (r.frame() === page.mainFrame() ? "main" : "frame") + " sw=" + !!r.serviceWorker() + "] " + JSON.stringify(r.headers()["cache-control"] || "") : "")); page.on("request", on); await page.waitForTimeout(2500); page.off("request", on); fs.writeFileSync(out + "/requests-open.txt", seen.join("\n")); }
  // what's really on screen during the change (screenshots, not the video)
  if (label === "same again") for (let i = 0; i < 14; i++) { await page.screenshot({ path: `${out}/seq-open-${String(i).padStart(2, "0")}.jpg`, quality: 60, type: "jpeg" }); }
  await page.waitForTimeout(3000);
  mark("back " + label);
  await page.goBack();
  if (label === "same again") for (let i = 0; i < 14; i++) { await page.screenshot({ path: `${out}/seq-back-${String(i).padStart(2, "0")}.jpg`, quality: 60, type: "jpeg" }); }
  await page.waitForTimeout(2500);
}
if (ids[0]) await open(ids[0], "first-ever (no stand-in yet)");
if (ids[0]) await open(ids[0], "same again");
if (ids[1]) await open(ids[1], "another");
if (ids[2]) await open(ids[2], "third");
// ── PERMANENT: back-nav and home-nav transition tests ──────────────────────
// Back: home must land instantly at the saved scroll position (no scroll drift, no blank frame).
// Home button: home must cross-fade in from top (no frozen detail page, no hard cut).
// FAIL conditions (set process.exitCode=1):
//   back-nav:  final y ≠ saved y; any frame is blank/all-black; any frame shows y=0 when saved y≠0
//   home-nav:  final y ≠ 0; any frame is blank/all-black; transition takes >800ms to start moving
{
  const sc = [];
  const navFailed = [];
  const sample = async (label, ms) => { const end = Date.now() + ms; while (Date.now() < end) { sc.push(label + " " + (Date.now() - t0) + " y=" + await page.evaluate(() => Math.round(window.scrollY)) + " vt=" + await page.evaluate(() => document.documentElement.classList.contains("tb-vt"))); await page.waitForTimeout(40); } };
  // Detect a blank/all-black frame by checking average pixel brightness via canvas
  const isBlankFrame = async () => { try { return await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 16; c.height = 16; const ctx = c.getContext("2d"); if (!ctx) return false; ctx.drawImage(document.documentElement, 0, 0, 16, 16); const d = ctx.getImageData(0, 0, 16, 16).data; let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i+1] + d[i+2]; return sum / (d.length / 4 * 3) < 5; }); } catch { return false; } };
  await page.evaluate(() => window.scrollTo(0, 900));
  await page.waitForTimeout(800);
  const savedY = await page.evaluate(() => Math.round(window.scrollY));
  const deep = await page.evaluate(() => { const h = window.innerHeight; return [...document.querySelectorAll(".card[data-id]")].find((c) => { const r = c.getBoundingClientRect(); return r.top > 0 && r.bottom < h && /^(Movie|Series)$/.test(c.getAttribute("data-type") || ""); })?.getAttribute("data-id"); });
  sc.push("start y=" + savedY + " card=" + deep);
  if (deep) {
    // ── back navigation test ──────────────────────────────────────────────
    // Open a title page, then go back; capture frames every 16ms during the transition.
    await page.locator(`.card[data-id="${deep}"]`).first().evaluate((c) => { const t = c.querySelector("a.cardImageContainer, .cardImageContainer, a") || c; t.click(); });
    await sample("open", 3000);
    mark("back-nav start y=" + await page.evaluate(() => Math.round(window.scrollY)));
    const backP = page.goBack();
    const backFrames = [];
    for (let i = 0; i < 38; i++) {
      const p = `${out}/seq-back-${String(i).padStart(2, "0")}.jpg`;
      await page.screenshot({ path: p, quality: 70, type: "jpeg" });
      const y = await page.evaluate(() => Math.round(window.scrollY));
      const blank = await isBlankFrame();
      backFrames.push({ i, y, blank });
      await page.waitForTimeout(16);
    }
    await backP;
    await sample("back", 2000);
    const backEndY = await page.evaluate(() => Math.round(window.scrollY));
    mark("back-nav end y=" + backEndY);
    // FAIL: landed at wrong position
    if (Math.abs(backEndY - savedY) > 2) { navFailed.push(`back-nav: landed at y=${backEndY}, expected y≈${savedY}`); process.exitCode = 1; }
    // FAIL: any frame was blank/all-black
    const backBlank = backFrames.filter((f) => f.blank);
    if (backBlank.length) { navFailed.push(`back-nav: ${backBlank.length} blank frame(s) at frames ${backBlank.map((f)=>f.i).join(",")}`); process.exitCode = 1; }
    // FAIL: any frame showed y=0 when savedY is not 0 (would reveal the top-scroll bug)
    if (savedY > 50) { const wrongY = backFrames.filter((f) => f.y < 10); if (wrongY.length) { navFailed.push(`back-nav: ${wrongY.length} frame(s) at y≈0 (should be ~${savedY}): frames ${wrongY.map((f)=>f.i).join(",")}`); process.exitCode = 1; } }
    // FAIL: browser-back must keep y=savedY in every frame (no position drift during transition)
    if (savedY > 50) { const driftY = backFrames.filter((f) => Math.abs(f.y - savedY) > 50); if (driftY.length) { navFailed.push(`back-nav: ${driftY.length} frame(s) drifted from y≈${savedY}: frames ${driftY.map((f)=>f.i+":y="+f.y).join(",")}`); process.exitCode = 1; } }
    // ── home-button navigation test ───────────────────────────────────────
    // Open a title page from the restored position, then click the home/logo button.
    await page.locator(`.card[data-id="${deep}"]`).first().evaluate((c) => { const t = c.querySelector("a.cardImageContainer, .cardImageContainer, a") || c; t.click(); });
    await page.waitForTimeout(3000);
    const home = page.locator(".headerHomeButton, a[href='#/home'], a[href='#!/home'], .ue-header a[href], .pageTitleWithLogo, a.headerLogo").first();
    sc.push("home button found=" + (await home.count()));
    mark("home-nav start");
    const homeNavT0 = Date.now();
    if (await home.count()) { await home.evaluate((el) => (el.closest("a[href], button") || el).click()); }
    else await page.evaluate(() => { location.hash = "#/home"; });
    const homeFrames = [];
    let firstMoveMs = -1;
    for (let i = 0; i < 38; i++) {
      const p = `${out}/seq-home-${String(i).padStart(2, "0")}.jpg`;
      await page.screenshot({ path: p, quality: 70, type: "jpeg" });
      const y = await page.evaluate(() => Math.round(window.scrollY));
      const hash = await page.evaluate(() => location.hash);
      const blank = await isBlankFrame();
      const ms = Date.now() - homeNavT0;
      if (firstMoveMs < 0 && /home/.test(hash)) firstMoveMs = ms;
      homeFrames.push({ i, y, blank, ms, home: /home/.test(hash) });
      await page.waitForTimeout(16);
    }
    await sample("home", 2000);
    const homeEndY = await page.evaluate(() => Math.round(window.scrollY));
    mark("home-nav end y=" + homeEndY);
    // FAIL: didn't land at top
    if (homeEndY > 10) { navFailed.push(`home-nav: landed at y=${homeEndY}, expected y≈0`); process.exitCode = 1; }
    // FAIL: any frame was blank/all-black
    const homeBlank = homeFrames.filter((f) => f.blank);
    if (homeBlank.length) { navFailed.push(`home-nav: ${homeBlank.length} blank frame(s) at frames ${homeBlank.map((f)=>f.i).join(",")}`); process.exitCode = 1; }
    // FAIL: transition took >800ms to start moving to home (frozen detail-page bug)
    if (firstMoveMs > 800) { navFailed.push(`home-nav: hash didn't change to #/home until ${firstMoveMs}ms after click (threshold 800ms)`); process.exitCode = 1; }
    // FAIL: any frame after hash shows #/home is not at y=0 (logo must always land at top)
    const homeWrongY = homeFrames.filter((f) => f.home && f.y > 10);
    if (homeWrongY.length) { navFailed.push(`home-nav: ${homeWrongY.length} frame(s) at y>0 after hash=#/home (should be y=0): frames ${homeWrongY.map((f)=>f.i).join(",")}`); process.exitCode = 1; }
    if (navFailed.length) { sc.push("FAILURES: " + navFailed.join("; ")); console.error("\n── nav test FAILURES ──"); navFailed.forEach((f) => console.error("  FAIL " + f)); }
    else sc.push("nav tests PASSED");
  }
  fs.writeFileSync(out + "/scroll.txt", sc.join("\n"));
}
// hover look on a poster, then a title's back arrow: hovered (grows) and clicked
if (ids[1]) {
  const card = page.locator(`.card[data-id="${ids[1]}"]`).first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.hover().catch(() => {});
  await page.waitForTimeout(700);
  const bx = await card.boundingBox().catch(() => null);
  if (bx) await page.screenshot({ path: out + "/hover.png", clip: { x: Math.max(0, bx.x - 20), y: Math.max(0, bx.y - 20), width: Math.min(400, bx.width + 40), height: Math.min(600, bx.height + 40) } });
  await page.evaluate(() => window.scrollBy(0, 300)); await page.waitForTimeout(500);
  const yBefore = await page.evaluate(() => Math.round(window.scrollY));
  mark("click arrow-test y=" + yBefore);
  await card.evaluate((c) => { const t = c.querySelector("a.cardImageContainer, .cardImageContainer, a") || c; t.click(); });
  await page.waitForTimeout(3000);
  const back = page.locator(".ue-details-back").first();
  if (await back.count()) {
    await page.screenshot({ path: out + "/arrow-off.png", clip: { x: 0, y: 0, width: 220, height: 110 } });
    await back.hover().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: out + "/arrow-on.png", clip: { x: 0, y: 0, width: 220, height: 110 } });
    mark("back-arrow click");
    // ── PERMANENT: on-page back arrow must restore the saved scroll position ──
    // Capture dense frames from the click so any blurry frame or wrong scroll is visible.
    await back.click().catch(() => {});
    const arrowFrames = [];
    for (let i = 0; i < 38; i++) {
      await page.screenshot({ path: `${out}/seq-arrow-${String(i).padStart(2, "0")}.jpg`, quality: 70, type: "jpeg" });
      arrowFrames.push({ i, y: await page.evaluate(() => Math.round(window.scrollY)) });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(1500);
    const arrowEndY = await page.evaluate(() => Math.round(window.scrollY));
    mark("after back arrow y=" + arrowEndY + " (was " + yBefore + ")");
    // FAIL: arrow back must land at the saved position, not the top
    if (Math.abs(arrowEndY - yBefore) > 2) { console.error("  FAIL arrow-back: landed at y=" + arrowEndY + ", expected y≈" + yBefore); process.exitCode = 1; }
    // FAIL: any frame showed y=0 when yBefore is not 0 (would reveal the top-scroll bug)
    if (yBefore > 50) { const wrongY = arrowFrames.filter((f) => f.y < 10); if (wrongY.length) { console.error("  FAIL arrow-back: " + wrongY.length + " frame(s) at y≈0 (should be ~" + yBefore + ")"); process.exitCode = 1; } }
    // FAIL: on-page back arrow must keep y=yBefore in every frame (no position drift)
    if (yBefore > 50) { const driftY = arrowFrames.filter((f) => Math.abs(f.y - yBefore) > 50); if (driftY.length) { console.error("  FAIL arrow-back: " + driftY.length + " frame(s) drifted from y≈" + yBefore + ": " + driftY.slice(0,5).map((f)=>"f"+f.i+":y="+f.y).join(",")); process.exitCode = 1; } }
  }
}
// a library page: the image links it asks for (sharpness, WebP) and how fast it shows the second time
const imgs = [];
page.on("request", (r) => { if (/\/Images\/(Primary|Thumb)/.test(r.url())) imgs.push(r.url().replace(/^https?:\/\/[^/]+/, "")); });
const views = await fetch(s.server + `/Users/${s.userId}/Views`, { headers: H }).then((r) => r.json()).catch(() => ({ Items: [] }));
const lib = (views.Items || []).find((v) => v.CollectionType === "movies") || (views.Items || [])[0];
const libTimes = [];
if (lib) {
  for (let i = 0; i < 2; i++) {
    const ts = Date.now();
    mark("library " + i);
    await page.evaluate((id) => { location.hash = "#/movies?topParentId=" + id + "&collectionType=movies"; }, lib.Id);
    await page.waitForSelector(".page:not(.hide) .card[data-id]", { timeout: 15000 }).catch(() => {});
    libTimes.push(Date.now() - ts);
    await page.waitForTimeout(1500);
    if (i === 0) await page.screenshot({ path: out + "/library.png" });
    await page.evaluate(() => { location.hash = "#/home"; });
    await page.waitForTimeout(2000);
  }
}
const webp = await page.evaluate(() => window.__tbImgFmt);
const vt = await page.evaluate(() => window.__tbVt || null);
fs.writeFileSync(out + "/vt.json", JSON.stringify(vt, null, 1));
fs.writeFileSync(out + "/library.json", JSON.stringify({ libTimes, webp, imgs: imgs.slice(0, 40) }, null, 1));
// the settings page, and its search
await page.evaluate(() => { location.hash = "#/configurationpage?name=UshereatsTheme"; });
await page.waitForTimeout(4000);
await page.screenshot({ path: out + "/settings.png" });
const q = page.locator(".tb-cfg-search input").first();
if (await q.count()) { await q.fill("fade"); await page.waitForTimeout(500); await page.screenshot({ path: out + "/settings-search.png" }); }
// the device cache: reload home over a slow-ish connection (like a phone through Cloudflare: 150 ms each way,
// 20 Mbit/s), with the device cache and without it, and time until the first poster is on screen
async function timed(pg, label) {
  const cdp = await pg.context().newCDPSession(pg);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 2.5e6, uploadThroughput: 1e6 });
  let dev = 0, net = 0; const tl = [], t00 = Date.now();
  const on = (r) => { if (r.fromServiceWorker()) dev++; else net++; const u = r.url().replace(/^https?:\/\/[^/]+/, ""); if (!/\.(js|css|woff2?|png|svg|ico)(\?|$)/.test(u) && !/\/Images\//.test(u)) tl.push((Date.now() - t00) + "ms " + r.request().method() + " " + u.slice(0, 100) + (r.fromServiceWorker() ? " [device]" : "")); };
  pg.on("response", on);
  const t = Date.now();
  await pg.reload({ waitUntil: "commit" });
  const firstPaint = await pg.waitForFunction(() => document.querySelector("#homeTab .card[data-id]") && [...document.querySelectorAll("#homeTab .card[data-id]")].some((c) => c.getBoundingClientRect().height > 0 && getComputedStyle(c.closest(".tb-rows-c") || c).visibility !== "hidden"), null, { timeout: 30000 }).then(() => Date.now() - t).catch(() => -1);
  await pg.waitForTimeout(3000);
  pg.off("response", on);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  return { label, firstPosterMs: firstPaint, fromDevice: dev, fromNetwork: net, timeline: tl.slice(0, 50) };
}
await page.goto(s.server + "/web/index.html#/home", { waitUntil: "load" });
await page.waitForTimeout(3000);
const swRuns = [];
swRuns.push(await timed(page, "with device cache (1st reload)"));
swRuns.push(await timed(page, "with device cache (2nd reload)"));
swRuns.push({ controlled: await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller)), caches: await page.evaluate(async () => { if (!window.caches) return {}; const o = {}; for (const k of await window.caches.keys()) o[k] = (await (await window.caches.open(k)).keys()).length; return o; }) });
{
  const ctx2 = await browser.newContext({ locale: "en-US", viewport: { width: 1280, height: 720 }, serviceWorkers: "block" });
  await ctx2.addInitScript(init);
  const p2 = await ctx2.newPage();
  await p2.goto(s.server + "/web/index.html#/home", { waitUntil: "load" });
  await p2.waitForTimeout(6000);
  swRuns.push(await timed(p2, "without device cache (browser cache only)"));
  swRuns.push(await timed(p2, "without device cache (2nd)"));
  await ctx2.close();
}
fs.writeFileSync(out + "/device-cache.json", JSON.stringify(swRuns, null, 1));
const look = await page.evaluate(() => localStorage.getItem("tb-bd-look"));
await ctx.close();
await browser.close();
fs.writeFileSync(out + "/marks.json", JSON.stringify({ marks, look }, null, 1));

// ── PERMANENT: WebKit iPhone nav test ────────────────────────────────────────
// Run the same back-nav and home-nav tests on WebKit with an iPhone viewport.
try {
  const wkOut = out + "/webkit";
  fs.mkdirSync(wkOut, { recursive: true });
  const iPhone = devices["iPhone 13"];
  const wkBrowser = await webkit.launch();
  const wkCtx = await wkBrowser.newContext({ ...iPhone, locale: "en-US", timezoneId: "Australia/Sydney" });
  await wkCtx.addInitScript(init);
  const wkPage = await wkCtx.newPage();
  const wkSc = [];
  await wkPage.goto(s.server + "/web/index.html#/home", { waitUntil: "load" });
  await wkPage.waitForTimeout(7000);
  await wkPage.evaluate(() => window.scrollTo(0, 500));
  await wkPage.waitForTimeout(800);
  const wkDeep = await wkPage.evaluate(() => { const h = window.innerHeight; return [...document.querySelectorAll(".card[data-id]")].find((c) => { const r = c.getBoundingClientRect(); return r.top > 0 && r.bottom < h && /^(Movie|Series)$/.test(c.getAttribute("data-type") || ""); })?.getAttribute("data-id"); });
  wkSc.push("start y=" + await wkPage.evaluate(() => Math.round(window.scrollY)) + " card=" + wkDeep);
  if (wkDeep) {
    // back navigation
    await wkPage.locator(`.card[data-id="${wkDeep}"]`).first().evaluate((c) => { const t = c.querySelector("a.cardImageContainer, .cardImageContainer, a") || c; t.click(); });
    await wkPage.waitForTimeout(3000);
    const wkBackP = wkPage.goBack();
    for (let i = 0; i < 20; i++) { await wkPage.screenshot({ path: `${wkOut}/seq-back-${String(i).padStart(2, "0")}.jpg`, quality: 70, type: "jpeg" }); await wkPage.waitForTimeout(30); }
    await wkBackP;
    await wkPage.waitForTimeout(1500);
    wkSc.push("back y=" + await wkPage.evaluate(() => Math.round(window.scrollY)));
    // home-button navigation
    await wkPage.locator(`.card[data-id="${wkDeep}"]`).first().evaluate((c) => { const t = c.querySelector("a.cardImageContainer, .cardImageContainer, a") || c; t.click(); });
    await wkPage.waitForTimeout(3000);
    const wkHome = wkPage.locator(".headerHomeButton, a[href='#/home'], a[href='#!/home'], .ue-header a[href], .pageTitleWithLogo, a.headerLogo").first();
    wkSc.push("home button found=" + (await wkHome.count()));
    if (await wkHome.count()) { await wkHome.evaluate((el) => (el.closest("a[href], button") || el).click()); }
    else await wkPage.evaluate(() => { location.hash = "#/home"; });
    for (let i = 0; i < 20; i++) { await wkPage.screenshot({ path: `${wkOut}/seq-home-${String(i).padStart(2, "0")}.jpg`, quality: 70, type: "jpeg" }); await wkPage.waitForTimeout(30); }
    await wkPage.waitForTimeout(1500);
    wkSc.push("home y=" + await wkPage.evaluate(() => Math.round(window.scrollY)));
  }
  fs.writeFileSync(wkOut + "/scroll.txt", wkSc.join("\n"));
  await wkCtx.close();
  await wkBrowser.close();
  console.log("webkit nav test done");
} catch (e) { console.warn("webkit nav test failed:", e.message); }

const vid = fs.readdirSync(out).find((f) => f.endsWith(".webm"));
if (vid) fs.renameSync(`${out}/${vid}`, `${out}/video.webm`);
const ff = fs.existsSync("/usr/lib/jellyfin-ffmpeg/ffmpeg") ? "/usr/lib/jellyfin-ffmpeg/ffmpeg" : "ffmpeg";
try {
  execFileSync(ff, ["-v", "error", "-i", `${out}/video.webm`, "-vf", `scale=160:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${out}/yavg-raw.txt`, "-f", "null", "-"]);
  const lines = fs.readFileSync(`${out}/yavg-raw.txt`, "utf8").split("\n");
  let t = 0; const rows = [];
  for (const l of lines) { const m = /pts_time:([\d.]+)/.exec(l); if (m) t = +m[1]; const y = /YAVG=([\d.]+)/.exec(l); if (y) rows.push(t.toFixed(2) + " " + Math.round(+y[1])); }
  fs.writeFileSync(`${out}/yavg.txt`, rows.join("\n"));
  execFileSync(ff, ["-v", "error", "-i", `${out}/video.webm`, "-vf", "fps=25,scale=480:-1", "-q:v", "5", `${out}/frames/%04d.jpg`]);
} catch (e) { console.warn("ffmpeg not available, skipping video analysis:", e.code || e.message); }
console.log("flash done");

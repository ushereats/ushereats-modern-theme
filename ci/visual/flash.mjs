// Opening a title from the home page, recorded as a video, to catch flashes between pages.
// Writes <out>/flash/video.webm, a frame-by-frame brightness list, frame pictures and the click times.
// node ci/visual/flash.mjs <outdir>   (needs ci-session.json from setup.sh)
import { chromium } from "playwright";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const out = (process.argv[2] || "shots") + "/flash";
fs.mkdirSync(out + "/frames", { recursive: true });
const s = JSON.parse(fs.readFileSync("ci-session.json", "utf8"));
const H = { Authorization: `MediaBrowser Client="ci", Device="ci", DeviceId="ci-flash", Version="1.0", Token="${s.token}"`, "Content-Type": "application/json" };
const PID = "01c723cc-57de-4e19-b13c-514b644491a5";
const cfg = await fetch(s.server + `/Plugins/${PID}/Configuration`, { headers: H }).then((r) => r.json());
cfg.AmbientBackground = true;
await fetch(s.server + `/Plugins/${PID}/Configuration`, { method: "POST", headers: H, body: JSON.stringify(cfg) });

const creds = JSON.stringify({ Servers: [{ ManualAddress: s.server, manualAddressOnly: true, Id: s.serverId, Name: "ci", DateLastAccessed: Date.now(), LastConnectionMode: 2, AccessToken: s.token, UserId: s.userId }] });
const init = `(function(){ try{ sessionStorage.setItem('jf-welcomed','1'); localStorage.setItem('jellyfin_credentials', ${JSON.stringify(creds)}); }catch(e){} })();`;

const browser = await chromium.launch({ args: ["--force-color-profile=srgb"] });
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
// hover look on a poster, then a title's back arrow: hovered (grows) and clicked
if (ids[1]) {
  const card = page.locator(`.card[data-id="${ids[1]}"]`).first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  await card.hover().catch(() => {});
  await page.waitForTimeout(700);
  const bx = await card.boundingBox().catch(() => null);
  if (bx) await page.screenshot({ path: out + "/hover.png", clip: { x: Math.max(0, bx.x - 20), y: Math.max(0, bx.y - 20), width: Math.min(400, bx.width + 40), height: Math.min(600, bx.height + 40) } });
  mark("click arrow-test");
  await card.evaluate((c) => { const t = c.querySelector("a.cardImageContainer, .cardImageContainer, a") || c; t.click(); });
  await page.waitForTimeout(3000);
  const back = page.locator(".sleekfin-details-back").first();
  if (await back.count()) {
    await page.screenshot({ path: out + "/arrow-off.png", clip: { x: 0, y: 0, width: 220, height: 110 } });
    await back.hover().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: out + "/arrow-on.png", clip: { x: 0, y: 0, width: 220, height: 110 } });
    mark("back-arrow click");
    await back.click().catch(() => {});
    await page.waitForTimeout(2500);
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
const look = await page.evaluate(() => localStorage.getItem("tb-bd-look"));
await ctx.close();
await browser.close();
fs.writeFileSync(out + "/marks.json", JSON.stringify({ marks, look }, null, 1));

const vid = fs.readdirSync(out).find((f) => f.endsWith(".webm"));
fs.renameSync(`${out}/${vid}`, `${out}/video.webm`);
const ff = fs.existsSync("/usr/lib/jellyfin-ffmpeg/ffmpeg") ? "/usr/lib/jellyfin-ffmpeg/ffmpeg" : "ffmpeg";
execFileSync(ff, ["-v", "error", "-i", `${out}/video.webm`, "-vf", `scale=160:-1,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${out}/yavg-raw.txt`, "-f", "null", "-"]);
const lines = fs.readFileSync(`${out}/yavg-raw.txt`, "utf8").split("\n");
let t = 0; const rows = [];
for (const l of lines) { const m = /pts_time:([\d.]+)/.exec(l); if (m) t = +m[1]; const y = /YAVG=([\d.]+)/.exec(l); if (y) rows.push(t.toFixed(2) + " " + Math.round(+y[1])); }
fs.writeFileSync(`${out}/yavg.txt`, rows.join("\n"));
execFileSync(ff, ["-v", "error", "-i", `${out}/video.webm`, "-vf", "fps=25,scale=480:-1", "-q:v", "5", `${out}/frames/%04d.jpg`]);
console.log("flash done");

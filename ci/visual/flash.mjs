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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out, size: { width: 1280, height: 720 } } });
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
  await page.waitForTimeout(3000);
  mark("back " + label);
  await page.goBack();
  await page.waitForTimeout(2500);
}
if (ids[0]) await open(ids[0], "first-ever (no stand-in yet)");
if (ids[0]) await open(ids[0], "same again");
if (ids[1]) await open(ids[1], "another");
if (ids[2]) await open(ids[2], "third");
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

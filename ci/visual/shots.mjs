// Screenshots of the real Jellyfin pages for visual comparison (before/after a change).
// node ci/visual/shots.mjs <outdir>   (needs ci-session.json from setup.sh)
import { chromium } from "playwright";
import fs from "node:fs";

const out = process.argv[2] || "shots";
fs.mkdirSync(out, { recursive: true });
const s = JSON.parse(fs.readFileSync("ci-session.json", "utf8"));
const H = { Authorization: `MediaBrowser Client="ci", Device="ci", DeviceId="ci-visual", Version="1.0", Token="${s.token}"` };
const api = (p) => fetch(s.server + p, { headers: H }).then((r) => r.json());

const movies = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Movie&SortBy=SortName`)).Items;
const shows = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Series&SortBy=SortName`)).Items;
const eps = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Episode&ParentId=${shows[0].Id}&SortBy=SortName`)).Items;

const creds = JSON.stringify({ Servers: [{ ManualAddress: s.server, manualAddressOnly: true, Id: s.serverId, Name: "ci", DateLastAccessed: Date.now(), LastConnectionMode: 2, AccessToken: s.token, UserId: s.userId }] });
const init = (signedIn) => `
  (function(){ var x=7; Math.random=function(){ x=(x*16807)%2147483647; return (x-1)/2147483646; };
  try{ sessionStorage.setItem('jf-welcomed','1'); ${signedIn ? `localStorage.setItem('jellyfin_credentials', ${JSON.stringify(creds)});` : "localStorage.clear();"} }catch(e){} })();`;

const pages = [
  ["home", "#/home"],
  ["movie", `#/details?id=${movies[2].Id}&serverId=${s.serverId}`],
  ["series", `#/details?id=${shows[0].Id}&serverId=${s.serverId}`],
  ["episode", `#/details?id=${eps[2].Id}&serverId=${s.serverId}`],
  ["search", "#/search?tbq=the"],
  ["movies", `#/movies.html?topParentId=${s.movieLib}&collectionType=movies`],
];
const report = { errors: {} };
const browser = await chromium.launch();
for (const [vw, vh, tag] of [[1920, 1080, "desktop"], [390, 844, "phone"]]) {
  const ctx = await browser.newContext({ locale: "en-US", timezoneId: "Australia/Sydney", viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: tag === "phone", hasTouch: tag === "phone" });
  await ctx.addInitScript(init(true));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => (report.errors[tag] ||= []).push(String(e.message).slice(0, 300)));
  for (const [name, hash] of pages) {
    await page.goto(s.server + "/web/index.html" + hash, { waitUntil: "load" });
    await page.waitForTimeout(500);
    await page.reload({ waitUntil: "load" });         // second load = the normal "instant" case (warm caches)
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(3500);
    await page.mouse.move(5, vh - 5);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: true, animations: "disabled", caret: "hide" });
    await page.screenshot({ path: `${out}/${tag}-${name}-view.png`, animations: "disabled", caret: "hide" });
    if (name === "home") {
      // scrolled (header shrink) + hovering a poster (hover pop / hover card)
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${out}/${tag}-home-scrolled.png`, animations: "disabled", caret: "hide" });
      if (tag === "desktop") {
        const card = await page.$('.tb-rows-c [data-tb-row="latest-releases"] .card .cardScalable');
        if (card) { await card.hover(); await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/desktop-home-hover.png`, animations: "disabled", caret: "hide" }); }
      }
      await page.mouse.move(5, vh - 5);
    }
    // first painted frames after a reload (header / hero / rows appearing)
    if (name === "home" || name === "episode") {
      await page.evaluate(() => { window.__f = []; });
      await page.reload({ waitUntil: "commit" });
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(i === 0 ? 150 : 250);
        await page.screenshot({ path: `${out}/${tag}-${name}-early${i}.png`, animations: "disabled" });
      }
    }
  }
  await ctx.close();
}
const ctx = await browser.newContext({ locale: "en-US", timezoneId: "Australia/Sydney", viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(init(false));
const page = await ctx.newPage();
await page.goto(s.server + "/web/index.html#/login", { waitUntil: "load" });
await page.waitForTimeout(3000);
await page.screenshot({ path: `${out}/desktop-login.png`, animations: "disabled", caret: "hide" });
await browser.close();
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
console.log("shots done", JSON.stringify(report).slice(0, 500));

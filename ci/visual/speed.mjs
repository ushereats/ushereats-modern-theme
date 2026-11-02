// Page jumps (layout shifts, with what moved and by how much), work done after the first paint, and the size of
// title logos. node ci/visual/speed.mjs <outdir>   (needs ci-session.json from setup.sh)
import { chromium } from "playwright";
import fs from "node:fs";

const out = (process.argv[2] || "shots") + "/speed";
fs.mkdirSync(out, { recursive: true });
const s = JSON.parse(fs.readFileSync("ci-session.json", "utf8"));
const H = { Authorization: `MediaBrowser Client="ci", Device="ci", DeviceId="ci-speed", Version="1.0", Token="${s.token}"`, "Content-Type": "application/json" };
const api = (p) => fetch(s.server + p, { headers: H }).then((r) => r.json());
const PID = "01c723cc-57de-4e19-b13c-514b644491a5";
const cfg = await api(`/Plugins/${PID}/Configuration`);
cfg.AmbientBackground = true;
await fetch(s.server + `/Plugins/${PID}/Configuration`, { method: "POST", headers: H, body: JSON.stringify(cfg) });
const q = (p) => api(`/Items?userId=${s.userId}&Recursive=true&${p}`).then((r) => r.Items || []);
const [movie] = await q("IncludeItemTypes=Movie&SortBy=SortName&Limit=1");
const [series] = await q("IncludeItemTypes=Series&SortBy=SortName&Limit=1");
const [episode] = await q(`IncludeItemTypes=Episode&ParentId=${series.Id}&Limit=1`);

const creds = JSON.stringify({ Servers: [{ ManualAddress: s.server, manualAddressOnly: true, Id: s.serverId, Name: "ci", DateLastAccessed: Date.now(), LastConnectionMode: 2, AccessToken: s.token, UserId: s.userId }] });
const init = `(function(){ try{ sessionStorage.setItem('jf-welcomed','1'); localStorage.setItem('jellyfin_credentials', ${JSON.stringify(creds)}); }catch(e){} })();`;
const probe = `(function(){
  var R = window.__tbSpeed = { shifts: [], muts: {}, t0: performance.now(), on: true };
  function desc(n){ if(!n||!n.tagName) return String(n&&n.nodeName); var c=(typeof n.className==='string'?n.className:'').trim().split(/\\s+/).slice(0,3).join('.'); return n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+(c?'.'+c:''); }
  function rect(r){ return r ? [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)].join(',') : ''; }
  try { new PerformanceObserver(function(l){ l.getEntries().forEach(function(e){ if (e.hadRecentInput) return;
    var seen = [];
    (e.sources||[]).forEach(function(x){ var n=x.node; if(!n||!n.querySelectorAll) return;
      // what in it could actually be seen at that moment (painted, on screen)
      Array.prototype.slice.call(n.querySelectorAll('img,.cardImageContainer,h2,.sectionTitle,.cardText,bdi,.tb-row,.sleekfin-hero')).some(function(c){
        var cs=getComputedStyle(c), r=c.getBoundingClientRect();
        if (cs.visibility==='hidden'||cs.display==='none'||+cs.opacity===0||!r.width||!r.height||r.bottom<0||r.top>innerHeight) return false;
        for (var p=c; p&&p!==document.body; p=p.parentElement){ var ps=getComputedStyle(p); if(+ps.opacity===0||ps.visibility==='hidden') return false; }
        seen.push(desc(c)+' '+rect(r)); return seen.length>=3; }); });
    R.shifts.push({ at: Math.round(e.startTime), hash: location.hash.slice(0,30), v: +e.value.toFixed(4), visible: seen, src: (e.sources||[]).map(function(x){ return desc(x.node)+' '+rect(x.previousRect)+' -> '+rect(x.currentRect); }) }); }); })
    .observe({ type: 'layout-shift', buffered: true }); } catch(e) {}
  new MutationObserver(function(rs){ if(!R.on) return; var t=Math.round((performance.now()-R.t0)/250)*250; rs.forEach(function(r){
    var k = r.type+(r.attributeName?'['+r.attributeName+']':'')+' '+desc(r.target); var m=R.muts[k]||(R.muts[k]={n:0,first:t,last:t}); m.n++; m.last=t; }); })
    .observe(document, { subtree: true, childList: true, attributes: true, characterData: false });
})();`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.addInitScript(init);
await ctx.addInitScript(probe);
const logos = [];
ctx.on("response", async (r) => {
  if (/\/Images\/Logo/i.test(r.url())) { let kb = -1; try { kb = Math.round((await r.body()).length / 1024); } catch (e) {} logos.push({ url: r.url().replace(s.server, ""), kb, status: r.status() }); }
});
const page = await ctx.newPage();
const report = {};
async function measure(name, go, wait = 4000) {
  await go();
  await page.waitForTimeout(wait);
  report[name] = await page.evaluate(() => {
    const R = window.__tbSpeed;
    const muts = Object.entries(R.muts).sort((a, b) => b[1].n - a[1].n).slice(0, 25).map(([k, v]) => `${v.n}x ${k} (${v.first}-${v.last}ms)`);
    return { cls: +R.shifts.reduce((a, b) => a + b.v, 0).toFixed(4), shifts: R.shifts, muts };
  });
  console.log(name, JSON.stringify(report[name]).slice(0, 400));
}
await measure("home first visit", () => page.goto(s.server + "/web/index.html#/home", { waitUntil: "load" }), 6000);
await measure("home reload (rows from last visit)", () => page.reload({ waitUntil: "load" }), 6000);
await measure("movie (reload)", () => page.goto(s.server + `/web/index.html#/details?id=${movie.Id}&serverId=${s.serverId}`, { waitUntil: "load" }).then(() => page.reload({ waitUntil: "load" })));
await measure("series (reload)", () => page.goto(s.server + `/web/index.html#/details?id=${series.Id}&serverId=${s.serverId}`, { waitUntil: "load" }).then(() => page.reload({ waitUntil: "load" })));
await measure("episode (reload)", () => page.goto(s.server + `/web/index.html#/details?id=${episode.Id}&serverId=${s.serverId}`, { waitUntil: "load" }).then(() => page.reload({ waitUntil: "load" })));
report.logos = logos;
// moving around inside the app (like the in-app speed test): what moves after each page appears, and how long
// until something is on screen. Each one starts from home, as clicking in the header would.
{
  const items = (p) => q(p).then((r) => r[0]);
  const [boxset, album, artist, playlist, person] = await Promise.all([
    items("IncludeItemTypes=BoxSet&Limit=1"), items("IncludeItemTypes=MusicAlbum&Limit=1"), items("IncludeItemTypes=MusicArtist&Limit=1"),
    items("IncludeItemTypes=Playlist&Limit=1"), api(`/Persons?userId=${s.userId}&Limit=1`).then((r) => (r.Items || [])[0])]);
  const views = await api(`/Users/${s.userId}/Views`).then((r) => r.Items || []);
  const lib = (t) => views.find((v) => v.CollectionType === t);
  const d = (it) => it && `#/details?id=${it.Id}&serverId=${s.serverId}`;
  const targets = [
    ["favourites", "#/home?tab=1"],
    ["movies library", lib("movies") && `#/movies?topParentId=${lib("movies").Id}&collectionType=movies`],
    ["shows library", lib("tvshows") && `#/tv?topParentId=${lib("tvshows").Id}&collectionType=tvshows`],
    ["music library", lib("music") && `#/music?topParentId=${lib("music").Id}&collectionType=music`],
    ["collections", "#/list?type=BoxSet"],
    ["movie", d(movie)], ["series", d(series)], ["collection", d(boxset)], ["album", d(album)], ["artist", d(artist)],
    ["playlist", d(playlist)], ["person", d(person)], ["search", "#/search"], ["favourites again", "#/home?tab=1"],
  ].filter((t) => t[1]);
  const nav = {};
  await page.goto(s.server + "/web/index.html#/home", { waitUntil: "load" });
  await page.waitForTimeout(5000);
  for (const [name, hash] of targets) {
    await page.evaluate(() => { location.hash = "#/home"; });
    await page.waitForTimeout(2500);
    const reqs = [];
    const onReq = (r) => { const t0 = Date.now(); r.response().then(() => reqs.push({ ms: Date.now() - t0, url: r.url().replace(s.server, "").slice(0, 140) })).catch(() => {}); };
    page.on("request", onReq);
    const t0 = Date.now();
    await page.evaluate((h) => { const R = window.__tbSpeed; R.shifts = []; R.muts = {}; R.t0 = performance.now(); (window.__tbVt || []).length = 0; location.hash = h; }, hash);
    // shown = the page change finished (the cross-fade let go of the old page) and the new page has its content
    const readyMs = await page.waitForFunction((h) => {
      if (document.documentElement.classList.contains("tb-vt")) return false;
      const vis = [...document.querySelectorAll(".page:not(.hide)")].filter((x) => !x.closest(".hide") && x.getClientRects().length);
      const fav = /tab=1/.test(h);
      const p = fav ? vis.find((x) => x.id === "indexPage") : vis.find((x) => x.id !== "indexPage");
      if (!p) return false;
      const scope = fav ? [...p.querySelectorAll(".pageTabContent")].find((t) => t.id !== "homeTab" && t.getClientRects().length) : p;
      if (!scope) return false;
      const el = [...scope.querySelectorAll(".sleekfin-details-title, .itemName, .card[data-id], .listItem, input")].find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; });
      return !!el;
    }, hash, { timeout: 8000, polling: 16 }).then(() => Date.now() - t0).catch(() => -1);
    await page.waitForTimeout(2000);
    page.off("request", onReq);
    nav[name] = await page.evaluate(() => { const R = window.__tbSpeed; return { cls: +R.shifts.reduce((a, b) => a + b.v, 0).toFixed(4), shifts: R.shifts, muts: Object.entries(R.muts).sort((a, b) => b[1].n - a[1].n).slice(0, 12).map(([k, v]) => `${v.n}x ${k} (${v.first}-${v.last}ms)`) }; });
    nav[name].readyMs = readyMs;
    nav[name].vt = await page.evaluate(() => (window.__tbVt || []).map((x) => x[1]).filter((x) => !/^(kept|replayed|held)/.test(x)));
    nav[name].requests = reqs.sort((a, b) => b.ms - a.ms).slice(0, 12);
    console.log("nav", name, readyMs, nav[name].cls);
    await page.screenshot({ path: `${out}/nav-${name.replace(/\W+/g, "-")}.jpg`, quality: 55, type: "jpeg" });
  }
  report.nav = nav;
  // the gap Jellyfin keeps under its top bar, at a few screen sizes (library page and home)
  const bars = [];
  for (const [w, h] of [[390, 844], [844, 390], [820, 1180], [1280, 720], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    for (const hash of ["#/home", targets.find((t) => t[0] === "movies library")?.[1], targets.find((t) => t[0] === "collection")?.[1]].filter(Boolean)) {
      await page.evaluate((x) => { location.hash = x; }, hash);
      await page.waitForTimeout(2500);
      bars.push(await page.evaluate(([w, h, hash]) => {
        const sp = document.querySelector("header.MuiAppBar-root + div[aria-hidden='true']"), m = document.querySelector("main"), pg = [...document.querySelectorAll(".page:not(.hide)")].pop();
        const cs = sp && getComputedStyle(sp);
        return { w, h, hash: hash.slice(0, 14), spacer: sp && sp.getBoundingClientRect().height, spacerCss: cs && [cs.height, cs.minHeight, sp.className].join(" "), mainTop: m && m.getBoundingClientRect().top,
          page: pg && pg.id, pageTop: pg && pg.getBoundingClientRect().top, pagePad: pg && getComputedStyle(pg).paddingTop, headerH: getComputedStyle(document.documentElement).getPropertyValue("--sleekfin-header-height"), cls: document.documentElement.className.slice(0, 200) };
      }, [w, h, hash]));
    }
  }
  report.bars = bars;
}
// home reloads on video: does anything visibly move while it loads?
{
  const vctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: out + "/vid", size: { width: 1280, height: 720 } } });
  await vctx.addInitScript(init);
  const vp = await vctx.newPage();
  await vp.goto(s.server + "/web/index.html#/home", { waitUntil: "load" });
  await vp.waitForTimeout(5000);
  for (let i = 0; i < 3; i++) { await vp.reload({ waitUntil: "commit" }); await vp.waitForTimeout(4000); }
  await vctx.close();
  const { execFileSync } = await import("node:child_process");
  const vid = fs.readdirSync(out + "/vid").find((f) => f.endsWith(".webm"));
  fs.mkdirSync(out + "/frames", { recursive: true });
  const ff = fs.existsSync("/usr/lib/jellyfin-ffmpeg/ffmpeg") ? "/usr/lib/jellyfin-ffmpeg/ffmpeg" : "ffmpeg";
  execFileSync(ff, ["-v", "error", "-i", `${out}/vid/${vid}`, "-vf", "fps=25,scale=320:-1", "-q:v", "6", `${out}/frames/%04d.jpg`]);
}
fs.writeFileSync(out + "/report.json", JSON.stringify(report, null, 1));
await browser.close();
console.log("speed done");

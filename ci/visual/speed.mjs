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
fs.writeFileSync(out + "/report.json", JSON.stringify(report, null, 1));
await browser.close();
console.log("speed done");

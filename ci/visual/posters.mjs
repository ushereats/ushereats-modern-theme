// The "Custom posters" page: loads, changes the poster source order, applies it to the libraries (checked
// through the API), runs "Refresh all posters" to the end. Screenshots + report in <out>/posters.
import { chromium } from "playwright";
import fs from "node:fs";

const out = (process.argv[2] || "shots") + "/posters";
fs.mkdirSync(out, { recursive: true });
const s = JSON.parse(fs.readFileSync("ci-session.json", "utf8"));
const H = { Authorization: `MediaBrowser Client="ci", Device="ci", DeviceId="ci-posters", Version="1.0", Token="${s.token}"`, "Content-Type": "application/json" };
const api = (p) => fetch(s.server + p, { headers: H }).then((r) => r.json());
const report = {};
const libsBefore = await api("/Library/VirtualFolders");
const summary = (libs) => libs.map((l) => ({ name: l.Name, type: l.CollectionType, types: (l.LibraryOptions.TypeOptions || []).filter((t) => /^(Movie|Series|Season|BoxSet)$/.test(t.Type)).map((t) => `${t.Type}: on=[${t.ImageFetchers}] order=[${t.ImageFetcherOrder}] meta=[${t.MetadataFetchers}]`) }));
report.before = summary(libsBefore);

const creds = JSON.stringify({ Servers: [{ ManualAddress: s.server, manualAddressOnly: true, Id: s.serverId, Name: "ci", DateLastAccessed: Date.now(), LastConnectionMode: 2, AccessToken: s.token, UserId: s.userId }] });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.addInitScript(`(function(){ try{ sessionStorage.setItem('jf-welcomed','1'); localStorage.setItem('jellyfin_credentials', ${JSON.stringify(creds)}); }catch(e){} })();`);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.goto(s.server + "/web/index.html#/configurationpage?name=UshereatsTheme", { waitUntil: "load" });
await page.waitForTimeout(5000);
await page.click('.sleekfin-page-nav-button[data-sleekfin-panel="posters"]');
await page.waitForTimeout(3000);
const panel = page.locator('.sleekfin-page-panel[data-sleekfin-panel="posters"]');
await panel.screenshot({ path: `${out}/1-loaded.png` });
report.shown = await page.evaluate(() => ({
  libs: Array.from(document.querySelectorAll("#tbPLibs label")).map((l) => l.textContent.trim() + (l.querySelector("input").checked ? " [x]" : " [ ]")),
  sources: Array.from(document.querySelectorAll("#tbPSrc .tbp-row")).map((r) => r.textContent.replace(/\s+/g, " ").trim()),
  note: document.querySelector("#tbPNote").hidden ? null : document.querySelector("#tbPNote").textContent
}));
// change the order (last source up one place) and tick the second source too, then apply
const n = await page.locator("#tbPSrc .tbp-row").count();
if (n > 2) await page.click(`#tbPSrc [data-up="${n - 1}"]`);
const second = page.locator('#tbPSrc [data-src="1"]');
if (n > 1 && !(await second.isChecked())) await second.check();
await page.click("#tbPApply");
await page.waitForTimeout(3000);
report.applyStatus = await page.textContent("#tbPApplyStatus");
report.shownAfter = await page.evaluate(() => Array.from(document.querySelectorAll("#tbPSrc .tbp-row")).map((r) => r.textContent.replace(/\s+/g, " ").trim()));
await panel.screenshot({ path: `${out}/2-applied.png` });
report.after = summary(await api("/Library/VirtualFolders"));
// a real film (TMDb id) so a poster source actually has something: its poster must be replaced
const POST = (p, b) => fetch(s.server + p, { method: "POST", headers: H, body: JSON.stringify(b) });
const movies = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&Limit=2`)).Items;
const real = await api(`/Users/${s.userId}/Items/${movies[0].Id}`);
real.ProviderIds = Object.assign({}, real.ProviderIds, { Tmdb: "27205", Imdb: "tt1375666" });
report.setIds = (await POST(`/Items/${real.Id}`, real)).status;
const tagOf = async (id) => ((await api(`/Users/${s.userId}/Items/${id}`)).ImageTags || {}).Primary;
report.tagsBefore = { real: await tagOf(movies[0].Id), other: await tagOf(movies[1].Id) };
// refresh
await page.click("#tbPRefresh");
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(1000);
  const st = await api("/UshereatsTheme/Posters/Status");
  if (i === 1) await panel.screenshot({ path: `${out}/3-running.png` });
  if (!st.running && st.finishedUtc) { report.refresh = st; break; }
}
await page.waitForTimeout(2000);
report.tagsAfter = { real: await tagOf(movies[0].Id), other: await tagOf(movies[1].Id) };
const img = await fetch(s.server + `/Items/${movies[0].Id}/Images/Primary?maxWidth=400`, { headers: H });
fs.writeFileSync(out + "/real-movie-poster-after.jpg", Buffer.from(await img.arrayBuffer()));
report.refreshStatusText = await page.textContent("#tbPStatus");
await panel.screenshot({ path: `${out}/4-done.png` });
report.errors = errors;
report.realAfter = await api(`/Users/${s.userId}/Items/${movies[0].Id}`).then((x) => ({ ids: x.ProviderIds, tag: (x.ImageTags || {}).Primary }));
fs.writeFileSync(out + "/report.json", JSON.stringify(report, null, 1));
await browser.close();
console.log(JSON.stringify(report).slice(0, 1500));

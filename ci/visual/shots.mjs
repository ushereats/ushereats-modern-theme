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
  ["prefs", "#/mypreferencesmenu.html"],
  ["profile", `#/userprofile.html?userId=${s.userId}`],
  ["settings", "#/configurationpage?name=UshereatsTheme"],
];
const report = { errors: {} };
// Which of the theme's rules restyle something a built-in SleekFin rule also styles (same element, same property)?
const overrides = {};
async function collect(page, label) {
  const found = await page.evaluate(() => {
    const sheet = [...document.styleSheets].find((s) => s.href && s.href.includes("UshereatsTheme/theme.css"));
    if (!sheet) return { error: "no theme sheet" };
    const rules = [];
    let marker = -1;
    (function walk(list) {
      for (const r of list) {
        if (r.cssRules && r.media) { if (window.matchMedia(r.media.mediaText).matches) walk(r.cssRules); continue; }
        if (r.cssRules && r.conditionText !== undefined && !r.selectorText) { walk(r.cssRules); continue; }
        if (!r.selectorText) continue;
        if (r.selectorText === ".tb-sleek-end") { marker = rules.length; continue; }
        const props = [];
        for (let i = 0; i < r.style.length; i++) props.push(r.style[i]);
        if (!props.length) continue;
        rules.push({ sel: r.selectorText, props, vals: Object.fromEntries(props.map((p) => [p, r.style.getPropertyValue(p) + r.style.getPropertyPriority(p)])), imp: props.filter((p) => r.style.getPropertyPriority(p) === "important") });
      }
    })(sheet.cssRules);
    const out = [];
    const els = document.querySelectorAll("body *");
    const parts = rules.map((r) => r.sel.split(/,(?![^(]*\))/).map((s) => {
      const pseudo = (s.match(/::?(before|after|placeholder|-webkit-[a-z-]+|selection|marker)\b/) || [""])[0];
      return { css: s.replace(/::?(before|after|placeholder|-webkit-[a-z-]+|selection|marker)\b/g, "").replace(/:(hover|focus|focus-visible|focus-within|active)\b/g, "").trim() || "*", pseudo };
    }));
    const hits = new Map();
    for (let ri = 0; ri < rules.length; ri++) {
      for (const p of parts[ri]) {
        let list;
        try { list = document.querySelectorAll(p.css); } catch (e) { continue; }
        for (const el of list) {
          const key = el;
          if (!hits.has(key)) hits.set(key, []);
          hits.get(key).push({ ri, pseudo: p.pseudo });
        }
      }
    }
    const cand = [];
    for (const [el, hs] of hits) {
      const sleek = hs.filter((h) => h.ri < marker), theme = hs.filter((h) => h.ri > marker);
      for (const t of theme) for (const s of sleek) {
        if (t.pseudo !== s.pseudo) continue;
        const shared = rules[t.ri].props.filter((x) => rules[s.ri].props.includes(x));
        if (shared.length) cand.push({ el, pseudo: t.pseudo || null, t: rules[t.ri].sel.slice(0, 220), s: rules[s.ri].sel.slice(0, 220), shared, tv: rules[t.ri].vals, sv: rules[s.ri].vals });
      }
    }
    // Only real overrides count: the theme part must change the computed value of a property SleekFin sets.
    const read = () => cand.map((c) => { const cs = getComputedStyle(c.el, c.pseudo); return c.shared.map((p) => cs.getPropertyValue(p)); });
    const withTheme = read();
    const kill = document.createElement("style");
    kill.textContent = "*,*::before,*::after{transition:none!important;animation:none!important}";
    document.head.appendChild(kill);
    let top = -1;
    for (let i = 0; i < sheet.cssRules.length; i++) if (sheet.cssRules[i].selectorText === ".tb-sleek-end") top = i;
    const saved = [];
    while (sheet.cssRules.length > top + 1) { saved.unshift(sheet.cssRules[sheet.cssRules.length - 1].cssText); sheet.deleteRule(sheet.cssRules.length - 1); }
    const without = read();
    for (const r of saved) sheet.insertRule(r, sheet.cssRules.length);
    kill.remove();
    cand.forEach((c, i) => {
      const changed = c.shared.filter((p, j) => /^(transition|animation)/.test(p) ? c.tv[p].replace(/!?important$/, "") !== c.sv[p].replace(/!?important$/, "") : withTheme[i][j] !== without[i][j]);
      if (changed.length) out.push([c.t, c.s, changed.join(" ")]);
    });
    return { marker, rules: rules.length, pairs: out };
  });
  if (found.error) { overrides[label] = found; return; }
  for (const [t, s, p] of found.pairs) {
    const k = t + "\n   vs " + s;
    overrides[k] = overrides[k] || { props: p, pages: [] };
    if (!overrides[k].pages.includes(label)) overrides[k].pages.push(label);
  }
}
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
    await collect(page, `${tag}-${name}`);
    if (name === "home") {
      // (also analysed while scrolled and hovering, below)
      // scrolled (header shrink) + hovering a poster (hover pop / hover card)
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${out}/${tag}-home-scrolled.png`, animations: "disabled", caret: "hide" });
      await collect(page, `${tag}-home-scrolled`);
      if (tag === "desktop") {
        const card = await page.$('.tb-rows-c [data-tb-row="latest-releases"] .card .cardScalable');
        if (card) { await card.hover(); await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/desktop-home-hover.png`, animations: "disabled", caret: "hide" }); await collect(page, "desktop-home-hover"); }
      }
      await page.mouse.move(5, vh - 5);
    }
    if (name === "settings" && tag === "desktop") {
      // one Save for every tab: change a field, save, read the plugin settings back
      const before = await api("/Plugins/01c723cc-57de-4e19-b13c-514b644491a5/Configuration");
      await page.click('.sleekfin-page-nav-button[data-sleekfin-panel="search"]');
      await page.fill("#tb-SearchTitle", "CI saved");
      await page.click(".sleekfin-save-button");
      await page.waitForTimeout(2500);
      const after = await api("/Plugins/01c723cc-57de-4e19-b13c-514b644491a5/Configuration");
      // the speed test (Speed test tab)
      await page.click('.sleekfin-page-nav-button[data-sleekfin-panel="speed"]');
      await page.click("#tbBenchRun");
      await page.waitForFunction(() => /^Done/.test(document.querySelector("#tbBenchStatus").textContent), null, { timeout: 180000 }).catch(() => {});
      fs.writeFileSync(`${out}/speedtest.json`, await page.$eval("#tbBenchOut", (e) => e.value || ("(no result) " + document.querySelector("#tbBenchStatus").textContent)));
      report.settingsSave = { title: after.SearchTitle, rowsKept: after.HomeRowsJson === before.HomeRowsJson, accentKept: after.AccentColor === before.AccentColor,
        desktopLogo: after.Sleek && after.Sleek.HeaderDesktopLogoHeight, sleekKept: !!(after.Sleek && after.Sleek.HeaderHeight === before.Sleek.HeaderHeight) };
    }
    if (name === "home" && tag === "desktop") {
      // Jellyfin's own (hidden) home rows are no longer built, and saving settings keeps the server's home sections
      report.nativeHome = await page.evaluate(async () => {
        const urls = performance.getEntriesByType("resource").map((e) => e.name);
        const native = urls.filter((u) => /fields=Path/i.test(u) || /\/Items\/Latest\?userId=[^&]+&parentId=/i.test(u)).length;
        const sections = document.querySelectorAll("#homeTab > .sections:not(.tb-rows-c) .verticalSection:not(.hide)").length;
        const uid = ApiClient.getCurrentUserId();
        const url = ApiClient.getUrl("DisplayPreferences/usersettings", { userId: uid, client: "emby" });
        const auth = { Authorization: 'MediaBrowser Token="' + ApiClient.accessToken() + '"', "Content-Type": "application/json" };
        const seen = await (await fetch(url, { headers: auth })).json();          // what this browser is told
        const body = JSON.parse(JSON.stringify(seen)); body.CustomPrefs.tbCiProbe = "1";
        await fetch(url, { method: "POST", headers: auth, body: JSON.stringify(body) });   // a save, like Jellyfin's
        return { nativeRequests: native, nativeSectionsShown: sections, browserSees: seen.CustomPrefs.homesection0 };
      });
      report.serverPrefsAfterSave = await api(`/DisplayPreferences/usersettings?userId=${s.userId}&client=emby`).then((p) => ({ homesection0: p.CustomPrefs.homesection0 ?? null, probe: p.CustomPrefs.tbCiProbe ?? null }));
      report.logoHeader = await fetch(s.server + `/Items/${movies[0].Id}/Images/Logo`, { headers: H }).then((r) => ({ status: r.status, sized: r.headers.get("x-ushereats-logo") }));
      // the avatar opens the user menu (your picture + name on top)
      const av = await page.$("#tb-header-avatar");
      report.avatar = !!av;
      if (av) { await av.click(); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/desktop-usermenu.png`, animations: "disabled", caret: "hide" }); report.menuHead = !!(await page.$("#app-user-menu .tb-um-head")); await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
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
await collect(page, "desktop-login");
await browser.close();
fs.writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
fs.writeFileSync(`${out}/overrides.json`, JSON.stringify(overrides, null, 1));
console.log("shots done", JSON.stringify(report).slice(0, 500));

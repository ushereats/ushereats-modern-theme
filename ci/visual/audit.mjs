// Every page, menu and dialog Jellyfin has, with the theme on (ambient background on too), on a PC and a phone.
// Screenshots + checks per screen, plus how much the page works when you leave it alone (idle timers, frames, observers).
// node ci/visual/audit.mjs <outdir>   (needs ci-session.json from setup.sh)
import { chromium } from "playwright";
import fs from "node:fs";

const out = (process.argv[2] || "shots") + "/audit";
fs.mkdirSync(out, { recursive: true });
const s = JSON.parse(fs.readFileSync("ci-session.json", "utf8"));
const H = { Authorization: `MediaBrowser Client="ci", Device="ci", DeviceId="ci-audit", Version="1.0", Token="${s.token}"`, "Content-Type": "application/json" };
const api = (p, o = {}) => fetch(s.server + p, { headers: H, ...o }).then((r) => (r.status === 204 ? null : r.json()));
const q = (p) => api(`/Items?userId=${s.userId}&Recursive=true&${p}`).then((r) => (r && r.Items) || []);

// ambient background on for this check (the screenshot run keeps it off so pictures compare)
const PID = "01c723cc-57de-4e19-b13c-514b644491a5";
const cfg = await api(`/Plugins/${PID}/Configuration`);
cfg.AmbientBackground = true;
cfg.HoverCards = true;
await fetch(s.server + `/Plugins/${PID}/Configuration`, { method: "POST", headers: H, body: JSON.stringify(cfg) });

const [movie] = await q("IncludeItemTypes=Movie&SortBy=SortName&StartIndex=2&Limit=1");
const [series] = await q("IncludeItemTypes=Series&SortBy=SortName&Limit=1");
const [season] = await q(`IncludeItemTypes=Season&ParentId=${series.Id}&Limit=1`);
const [episode] = await q(`IncludeItemTypes=Episode&ParentId=${series.Id}&SortBy=SortName&StartIndex=2&Limit=1`);
const [boxset] = await q("IncludeItemTypes=BoxSet&Limit=1");
const playlists = await q("IncludeItemTypes=Playlist");
const [album] = await q("IncludeItemTypes=MusicAlbum&SortBy=SortName&Limit=1");
const [artist] = await q("IncludeItemTypes=MusicArtist&SortBy=SortName&Limit=1");
const [song] = await q("IncludeItemTypes=Audio&SortBy=SortName&Limit=1");
const people = (await api(`/Persons?userId=${s.userId}&limit=3`)) || { Items: [] };
const person = people.Items && people.Items[0];
const genres = (await api(`/Genres?userId=${s.userId}&limit=2`)) || { Items: [] };
const studios = (await api(`/Studios?userId=${s.userId}&limit=2`)) || { Items: [] };
const views = (await api(`/UserViews?userId=${s.userId}`)).Items;
const lib = (t) => views.find((v) => v.CollectionType === t);
const sid = s.serverId;
const det = (it) => (it ? `#/details?id=${it.Id}&serverId=${sid}` : null);

const pages = [
  ["home", "#/home"],
  ["home-favourites", "#/home?tab=1"],
  ["movies", lib("movies") && `#/movies?topParentId=${lib("movies").Id}&collectionType=movies`],
  ["shows", lib("tvshows") && `#/tv?topParentId=${lib("tvshows").Id}&collectionType=tvshows`],
  ["music", lib("music") && `#/music?topParentId=${lib("music").Id}&collectionType=music`],
  ["collections", lib("boxsets") && `#/list?parentId=${lib("boxsets").Id}&serverId=${sid}`],
  ["playlists", lib("playlists") && `#/list?parentId=${lib("playlists").Id}&serverId=${sid}`],
  ["movie", det(movie)],
  ["series", det(series)],
  ["season", det(season)],
  ["episode", det(episode)],
  ["person", det(person)],
  ["collection", det(boxset)],
  ["playlist-music", det(playlists.find((p) => /drive/i.test(p.Name)))],
  ["playlist-video", det(playlists.find((p) => /weekend/i.test(p.Name)))],
  ["album", det(album)],
  ["artist", det(artist)],
  ["song", det(song)],
  ["genre", genres.Items[0] && `#/list?genreId=${genres.Items[0].Id}&serverId=${sid}`],
  ["genre-details", det(genres.Items[0])],
  ["studio", studios.Items[0] && `#/list?studioId=${studios.Items[0].Id}&serverId=${sid}`],
  ["search", "#/search"],
  ["search-results", "#/search?tbq=the"],
  ["prefs", "#/mypreferencesmenu"],
  ["prefs-profile", `#/userprofile?userId=${s.userId}`],
  ["prefs-display", "#/mypreferencesdisplay"],
  ["prefs-home", "#/mypreferenceshome"],
  ["prefs-playback", "#/mypreferencesplayback"],
  ["prefs-subtitles", "#/mypreferencessubtitles"],
  ["prefs-controls", "#/mypreferencescontrols"],
  ["prefs-quickconnect", "#/quickconnect"],
  ["metadata-manager", "#/metadata"],
  ["dashboard", "#/dashboard"],
  ["dash-settings", "#/dashboard/settings"],
  ["dash-branding", "#/dashboard/branding"],
  ["dash-users", "#/dashboard/users"],
  ["dash-user", `#/dashboard/users/profile?userId=${s.userId}`],
  ["dash-libraries", "#/dashboard/libraries"],
  ["dash-lib-display", "#/dashboard/libraries/display"],
  ["dash-lib-metadata", "#/dashboard/libraries/metadata"],
  ["dash-lib-nfo", "#/dashboard/libraries/nfo"],
  ["dash-transcoding", "#/dashboard/playback/transcoding"],
  ["dash-resume", "#/dashboard/playback/resume"],
  ["dash-streaming", "#/dashboard/playback/streaming"],
  ["dash-trickplay", "#/dashboard/playback/trickplay"],
  ["dash-devices", "#/dashboard/devices"],
  ["dash-activity", "#/dashboard/activity"],
  ["dash-livetv", "#/dashboard/livetv"],
  ["dash-plugins", "#/dashboard/plugins"],
  ["dash-catalog", "#/dashboard/plugins/catalog"],
  ["dash-repos", "#/dashboard/plugins/repositories"],
  ["dash-networking", "#/dashboard/networking"],
  ["dash-keys", "#/dashboard/keys"],
  ["dash-backups", "#/dashboard/backups"],
  ["dash-logs", "#/dashboard/logs"],
  ["dash-tasks", "#/dashboard/tasks"],
  ["theme-settings", "#/configurationpage?name=UshereatsTheme"],
].filter((p) => p[1]);

// counts how much each script does while nothing happens
const counters = `
(function(){
  var C = window.__tbIdle = { on: false, by: {} };
  function who() { var st = (new Error().stack || "").split("\\n").slice(2).join(" "); return /UshereatsTheme|theme\\.js|part\\/|dashboard\\.js/.test(st) ? "theme" : "jellyfin"; }
  function hit(kind) { if (!C.on) return; var k = kind + ":" + who(); C.by[k] = (C.by[k] || 0) + 1; }
  var st = window.setTimeout, si = window.setInterval, raf = window.requestAnimationFrame;
  window.setTimeout = function (f) { var a = Array.prototype.slice.call(arguments); if (typeof f === "function") { var w = who(); a[0] = function () { if (C.on) { var k = "timeout:" + w; C.by[k] = (C.by[k] || 0) + 1; } return f.apply(this, arguments); }; } return st.apply(this, a); };
  window.setInterval = function (f) { var a = Array.prototype.slice.call(arguments); if (typeof f === "function") { var w = who(); a[0] = function () { if (C.on) { var k = "interval:" + w; C.by[k] = (C.by[k] || 0) + 1; } return f.apply(this, arguments); }; } return si.apply(this, a); };
  window.requestAnimationFrame = function (f) { var w = who(); return raf.call(this, function (t) { if (C.on) { var k = "frame:" + w; C.by[k] = (C.by[k] || 0) + 1; } return f(t); }); };
  var MO = window.MutationObserver;
  window.MutationObserver = function (cb) { var w = who(); C.observers = C.observers || {}; C.observers[w] = (C.observers[w] || 0) + 1; return new MO(function (r, o) { if (C.on) { var k = "observer:" + w; C.by[k] = (C.by[k] || 0) + 1; } return cb.call(this, r, o); }); };
  window.MutationObserver.prototype = MO.prototype;
})();`;

const creds = JSON.stringify({ Servers: [{ ManualAddress: s.server, manualAddressOnly: true, Id: s.serverId, Name: "ci", DateLastAccessed: Date.now(), LastConnectionMode: 2, AccessToken: s.token, UserId: s.userId }] });
const init = `(function(){ try{ sessionStorage.setItem('jf-welcomed','1'); localStorage.setItem('jellyfin_credentials', ${JSON.stringify(creds)}); }catch(e){} })();`;

const look = () => {
  const html = document.documentElement, body = document.body;
  const vis = (e) => { if (!e || !e.getClientRects().length) return false; const c = getComputedStyle(e); return c.visibility !== "hidden" && c.display !== "none" && +c.opacity > 0.05; };
  const amb = document.getElementById("tb-ambient");
  const layer = document.querySelector("#tb-ambient .tb-amb-layer.on");
  const page = Array.from(document.querySelectorAll(".page:not(.hide)")).find((p) => !p.closest(".hide") && p.getClientRects().length);
  const bgOf = (e) => (e ? getComputedStyle(e).backgroundColor + " " + getComputedStyle(e).backgroundImage.slice(0, 40) : null);
  // Jellyfin's own look still showing: plain emby buttons / old raised buttons / old dialogs that the theme didn't restyle
  const oldButtons = Array.from(document.querySelectorAll("button.raised:not(.button-submit), .emby-button.raised, .paper-icon-button-light.raised")).filter(vis).length;
  const dialogs = Array.from(document.querySelectorAll(".dialog, .actionSheet, [role=dialog], .MuiPopover-paper, .MuiMenu-paper, .MuiDialog-paper")).filter(vis).map((d) => {
    const c = getComputedStyle(d); return (d.className || d.tagName).toString().split(/\s+/).slice(0, 3).join(".") + ` bg=${c.backgroundColor} radius=${c.borderRadius} font=${c.fontFamily.split(",")[0]}`;
  });
  const fonts = {};
  Array.from(document.querySelectorAll("h1,h2,h3,p,span,button,a,div.cardText,label,td")).filter(vis).slice(0, 400).forEach((e) => { if (!e.childElementCount && (e.textContent || "").trim()) { const f = getComputedStyle(e).fontFamily.split(",")[0].replace(/["']/g, "").trim(); fonts[f] = (fonts[f] || 0) + 1; } });
  return {
    hash: location.hash.slice(0, 80),
    pageId: page ? page.id || page.className.split(/\s+/).slice(0, 3).join(".") : null,
    ambient: amb ? (layer ? "on" : "no-picture") : "none",
    ambientMode: Array.from(html.classList).filter((c) => /^tb-ambient/.test(c)).join(" "),
    bodyBg: bgOf(body), pageBg: bgOf(page),
    header: vis(document.querySelector("[data-sleekfin-header]")),
    sideways: html.scrollWidth > innerWidth + 1,
    oldButtons, dialogs, fonts,
    errorsShown: Array.from(document.querySelectorAll(".toast, .MuiAlert-root")).filter(vis).map((e) => e.textContent.trim().slice(0, 80)),
  };
};

const report = { pages: {}, menus: {}, idle: {}, errors: [] };
const browser = await chromium.launch();
for (const [tag, vw, vh, mobile] of [["pc", 1920, 1080, false], ["phone", 390, 844, true]]) {
  const ctx = await browser.newContext({ locale: "en-US", timezoneId: "Australia/Sydney", viewport: { width: vw, height: vh }, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript(init);
  await ctx.addInitScript(counters);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => report.errors.push(`${tag} ${String(e.message).slice(0, 200)}`));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|favicon|HLS/.test(m.text())) report.errors.push(`${tag} console: ${m.text().slice(0, 200)}`); });
  const shot = (name) => page.screenshot({ path: `${out}/${tag}-${name}.png`, animations: "disabled", caret: "hide" }).catch(() => {});
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {}); await page.waitForTimeout(2200); };
  const esc = async () => { await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(400); };

  await page.goto(s.server + "/web/index.html#/home", { waitUntil: "load" });
  await page.waitForTimeout(3000);
  for (const [name, hash] of pages) {
    if (tag === "phone" && /^dash-/.test(name)) continue;
    try {
      await go(hash);
      await page.mouse.move(vw - 3, vh - 3).catch(() => {});
      await shot(name);
      report.pages[`${tag}-${name}`] = await page.evaluate(look);
    } catch (e) { report.pages[`${tag}-${name}`] = { error: String(e.message).slice(0, 160) }; }
  }

  // ── menus and dialogs ──
  const menu = async (name, open) => {
    try {
      const r = await open();
      if (r === false) { report.menus[`${tag}-${name}`] = { skipped: true }; return; }
      await page.waitForTimeout(900);
      await shot("menu-" + name);
      report.menus[`${tag}-${name}`] = await page.evaluate(look);
    } catch (e) { report.menus[`${tag}-${name}`] = { error: String(e.message).slice(0, 160) }; }
    await esc(); await esc();
  };
  const click = async (sel) => { const l = page.locator(sel).first(); if (!(await l.count())) return false; await l.click({ timeout: 4000 }); return true; };
  const byText = async (re) => { const l = page.locator(".actionSheetMenuItem, [role=menuitem], .listItem-button, button").filter({ hasText: re }).first(); if (!(await l.count())) return false; await l.click({ timeout: 4000 }); return true; };

  await go("#/home");
  // top bar buttons, one at a time (SyncPlay, cast, user...)
  const headerButtons = await page.locator("[data-sleekfin-header-proxy] button:visible, [data-sleekfin-header] .headerSyncButton:visible, [data-sleekfin-header] .headerCastButton:visible").count();
  for (let i = 0; i < Math.min(headerButtons, 8); i++) {
    await menu("header-" + i, async () => { await page.locator("[data-sleekfin-header-proxy] button:visible, [data-sleekfin-header] .headerSyncButton:visible, [data-sleekfin-header] .headerCastButton:visible").nth(i).click({ timeout: 4000 }); });
  }
  await menu("user", () => click("#tb-header-avatar"));
  if (mobile) await menu("drawer", () => click("[data-sleekfin-header] .mainDrawerButton, button[aria-label='Open menu'], [data-sleekfin-header] svg[data-testid='MenuIcon']"));
  // a poster's own menu (three dots)
  await menu("card-menu", async () => {
    const card = page.locator(".tb-rows-c .card:not(.tb-logo-card)").nth(3);
    await card.hover().catch(() => {});
    await page.waitForTimeout(600);
    const b = card.locator("button[data-action='menu'], .cardOverlayButton[data-action='menu'], .tb-card-menu, button[title*='More' i]").first();
    if (await b.count()) { await b.click({ timeout: 3000 }); return true; }
    await card.click({ button: "right" }); return true;
  });
  // title page: More menu + its dialogs
  const titleMenu = async (name, label) => {
    await go(det(movie));
    await menu(name, async () => {
      if (!(await click(".page:not(.hide) .btnMoreCommands"))) return false;
      if (!label) return true;
      await page.waitForTimeout(500);
      return byText(label);
    });
  };
  await titleMenu("more", null);
  await titleMenu("edit-metadata", /Edit metadata/i);
  await titleMenu("identify", /Identify/i);
  await titleMenu("edit-images", /Edit images/i);
  await titleMenu("add-to-playlist", /Add to playlist/i);
  await titleMenu("add-to-collection", /Add to collection/i);
  await titleMenu("edit-subtitles", /Edit subtitles/i);
  await titleMenu("media-info", /Media info/i);
  // library toolbar: sort, filter, view
  await go(pages.find((p) => p[0] === "movies")[1]);
  for (const [n, re] of [["sort", /sort/i], ["filter", /filter/i], ["view", /view|layout/i]]) {
    await menu("library-" + n, async () => { const l = page.locator(".page:not(.hide) button:visible").filter({ has: page.locator(`[data-testid*='${n === "sort" ? "Sort" : n === "filter" ? "Filter" : "View"}' i]`) }).first(); if (await l.count()) { await l.click({ timeout: 3000 }); return true; } const t = page.locator(`.page:not(.hide) button[title], .page:not(.hide) button[aria-label]`).filter({ hasText: re }).first(); if (await t.count()) { await t.click({ timeout: 3000 }); return true; } const a = page.locator(".page:not(.hide) button:visible").and(page.locator(`[aria-label*='${n}' i], [title*='${n}' i]`)).first(); if (await a.count()) { await a.click({ timeout: 3000 }); return true; } return false; });
  }
  // library tabs
  const tabs = page.locator(".page:not(.hide) [role=tab]:visible, .headerTabs [role=tab]:visible, .emby-tab-button:visible");
  const nt = Math.min(await tabs.count(), 8);
  for (let i = 0; i < nt; i++) { await menu("movies-tab-" + i, async () => { await tabs.nth(i).click({ timeout: 3000 }); await page.waitForTimeout(1500); }); }
  await go(pages.find((p) => p[0] === "music")[1]);
  const mtabs = page.locator(".page:not(.hide) [role=tab]:visible, .headerTabs [role=tab]:visible, .emby-tab-button:visible");
  const nm = Math.min(await mtabs.count(), 8);
  for (let i = 0; i < nm; i++) { await menu("music-tab-" + i, async () => { await mtabs.nth(i).click({ timeout: 3000 }); await page.waitForTimeout(1500); }); }
  // the video player and its menus
  await go(det(episode));
  await menu("player", async () => { if (!(await click(".page:not(.hide) .btnPlay:visible, .page:not(.hide) .btnResume:visible, .page:not(.hide) .sleekfin-button-primary:visible"))) return false; await page.waitForTimeout(3000); await page.evaluate(() => { const v = document.querySelector("video"); if (v) v.pause(); }); await page.mouse.move(vw / 2, vh / 2); await page.mouse.move(vw / 2 + 20, vh / 2 + 10); });
  for (const [n, sel] of [["player-settings", ".btnVideoOsdSettings"], ["player-audio", ".btnAudio"], ["player-subtitles", ".btnSubtitles"], ["player-info", ".btnPlaybackInfo, .btnVideoOsdInfo"]]) {
    await menu(n, async () => { await page.mouse.move(vw / 2, vh / 2 + 30); await page.waitForTimeout(300); return click(`${sel}:visible`); });
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.goBack().catch(() => {});
  await page.waitForTimeout(1500);
  // music player bar
  await go(det(album));
  await menu("music-playing", async () => { if (!(await click(".page:not(.hide) .btnPlay:visible, .page:not(.hide) .sleekfin-button-primary:visible, .page:not(.hide) button[title='Play']:visible"))) return false; await page.waitForTimeout(2500); });
  await menu("now-playing-page", async () => { await page.evaluate(() => { location.hash = "#/queue"; }); await page.waitForTimeout(1800); });
  await page.evaluate(() => { try { window.playbackManager && window.playbackManager.stop(); } catch (e) {} document.querySelectorAll("audio,video").forEach((m) => m.pause()); });

  // ── how much happens while you leave a page alone (10 s each, PC only) ──
  if (tag === "pc") {
    for (const [name, hash] of [["home", "#/home"], ["movie", det(movie)], ["movies", pages.find((p) => p[0] === "movies")[1]], ["dashboard", "#/dashboard"], ["search", "#/search?tbq=the"]]) {
      await go(hash);
      await page.mouse.move(vw - 3, vh - 3);
      await page.waitForTimeout(1500);
      const r = await page.evaluate(async () => {
        const lt = []; let po;
        try { po = new PerformanceObserver((l) => l.getEntries().forEach((e) => lt.push(Math.round(e.duration)))); po.observe({ type: "longtask" }); } catch (e) {}
        window.__tbIdle.by = {}; window.__tbIdle.on = true;
        const h0 = performance.memory ? performance.memory.usedJSHeapSize : 0;
        await new Promise((r) => setTimeout(r, 10000));
        window.__tbIdle.on = false;
        if (po) po.disconnect();
        return { per10s: window.__tbIdle.by, observers: window.__tbIdle.observers, longTasks: lt, heapMb: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null, heapGrowKb: performance.memory ? Math.round((performance.memory.usedJSHeapSize - h0) / 1024) : null, nodes: document.getElementsByTagName("*").length };
      });
      report.idle[name] = r;
    }
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(`${out}/audit.json`, JSON.stringify(report, null, 1));
console.log("audit done", Object.keys(report.pages).length, "pages", Object.keys(report.menus).length, "menus", report.errors.length, "errors");

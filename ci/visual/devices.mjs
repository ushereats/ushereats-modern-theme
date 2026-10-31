// Every kind of screen: phones and tablets (portrait + landscape), a tall 1080x1920 screen, TVs and Xbox
// (Jellyfin's TV layout, driven with the arrow keys like a remote). Screenshots of every page plus automatic
// checks: sideways scrolling, things cut off at the edge, tiny buttons on touch screens, TV focus visible.
// node ci/visual/devices.mjs <outdir>   (needs ci-session.json from setup.sh)
import { chromium } from "playwright";
import fs from "node:fs";

const out = (process.argv[2] || "shots") + "/devices";
fs.mkdirSync(out, { recursive: true });
const s = JSON.parse(fs.readFileSync("ci-session.json", "utf8"));
const H = { Authorization: `MediaBrowser Client="ci", Device="ci", DeviceId="ci-devices", Version="1.0", Token="${s.token}"` };
const api = (p) => fetch(s.server + p, { headers: H }).then((r) => r.json());

const movies = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Movie&SortBy=SortName`)).Items;
const shows = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Series&SortBy=SortName`)).Items;
const seasons = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Season&ParentId=${shows[0].Id}`)).Items;
const eps = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Episode&ParentId=${shows[0].Id}&SortBy=SortName`)).Items;
const views = (await api(`/UserViews?userId=${s.userId}`)).Items;
const tvLib = views.find((v) => v.CollectionType === "tvshows");

const creds = JSON.stringify({ Servers: [{ ManualAddress: s.server, manualAddressOnly: true, Id: s.serverId, Name: "ci", DateLastAccessed: Date.now(), LastConnectionMode: 2, AccessToken: s.token, UserId: s.userId }] });
const init = (signedIn) => `
  (function(){ var x=7; Math.random=function(){ x=(x*16807)%2147483647; return (x-1)/2147483646; };
  try{ sessionStorage.setItem('jf-welcomed','1'); ${signedIn ? `localStorage.setItem('jellyfin_credentials', ${JSON.stringify(creds)});` : "localStorage.clear();"} }catch(e){} })();`;

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  android: "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36",
  ipad: "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  webos: "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.5359.211 Safari/537.36 WebAppManager",
  xbox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36 Edge/44.18363.8131",
  desktop: undefined,
};
const devices = [
  { tag: "iphone-portrait", w: 390, h: 844, dpr: 3, mobile: true, ua: UA.iphone },
  { tag: "iphone-landscape", w: 844, h: 390, dpr: 3, mobile: true, ua: UA.iphone },
  { tag: "android-portrait", w: 412, h: 915, dpr: 2.6, mobile: true, ua: UA.android },
  { tag: "android-landscape", w: 915, h: 412, dpr: 2.6, mobile: true, ua: UA.android },
  { tag: "ipad-portrait", w: 820, h: 1180, dpr: 2, mobile: true, ua: UA.ipad },
  { tag: "ipad-landscape", w: 1180, h: 820, dpr: 2, mobile: true, ua: UA.ipad },
  { tag: "tall-1080x1920", w: 1080, h: 1920, dpr: 1, mobile: false, ua: UA.desktop },
  { tag: "tv-1080", w: 1920, h: 1080, dpr: 1, mobile: false, ua: UA.webos, tv: true },
  { tag: "tv-720", w: 1280, h: 720, dpr: 1, mobile: false, ua: UA.webos, tv: true },
  { tag: "xbox", w: 1920, h: 1080, dpr: 1, mobile: false, ua: UA.xbox, tv: true },
  // the Xbox app (like every Xbox app) usually draws at 960x540 scaled up x2
  { tag: "xbox-app", w: 960, h: 540, dpr: 2, mobile: false, ua: UA.xbox, tv: true },
];
const only = process.env.DEVICES ? process.env.DEVICES.split(",") : null;

const pages = [
  ["home", "#/home"],
  ["search", "#/search?tbq=the"],
  ["movies", `#/movies?topParentId=${s.movieLib}&collectionType=movies`],
  ["shows", tvLib ? `#/tv?topParentId=${tvLib.Id}&collectionType=tvshows` : null],
  ["movie", `#/details?id=${movies[2].Id}&serverId=${s.serverId}`],
  ["series", `#/details?id=${shows[0].Id}&serverId=${s.serverId}`],
  ["season", seasons[0] ? `#/details?id=${seasons[0].Id}&serverId=${s.serverId}` : null],
  ["episode", `#/details?id=${eps[2].Id}&serverId=${s.serverId}`],
  ["prefs", "#/mypreferencesmenu"],
  ["dashboard", "#/dashboard"],
];

// what is wrong on the page right now
const inspect = (touch) => {
  const W = innerWidth, Hh = innerHeight, html = document.documentElement;
  const name = (e) => (e.id ? "#" + e.id : e.tagName.toLowerCase()) + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 3).join(".") : "");
  const path = (e) => { const p = []; for (let n = e; n && n !== document.body && p.length < 4; n = n.parentElement) p.unshift(name(n)); return p.join(" > "); };
  const shown = (e) => { const cs = getComputedStyle(e); return cs.visibility !== "hidden" && cs.display !== "none" && +cs.opacity !== 0; };
  const clipped = (e) => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n); if (/(auto|scroll|hidden|clip)/.test(o.overflowX)) return true; } return false; };
  const all = Array.from(document.querySelectorAll("body *"));
  const sticking = [];
  for (const e of all) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.bottom < 0 || r.top > Hh) continue;
    if ((r.right > W + 2 || r.left < -2) && r.left < W && r.right > 0 && shown(e) && !clipped(e) && getComputedStyle(e).position !== "fixed") sticking.push(path(e) + ` [${Math.round(r.left)}..${Math.round(r.right)}]`);
  }
  const small = [];
  if (touch) for (const e of document.querySelectorAll("button, a[href], [role=button], input, select")) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || r.top > Hh || r.bottom < 0 || r.right < 0 || r.left > W || !shown(e)) continue;
    if (r.width < 30 || r.height < 30) small.push(path(e) + ` ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  const hdr = document.querySelector("[data-sleekfin-header]");
  const hr = hdr && hdr.getBoundingClientRect();
  // text that runs out of its box
  const cut = [];
  for (const e of document.querySelectorAll("h1,h2,h3,.sectionTitle,.sleekfin-hero *,.cardText,button")) {
    if (!shown(e) || !e.getClientRects().length) continue;
    const r = e.getBoundingClientRect();
    if (r.top > Hh || r.bottom < 0) continue;
    if (e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).textOverflow !== "ellipsis" && /(hidden|clip)/.test(getComputedStyle(e).overflowX)) cut.push(path(e) + " '" + (e.textContent || "").trim().slice(0, 30) + "'");
  }
  return {
    layout: ["layout-tv", "layout-mobile", "layout-desktop"].filter((c) => html.classList.contains(c)).join(" "),
    sideways: html.scrollWidth > W + 1 ? html.scrollWidth - W : 0,
    sticksOut: [...new Set(sticking)].slice(0, 8),
    sticksOutCount: sticking.length,
    smallTaps: small.slice(0, 8),
    smallTapCount: small.length,
    textCut: cut.slice(0, 6),
    header: hr ? { top: Math.round(hr.top), height: Math.round(hr.height), width: Math.round(hr.width), shown: shown(hdr) } : null,
    hero: !!document.querySelector(".sleekfin-hero"),
    details: !!document.querySelector("#itemDetailPage[data-sleekfin-details='true']") && !html.classList.contains("sleekfin-details-concealed"),
    rows: document.querySelectorAll(".tb-rows-c .card").length,
    concealed: html.classList.contains("sleekfin-details-concealed"),
  };
};

// remote control: arrow keys, where focus goes, can you see it
const focusInfo = () => {
  const e = document.activeElement;
  if (!e || e === document.body) return { none: true };
  const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
  const name = (e.id ? "#" + e.id : e.tagName.toLowerCase()) + (typeof e.className === "string" ? "." + e.className.trim().split(/\s+/).slice(0, 3).join(".") : "");
  const box = e.closest(".card") || e;
  const bs = getComputedStyle(box), inner = box.querySelector(".cardScalable, .cardBox");
  const ics = inner ? getComputedStyle(inner) : null;
  const marked = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== "none" || bs.transform !== "none" || bs.boxShadow !== "none" || (ics && (ics.transform !== "none" || ics.boxShadow !== "none" || ics.outlineStyle !== "none")) || /focus/.test(box.className);
  return { el: name, text: (e.textContent || e.getAttribute("aria-label") || "").trim().slice(0, 30), inView: r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= innerWidth + 1, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], marked: !!marked };
};


// what's going on (for fixing): header, backdrops, focus containers, what covers the top bar
const probe = () => {
  const cs = (e) => { const c = getComputedStyle(e); return { pos: c.position, z: c.zIndex, vis: c.visibility, op: c.opacity, disp: c.display, ov: c.overflowX + "/" + c.overflowY, tr: c.transform !== "none" ? "T" : "", iso: c.isolation }; };
  const nm = (e) => (e.id ? "#" + e.id : e.tagName.toLowerCase()) + (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).slice(0, 4).join(".") : "");
  const chain = (e) => { const out = []; for (let n = e; n && n !== document.documentElement; n = n.parentElement) out.push(nm(n) + " " + JSON.stringify(cs(n))); return out.slice(0, 8); };
  const hdr = document.querySelector("[data-sleekfin-header]");
  const r = hdr && hdr.getBoundingClientRect();
  const at = (x, y) => { const e = document.elementFromPoint(x, y); return e ? nm(e) : null; };
  const back = Array.from(document.querySelectorAll(".backdropContainer, .backdropImage, .sleekfin-details-backdrop, [class*='backdrop' i]")).slice(0, 12).map((e) => { const b = e.getBoundingClientRect(); const c = getComputedStyle(e); return nm(e) + ` [${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.width)}x${Math.round(b.height)}] disp=${c.display} vis=${c.visibility} op=${c.opacity} bg=${(c.backgroundImage || "").slice(0, 60)} src=${(e.currentSrc || e.src || "").slice(-50)}`; });
  const logo = document.querySelector(".tb-logo-link");
  const fc = []; for (let n = logo; n; n = n.parentElement) if (/focuscontainer|focusable/.test(n.className || "")) fc.push(nm(n));
  const imgs = Array.from(document.querySelectorAll("[data-sleekfin-header] img, .sleekfin-header-fallback-brand img")).map((i) => nm(i) + " src=" + (i.getAttribute("src") || "(none)").slice(0, 60) + " ok=" + (i.complete && i.naturalWidth > 0));
  const clock = Array.from(document.querySelectorAll("[class*='lock' i]")).filter((e) => /\d:\d\d/.test(e.textContent || "")).map((e) => nm(e) + " '" + e.textContent.trim().slice(0, 12) + "' " + JSON.stringify(cs(e)));
  const proxy = document.querySelector("[data-sleekfin-header-proxy]");
  const dock = proxy ? Array.from(proxy.querySelectorAll("button, a")).map((e) => nm(e) + " aria=" + (e.getAttribute("aria-label") || "") + " " + JSON.stringify(e.getBoundingClientRect().toJSON ? [Math.round(e.getBoundingClientRect().left), Math.round(e.getBoundingClientRect().top)] : 0)) : null;
  return {
    htmlClass: document.documentElement.className.slice(0, 300), bodyClass: document.body.className.slice(0, 200),
    header: r ? { rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], chain: chain(hdr), coveredBy: at(r.left + r.width - 60, r.top + 30), atLeft: at(120, r.top + 30) } : null,
    backdrops: back, logoFocusContainers: fc, headerImgs: imgs, clock, dock,
    hero: (() => { const h = document.querySelector(".sleekfin-hero"); return h ? { rect: JSON.stringify(h.getBoundingClientRect()), chain: chain(h).slice(0, 4) } : null; })(),
  };
};

const report = {};
const browser = await chromium.launch();
async function settle(page, ms = 2500) {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(ms);
}
for (const d of devices) {
  if (only && !only.includes(d.tag)) continue;
  const R = (report[d.tag] = { pages: {}, errors: [] });
  const ctx = await browser.newContext({ locale: "en-US", timezoneId: "Australia/Sydney", viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, isMobile: d.mobile, hasTouch: d.mobile, userAgent: d.ua });
  await ctx.addInitScript(init(true));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => R.errors.push(String(e.message).slice(0, 200)));
  page.on("console", async (m) => {
    if (m.type() !== "error" || /Failed to load resource|favicon|orientation/.test(m.text())) return;
    let stack = "";
    for (const a of m.args()) { try { const st = await a.evaluate((e) => (e && e.stack) || ""); if (st) { stack = st.split("\n").slice(0, 4).join(" | "); break; } } catch (e) {} }
    R.errors.push("console: " + m.text().slice(0, 160) + (stack ? " STACK " + stack.slice(0, 400) : ""));
  });
  let first = true;
  for (const [name, hash] of pages) {
    if (!hash) continue;
    try {
      if (first) { await page.goto(s.server + "/web/index.html" + hash, { waitUntil: "load" }); first = false; }
      else await page.evaluate((h) => { location.hash = h; }, hash);
      await settle(page);
      if (d.mobile) await page.mouse.move(1, 1).catch(() => {});
      await page.screenshot({ path: `${out}/${d.tag}-${name}.png`, animations: "disabled", caret: "hide" });
      R.pages[name] = await page.evaluate(inspect, d.mobile);
      if ((name === "home" || name === "movie") && /tv-1080|xbox|iphone-portrait|tall/.test(d.tag)) R.pages[name + "-probe"] = await page.evaluate(probe).catch((e) => ({ error: String(e) }));
      if (name === "home" || name === "series" || name === "movie") {
        // further down the page
        await page.mouse.wheel(0, Math.round(d.h * 0.8));
        await page.evaluate((y) => window.scrollBy(0, y), Math.round(d.h * 0.8));
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${out}/${d.tag}-${name}-down.png`, animations: "disabled", caret: "hide" });
        R.pages[name + "-down"] = await page.evaluate(inspect, d.mobile);
        await page.evaluate(() => window.scrollTo(0, 0));
      }
      if (name === "home" && d.mobile) {
        // the user menu (avatar)
        const av = page.locator("#tb-header-avatar:visible").first();
        if (await av.count()) {
          await av.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(700);
          await page.screenshot({ path: `${out}/${d.tag}-usermenu.png`, animations: "disabled", caret: "hide" });
          R.pages.usermenu = await page.evaluate(() => { const m = document.querySelector("#app-user-menu .MuiPaper-root, #app-user-menu [role=menu]"); if (!m) return { open: false }; const r = m.getBoundingClientRect(); return { open: true, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; });
          await page.keyboard.press("Escape");
          await page.waitForTimeout(400);
        } else R.pages.usermenu = { avatar: false };
      }
      if (d.tv && (name === "home" || name === "movie" || name === "series")) {
        // the remote: down x6, right x4, then back up
        const keys = name === "home" ? ["ArrowDown", "ArrowDown", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp"] : ["ArrowDown", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp"];
        await page.evaluate(() => window.scrollTo(0, 0));
        const trail = [{ key: "start", ...(await page.evaluate(focusInfo)) }];
        let n = 0;
        for (const k of keys) {
          await page.keyboard.press(k);
          await page.waitForTimeout(450);
          const f = await page.evaluate(focusInfo);
          trail.push({ key: k, ...f });
          if (n++ % 3 === 2) await page.screenshot({ path: `${out}/${d.tag}-${name}-remote${n}.png`, animations: "disabled", caret: "hide" });
        }
        R.pages[name + "-remote"] = trail;
      }
      if (name === "episode") {
        // the player: press Play
        const play = page.locator(".sleekfin-details-hero button:visible, .detailButton.btnPlay:visible, button.btnPlay:visible").first();
        if (await play.count()) {
          await play.click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(2500);
          if (d.mobile) await page.mouse.click(Math.round(d.w / 2), Math.round(d.h / 2)).catch(() => {}); else await page.mouse.move(Math.round(d.w / 2), Math.round(d.h / 2));
          await page.waitForTimeout(500);
          await page.evaluate(() => { const v = document.querySelector("video"); if (v) v.pause(); });
          await page.screenshot({ path: `${out}/${d.tag}-player.png`, animations: "disabled", caret: "hide" });
          R.pages.player = await page.evaluate((touch) => ({ video: !!document.querySelector("video"), hash: location.hash, osd: !!document.querySelector(".videoOsdBottom:not(.hide), .osdControls"), ...(() => { try { return { sideways: document.documentElement.scrollWidth > innerWidth + 1 }; } catch (e) { return {}; } })() }), d.mobile);
          await page.keyboard.press("Escape").catch(() => {});
          await page.goBack().catch(() => {});
          await page.waitForTimeout(1500);
        }
      }
    } catch (e) {
      R.pages[name] = { error: String(e.message).slice(0, 200) };
    }
  }
  // signed out: the sign-in page
  const ctx2 = await browser.newContext({ locale: "en-US", viewport: { width: d.w, height: d.h }, deviceScaleFactor: d.dpr, isMobile: d.mobile, hasTouch: d.mobile, userAgent: d.ua });
  await ctx2.addInitScript(init(false));
  const p2 = await ctx2.newPage();
  await p2.goto(s.server + "/web/index.html#/login", { waitUntil: "load" }).catch(() => {});
  await settle(p2, 2500);
  await p2.screenshot({ path: `${out}/${d.tag}-login.png`, animations: "disabled", caret: "hide" });
  R.pages.login = await p2.evaluate(inspect, d.mobile);
  await ctx2.close();
  await ctx.close();
  console.log("done", d.tag);
}
await browser.close();
fs.writeFileSync(`${out}/devices.json`, JSON.stringify(report, null, 1));
console.log("devices done");

// Smoke test: open the live site with the test user, check basic flows work.
// Never changes settings. Prints PASS/FAIL per step.
// node ci/smoke.mjs   (needs ci-session.json)
// Runs on chromium + webkit (iPhone + iPad). Install with: npx playwright install chromium webkit
import { chromium, webkit } from "playwright";
import fs from "node:fs";

const s = JSON.parse(fs.readFileSync("ci-session.json", "utf8"));
const H = { Authorization: `MediaBrowser Client="smoke", Device="smoke", DeviceId="smoke-ci", Version="1.0", Token="${s.token}"` };
const api = (p) => fetch(s.server + p, { headers: H }).then((r) => r.json());

const creds = JSON.stringify({ Servers: [{ ManualAddress: s.server, manualAddressOnly: true, Id: s.serverId, Name: "ci", DateLastAccessed: Date.now(), LastConnectionMode: 2, AccessToken: s.token, UserId: s.userId }] });
const initScript = `(function(){try{sessionStorage.setItem('jf-welcomed','1');localStorage.setItem('jellyfin_credentials',${JSON.stringify(creds)});}catch(e){}})();`;

// Fetch a movie and a series for the test
const movies = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Movie&SortBy=SortName&Limit=5`)).Items || [];
const shows = (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Series&SortBy=SortName&Limit=5`)).Items || [];
const eps = shows[0] ? (await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Episode&ParentId=${shows[0].Id}&SortBy=SortName&Limit=5`)).Items || [] : [];

if (!movies.length) { console.error("FAIL: no movies found — check ci-session.json library access"); process.exit(1); }
if (!shows.length) { console.error("FAIL: no series found — check ci-session.json library access"); process.exit(1); }

let allPassed = true;
function pass(label) { console.log("PASS  " + label); }
function fail(label, reason) { console.error("FAIL  " + label + (reason ? ": " + reason : "")); allPassed = false; }

async function runBrowser(browserType, label, viewportW, viewportH, ua, isMobile) {
  const exePath = browserType.name() === "chromium" ? (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined) : undefined;
  const browser = await browserType.launch(exePath ? { executablePath: exePath } : {});
  const ctxOpts = { locale: "en-US", viewport: { width: viewportW, height: viewportH }, isMobile: !!isMobile, hasTouch: !!isMobile };
  if (ua) ctxOpts.userAgent = ua;
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)));

  try {
    // Step 1: load home, check rows have items
    await page.goto(s.server + "/web/index.html#/home", { waitUntil: "load" });
    await page.waitForTimeout(5000);
    const cards = await page.evaluate(() => document.querySelectorAll(".card[data-id]").length);
    if (cards > 0) pass(label + " — home has cards (" + cards + ")");
    else fail(label + " — home has no cards");

    // Step 2: open a movie detail page
    await page.goto(s.server + "/web/index.html#/details?id=" + movies[0].Id + "&serverId=" + s.serverId, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const movieTitle = await page.evaluate(() => document.title || document.querySelector("h1,h2,.itemTitle,.title")?.textContent || "");
    if (movieTitle) pass(label + " — movie detail page loaded");
    else fail(label + " — movie detail page empty");

    // Step 3: open a series detail page
    await page.goto(s.server + "/web/index.html#/details?id=" + shows[0].Id + "&serverId=" + s.serverId, { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const seriesTitle = await page.evaluate(() => document.title || document.querySelector("h1,h2,.itemTitle,.title")?.textContent || "");
    if (seriesTitle) pass(label + " — series detail page loaded");
    else fail(label + " — series detail page empty");

    // Step 4: search
    await page.goto(s.server + "/web/index.html#/search?tbq=the", { waitUntil: "load" });
    await page.waitForTimeout(3000);
    const searchResults = await page.evaluate(() => document.querySelectorAll(".card[data-id], .searchResultItem").length);
    if (searchResults > 0) pass(label + " — search returned results (" + searchResults + ")");
    else fail(label + " — search returned no results");

    // Step 5: start playback for 5s then stop (uses an episode to minimise library changes)
    const playItem = eps[0] || movies[0];
    const playResp = await fetch(s.server + "/Sessions/Playing", {
      method: "POST",
      headers: { ...H, "Content-Type": "application/json" },
      body: JSON.stringify({ ItemId: playItem.Id, PositionTicks: 0, PlayMethod: "DirectPlay", CanSeek: true, IsPaused: false }),
    });
    if (playResp.ok) {
      await new Promise((r) => setTimeout(r, 5000));
      const stopResp = await fetch(s.server + "/Sessions/Playing/Stopped", {
        method: "POST",
        headers: { ...H, "Content-Type": "application/json" },
        body: JSON.stringify({ ItemId: playItem.Id, PositionTicks: 0 }),
      });
      if (stopResp.ok) pass(label + " — playback start+stop");
      else fail(label + " — playback stop returned " + stopResp.status);
    } else {
      fail(label + " — playback start returned " + playResp.status);
    }

    if (errors.length) fail(label + " — page JS errors: " + errors.join("; "));
    else pass(label + " — no JS errors");
  } catch (e) {
    fail(label + " — exception: " + String(e.message).slice(0, 200));
  }

  await ctx.close();
  await browser.close();
}

// Chromium desktop
await runBrowser(chromium, "chromium-desktop", 1280, 720, null, false);

// WebKit — iPhone
const UA_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
await runBrowser(webkit, "webkit-iphone", 390, 844, UA_IPHONE, true);

// WebKit — iPad
const UA_IPAD = "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
await runBrowser(webkit, "webkit-ipad", 768, 1024, UA_IPAD, true);

console.log("\n" + (allPassed ? "All steps PASSED." : "Some steps FAILED — see above."));
process.exit(allPassed ? 0 : 1);

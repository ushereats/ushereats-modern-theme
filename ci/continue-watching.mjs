// Permanent test: every series in Jellyfin's Resume + NextUp for the test user
// must appear in the theme's Continue Watching row exactly once.
//
// Setup: the test user must have progress on 2 episodes of the same show, plus
// a next-up episode queued for that show. The script seeds that progress itself
// (using the first qualifying series in your library) and then verifies the row.
//
// node ci/continue-watching.mjs   (needs ci-session.json)

import fs from "node:fs";

const s = JSON.parse(fs.readFileSync("ci-session.json", "utf8"));
const H = {
  Authorization: `MediaBrowser Client="ci", Device="ci", DeviceId="cw-test", Version="1.0", Token="${s.token}"`,
  "Content-Type": "application/json",
};
const api = (p, opts) => fetch(s.server + p, { headers: H, ...opts }).then((r) => {
  if (!r.ok) throw new Error(`${opts?.method || "GET"} ${p} → ${r.status}`);
  return r.json().catch(() => ({}));
});

let allPassed = true;
function pass(label) { console.log("PASS  " + label); }
function fail(label, reason) { console.error("FAIL  " + label + (reason ? ": " + reason : "")); allPassed = false; }

// ── Seed: mark 2 episodes of the same series as played, plus stop mid-way through a 3rd ──

console.log("Finding a qualifying series (≥3 episodes)...");
const seriesResult = await api(`/Items?userId=${s.userId}&Recursive=true&IncludeItemTypes=Series&SortBy=SortName&Limit=20`);
let seedSeries = null;
let seedEps = [];
for (const show of (seriesResult.Items || [])) {
  const epsResult = await api(`/Items?userId=${s.userId}&Recursive=true&ParentId=${show.Id}&IncludeItemTypes=Episode&SortBy=SortName&Limit=5`);
  if ((epsResult.Items || []).length >= 3) {
    seedSeries = show;
    seedEps = epsResult.Items.slice(0, 3);
    break;
  }
}
if (!seedSeries) { fail("seed", "no series with ≥3 episodes found in library"); process.exit(1); }
console.log(`Seeding progress on "${seedSeries.Name}" (${seedSeries.Id})`);

// Mark ep[0] and ep[1] as fully played
for (const ep of seedEps.slice(0, 2)) {
  await api(`/Users/${s.userId}/PlayedItems/${ep.Id}`, { method: "POST", body: "{}" });
  console.log(`  Marked played: ${ep.Name}`);
}
// Simulate stopping mid-way through ep[2] (creates a resumable item)
await api(`/Sessions/Playing`, { method: "POST", body: JSON.stringify({ ItemId: seedEps[2].Id, PositionTicks: 0, PlayMethod: "DirectPlay", CanSeek: true, IsPaused: false }) });
await new Promise((r) => setTimeout(r, 500));
const halfTicks = seedEps[2].RunTimeTicks ? Math.floor(seedEps[2].RunTimeTicks / 2) : 600000000;
await api(`/Sessions/Playing/Progress`, { method: "POST", body: JSON.stringify({ ItemId: seedEps[2].Id, PositionTicks: halfTicks, IsPaused: true }) });
await api(`/Sessions/Playing/Stopped`, { method: "POST", body: JSON.stringify({ ItemId: seedEps[2].Id, PositionTicks: halfTicks }) });
console.log(`  Stopped mid-way: ${seedEps[2].Name} at tick ${halfTicks}`);

// ── Fetch what Jellyfin sees: Resume + NextUp ──

console.log("\nFetching Jellyfin Resume + NextUp...");
const COMMON = "&Fields=PrimaryImageAspectRatio&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb&EnableTotalRecordCount=false";
const resumeResult = await api(`/UserItems/Resume?userId=${s.userId}&MediaTypes=Video&IncludeItemTypes=Movie&Limit=50${COMMON}`).catch(() => ({ Items: [] }));
const nextUpResult = await api(`/Shows/NextUp?userId=${s.userId}&Limit=50&EnableResumable=true&EnableRewatching=false${COMMON}`).catch(() => ({ Items: [] }));

const resumeItems = resumeResult.Items || [];
const nextUpItems = nextUpResult.Items || [];

// Build the expected set of series keys (SeriesId for episodes, Id for movies)
const expected = new Map(); // key -> display name
for (const it of resumeItems) expected.set(it.Id, it.Name);
for (const it of nextUpItems) {
  const k = it.SeriesId || it.Id;
  expected.set(k, it.SeriesName || it.Name);
}
console.log(`Expected keys in row: ${expected.size}`);
if (expected.size === 0) { fail("seed check", "Resume + NextUp both empty after seeding — check test user permissions"); process.exit(1); }

// ── Fetch the theme's Continue Watching row via the debug endpoint ──

console.log("\nFetching theme debug endpoint...");
const debug = await api(`/UshereatsTheme/home/debug?userId=${s.userId}&resumeLimit=50&nextUpLimit=50&limit=50`);

// Build a set of keys from the final row
const finalKeys = new Set((debug.final || []).map((it) => (it.seriesId || it.id).replace(/-/g, "")));

// Every expected key must appear in the final row exactly once
let missing = [];
for (const [rawKey, name] of expected) {
  const k = rawKey.replace(/-/g, "");
  if (!finalKeys.has(k)) missing.push(name);
}
if (missing.length === 0) {
  pass("all expected series appear in the theme row");
} else {
  fail("series missing from theme row", missing.join(", "));
  // Print debug pipeline to show where each dropped
  for (const name of missing) {
    const steps = ["rawResume", "rawNextUp", "merged", "deduped", "final"];
    const presentIn = steps.filter((step) =>
      (debug[step] || []).some((e) => (e.seriesName || e.name) === name)
    );
    const droppedAt = steps.find((step) =>
      !(debug[step] || []).some((e) => (e.seriesName || e.name) === name)
    );
    console.error(`  "${name}" present in: [${presentIn.join(", ")}] | dropped at: ${droppedAt || "not found in any step"}`);
  }
}

// Each series must appear EXACTLY once (no duplicates)
const keyCounts = new Map();
for (const it of (debug.final || [])) {
  const k = (it.seriesId || it.id).replace(/-/g, "");
  keyCounts.set(k, (keyCounts.get(k) || 0) + 1);
}
const duplicates = [...keyCounts.entries()].filter(([, c]) => c > 1).map(([k]) => k);
if (duplicates.length === 0) {
  pass("no duplicate series in theme row");
} else {
  fail("duplicate series in theme row", duplicates.join(", "));
}

// The seeded show must be present
const seededKey = seedSeries.Id.replace(/-/g, "");
if (finalKeys.has(seededKey)) {
  pass(`seeded show "${seedSeries.Name}" appears in row`);
} else {
  fail(`seeded show "${seedSeries.Name}" missing from row`);
  // Find which debug step it disappears at
  const steps = ["rawResume", "rawNextUp", "merged", "deduped", "final"];
  const presentIn = steps.filter((step) =>
    (debug[step] || []).some((e) => (e.seriesId || e.id).replace(/-/g, "") === seededKey || (e.seriesName || e.name) === seedSeries.Name)
  );
  console.error(`  "${seedSeries.Name}" present in steps: [${presentIn.join(", ")}]`);
}

console.log("\n" + (allPassed ? "All steps PASSED." : "Some steps FAILED — see above."));
process.exit(allPassed ? 0 : 1);

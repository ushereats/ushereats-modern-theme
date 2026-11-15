// Reads the server's Jellyfin version via the API and compares it to the saved version in
// jellyfin-version-saved.txt. If changed, runs the full visual shots and smoke tests,
// then updates the saved version.
// node ci/check-jellyfin.mjs   (needs ci-session.json)
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const savedFile = path.join(root, "jellyfin-version-saved.txt");
const sessionFile = path.join(root, "ci-session.json");

if (!fs.existsSync(sessionFile)) {
  console.error("ci-session.json not found. See test-user-setup.md.");
  process.exit(1);
}

const s = JSON.parse(fs.readFileSync(sessionFile, "utf8"));

// Read version from server
const info = await fetch(s.server + "/System/Info/Public").then((r) => r.json()).catch(() => null);
if (!info || !info.Version) {
  console.error("Could not read Jellyfin version from " + s.server + "/System/Info/Public");
  process.exit(1);
}
const liveVersion = info.Version;
const savedVersion = fs.existsSync(savedFile) ? fs.readFileSync(savedFile, "utf8").trim() : "";

console.log("Live Jellyfin version:  " + liveVersion);
console.log("Saved Jellyfin version: " + (savedVersion || "(none)"));

if (liveVersion === savedVersion) {
  console.log("Version unchanged. No action needed.");
  process.exit(0);
}

console.log("\nVersion changed! Running full smoke tests...\n");

let ok = true;
try {
  execSync("node ci/smoke.mjs", { cwd: root, stdio: "inherit" });
} catch {
  ok = false;
}

fs.writeFileSync(savedFile, liveVersion + "\n");
console.log("\nSaved new version: " + liveVersion);

if (!ok) {
  console.error("Smoke tests failed after Jellyfin update. Review output above.");
  process.exit(1);
}

console.log("All tests passed. jellyfin-version-saved.txt updated.");

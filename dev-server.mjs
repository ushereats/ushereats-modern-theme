// Dev asset server — run with: npm run dev
//
// Watches web-src/ and sleekfin/ for changes, runs build-assets.mjs on every change,
// and serves the resulting Assets/ folder over HTTP on your LAN at port 3131.
//
// Set "Dev assets URL" in the plugin settings to http://<your-pc-ip>:3131/
// Then toggle dev mode in your Jellyfin browser console:
//   ON:  localStorage.setItem('ue-dev','1'); location.reload()
//   OFF: localStorage.removeItem('ue-dev'); location.reload()

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { watch } from "node:fs";
import { execFileSync } from "node:child_process";
import { networkInterfaces } from "node:os";

const PORT = 3131;
const ASSETS_DIR = "src/Jellyfin.Plugin.UshereatsTheme/Assets";

// ── build ──────────────────────────────────────────────────────────────────
let building = false;
let pendingBuild = false;

function build() {
  if (building) { pendingBuild = true; return; }
  building = true;
  console.log("[dev] building assets...");
  try {
    execFileSync(process.execPath, ["build-assets.mjs"], { stdio: "inherit" });
    console.log("[dev] ready");
  } catch (e) {
    console.error("[dev] build failed");
  } finally {
    building = false;
    if (pendingBuild) { pendingBuild = false; build(); }
  }
}

// ── watch ──────────────────────────────────────────────────────────────────
let debounce = null;
function onChange(dir, filename) {
  if (!filename) return;
  clearTimeout(debounce);
  debounce = setTimeout(build, 200);
}

watch("web-src", { recursive: true }, onChange);
watch("sleekfin", { recursive: true, }, (_, f) => {
  // ignore build output and node_modules
  if (f && (f.startsWith("build") || f.startsWith("node_modules"))) return;
  onChange("sleekfin", f);
});

// ── serve ──────────────────────────────────────────────────────────────────
const MIME = {
  ".js":    "application/javascript; charset=utf-8",
  ".css":   "text/css; charset=utf-8",
  ".svg":   "image/svg+xml",
  ".woff2": "font/woff2",
  ".mp3":   "audio/mpeg",
  ".json":  "application/json",
};

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const name = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\//, ""));
  if (!name || name.includes("..") || name.includes("/")) {
    res.writeHead(400); res.end(); return;
  }

  const file = path.join(ASSETS_DIR, name);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    const ext = path.extname(name);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
});

// ── start ──────────────────────────────────────────────────────────────────
build();  // initial build

server.listen(PORT, "0.0.0.0", () => {
  const lan = Object.values(networkInterfaces()).flat()
    .find(n => n.family === "IPv4" && !n.internal)?.address ?? "your-pc-ip";
  console.log(`[dev] http://${lan}:${PORT}/`);
  console.log(`[dev] Set "Dev assets URL" in plugin settings to: http://${lan}:${PORT}/`);
  console.log("[dev] ON:  localStorage.setItem('ue-dev','1'); location.reload()");
  console.log("[dev] OFF: localStorage.removeItem('ue-dev'); location.reload()");
});

// Builds the files the plugin ships (src/Jellyfin.Plugin.UshereatsTheme/Assets) from web-src.
//   npm install --no-save terser@5.31.6 && node build-assets.mjs
// Edit things in web-src/, never in Assets/ (it is regenerated).
import { minify } from "terser";
import fs from "node:fs";
import path from "node:path";

const SRC = "web-src";
const OUT = "src/Jellyfin.Plugin.UshereatsTheme/Assets";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// JS: each feature minified on its own (the plugin only bundles the ones switched on)
const jsDir = path.join(SRC, "js");
for (const f of fs.readdirSync(jsDir).filter((f) => f.endsWith(".js")).sort()) {
  const code = fs.readFileSync(path.join(jsDir, f), "utf8");
  const out = await minify(code, {
    ecma: 2015,
    compress: { passes: 2 },
    mangle: true,
    format: { ascii_only: true, comments: false }
  });
  if (!out.code) throw new Error("terser failed: " + f);
  fs.writeFileSync(path.join(OUT, "js_" + f.replace(/-/g, "_")), out.code);
  console.log("js ", f, code.length, "->", out.code.length);
}

// Hero boot: inlined in the page head, so ES5 (TVs) and as small as possible
{
  const code = fs.readFileSync(path.join(SRC, "hero-boot.js"), "utf8");
  const out = await minify(code, { ecma: 5, compress: { passes: 2 }, mangle: true, format: { ascii_only: true, comments: false } });
  if (!out.code || out.code.includes("</")) throw new Error("hero-boot minify failed");
  fs.writeFileSync(path.join(OUT, "hero_boot.js"), out.code);
  console.log("js  hero-boot.js", code.length, "->", out.code.length);
}

// CSS: strip comments and blank space only (never rewrites rules)
function stripCss(css) {
  let out = "", i = 0, q = null;
  while (i < css.length) {
    const c = css[i];
    if (q) { out += c; if (c === "\\") { out += css[i + 1] || ""; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'") { q = c; out += c; i++; continue; }
    if (c === "/" && css[i + 1] === "*") { const e = css.indexOf("*/", i + 2); i = e < 0 ? css.length : e + 2; continue; }
    out += c; i++;
  }
  return out.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}
const css = fs.readFileSync(path.join(SRC, "theme.css"), "utf8");
const min = stripCss(css);
fs.writeFileSync(path.join(OUT, "theme.css"), min);
console.log("css", css.length, "->", min.length);

fs.copyFileSync(path.join(SRC, "splash.mp3"), path.join(OUT, "splash.mp3"));

// Fonts: self-hosted woff2 (Funnel Sans variable + Bebas Neue, latin + latin-ext), SIL OFL
for (const f of fs.readdirSync(path.join(SRC, "fonts")).filter((f) => f.endsWith(".woff2"))) {
  fs.copyFileSync(path.join(SRC, "fonts", f), path.join(OUT, "font_" + f.replace(/-/g, "_")));
}
console.log("done");

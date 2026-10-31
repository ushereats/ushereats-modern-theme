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

// Head scripts (hero + home rows): inlined in the page head, so ES5 (TVs) and as small as possible
for (const name of ["hero-boot", "rows-boot"]) {
  const code = fs.readFileSync(path.join(SRC, name + ".js"), "utf8");
  const out = await minify(code, { ecma: 5, compress: { passes: 2 }, mangle: true, format: { ascii_only: true, comments: false } });
  if (!out.code || out.code.includes("</")) throw new Error(name + " minify failed");
  fs.writeFileSync(path.join(OUT, name.replace(/-/g, "_") + ".js"), out.code);
  console.log("js ", name + ".js", code.length, "->", out.code.length);
}

// Studio logos (KefinTweaks, MIT): "Disney+.svg" -> studio_Disney_plus.svg; editor metadata stripped
for (const f of fs.readdirSync(path.join(SRC, "studios")).filter((f) => f.endsWith(".svg"))) {
  let svg = fs.readFileSync(path.join(SRC, "studios", f), "utf8");
  svg = svg.replace(/<\?xml[^>]*>/g, "").replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<sodipodi:namedview[\s\S]*?(\/>|<\/sodipodi:namedview>)/g, "")
    .replace(/<metadata[\s\S]*?<\/metadata>/g, "").replace(/>\s+</g, "><").trim();
  fs.writeFileSync(path.join(OUT, "studio_" + f.slice(0, -4).replace(/\+/g, "_plus") + ".svg"), svg);
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

// ── SleekFin (MIT, varunaditya-plus), built into the plugin ──
// Its frontend is built by sleekfin/build.js (esbuild + babel, same as SleekFin); needs `npm ci --prefix sleekfin` first.
{
  const SF = "sleekfin";
  const { execFileSync } = await import("node:child_process");
  execFileSync(process.execPath, ["build.js"], { cwd: SF, stdio: "inherit" });
  for (const name of ["runtime", "theme", "header", "media", "details", "details-builder"]) {
    fs.copyFileSync(path.join(SF, "build", "sleekfin-" + name + ".js"), path.join(OUT, "sleek_" + name.replace(/-/g, "_") + ".js"));
  }
  // details page "hide until built" script: inlined in the page head, so ES5 + minified
  const boot = fs.readFileSync(path.join(SF, "Inject/Details/sleekfin-details-boot.js"), "utf8");
  const bootMin = await minify(boot, { ecma: 5, compress: { passes: 2 }, mangle: true, format: { ascii_only: true, comments: false } });
  if (!bootMin.code || bootMin.code.includes("</")) throw new Error("details boot minify failed");
  fs.writeFileSync(path.join(OUT, "sleek_details_boot.js"), bootMin.code);

  // all of SleekFin's styles in SleekFin's own order, in one file (prepended to theme.css by the plugin).
  // Left out: Jellyfin Enhanced styles (not installed).
  const ORDER = [
    "Theme/sleekfin-fonts.css", "Theme/sleekfin-tokens.css", "Theme/sleekfin-foundation.css",
    "Components/sleekfin-control-surface.css", "Components/sleekfin-dialog.css", "Components/sleekfin-button.css",
    "Components/sleekfin-section-heading.css", "Components/sleekfin-fact.css", "Components/sleekfin-meta.css",
    "Header/sleekfin-header-shared.css", "Header/sleekfin-header-brand.css", "Header/sleekfin-header-modern.css", "Header/sleekfin-header-legacy.css",
    "Hero/sleekfin-hero.css", "Hero/sleekfin-hero-slide.css", "Hero/sleekfin-hero-carousel.css",
    "Media/sleekfin-media.css", "Media/sleekfin-media-metadata.css",
    "Details/sleekfin-details.css", "Details/sleekfin-details-hero.css", "Details/sleekfin-details-actions.css",
    "Details/sleekfin-details-sections.css", "Details/sleekfin-details-similar.css", "Details/sleekfin-details-episodes.css",
    "Details/sleekfin-details-dropdown.css", "Details/sleekfin-details-track-picker.css",
    "Components/sleekfin-card.css"
  ];
  let all = "";
  for (const f of ORDER) all += stripCss(fs.readFileSync(path.join(SF, "Inject", f), "utf8")) + "\n";
  all = all.replace(/url\("fonts\/(inter-[a-z-]+\.woff2)"\)/g, 'url("font/$1?v=__TB_FONT_V__")');
  fs.writeFileSync(path.join(OUT, "sleek.css"), all);
  console.log("css sleekfin", all.length);
  // single files the SleekFin settings page loads by name (details builder preview)
  for (const dir of ["Configuration", "Details", "Components", "Theme", "Header", "Hero", "Media"]) {
    for (const f of fs.readdirSync(path.join(SF, "Inject", dir)).filter((f) => f.endsWith(".css"))) {
      fs.writeFileSync(path.join(OUT, "sleekcss_" + f.slice(9).replace(/-/g, "_")), stripCss(fs.readFileSync(path.join(SF, "Inject", dir, f), "utf8")));
    }
  }
  for (const f of fs.readdirSync(path.join(SF, "Inject/Fonts")).filter((f) => f.endsWith(".woff2"))) {
    fs.copyFileSync(path.join(SF, "Inject/Fonts", f), path.join(OUT, "font_" + f.replace(/-/g, "_")));
  }
}

// Fonts: self-hosted woff2 (Funnel Sans variable + Bebas Neue, latin + latin-ext), SIL OFL
for (const f of fs.readdirSync(path.join(SRC, "fonts")).filter((f) => f.endsWith(".woff2"))) {
  fs.copyFileSync(path.join(SRC, "fonts", f), path.join(OUT, "font_" + f.replace(/-/g, "_")));
}
console.log("done");

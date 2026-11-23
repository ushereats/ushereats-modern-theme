// Builds the files the plugin ships (src/Jellyfin.Plugin.UshereatsTheme/Assets) from web-src.
//   npm install --no-save terser@5.31.6 && node build-assets.mjs
// Edit things in web-src/, never in Assets/ (it is regenerated).
import { minify } from "terser";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import postcss from "postcss";
import selParser from "postcss-selector-parser";

// Lint + typecheck: build fails on errors
const isWin = process.platform === "win32";
const eslintBin = path.join("node_modules", ".bin", isWin ? "eslint.cmd" : "eslint");
const tscBin = path.join("node_modules", ".bin", isWin ? "tsc.cmd" : "tsc");
try {
  execFileSync(isWin ? eslintBin : process.execPath, isWin ? ["web-src/"] : [eslintBin, "web-src/"], { stdio: "inherit", shell: isWin });
} catch {
  console.error("ESLint errors — fix them before building.");
  process.exit(1);
}
try {
  execFileSync(isWin ? tscBin : process.execPath, isWin ? [] : [tscBin], { stdio: "inherit", shell: isWin });
} catch {
  console.error("TypeScript errors — fix them before building.");
  process.exit(1);
}

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
for (const name of ["hero-boot", "rows-boot", "sw-cache", "core"]) {
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
  return minCss(out);
}
// Faster matching, same result: a selector whose last part is ":is(.a, .b)" can't be filed under a class by the
// browser, so it's tried against every element on every style check. Written out as ".a, .b" it's only tried on
// elements that have those classes. Only done when every choice is a plain class / id / tag / attribute and all
// have the same weight (so which rule wins never changes); anything else is left exactly as written.
function spec(n) {
  let a = 0, b = 0, c = 0;
  n.walk((x) => { if (x.type === "id") a++; else if (x.type === "class" || x.type === "attribute") b++; else if (x.type === "tag" && x.value !== "*") c++; });
  return a + "," + b + "," + c;
}
const SIMPLE = new Set(["class", "id", "tag", "attribute"]);
function expandIs(selector) {
  let out = null;
  try {
    selParser((root) => {
      const list = [];
      root.each((sel) => {
        const nodes = sel.nodes;
        let start = nodes.length;
        while (start > 0 && nodes[start - 1].type !== "combinator") start--;
        const last = nodes.slice(start);
        const isIdx = last.findIndex((n) => n.type === "pseudo" && n.value === ":is");
        const plain = last.some((n) => n.type === "class" || n.type === "id" || n.type === "tag" || n.type === "nesting");
        const isNode = isIdx >= 0 ? last[isIdx] : null;
        const args = isNode ? isNode.nodes : [];
        const ok = isNode && !plain && last.filter((n) => n.type === "pseudo" && n.value === ":is").length === 1 &&
          !last.some((n) => n.type === "pseudo" && /^::|^:(before|after)$/.test(n.value)) &&
          args.length > 1 && args.every((arg) => arg.nodes.length >= 1 && arg.nodes.every((x) => SIMPLE.has(x.type)) && arg.nodes.filter((x) => x.type === "tag").length <= 1) &&
          new Set(args.map(spec)).size === 1;
        if (!ok) { list.push(sel.toString().trim()); return; }
        const prefix = nodes.slice(0, start).map(String).join("");
        const rest = last.filter((n) => n !== isNode).map(String).join("");
        for (const arg of args) {
          const parts = arg.nodes.map((x) => String(x).trim());
          const tag = arg.nodes.findIndex((x) => x.type === "tag");
          const head = tag >= 0 ? parts[tag] + parts.filter((_, i) => i !== tag).join("") : parts.join("");
          list.push((prefix + head + rest).trim());
        }
      });
      out = list;
    }).processSync(selector);
  } catch (e) { out = null; }
  return out;
}
// Whitespace-only minify: same rules, same order, same values (nothing merged or rewritten), just no spaces/newlines
// the browser doesn't need. Values with quotes are left exactly as written.
function minCss(css) {
  const ws = (t) => (/["']/.test(t) ? t.trim() : t.replace(/\s+/g, " ").trim());
  const root = postcss.parse(css);
  root.walkComments((c) => c.remove());
  root.walk((n) => {
    n.raws.before = ""; n.raws.after = "";
    if (n.type === "decl") { n.raws.between = ":"; n.value = ws(n.value); if (n.important) n.raws.important = "!important"; }
    else if (n.type === "rule") {
      n.raws.between = ""; n.raws.semicolon = false;
      const inKeyframes = n.parent && n.parent.type === "atrule" && /keyframes/i.test(n.parent.name);
      const sels = inKeyframes ? n.selectors : n.selectors.flatMap((x) => expandIs(x) || [x]);
      n.selector = sels.map(ws).join(",");
    }
    else if (n.type === "atrule") { n.raws.between = ""; n.raws.afterName = " "; n.raws.semicolon = false; n.params = ws(n.params); if (!n.params) n.raws.afterName = ""; }
  });
  root.raws.after = "";
  return root.toString();
}
const css = fs.readFileSync(path.join(SRC, "theme.css"), "utf8");
const min = stripCss(css);
fs.writeFileSync(path.join(OUT, "theme.css"), min);
console.log("css", css.length, "->", min.length);

fs.copyFileSync(path.join(SRC, "splash.mp3"), path.join(OUT, "splash.mp3"));

// ── Base look (MIT, varunaditya-plus), built into the plugin ──
// Its frontend is built by look/build.js (esbuild + babel, as the original project); needs `npm ci --prefix look` first.
{
  const SF = "look";
  execFileSync(process.execPath, ["build.js"], { cwd: SF, stdio: "inherit" });
  for (const name of ["runtime", "theme", "header", "media", "details", "details-builder"]) {
    fs.copyFileSync(path.join(SF, "build", "ue-" + name + ".js"), path.join(OUT, "look_" + name.replace(/-/g, "_") + ".js"));
  }
  // details page "hide until built" script: inlined in the page head, so ES5 + minified
  const boot = fs.readFileSync(path.join(SF, "Inject/Details/ue-details-boot.js"), "utf8");
  const bootMin = await minify(boot, { ecma: 5, compress: { passes: 2 }, mangle: true, format: { ascii_only: true, comments: false } });
  if (!bootMin.code || bootMin.code.includes("</")) throw new Error("details boot minify failed");
  fs.writeFileSync(path.join(OUT, "look_details_boot.js"), bootMin.code);

  // all of the base look's styles in the base look's own order, in one file (prepended to theme.css by the plugin).
  // Left out: Jellyfin Enhanced styles (not installed).
  const ORDER = [
    "Theme/ue-fonts.css", "Theme/ue-tokens.css", "Theme/ue-foundation.css",
    "Components/ue-control-surface.css", "Components/ue-dialog.css", "Components/ue-button.css",
    "Components/ue-section-heading.css", "Components/ue-fact.css", "Components/ue-meta.css",
    "Header/ue-header-shared.css", "Header/ue-header-brand.css", "Header/ue-header-modern.css", "Header/ue-header-legacy.css", "Header/ue-header-avatar.css",
    "Hero/ue-hero.css", "Hero/ue-hero-slide.css", "Hero/ue-hero-carousel.css",
    "Media/ue-media.css", "Media/ue-media-metadata.css",
    "Details/ue-details.css", "Details/ue-details-hero.css", "Details/ue-details-actions.css",
    "Details/ue-details-sections.css", "Details/ue-details-similar.css", "Details/ue-details-episodes.css",
    "Details/ue-details-dropdown.css", "Details/ue-details-track-picker.css",
    "Components/ue-card.css", "Components/ue-hover.css", "Theme/ue-ambient.css"
  ];
  let all = "";
  for (const f of ORDER) all += stripCss(fs.readFileSync(path.join(SF, "Inject", f), "utf8")) + "\n";
  all = all.replace(/url\("fonts\/(inter-[a-z-]+\.woff2)"\)/g, 'url("font/$1?v=__TB_FONT_V__")');
  fs.writeFileSync(path.join(OUT, "look.css"), all);
  console.log("css look", all.length);
  // the single files the settings page loads by name (details builder preview); nothing else asks for one
  const SINGLE = [
    "Configuration/ue-details-builder.css", "Configuration/ue-details-builder-fields.css",
    "Configuration/ue-details-builder-overflow.css", "Configuration/ue-details-builder-preview.css",
    "Details/ue-details-hero.css", "Details/ue-details-actions.css", "Details/ue-details-dropdown.css", "Details/ue-details-track-picker.css"
  ];
  for (const rel of SINGLE) {
    const f = path.basename(rel);
    fs.writeFileSync(path.join(OUT, "lookcss_" + f.slice(3).replace(/-/g, "_")), stripCss(fs.readFileSync(path.join(SF, "Inject", rel), "utf8")));
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

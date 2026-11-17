# How the theme fits together

## What runs where

**Server (C#, `src/Jellyfin.Plugin.UshereatsTheme/`)**
- `IndexPatch.cs` adds the theme to Jellyfin's `index.html` head (through File Transformation): boot flags, the accent
  colour, the hero/rows head scripts and the `<link>`/`<script>` for theme.css/theme.js, so nothing flashes unstyled.
- `ThemeAssets.cs` builds **one theme.css and one theme.js per settings change** and keeps plain/gzip/brotli copies:
  - theme.css = base look styles (`look.css`) + `.tb-look-end` marker + `web-src/theme.css` + logo rules
  - theme.js = `TB_CONFIG` (your settings) + `__tbLook` + `web-src/core.js` (shared helpers) + every feature that is
    switched on (`Features` list, gated by a setting each). Heavy parts (details, player, search) load on demand
    from `part/{name}.js`.
- `Api/ThemeController.cs` serves them with an ETag and `immutable` caching (the URL carries the version).
- Other controllers: home rows (`HomeController`), search index, trending, posters, error reports, server meter.
- `Configuration/configPage.html` is the settings page; `PluginConfiguration.cs` the settings; `Look/` the base look's
  settings (old `Sleek` section migrated on first start in `Plugin.cs`).

**Browser**
- `web-src/core.js`: `tbCfg`, `tbAdded` (one page watcher, added elements once per frame), `tbWatch` (whole-page
  watcher, throttled during playback), `tbCss` (all feature styles in one `<style>`), `tbIn`/`tbUp`, `tbItems`
  (poster lookups merged into one request), `tbShared` (one shared user/sessions request).
- `web-src/js/NN-name.js`: one feature per file, each an IIFE; numbers set the load order.
- `web-src/hero-boot.js`, `rows-boot.js`: inlined in the head (ES5, for TVs) so the hero and home rows draw instantly.
- `look/`: the base look (header, details page, cards, hero styles). `look/Frontend` is built by `look/build.js`
  (esbuild + babel) into `look_*.js`; `look/Inject/**.css` is joined into `look.css` in the order in `build-assets.mjs`.

## Build

`node build-assets.mjs` (needs `npm ci --prefix look` once): lint + typecheck, minify every feature, core and head
script, build `look.css` and the base frontend, copy fonts/logos into `Assets/` (generated, gitignored, embedded in
the DLL). CI (`.github/workflows/build.yml`) runs the same, then `dotnet publish` and releases `v1.0.N` on every push
to `main`.

## Checks

- `npm run lint`: stricter rules (unused code, loose comparisons, unreachable code are errors).
- `npm run check-styles -- save` before a CSS change, `npm run check-styles` after (`node build-assets.mjs` first):
  renders a piece of markup for every selector the theme ships, plus pieces that match two competing selectors at
  once, on top of Jellyfin's own stylesheets (`ci/styles/jellyfin.css`), and compares every computed style.
  A refactor that should look identical must report 0 differences.
- `ci/smoke.mjs`, `ci/visual/*`: against your own server with the test user (`ci-session.json`).

## Rules of the codebase

- The base look's styles come first, the theme's second: the theme wins by order, not by `!important` tricks where
  it can avoid them. `:not(#tb-x)` (adds id-level weight) is only left where the style checker shows it's needed.
- Anything built from server data into HTML goes through `esc()` (or `textContent`).
- Timers, observers and listeners that watch page pieces stop watching them when the piece leaves the page.

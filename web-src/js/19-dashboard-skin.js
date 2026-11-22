(function dashboardSkin() {
  // Admin dashboard restyle + upgrades. Jellyfin does NOT load Custom CSS on dashboard pages,
  // so this script injects its own styles. Everything is scoped to the admin area (body.dashboardDocument).
  //  - Home: our own layout (health strip, attention, library strip, recently added, storage, tasks, activity);
  //    Jellyfin's own boxes there are hidden. Restart / Shutdown / Update all live in a Server menu, hold to confirm.
  //  - Other admin pages: glass restyle, danger dialogs hold-to-confirm
  //  - Menu: Plugins section collapsible (remembered), icons per plugin
  if (window.__tbDash) return;
  window.__tbDash = true;

  // \u2500\u2500 Settings \u2500\u2500
  var HOLD_MS = tbCfg("DashboardHoldMs", 1200);            // how long to hold Restart / Shutdown
  var RECENT_COUNT = tbCfg("DashboardRecentCount", 16);         // posters in "Recently added" (0 = hide the strip)
  var BLUR_IPS = tbCfg("DashboardBlurIps", true);           // blur IP addresses in Activity until hover
  var PLUGINS_COLLAPSED = tbCfg("DashboardPluginsCollapsed", true);  // Plugins menu section collapsed by default

  var CSS = "/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ADMIN DASHBOARD: neon glass \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   Scoped to the admin area only (body.dashboardDocument). Main UI untouched.\n   Uses the base look accent; --tb-accent-rgb comes from accent.js. */\nbody.dashboardDocument {\n  --tbd-acc: var(--ue-accent, rgb(233, 196, 106));\n  --tbd-rgb: var(--tb-accent-rgb, 233, 196, 106);\n  --tbd-glass: rgba(18, 18, 22, 0.55);\n  --tbd-line: rgba(255, 255, 255, 0.08);\n  --tbd-radius: 18px;\n}\n\n/* \u2500\u2500 Background: moving aurora in the accent + violet \u2500\u2500 */\nbody.dashboardDocument:not(#tb-x) {\n  background: #060608 !important;\n}\nbody.dashboardDocument::before {\n  content: \"\"; position: fixed; inset: -20%; z-index: 0; pointer-events: none;\n  background:\n    radial-gradient(40% 35% at 20% 15%, rgba(var(--tbd-rgb), 0.22) 0%, transparent 70%),\n    radial-gradient(35% 30% at 85% 20%, rgba(140, 90, 255, 0.18) 0%, transparent 70%),\n    radial-gradient(40% 35% at 60% 95%, rgba(0, 200, 255, 0.12) 0%, transparent 70%);\n  filter: blur(20px);\n  animation: tbd-aurora 26s ease-in-out infinite alternate;\n}\n@keyframes tbd-aurora {\n  0%   { transform: translate3d(0, 0, 0) scale(1); }\n  50%  { transform: translate3d(3%, -2%, 0) scale(1.08); }\n  100% { transform: translate3d(-3%, 2%, 0) scale(1.02); }\n}\nbody.dashboardDocument .skinBody,\nbody.dashboardDocument .mainAnimatedPage,\nbody.dashboardDocument .backgroundContainer { background: transparent !important; }\n\n/* \u2500\u2500 Top bar + drawer: frosted glass \u2500\u2500 */\nbody.dashboardDocument .MuiAppBar-root:not(#tb-x) {\n  background: rgba(8, 8, 10, 0.55) !important; background-image: none !important;\n  -webkit-backdrop-filter: blur(18px) saturate(1.3); backdrop-filter: blur(18px) saturate(1.3);\n  border-bottom: 1px solid var(--tbd-line) !important; box-shadow: none !important;\n}\nbody.dashboardDocument .MuiDrawer-paper:not(#tb-x) {\n  background: rgba(10, 10, 13, 0.6) !important; background-image: none !important;\n  -webkit-backdrop-filter: blur(22px); backdrop-filter: blur(22px);\n  border-right: 1px solid var(--tbd-line) !important;\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListSubheader-root:not(#tb-x) {\n  background: transparent !important;\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif) !important;\n  font-size: 18px !important; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.45) !important;\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListItemButton-root:not(#tb-x) {\n  margin: 2px 10px; border-radius: 12px !important;\n  transition: background-color 150ms ease, transform 150ms ease, color 150ms ease;\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListItemButton-root:not(#tb-x):hover {\n  background: rgba(255, 255, 255, 0.06) !important; transform: translateX(3px);\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListItemButton-root.Mui-selected:not(#tb-x) {\n  background: linear-gradient(90deg, rgba(var(--tbd-rgb), 0.28), rgba(var(--tbd-rgb), 0.06)) !important;\n  color: #fff !important;\n  box-shadow: inset 3px 0 0 var(--tbd-acc), 0 0 22px -8px rgba(var(--tbd-rgb), 0.8);\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListItemButton-root.Mui-selected .MuiListItemIcon-root:not(#tb-x) { color: var(--tbd-acc) !important; }\n\n/* \u2500\u2500 Cards / papers everywhere in admin: glass with a gradient edge \u2500\u2500 */\nbody.dashboardDocument .mainAnimatedPage .MuiPaper-root:not(.MuiAppBar-root):not(.MuiDrawer-paper):not(.MuiMenu-paper):not(#tb-x) {\n  position: relative;\n  background: var(--tbd-glass) !important; background-image: none !important;\n  border: 1px solid var(--tbd-line) !important;\n  border-radius: var(--tbd-radius) !important;\n  box-shadow: 0 20px 50px -24px rgba(0, 0, 0, 0.9) !important;\n  -webkit-backdrop-filter: blur(16px) saturate(1.2); backdrop-filter: blur(16px) saturate(1.2);\n}\nbody.dashboardDocument .mainAnimatedPage .MuiCard-root:not(#tb-x) {\n  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 220ms ease, border-color 220ms ease;\n}\n@media (hover: hover) {\n  body.dashboardDocument .mainAnimatedPage .MuiCard-root:not(#tb-x):hover {\n    transform: translateY(-4px);\n    border-color: rgba(var(--tbd-rgb), 0.45) !important;\n    box-shadow: 0 26px 60px -24px rgba(0, 0, 0, 0.95), 0 0 30px -10px rgba(var(--tbd-rgb), 0.55) !important;\n  }\n}\n\n/* \u2500\u2500 Widget headings (SERVER, ACTIVITY, ALERTS, PATHS...) \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiButton-textInherit:not(#tb-x) {\n  padding: 4px 6px !important; border-radius: 10px !important; background: transparent !important;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textInherit .MuiTypography-h3:not(#tb-x),\nbody.dashboardDocument #dashboardPage h2,\nbody.dashboardDocument #dashboardPage h3 {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif) !important;\n  font-size: 30px !important; font-weight: 400 !important; letter-spacing: 0.04em; line-height: 1;\n  text-transform: uppercase;\n  background: linear-gradient(90deg, #fff 0%, #fff 40%, var(--tbd-acc) 100%);\n  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textInherit .MuiButton-endIcon:not(#tb-x) {\n  color: var(--tbd-acc); transition: transform 180ms ease;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textInherit:hover .MuiButton-endIcon:not(#tb-x) { transform: translateX(4px); }\n\n/* \u2500\u2500 Server card: label/value rows \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiPaper-root > .MuiStack-root > .MuiStack-root:first-child .MuiTypography-root {\n  color: rgba(255, 255, 255, 0.5) !important; font-size: 13px !important; text-transform: uppercase; letter-spacing: 0.06em;\n}\n\n/* \u2500\u2500 Buttons: Scan = accent glow pill, Restart / Shutdown = red glass pills \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiButton-root:not(.MuiButton-textInherit):not(#tb-x) {\n  padding: 9px 18px !important; border-radius: 999px !important;\n  font-weight: 700 !important; text-transform: none !important; letter-spacing: 0.01em;\n  transition: transform 160ms ease, box-shadow 200ms ease, background-color 160ms ease, filter 160ms ease;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textPrimary:not(#tb-x),\nbody.dashboardDocument #dashboardPage .MuiButton-containedPrimary:not(#tb-x) {\n  color: #111 !important;\n  background: linear-gradient(135deg, var(--tbd-acc), rgba(var(--tbd-rgb), 0.75)) !important;\n  box-shadow: 0 8px 26px -8px rgba(var(--tbd-rgb), 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.35) !important;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textError:not(#tb-x),\nbody.dashboardDocument #dashboardPage .MuiButton-containedError:not(#tb-x) {\n  color: #ff8080 !important;\n  background: rgba(255, 70, 70, 0.10) !important;\n  border: 1px solid rgba(255, 90, 90, 0.35) !important;\n}\n@media (hover: hover) {\n  body.dashboardDocument #dashboardPage .MuiButton-root:not(.MuiButton-textInherit):not(#tb-x):hover { transform: translateY(-2px); }\n  body.dashboardDocument #dashboardPage .MuiButton-textPrimary:not(#tb-x):hover { filter: brightness(1.08);\n    box-shadow: 0 12px 34px -8px rgba(var(--tbd-rgb), 1), inset 0 1px 0 rgba(255, 255, 255, 0.35) !important; }\n  body.dashboardDocument #dashboardPage .MuiButton-textError:not(#tb-x):hover {\n    color: #fff !important; background: rgba(255, 60, 60, 0.85) !important; box-shadow: 0 10px 30px -8px rgba(255, 60, 60, 0.9) !important; }\n}\nbody.dashboardDocument #dashboardPage .MuiButton-root.Mui-disabled:not(#tb-x) { opacity: 0.55; filter: saturate(0.6); }\n\n/* \u2500\u2500 Stat tiles: huge Bebas numbers + glowing icon chips, colour per library type \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiCard-root .MuiTypography-h5:not(#tb-x) {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif) !important;\n  font-size: 44px !important; line-height: 1 !important; letter-spacing: 0.02em; margin-top: 4px;\n  color: #fff;\n  text-shadow: 0 0 24px rgba(var(--tbd-rgb), 0.35);\n}\nbody.dashboardDocument #dashboardPage .MuiCard-root .MuiTypography-body2:not(#tb-x) {\n  font-size: 11px !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: 0.12em;\n}\nbody.dashboardDocument #dashboardPage .MuiCard-root:not(#tb-x) { --c: var(--tbd-acc); }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"MovieIcon\"]):not(#tb-x)        { --c: #ff5d73; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"TvIcon\"]):not(#tb-x)           { --c: #4fc3ff; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"MusicNoteIcon\"]):not(#tb-x)    { --c: #b98bff; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"MusicVideoIcon\"]):not(#tb-x)   { --c: #ff9f43; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"VideoLibraryIcon\"]):not(#tb-x) { --c: #3ee0a1; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"BookIcon\"]):not(#tb-x)         { --c: #ffd166; }\nbody.dashboardDocument #dashboardPage .MuiCard-root > .MuiStack-root > .MuiSvgIcon-fontSizeLarge:not(#tb-x) {\n  box-sizing: content-box; width: 30px; height: 30px; padding: 12px; border-radius: 14px;\n  color: var(--c);\n  background: color-mix(in srgb, var(--c) 16%, transparent);\n  box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 35%, transparent), 0 0 28px -6px var(--c);\n}\n/* matching coloured top edge on each tile */\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(> .MuiStack-root > .MuiSvgIcon-fontSizeLarge)::before {\n  content: \"\"; position: absolute; left: 18px; right: 18px; top: 0; height: 2px; border-radius: 2px;\n  background: linear-gradient(90deg, transparent, var(--c), transparent); opacity: 0.9;\n}\n@media (hover: hover) {\n  body.dashboardDocument #dashboardPage .MuiCard-root:has(> .MuiStack-root > .MuiSvgIcon-fontSizeLarge):not(#tb-x):hover {\n    border-color: color-mix(in srgb, var(--c) 50%, transparent) !important;\n    box-shadow: 0 26px 60px -24px rgba(0, 0, 0, 0.95), 0 0 30px -10px var(--c) !important;\n  }\n}\n\n/* \u2500\u2500 Device / now-playing cards: rounded artwork, glowing progress \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiCardMedia-root:not(#tb-x) { border-radius: 14px 14px 0 0; }\nbody.dashboardDocument #dashboardPage .MuiCardActions-root:not(#tb-x) { border-top: 1px solid var(--tbd-line); }\nbody.dashboardDocument #dashboardPage .MuiCardActions-root .MuiIconButton-root:not(#tb-x) {\n  background: rgba(255, 255, 255, 0.06); margin-right: 6px; transition: background-color 150ms ease, color 150ms ease;\n}\nbody.dashboardDocument #dashboardPage .MuiCardActions-root .MuiIconButton-root:not(#tb-x):hover { background: var(--tbd-acc); color: #111; }\nbody.dashboardDocument .MuiChip-root:not(#tb-x) {\n  border-radius: 8px !important; font-weight: 700 !important; font-size: 11px !important; letter-spacing: 0.04em;\n  background: rgba(var(--tbd-rgb), 0.14) !important; color: var(--tbd-acc) !important;\n  border: 1px solid rgba(var(--tbd-rgb), 0.35) !important;\n}\n\n/* \u2500\u2500 Progress bars (paths, playback, tasks): thick, rounded, shimmering \u2500\u2500 */\nbody.dashboardDocument .MuiLinearProgress-root:not(#tb-x) {\n  height: 8px !important; border-radius: 999px !important; background: rgba(255, 255, 255, 0.08) !important; overflow: hidden;\n}\nbody.dashboardDocument .MuiLinearProgress-bar:not(#tb-x) { border-radius: 999px !important; }\nbody.dashboardDocument .MuiLinearProgress-barColorPrimary:not(#tb-x),\nbody.dashboardDocument .MuiLinearProgress-barColorSuccess:not(#tb-x) {\n  background: linear-gradient(90deg, rgba(var(--tbd-rgb), 0.55), var(--tbd-acc)) !important;\n  box-shadow: 0 0 14px rgba(var(--tbd-rgb), 0.7);\n}\nbody.dashboardDocument .MuiLinearProgress-barColorWarning:not(#tb-x) { background: linear-gradient(90deg, #ff9f43, #ffd166) !important; box-shadow: 0 0 14px rgba(255, 170, 60, 0.7); }\nbody.dashboardDocument .MuiLinearProgress-barColorError:not(#tb-x)   { background: linear-gradient(90deg, #ff4d6d, #ff8080) !important; box-shadow: 0 0 14px rgba(255, 80, 100, 0.7); }\nbody.dashboardDocument .MuiLinearProgress-determinate .MuiLinearProgress-bar1Determinate::after {\n  content: \"\"; position: absolute; inset: 0;\n  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.45) 50%, transparent 100%);\n  transform: translateX(-100%); animation: tbd-shimmer 2.6s ease-in-out infinite;\n}\n@keyframes tbd-shimmer { 60%, 100% { transform: translateX(100%); } }\n\n/* \u2500\u2500 Activity / Alerts / Paths lists: each row a mini card \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiList-root:not(#tb-x) { padding: 8px !important; }\nbody.dashboardDocument #dashboardPage .MuiList-root > .MuiListItem-root:not(#tb-x) {\n  margin-bottom: 6px; border-radius: 14px; background: rgba(255, 255, 255, 0.03);\n  border: 1px solid rgba(255, 255, 255, 0.04);\n  transition: background-color 150ms ease, border-color 150ms ease, transform 150ms ease;\n}\nbody.dashboardDocument #dashboardPage .MuiList-root > .MuiListItem-root:not(#tb-x):hover {\n  background: rgba(255, 255, 255, 0.06); border-color: rgba(var(--tbd-rgb), 0.3); transform: translateX(3px);\n}\nbody.dashboardDocument #dashboardPage .MuiListItemButton-root:not(#tb-x) { border-radius: 14px !important; }\nbody.dashboardDocument #dashboardPage .MuiListItemAvatar-root .MuiAvatar-root:not(#tb-x) {\n  border-radius: 12px !important; box-shadow: 0 0 20px -4px currentColor, inset 0 1px 0 rgba(255, 255, 255, 0.25);\n  color: rgba(255, 255, 255, 0.5);\n}\nbody.dashboardDocument #dashboardPage .MuiListItemText-primary:not(#tb-x),\nbody.dashboardDocument #dashboardPage .MuiListItemText-root > .MuiTypography-root:first-child { font-weight: 600 !important; }\nbody.dashboardDocument #dashboardPage .MuiListItemIcon-root:not(#tb-x) { color: var(--tbd-acc) !important; }\n\n/* \u2500\u2500 Entrance: widgets rise in, staggered \u2500\u2500 */\n@media (prefers-reduced-motion: no-preference) {\n  body.dashboardDocument #dashboardPage .content-primary > .MuiGrid-container > .MuiGrid-item {\n    animation: tbd-rise 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  }\n  body.dashboardDocument #dashboardPage .content-primary > .MuiGrid-container > .MuiGrid-item:nth-child(2) { animation-delay: 90ms; }\n  body.dashboardDocument #dashboardPage .content-primary > .MuiGrid-container > .MuiGrid-item:nth-child(3) { animation-delay: 180ms; }\n}\n@keyframes tbd-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }\n\n/* \u2500\u2500 Inputs + dialogs in admin pages \u2500\u2500 */\nbody.dashboardDocument .MuiOutlinedInput-root:not(#tb-x) { border-radius: 12px !important; }\nbody.dashboardDocument .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline:not(#tb-x) {\n  border-color: var(--tbd-acc) !important; box-shadow: 0 0 0 3px rgba(var(--tbd-rgb), 0.18);\n}\nbody.dashboardDocument .MuiDialog-paper:not(#tb-x) {\n  background: rgba(16, 16, 20, 0.88) !important; background-image: none !important;\n  border: 1px solid var(--tbd-line); border-radius: 20px !important;\n  -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);\n}\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 end ADMIN DASHBOARD \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ADMIN DASHBOARD: extras (hero, tiles, drives, feed, hold-to-confirm, menu, phone) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nbody.dashboardDocument [data-tb-hide] { display: none !important; }\nbody.dashboardDocument .tb-sec-title {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 30px; line-height: 1; letter-spacing: 0.04em;\n  text-transform: uppercase; margin: 8px 6px 12px;\n  background: linear-gradient(90deg, #fff 0%, #fff 40%, var(--tbd-acc) 100%);\n  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;\n}\n\n/* \u2500\u2500 1. Server hero \u2500\u2500 */\nbody.dashboardDocument #dashboardPage [data-tb-hero]:not(#tb-x) {\n  overflow: hidden; padding: 22px 24px !important;\n  background:\n    radial-gradient(80% 140% at 0% 0%, rgba(var(--tbd-rgb), 0.22) 0%, transparent 60%),\n    radial-gradient(60% 120% at 100% 100%, rgba(140, 90, 255, 0.16) 0%, transparent 60%),\n    var(--tbd-glass) !important;\n}\n.tb-hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }\n.tb-hero-name {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 58px; line-height: 0.9; letter-spacing: 0.02em;\n  background: linear-gradient(90deg, #fff 30%, var(--tbd-acc));\n  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;\n  overflow-wrap: anywhere;\n}\n.tb-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }\n.tb-chip {\n  display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px; border-radius: 999px;\n  font-size: 12px; font-weight: 700; letter-spacing: 0.02em; color: rgba(255, 255, 255, 0.82);\n  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1);\n}\n.tb-chip.on { color: #3ee0a1; background: rgba(62, 224, 161, 0.1); border-color: rgba(62, 224, 161, 0.35); }\n.tb-chip.acc { color: var(--tbd-acc); background: rgba(var(--tbd-rgb), 0.12); border-color: rgba(var(--tbd-rgb), 0.4); }\n.tb-chip.warn { color: #ffb347; background: rgba(255, 159, 67, 0.12); border-color: rgba(255, 159, 67, 0.4); }\n.tb-dot { width: 8px; height: 8px; border-radius: 50%; background: #3ee0a1; animation: tb-pulse 1.8s ease-out infinite; }\n@keyframes tb-pulse {\n  0% { box-shadow: 0 0 0 0 rgba(62, 224, 161, 0.65); }\n  70% { box-shadow: 0 0 0 9px rgba(62, 224, 161, 0); }\n  100% { box-shadow: 0 0 0 0 rgba(62, 224, 161, 0); }\n}\n.tb-hero-stats { display: flex; gap: 10px; }\n.tb-hs {\n  min-width: 86px; padding: 10px 14px; border-radius: 14px; text-align: center;\n  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.07);\n}\n.tb-hs b { display: block; font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-weight: 400; font-size: 36px; line-height: 1; color: #fff; }\n.tb-hs span { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); }\n.tb-hs.live b { color: var(--tbd-acc); text-shadow: 0 0 18px rgba(var(--tbd-rgb), 0.6); }\n\n/* \u2500\u2500 Scan button doubles as a progress bar while scanning \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiButton-root[data-tb-scan]:not(#tb-x) {\n  opacity: 1 !important; filter: none !important; color: #111 !important;\n  background: linear-gradient(90deg, var(--tbd-acc) var(--p, 0%), rgba(var(--tbd-rgb), 0.28) var(--p, 0%)) !important;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-root[data-tb-scan]::after {\n  content: attr(data-tb-scan); margin-left: 4px; font-variant-numeric: tabular-nums;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-root[data-tb-scan] .MuiButton-startIcon { animation: tb-spin 1.1s linear infinite; }\n@keyframes tb-spin { to { transform: rotate(360deg); } }\n\n/* \u2500\u2500 2. Stat tiles on one row, count-up numbers, \"+X this week\" \u2500\u2500 */\nbody.dashboardDocument #dashboardPage [data-tb-tiles]:not(#tb-x) {\n  display: flex !important; flex-wrap: wrap; gap: 14px; margin: 0 !important; width: 100% !important;\n}\nbody.dashboardDocument #dashboardPage [data-tb-tiles] > .MuiGrid-item:not(#tb-x) {\n  flex: 1 1 150px; max-width: none !important; width: auto !important; padding: 0 !important; margin: 0 !important;\n}\nbody.dashboardDocument #dashboardPage [data-tb-tiles] > .MuiGrid-item[data-tb-two]:not(#tb-x) { flex: 1.6 1 240px; }\nbody.dashboardDocument #dashboardPage .MuiCard-root .tb-num {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 42px; line-height: 1; letter-spacing: 0.02em;\n  margin-top: 4px; color: #fff; text-shadow: 0 0 24px rgba(var(--tbd-rgb), 0.35); font-variant-numeric: tabular-nums;\n}\nbody.dashboardDocument #dashboardPage .MuiCard-root .tb-week {\n  margin-top: 3px; font-size: 11px; font-weight: 800; letter-spacing: 0.02em; color: #3ee0a1; white-space: nowrap;\n}\n\n/* \u2500\u2500 Recently added strip \u2500\u2500 */\n.tb-recent { margin-top: 22px; }\n.tb-rscroll {\n  display: flex; gap: 12px; overflow-x: auto; padding: 6px 4px 14px; scroll-snap-type: x proximity;\n  scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.18) transparent;\n}\n.tb-rcard { flex: 0 0 112px; min-width: 0; color: #fff !important; text-decoration: none !important; scroll-snap-align: start; outline: none; }\n.tb-rimg {\n  width: 112px; aspect-ratio: 2 / 3; border-radius: 12px; background: #17171c center / cover no-repeat;\n  box-shadow: 0 10px 24px -12px #000; transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 200ms ease;\n}\n.tb-rcard:hover .tb-rimg, .tb-rcard:focus-visible .tb-rimg {\n  transform: translateY(-4px) scale(1.03);\n  box-shadow: 0 0 0 2px var(--tbd-acc), 0 14px 30px -10px rgba(var(--tbd-rgb), 0.6);\n}\n.tb-rname { margin-top: 7px; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.tb-rsub { font-size: 11px; color: rgba(255, 255, 255, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n\n/* \u2500\u2500 3. Drives (replaces the Paths list) \u2500\u2500 */\n.tb-drives { display: flex; flex-direction: column; gap: 12px; }\n.tb-drive {\n  padding: 16px 18px; border-radius: 18px; background: var(--tbd-glass); border: 1px solid var(--tbd-line);\n  box-shadow: 0 20px 50px -24px rgba(0, 0, 0, 0.9);\n  -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);\n}\n.tb-drive-top { display: flex; align-items: center; gap: 16px; }\n.tb-ring { position: relative; width: 84px; height: 84px; flex: 0 0 84px; }\n.tb-ring svg { display: block; transform: rotate(-90deg); }\n.tb-ring .bg { stroke: rgba(255, 255, 255, 0.08); }\n.tb-ring .fg { stroke: var(--rc); stroke-linecap: round; filter: drop-shadow(0 0 6px var(--rc)); transition: stroke-dashoffset 1100ms cubic-bezier(0.2, 0.8, 0.2, 1); }\n.tb-ring-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 26px; color: #fff; }\n.tb-drive-info { min-width: 0; }\n.tb-drive-name { font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 24px; line-height: 1; letter-spacing: 0.03em; }\n.tb-drive-sub { margin-top: 3px; font-size: 12px; color: rgba(255, 255, 255, 0.5); overflow-wrap: anywhere; }\n.tb-drive-size { margin-top: 6px; font-size: 13px; font-weight: 700; color: rgba(255, 255, 255, 0.9); }\n.tb-drive-size i { font-style: normal; font-weight: 600; color: rgba(255, 255, 255, 0.5); }\n.tb-drive details { margin-top: 12px; }\n.tb-drive summary { cursor: pointer; list-style: none; font-size: 12px; font-weight: 700; color: var(--tbd-acc); user-select: none; }\n.tb-drive summary::-webkit-details-marker { display: none; }\n.tb-drive summary::before { content: \"\\25B8\"; display: inline-block; margin-right: 6px; transition: transform 160ms ease; }\n.tb-drive details[open] summary::before { transform: rotate(90deg); }\n.tb-folder { display: flex; justify-content: space-between; gap: 14px; padding: 7px 0; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 12px; }\n.tb-folder:first-of-type { margin-top: 8px; }\n.tb-folder b { font-weight: 600; color: #fff; white-space: nowrap; }\n.tb-folder span { color: rgba(255, 255, 255, 0.55); text-align: right; overflow-wrap: anywhere; }\n\n/* \u2500\u2500 4/5. Activity + Alerts \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiListItem-root[data-tb-type] .MuiAvatar-root:not(#tb-x) {\n  position: relative; overflow: visible !important; color: #fff;\n  box-shadow: 0 0 0 2px var(--tc), 0 0 18px -4px var(--tc), inset 0 1px 0 rgba(255, 255, 255, 0.25) !important;\n}\n.tb-av-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }\n.tb-type-dot { position: absolute; right: -4px; bottom: -4px; width: 12px; height: 12px; border-radius: 50%; background: var(--tc); border: 2px solid #111; }\nbody.dashboardDocument #dashboardPage .MuiListItem-root[data-tb-fold] { display: none !important; }\n.tb-x {\n  flex: 0 0 auto; align-self: center; margin-left: 10px; padding: 3px 9px; border-radius: 999px;\n  font-size: 11px; font-weight: 800; white-space: nowrap;\n  background: rgba(var(--tbd-rgb), 0.16); color: var(--tbd-acc); border: 1px solid rgba(var(--tbd-rgb), 0.35);\n}\n.tb-x.red { background: rgba(255, 70, 90, 0.16); color: #ff8a9a; border-color: rgba(255, 80, 100, 0.4); }\nbody.dashboardDocument #dashboardPage [data-tb-ip] { filter: blur(5px); transition: filter 200ms ease; }\nbody.dashboardDocument #dashboardPage .MuiListItem-root:hover [data-tb-ip],\nbody.dashboardDocument #dashboardPage .MuiListItem-root:focus-within [data-tb-ip] { filter: none; }\nbody.dashboardDocument #dashboardPage .MuiList-root > .MuiListItem-root[data-tb-failed]:not(#tb-x) {\n  background: rgba(255, 60, 80, 0.07); border-color: rgba(255, 80, 100, 0.35);\n  box-shadow: 0 0 26px -12px rgba(255, 60, 80, 0.9);\n}\n\n/* \u2500\u2500 8. Restart / Shutdown: red panel + hold-to-confirm \u2500\u2500 */\nbody.dashboardDocument .MuiDialog-root[data-tb-danger] .MuiDialog-paper:not(#tb-x) {\n  background: linear-gradient(160deg, rgba(255, 60, 80, 0.18), rgba(16, 16, 20, 0.92) 55%) !important;\n  border: 1px solid rgba(255, 80, 100, 0.32) !important;\n  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.9), 0 0 60px -24px rgba(255, 60, 80, 0.7) !important;\n}\nbody.dashboardDocument .MuiDialog-root[data-tb-danger] .MuiDialogTitle-root:not(#tb-x) {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif) !important; font-size: 32px !important; font-weight: 400 !important;\n  letter-spacing: 0.04em; color: #ff8a9a;\n}\n.tb-hold-hint { margin-top: 10px; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.5); }\nbody.dashboardDocument button[data-tb-hold]:not(#tb-x) {\n  position: relative; isolation: isolate; overflow: hidden; border-radius: 999px !important; padding: 8px 20px !important;\n  color: #fff !important; font-weight: 700 !important; background: rgba(255, 60, 80, 0.16) !important;\n  border: 1px solid rgba(255, 80, 100, 0.45) !important;\n  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none;\n}\n.tb-hold-fill {\n  position: absolute; inset: 0; z-index: -1; pointer-events: none;\n  background: linear-gradient(90deg, #ff4d6d, #ff8080);\n  transform: scaleX(0); transform-origin: left center; transition: transform 200ms ease;\n}\nbutton[data-tb-holding] .tb-hold-fill { transform: scaleX(1); transition: transform 1200ms linear; }\n\n/* \u2500\u2500 9. Menu: collapsible Plugins section + per-plugin icons \u2500\u2500 */\nbody.dashboardDocument [data-tb-plugins] > .MuiListSubheader-root:not(#tb-x) {\n  display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; outline: none;\n}\n.tb-chev { display: inline-flex; align-items: center; gap: 6px; font-family: var(--app-font, Inter, sans-serif); font-size: 11px; font-weight: 700; letter-spacing: 0; }\n.tb-chev em { font-style: normal; padding: 1px 7px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.7); }\n.tb-chev i { font-style: normal; display: inline-block; transition: transform 180ms ease; }\nbody.dashboardDocument [data-tb-plugins][data-tb-collapsed] .tb-chev i { transform: rotate(-90deg); }\nbody.dashboardDocument [data-tb-plugins][data-tb-collapsed] > :not(.MuiListSubheader-root):not(:nth-child(2)):not([data-tb-first]) { display: none !important; }\n[data-tb-plugins]:not(#tb-x) { display: flex !important; flex-direction: column; }\n[data-tb-plugins] > * { order: 3; }\n[data-tb-plugins] > .MuiListSubheader-root { order: 0; }\n[data-tb-plugins] > :nth-child(2) { order: 1; }\n[data-tb-plugins] > [data-tb-first] { order: 2; }\n.tb-picon { width: 24px; height: 24px; fill: currentColor; }\n\n/* \u2500\u2500 10. Phones / small screens \u2500\u2500 */\n@media (max-width: 899px) {\n  .tb-hero-name { font-size: 44px; }\n  .tb-hero-stats { width: 100%; }\n  .tb-hs { flex: 1 1 0; min-width: 0; }\n}\n@media (max-width: 599px) {\n  body.dashboardDocument #dashboardPage [data-tb-tiles] > .MuiGrid-item:not(#tb-x) { flex: 1 1 calc(50% - 7px); }\n  body.dashboardDocument #dashboardPage [data-tb-tiles] > .MuiGrid-item[data-tb-two]:not(#tb-x) { flex: 1 1 100%; }\n  body.dashboardDocument #dashboardPage .MuiCard-root .tb-num { font-size: 34px; }\n  body.dashboardDocument #dashboardPage [data-tb-hero]:not(#tb-x) { padding: 18px !important; }\n  .tb-hero-name { font-size: 38px; }\n  .tb-hs b { font-size: 28px; }\n  body.dashboardDocument #dashboardPage .MuiButton-root:not(.MuiButton-textInherit):not(#tb-x) { padding: 8px 14px !important; font-size: 13px !important; }\n  body.dashboardDocument #dashboardPage .MuiList-root > .MuiListItem-root:not(#tb-x) { margin-bottom: 4px; }\n  body.dashboardDocument #dashboardPage .MuiListItemAvatar-root { min-width: 46px !important; }\n  body.dashboardDocument #dashboardPage .MuiListItemAvatar-root .MuiAvatar-root { width: 34px !important; height: 34px !important; }\n  body.dashboardDocument #dashboardPage .MuiListItemText-root .MuiTypography-root { font-size: 13px !important; }\n  body.dashboardDocument #dashboardPage .tb-sec-title,\n  body.dashboardDocument #dashboardPage .MuiButton-textInherit .MuiTypography-h3:not(#tb-x) { font-size: 24px !important; }\n  .tb-rcard { flex-basis: 92px; }\n  .tb-rimg { width: 92px; }\n  .tb-ring { width: 68px; height: 68px; flex-basis: 68px; }\n  .tb-ring svg { width: 68px; height: 68px; }\n  .tb-ring-pct { font-size: 21px; }\n}\n@media (prefers-reduced-motion: reduce) {\n  .tb-dot, body.dashboardDocument #dashboardPage .MuiButton-root[data-tb-scan] .MuiButton-startIcon { animation: none; }\n}\n\n/* \u2500\u2500 Activity badge via CSS ::after (no appendChild \u2192 no childList MO trigger \u2192 no reload loop) \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiListItemButton-root[data-tb-badge]::after {\n  content: attr(data-tb-badge);\n  flex: 0 0 auto; align-self: center; margin-left: 10px; padding: 3px 9px; border-radius: 999px;\n  font-size: 11px; font-weight: 800; white-space: nowrap;\n  background: rgba(var(--tbd-rgb), 0.16); color: var(--tbd-acc); border: 1px solid rgba(var(--tbd-rgb), 0.35);\n}\nbody.dashboardDocument #dashboardPage .MuiListItemButton-root[data-tb-badge][data-tb-badge-cls=\"red\"]::after {\n  background: rgba(255, 70, 90, 0.16); color: #ff8a9a; border-color: rgba(255, 80, 100, 0.4);\n}\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 end ADMIN DASHBOARD extras \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n";

  // Nothing below runs (and no styles exist) outside the admin dashboard, so the main UI pays zero cost.
  var st = document.createElement("style");
  st.id = "tb-dashboard-skin";
  // Update all & restart button: accent colour instead of the red of Restart / Shutdown, fills up while working
  CSS += "\nbody.dashboardDocument button[data-tb-upd]:not(#tb-x){background:linear-gradient(90deg,rgba(var(--tbd-rgb),.6) var(--p,0%),rgba(var(--tbd-rgb),.16) var(--p,0%))!important;border-color:rgba(var(--tbd-rgb),.5)!important;margin-left:8px}" +
    "\nbody.dashboardDocument button[data-tb-upd] .tb-hold-fill{background:linear-gradient(90deg,var(--tbd-acc),rgba(var(--tbd-rgb),.7))}" +
    "\nbody.dashboardDocument button[data-tb-upd][data-tb-busy]{pointer-events:none}\n";
  st.textContent = CSS;
  // Fonts (Bebas Neue / Funnel Sans) are self-hosted by the plugin from the page head.


  var DAY = 86400000;
  function noop() {}
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function kids(node, cls) {
    var out = [];
    if (!node) return out;
    for (var c = node.firstElementChild; c; c = c.nextElementSibling) if (!cls || c.classList.contains(cls)) out.push(c);
    return out;
  }
  function setAttr(node, name, val) { if (node.getAttribute(name) !== val) node.setAttribute(name, val); }
  function api() { return window.ApiClient || null; }
  function uid() { try { return ApiClient.getCurrentUserId(); } catch (e) { return null; } }
  function getJSON(path, params) {
    var a = api();
    if (!a) return Promise.reject(new Error("no ApiClient"));
    return Promise.resolve(a.getJSON(a.getUrl(path, params || {})));
  }
  function fmtNum(n) { try { return Number(n).toLocaleString(); } catch (e) { return String(n); } }
  function fmtBytes(b) {
    if (!(b >= 0)) return "?";
    var u = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"], i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return b.toFixed(i >= 3 ? 1 : 0) + " " + u[i];
  }
  var memo = {};
  function cached(key, ttl, fn) {
    var m = memo[key], now = Date.now();
    if (m && now - m.at < ttl) return m.p;
    var p = fn();
    p.catch(function () { if (memo[key] && memo[key].p === p) delete memo[key]; });
    memo[key] = { at: now, p: p };
    return p;
  }
  function page() {
    var p = document.getElementById("dashboardPage");
    return p && !p.classList.contains("hide") ? p : null;
  }

  function weekly(type) {
    return cached("wk:" + type, 600000, function () {
      return Promise.resolve(api().getItems(uid(), {
        IncludeItemTypes: type, Recursive: true, SortBy: "DateCreated", SortOrder: "Descending",
        Limit: 100, Fields: "DateCreated", EnableImages: false, EnableUserData: false, EnableTotalRecordCount: false
      })).then(function (r) {
        var since = Date.now() - 7 * DAY, n = 0;
        (r && r.Items || []).forEach(function (it) { if (Date.parse(it.DateCreated) >= since) n++; });
        return n >= 100 ? "100+" : n;
      });
    });
  }

  // \u2550\u2550\u2550\u2550\u2550 3. Drives (Paths) \u2550\u2550\u2550\u2550\u2550
  var FOLDERS = [
    ["ProgramDataFolder", "Program data"], ["CacheFolder", "Cache"], ["ImageCacheFolder", "Image cache"],
    ["InternalMetadataFolder", "Metadata"], ["LogFolder", "Logs"], ["TranscodingTempFolder", "Transcodes"], ["WebFolder", "Web"]
  ];
  function commonDir(paths) {
    if (!paths.length) return "";
    var parts = paths.map(function (x) { return x.replace(/\\/g, "/").split("/"); });
    var out = [];
    for (var i = 0; i < parts[0].length; i++) {
      var seg = parts[0][i];
      if (parts.every(function (p) { return p[i] === seg; })) out.push(seg); else break;
    }
    var d = out.join("/");
    return d === "" ? "/" : d;
  }
  function groupDrives(s) {
    var map = {}, list = [];
    function add(label, f, lib) {
      if (!f || !f.Path || !(f.UsedSpace >= 0)) return;
      var free = Math.max(f.FreeSpace || 0, 0);
      var k = f.DeviceId || ("u" + f.UsedSpace + "f" + free);
      var g = map[k];
      if (!g) { g = map[k] = { used: f.UsedSpace, total: f.UsedSpace + free, items: [], paths: {}, system: false, lib: false }; list.push(g); }
      if (label === "Program data") g.system = true;
      if (lib) g.lib = true;
      if (g.paths[f.Path]) return;
      g.paths[f.Path] = 1;
      g.items.push({ label: label, path: f.Path });
    }
    FOLDERS.forEach(function (x) { add(x[1], s[x[0]], false); });
    (s.Libraries || []).forEach(function (lib) { (lib.Folders || []).forEach(function (f) { add(lib.Name, f, true); }); });
    list.sort(function (a, b) { return (b.system - a.system) || (b.total - a.total); });
    var media = 0;
    list.forEach(function (g) {
      g.dir = commonDir(g.items.map(function (i) { return i.path; }));
      g.title = g.system ? "System drive" : g.lib ? "Media drive" : "Storage";
      if (!g.system && g.lib) media++;
    });
    if (media > 1) { var n = 0; list.forEach(function (g) { if (!g.system && g.lib) g.title = "Media drive " + (++n); }); }
    return list;
  }

  // ═════ Home: our own layout. Jellyfin's boxes on the dashboard home are hidden; everything here reads the API. ═════
  //  health strip (server, CPU, memory, uptime, counts, Scan + a Server menu with the risky buttons)
  //  attention (only what needs you: failed logins, full drives, pending restart, failed tasks)
  //  library counts on one strip, recently added, storage bars, running tasks, activity one line per event
  var esc = window.tbEsc;
  var HOME_CSS = [
    "#tb-home{--h-acc:var(--tbd-acc);--h-line:rgba(255,255,255,.08);--h-card:rgba(18,18,22,.55);--h-mut:rgba(255,255,255,.5);display:flex;flex-direction:column;gap:26px;color:#fff;font-family:var(--app-font,'Funnel Sans',Inter,sans-serif);margin-bottom:24px}",
    "#tb-home *{box-sizing:border-box}",
    "#tb-home .tbh-h{display:inline-flex;align-items:center;gap:8px;margin:0 0 12px;font:400 30px/1 var(--title-font,'Bebas Neue',sans-serif);letter-spacing:.04em;text-transform:uppercase;color:#fff;text-decoration:none}",
    "#tb-home a.tbh-h::after{content:'\\203A';font:600 20px/1 var(--app-font,Inter,sans-serif);color:var(--h-acc);transition:transform .18s}",
    "#tb-home a.tbh-h:hover::after{transform:translateX(4px)}",
    "#tb-home .tbh-box{border:1px solid var(--h-line);border-radius:14px;background:var(--h-card);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}",
    "#tb-home .tbh-cols{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:28px;align-items:start}",
    "#tb-home .tbh-col{display:flex;flex-direction:column;gap:26px;min-width:0}",
    /* health strip */
    "#tb-home .tbh-health{display:flex;align-items:center;gap:22px;flex-wrap:wrap;padding:14px 20px;border:1px solid var(--h-line);border-radius:14px;background:radial-gradient(70% 160% at 0% 0%,rgba(var(--tbd-rgb),.16),transparent 60%),radial-gradient(60% 160% at 100% 100%,rgba(140,90,255,.12),transparent 60%),var(--h-card);position:relative;z-index:2}",
    "#tb-home .tbh-info{display:flex;align-items:center;gap:22px;flex-wrap:wrap;min-width:0}",
    "#tb-home .tbh-name{font:400 34px/1 var(--title-font,'Bebas Neue',sans-serif);letter-spacing:.04em}",
    "#tb-home .tbh-chips{display:flex;gap:8px;flex-wrap:wrap}",
    "#tb-home .tbh-chip{display:inline-flex;align-items:center;gap:7px;padding:4px 10px;border-radius:999px;font:700 12px/1.2 var(--app-font,Inter,sans-serif);color:rgba(255,255,255,.82);background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1)}",
    "#tb-home .tbh-chip.ok{color:#3ee0a1;background:rgba(62,224,161,.1);border-color:rgba(62,224,161,.35)}",
    "#tb-home .tbh-chip.acc{color:var(--h-acc);background:rgba(var(--tbd-rgb),.12);border-color:rgba(var(--tbd-rgb),.4)}",
    "#tb-home .tbh-chip.warn{color:#ffb347;background:rgba(255,159,67,.12);border-color:rgba(255,159,67,.4)}",
    "#tb-home .tbh-sep{width:1px;height:30px;background:var(--h-line)}",
    "#tb-home .tbh-stats{display:flex;gap:24px;flex-wrap:wrap}",
    "#tb-home .tbh-st{display:flex;flex-direction:column;gap:4px}",
    "#tb-home .tbh-st span{font:700 10.5px/1 var(--app-font,Inter,sans-serif);letter-spacing:.12em;text-transform:uppercase;color:var(--h-mut);white-space:nowrap}",
    "#tb-home .tbh-st b{display:flex;align-items:center;gap:8px;font:800 17px/1.1 var(--app-font,Inter,sans-serif);font-variant-numeric:tabular-nums;white-space:nowrap}",
    "#tb-home .tbh-st.live b{color:var(--h-acc)}",
    "#tb-home .tbh-spark{display:inline-flex;align-items:flex-end;gap:2px;height:16px}",
    "#tb-home .tbh-spark i{width:4px;min-height:2px;border-radius:1px;background:var(--h-acc);opacity:.85}",
    "#tb-home .tbh-act{margin-left:auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}",
    "#tb-home .tbh-status{font:600 12.5px/1.3 var(--app-font,Inter,sans-serif);color:var(--h-acc);max-width:340px}",
    "#tb-home .tbh-btn,#tb-home .tbh-scan{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;font:700 13px/1 var(--app-font,Inter,sans-serif);cursor:pointer;white-space:nowrap;transition:transform .16s,filter .16s,background-color .16s}",
    "#tb-home .tbh-btn:hover{background:rgba(255,255,255,.1)}",
    "#tb-home .tbh-scan{border:0;color:#111;background:linear-gradient(90deg,var(--h-acc) var(--p,100%),rgba(var(--tbd-rgb),.3) var(--p,100%));box-shadow:0 8px 26px -10px rgba(var(--tbd-rgb),.9)}",
    "#tb-home .tbh-scan:hover{filter:brightness(1.08);transform:translateY(-1px)}",
    "#tb-home .tbh-scan svg{width:16px;height:16px}",
    "#tb-home .tbh-scan[data-tb-scan] svg{animation:tb-spin 1.1s linear infinite}",
    "#tb-home .tbh-scan[data-tb-scan]::after{content:attr(data-tb-scan);font-variant-numeric:tabular-nums}",
    "#tb-home .tbh-more{position:relative}",
    "#tb-home .tbh-menu{position:absolute;right:0;top:44px;width:340px;padding:6px;border-radius:12px;background:rgba(20,20,26,.97);border:1px solid rgba(255,255,255,.12);box-shadow:0 24px 60px -10px rgba(0,0,0,.85);z-index:20}",
    "#tb-home .tbh-menu[hidden]{display:none}",
    "#tb-home .tbh-menu button{display:flex;flex-direction:column;align-items:flex-start;gap:3px;width:100%;padding:10px 12px;border:0;border-radius:8px;background:none;color:#fff;font:700 13.5px/1.2 var(--app-font,Inter,sans-serif);text-align:left;cursor:pointer}",
    "#tb-home .tbh-menu button:hover,#tb-home .tbh-menu button:focus-visible{background:rgba(255,255,255,.07);outline:none}",
    "#tb-home .tbh-menu button small{font:500 11.5px/1.3 var(--app-font,Inter,sans-serif);color:var(--h-mut)}",
    "#tb-home .tbh-menu button.good small{color:var(--h-acc)}",
    "#tb-home .tbh-menu button.red{color:#ff7b8f}",
    "#tb-home .tbh-menu button:disabled{opacity:.45;cursor:default}",
    "#tb-home .tbh-menu hr{border:0;border-top:1px solid var(--h-line);margin:4px 6px}",
    /* attention */
    "#tb-home .tbh-att[hidden]{display:none}",
    "#tb-home .tbh-alist{display:flex;flex-direction:column;gap:6px}",
    "#tb-home .tbh-al{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:12px;border:1px solid var(--h-line);background:var(--h-card);color:#fff;text-decoration:none}",
    "#tb-home a.tbh-al:hover{background:rgba(255,255,255,.06)}",
    "#tb-home .tbh-al > i{flex:0 0 30px;height:30px;border-radius:8px;display:grid;place-items:center;font:800 14px/1 var(--app-font,Inter,sans-serif);font-style:normal;color:var(--c);background:color-mix(in srgb,var(--c) 16%,transparent)}",
    "#tb-home .tbh-al div{min-width:0}",
    "#tb-home .tbh-al b{display:block;font:700 14px/1.3 var(--app-font,Inter,sans-serif)}",
    "#tb-home .tbh-al span{display:block;font:500 12.5px/1.35 var(--app-font,Inter,sans-serif);color:var(--h-mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "#tb-home .tbh-al em{margin-left:auto;font:600 12.5px/1 var(--app-font,Inter,sans-serif);font-style:normal;color:var(--h-mut);white-space:nowrap}",
    "#tb-home .tbh-al.red{border-color:rgba(255,80,100,.35);background:rgba(255,60,80,.07)}",
    /* library strip */
    "#tb-home .tbh-lib{display:flex;flex-wrap:wrap}",
    "#tb-home .tbh-lib > div{flex:1 1 120px;position:relative;padding:16px 20px;border-right:1px solid var(--h-line)}",
    "#tb-home .tbh-lib > div:last-child{border-right:0}",
    "#tb-home .tbh-lib > div::before{content:'';position:absolute;left:20px;right:20px;top:0;height:2px;border-radius:2px;background:var(--c);opacity:.8}",
    "#tb-home .tbh-lib span{display:block;font:700 10.5px/1 var(--app-font,Inter,sans-serif);letter-spacing:.12em;text-transform:uppercase;color:var(--h-mut)}",
    "#tb-home .tbh-lib b{font:400 40px/1.1 var(--title-font,'Bebas Neue',sans-serif);letter-spacing:.02em;font-variant-numeric:tabular-nums}",
    "#tb-home .tbh-lib em{margin-left:6px;font:800 11.5px/1 var(--app-font,Inter,sans-serif);font-style:normal;color:#3ee0a1}",
    /* recently added */
    "#tb-home .tb-rscroll{padding:4px 2px 10px}",
    /* storage + tasks */
    "#tb-home .tbh-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:28px;align-items:start}",
    "#tb-home .tbh-drv{padding:14px 18px}",
    "#tb-home .tbh-drv + .tbh-drv{border-top:1px solid var(--h-line)}",
    "#tb-home .tbh-drv .t{display:flex;justify-content:space-between;align-items:baseline;gap:12px}",
    "#tb-home .tbh-drv .t b{font:400 22px/1 var(--title-font,'Bebas Neue',sans-serif);letter-spacing:.04em}",
    "#tb-home .tbh-drv .t span{font:500 12px/1.3 var(--app-font,Inter,sans-serif);color:var(--h-mut);text-align:right}",
    "#tb-home .tbh-drv .t span strong{color:#fff}",
    "#tb-home .tbh-g{height:8px;margin-top:9px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden}",
    "#tb-home .tbh-g i{display:block;height:100%;border-radius:999px;background:var(--c);box-shadow:0 0 12px -2px var(--c)}",
    "#tb-home .tbh-drv details{margin-top:9px}",
    "#tb-home .tbh-drv summary{cursor:pointer;list-style:none;font:700 12px/1 var(--app-font,Inter,sans-serif);color:var(--h-acc)}",
    "#tb-home .tbh-drv summary::-webkit-details-marker{display:none}",
    "#tb-home .tbh-task{padding:14px 18px}",
    "#tb-home .tbh-task + .tbh-task{border-top:1px solid var(--h-line)}",
    "#tb-home .tbh-task .t{display:flex;justify-content:space-between;gap:12px;font:600 14px/1.3 var(--app-font,Inter,sans-serif)}",
    "#tb-home .tbh-task .t span{color:var(--h-mut);font-variant-numeric:tabular-nums}",
    "#tb-home .tbh-task .tbh-g{height:6px}",
    "#tb-home .tbh-idle{padding:16px 18px;font:500 13px/1.4 var(--app-font,Inter,sans-serif);color:var(--h-mut)}",
    /* activity */
    "#tb-home .tbh-feed{padding:6px}",
    "#tb-home .tbh-ev{display:grid;grid-template-columns:auto 24px minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px 12px;border-radius:9px;color:#fff;text-decoration:none}",
    "#tb-home .tbh-ev:nth-child(odd){background:rgba(255,255,255,.025)}",
    "#tb-home .tbh-ev:hover{background:rgba(255,255,255,.07)}",
    "#tb-home .tbh-ev time{min-width:44px;font:600 12.5px/1 var(--app-font,Inter,sans-serif);color:var(--h-mut);font-variant-numeric:tabular-nums;white-space:nowrap}",
    "#tb-home .tbh-ev > i{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font:800 10px/1 var(--app-font,Inter,sans-serif);font-style:normal;color:#111;background:var(--c) center/cover no-repeat;box-shadow:0 0 0 2px var(--c)}",
    "#tb-home .tbh-ev p{margin:0;font:500 13.5px/1.3 var(--app-font,Inter,sans-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#tb-home .tbh-ev p b{font-weight:700}",
    "#tb-home .tbh-ev u{text-decoration:none;font:800 11px/1 var(--app-font,Inter,sans-serif);padding:3px 7px;border-radius:6px;color:var(--h-acc);background:rgba(var(--tbd-rgb),.14)}",
    "#tb-home .tbh-ev u.red{color:#ff8a9a;background:rgba(255,70,90,.16)}",
    /* confirm */
    ".tbh-modal{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:16px;background:rgba(0,0,0,.6);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}",
    ".tbh-dlg{width:min(440px,100%);padding:22px 22px 18px;border-radius:18px;color:#fff;background:linear-gradient(160deg,rgba(255,60,80,.18),rgba(16,16,20,.96) 55%);border:1px solid rgba(255,80,100,.32);box-shadow:0 30px 80px -20px rgba(0,0,0,.9);font-family:var(--app-font,'Funnel Sans',Inter,sans-serif)}",
    ".tbh-dlg.calm{background:linear-gradient(160deg,rgba(var(--tbd-rgb),.16),rgba(16,16,20,.96) 55%);border-color:rgba(var(--tbd-rgb),.35)}",
    ".tbh-dlg h3{margin:0 0 10px;font:400 30px/1 var(--title-font,'Bebas Neue',sans-serif);letter-spacing:.04em;color:#ff8a9a}",
    ".tbh-dlg.calm h3{color:var(--tbd-acc)}",
    ".tbh-dlg p{margin:0 0 8px;font:500 14px/1.45 var(--app-font,Inter,sans-serif);color:rgba(255,255,255,.85)}",
    ".tbh-dlg .tbh-dlg-b{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}",
    ".tbh-dlg .tbh-btn{height:38px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.06);color:#fff;font:700 13.5px/1 var(--app-font,Inter,sans-serif);cursor:pointer}",
    ".tbh-dlg.calm button[data-tb-hold]:not(#tb-x){background:rgba(var(--tbd-rgb),.18)!important;border-color:rgba(var(--tbd-rgb),.5)!important}",
    ".tbh-dlg.calm .tb-hold-fill{background:linear-gradient(90deg,var(--tbd-acc),rgba(var(--tbd-rgb),.7))}",
    /* portrait monitors, tablets, phones: one column, the order that matters first */
    "@media (max-width:1199px){#tb-home .tbh-cols,#tb-home .tbh-col{display:contents}#tb-home .tbh-att{order:1}#tb-home .tbh-health{order:2}#tb-home .tbh-actsec{order:3}#tb-home .tbh-libsec{order:4}#tb-home .tbh-recsec{order:5}#tb-home .tbh-two{order:6}#tb-home .tbh-act{margin-left:0}}",
    "@media (max-width:700px){#tb-home .tbh-two{grid-template-columns:1fr}#tb-home .tbh-health{gap:16px;padding:14px}#tb-home .tbh-stats{gap:16px}#tb-home .tbh-sep{display:none}#tb-home .tbh-lib > div{flex-basis:33%;border-right:0}#tb-home .tbh-menu{width:min(340px,calc(100vw - 32px))}#tb-home .tbh-h{font-size:24px}}"
  ].join("\n");

  var H = { sys: null, theme: null, users: null, proc: null, sessions: null, tasks: null, log: null, logUsers: {}, failed: null, storage: null, counts: null, weekly: {}, recent: null };
  var home = null, cpuHist = [], scanAt = 0;
  try { var saved = JSON.parse(localStorage.getItem("tb-dash-home") || "null"); if (saved) { H.sys = saved.sys; H.theme = saved.theme; H.users = saved.users; H.counts = saved.counts; } } catch (e) {}
  function keep() { try { localStorage.setItem("tb-dash-home", JSON.stringify({ sys: H.sys, theme: H.theme, users: H.users, counts: H.counts })); } catch (e) {} }
  function setHtml(node, html) { if (node && node.__html !== html) { node.innerHTML = html; node.__html = html; } }
  function sid() { try { return api().serverId(); } catch (e) { return ""; } }
  function realUser(e) { return !!e.UserId && !/^[0-]+$/.test(e.UserId); }
  function playing() { return (H.sessions || []).filter(function (s) { return s.NowPlayingItem; }); }
  function watchers() { return playing().filter(function (s) { return !(s.PlayState && s.PlayState.IsPaused); }).length; }
  function people(n) { return n === 1 ? "1 person is watching" : n + " people are watching"; }
  function hhmm(d) { try { return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (e) { return d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2); } }
  function when(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return "";
    if (new Date().toDateString() === d.toDateString()) return hhmm(d);
    try { return d.toLocaleDateString([], { weekday: "short" }) + " " + hhmm(d); } catch (e) { return hhmm(d); }
  }
  function upFor(min) {
    if (!(min >= 0)) return "–";
    var d = Math.floor(min / 1440), h = Math.floor(min % 1440 / 60);
    return d ? d + "d " + h + "h" : h ? h + "h " + (min % 60) + "m" : min + "m";
  }

  var SCAN_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>';
  function shellHome() {
    var r = el("div");
    r.id = "tb-home";
    r.innerHTML =
      '<div class="tbh-health"><div class="tbh-info"></div><div class="tbh-act"><span class="tbh-status"></span>' +
        '<button type="button" class="tbh-scan" title="Scan every library for new and changed files">' + SCAN_SVG + "<span>Scan all libraries</span></button>" +
        '<div class="tbh-more"><button type="button" class="tbh-btn" aria-haspopup="true" aria-expanded="false">⋯ Server ▾</button>' +
          '<div class="tbh-menu" role="menu" hidden>' +
            '<button type="button" role="menuitem" class="good" data-a="upd-idle">Update all &amp; restart<small>Waits until nobody is watching (keep this page open)</small></button>' +
            '<button type="button" role="menuitem" data-a="upd-now">Update all &amp; restart now<small data-w="now"></small></button><hr>' +
            '<button type="button" role="menuitem" class="red" data-a="restart">Restart<small data-w="restart"></small></button>' +
            '<button type="button" role="menuitem" class="red" data-a="shutdown">Shutdown<small data-w="shutdown"></small></button>' +
          "</div></div></div></div>" +
      '<div class="tbh-cols"><div class="tbh-col">' +
        '<section class="tbh-att" hidden><a class="tbh-h" href="#/dashboard/activity?useractivity=false">Attention</a><div class="tbh-alist"></div></section>' +
        '<section class="tbh-libsec"><a class="tbh-h" href="#/dashboard/libraries">Library</a><div class="tbh-box tbh-lib"></div></section>' +
        '<section class="tbh-recsec" hidden><span class="tbh-h">Recently added</span><div class="tb-rscroll"></div></section>' +
        '<div class="tbh-two"><section><span class="tbh-h">Storage</span><div class="tbh-box tbh-sto"></div></section>' +
          '<section><a class="tbh-h" href="#/dashboard/tasks">Running tasks</a><div class="tbh-box tbh-tasks"><div class="tbh-idle">–</div></div></section></div>' +
      '</div><div class="tbh-col">' +
        '<section class="tbh-actsec"><a class="tbh-h" href="#/dashboard/activity?useractivity=true">Activity</a><div class="tbh-box tbh-feed"></div></section>' +
      "</div></div>";
    var q = function (s) { return r.querySelector(s); };
    r.__ = { info: q(".tbh-info"), status: q(".tbh-status"), scan: q(".tbh-scan"), menuBtn: q(".tbh-more > .tbh-btn"), menu: q(".tbh-menu"),
      att: q(".tbh-att"), alist: q(".tbh-alist"), lib: q(".tbh-lib"), rec: q(".tbh-recsec"), recSc: q(".tbh-recsec .tb-rscroll"), sto: q(".tbh-sto"), tasks: q(".tbh-tasks"), feed: q(".tbh-feed") };
    var u = r.__;
    u.scan.addEventListener("click", function () {
      if (u.scan.hasAttribute("data-tb-scan")) return;
      scanAt = Date.now();
      post("Library/Refresh").then(function () { setAttr(u.scan, "data-tb-scan", " 0%"); u.scan.style.setProperty("--p", "0%"); loadTasks(); }, noop);
    });
    function menu(open) {
      u.menu.hidden = !open;
      u.menuBtn.setAttribute("aria-expanded", String(open));
      if (open) { menuText(); loadSessions(); }
    }
    u.menuBtn.addEventListener("click", function (e) { e.stopPropagation(); menu(u.menu.hidden); });
    document.addEventListener("click", function (e) { if (!u.menu.hidden && !u.menu.contains(e.target)) menu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !u.menu.hidden) menu(false); });
    u.menu.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-a]");
      if (!b || b.disabled) return;
      menu(false);
      var w = watchers(), a = b.getAttribute("data-a");
      var who = w ? people(w) + ". They'll be cut off." : "Nobody is watching right now.";
      if (a === "upd-idle") confirmBox(true, "Update all & restart", "Updates every plugin now. If anything was installed, the server restarts as soon as nobody is watching. Keep this page open until it's done.", "Hold to start", function () { updateAll(true); });
      if (a === "upd-now") confirmBox(false, "Update all & restart now", "Updates every plugin, then restarts the server right away. " + who, "Hold to update", function () { updateAll(false); });
      if (a === "restart") confirmBox(false, "Restart the server", who, "Hold to restart", function () { post("System/Restart").then(function () { setStatus("Restarting…"); setTimeout(waitForServer, 5000); }, noop); });
      if (a === "shutdown") confirmBox(false, "Shut the server down", who + " It stays off until someone starts it again on the machine.", "Hold to shut down", function () { post("System/Shutdown").then(function () { setStatus("Server is shutting down"); }, noop); });
    });
    return r;
  }
  function menuText() {
    if (!home) return;
    var w = watchers(), t = w ? people(w) : "Nobody is watching";
    $$("[data-w]", home.__.menu).forEach(function (s) { s.textContent = t + " · asks to confirm"; });
    $$("button[data-a^=upd]", home.__.menu).forEach(function (b) { b.disabled = upd.busy; });
  }
  function confirmBox(calm, title, text, ok, fn) {
    var d = el("div", "tbh-modal");
    d.innerHTML = '<div class="tbh-dlg' + (calm ? " calm" : "") + '" role="dialog" aria-modal="true"><h3>' + esc(title) + "</h3><p>" + esc(text) + '</p><div class="tb-hold-hint">Press and hold the button to confirm</div>' +
      '<div class="tbh-dlg-b"><button type="button" class="tbh-btn" data-x>Cancel</button><button type="button" data-tb-hold><span class="tb-hold-fill"></span>' + esc(ok) + "</button></div></div>";
    function close() { if (d.parentNode) d.parentNode.removeChild(d); document.removeEventListener("keydown", key, true); }
    function key(e) { if (e.key === "Escape") { e.stopPropagation(); close(); } }
    d.addEventListener("click", function (e) { if (e.target === d || e.target.closest("[data-x]")) close(); });
    document.addEventListener("keydown", key, true);
    var b = $("button[data-tb-hold]", d);
    bindHold(b);
    b.addEventListener("click", function () { if (b.__tbOk) { close(); fn(); } });
    document.body.appendChild(d);
    b.focus();
  }

  // ── data ──
  function loadSys() {
    var a = api();
    cached("sysinfo", 60000, function () { return Promise.resolve(a.getSystemInfo()); }).then(function (i) { H.sys = i ? { ServerName: i.ServerName, Version: i.Version, HasUpdateAvailable: !!i.HasUpdateAvailable, HasPendingRestart: !!i.HasPendingRestart } : H.sys; keep(); drawHealth(); drawAtt(); }, noop);
    cached("plugins", 300000, function () { return Promise.resolve(a.getInstalledPlugins()); }).then(function (list) {
      var me = (list || []).filter(function (x) { return String(x.Id || "").replace(/-/g, "") === "01c723cc57de4e19b13c514b644491a5"; })[0];
      if (me) { H.theme = String(me.Version || "").replace(/\.0$/, ""); keep(); drawHealth(); }
    }, noop);
    cached("users", 1800000, function () { return Promise.resolve(a.getUsers()); }).then(function (u) { if (u) { H.users = u.length; keep(); drawHealth(); } }, noop);
  }
  function loadProc() {
    getJSON("UshereatsTheme/Meter/Process").then(function (p) {
      H.proc = p;
      if (p && p.cpuPercent != null) { cpuHist.push(p.cpuPercent); if (cpuHist.length > 12) cpuHist.shift(); }
      drawHealth();
    }, noop);
  }
  function loadSessions() {
    cached("sessions", 4000, function () { return Promise.resolve(api().getSessions({ ActiveWithinSeconds: 960 })); }).then(function (s) { H.sessions = s || []; drawHealth(); menuText(); }, noop);
  }
  function loadTasks() {
    cached("tasks", 2500, function () { return getJSON("ScheduledTasks", { isHidden: false }); }).then(function (t) { H.tasks = t || []; drawTasks(); drawAtt(); }, noop);
  }
  function loadLog() {
    cached("actlog", 15000, function () { return getJSON("System/ActivityLog/Entries", { startIndex: 0, limit: 60, minDate: new Date(Date.now() - 3 * DAY).toISOString() }); }).then(function (log) {
      H.log = (log && log.Items) || [];
      var ids = {};
      H.log.forEach(function (e) { if (realUser(e) && !H.logUsers[e.UserId]) ids[e.UserId] = 1; });
      return Promise.all(Object.keys(ids).map(function (id) {
        return cached("user:" + id, 1800000, function () { return getJSON("Users/" + id); }).then(function (u) { if (u) H.logUsers[id] = u; }, noop);
      }));
    }).then(drawFeed, noop);
    cached("failed", 60000, function () { return getJSON("System/ActivityLog/Entries", { startIndex: 0, limit: 200, minDate: new Date(Date.now() - 7 * DAY).toISOString(), hasUserId: false }); }).then(function (log) {
      H.failed = ((log && log.Items) || []).filter(function (e) { return e.Type === "AuthenticationFailed"; });
      drawAtt();
    }, noop);
  }
  function loadStorage() {
    cached("storage", 60000, function () { return getJSON("System/Info/Storage"); }).then(function (s) { H.storage = s ? groupDrives(s) : []; drawStorage(); drawAtt(); }, noop);
  }
  var LIB = [["Movies", "MovieCount", "Movie", "#ff5d73"], ["Series", "SeriesCount", "Series", "#4fc3ff"], ["Episodes", "EpisodeCount", "Episode", "#4fc3ff"],
    ["Albums", "AlbumCount", "MusicAlbum", "#b98bff"], ["Songs", "SongCount", "Audio", "#b98bff"], ["Music videos", "MusicVideoCount", "MusicVideo", "#ff9f43"],
    ["Books", "BookCount", "Book", "#ffd166"], ["Collections", "BoxSetCount", "BoxSet", "#3ee0a1"]];
  function loadLibrary() {
    if (!uid()) return;
    cached("counts", 300000, function () { return Promise.resolve(api().getItemCounts(uid())); }).then(function (c) {
      H.counts = c || {};
      keep();
      drawLib();
      LIB.forEach(function (l) {
        if ((H.counts[l[1]] || 0) > 0) weekly(l[2]).then(function (n) { H.weekly[l[2]] = n; drawLib(); }, noop);
      });
    }, noop);
    if (RECENT_COUNT) cached("recent", 300000, function () {
      return getJSON("Users/" + uid() + "/Items/Latest", { Limit: RECENT_COUNT, Fields: "PrimaryImageAspectRatio,ProductionYear", ImageTypeLimit: 1, EnableImageTypes: "Primary", EnableUserData: false });
    }).then(function (items) { H.recent = items || []; drawRecent(); }, noop);
  }

  // ── drawing ──
  function stat(label, value, live) { return '<div class="tbh-st' + (live ? " live" : "") + '"><span>' + esc(label) + "</span><b>" + value + "</b></div>"; }
  function drawHealth() {
    if (!home) return;
    var s = H.sys || {}, p = H.proc || {}, ss = H.sessions, pl = playing();
    var tc = pl.filter(function (x) { var ti = x.TranscodingInfo; return x.PlayState && x.PlayState.PlayMethod === "Transcode" && ti && !(ti.IsVideoDirect && ti.IsAudioDirect); }).length;
    var max = Math.max.apply(null, cpuHist.concat([10]));
    var spark = cpuHist.length > 1 ? '<span class="tbh-spark" aria-hidden="true">' + cpuHist.map(function (v) { return '<i style="height:' + Math.max(2, Math.round(v / max * 16)) + 'px"></i>'; }).join("") + "</span>" : "";
    var html = '<div class="tbh-name">' + esc(s.ServerName || "Jellyfin") + '</div><div class="tbh-chips"><span class="tbh-chip ok"><i class="tb-dot"></i>Online</span>' +
      (s.Version ? '<span class="tbh-chip">v' + esc(s.Version) + "</span>" : "") +
      (H.theme ? '<span class="tbh-chip">Theme v' + esc(H.theme) + "</span>" : "") +
      (s.HasUpdateAvailable ? '<span class="tbh-chip acc">Update available</span>' : "") +
      (s.HasPendingRestart ? '<span class="tbh-chip warn">Restart pending</span>' : "") +
      '</div><span class="tbh-sep"></span><div class="tbh-stats">' +
      stat("Uptime", upFor(p.uptimeMinutes)) +
      stat("CPU · Jellyfin", (p.cpuPercent != null ? Math.round(p.cpuPercent) + "%" : "–") + spark) +
      stat("Memory", p.memoryMb ? (p.memoryMb >= 1024 ? (p.memoryMb / 1024).toFixed(1) + " GB" : p.memoryMb + " MB") : "–") +
      stat("Transcoding", ss ? String(tc) : "–", tc > 0) +
      stat("Devices", ss ? String(ss.length) : "–") +
      stat("Users", H.users != null ? fmtNum(H.users) : "–") + "</div>";
    setHtml(home.__.info, html);
  }
  function drawAtt() {
    if (!home) return;
    var items = [], s = H.sys || {};
    if (H.failed && H.failed.length) {
      var by = {}, order = [];
      H.failed.forEach(function (e) {
        var m = /from\s+(.+?)\s*$/i.exec(e.Name || ""), n = m ? m[1] : (e.Name || "?");
        if (!by[n]) { by[n] = 0; order.push(n); }
        by[n]++;
      });
      order.sort(function (a, b) { return by[b] - by[a]; });
      items.push({ c: "#ff5d73", i: "!", red: true, href: "#/dashboard/activity?useractivity=false", t: H.failed.length + (H.failed.length === 1 ? " failed login" : " failed logins") + " this week",
        s: order.slice(0, 4).map(function (n) { return n + " ×" + by[n]; }).join(" · ") + (order.length > 4 ? " · +" + (order.length - 4) + " more" : "") + " · last " + when(H.failed[0].Date), go: "View" });
    }
    (H.storage || []).forEach(function (g) {
      var pct = g.total > 0 ? Math.round(g.used / g.total * 100) : 0;
      if (pct >= 85) items.push({ c: pct >= 95 ? "#ff5d73" : "#ffb347", i: "▤", red: pct >= 95, t: g.title + " is " + pct + "% full", s: fmtBytes(g.total - g.used) + " free · " + g.dir });
    });
    if (s.HasPendingRestart) items.push({ c: "#ffb347", i: "↻", t: "Restart pending", s: "Something was installed or changed; it takes effect after a restart (Server menu)" });
    if (s.HasUpdateAvailable) items.push({ c: "var(--tbd-acc)", i: "↑", t: "Jellyfin update available", s: "A newer server version is out" });
    (H.tasks || []).forEach(function (t) {
      var r = t.LastExecutionResult;
      if (r && r.Status === "Failed" && Date.now() - Date.parse(r.EndTimeUtc) < DAY) items.push({ c: "#ff5d73", i: "×", red: true, href: "#/dashboard/tasks", t: "Task failed: " + t.Name, s: (r.ErrorMessage || "See the task's log") + " · " + when(r.EndTimeUtc), go: "Tasks" });
    });
    home.__.att.hidden = !items.length;
    setHtml(home.__.alist, items.map(function (x) {
      var tag = x.href ? 'a href="' + x.href + '"' : "div";
      return "<" + tag + ' class="tbh-al' + (x.red ? " red" : "") + '" style="--c:' + x.c + '"><i>' + x.i + "</i><div><b>" + esc(x.t) + "</b><span>" + esc(x.s) + "</span></div>" + (x.go ? "<em>" + x.go + " ›</em>" : "") + "</" + (x.href ? "a" : "div") + ">";
    }).join(""));
  }
  function drawLib() {
    if (!home || !H.counts) return;
    var c = H.counts;
    setHtml(home.__.lib, LIB.filter(function (l, i) { return i < 3 || (c[l[1]] || 0) > 0; }).map(function (l) {
      var w = H.weekly[l[2]];
      return '<div style="--c:' + l[3] + '"><span>' + l[0] + "</span><b>" + fmtNum(c[l[1]] || 0) + "</b>" + (w ? "<em>+" + w + "</em>" : "") + "</div>";
    }).join(""));
  }
  function drawRecent() {
    if (!home || !H.recent) return;
    var s = sid();
    home.__.rec.hidden = !H.recent.length;
    setHtml(home.__.recSc, H.recent.map(function (it) {
      var iid = null, tag = null, url = "";
      if (it.ImageTags && it.ImageTags.Primary) { iid = it.Id; tag = it.ImageTags.Primary; }
      else if (it.SeriesId && it.SeriesPrimaryImageTag) { iid = it.SeriesId; tag = it.SeriesPrimaryImageTag; }
      if (iid) url = api().getUrl("Items/" + iid + "/Images/Primary", { maxHeight: 330, quality: 90, tag: tag });
      var sub = it.ChildCount > 1 ? it.ChildCount + " new" : (it.ProductionYear ? String(it.ProductionYear) : (it.Type || ""));
      return '<a class="tb-rcard" href="#/details?id=' + encodeURIComponent(it.Id) + (s ? "&serverId=" + encodeURIComponent(s) : "") + '"><div class="tb-rimg"' +
        (url ? ' style="background-image:url(&quot;' + esc(url) + '&quot;)"' : "") + '></div><div class="tb-rname">' + esc(it.SeriesName || it.Name || "") + '</div><div class="tb-rsub">' + esc(sub) + "</div></a>";
    }).join(""));
  }
  function drawStorage() {
    if (!home || !H.storage) return;
    setHtml(home.__.sto, H.storage.length ? H.storage.map(function (g) {
      var pct = g.total > 0 ? Math.min(100, Math.round(g.used / g.total * 100)) : 0;
      var col = pct >= 95 ? "#ff4d6d" : pct >= 85 ? "#ffb347" : "#3ee0a1";
      return '<div class="tbh-drv" style="--c:' + col + '"><div class="t"><b>' + esc(g.title) + "</b><span>" + esc(fmtBytes(g.used) + " / " + fmtBytes(g.total)) + " · <strong>" + esc(fmtBytes(g.total - g.used)) + " free</strong></span></div>" +
        '<div class="tbh-g"><i style="width:' + pct + '%"></i></div><details><summary>' + pct + "% used · " + g.items.length + (g.items.length === 1 ? " folder" : " folders") + "</summary>" +
        g.items.map(function (it) { return '<div class="tb-folder"><b>' + esc(it.label) + "</b><span>" + esc(it.path) + "</span></div>"; }).join("") + "</details></div>";
    }).join("") : '<div class="tbh-idle">No drive info</div>');
  }
  function drawTasks() {
    if (!home || !H.tasks) return;
    var run = H.tasks.filter(function (t) { return t.State === "Running"; });
    var scan = run.filter(function (t) { return t.Key === "RefreshLibrary"; })[0], b = home.__.scan;
    if (scan) {
      var pct = Math.max(0, Math.min(100, Math.round(scan.CurrentProgressPercentage || 0)));
      b.style.setProperty("--p", pct + "%");
      setAttr(b, "data-tb-scan", " " + pct + "%");
    } else if (b.hasAttribute("data-tb-scan") && Date.now() - scanAt > 8000) {
      b.removeAttribute("data-tb-scan");
      b.style.removeProperty("--p");
    }
    var html;
    if (run.length) {
      html = run.map(function (t) {
        var pct = Math.max(0, Math.min(100, Math.round(t.CurrentProgressPercentage || 0)));
        return '<div class="tbh-task" style="--c:var(--tbd-acc)"><div class="t">' + esc(t.Name) + "<span>" + pct + '%</span></div><div class="tbh-g"><i style="width:' + pct + '%"></i></div></div>';
      }).join("");
    } else {
      var lib = H.tasks.filter(function (t) { return t.Key === "RefreshLibrary"; })[0], last = lib && lib.LastExecutionResult;
      html = '<div class="tbh-idle">Nothing running' + (last && last.EndTimeUtc ? " · last library scan " + esc(when(last.EndTimeUtc)) : "") + "</div>";
    }
    setHtml(home.__.tasks, html);
  }
  function evKind(t) {
    t = t || "";
    if (/AuthenticationFailed|LockedOut|UserDeleted/.test(t)) return ["#ff5d73", "!"];
    if (/Playback/.test(t)) return ["var(--tbd-acc)", "▶"];
    if (/SessionEnded/.test(t)) return ["#8a8f98", "○"];
    if (/AuthenticationSucceeded|SessionStarted|UserCreated/.test(t)) return ["#3ee0a1", "●"];
    if (/Plugin|Update|Install/.test(t)) return ["#b98bff", "✦"];
    if (/Password|Policy|Configuration/.test(t)) return ["#ff9f43", "⚙"];
    return ["#4fc3ff", "●"];
  }
  function drawFeed() {
    if (!home || !H.log) return;
    var groups = {}, rows = [];
    H.log.forEach(function (e) {
      var name = (e.Name || "").trim().replace(/(\S+) \1$/, "$1");   // "from iPhone iPhone" → "from iPhone"
      if (groups[name]) { groups[name].n++; return; }
      groups[name] = { e: e, name: name, n: 1 };
      rows.push(groups[name]);
    });
    var html = rows.slice(0, 20).map(function (r) {
      var e = r.e, k = evKind(e.Type), u = realUser(e) && H.logUsers[e.UserId], text = esc(r.name), pic = "";
      if (u && u.Name && r.name.indexOf(u.Name) === 0) text = "<b>" + esc(u.Name) + "</b>" + esc(r.name.slice(u.Name.length));
      if (u && u.PrimaryImageTag) pic = ";background-image:url(&quot;" + esc(api().getUrl("Users/" + u.Id + "/Images/Primary", { tag: u.PrimaryImageTag, maxWidth: 64, quality: 90 })) + "&quot;)";
      var tip = BLUR_IPS ? (e.ShortOverview || "") : "";
      return '<a class="tbh-ev" href="#/dashboard/activity?useractivity=' + (realUser(e) ? "true" : "false") + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + "><time>" + esc(when(e.Date)) + '</time><i style="--c:' + k[0] + pic + '">' + (pic ? "" : k[1]) + "</i><p>" + text + "</p>" +
        (r.n > 1 ? "<u" + (k[1] === "!" ? ' class="red"' : "") + ">×" + r.n + "</u>" : "<span></span>") + "</a>";
    }).join("");
    setHtml(home.__.feed, html || '<div class="tbh-idle">No activity in the last 3 days</div>');
  }

  // ── running ──
  var homeTimer = 0, tickN = 0;
  function tick() {
    if (document.hidden || !home || !home.isConnected) return;
    tickN++;
    var running = (H.tasks || []).some(function (t) { return t.State === "Running"; });
    if (running || tickN % 3 === 0) loadTasks();
    if (tickN % 3 === 0) { loadSessions(); loadProc(); loadLog(); }
    if (tickN % 12 === 0) { loadSys(); loadStorage(); }
    if (tickN % 60 === 0) loadLibrary();
  }
  function doHome(p) {
    var h = $(".content-primary", p);
    if (!h) return;
    if (!home) {
      home = shellHome();
      var hs = document.createElement("style");
      hs.id = "tb-home-css";
      hs.textContent = HOME_CSS;
      document.head.appendChild(hs);
      drawHealth(); drawLib(); drawAtt();
    }
    if (home.parentNode !== h) h.appendChild(home);
    // Jellyfin's own boxes stay in the page (it keeps redrawing them) but aren't shown
    kids(h).forEach(function (c) { if (c !== home && c.id !== "tb-np" && c.tagName !== "STYLE") setAttr(c, "data-tb-hide", ""); });
    if (!homeTimer) {
      homeTimer = setInterval(tick, 5000);
      loadSys(); loadProc(); loadSessions(); loadTasks(); loadLog(); loadStorage(); loadLibrary();
      setTimeout(loadProc, 2500);   // the CPU figure needs two readings
    }
  }
  function stopHome() { if (homeTimer) { clearInterval(homeTimer); homeTimer = 0; } }

  // \u2550\u2550\u2550\u2550\u2550 8. Restart / Shutdown: press and hold \u2550\u2550\u2550\u2550\u2550
  function bindHold(b) {
    var timer = null;
    function start() {
      if (timer) return;
      b.setAttribute("data-tb-holding", "");
      timer = setTimeout(function () {
        timer = null;
        b.removeAttribute("data-tb-holding");
        b.__tbOk = true;
        b.click();
        b.__tbOk = false;
      }, HOLD_MS);
    }
    function stop() {
      if (timer) { clearTimeout(timer); timer = null; }
      b.removeAttribute("data-tb-holding");
    }
    b.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button !== 0) return; start(); });
    ["pointerup", "pointerleave", "pointercancel", "blur"].forEach(function (ev) { b.addEventListener(ev, stop); });
    b.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " " || e.keyCode === 13) { e.preventDefault(); if (!e.repeat) start(); }
    });
    b.addEventListener("keyup", function (e) { if (e.key === "Enter" || e.key === " " || e.keyCode === 13) stop(); });
    b.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("button[data-tb-hold]");
    if (b && !b.__tbOk) { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); }
  }, true);
  function doDialogs() {
    $$(".MuiDialog-root").forEach(function (d) {
      var b = $(".MuiDialogActions-root .MuiButton-textError, .MuiDialogActions-root .MuiButton-containedError", d);
      if (!b || b.hasAttribute("data-tb-hold")) return;
      d.setAttribute("data-tb-danger", "");
      b.setAttribute("data-tb-hold", "");
      b.insertBefore(el("span", "tb-hold-fill"), b.firstChild);
      var c = $(".MuiDialogContent-root", d);
      if (c) c.appendChild(el("div", "tb-hold-hint", "Press and hold the button to confirm"));
      bindHold(b);
    });
  }

  // ═════ Update all plugins, then restart (Server menu) ═════
  // Runs Jellyfin's own "Update Plugins" task (it picks the right version of each plugin for this server), shows its
  // progress next to the buttons, then restarts if anything was installed: right away, or once nobody is watching.
  var upd = { busy: false };
  function setStatus(text) { if (home) { var s = home.__.status; if (s.textContent !== text) s.textContent = text; } }
  function post(path) { var a = api(); return Promise.resolve(a.ajax({ type: "POST", url: a.getUrl(path) })); }
  function updDone(text) {
    upd.busy = false;
    setStatus(text);
    setTimeout(function () { if (!upd.busy) setStatus(""); }, 8000);
  }
  function waitForServer() {
    // the server goes down, then comes back: reload once it answers again
    var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
    if (base.charAt(base.length - 1) !== "/") base += "/";
    var tries = 0;
    (function ping() {
      fetch(base + "System/Info/Public", { cache: "no-store" }).then(function (r) {
        if (r.ok) location.reload(); else throw new Error();
      })["catch"](function () { if (++tries < 150) setTimeout(ping, 2000); });
    })();
  }
  function restartWhenIdle() {
    Promise.resolve(api().getSessions({ ActiveWithinSeconds: 960 })).then(function (s) {
      H.sessions = s || [];
      var w = watchers();
      if (!w) {
        setStatus("Nobody is watching — restarting…");
        return post("System/Restart").then(function () { setTimeout(waitForServer, 5000); });
      }
      setStatus("Updates installed \u2014 restarts when nobody is watching (" + w + " still watching)");
      setTimeout(restartWhenIdle, 20000);
    })["catch"](function () { setTimeout(restartWhenIdle, 20000); });
  }
  function updateAll(waitIdle) {
    if (upd.busy || !api()) return;
    upd.busy = true;
    setStatus("Checking for updates…");
    getJSON("ScheduledTasks").then(function (tasks) {
      var task = (tasks || []).filter(function (x) { return x.Key === "PluginUpdates"; })[0];
      if (!task) throw new Error("no task");
      var t0 = Date.now(), seenRun = task.State === "Running";
      return (seenRun ? Promise.resolve() : post("ScheduledTasks/Running/" + task.Id)).then(function () {
        return new Promise(function (resolve, reject) {
          (function poll() {
            getJSON("ScheduledTasks/" + task.Id).then(function (t) {
              if (t.State === "Running") {
                seenRun = true;
                setStatus("Updating plugins… " + Math.max(0, Math.min(100, Math.round(t.CurrentProgressPercentage || 0))) + "%");
              }
              if (t.State !== "Running" && (seenRun || Date.now() - t0 > 8000)) {
                var res = t.LastExecutionResult || {};
                return res.Status === "Failed" ? reject(new Error("failed")) : resolve();
              }
              if (Date.now() - t0 > 15 * 60000) return reject(new Error("timeout"));
              setTimeout(poll, 1500);
            }, function () { setTimeout(poll, 3000); });
          })();
        });
      });
    }).then(function () {
      return getJSON("System/Info");
    }).then(function (info) {
      if (!info || !info.HasPendingRestart) return updDone("All plugins up to date — no restart needed");
      if (waitIdle) return restartWhenIdle();
      setStatus("Restarting server…");
      return post("System/Restart").then(function () { setTimeout(waitForServer, 5000); });
    })["catch"](function (e) {
      updDone(e && e.message === "no task" ? "Couldn't find the Update Plugins task" : "Update failed — see Scheduled Tasks");
    });
  }
  // \u2550\u2550\u2550\u2550\u2550 9. Menu: collapsible Plugins + icons \u2550\u2550\u2550\u2550\u2550
  var ICONS = [
    [/discord|notif|webhook|gotify|telegram/i, "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"],
    [/intro|skip|credit/i, "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"],
    [/transform|convert/i, "M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"],
    [/report|stat|analytic|chart/i, "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"],
    [/theme|skin|look|kefin|style|css|brand/i, "M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"],
    [/list|playlist|collection/i, "M3 10h11v2H3zm0-4h11v2H3zm0 8h7v2H3zm13-1v8l6-4z"],
    [/inject|script|code|js/i, "M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"],
    [/subtitle|caption/i, "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM4 12h4v2H4v-2zm10 6H4v-2h10v2zm6 0h-4v-2h4v2zm0-4H10v-2h10v2z"],
    [/sync|trakt|backup|simkl/i, "M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"],
    [/play|stream|now/i, "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"]
  ];
  var PUZZLE = "M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z";
  var SVGNS = "http://www.w3.org/2000/svg";
  function setCollapsed(list, on) {
    if (on) setAttr(list, "data-tb-collapsed", ""); else if (list.hasAttribute("data-tb-collapsed")) list.removeAttribute("data-tb-collapsed");
  }
  function doDrawer() {
    var sh = document.getElementById("plugins-subheader");
    var list = sh && sh.parentElement;
    if (!list) return;
    var items = kids(list).filter(function (c) { return c !== sh; });
    if (!list.hasAttribute("data-tb-plugins")) {
      list.setAttribute("data-tb-plugins", "");
      sh.setAttribute("tabindex", "0");
      sh.setAttribute("role", "button");
      var pref = null;
      try { pref = localStorage.getItem("tbDashPlugins"); } catch (e) {}
      setCollapsed(list, pref === null ? PLUGINS_COLLAPSED : pref === "1");
      var toggle = function () {
        var col = !list.hasAttribute("data-tb-collapsed");
        setCollapsed(list, col);
        try { localStorage.setItem("tbDashPlugins", col ? "1" : "0"); } catch (e) {}
      };
      sh.addEventListener("click", toggle);
      sh.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } });
    }
    if (!sh.__tbChev || sh.__tbChev.parentNode !== sh) {
      sh.__tbChev = el("span", "tb-chev");
      sh.__tbChev.appendChild(el("em"));
      sh.__tbChev.appendChild(el("i", "", "\u25be"));
      sh.appendChild(sh.__tbChev);
    }
    var cnt = String(Math.max(0, items.length - 1));
    var em = sh.__tbChev.firstChild;
    if (em.textContent !== cnt) em.textContent = cnt;
    // this theme's own page: always first under Plugins, and still showing when the section is closed
    // (moved with CSS order, not in the page itself: Jellyfin redraws this menu and expects its own order)
    items.slice(1).forEach(function (c) {
      var mine = /ushereats/i.test(c.textContent || "");
      if (mine) setAttr(c, "data-tb-first", ""); else if (c.hasAttribute("data-tb-first")) c.removeAttribute("data-tb-first");
    });
    // open it while you're on another plugin's page
    if (items.slice(1).some(function (c) { return c.classList.contains("Mui-selected") && !c.hasAttribute("data-tb-first"); })) setCollapsed(list, false);
    // icons
    items.slice(1).forEach(function (a) {
      var svg = $('.MuiListItemIcon-root svg[data-testid="FolderIcon"]', a);
      if (!svg || svg.hasAttribute("data-tb-hide")) return;
      var name = (a.textContent || "").trim();
      var d = PUZZLE;
      for (var i = 0; i < ICONS.length; i++) if (ICONS[i][0].test(name)) { d = ICONS[i][1]; break; }
      var ns = document.createElementNS(SVGNS, "svg");
      ns.setAttribute("viewBox", "0 0 24 24");
      ns.setAttribute("class", "tb-picon");
      ns.setAttribute("aria-hidden", "true");
      var path = document.createElementNS(SVGNS, "path");
      path.setAttribute("d", d);
      ns.appendChild(path);
      svg.setAttribute("data-tb-hide", "");
      svg.parentNode.appendChild(ns);
    });
  }

  // ═════ Run ═════
  var active = false;
  function run() {
    if (!document.body.classList.contains("dashboardDocument") || !api()) return;
    try { doDrawer(); } catch (e) {}
    try { doDialogs(); } catch (e) {}
    var p = page();
    if (!p) { stopHome(); return; }
    try { doHome(p); } catch (e) { console.error("[Ushereats Theme] dashboard home", e); }
    if (!document.body.classList.contains("tb-dash-ready")) document.body.classList.add("tb-dash-ready");
  }
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    // before the next frame is drawn, so Jellyfin's own boxes never flash
    requestAnimationFrame(function () { queued = false; run(); });
  }
  var mo = new MutationObserver(schedule);
  function enter() {
    if (active) return;
    active = true;
    if (!st.parentNode) document.head.appendChild(st);
    mo.observe(document.body, { childList: true, subtree: true });
    schedule();
  }
  function leave() {
    if (!active) return;
    active = false;
    mo.disconnect();
    stopHome();
    if (st.parentNode) st.parentNode.removeChild(st);
  }
  function check() {
    if (document.body.classList.contains("dashboardDocument")) enter(); else leave();
  }
  // only watches the <body> class (cheap) to know when you enter / leave the dashboard
  new MutationObserver(check).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  check();
})();

(function dashboardSkin() {
  // Admin dashboard restyle + upgrades. Jellyfin does NOT load Custom CSS on dashboard pages,
  // so this script injects its own styles. Everything is scoped to the admin area (body.dashboardDocument).
  //  - Server hero card (name, online pulse, version, update/restart chips, live streams/devices/users)
  //  - Stat tiles on one row, count-up numbers, "+X this week"
  //  - Recently added poster strip
  //  - Paths merged into one ring per drive (folders listed underneath)
  //  - Activity: colour per event type, user pictures, repeats folded (x3), IPs blurred until hover
  //  - Alerts: failed logins glow red with a weekly count per name
  //  - Scan All Libraries fills up with live progress
  //  - Restart / Shutdown: red panel + press-and-hold to confirm
  //  - Menu: Plugins section collapsible (remembered), icons per plugin
  if (window.__tbDash) return;
  window.__tbDash = true;

  // \u2500\u2500 Settings \u2500\u2500
  var HOLD_MS = tbCfg("DashboardHoldMs", 1200);            // how long to hold Restart / Shutdown
  var RECENT_COUNT = tbCfg("DashboardRecentCount", 16);         // posters in "Recently added" (0 = hide the strip)
  var BLUR_IPS = tbCfg("DashboardBlurIps", true);           // blur IP addresses in Activity until hover
  var PLUGINS_COLLAPSED = tbCfg("DashboardPluginsCollapsed", true);  // Plugins menu section collapsed by default

  var CSS = "/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ADMIN DASHBOARD: neon glass \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n   Scoped to the admin area only (body.dashboardDocument). Main UI untouched.\n   Uses the SleekFin accent; --tb-accent-rgb comes from accent.js. */\nbody.dashboardDocument {\n  --tbd-acc: var(--sleekfin-accent, rgb(233, 196, 106));\n  --tbd-rgb: var(--tb-accent-rgb, 233, 196, 106);\n  --tbd-glass: rgba(18, 18, 22, 0.55);\n  --tbd-line: rgba(255, 255, 255, 0.08);\n  --tbd-radius: 18px;\n}\n\n/* \u2500\u2500 Background: moving aurora in the accent + violet \u2500\u2500 */\nbody.dashboardDocument:not(#tb-x) {\n  background: #060608 !important;\n}\nbody.dashboardDocument::before {\n  content: \"\"; position: fixed; inset: -20%; z-index: 0; pointer-events: none;\n  background:\n    radial-gradient(40% 35% at 20% 15%, rgba(var(--tbd-rgb), 0.22) 0%, transparent 70%),\n    radial-gradient(35% 30% at 85% 20%, rgba(140, 90, 255, 0.18) 0%, transparent 70%),\n    radial-gradient(40% 35% at 60% 95%, rgba(0, 200, 255, 0.12) 0%, transparent 70%);\n  filter: blur(20px);\n  animation: tbd-aurora 26s ease-in-out infinite alternate;\n}\n@keyframes tbd-aurora {\n  0%   { transform: translate3d(0, 0, 0) scale(1); }\n  50%  { transform: translate3d(3%, -2%, 0) scale(1.08); }\n  100% { transform: translate3d(-3%, 2%, 0) scale(1.02); }\n}\nbody.dashboardDocument .skinBody,\nbody.dashboardDocument .mainAnimatedPage,\nbody.dashboardDocument .backgroundContainer { background: transparent !important; }\n\n/* \u2500\u2500 Top bar + drawer: frosted glass \u2500\u2500 */\nbody.dashboardDocument .MuiAppBar-root:not(#tb-x) {\n  background: rgba(8, 8, 10, 0.55) !important; background-image: none !important;\n  -webkit-backdrop-filter: blur(18px) saturate(1.3); backdrop-filter: blur(18px) saturate(1.3);\n  border-bottom: 1px solid var(--tbd-line) !important; box-shadow: none !important;\n}\nbody.dashboardDocument .MuiDrawer-paper:not(#tb-x) {\n  background: rgba(10, 10, 13, 0.6) !important; background-image: none !important;\n  -webkit-backdrop-filter: blur(22px); backdrop-filter: blur(22px);\n  border-right: 1px solid var(--tbd-line) !important;\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListSubheader-root:not(#tb-x) {\n  background: transparent !important;\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif) !important;\n  font-size: 18px !important; letter-spacing: 0.08em; color: rgba(255, 255, 255, 0.45) !important;\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListItemButton-root:not(#tb-x) {\n  margin: 2px 10px; border-radius: 12px !important;\n  transition: background-color 150ms ease, transform 150ms ease, color 150ms ease;\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListItemButton-root:not(#tb-x):hover {\n  background: rgba(255, 255, 255, 0.06) !important; transform: translateX(3px);\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListItemButton-root.Mui-selected:not(#tb-x) {\n  background: linear-gradient(90deg, rgba(var(--tbd-rgb), 0.28), rgba(var(--tbd-rgb), 0.06)) !important;\n  color: #fff !important;\n  box-shadow: inset 3px 0 0 var(--tbd-acc), 0 0 22px -8px rgba(var(--tbd-rgb), 0.8);\n}\nbody.dashboardDocument .MuiDrawer-paper .MuiListItemButton-root.Mui-selected .MuiListItemIcon-root:not(#tb-x) { color: var(--tbd-acc) !important; }\n\n/* \u2500\u2500 Cards / papers everywhere in admin: glass with a gradient edge \u2500\u2500 */\nbody.dashboardDocument .mainAnimatedPage .MuiPaper-root:not(.MuiAppBar-root):not(.MuiDrawer-paper):not(.MuiMenu-paper):not(#tb-x) {\n  position: relative;\n  background: var(--tbd-glass) !important; background-image: none !important;\n  border: 1px solid var(--tbd-line) !important;\n  border-radius: var(--tbd-radius) !important;\n  box-shadow: 0 20px 50px -24px rgba(0, 0, 0, 0.9) !important;\n  -webkit-backdrop-filter: blur(16px) saturate(1.2); backdrop-filter: blur(16px) saturate(1.2);\n}\nbody.dashboardDocument .mainAnimatedPage .MuiCard-root:not(#tb-x) {\n  transition: transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 220ms ease, border-color 220ms ease;\n}\n@media (hover: hover) {\n  body.dashboardDocument .mainAnimatedPage .MuiCard-root:not(#tb-x):hover {\n    transform: translateY(-4px);\n    border-color: rgba(var(--tbd-rgb), 0.45) !important;\n    box-shadow: 0 26px 60px -24px rgba(0, 0, 0, 0.95), 0 0 30px -10px rgba(var(--tbd-rgb), 0.55) !important;\n  }\n}\n\n/* \u2500\u2500 Widget headings (SERVER, ACTIVITY, ALERTS, PATHS...) \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiButton-textInherit:not(#tb-x) {\n  padding: 4px 6px !important; border-radius: 10px !important; background: transparent !important;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textInherit .MuiTypography-h3:not(#tb-x),\nbody.dashboardDocument #dashboardPage h2,\nbody.dashboardDocument #dashboardPage h3 {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif) !important;\n  font-size: 30px !important; font-weight: 400 !important; letter-spacing: 0.04em; line-height: 1;\n  text-transform: uppercase;\n  background: linear-gradient(90deg, #fff 0%, #fff 40%, var(--tbd-acc) 100%);\n  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textInherit .MuiButton-endIcon:not(#tb-x) {\n  color: var(--tbd-acc); transition: transform 180ms ease;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textInherit:hover .MuiButton-endIcon:not(#tb-x) { transform: translateX(4px); }\n\n/* \u2500\u2500 Server card: label/value rows \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiPaper-root > .MuiStack-root > .MuiStack-root:first-child .MuiTypography-root {\n  color: rgba(255, 255, 255, 0.5) !important; font-size: 13px !important; text-transform: uppercase; letter-spacing: 0.06em;\n}\n\n/* \u2500\u2500 Buttons: Scan = accent glow pill, Restart / Shutdown = red glass pills \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiButton-root:not(.MuiButton-textInherit):not(#tb-x) {\n  padding: 9px 18px !important; border-radius: 999px !important;\n  font-weight: 700 !important; text-transform: none !important; letter-spacing: 0.01em;\n  transition: transform 160ms ease, box-shadow 200ms ease, background-color 160ms ease, filter 160ms ease;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textPrimary:not(#tb-x),\nbody.dashboardDocument #dashboardPage .MuiButton-containedPrimary:not(#tb-x) {\n  color: #111 !important;\n  background: linear-gradient(135deg, var(--tbd-acc), rgba(var(--tbd-rgb), 0.75)) !important;\n  box-shadow: 0 8px 26px -8px rgba(var(--tbd-rgb), 0.85), inset 0 1px 0 rgba(255, 255, 255, 0.35) !important;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-textError:not(#tb-x),\nbody.dashboardDocument #dashboardPage .MuiButton-containedError:not(#tb-x) {\n  color: #ff8080 !important;\n  background: rgba(255, 70, 70, 0.10) !important;\n  border: 1px solid rgba(255, 90, 90, 0.35) !important;\n}\n@media (hover: hover) {\n  body.dashboardDocument #dashboardPage .MuiButton-root:not(.MuiButton-textInherit):not(#tb-x):hover { transform: translateY(-2px); }\n  body.dashboardDocument #dashboardPage .MuiButton-textPrimary:not(#tb-x):hover { filter: brightness(1.08);\n    box-shadow: 0 12px 34px -8px rgba(var(--tbd-rgb), 1), inset 0 1px 0 rgba(255, 255, 255, 0.35) !important; }\n  body.dashboardDocument #dashboardPage .MuiButton-textError:not(#tb-x):hover {\n    color: #fff !important; background: rgba(255, 60, 60, 0.85) !important; box-shadow: 0 10px 30px -8px rgba(255, 60, 60, 0.9) !important; }\n}\nbody.dashboardDocument #dashboardPage .MuiButton-root.Mui-disabled:not(#tb-x) { opacity: 0.55; filter: saturate(0.6); }\n\n/* \u2500\u2500 Stat tiles: huge Bebas numbers + glowing icon chips, colour per library type \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiCard-root .MuiTypography-h5:not(#tb-x) {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif) !important;\n  font-size: 44px !important; line-height: 1 !important; letter-spacing: 0.02em; margin-top: 4px;\n  color: #fff;\n  text-shadow: 0 0 24px rgba(var(--tbd-rgb), 0.35);\n}\nbody.dashboardDocument #dashboardPage .MuiCard-root .MuiTypography-body2:not(#tb-x) {\n  font-size: 11px !important; font-weight: 700 !important; text-transform: uppercase; letter-spacing: 0.12em;\n}\nbody.dashboardDocument #dashboardPage .MuiCard-root:not(#tb-x) { --c: var(--tbd-acc); }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"MovieIcon\"]):not(#tb-x)        { --c: #ff5d73; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"TvIcon\"]):not(#tb-x)           { --c: #4fc3ff; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"MusicNoteIcon\"]):not(#tb-x)    { --c: #b98bff; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"MusicVideoIcon\"]):not(#tb-x)   { --c: #ff9f43; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"VideoLibraryIcon\"]):not(#tb-x) { --c: #3ee0a1; }\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(svg[data-testid=\"BookIcon\"]):not(#tb-x)         { --c: #ffd166; }\nbody.dashboardDocument #dashboardPage .MuiCard-root > .MuiStack-root > .MuiSvgIcon-fontSizeLarge:not(#tb-x) {\n  box-sizing: content-box; width: 30px; height: 30px; padding: 12px; border-radius: 14px;\n  color: var(--c);\n  background: color-mix(in srgb, var(--c) 16%, transparent);\n  box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 35%, transparent), 0 0 28px -6px var(--c);\n}\n/* matching coloured top edge on each tile */\nbody.dashboardDocument #dashboardPage .MuiCard-root:has(> .MuiStack-root > .MuiSvgIcon-fontSizeLarge)::before {\n  content: \"\"; position: absolute; left: 18px; right: 18px; top: 0; height: 2px; border-radius: 2px;\n  background: linear-gradient(90deg, transparent, var(--c), transparent); opacity: 0.9;\n}\n@media (hover: hover) {\n  body.dashboardDocument #dashboardPage .MuiCard-root:has(> .MuiStack-root > .MuiSvgIcon-fontSizeLarge):not(#tb-x):hover {\n    border-color: color-mix(in srgb, var(--c) 50%, transparent) !important;\n    box-shadow: 0 26px 60px -24px rgba(0, 0, 0, 0.95), 0 0 30px -10px var(--c) !important;\n  }\n}\n\n/* \u2500\u2500 Device / now-playing cards: rounded artwork, glowing progress \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiCardMedia-root:not(#tb-x) { border-radius: 14px 14px 0 0; }\nbody.dashboardDocument #dashboardPage .MuiCardActions-root:not(#tb-x) { border-top: 1px solid var(--tbd-line); }\nbody.dashboardDocument #dashboardPage .MuiCardActions-root .MuiIconButton-root:not(#tb-x) {\n  background: rgba(255, 255, 255, 0.06); margin-right: 6px; transition: background-color 150ms ease, color 150ms ease;\n}\nbody.dashboardDocument #dashboardPage .MuiCardActions-root .MuiIconButton-root:not(#tb-x):hover { background: var(--tbd-acc); color: #111; }\nbody.dashboardDocument .MuiChip-root:not(#tb-x) {\n  border-radius: 8px !important; font-weight: 700 !important; font-size: 11px !important; letter-spacing: 0.04em;\n  background: rgba(var(--tbd-rgb), 0.14) !important; color: var(--tbd-acc) !important;\n  border: 1px solid rgba(var(--tbd-rgb), 0.35) !important;\n}\n\n/* \u2500\u2500 Progress bars (paths, playback, tasks): thick, rounded, shimmering \u2500\u2500 */\nbody.dashboardDocument .MuiLinearProgress-root:not(#tb-x) {\n  height: 8px !important; border-radius: 999px !important; background: rgba(255, 255, 255, 0.08) !important; overflow: hidden;\n}\nbody.dashboardDocument .MuiLinearProgress-bar:not(#tb-x) { border-radius: 999px !important; }\nbody.dashboardDocument .MuiLinearProgress-barColorPrimary:not(#tb-x),\nbody.dashboardDocument .MuiLinearProgress-barColorSuccess:not(#tb-x) {\n  background: linear-gradient(90deg, rgba(var(--tbd-rgb), 0.55), var(--tbd-acc)) !important;\n  box-shadow: 0 0 14px rgba(var(--tbd-rgb), 0.7);\n}\nbody.dashboardDocument .MuiLinearProgress-barColorWarning:not(#tb-x) { background: linear-gradient(90deg, #ff9f43, #ffd166) !important; box-shadow: 0 0 14px rgba(255, 170, 60, 0.7); }\nbody.dashboardDocument .MuiLinearProgress-barColorError:not(#tb-x)   { background: linear-gradient(90deg, #ff4d6d, #ff8080) !important; box-shadow: 0 0 14px rgba(255, 80, 100, 0.7); }\nbody.dashboardDocument .MuiLinearProgress-determinate .MuiLinearProgress-bar1Determinate::after {\n  content: \"\"; position: absolute; inset: 0;\n  background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.45) 50%, transparent 100%);\n  transform: translateX(-100%); animation: tbd-shimmer 2.6s ease-in-out infinite;\n}\n@keyframes tbd-shimmer { 60%, 100% { transform: translateX(100%); } }\n\n/* \u2500\u2500 Activity / Alerts / Paths lists: each row a mini card \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiList-root:not(#tb-x) { padding: 8px !important; }\nbody.dashboardDocument #dashboardPage .MuiList-root > .MuiListItem-root:not(#tb-x) {\n  margin-bottom: 6px; border-radius: 14px; background: rgba(255, 255, 255, 0.03);\n  border: 1px solid rgba(255, 255, 255, 0.04);\n  transition: background-color 150ms ease, border-color 150ms ease, transform 150ms ease;\n}\nbody.dashboardDocument #dashboardPage .MuiList-root > .MuiListItem-root:not(#tb-x):hover {\n  background: rgba(255, 255, 255, 0.06); border-color: rgba(var(--tbd-rgb), 0.3); transform: translateX(3px);\n}\nbody.dashboardDocument #dashboardPage .MuiListItemButton-root:not(#tb-x) { border-radius: 14px !important; }\nbody.dashboardDocument #dashboardPage .MuiListItemAvatar-root .MuiAvatar-root:not(#tb-x) {\n  border-radius: 12px !important; box-shadow: 0 0 20px -4px currentColor, inset 0 1px 0 rgba(255, 255, 255, 0.25);\n  color: rgba(255, 255, 255, 0.5);\n}\nbody.dashboardDocument #dashboardPage .MuiListItemText-primary:not(#tb-x),\nbody.dashboardDocument #dashboardPage .MuiListItemText-root > .MuiTypography-root:first-child { font-weight: 600 !important; }\nbody.dashboardDocument #dashboardPage .MuiListItemIcon-root:not(#tb-x) { color: var(--tbd-acc) !important; }\n\n/* \u2500\u2500 Entrance: widgets rise in, staggered \u2500\u2500 */\n@media (prefers-reduced-motion: no-preference) {\n  body.dashboardDocument #dashboardPage .content-primary > .MuiGrid-container > .MuiGrid-item {\n    animation: tbd-rise 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;\n  }\n  body.dashboardDocument #dashboardPage .content-primary > .MuiGrid-container > .MuiGrid-item:nth-child(2) { animation-delay: 90ms; }\n  body.dashboardDocument #dashboardPage .content-primary > .MuiGrid-container > .MuiGrid-item:nth-child(3) { animation-delay: 180ms; }\n}\n@keyframes tbd-rise { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: none; } }\n\n/* \u2500\u2500 Inputs + dialogs in admin pages \u2500\u2500 */\nbody.dashboardDocument .MuiOutlinedInput-root:not(#tb-x) { border-radius: 12px !important; }\nbody.dashboardDocument .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline:not(#tb-x) {\n  border-color: var(--tbd-acc) !important; box-shadow: 0 0 0 3px rgba(var(--tbd-rgb), 0.18);\n}\nbody.dashboardDocument .MuiDialog-paper:not(#tb-x) {\n  background: rgba(16, 16, 20, 0.88) !important; background-image: none !important;\n  border: 1px solid var(--tbd-line); border-radius: 20px !important;\n  -webkit-backdrop-filter: blur(20px); backdrop-filter: blur(20px);\n}\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 end ADMIN DASHBOARD \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 ADMIN DASHBOARD: extras (hero, tiles, drives, feed, hold-to-confirm, menu, phone) \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\nbody.dashboardDocument [data-tb-hide] { display: none !important; }\nbody.dashboardDocument .tb-sec-title {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 30px; line-height: 1; letter-spacing: 0.04em;\n  text-transform: uppercase; margin: 8px 6px 12px;\n  background: linear-gradient(90deg, #fff 0%, #fff 40%, var(--tbd-acc) 100%);\n  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;\n}\n\n/* \u2500\u2500 1. Server hero \u2500\u2500 */\nbody.dashboardDocument #dashboardPage [data-tb-hero]:not(#tb-x) {\n  overflow: hidden; padding: 22px 24px !important;\n  background:\n    radial-gradient(80% 140% at 0% 0%, rgba(var(--tbd-rgb), 0.22) 0%, transparent 60%),\n    radial-gradient(60% 120% at 100% 100%, rgba(140, 90, 255, 0.16) 0%, transparent 60%),\n    var(--tbd-glass) !important;\n}\n.tb-hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }\n.tb-hero-name {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 58px; line-height: 0.9; letter-spacing: 0.02em;\n  background: linear-gradient(90deg, #fff 30%, var(--tbd-acc));\n  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;\n  overflow-wrap: anywhere;\n}\n.tb-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }\n.tb-chip {\n  display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px; border-radius: 999px;\n  font-size: 12px; font-weight: 700; letter-spacing: 0.02em; color: rgba(255, 255, 255, 0.82);\n  background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1);\n}\n.tb-chip.on { color: #3ee0a1; background: rgba(62, 224, 161, 0.1); border-color: rgba(62, 224, 161, 0.35); }\n.tb-chip.acc { color: var(--tbd-acc); background: rgba(var(--tbd-rgb), 0.12); border-color: rgba(var(--tbd-rgb), 0.4); }\n.tb-chip.warn { color: #ffb347; background: rgba(255, 159, 67, 0.12); border-color: rgba(255, 159, 67, 0.4); }\n.tb-dot { width: 8px; height: 8px; border-radius: 50%; background: #3ee0a1; animation: tb-pulse 1.8s ease-out infinite; }\n@keyframes tb-pulse {\n  0% { box-shadow: 0 0 0 0 rgba(62, 224, 161, 0.65); }\n  70% { box-shadow: 0 0 0 9px rgba(62, 224, 161, 0); }\n  100% { box-shadow: 0 0 0 0 rgba(62, 224, 161, 0); }\n}\n.tb-hero-stats { display: flex; gap: 10px; }\n.tb-hs {\n  min-width: 86px; padding: 10px 14px; border-radius: 14px; text-align: center;\n  background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.07);\n}\n.tb-hs b { display: block; font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-weight: 400; font-size: 36px; line-height: 1; color: #fff; }\n.tb-hs span { font-size: 10px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255, 255, 255, 0.5); }\n.tb-hs.live b { color: var(--tbd-acc); text-shadow: 0 0 18px rgba(var(--tbd-rgb), 0.6); }\n\n/* \u2500\u2500 Scan button doubles as a progress bar while scanning \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiButton-root[data-tb-scan]:not(#tb-x) {\n  opacity: 1 !important; filter: none !important; color: #111 !important;\n  background: linear-gradient(90deg, var(--tbd-acc) var(--p, 0%), rgba(var(--tbd-rgb), 0.28) var(--p, 0%)) !important;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-root[data-tb-scan]::after {\n  content: attr(data-tb-scan); margin-left: 4px; font-variant-numeric: tabular-nums;\n}\nbody.dashboardDocument #dashboardPage .MuiButton-root[data-tb-scan] .MuiButton-startIcon { animation: tb-spin 1.1s linear infinite; }\n@keyframes tb-spin { to { transform: rotate(360deg); } }\n\n/* \u2500\u2500 2. Stat tiles on one row, count-up numbers, \"+X this week\" \u2500\u2500 */\nbody.dashboardDocument #dashboardPage [data-tb-tiles]:not(#tb-x) {\n  display: flex !important; flex-wrap: wrap; gap: 14px; margin: 0 !important; width: 100% !important;\n}\nbody.dashboardDocument #dashboardPage [data-tb-tiles] > .MuiGrid-item:not(#tb-x) {\n  flex: 1 1 150px; max-width: none !important; width: auto !important; padding: 0 !important; margin: 0 !important;\n}\nbody.dashboardDocument #dashboardPage [data-tb-tiles] > .MuiGrid-item[data-tb-two]:not(#tb-x) { flex: 1.6 1 240px; }\nbody.dashboardDocument #dashboardPage .MuiCard-root .tb-num {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 42px; line-height: 1; letter-spacing: 0.02em;\n  margin-top: 4px; color: #fff; text-shadow: 0 0 24px rgba(var(--tbd-rgb), 0.35); font-variant-numeric: tabular-nums;\n}\nbody.dashboardDocument #dashboardPage .MuiCard-root .tb-week {\n  margin-top: 3px; font-size: 11px; font-weight: 800; letter-spacing: 0.02em; color: #3ee0a1; white-space: nowrap;\n}\n\n/* \u2500\u2500 Recently added strip \u2500\u2500 */\n.tb-recent { margin-top: 22px; }\n.tb-rscroll {\n  display: flex; gap: 12px; overflow-x: auto; padding: 6px 4px 14px; scroll-snap-type: x proximity;\n  scrollbar-width: thin; scrollbar-color: rgba(255, 255, 255, 0.18) transparent;\n}\n.tb-rcard { flex: 0 0 112px; min-width: 0; color: #fff !important; text-decoration: none !important; scroll-snap-align: start; outline: none; }\n.tb-rimg {\n  width: 112px; aspect-ratio: 2 / 3; border-radius: 12px; background: #17171c center / cover no-repeat;\n  box-shadow: 0 10px 24px -12px #000; transition: transform 200ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 200ms ease;\n}\n.tb-rcard:hover .tb-rimg, .tb-rcard:focus-visible .tb-rimg {\n  transform: translateY(-4px) scale(1.03);\n  box-shadow: 0 0 0 2px var(--tbd-acc), 0 14px 30px -10px rgba(var(--tbd-rgb), 0.6);\n}\n.tb-rname { margin-top: 7px; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.tb-rsub { font-size: 11px; color: rgba(255, 255, 255, 0.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n\n/* \u2500\u2500 3. Drives (replaces the Paths list) \u2500\u2500 */\n.tb-drives { display: flex; flex-direction: column; gap: 12px; }\n.tb-drive {\n  padding: 16px 18px; border-radius: 18px; background: var(--tbd-glass); border: 1px solid var(--tbd-line);\n  box-shadow: 0 20px 50px -24px rgba(0, 0, 0, 0.9);\n  -webkit-backdrop-filter: blur(16px); backdrop-filter: blur(16px);\n}\n.tb-drive-top { display: flex; align-items: center; gap: 16px; }\n.tb-ring { position: relative; width: 84px; height: 84px; flex: 0 0 84px; }\n.tb-ring svg { display: block; transform: rotate(-90deg); }\n.tb-ring .bg { stroke: rgba(255, 255, 255, 0.08); }\n.tb-ring .fg { stroke: var(--rc); stroke-linecap: round; filter: drop-shadow(0 0 6px var(--rc)); transition: stroke-dashoffset 1100ms cubic-bezier(0.2, 0.8, 0.2, 1); }\n.tb-ring-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 26px; color: #fff; }\n.tb-drive-info { min-width: 0; }\n.tb-drive-name { font-family: var(--title-font, \"Bebas Neue\", sans-serif); font-size: 24px; line-height: 1; letter-spacing: 0.03em; }\n.tb-drive-sub { margin-top: 3px; font-size: 12px; color: rgba(255, 255, 255, 0.5); overflow-wrap: anywhere; }\n.tb-drive-size { margin-top: 6px; font-size: 13px; font-weight: 700; color: rgba(255, 255, 255, 0.9); }\n.tb-drive-size i { font-style: normal; font-weight: 600; color: rgba(255, 255, 255, 0.5); }\n.tb-drive details { margin-top: 12px; }\n.tb-drive summary { cursor: pointer; list-style: none; font-size: 12px; font-weight: 700; color: var(--tbd-acc); user-select: none; }\n.tb-drive summary::-webkit-details-marker { display: none; }\n.tb-drive summary::before { content: \"\\25B8\"; display: inline-block; margin-right: 6px; transition: transform 160ms ease; }\n.tb-drive details[open] summary::before { transform: rotate(90deg); }\n.tb-folder { display: flex; justify-content: space-between; gap: 14px; padding: 7px 0; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 12px; }\n.tb-folder:first-of-type { margin-top: 8px; }\n.tb-folder b { font-weight: 600; color: #fff; white-space: nowrap; }\n.tb-folder span { color: rgba(255, 255, 255, 0.55); text-align: right; overflow-wrap: anywhere; }\n\n/* \u2500\u2500 4/5. Activity + Alerts \u2500\u2500 */\nbody.dashboardDocument #dashboardPage .MuiListItem-root[data-tb-type] .MuiAvatar-root:not(#tb-x) {\n  position: relative; overflow: visible !important; color: #fff;\n  box-shadow: 0 0 0 2px var(--tc), 0 0 18px -4px var(--tc), inset 0 1px 0 rgba(255, 255, 255, 0.25) !important;\n}\n.tb-av-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; border-radius: inherit; }\n.tb-type-dot { position: absolute; right: -4px; bottom: -4px; width: 12px; height: 12px; border-radius: 50%; background: var(--tc); border: 2px solid #111; }\nbody.dashboardDocument #dashboardPage .MuiListItem-root[data-tb-fold] { display: none !important; }\n.tb-x {\n  flex: 0 0 auto; align-self: center; margin-left: 10px; padding: 3px 9px; border-radius: 999px;\n  font-size: 11px; font-weight: 800; white-space: nowrap;\n  background: rgba(var(--tbd-rgb), 0.16); color: var(--tbd-acc); border: 1px solid rgba(var(--tbd-rgb), 0.35);\n}\n.tb-x.red { background: rgba(255, 70, 90, 0.16); color: #ff8a9a; border-color: rgba(255, 80, 100, 0.4); }\nbody.dashboardDocument #dashboardPage [data-tb-ip] { filter: blur(5px); transition: filter 200ms ease; }\nbody.dashboardDocument #dashboardPage .MuiListItem-root:hover [data-tb-ip],\nbody.dashboardDocument #dashboardPage .MuiListItem-root:focus-within [data-tb-ip] { filter: none; }\nbody.dashboardDocument #dashboardPage .MuiList-root > .MuiListItem-root[data-tb-failed]:not(#tb-x) {\n  background: rgba(255, 60, 80, 0.07); border-color: rgba(255, 80, 100, 0.35);\n  box-shadow: 0 0 26px -12px rgba(255, 60, 80, 0.9);\n}\n\n/* \u2500\u2500 8. Restart / Shutdown: red panel + hold-to-confirm \u2500\u2500 */\nbody.dashboardDocument .MuiDialog-root[data-tb-danger] .MuiDialog-paper:not(#tb-x) {\n  background: linear-gradient(160deg, rgba(255, 60, 80, 0.18), rgba(16, 16, 20, 0.92) 55%) !important;\n  border: 1px solid rgba(255, 80, 100, 0.32) !important;\n  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.9), 0 0 60px -24px rgba(255, 60, 80, 0.7) !important;\n}\nbody.dashboardDocument .MuiDialog-root[data-tb-danger] .MuiDialogTitle-root:not(#tb-x) {\n  font-family: var(--title-font, \"Bebas Neue\", sans-serif) !important; font-size: 32px !important; font-weight: 400 !important;\n  letter-spacing: 0.04em; color: #ff8a9a;\n}\n.tb-hold-hint { margin-top: 10px; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.5); }\nbody.dashboardDocument button[data-tb-hold]:not(#tb-x) {\n  position: relative; isolation: isolate; overflow: hidden; border-radius: 999px !important; padding: 8px 20px !important;\n  color: #fff !important; font-weight: 700 !important; background: rgba(255, 60, 80, 0.16) !important;\n  border: 1px solid rgba(255, 80, 100, 0.45) !important;\n  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none;\n}\n.tb-hold-fill {\n  position: absolute; inset: 0; z-index: -1; pointer-events: none;\n  background: linear-gradient(90deg, #ff4d6d, #ff8080);\n  transform: scaleX(0); transform-origin: left center; transition: transform 200ms ease;\n}\nbutton[data-tb-holding] .tb-hold-fill { transform: scaleX(1); transition: transform 1200ms linear; }\n\n/* \u2500\u2500 9. Menu: collapsible Plugins section + per-plugin icons \u2500\u2500 */\nbody.dashboardDocument [data-tb-plugins] > .MuiListSubheader-root:not(#tb-x) {\n  display: flex; align-items: center; justify-content: space-between; cursor: pointer; user-select: none; outline: none;\n}\n.tb-chev { display: inline-flex; align-items: center; gap: 6px; font-family: var(--app-font, Inter, sans-serif); font-size: 11px; font-weight: 700; letter-spacing: 0; }\n.tb-chev em { font-style: normal; padding: 1px 7px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.7); }\n.tb-chev i { font-style: normal; display: inline-block; transition: transform 180ms ease; }\nbody.dashboardDocument [data-tb-plugins][data-tb-collapsed] .tb-chev i { transform: rotate(-90deg); }\nbody.dashboardDocument [data-tb-plugins][data-tb-collapsed] > :not(.MuiListSubheader-root):not(:nth-child(2)) { display: none !important; }\n.tb-picon { width: 24px; height: 24px; fill: currentColor; }\n\n/* \u2500\u2500 10. Phones / small screens \u2500\u2500 */\n@media (max-width: 899px) {\n  .tb-hero-name { font-size: 44px; }\n  .tb-hero-stats { width: 100%; }\n  .tb-hs { flex: 1 1 0; min-width: 0; }\n}\n@media (max-width: 599px) {\n  body.dashboardDocument #dashboardPage [data-tb-tiles] > .MuiGrid-item:not(#tb-x) { flex: 1 1 calc(50% - 7px); }\n  body.dashboardDocument #dashboardPage [data-tb-tiles] > .MuiGrid-item[data-tb-two]:not(#tb-x) { flex: 1 1 100%; }\n  body.dashboardDocument #dashboardPage .MuiCard-root .tb-num { font-size: 34px; }\n  body.dashboardDocument #dashboardPage [data-tb-hero]:not(#tb-x) { padding: 18px !important; }\n  .tb-hero-name { font-size: 38px; }\n  .tb-hs b { font-size: 28px; }\n  body.dashboardDocument #dashboardPage .MuiButton-root:not(.MuiButton-textInherit):not(#tb-x) { padding: 8px 14px !important; font-size: 13px !important; }\n  body.dashboardDocument #dashboardPage .MuiList-root > .MuiListItem-root:not(#tb-x) { margin-bottom: 4px; }\n  body.dashboardDocument #dashboardPage .MuiListItemAvatar-root { min-width: 46px !important; }\n  body.dashboardDocument #dashboardPage .MuiListItemAvatar-root .MuiAvatar-root { width: 34px !important; height: 34px !important; }\n  body.dashboardDocument #dashboardPage .MuiListItemText-root .MuiTypography-root { font-size: 13px !important; }\n  body.dashboardDocument #dashboardPage .tb-sec-title,\n  body.dashboardDocument #dashboardPage .MuiButton-textInherit .MuiTypography-h3:not(#tb-x) { font-size: 24px !important; }\n  .tb-rcard { flex-basis: 92px; }\n  .tb-rimg { width: 92px; }\n  .tb-ring { width: 68px; height: 68px; flex-basis: 68px; }\n  .tb-ring svg { width: 68px; height: 68px; }\n  .tb-ring-pct { font-size: 21px; }\n}\n@media (prefers-reduced-motion: reduce) {\n  .tb-dot, body.dashboardDocument #dashboardPage .MuiButton-root[data-tb-scan] .MuiButton-startIcon { animation: none; }\n}\n/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 end ADMIN DASHBOARD extras \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */\n";

  // Nothing below runs (and no styles exist) outside the admin dashboard, so the main UI pays zero cost.
  var st = document.createElement("style");
  st.id = "tb-dashboard-skin";
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
  var reduceMotion = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  // \u2550\u2550\u2550\u2550\u2550 1. Server hero \u2550\u2550\u2550\u2550\u2550
  function serverPaper(p) {
    var ic = $('svg[data-testid="RestartAltIcon"]', p);
    var btn = ic && ic.closest("button");
    var outer = btn && btn.parentElement && btn.parentElement.parentElement;
    var paper = outer && outer.firstElementChild;
    return paper && paper.classList.contains("MuiPaper-root") ? paper : null;
  }
  function doHero(p) {
    var paper = serverPaper(p);
    if (!paper) return;
    var hero = paper.__tbHero;
    if (!hero || hero.parentNode !== paper) {
      setAttr(paper, "data-tb-hero", "");
      hero = el("div", "tb-hero");
      var left = el("div", "tb-hero-left");
      hero.__name = el("div", "tb-hero-name", "");
      hero.__chips = el("div", "tb-chips");
      left.appendChild(hero.__name);
      left.appendChild(hero.__chips);
      hero.__stats = el("div", "tb-hero-stats");
      hero.appendChild(left);
      hero.appendChild(hero.__stats);
      paper.appendChild(hero);
      paper.__tbHero = hero;
    }
    kids(paper).forEach(function (c) { if (c !== hero) setAttr(c, "data-tb-hide", ""); });

    var a = api();
    Promise.all([
      cached("sysinfo", 60000, function () { return Promise.resolve(a.getSystemInfo()); }),
      cached("sessions", 10000, function () { return Promise.resolve(a.getSessions({ ActiveWithinSeconds: 960 })); }).catch(function () { return null; }),
      cached("users", 300000, function () { return Promise.resolve(a.getUsers()); }).catch(function () { return null; })
    ]).then(function (r) {
      var info = r[0] || {}, sessions = r[1], users = r[2];
      var streams = sessions ? sessions.filter(function (s) { return s.NowPlayingItem; }).length : null;
      var key = [info.ServerName, info.Version, info.HasUpdateAvailable, info.HasPendingRestart,
        streams, sessions ? sessions.length : "", users ? users.length : ""].join("|");
      if (hero.__key === key) return;
      hero.__key = key;
      hero.__name.textContent = info.ServerName || "Jellyfin";
      hero.__chips.textContent = "";
      var on = el("span", "tb-chip on");
      on.appendChild(el("i", "tb-dot"));
      on.appendChild(document.createTextNode("Online"));
      hero.__chips.appendChild(on);
      if (info.Version) hero.__chips.appendChild(el("span", "tb-chip", "v" + info.Version));
      if (info.HasUpdateAvailable) hero.__chips.appendChild(el("span", "tb-chip acc", "Update available"));
      if (info.HasPendingRestart) hero.__chips.appendChild(el("span", "tb-chip warn", "Restart pending"));
      hero.__stats.textContent = "";
      function stat(n, label, live) {
        if (n == null) return;
        var s = el("div", "tb-hs" + (live && n > 0 ? " live" : ""));
        s.appendChild(el("b", "", String(n)));
        s.appendChild(el("span", "", label));
        hero.__stats.appendChild(s);
      }
      stat(streams, "Streaming", true);
      stat(sessions ? sessions.length : null, "Devices");
      stat(users ? users.length : null, "Users");
    }).catch(noop);
  }

  // \u2550\u2550\u2550\u2550\u2550 Scan progress on the Scan All Libraries button \u2550\u2550\u2550\u2550\u2550
  var scanning = false, pollTimer = null, active = false;
  function scanBtn() {
    var p = page();
    var i = p && $('svg[data-testid="RefreshIcon"]', p);
    return i ? i.closest("button") : null;
  }
  function pollTasks() {
    var b = scanBtn();
    pollTimer = null;
    if (!active) { scanning = false; return; }
    var next = function () { if (active && !pollTimer) pollTimer = setTimeout(pollTasks, scanning ? 2000 : 8000); };
    if (!b || document.hidden || !api()) { scanning = false; next(); return; }
    Promise.resolve(api().getScheduledTasks({ isHidden: false })).then(function (tasks) {
      var t = (tasks || []).filter(function (x) { return x.Key === "RefreshLibrary"; })[0];
      var b2 = scanBtn();
      if (!b2) return;
      if (t && t.State === "Running") {
        var pct = Math.max(0, Math.min(100, Math.round(t.CurrentProgressPercentage || 0)));
        b2.style.setProperty("--p", pct + "%");
        setAttr(b2, "data-tb-scan", " " + pct + "%");
        scanning = true;
      } else {
        if (b2.hasAttribute("data-tb-scan")) b2.removeAttribute("data-tb-scan");
        b2.style.removeProperty("--p");
        scanning = false;
      }
    }).catch(noop).then(next);
  }

  // \u2550\u2550\u2550\u2550\u2550 2. Stat tiles \u2550\u2550\u2550\u2550\u2550
  var TYPES = {
    MovieIcon: ["Movie"], TvIcon: ["Series", "Episode"], MusicNoteIcon: ["MusicAlbum", "Audio"],
    MusicVideoIcon: ["MusicVideo"], BookIcon: ["Book"], VideoLibraryIcon: ["BoxSet"]
  };
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
  function countUp(node, from, to) {
    if (reduceMotion || from === to) { node.textContent = fmtNum(to); return; }
    var t0 = null, dur = 900;
    node.__anim = (node.__anim || 0) + 1;
    var id = node.__anim;
    function step(ts) {
      if (node.__anim !== id) return;
      if (t0 === null) t0 = ts;
      var k = Math.min(1, (ts - t0) / dur);
      var e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmtNum(Math.round(from + (to - from) * e));
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function tileIcons(p) { return $$(".MuiCard-root > .MuiStack-root > svg.MuiSvgIcon-fontSizeLarge", p); }
  function doTiles(p) {
    var icons = tileIcons(p);
    if (!icons.length) return;
    var grid = icons[0].closest(".MuiGrid-container");
    if (grid) setAttr(grid, "data-tb-tiles", "");
    icons.forEach(function (svg) {
      var card = svg.closest(".MuiCard-root");
      var item = card.closest(".MuiGrid-item");
      var types = TYPES[svg.getAttribute("data-testid")] || [];
      var boxes = kids(svg.parentElement).filter(function (c) { return c.tagName === "DIV"; });
      if (item && boxes.length > 1) setAttr(item, "data-tb-two", "");
      boxes.forEach(function (box, i) {
        var h5 = $(".MuiTypography-h5", box);
        if (!h5) return;
        var raw = (h5.textContent || "").replace(/[^\d]/g, "");
        var num = box.__tbNum;
        if (raw === "") {                       // still loading
          if (h5.hasAttribute("data-tb-hide")) h5.removeAttribute("data-tb-hide");
          return;
        }
        if (!num || num.parentNode !== box) {
          num = el("div", "tb-num");
          box.insertBefore(num, h5.nextSibling);
          box.__tbNum = num;
        }
        setAttr(h5, "data-tb-hide", "");
        var v = parseInt(raw, 10);
        if (num.__v !== v) { countUp(num, num.__v || 0, v); num.__v = v; }
        var t = types[i];
        if (t && uid()) weekly(t).then(function (n) {
          var w = box.__tbWeek;
          if (!n) { if (w && w.parentNode) w.parentNode.removeChild(w); box.__tbWeek = null; return; }
          if (!w || w.parentNode !== box) { w = el("div", "tb-week"); box.appendChild(w); box.__tbWeek = w; }
          var txt = "+" + n + " this week";
          if (w.textContent !== txt) w.textContent = txt;
        }).catch(noop);
      });
    });
  }

  // \u2550\u2550\u2550\u2550\u2550 Recently added strip \u2550\u2550\u2550\u2550\u2550
  function doRecent(p) {
    if (!RECENT_COUNT) return;
    var icon = tileIcons(p)[0];
    var grid = icon && icon.closest(".MuiGrid-container");
    var box = grid && grid.parentElement;
    if (!box || !uid()) return;
    var wrap = box.__tbRecent;
    if (!wrap || wrap.parentNode !== box) {
      wrap = el("div", "tb-recent");
      wrap.appendChild(el("div", "tb-sec-title", "Recently added"));
      wrap.__sc = el("div", "tb-rscroll");
      wrap.appendChild(wrap.__sc);
      wrap.style.display = "none";
      box.appendChild(wrap);
      box.__tbRecent = wrap;
    }
    cached("recent", 300000, function () {
      return getJSON("Users/" + uid() + "/Items/Latest", {
        Limit: RECENT_COUNT, Fields: "PrimaryImageAspectRatio,ProductionYear", ImageTypeLimit: 1,
        EnableImageTypes: "Primary", EnableUserData: false
      });
    }).then(function (items) {
      items = items || [];
      var key = items.map(function (i) { return i.Id; }).join(",");
      if (wrap.__key === key) return;
      wrap.__key = key;
      var sc = wrap.__sc;
      sc.textContent = "";
      var sid = "";
      try { sid = api().serverId(); } catch (e) {}
      items.forEach(function (it) {
        var a = el("a", "tb-rcard");
        a.href = "#/details?id=" + encodeURIComponent(it.Id) + (sid ? "&serverId=" + encodeURIComponent(sid) : "");
        var img = el("div", "tb-rimg");
        var iid = null, tag = null;
        if (it.ImageTags && it.ImageTags.Primary) { iid = it.Id; tag = it.ImageTags.Primary; }
        else if (it.SeriesId && it.SeriesPrimaryImageTag) { iid = it.SeriesId; tag = it.SeriesPrimaryImageTag; }
        if (iid) {
          var url = api().getUrl("Items/" + iid + "/Images/Primary", { maxHeight: 330, quality: 90, tag: tag });
          img.style.backgroundImage = "url(\"" + url.replace(/"/g, "%22") + "\")";
        }
        a.appendChild(img);
        a.appendChild(el("div", "tb-rname", it.SeriesName || it.Name || ""));
        var sub = it.ChildCount > 1 ? it.ChildCount + " new" : (it.ProductionYear ? String(it.ProductionYear) : (it.Type || ""));
        a.appendChild(el("div", "tb-rsub", sub));
        sc.appendChild(a);
      });
      wrap.style.display = items.length ? "" : "none";
    }).catch(noop);
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
  function driveCard(g) {
    var pct = g.total > 0 ? Math.min(100, Math.round(g.used / g.total * 100)) : 0;
    var col = pct >= 90 ? "#ff4d6d" : pct >= 80 ? "#ff9f43" : "var(--tbd-acc)";
    var card = el("div", "tb-drive");
    card.style.setProperty("--rc", col);
    var top = el("div", "tb-drive-top");
    var ring = el("div", "tb-ring");
    var C = 2 * Math.PI * 36;
    ring.innerHTML = '<svg viewBox="0 0 84 84" width="84" height="84" aria-hidden="true">' +
      '<circle class="bg" cx="42" cy="42" r="36" fill="none" stroke-width="8"/>' +
      '<circle class="fg" cx="42" cy="42" r="36" fill="none" stroke-width="8" stroke-dasharray="' + C.toFixed(2) +
      '" stroke-dashoffset="' + C.toFixed(2) + '"/></svg>';
    ring.appendChild(el("div", "tb-ring-pct", pct + "%"));
    var info = el("div", "tb-drive-info");
    info.appendChild(el("div", "tb-drive-name", g.title));
    info.appendChild(el("div", "tb-drive-sub", g.dir));
    var size = el("div", "tb-drive-size", fmtBytes(g.used) + " / " + fmtBytes(g.total) + "  ");
    size.appendChild(el("i", "", fmtBytes(g.total - g.used) + " free"));
    info.appendChild(size);
    top.appendChild(ring);
    top.appendChild(info);
    card.appendChild(top);
    var det = el("details");
    det.appendChild(el("summary", "", g.items.length + (g.items.length === 1 ? " folder" : " folders")));
    g.items.forEach(function (it) {
      var row = el("div", "tb-folder");
      row.appendChild(el("b", "", it.label));
      row.appendChild(el("span", "", it.path));
      det.appendChild(row);
    });
    card.appendChild(det);
    var fg = ring.querySelector(".fg");
    var target = (C * (1 - pct / 100)).toFixed(2);
    if (reduceMotion) fg.style.strokeDashoffset = target;
    else requestAnimationFrame(function () { requestAnimationFrame(function () { fg.style.strokeDashoffset = target; }); });
    return card;
  }
  function doPaths(p) {
    var list = null;
    $$(".MuiList-root", p).some(function (l) {
      if ($$(".MuiLinearProgress-root", l).length >= 3) { list = l; return true; }
      return false;
    });
    if (!list) return;
    var box = list.parentElement;
    var wrap = box.__tbDrives;
    if (!wrap || wrap.parentNode !== box) {
      wrap = el("div", "tb-drives");
      box.appendChild(wrap);
      box.__tbDrives = wrap;
    }
    cached("storage", 60000, function () { return getJSON("System/Info/Storage"); }).then(function (s) {
      var groups = s ? groupDrives(s) : [];
      if (!groups.length) return;                   // keep Jellyfin's list if the data is missing
      var key = groups.map(function (g) { return [g.title, g.used, g.total, g.items.length].join(":"); }).join("|");
      setAttr(list, "data-tb-hide", "");
      if (wrap.__key === key) return;
      wrap.__key = key;
      wrap.textContent = "";
      groups.forEach(function (g) { wrap.appendChild(driveCard(g)); });
    }).catch(noop);
  }

  // \u2550\u2550\u2550\u2550\u2550 4/5. Activity + Alerts \u2550\u2550\u2550\u2550\u2550
  function typeColor(t) {
    t = t || "";
    if (/AuthenticationFailed|LockedOut|UserDeleted/.test(t)) return "#ff4d6d";
    if (/AuthenticationSucceeded|SessionStarted|UserCreated/.test(t)) return "#3ee0a1";
    if (/SessionEnded/.test(t)) return "#8a8f98";
    if (/Playback/.test(t)) return "var(--tbd-acc)";
    if (/Plugin|Update|Install/.test(t)) return "#b98bff";
    if (/Password|Policy|Configuration/.test(t)) return "#ff9f43";
    return "#4fc3ff";
  }
  var IP_RE = /IP address|\b\d{1,3}(?:\.\d{1,3}){3}\b|[0-9a-f]{1,4}(?::[0-9a-f]{0,4}){3,}/i;
  function badge(row, text, cls) {
    var link = $(".MuiListItemButton-root", row) || row;
    var b = link.__tbBadge;
    if (!text) { if (b && b.parentNode) b.parentNode.removeChild(b); link.__tbBadge = null; return; }
    if (!b || b.parentNode !== link) { b = el("span", "tb-x" + (cls ? " " + cls : "")); link.appendChild(b); link.__tbBadge = b; }
    if (b.textContent !== text) b.textContent = text;
  }
  function rowName(r) {
    var t = $(".MuiListItemText-root", r);
    var f = t && t.firstElementChild;
    return f ? (f.textContent || "").trim() : "";
  }
  function doLog(p, frag, isAlerts) {
    var link = $('a[href*="' + frag + '"]', p);
    var list = link && link.parentElement && kids(link.parentElement, "MuiList-root")[0];
    if (!list) return;
    var rows = kids(list, "MuiListItem-root");
    if (!rows.length) return;
    var names = rows.map(rowName);
    var sig = names.join("\n");
    if (list.__sig === sig && rows.every(function (r) { return r.__tbSeen; })) return;
    list.__sig = sig;
    var q = isAlerts
      ? { startIndex: 0, limit: 200, minDate: new Date(Date.now() - 7 * DAY).toISOString(), hasUserId: false }
      : { startIndex: 0, limit: 7, minDate: new Date(Date.now() - DAY).toISOString(), hasUserId: true };
    Promise.all([
      getJSON("System/ActivityLog/Entries", q),
      cached("users", 300000, function () { return Promise.resolve(api().getUsers()); }).catch(function () { return []; })
    ]).then(function (r) {
      if (list.__sig !== sig) return;
      var entries = (r[0] && r[0].Items) || [];
      var users = {};
      (r[1] || []).forEach(function (u) { users[u.Id] = u; });
      var byName = {};
      entries.forEach(function (e) { var n = (e.Name || "").trim(); if (!byName[n]) byName[n] = e; });
      var seen = {}, order = [];
      rows.forEach(function (row, i) {
        var e = entries[i];
        if (!e || (e.Name || "").trim() !== names[i]) e = byName[names[i]];
        if (!e) return;
        var col = typeColor(e.Type);
        row.style.setProperty("--tc", col);
        setAttr(row, "data-tb-type", e.Type || "");
        var av = $(".MuiAvatar-root", row);
        if (av) {
          av.style.background = col;
          var u = e.UserId && users[e.UserId];
          if (u && u.PrimaryImageTag && !av.__tbImg) {
            var img = el("img", "tb-av-img");
            img.alt = "";
            img.src = api().getUrl("Users/" + u.Id + "/Images/Primary", { tag: u.PrimaryImageTag, maxWidth: 96, quality: 90 });
            av.appendChild(img);
            av.__tbImg = img;
          }
          if (!av.__tbDot) { av.__tbDot = el("span", "tb-type-dot"); av.appendChild(av.__tbDot); }
        }
        if (BLUR_IPS) $$(".MuiListItemText-root .MuiTypography-root", row).forEach(function (t, j) {
          if (j > 0 && IP_RE.test(t.textContent || "")) setAttr(t, "data-tb-ip", "");
        });
        if (isAlerts) {
          if (e.Type === "AuthenticationFailed") {
            setAttr(row, "data-tb-failed", "");
            var n = entries.filter(function (x) { return x.Type === e.Type && (x.Name || "").trim() === names[i]; }).length;
            badge(row, "\u00d7" + n + " this week", "red");
          }
        } else {
          var k = names[i];
          if (seen[k]) { seen[k].n++; setAttr(row, "data-tb-fold", ""); }
          else { seen[k] = { row: row, n: 1 }; order.push(k); if (row.hasAttribute("data-tb-fold")) row.removeAttribute("data-tb-fold"); }
        }
      });
      order.forEach(function (k) { badge(seen[k].row, seen[k].n > 1 ? "\u00d7" + seen[k].n : null); });
      rows.forEach(function (r) { r.__tbSeen = true; });
    }).catch(function () { list.__sig = null; });
  }

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

  // \u2550\u2550\u2550\u2550\u2550 9. Menu: collapsible Plugins + icons \u2550\u2550\u2550\u2550\u2550
  var ICONS = [
    [/discord|notif|webhook|gotify|telegram/i, "M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"],
    [/intro|skip|credit/i, "M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"],
    [/transform|convert/i, "M6.99 11L3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"],
    [/report|stat|analytic|chart/i, "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"],
    [/theme|skin|sleek|kefin|style|css|brand/i, "M12 3a9 9 0 0 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"],
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
    // open it while you're on a plugin page
    if (items.slice(1).some(function (c) { return c.classList.contains("Mui-selected"); })) setCollapsed(list, false);
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

  // \u2550\u2550\u2550\u2550\u2550 Run \u2550\u2550\u2550\u2550\u2550
  function run() {
    if (!document.body.classList.contains("dashboardDocument") || !api()) return;
    try { doDrawer(); } catch (e) {}
    var p = page();
    if (!p) return;
    try { doHero(p); } catch (e) {}
    try { doTiles(p); } catch (e) {}
    try { doRecent(p); } catch (e) {}
    try { doPaths(p); } catch (e) {}
    try { doLog(p, "useractivity=true", false); } catch (e) {}
    try { doLog(p, "useractivity=false", true); } catch (e) {}
    try { doDialogs(); } catch (e) {}
  }
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; run(); }); }, 200);
  }
  var mo = new MutationObserver(schedule), heroTimer = null;
  function enter() {
    if (active) return;
    active = true;
    if (!st.parentNode) document.head.appendChild(st);
    mo.observe(document.body, { childList: true, subtree: true });
    heroTimer = setInterval(function () { if (page() && !document.hidden) run(); }, 15000);   // live numbers in the hero
    if (!pollTimer) pollTimer = setTimeout(pollTasks, 1500);
    schedule();
  }
  function leave() {
    if (!active) return;
    active = false;
    mo.disconnect();
    clearInterval(heroTimer);
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (st.parentNode) st.parentNode.removeChild(st);
  }
  function check() {
    if (document.body.classList.contains("dashboardDocument")) enter(); else leave();
  }
  // only watches the <body> class (cheap) to know when you enter / leave the dashboard
  new MutationObserver(check).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  check();
})();

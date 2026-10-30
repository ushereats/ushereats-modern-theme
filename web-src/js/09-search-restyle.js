(function searchRestyle() {
  // ── Settings ──
  var HUE = tbCfg("SearchHue", 105);                 // background colour: 105 = green, 210 = blue, 280 = purple, 0 = red
  var TITLE = tbCfg("SearchTitle", "Discover something new");
  var DRIFT_SECONDS = 70;        // one full slow drift cycle

  // ── Liquid marble texture, generated once (small canvas, upscaled = soft & cheap) ──
  function makeTexture() {
    var W = 320, H = 180;
    var c = document.createElement("canvas");
    c.width = W; c.height = H;
    var ctx = c.getContext("2d");
    if (!ctx) return null;
    var img = ctx.createImageData(W, H);

    function hash(x, y) {
      var h = x * 374761393 + y * 668265263;
      h = (h ^ (h >>> 13)) * 1274126177;
      return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
    }
    function noise(x, y) {
      var xi = Math.floor(x), yi = Math.floor(y);
      var xf = x - xi, yf = y - yi;
      var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      var a = hash(xi, yi), b = hash(xi + 1, yi), c2 = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
      return a + (b - a) * u + (c2 - a) * v + (a - b - c2 + d) * u * v;
    }
    function fbm(x, y) {
      var s = 0, amp = 0.5;
      for (var o = 0; o < 4; o++) { s += amp * noise(x, y); x *= 2.02; y *= 2.02; amp *= 0.5; }
      return s;
    }
    function mix(a, b, t) { return a + (b - a) * t; }
    function hsl(h, s, l) {
      s /= 100; l /= 100;
      var k = function (n) { return (n + h / 30) % 12; };
      var a = s * Math.min(l, 1 - l);
      var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
      return [f(0) * 255, f(8) * 255, f(4) * 255];
    }
    // dark -> deep -> mid -> bright streak
    var stops = [
      [0.00, hsl(HUE, 70, 4)],
      [0.30, hsl(HUE, 72, 11)],
      [0.55, hsl(HUE, 72, 24)],
      [0.75, hsl(HUE, 74, 36)],
      [0.90, hsl(HUE, 80, 50)],
      [1.00, hsl(HUE, 90, 68)]
    ];
    function palette(t) {
      for (var i = 1; i < stops.length; i++) {
        if (t <= stops[i][0]) {
          var p = (t - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
          var A = stops[i - 1][1], B = stops[i][1];
          return [mix(A[0], B[0], p), mix(A[1], B[1], p), mix(A[2], B[2], p)];
        }
      }
      return stops[stops.length - 1][1];
    }

    var i = 0;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var px = x / W * 1.9 + 0.7, py = y / H * 1.07 + 0.3;
        // Domain warping -> swirly liquid streaks
        var qx = fbm(px, py), qy = fbm(px + 5.2, py + 1.3);
        var rx = fbm(px + 4 * qx + 1.7, py + 4 * qy + 9.2);
        var ry = fbm(px + 4 * qx + 8.3, py + 4 * qy + 2.8);
        var v = fbm(px + 4 * rx, py + 4 * ry);
        v = Math.max(0, Math.min(1, (v - 0.22) * 1.75));
        v = Math.pow(v, 1.1);
        var col = palette(v);
        img.data[i++] = col[0]; img.data[i++] = col[1]; img.data[i++] = col[2]; img.data[i++] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    try { return c.toDataURL("image/jpeg", 0.9); } catch (e) { return null; }
  }

  var texture = null;
  try { texture = makeTexture(); } catch (e) {}
  var bg = "hsl(" + HUE + ", 70%, 3%)";
  var texLayer = texture
    ? 'url("' + texture + '") center / cover no-repeat'
    : "radial-gradient(40% 40% at 30% 35%, hsl(" + HUE + ",70%,22%), transparent 70%), " +
      "radial-gradient(35% 45% at 72% 60%, hsl(" + HUE + ",70%,16%), transparent 70%)";

  var css = [
    /* ── Page + moving liquid background ── */
    "html.sleekfin-media-mounted.sleekfin-media-mounted #searchPage, #searchPage {",
    "  background: " + bg + " !important;",
    "  isolation: isolate;",
    "  min-height: 100vh;",
    "}",
    "#searchPage::before {",
    "  content: ''; position: fixed; z-index: 0; pointer-events: none;",
    "  top: -20%; left: -20%; width: 140%; height: 140%;",
    "  background: " + texLayer + ";",
    "  transform-origin: 50% 50%;",
    "  will-change: transform;",
    "  animation: tbSearchLiquid " + DRIFT_SECONDS + "s ease-in-out infinite alternate;",
    "}",
    /* readability: darken edges + top, static */
    "#searchPage::after {",
    "  content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;",
    "  background:",
    "    linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.45) 100%),",
    "    radial-gradient(120% 90% at 50% 40%, rgba(0,0,0,0) 45%, rgba(0,0,0,0.45) 100%);",
    "}",
    "#searchPage > * { position: relative; z-index: 1; }",
    /* The page centres its children and lets them shrink to fit; force full width */
    "#searchPage > *, #searchPage .searchFields, #searchPage #smart-search-wrapper, #searchPage .input-wrapper,",
    "#searchPage #smart-search-results, #searchPage .searchResults,",
    "#searchPage :is(#smart-search-results, .searchResults) :is(.verticalSection, .emby-scroller, .itemsContainer, .scrollSlider) {",
    "  width: 100% !important; max-width: none; min-width: 0 !important;",
    "  align-self: stretch !important; box-sizing: border-box !important;",
    "}",
    "@keyframes tbSearchLiquid {",
    "  0%   { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }",
    "  33%  { transform: translate3d(3%, -2%, 0) rotate(4deg) scale(1.06); }",
    "  66%  { transform: translate3d(-2%, 3%, 0) rotate(-3deg) scale(1.1); }",
    "  100% { transform: translate3d(2%, 1%, 0) rotate(6deg) scale(1.04); }",
    "}",
    "@media (prefers-reduced-motion: reduce) { #searchPage::before { animation: none; } }",

    /* ── Search box area ── */
    "#searchPage .searchFields.searchFields {",
    "  display: block !important;",
    "  max-width: 560px !important; margin: 0 auto !important;",
    "  padding: calc(var(--sleekfin-header-height, 80px) + 8px) 16px 8px !important;",
    "  text-align: center; box-sizing: border-box;",
    "}",
    "#searchPage .searchFields::before {",
    "  content: '" + TITLE.replace(/'/g, "\\'") + "';",
    "  display: block; margin: 0 0 18px;",
    "  color: #fff; text-align: center;",
    "  font-family: var(--app-font, Inter, sans-serif);",
    "  font-size: clamp(26px, 3.2vw, 40px); font-weight: 700; line-height: 1.15;",
    "  letter-spacing: -0.025em;",
    "  text-shadow: 0 2px 18px rgba(0,0,0,0.35);",
    "}",
    "#searchPage .input-wrapper, #searchPage .searchFields .inputContainer {",
    "  position: relative; margin: 0 !important; padding: 0 !important;",
    "}",
    /* the input itself (KefinTweaks smart search + Jellyfin native) */
    "#searchPage input.searchfields-txtSearch, #searchPage #searchTextInput {",
    "  -webkit-appearance: none; appearance: none;",
    "  width: 100% !important; height: 46px !important;",
    "  margin: 0 !important; padding: 0 20px 0 46px !important;",
    "  box-sizing: border-box !important;",
    "  border-radius: 999px !important;",
    "  background: rgba(8, 14, 8, 0.55) !important;",
    "  border: 1px solid rgba(255, 255, 255, 0.16) !important;",
    "  box-shadow: 0 8px 30px -12px rgba(0,0,0,0.6) !important;",
    "  color: #fff !important;",
    "  font-family: var(--app-font, Inter, sans-serif) !important;",
    "  font-size: 15px !important; font-weight: 500 !important;",
    "  outline: none !important;",
    "  transition: border-color 160ms ease, box-shadow 160ms ease, background-color 160ms ease;",
    "}",
    "#searchPage input.searchfields-txtSearch::placeholder, #searchPage #searchTextInput::placeholder { color: rgba(255,255,255,0.5); }",
    "#searchPage input.searchfields-txtSearch:focus, #searchPage #searchTextInput:focus {",
    "  background: rgba(8, 14, 8, 0.72) !important;",
    "  border-color: rgba(255, 255, 255, 0.38) !important;",
    "  box-shadow: 0 0 0 3px hsla(" + HUE + ", 80%, 55%, 0.22), 0 8px 30px -12px rgba(0,0,0,0.6) !important;",
    "}",
    /* magnifier on the left */
    "#searchPage .searchfields-icon {",
    "  position: absolute !important; left: 17px !important; right: auto !important;",
    "  top: 50% !important; transform: translateY(-50%) !important;",
    "  font-size: 19px !important; color: rgba(255,255,255,0.6) !important;",
    "  z-index: 2; pointer-events: none;",
    "}",
    /* hide Jellyfin's underline/label bits on the native input */
    "#searchPage .searchFields .inputLabel, #searchPage .searchFields .emby-input-focusscale { display: none !important; }",

    /* ── Filter chips (All / Movies/TV / Music / Books / Request) ── */
    "#searchPage .smart-search-buttons { display: flex !important; flex-wrap: wrap; justify-content: center !important; gap: 8px !important; margin-top: 14px !important; }",
    "#searchPage .smart-search-btn {",
    "  height: 32px; padding: 0 15px !important; margin: 0 !important;",
    "  border-radius: 999px !important;",
    "  background: rgba(255,255,255,0.08) !important;",
    "  border: 1px solid rgba(255,255,255,0.14) !important;",
    "  color: rgba(255,255,255,0.82) !important;",
    "  font-family: var(--app-font, Inter, sans-serif) !important;",
    "  font-size: 13px !important; font-weight: 600 !important;",
    "  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease;",
    "}",
    "#searchPage .smart-search-btn:hover, #searchPage .smart-search-btn:focus { background: rgba(255,255,255,0.16) !important; color: #fff !important; }",
    "#searchPage .smart-search-btn.active {",
    "  background: #fff !important; color: #0b0b0b !important; border-color: #fff !important;",
    "}",

    /* ── Suggestions -> centred glass chips ── */
    "#searchPage .searchSuggestions { max-width: 760px; margin: 34px auto 0 !important; text-align: center; padding: 0 16px; box-sizing: border-box; }",
    "#searchPage .searchSuggestions .sectionTitleContainer { justify-content: center !important; padding: 0 !important; margin: 0 0 14px !important; }",
    "#searchPage .searchSuggestions .sectionTitle {",
    "  font-size: 13px !important; line-height: 1.2 !important; font-weight: 600 !important;",
    "  letter-spacing: 0.08em !important; text-transform: uppercase;",
    "  color: rgba(255,255,255,0.55) !important; margin: 0 !important; padding: 0 !important;",
    "}",
    "#searchPage .searchSuggestions .sectionTitle::before { content: none !important; display: none !important; }",
    "#searchPage .searchSuggestionsList, #searchPage .searchSuggestions > div:last-child {",
    "  display: flex !important; flex-wrap: wrap; justify-content: center; gap: 8px;",
    "  padding: 0 !important;",
    "}",
    "#searchPage .searchSuggestions a, #searchPage .searchSuggestions .button-link {",
    "  display: inline-flex !important; align-items: center; height: 32px;",
    "  margin: 0 !important; padding: 0 14px !important;",
    "  border-radius: 999px;",
    "  background: rgba(255,255,255,0.07);",
    "  border: 1px solid rgba(255,255,255,0.12);",
    "  color: rgba(255,255,255,0.85) !important;",
    "  font-family: var(--app-font, Inter, sans-serif) !important;",
    "  font-size: 13px !important; font-weight: 500 !important;",
    "  text-decoration: none !important; white-space: nowrap;",
    "  transition: background-color 150ms ease, color 150ms ease;",
    "}",
    "#searchPage .searchSuggestions a:hover, #searchPage .searchSuggestions a:focus { background: rgba(255,255,255,0.16); color: #fff !important; }",

    /* ── Results: centred column, small grey headings, wrapping grid ── */
    "#searchPage #smart-search-results#smart-search-results, #searchPage .searchResults.searchResults {",
    "  max-width: 1290px !important; margin: 28px auto 0 !important; box-sizing: border-box;",
    "  padding-left: 16px !important; padding-right: 16px !important;",
    "}",
    "#searchPage .verticalSection { margin-bottom: 30px !important; }",
    "#searchPage .sectionTitleContainer { padding: 0 !important; margin: 0 0 12px !important; }",
    "#searchPage :is(#smart-search-results, .searchResults) .sectionTitle {",
    "  font-size: 17px !important; line-height: 1.3 !important; font-weight: 600 !important;",
    "  letter-spacing: -0.01em !important;",
    "  color: rgba(255,255,255,0.78) !important;",
    "  padding: 0 !important; margin: 0 !important;",
    "}",
    "#searchPage .sectionTitle::before, #searchPage .sectionTitle-cards::before { content: none !important; display: none !important; }",
    "#searchPage :is(.padded-left, .padded-right):not(.searchFields) { padding-left: 0 !important; padding-right: 0 !important; }",
    "#searchPage .searchFields.searchFields { padding-left: 16px !important; padding-right: 16px !important; }",
    "#searchPage .emby-scroller { overflow: visible !important; padding: 0 !important; margin: 0 !important; -webkit-mask-image: none !important; mask-image: none !important; }",
    "#searchPage .emby-scrollbuttons { display: none !important; }",
    "#searchPage .itemsContainer, #searchPage .scrollSlider {",
    "  display: flex !important; flex-wrap: wrap !important; white-space: normal !important;",
    "  gap: 18px; transform: none !important; width: auto !important;",
    "}",
    "#searchPage .itemsContainer > .card { margin: 0 !important; flex: 0 0 auto !important; }",
    /* sizes per card shape */
    "#searchPage .itemsContainer > .card:is(.portraitCard, .overflowPortraitCard) { width: clamp(118px, 12.5vw, 192px) !important; }",
    "#searchPage .itemsContainer > .card:is(.backdropCard, .overflowBackdropCard, .smallBackdropCard, .overflowSmallBackdropCard) { width: clamp(220px, 22vw, 320px) !important; }",
    "#searchPage .itemsContainer > .card:is(.squareCard, .overflowSquareCard) { width: clamp(118px, 12.5vw, 180px) !important; }",
    "#searchPage .cardBox { margin: 0 !important; }",
    /* titles hidden under posters (like the reference), kept for people & music */
    "#searchPage .card:not(.personCard):not([data-type='Person']):not(.squareCard):not(.overflowSquareCard) :is(.cardFooter, .sleekfin-meta, .cardText, .cardTextStack) { display: none !important; }",

    /* ── People: circles with names underneath ── */
    "#searchPage .itemsContainer > .card:is(.personCard, [data-type='Person']) { width: clamp(96px, 9.5vw, 142px) !important; }",
    "#searchPage .card:is(.personCard, [data-type='Person']) .cardPadder { padding-bottom: 100% !important; }",
    "#searchPage .card:is(.personCard, [data-type='Person']) .cardScalable,",
    "#searchPage .card:is(.personCard, [data-type='Person']) .cardImageContainer {",
    "  border-radius: 50% !important; clip-path: inset(0 round 50%) !important;",
    "}",
    "#searchPage .card:is(.personCard, [data-type='Person']) .cardFooter { display: block !important; text-align: center; }",
    "#searchPage .card:is(.personCard, [data-type='Person']) .cardText {",
    "  display: block !important; text-align: center !important;",
    "  font-size: 13px !important; font-weight: 600 !important; color: #fff !important;",
    "}",
    "#searchPage .card:is(.personCard, [data-type='Person']) .cardText-secondary { color: rgba(255,255,255,0.55) !important; font-weight: 500 !important; }",

    /* ── Empty state ── */
    "#searchPage .noItemsMessage { color: rgba(255,255,255,0.6) !important; text-align: center; margin-top: 40px; }",

    /* ── Phones ── */
    "@media (max-width: 599px) {",
    "  #searchPage .searchFields { padding-top: calc(var(--sleekfin-header-height, 80px) - 6px) !important; }",
    "  #searchPage .itemsContainer { gap: 12px; }",
    "  #searchPage .itemsContainer > .card:is(.portraitCard, .overflowPortraitCard) { width: calc((100% - 24px) / 3) !important; }",
    "  #searchPage .itemsContainer > .card:is(.backdropCard, .overflowBackdropCard, .smallBackdropCard, .overflowSmallBackdropCard) { width: calc((100% - 12px) / 2) !important; }",
    "  #searchPage .itemsContainer > .card:is(.personCard, [data-type='Person']) { width: calc((100% - 36px) / 4) !important; }",
    "}"
  ].join("\n");

  var style = document.createElement("style");
  style.id = "tb-search-restyle";
  style.textContent = css;
  document.head.appendChild(style);
})();

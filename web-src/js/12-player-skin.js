(function playerSkin() {
  // Player skin: clear-art logo top-left, thin gold scrubber, big centred play/pause.
  // Works by reading which item is being played from Jellyfin's own PlaybackInfo request.
  var SHOW_LINE = false;          // true = show "S2 \u00b7 E8 Episode name" under the logo
  var LOGO_CLASS = "tb-osd-logo";
  var ROOT_ON = "tb-osd-logo-on";

  var playingId = null;          // item id from the last PlaybackInfo / Playing call
  var shownId = null;            // item id currently rendered in the logo block
  var infoCache = new Map();     // itemId -> { logo, line, name }

  // ── 1. Find out what's playing ──
  var ID_RE = /\/Items\/([0-9a-f]{32})\/PlaybackInfo/i;
  function noteUrl(url) {
    var m = ID_RE.exec(url || "");
    if (m && m[1] !== playingId) { playingId = m[1]; schedule(); }
  }
  function noteBody(url, body) {
    if (!/\/Sessions\/Playing(\/Progress)?(\?|$)/i.test(url || "") || typeof body !== "string") return;
    try {
      var id = JSON.parse(body).ItemId;
      if (id && id !== playingId) { playingId = id; schedule(); }
    } catch (e) {}
  }
  if (window.fetch && !window.fetch.__tbPlayer) {
    var origFetch = window.fetch;
    var wrapped = function (input, init) {
      try {
        var url = typeof input === "string" ? input : (input && input.url);
        noteUrl(url);
        if (init && init.body) noteBody(url, init.body);
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };
    wrapped.__tbPlayer = true;
    window.fetch = wrapped;
  }
  // older clients use XHR
  var origOpen = XMLHttpRequest.prototype.open;
  var origSend = XMLHttpRequest.prototype.send;
  if (!origOpen.__tbPlayer) {
    XMLHttpRequest.prototype.open = function (method, url) {
      try { this.__tbUrl = url; noteUrl(url); } catch (e) {}
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.open.__tbPlayer = true;
    XMLHttpRequest.prototype.send = function (body) {
      try { noteBody(this.__tbUrl, body); } catch (e) {}
      return origSend.apply(this, arguments);
    };
  }

  // Fallback: ask the server what this device is playing (rate-limited)
  var lastAsk = 0;
  function askSession() {
    if (Date.now() - lastAsk < 5000) return;
    lastAsk = Date.now();
    try {
      Promise.resolve(ApiClient.getSessions({ deviceId: ApiClient.deviceId() })).then(function (list) {
        var s = (list || []).filter(function (x) { return x.NowPlayingItem; })[0];
        if (s && s.NowPlayingItem.Id && s.NowPlayingItem.Id !== playingId) { playingId = s.NowPlayingItem.Id; schedule(); }
      }).catch(function () {});
    } catch (e) {}
  }

  // ── 2. Logo + one info line for that item ──
  function logoUrl(item) {
    var ownerId = null, tag = null;
    if (item.ImageTags && item.ImageTags.Logo) { ownerId = item.Id; tag = item.ImageTags.Logo; }
    else if (item.ParentLogoItemId && item.ParentLogoImageTag) { ownerId = item.ParentLogoItemId; tag = item.ParentLogoImageTag; }
    if (!ownerId) return null;
    try { return ApiClient.getUrl("Items/" + ownerId + "/Images/Logo", { tag: tag, maxWidth: 700, quality: 90 }); }
    catch (e) { return null; }
  }
  function getInfo(id) {
    if (infoCache.has(id)) return Promise.resolve(infoCache.get(id));
    return Promise.resolve(ApiClient.getItem(ApiClient.getCurrentUserId(), id)).then(function (item) {
      var line = "";
      if (item.Type === "Episode") {
        var se = item.IndexNumber != null ? "S" + (item.ParentIndexNumber || 0) + " \u00b7 E" + item.IndexNumber : "";
        line = se + (item.Name ? (se ? "  " : "") + item.Name : "");
      } else if (item.ProductionYear) {
        line = String(item.ProductionYear);
      }
      var info = {
        logo: logoUrl(item),
        line: line,
        name: item.Type === "Episode" ? (item.SeriesName || item.Name) : item.Name
      };
      infoCache.set(id, info);
      return info;
    }).catch(function () { return null; });
  }

  // ── 3. Render into the player page ──
  function videoPage() {
    var p = document.getElementById("videoOsdPage");
    // (offsetParent is null inside fixed containers, so check layout boxes instead)
    return p && !p.classList.contains("hide") && p.getClientRects().length ? p : null;
  }

  function render(page, info) {
    var box = page.querySelector("." + LOGO_CLASS);
    if (!box) {
      box = document.createElement("div");
      box.className = LOGO_CLASS;
      box.setAttribute("aria-hidden", "true");
      page.appendChild(box);   // after .videoOsdBottom, so it can follow its show/hide state
    }
    box.innerHTML = "";
    if (!info) { document.documentElement.classList.remove(ROOT_ON); return; }
    if (info.logo) {
      var img = document.createElement("img");
      img.alt = "";
      img.onerror = function () { info.logo = null; render(page, info); };
      img.src = info.logo;
      box.appendChild(img);
    } else {
      var t = document.createElement("div");
      t.className = "tb-osd-name";
      t.textContent = info.name || "";
      box.appendChild(t);
    }
    if (SHOW_LINE && info.line) {
      var l = document.createElement("div");
      l.className = "tb-osd-line";
      l.textContent = info.line;
      box.appendChild(l);
    }
    document.documentElement.classList.add(ROOT_ON);
  }

  function update() {
    var page = videoPage();
    if (!page) {
      document.documentElement.classList.remove(ROOT_ON);
      shownId = null;
      return;
    }
    if (!window.ApiClient) return;
    if (!playingId) { askSession(); return; }
    if (shownId === playingId && page.querySelector("." + LOGO_CLASS)) return;
    var id = playingId;
    shownId = id;
    getInfo(id).then(function (info) {
      if (id !== playingId) return;
      var p = videoPage();
      if (p) render(p, info);
    });
  }

  // Shared with the Pause Screen script
  window.tbNowPlaying = function () { return playingId; };

  // Console check: type tbPlayerDebug() while a video is open
  window.tbPlayerDebug = function () { return { playingId: playingId, playerOpen: !!videoPage(), logoShown: !!document.querySelector("." + LOGO_CLASS + " img") }; };

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; update(); });
  }
  window.addEventListener("hashchange", schedule);
  // a once-a-second check only while the player is open (nothing at all otherwise)
  var vt = 0;
  function inPlayer() { var o = document.getElementById("videoOsdPage"); return /^#\/?video/i.test(location.hash) || !!(o && !o.classList.contains("hide")); }
  function track() {
    if (inPlayer()) { if (!vt) { vt = setInterval(schedule, 1000); schedule(); } }
    else if (vt) { clearInterval(vt); vt = 0; schedule(); }
  }
  window.addEventListener("hashchange", track);
  window.addEventListener("popstate", track);
  document.addEventListener("viewshow", track);
  if (window.tbAdded) window.tbAdded(track);
  track();

  // ── 4. Styles ──
  var X = ":not(#tb-x)";
  var P = "#videoOsdPage";
  var ACC = "var(--sleekfin-accent, rgb(232, 192, 80))";
  var css = [
    /* deeper, smoother shades top and bottom */
    P + " .videoOsdBottom" + X + " {",
    "  background: linear-gradient(0deg, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 38%, rgba(0,0,0,0) 100%) !important;",
    "  padding-top: 9em !important;",
    "}",
    ".skinHeader.osdHeader" + X + " {",
    "  background: linear-gradient(180deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 55%, rgba(0,0,0,0) 100%) !important;",
    "  height: 11em !important;",
    "}",
    /* the logo replaces the plain title in the top bar */
    "html." + ROOT_ON + " .pageTitle { display: none !important; }",
    /* no solid bar behind the back button while playing: soft shade only */
    "html." + ROOT_ON + " .skinHeader" + X + " {",
    "  background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%) !important;",
    "  box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important;",
    "}",

    /* logo block, top-left */
    "." + LOGO_CLASS + " {",
    "  position: fixed; z-index: 2; pointer-events: none;",
    "  top: 14px; left: 72px; z-index: 1001;",
    "  display: flex; flex-direction: column; align-items: flex-start; gap: 10px;",
    "  max-width: 30vw;",
    "  transition: opacity 300ms ease-out;",
    "}",
    "." + LOGO_CLASS + " img {",
    "  display: block; width: auto; height: auto;",
    "  max-width: 100%; max-height: 12vh;",
    "  object-fit: contain; object-position: left top;",
    "  filter: drop-shadow(0 2px 14px rgba(0,0,0,0.65));",
    "}",
    ".tb-osd-name {",
    "  font-family: var(--title-font, 'Bebas Neue', sans-serif);",
    "  font-size: 52px; line-height: 0.95; color: #fff;",
    "  text-shadow: 0 2px 14px rgba(0,0,0,0.6);",
    "}",
    ".tb-osd-line {",
    "  font-family: var(--app-font, Inter, sans-serif);",
    "  font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.85);",
    "  text-shadow: 0 1px 8px rgba(0,0,0,0.7);",
    "}",
    /* follow the controls: hide with them */
    ".videoOsdBottom-hidden ~ ." + LOGO_CLASS + ", .videoOsdBottom.hide ~ ." + LOGO_CLASS + " { opacity: 0; }",
    "@media (max-width: 600px) {",
    "  ." + LOGO_CLASS + " { top: 12px; left: 60px; max-width: 50vw; }",
    "  ." + LOGO_CLASS + " img { max-height: 56px; }",
    "  .tb-osd-line { font-size: 13px; }",
    "}",

    /* ── scrubber: thin, rounded, gold; grows on hover ── */
    P + " .mdl-slider-background-flex" + X + " {",
    "  height: 4px !important; margin-top: -2px !important;",
    "  border-radius: 4px; background: rgba(255,255,255,0.22) !important;",
    "  transition: height 150ms ease, margin-top 150ms ease;",
    "}",
    P + " .sliderContainer:hover .mdl-slider-background-flex" + X + ",",
    P + " .sliderContainer:focus-within .mdl-slider-background-flex" + X + " {",
    "  height: 8px !important; margin-top: -4px !important;",
    "}",
    P + " .mdl-slider-background-upper" + X + " { background: rgba(255,255,255,0.35) !important; }",
    P + " .sliderContainer .mdl-slider-background-lower:not(.mdl-slider-background-lower-clear)" + X + " {",
    "  background: " + ACC + " !important;",
    "}",
    P + " input.mdl-slider.osdPositionSlider" + X + "::-webkit-slider-thumb {",
    "  width: 16px !important; height: 16px !important; border: 0 !important;",
    "  background: " + ACC + " !important;",
    "  box-shadow: 0 0 0 4px rgba(0,0,0,0.25) !important;",
    "  transform: scale(0); transition: transform 150ms ease;",
    "}",
    P + " .sliderContainer:hover input.mdl-slider.osdPositionSlider" + X + "::-webkit-slider-thumb,",
    P + " input.mdl-slider.osdPositionSlider" + X + ":focus::-webkit-slider-thumb { transform: scale(1); }",
    P + " input.mdl-slider.osdPositionSlider" + X + "::-moz-range-thumb {",
    "  width: 16px !important; height: 16px !important; border: 0 !important;",
    "  background: " + ACC + " !important;",
    "}",
    P + " .sliderMarker.watched { background-color: " + ACC + " !important; }",
    /* scrub preview bubble */
    P + " .sliderBubble" + X + " {",
    "  background: rgba(12,12,14,0.92) !important; border-radius: 8px !important;",
    "  box-shadow: 0 8px 24px -8px rgba(0,0,0,0.8);",
    "}",

    /* times */
    P + " .osdPositionText, " + P + " .osdDurationText, " + P + " .endsAtText {",
    "  font-family: var(--app-font, Inter, sans-serif);",
    "  font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.85);",
    "  font-variant-numeric: tabular-nums;",
    "}",
    P + " .osdPositionText" + X + " { margin-right: 14px !important; }",
    P + " .osdDurationText" + X + " { margin-left: 14px !important; }",

    /* bottom row icons: clean white, subtle hover */
    P + " .videoOsdBottom .buttons .paper-icon-button-light:not(.btnPause):not(.btnRewind):not(.btnFastForward)" + X + " {",
    "  color: rgba(255,255,255,0.9); background: transparent !important; border: 0 !important;",
    "  box-shadow: none !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important;",
    "  transition: transform 120ms ease, color 120ms ease;",
    "}",
    "@media (hover: hover) {",
    "  " + P + " .videoOsdBottom .buttons .paper-icon-button-light:not(.btnPause):not(.btnRewind):not(.btnFastForward)" + X + ":hover { color: #fff; transform: scale(1.12); }",
    "}",

    /* ── big centred play/pause with rewind / forward either side ── */
    P + " .videoOsdBottom .btnPause" + X + " {",
    "  position: fixed !important; left: 50%; top: 50%;",
    "  width: 92px; height: 92px; margin: -46px 0 0 -46px !important; padding: 0 !important;",
    "  display: flex !important; align-items: center; justify-content: center;",
    "  border-radius: 50% !important;",
    "  background: rgba(0,0,0,0.38) !important;",
    "  border: 1px solid rgba(255,255,255,0.14) !important;",
    "}",
    P + " .videoOsdBottom .btnPause" + X + " .material-icons { font-size: 56px !important; }",
    P + " .videoOsdBottom .btnRewind" + X + ", " + P + " .videoOsdBottom .btnFastForward" + X + " {",
    "  position: fixed !important; top: 50%;",
    "  width: 64px; height: 64px; margin: -32px 0 0 -32px !important; padding: 0 !important;",
    "  display: flex; align-items: center; justify-content: center;",
    "  border-radius: 50% !important;",
    "}",
    P + " .videoOsdBottom .btnRewind" + X + " { left: calc(50% - 150px); }",
    P + " .videoOsdBottom .btnFastForward" + X + " { left: calc(50% + 150px); }",
    P + " .videoOsdBottom .btnRewind" + X + " .material-icons, " + P + " .videoOsdBottom .btnFastForward" + X + " .material-icons { font-size: 40px !important; }",
    "@media (hover: hover) {",
    "  " + P + " .videoOsdBottom .btnPause" + X + ":hover { transform: scale(1.06); background: rgba(0,0,0,0.5) !important; }",
    "}",
    /* TV remote focus */
    P + " .videoOsdBottom .btnPause" + X + ":focus, " + P + " .videoOsdBottom .btnRewind" + X + ":focus, " + P + " .videoOsdBottom .btnFastForward" + X + ":focus {",
    "  outline: none; box-shadow: 0 0 0 3px " + ACC + " !important;",
    "}",
    /* phones: smaller centre button */
    "@media (max-width: 600px) {",
    "  " + P + " .videoOsdBottom .btnPause" + X + " { width: 72px; height: 72px; margin: -36px 0 0 -36px !important; }",
    "  " + P + " .videoOsdBottom .btnPause" + X + " .material-icons { font-size: 44px !important; }",
    "}"
  ].join("\n");

  var style = document.createElement("style");
  style.id = "tb-player-skin";
  style.textContent = css;
  tbCss(style);
})();

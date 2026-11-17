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
  if (window.tbOnRequest) {
    window.tbOnRequest(function (url, method, body) {
      noteUrl(url);
      if (body) noteBody(url, typeof body === "string" ? body : null);
    });
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
  var ACC = "var(--ue-accent, rgb(232, 192, 80))";
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

  // ── Floating glass dock (setting: Features > Player > Player bar style) ──
  // The controls sit in one frosted, rounded panel floating above the bottom of the picture:
  // time + progress on top; volume, subtitles, audio, episodes on the left; previous, back 10, a big white
  // play / pause, forward, next in the middle; settings, picture-in-picture, full screen on the right.
  // "Ends at" floats above the dock as a small pill. Desktop and laptop sizes only: phones and TVs keep the
  // layout above.
  if (tbCfg("PlayerDock", true) !== false) {
    document.documentElement.classList.add("tb-dock");
    var D = "html.tb-dock:not(.layout-tv) " + P;
    var B = D + " .videoOsdBottom .buttons";
    var GLASS = "background: rgba(255,255,255,0.11) !important; -webkit-backdrop-filter: blur(26px) saturate(1.6); backdrop-filter: blur(26px) saturate(1.6);" +
      " border: 1px solid rgba(255,255,255,0.2); box-shadow: 0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.22);";
    css += "\n" + [
      "@media (min-width: 901px) {",
      // the shade behind is lighter: the dock carries the contrast itself
      "  " + D + " .videoOsdBottom" + X + " { background: linear-gradient(0deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 100%) !important; padding-top: 6em !important; padding-bottom: 34px !important; }",
      "  " + D + " .osdControls" + X + " { position: relative; flex: 0 1 1060px; max-width: calc(100% - 64px); padding: 16px 26px 14px !important; border-radius: 30px; " + GLASS +
        " transition: transform .3s cubic-bezier(.2,.8,.2,1); }",
      "  " + D + " .videoOsdBottom-hidden .osdControls" + X + " { transform: translateY(18px); }",
      // the title is shown top left (logo), not inside the dock
      "  " + D + " .osdTitle" + X + ", " + D + " .osdSecondaryMediaInfo" + X + " { display: none !important; }",
      "  " + D + " .osdMainTextContainer" + X + " { margin: 0 !important; padding: 0 !important; min-height: 0; }",
      "  " + D + " .osdMainTextContainer:not(:has(.osdMediaStatus:not(.hide)))" + X + " { display: none !important; }",
      "  " + D + " .osdPositionText" + X + ", " + D + " .osdDurationText" + X + " { margin-bottom: 0 !important; min-width: 58px; font-size: 13px; }",
      "  " + D + " .osdDurationText" + X + " { justify-content: flex-end; }",
      // the button row: left group, centred transport, right group
      "  " + B + X + " { min-height: 64px; padding: 6px 0 0 !important; flex-wrap: nowrap !important; gap: 4px; }",
      "  " + B + " .volumeButtons" + X + " { order: 1; margin: 0 4px 0 0 !important; }",
      "  " + B + " .osdVolumeSliderContainer" + X + " { width: 5.5em; flex-grow: 0; }",
      "  " + B + " .btnSubtitles" + X + " { order: 2; }",
      "  " + B + " .btnAudio" + X + " { order: 3; }",
      "  " + B + " .tb-pep-btn" + X + " { order: 4; }",
      "  " + B + " .btnUserRating" + X + " { order: 5; }",
      "  " + B + " .btnVideoOsdSettings" + X + " { order: 20; }",
      "  " + B + " .btnAirPlay" + X + " { order: 21; }",
      "  " + B + " .btnPip" + X + " { order: 22; }",
      "  " + B + " .btnFullscreen" + X + " { order: 23; }",
      "  " + B + " > div[dir='ltr']" + X + " { position: absolute; left: 50%; bottom: 14px; height: 64px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; }",
      // round icon buttons with a soft hover disc
      "  " + B + " .paper-icon-button-light:not(.btnPause):not(.btnRewind):not(.btnFastForward)" + X + " {",
      "    width: 46px; height: 46px; padding: 0 !important; margin: 0 !important; border-radius: 50% !important; display: inline-flex; align-items: center; justify-content: center;",
      "    transition: background-color .15s ease, transform .12s ease !important;",
      "  }",
      "  " + B + " .paper-icon-button-light.hide" + X + " { display: none !important; }",
      "  " + B + " .paper-icon-button-light .material-icons" + X + " { font-size: 26px !important; }",
      "  " + B + " .paper-icon-button-light.btnVideoOsdSettings.btnVideoOsdSettings:not(.btnPause):not(.btnRewind)" + X + " { margin-left: auto !important; }",
      "  " + B + " .paper-icon-button-light:not(.btnPause):not(.btnRewind):not(.btnFastForward)" + X + ":hover { background: rgba(255,255,255,0.14) !important; transform: none; }",
      "  " + B + " .paper-icon-button-light" + X + ":active { transform: scale(.92) !important; }",
      // play / pause: a solid white disc in the middle; back / forward 10 beside it
      "  " + D + " .videoOsdBottom .btnPause" + X + " { position: static !important; width: 64px; height: 64px; margin: 0 6px !important; background: #fff !important; color: #0b0b0b !important; border: 0 !important;",
      "    box-shadow: 0 8px 24px rgba(0,0,0,0.35); }",
      "  " + B + " .btnPause.paper-icon-button-light" + X + " .material-icons { font-size: 38px !important; color: #0b0b0b !important; }",
      "  " + D + " .videoOsdBottom .btnPause" + X + ":hover { transform: scale(1.06); background: #fff !important; }",
      "  " + D + " .videoOsdBottom .btnRewind" + X + ", " + D + " .videoOsdBottom .btnFastForward" + X + " { position: static !important; width: 48px; height: 48px; margin: 0 !important; }",
      "  " + B + " .btnRewind.paper-icon-button-light" + X + " .material-icons, " + B + " .btnFastForward.paper-icon-button-light" + X + " .material-icons { font-size: 30px !important; }",
      "  " + D + " .videoOsdBottom .btnRewind" + X + ":hover, " + D + " .videoOsdBottom .btnFastForward" + X + ":hover { background: rgba(255,255,255,0.14) !important; }",
      "  " + D + " .videoOsdBottom .btnPause" + X + ":focus-visible, " + B + " .paper-icon-button-light" + X + ":focus-visible { outline: none; box-shadow: 0 0 0 3px " + ACC + " !important; }",
      // "Ends at 9:42 pm" as a little glass pill above the dock
      "  " + B + " .osdTimeText" + X + " { position: absolute; left: 50%; bottom: calc(100% + 12px); transform: translateX(-50%); margin: 0 !important; pointer-events: none; }",
      "  " + B + " .endsAtText" + X + " { display: inline-block !important; padding: 7px 15px; border-radius: 18px; white-space: nowrap; font-size: 13px; " + GLASS + " }",
      "  " + B + " .endsAtText:empty" + X + " { display: none !important; }",
      // the back button: a glass circle to match
      "  html.tb-dock:not(.layout-tv) .osdHeader .headerBackButton" + X + " { width: 52px; height: 52px; border-radius: 50% !important; " + GLASS + " }",
      "  html.tb-dock:not(.layout-tv) ." + LOGO_CLASS + " { left: 88px; top: 18px; }",
      // Skip Intro / Next sits above the dock instead of behind it
      "  html.tb-dock:not(.layout-tv) .skip-button-container { --skip-btn-bottom: 12.5em; }",
      "  html.tb-dock:not(.layout-tv) body:has(.videoOsdBottom-hidden) .skip-button-container { transform: translateY(8em); }",
      "}"
    ].join("\n");
  }

  var style = document.createElement("style");
  style.id = "tb-player-skin";
  style.textContent = css;
  tbCss(style);
})();

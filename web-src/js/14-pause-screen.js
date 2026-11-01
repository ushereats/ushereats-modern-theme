(function pauseScreen() {
  // Standalone pause screen (replaces Jellyfin Enhanced's).
  // Pause a video and leave it for a few seconds: logo, details, plot, progress, disc art.
  // Click / tap / Space / Enter resumes. The X (or Back / Esc) closes it for this pause.

  // ── Settings ──
  var STYLE = tbCfg("PauseStyle", "netflix");        // "netflix" = see-through over the video, "full" = blurred backdrop + disc
  var DELAY_SECONDS = tbCfg("PauseDelaySeconds", 0);        // idle time after pausing before it shows (0 = instant)
  var SHOW_DISC = true;         // "full" style only: spinning disc art on the right

  var ACC = "var(--sleekfin-accent, rgb(232, 192, 80))";
  var ROOT_CLASS = "tb-paused";

  var video = null, itemId = null, info = null, infoFor = null;
  var timer = null, lastInteraction = Date.now(), dismissed = false, visible = false;
  var prevFocus = null;
  var cache = new Map();

  // ── Which item is playing ──
  // 1) the Player Skin script, if installed  2) the video URL  3) ask the server
  var ID_IN_SRC = /\/(?:Videos|Items)\/([0-9a-f]{32})\//i;
  var sessionId = null, lastAsk = 0;
  function currentId() {
    if (typeof window.tbNowPlaying === "function") {
      var a = window.tbNowPlaying();
      if (a) return a;
    }
    var m = video && ID_IN_SRC.exec(video.currentSrc || video.src || "");
    if (m) return m[1];
    return sessionId;
  }
  function askSession() {
    if (Date.now() - lastAsk < 4000 || !window.ApiClient) return Promise.resolve();
    lastAsk = Date.now();
    try {
      return Promise.resolve(ApiClient.getSessions({ deviceId: ApiClient.deviceId() })).then(function (list) {
        var s = (list || []).filter(function (x) { return x.NowPlayingItem; })[0];
        sessionId = s ? s.NowPlayingItem.Id : null;
      }).catch(function () {});
    } catch (e) { return Promise.resolve(); }
  }

  // ── Item details ──
  function img(ownerId, type, tag, width) {
    if (!ownerId || !tag) return null;
    try { return ApiClient.getUrl("Items/" + ownerId + "/Images/" + type, { tag: tag, maxWidth: width, quality: 90 }); }
    catch (e) { return null; }
  }
  function runtime(ticks) {
    if (!ticks) return "";
    var mins = Math.floor(ticks / 600000000), h = Math.floor(mins / 60), m = mins % 60;
    return h ? h + "h " + m + "m" : m + "m";
  }
  function loadInfo(id) {
    if (cache.has(id)) return Promise.resolve(cache.get(id));
    return Promise.resolve(ApiClient.getItem(ApiClient.getCurrentUserId(), id)).then(function (item) {
      var isEp = item.Type === "Episode";
      var logo = item.ImageTags && item.ImageTags.Logo
        ? img(item.Id, "Logo", item.ImageTags.Logo, 900)
        : img(item.ParentLogoItemId, "Logo", item.ParentLogoImageTag, 900);
      var backdrop = item.BackdropImageTags && item.BackdropImageTags.length
        ? img(item.Id, "Backdrop/0", item.BackdropImageTags[0], 1920)
        : (item.ParentBackdropImageTags && item.ParentBackdropImageTags.length
          ? img(item.ParentBackdropItemId, "Backdrop/0", item.ParentBackdropImageTags[0], 1920) : null);
      var disc = item.ImageTags && item.ImageTags.Disc ? img(item.Id, "Disc", item.ImageTags.Disc, 800) : null;
      var data = {
        title: isEp ? (item.SeriesName || item.Name) : item.Name,
        season: isEp && item.IndexNumber != null
          ? "Season " + (item.ParentIndexNumber || 0) + ": Ep. " + item.IndexNumber : "",
        epName: isEp ? (item.Name || "") : "",
        episode: isEp && item.IndexNumber != null
          ? "S" + (item.ParentIndexNumber || 0) + " \u00b7 E" + item.IndexNumber + (item.Name ? "  " + item.Name : "")
          : "",
        year: item.ProductionYear || "",
        rating: item.OfficialRating || "",
        runtime: runtime(item.RunTimeTicks),
        community: typeof item.CommunityRating === "number" ? item.CommunityRating.toFixed(1) : "",
        plot: item.Overview || "",
        logo: logo, backdrop: backdrop, disc: disc
      };
      cache.set(id, data);
      return data;
    }).catch(function () { return null; });
  }

  // ── Overlay DOM ──
  var epNameEl, overlay, bg, logoEl, titleEl, epEl, detailsEl, plotEl, fillEl, metaEl, discEl, closeBtn;
  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }
  function build() {
    if (overlay) return;
    overlay = el("div", "", document.body);
    overlay.id = "tb-pause";
    if (STYLE === "netflix") overlay.className = "tb-ps-netflix";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-hidden", "true");
    overlay.tabIndex = -1;
    bg = el("div", "tb-ps-bg", overlay);
    el("div", "tb-ps-shade", overlay);
    discEl = el("img", "tb-ps-disc", overlay);
    discEl.alt = "";
    var col = el("div", "tb-ps-col", overlay);
    el("div", "tb-ps-eyebrow", col).textContent = STYLE === "netflix" ? "You're watching" : "Paused";
    logoEl = el("img", "tb-ps-logo", col);
    logoEl.alt = "";
    titleEl = el("div", "tb-ps-title", col);
    epEl = el("div", "tb-ps-ep", col);
    epNameEl = el("div", "tb-ps-epname", col);
    detailsEl = el("div", "tb-ps-details", col);
    plotEl = el("div", "tb-ps-plot", col);
    var prog = el("div", "tb-ps-progress", col);
    var bar = el("div", "tb-ps-bar", prog);
    fillEl = el("span", "", bar);
    metaEl = el("div", "tb-ps-meta", prog);
    el("div", "tb-ps-hint", col).textContent = "Press play or click anywhere to resume";
    el("div", "tb-ps-corner", overlay).textContent = "Paused";
    closeBtn = el("button", "tb-ps-close", overlay);
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';

    closeBtn.addEventListener("click", function (e) { e.stopPropagation(); hide(true); });
    overlay.addEventListener("click", function (e) {
      if (e.target === closeBtn || closeBtn.contains(e.target)) return;
      resume();
    });
    logoEl.onerror = function () { logoEl.removeAttribute("src"); overlay.classList.remove("tb-ps-has-logo"); };
    discEl.onerror = function () { discEl.removeAttribute("src"); };
  }

  function fill(d) {
    build();
    bg.style.backgroundImage = d && d.backdrop ? 'url("' + d.backdrop + '")' : "";
    if (d && d.logo) { logoEl.src = d.logo; overlay.classList.add("tb-ps-has-logo"); }
    else { logoEl.removeAttribute("src"); overlay.classList.remove("tb-ps-has-logo"); }
    titleEl.textContent = d ? d.title : "";
    var nf = STYLE === "netflix";
    epEl.textContent = d ? (nf ? d.season : d.episode) : "";
    epNameEl.textContent = d && nf ? d.epName : "";
    detailsEl.innerHTML = "";
    if (d) {
      [d.year, d.rating, d.runtime].forEach(function (v, i) {
        if (!v) return;
        var s = el("span", i === 1 ? "tb-ps-chip" : "", detailsEl);
        s.textContent = String(v);
      });
      if (d.community) {
        var r = el("span", "tb-ps-star", detailsEl);
        r.textContent = "\u2605 " + d.community;
      }
    }
    plotEl.textContent = d ? d.plot : "";
    if (STYLE !== "netflix" && SHOW_DISC && d && d.disc) discEl.src = d.disc; else discEl.removeAttribute("src");
  }

  function clock(sec) {
    if (!isFinite(sec) || sec <= 0) return "0:00";
    var s = Math.floor(sec % 60), m = Math.floor(sec / 60) % 60, h = Math.floor(sec / 3600);
    var ss = (s < 10 ? "0" : "") + s;
    return h ? h + ":" + (m < 10 ? "0" : "") + m + ":" + ss : m + ":" + ss;
  }
  function progress() {
    if (!video || !fillEl) return;
    var cur = isFinite(video.currentTime) ? video.currentTime : 0;
    var dur = isFinite(video.duration) ? video.duration : 0;
    var pct = dur > 0 ? Math.max(0, Math.min(100, cur / dur * 100)) : 0;
    fillEl.style.width = pct + "%";
    var parts = [clock(cur) + " / " + clock(dur), Math.round(pct) + "% watched"];
    if (dur > cur) {
      var end = new Date(Date.now() + (dur - cur) * 1000);
      parts.push("Ends at " + end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
    }
    metaEl.textContent = parts.join("   \u00b7   ");
  }

  // ── Show / hide ──
  function show() {
    if (!video || !video.paused || video.ended || dismissed || visible) return;
    var id = currentId();
    if (!id) { askSession().then(function () { if (currentId()) show(); }); return; }
    var go = function (d) {
      if (!video || !video.paused || dismissed) return;
      if (infoFor !== id) { fill(d); infoFor = id; }
      progress();
      visible = true;
      prevFocus = document.activeElement;
      document.documentElement.classList.add(ROOT_CLASS);
      overlay.setAttribute("aria-hidden", "false");
      try { overlay.focus(); } catch (e) {}
    };
    if (infoFor === id) go(info);
    else loadInfo(id).then(function (d) { info = d; go(d); });
  }
  function hide(byUser) {
    if (byUser) dismissed = true;
    if (!visible) return;
    visible = false;
    document.documentElement.classList.remove(ROOT_CLASS);
    if (overlay) overlay.setAttribute("aria-hidden", "true");
    if (prevFocus && document.contains(prevFocus)) { try { prevFocus.focus(); } catch (e) {} }
  }
  function resume() {
    hide(false);
    if (video && video.paused) {
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
  }

  function schedule() {
    clearTimeout(timer);
    if (!video || !video.paused || video.ended || dismissed) return;
    var wait = DELAY_SECONDS * 1000 - (Date.now() - lastInteraction);
    timer = setTimeout(function () {
      if (Date.now() - lastInteraction >= DELAY_SECONDS * 1000 - 50) show(); else schedule();
    }, Math.max(100, wait));
  }

  // ── Video tracking ──
  function onPause() {
    if (video.ended) return;
    dismissed = false;
    lastInteraction = Date.now();
    var id = currentId();
    if (id && infoFor !== id) loadInfo(id).then(function (d) { info = d; fill(d); infoFor = id; });
    if (!id) askSession();
    schedule();
  }
  function onPlay() { clearTimeout(timer); hide(false); }
  function onSource() { clearTimeout(timer); hide(false); infoFor = null; info = null; sessionId = null; }

  function attach(v) {
    if (video) {
      video.removeEventListener("pause", onPause);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("loadstart", onSource);
    }
    video = v;
    if (!v) { onSource(); return; }
    v.addEventListener("pause", onPause);
    v.addEventListener("play", onPlay);
    v.addEventListener("loadstart", onSource);
  }
  // follow the player's video element: checked when the page changes, and once a second only while a video is open
  function follow() {
    var v = document.querySelector(".videoPlayerContainer video, video.htmlvideoplayer");
    if (v !== video) attach(v || null);
  }
  var ft = 0;
  function track() {
    var o = document.getElementById("videoOsdPage"), open = /^#\/?video/i.test(location.hash) || !!(o && !o.classList.contains("hide"));
    if (open && !ft) ft = setInterval(follow, 1000);
    else if (!open && ft) { clearInterval(ft); ft = 0; }
    follow();
  }
  window.addEventListener("hashchange", track);
  window.addEventListener("popstate", track);
  document.addEventListener("viewshow", track);
  if (window.tbAdded) window.tbAdded(track);
  track();

  // Any activity resets the idle timer (mouse needs to move more than a few pixels)
  function touch() {
    lastInteraction = Date.now();
    if (!visible) schedule();
  }
  ["mousedown", "touchstart", "wheel"].forEach(function (ev) {
    document.addEventListener(ev, touch, { passive: true });
  });
  var lx = null, ly = null;
  document.addEventListener("mousemove", function (e) {
    if (lx !== null && Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) > 15) touch();
    lx = e.clientX; ly = e.clientY;
  }, { passive: true });

  document.addEventListener("keydown", function (e) {
    if (!visible) { touch(); return; }
    var k = e.key, c = e.keyCode;
    var stop = function () { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); };
    if (k === "Escape" || k === "BrowserBack" || k === "GoBack" || c === 10009 || c === 461 || c === 27) {
      stop(); hide(true); return;
    }
    if ((k === "Enter" || c === 13) && document.activeElement === closeBtn) { stop(); hide(true); return; }
    if (k === " " || k === "Spacebar" || k === "Enter" || k === "MediaPlayPause" || k === "MediaPlay" || c === 13 || c === 32 || c === 415 || c === 179) {
      stop(); resume(); return;
    }
    if (k === "ArrowUp" || k === "ArrowRight" || c === 38 || c === 39) { stop(); closeBtn.focus(); return; }
    if (k === "ArrowDown" || k === "ArrowLeft" || c === 40 || c === 37) { stop(); overlay.focus(); return; }
  }, true);

  // ── Styles ──
  var css = [
    "#tb-pause { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 99; display: none;",
    "  color: #fff; overflow: hidden; outline: none; cursor: pointer;",
    "  font-family: var(--app-font, Inter, sans-serif);",
    "  background: rgba(4, 4, 5, 0.82); }",
    "@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {",
    "  #tb-pause { background: rgba(4, 4, 5, 0.55); -webkit-backdrop-filter: blur(26px) brightness(0.6); backdrop-filter: blur(26px) brightness(0.6); }",
    "}",
    "#tb-pause[aria-hidden='false'] { display: block; animation: tbPsIn 380ms ease both; }",
    "@keyframes tbPsIn { from { opacity: 0; } to { opacity: 1; } }",
    "#tb-pause .tb-ps-bg { position: absolute; top: 0; right: 0; bottom: 0; left: 0;",
    "  background-size: cover; background-position: center; opacity: 0.32; }",
    "#tb-pause .tb-ps-shade { position: absolute; top: 0; right: 0; bottom: 0; left: 0;",
    "  background: linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.1) 100%),",
    "              linear-gradient(0deg, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 40%); }",

    /* left column */
    "#tb-pause .tb-ps-col { position: absolute; left: 7vw; top: 50%; width: 48vw; max-width: 760px;",
    "  transform: translateY(-50%); display: flex; flex-direction: column; align-items: flex-start; }",
    "#tb-pause[aria-hidden='false'] .tb-ps-col > * { animation: tbPsUp 600ms cubic-bezier(.2,.8,.2,1) both; }",
    "#tb-pause .tb-ps-col > *:nth-child(2) { animation-delay: 60ms; }",
    "#tb-pause .tb-ps-col > *:nth-child(n+4) { animation-delay: 120ms; }",
    "@keyframes tbPsUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }",
    "#tb-pause .tb-ps-eyebrow { font-family: var(--title-font, 'Bebas Neue', sans-serif); font-size: 20px;",
    "  letter-spacing: 0.32em; color: " + ACC + "; margin-bottom: 18px; }",
    "#tb-pause .tb-ps-logo { display: none; max-width: 38vw; max-height: 20vh; width: auto; height: auto;",
    "  object-fit: contain; object-position: left center; filter: drop-shadow(0 4px 24px rgba(0,0,0,0.6)); }",
    "#tb-pause.tb-ps-has-logo .tb-ps-logo { display: block; }",
    "#tb-pause .tb-ps-title { font-family: var(--title-font, 'Bebas Neue', sans-serif); font-size: 84px;",
    "  line-height: 0.92; letter-spacing: 0.01em; }",
    "#tb-pause.tb-ps-has-logo .tb-ps-title { display: none; }",
    "#tb-pause .tb-ps-ep { margin-top: 20px; font-size: 20px; font-weight: 700; }",
    "#tb-pause .tb-ps-ep:empty { display: none; }",
    "#tb-pause .tb-ps-details { display: flex; flex-wrap: wrap; align-items: center; gap: 16px;",
    "  margin-top: 14px; font-size: 16px; font-weight: 600; color: rgba(255,255,255,0.78); }",
    "#tb-pause .tb-ps-chip { padding: 2px 8px; border: 1px solid rgba(255,255,255,0.45); border-radius: 5px; font-size: 13px; }",
    "#tb-pause .tb-ps-star { color: #fff; }",
    "#tb-pause .tb-ps-plot { margin-top: 18px; font-size: 17px; line-height: 1.6; color: rgba(255,255,255,0.82);",
    "  display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }",
    "#tb-pause .tb-ps-plot:empty { display: none; }",
    "#tb-pause .tb-ps-progress { width: 100%; max-width: 560px; margin-top: 32px; }",
    "#tb-pause .tb-ps-bar { height: 4px; border-radius: 4px; background: rgba(255,255,255,0.2); overflow: hidden; }",
    "#tb-pause .tb-ps-bar > span { display: block; height: 100%; width: 0; background: " + ACC + "; border-radius: 4px; }",
    "#tb-pause .tb-ps-meta { margin-top: 10px; font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.7);",
    "  white-space: pre; font-variant-numeric: tabular-nums; }",
    "#tb-pause .tb-ps-hint { margin-top: 26px; font-size: 12px; font-weight: 600; letter-spacing: 0.14em;",
    "  text-transform: uppercase; color: rgba(255,255,255,0.4); }",

    /* disc */
    "#tb-pause .tb-ps-disc { position: absolute; right: 5vw; top: 50%; width: 30vw; max-width: 520px; height: auto;",
    "  margin-top: -15vw; filter: drop-shadow(0 20px 50px rgba(0,0,0,0.7)) brightness(0.9);",
    "  animation: tbPsSpin 60s linear infinite; }",
    "#tb-pause .tb-ps-disc:not([src]) { display: none; }",
    "@keyframes tbPsSpin { to { transform: rotate(360deg); } }",

    /* close */
    "#tb-pause .tb-ps-close { position: absolute; top: 22px; right: 26px; width: 46px; height: 46px; padding: 0;",
    "  display: flex; align-items: center; justify-content: center; cursor: pointer;",
    "  border-radius: 50%; border: 1px solid rgba(255,255,255,0.22); background: rgba(0,0,0,0.35); color: #fff;",
    "  transition: background 150ms ease, transform 150ms ease; }",
    "#tb-pause .tb-ps-close svg { width: 20px; height: 20px; }",
    "#tb-pause .tb-ps-close:hover { background: rgba(255,255,255,0.14); transform: scale(1.06); }",
    "#tb-pause .tb-ps-close:focus { outline: none; box-shadow: 0 0 0 2px " + ACC + "; }",

    /* player chrome while paused: hide controls + our player logo, keep the back button */
    "html." + ROOT_CLASS + " .videoOsdBottom { opacity: 0 !important; pointer-events: none !important; }",
    "html." + ROOT_CLASS + " .tb-osd-logo { opacity: 0 !important; }",
    "html." + ROOT_CLASS + " .skinHeader { z-index: 100 !important; background: transparent !important; }",
    "html." + ROOT_CLASS + " .skinHeader .headerRight, html." + ROOT_CLASS + " .skinHeader .pageTitle { visibility: hidden !important; }",

    /* phones */
    "@media (max-width: 768px) {",
    "  #tb-pause .tb-ps-col { left: 6vw; width: 88vw; }",
    "  #tb-pause .tb-ps-logo { max-width: 70vw; max-height: 14vh; }",
    "  #tb-pause .tb-ps-title { font-size: 56px; }",
    "  #tb-pause .tb-ps-plot { font-size: 15px; -webkit-line-clamp: 5; }",
    "  #tb-pause .tb-ps-disc { display: none; }",
    "  #tb-pause .tb-ps-meta { white-space: normal; }",
    "}",
    /* ── Netflix style: no blur, the paused video stays visible behind a left-side shade ── */
    "#tb-pause .tb-ps-corner, #tb-pause .tb-ps-epname { display: none; }",
    "#tb-pause.tb-ps-netflix { background: transparent !important; -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }",
    "#tb-pause.tb-ps-netflix[aria-hidden='false'] { animation: tbPsIn 150ms ease both; }",
    "#tb-pause.tb-ps-netflix[aria-hidden='false'] .tb-ps-col > * { animation: none; }",
    "#tb-pause.tb-ps-netflix .tb-ps-bg, #tb-pause.tb-ps-netflix .tb-ps-disc,",
    "#tb-pause.tb-ps-netflix .tb-ps-progress, #tb-pause.tb-ps-netflix .tb-ps-hint { display: none !important; }",
    "#tb-pause.tb-ps-netflix .tb-ps-shade {",
    "  background: linear-gradient(90deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.6) 30%, rgba(0,0,0,0.15) 60%, rgba(0,0,0,0) 75%); }",
    "#tb-pause.tb-ps-netflix .tb-ps-col { left: 6vw; width: 42vw; max-width: 680px; }",
    "#tb-pause.tb-ps-netflix .tb-ps-eyebrow { font-family: var(--app-font, Inter, sans-serif);",
    "  font-size: 18px; letter-spacing: 0; color: rgba(255,255,255,0.65); margin-bottom: 14px; }",
    "#tb-pause.tb-ps-netflix .tb-ps-logo { max-width: 34vw; max-height: 18vh; }",
    "#tb-pause.tb-ps-netflix .tb-ps-ep { margin-top: 22px; font-size: 18px; font-weight: 500; color: rgba(255,255,255,0.8); }",
    "#tb-pause.tb-ps-netflix .tb-ps-epname { display: block; margin-top: 6px; font-size: 24px; font-weight: 700; }",
    "#tb-pause.tb-ps-netflix .tb-ps-epname:empty { display: none; }",
    "#tb-pause.tb-ps-netflix .tb-ps-details { margin-top: 12px; font-size: 15px; }",
    "#tb-pause.tb-ps-netflix .tb-ps-plot { font-size: 17px; color: rgba(255,255,255,0.75); -webkit-line-clamp: 5; }",
    "#tb-pause.tb-ps-netflix .tb-ps-corner { display: block; position: absolute; right: 5vw; bottom: 7vh;",
    "  font-size: 26px; font-weight: 600; color: rgba(255,255,255,0.55); }",
    "#tb-pause.tb-ps-netflix .tb-ps-close { background: transparent; border-color: rgba(255,255,255,0.3); }",
    "@media (max-width: 768px) {",
    "  #tb-pause.tb-ps-netflix .tb-ps-shade { background: linear-gradient(90deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 70%, rgba(0,0,0,0.3) 100%); }",
    "  #tb-pause.tb-ps-netflix .tb-ps-col { width: 88vw; }",
    "  #tb-pause.tb-ps-netflix .tb-ps-corner { bottom: 4vh; font-size: 18px; }",
    "}",
    "@media (prefers-reduced-motion: reduce) {",
    "  #tb-pause .tb-ps-disc, #tb-pause .tb-ps-col > * { animation: none !important; }",
    "}"
  ].join("\n");
  var style = document.createElement("style");
  style.id = "tb-pause-style";
  style.textContent = css;
  tbCss(style);
})();

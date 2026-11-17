(function tbPlayerEpisodes() {
  // Episodes inside the video player (setting: Features > Player > Episodes in the player).
  // An Episodes button in the player's bottom bar opens the show's episodes in a panel on the right:
  // season picker, stills, progress, the one playing marked. Clicking an episode plays it straight away
  // (through Jellyfin's own play / resume action, so it behaves like playing from anywhere else).
  if (window.__tbPlayerEps) return;
  window.__tbPlayerEps = true;
  var html = document.documentElement;
  var playing = null;        // { id, seriesId, seasonId, name } of the episode playing
  var askedAt = 0, asking = false, panel = null, gen = 0;

  function api() { return window.ApiClient || null; }
  function uid() { try { return api().getCurrentUserId(); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
  if (base.charAt(base.length - 1) !== "/") base += "/";
  function imgUrl(id, type, tag, q) { return base + "Items/" + id + "/Images/" + type + "?" + q + "&quality=85" + (window.__tbImgFmt || "") + "&tag=" + encodeURIComponent(tag); }
  function runtime(ticks) {
    var m = Math.round((ticks || 0) / 600000000);
    if (!m) return "";
    return m >= 60 ? Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + "m";
  }
  function upgrade(node) {
    if (window.tbCards && window.tbCards.upgrade) return window.tbCards.upgrade(node);
    if (window.CustomElements && typeof window.CustomElements.upgradeSubtree === "function") { try { window.CustomElements.upgradeSubtree(node); } catch (e) {} }
  }

  function videoPage() {
    var p = document.getElementById("videoOsdPage");
    return p && !p.classList.contains("hide") && p.getClientRects().length ? p : null;
  }

  // ── what's playing ──
  function playingId(cb) {
    var id = window.tbNowPlaying ? window.tbNowPlaying() : null;
    if (id) return cb(id);
    if (asking || Date.now() - askedAt < 5000) return;
    asking = true; askedAt = Date.now();
    var a = api();
    Promise.resolve(a.getSessions({ deviceId: a.deviceId() })).then(function (list) {
      asking = false;
      var s = (list || []).filter(function (x) { return x.NowPlayingItem; })[0];
      if (s) cb(s.NowPlayingItem.Id);
    }, function () { asking = false; });
  }
  var infoFor = {};
  function lookUp(id) {
    if (playing && playing.id === id) return;
    if (id in infoFor) { if (infoFor[id]) playing = infoFor[id]; return; }   // known, or being looked up
    infoFor[id] = null;
    Promise.resolve(api().getItem(uid(), id)).then(function (it) {
      var p = { id: id, ep: it.Type === "Episode" && !!it.SeriesId, seriesId: it.SeriesId, seasonId: it.SeasonId, season: it.ParentIndexNumber, name: it.SeriesName || it.Name };
      infoFor[id] = p;
      if ((window.tbNowPlaying ? window.tbNowPlaying() : id) === id) { playing = p; tick(); }
    }, function () { delete infoFor[id]; });
  }

  // ── the button ──
  function placeButton(page) {
    var have = page.querySelector(".tb-pep-btn");
    var show = !!(playing && playing.ep);
    if (have) { have.classList.toggle("hide", !show); return; }
    if (!show) return;
    var anchor = page.querySelector(".videoOsdBottom .btnSubtitles") || page.querySelector(".videoOsdBottom .btnAudio") || page.querySelector(".videoOsdBottom .btnVideoOsdSettings") || page.querySelector(".videoOsdBottom .btnFullscreen");
    if (!anchor || !anchor.parentNode) return;
    var b = document.createElement("button");
    b.type = "button";
    b.setAttribute("is", "paper-icon-button-light");
    b.className = "autoSize paper-icon-button-light tb-pep-btn";
    b.title = "Episodes";
    b.setAttribute("aria-label", "Episodes");
    b.innerHTML = '<span class="xlargePaperIconButton material-icons video_library" aria-hidden="true"></span>';
    anchor.parentNode.insertBefore(b, anchor);
    b.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (html.classList.contains("tb-pep-open")) close(); else open();
    });
  }

  // ── the panel ──
  function frame() {
    if (panel && panel.isConnected) return;
    panel = document.createElement("div");
    panel.id = "tb-pep";
    panel.innerHTML = '<div class="tb-pep-shade"></div><aside class="tb-pep-box" role="dialog" aria-label="Episodes">' +
      '<div class="tb-pep-head"><div class="tb-pep-ttl"><b>Episodes</b><span class="tb-pep-show"></span></div>' +
      '<button type="button" class="tb-pep-x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<select class="tb-pep-season" aria-label="Season"></select>' +
      '<div class="tb-pep-list" is="emby-itemscontainer"></div></aside>';
    document.body.appendChild(panel);
    upgrade(panel);
    // nothing in here reaches the player behind (a click there would pause, keys would seek)
    ["click", "dblclick", "mousedown", "pointerdown", "touchstart", "wheel"].forEach(function (t) {
      panel.addEventListener(t, function (e) {
        e.stopPropagation();
        if (t === "click" && e.target.closest && (e.target.closest(".tb-pep-x") || e.target.classList.contains("tb-pep-shade"))) { e.preventDefault(); close(); }
      }, { passive: t !== "click" && t !== "dblclick" });
    });
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape" || e.key === "Backspace" && e.target.tagName !== "INPUT") { e.preventDefault(); close(); }
      e.stopPropagation();
    });
    panel.querySelector(".tb-pep-season").addEventListener("change", function (e) { episodes(e.target.value, ++gen); });
    // an episode clicked: Jellyfin plays it (the list is an emby-itemscontainer); the panel closes behind it
    panel.querySelector(".tb-pep-list").addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest(".tb-pep-ep")) setTimeout(close, 60);
    });
  }

  function open() {
    if (!playing || !playing.ep) return;
    frame();
    html.classList.add("tb-pep-open");
    panel.querySelector(".tb-pep-show").textContent = playing.name || "";
    var token = ++gen, sel = panel.querySelector(".tb-pep-season"), list = panel.querySelector(".tb-pep-list");
    if (panel.__for !== playing.id) list.innerHTML = '<div class="tb-pep-empty">Loading…</div>';
    panel.__for = playing.id;
    var a = api();
    Promise.resolve(a.getJSON(a.getUrl("Shows/" + playing.seriesId + "/Seasons", { userId: uid() }))).then(function (r) {
      if (token !== gen) return;
      var seasons = (r && r.Items) || [];
      var want = seasons.filter(function (s) { return s.Id === playing.seasonId; })[0] ||
        seasons.filter(function (s) { return s.IndexNumber === playing.season; })[0] || seasons[0];
      sel.innerHTML = seasons.map(function (s) { return '<option value="' + s.Id + '"' + (want && s.Id === want.Id ? " selected" : "") + ">" + esc(s.Name || ("Season " + s.IndexNumber)) + "</option>"; }).join("");
      sel.style.display = seasons.length > 1 ? "" : "none";
      if (want) episodes(want.Id, token, true); else list.innerHTML = '<div class="tb-pep-empty">No episodes.</div>';
    }, function () { if (token === gen) list.innerHTML = '<div class="tb-pep-empty">Couldn’t load the episodes.</div>'; });
    setTimeout(function () { var x = panel.querySelector(".tb-pep-x"); if (x) x.focus({ preventScroll: true }); }, 50);
  }

  function episodes(seasonId, token, toCurrent) {
    var a = api(), list = panel.querySelector(".tb-pep-list");
    list.style.minHeight = list.offsetHeight + "px";
    Promise.resolve(a.getJSON(a.getUrl("Shows/" + playing.seriesId + "/Episodes", { userId: uid(), seasonId: seasonId, Fields: "Overview", EnableImageTypes: "Primary,Thumb,Backdrop", ImageTypeLimit: 1 }))).then(function (r) {
      if (token !== gen) return;
      var sid = "";
      try { sid = a.serverId(); } catch (e) {}
      var h = "";
      ((r && r.Items) || []).forEach(function (e) {
        var u = e.UserData || {}, still = "";
        if (e.ImageTags && e.ImageTags.Primary) still = imgUrl(e.Id, "Primary", e.ImageTags.Primary, "fillWidth=360&fillHeight=203");
        else if (e.ParentThumbItemId && e.ParentThumbImageTag) still = imgUrl(e.ParentThumbItemId, "Thumb", e.ParentThumbImageTag, "fillWidth=360&fillHeight=203");
        else if (e.ParentBackdropItemId && e.ParentBackdropImageTags && e.ParentBackdropImageTags[0]) still = imgUrl(e.ParentBackdropItemId, "Backdrop", e.ParentBackdropImageTags[0], "fillWidth=360&fillHeight=203");
        var now = e.Id === playing.id;
        var pct = !now && u.PlaybackPositionTicks && e.RunTimeTicks ? Math.min(100, Math.max(1, Math.round(u.PlaybackPositionTicks / e.RunTimeTicks * 100))) : 0;
        var n = e.IndexNumber != null ? (e.IndexNumber < 10 ? "0" : "") + e.IndexNumber : "";
        h += '<div class="tb-pep-ep" data-id="' + e.Id + '" data-serverid="' + esc(e.ServerId || sid) + '" data-type="Episode" data-isfolder="false" data-mediatype="Video"' +
          (u.PlaybackPositionTicks && !now ? ' data-positionticks="' + u.PlaybackPositionTicks + '"' : "") + (now ? " data-current" : "") + (u.Played ? " data-played" : "") + ">" +
          '<button type="button" class="itemAction tb-pep-go" data-action="' + (now ? "none" : (u.PlaybackPositionTicks ? "resume" : "play")) + '" title="' + (now ? "Playing now" : "Play " + esc(e.Name)) + '">' +
          '<span class="tb-pep-n">' + n + "</span>" +
          '<span class="tb-pep-img"' + (still ? ' style="background-image:url(&quot;' + esc(still) + '&quot;)"' : "") + ">" +
            (now ? '<span class="tb-pep-now">Playing</span>' : '<span class="tb-pep-play"></span>') +
            (pct ? '<span class="tb-pep-bar"><i style="width:' + pct + '%"></i></span>' : "") + "</span>" +
          '<span class="tb-pep-t">' + esc(e.Name) + (e.RunTimeTicks ? '<em>' + runtime(e.RunTimeTicks) + "</em>" : "") + "</span>" +
          (e.Overview ? '<span class="tb-pep-o">' + esc(e.Overview) + "</span>" : "") +
          "</button></div>";
      });
      list.innerHTML = h || '<div class="tb-pep-empty">No episodes in this season yet.</div>';
      list.style.minHeight = "";
      list.scrollTop = 0;
      var cur = toCurrent && list.querySelector("[data-current]");
      if (cur) list.scrollTop = Math.max(0, cur.offsetTop - list.clientHeight / 2 + cur.offsetHeight / 2);
    }, function () {
      if (token !== gen) return;
      list.innerHTML = '<div class="tb-pep-empty">Couldn’t load the episodes.</div>';
      list.style.minHeight = "";
    });
  }

  function close() {
    gen++;
    html.classList.remove("tb-pep-open");
  }

  // ── keeping up with the player (once a second, only while it's open) ──
  function tick() {
    var page = videoPage();
    if (!page) { if (html.classList.contains("tb-pep-open")) close(); playing = null; return; }
    if (!api()) return;
    playingId(lookUp);
    placeButton(page);
    if (html.classList.contains("tb-pep-open") && playing && panel && panel.__for !== playing.id) open();   // the next episode started
  }
  var t = 0;
  function inPlayer() { var o = document.getElementById("videoOsdPage"); return /^#\/?video/i.test(location.hash) || !!(o && !o.classList.contains("hide")); }
  function track() {
    if (inPlayer()) { if (!t) { t = setInterval(tick, 1000); tick(); } }
    else if (t) { clearInterval(t); t = 0; tick(); }
  }
  window.addEventListener("hashchange", track);
  window.addEventListener("popstate", track);
  document.addEventListener("viewshow", track);
  if (window.tbAdded) window.tbAdded(track);
  track();

  var st = document.createElement("style");
  st.id = "tb-pep-style";
  st.textContent =
    "html.tb-pep-open #tb-pep{display:block}" +
    "#tb-pep{display:none;position:fixed;inset:0;z-index:1100}" +
    "#tb-pep .tb-pep-shade{position:absolute;inset:0;background:linear-gradient(90deg,transparent 30%,rgba(0,0,0,.55))}" +
    "#tb-pep .tb-pep-box{position:absolute;top:0;right:0;bottom:0;width:min(480px,100vw);display:flex;flex-direction:column;padding:26px 0 0;" +
    "background:rgba(14,14,17,.86);-webkit-backdrop-filter:blur(26px) saturate(1.4);backdrop-filter:blur(26px) saturate(1.4);box-shadow:-30px 0 80px rgba(0,0,0,.5),inset 1px 0 0 rgba(255,255,255,.08);" +
    "animation:tbPepIn .28s cubic-bezier(.2,.8,.2,1)}" +
    "@keyframes tbPepIn{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}" +
    "#tb-pep .tb-pep-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:0 22px 0 26px}" +
    "#tb-pep .tb-pep-ttl{display:flex;flex-direction:column;min-width:0}" +
    "#tb-pep .tb-pep-ttl b{font:400 38px/1 var(--title-font,'Bebas Neue',sans-serif);letter-spacing:.02em;color:#fff}" +
    "#tb-pep .tb-pep-show{margin-top:4px;font:600 14px/1.3 var(--app-font,Inter,sans-serif);color:rgba(255,255,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#tb-pep .tb-pep-x{flex:none;width:40px;height:40px;padding:10px;border:0;border-radius:50%;background:rgba(255,255,255,.08);cursor:pointer;transition:background .15s}" +
    "#tb-pep .tb-pep-x:hover,#tb-pep .tb-pep-x:focus-visible{background:rgba(255,255,255,.18);outline:0}" +
    "#tb-pep .tb-pep-x svg{display:block;width:100%;height:100%;fill:none;stroke:#fff;stroke-width:2.2;stroke-linecap:round}" +
    "#tb-pep .tb-pep-season{margin:18px 26px 8px;align-self:flex-start;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px 12px;font:600 14px var(--app-font,Inter,sans-serif);cursor:pointer}" +
    "#tb-pep .tb-pep-season option{background:#16161a;color:#fff}" +
    "#tb-pep .tb-pep-list{flex:1;display:block!important;overflow-y:auto!important;overscroll-behavior:contain;padding:4px 12px 30px;scrollbar-width:thin}" +
    "#tb-pep .tb-pep-ep{position:relative;border-radius:12px;transition:background-color .15s}" +
    "#tb-pep .tb-pep-ep:hover,#tb-pep .tb-pep-ep:focus-within{background:rgba(255,255,255,.06)}" +
    "#tb-pep .tb-pep-ep[data-current]{background:rgba(255,255,255,.07)}" +
    "#tb-pep .tb-pep-ep[data-current]::before{content:'';position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:2px;background:var(--ue-accent,#dc2626)}" +
    "#tb-pep .tb-pep-go{all:unset;box-sizing:border-box;display:grid;width:100%;cursor:pointer;grid-template-columns:38px 150px minmax(0,1fr);" +
    "grid-template-areas:'num img title' 'num img ov';grid-template-rows:auto 1fr;column-gap:14px;row-gap:4px;padding:12px 10px 12px 4px}" +
    "#tb-pep .tb-pep-ep[data-current] .tb-pep-go{cursor:default}" +
    "#tb-pep .tb-pep-n{grid-area:num;align-self:center;justify-self:center;font:400 32px/1 var(--title-font,'Bebas Neue',sans-serif);color:rgba(255,255,255,.38)}" +
    "#tb-pep .tb-pep-ep[data-current] .tb-pep-n{color:var(--ue-accent,#dc2626)}" +
    "#tb-pep .tb-pep-ep[data-played]:not([data-current]) .tb-pep-n{color:rgba(255,255,255,.2)}" +
    "#tb-pep .tb-pep-img{grid-area:img;position:relative;width:150px;height:84px;align-self:center;border-radius:7px;background:#1c1c20 center/cover no-repeat;overflow:hidden}" +
    "#tb-pep .tb-pep-ep[data-played]:not([data-current]) .tb-pep-img{opacity:.55}" +
    "#tb-pep .tb-pep-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);opacity:0;transition:opacity .15s}" +
    "#tb-pep .tb-pep-play::after{content:'';width:34px;height:34px;border-radius:50%;background:#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%230b0b0b' d='M8 5.5v13l11-6.5z'/%3E%3C/svg%3E\") 55% 50%/16px 16px no-repeat}" +
    "#tb-pep .tb-pep-ep:hover .tb-pep-play,#tb-pep .tb-pep-ep:focus-within .tb-pep-play{opacity:1}" +
    "#tb-pep .tb-pep-now{position:absolute;left:6px;bottom:6px;padding:3px 7px;border-radius:5px;background:var(--ue-accent,#dc2626);font:700 11px/1 var(--app-font,Inter,sans-serif);letter-spacing:.04em;text-transform:uppercase;color:#fff}" +
    "#tb-pep .tb-pep-bar{position:absolute;left:6px;right:6px;bottom:6px;height:3px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden}" +
    "#tb-pep .tb-pep-bar i{display:block;height:100%;background:var(--ue-accent,#dc2626)}" +
    "#tb-pep .tb-pep-t{grid-area:title;align-self:end;display:flex;gap:8px;align-items:baseline;min-width:0;font:600 15px/1.3 var(--app-font,Inter,sans-serif);color:#fff}" +
    "#tb-pep .tb-pep-t{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}" +
    "#tb-pep .tb-pep-t em{flex:none;margin-left:auto;font-style:normal;font-weight:600;font-size:12px;color:rgba(255,255,255,.5)}" +
    "#tb-pep .tb-pep-o{grid-area:ov;align-self:start;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font:400 13px/1.45 var(--app-font,Inter,sans-serif);color:rgba(255,255,255,.58)}" +
    "#tb-pep .tb-pep-empty{padding:30px 16px;color:rgba(255,255,255,.55);font:500 14px var(--app-font,Inter,sans-serif)}" +
    "html.tb-pep-open body.mouseIdle #tb-pep,html.tb-pep-open body.mouseIdle #tb-pep *{cursor:auto!important}" +
    "@media (max-width:600px){#tb-pep .tb-pep-go{grid-template-columns:28px 120px minmax(0,1fr)}#tb-pep .tb-pep-img{width:120px;height:68px}#tb-pep .tb-pep-n{font-size:24px}}";
  (window.tbCss || function (s) { document.head.appendChild(s); })(st);
})();

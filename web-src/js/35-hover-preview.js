(function tbHoverPreview() {
  // Netflix-style hover cards (setting: Look > Hover preview cards). Rest on a poster for a moment and it grows
  // into a bigger card in place: the title's picture and logo, Play, My List (favourite), Watched, More info,
  // and rating · year · length · age rating · genres. Click it (or More info) for the pop-up. Mouse away: it
  // shrinks back. Computers only (a mouse or touchpad); phones and TVs keep plain posters.
  if (window.__tbHoverPreview) return;
  window.__tbHoverPreview = true;
  var html = document.documentElement;
  if (!window.matchMedia || !matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  var REDUCE = false;   // the setting decides (Windows reports "reduce motion" whenever its animation effects are off)
  var TYPES = { Movie: 1, Series: 1, Episode: 1, BoxSet: 1 };
  var DELAY = 550, EASE = "cubic-bezier(.2,.8,.2,1)";
  var card = null, timer = 0, box = null, showing = null, gen = 0;

  function api() { return window.ApiClient || null; }
  function uid() { try { return api().getCurrentUserId(); } catch (e) { return null; } }
  function sid() { try { return api().serverId(); } catch (e) { return ""; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function icon(n) { return '<span class="material-icons ' + n + '" aria-hidden="true"></span>'; }
  function runtime(ticks) {
    var m = Math.round((ticks || 0) / 600000000);
    if (!m) return "";
    return m >= 60 ? Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + "m";
  }
  var cache = {};
  function get(key, make) {
    var c = cache[key];
    if (c && Date.now() - c.at < 60000) return c.p;
    var p = Promise.resolve(make());
    cache[key] = { at: Date.now(), p: p };
    p["catch"](function () { delete cache[key]; });
    return p;
  }
  // anything that changes something (watched, favourite, playing) makes them stale
  window.addEventListener("tb-playback-stopped", function () { cache = {}; });
  function itemOf(id) { return get("i" + id, function () { return api().getItem(uid(), id); }); }
  function nextUpOf(seriesId) {
    return get("n" + seriesId, function () {
      var a = api();
      return a.getJSON(a.getUrl("Shows/NextUp", { userId: uid(), SeriesId: seriesId, Limit: 1, EnableResumable: true, Fields: "PrimaryImageAspectRatio" }));
    });
  }
  function upgrade(node) {
    if (window.tbCards && window.tbCards.upgrade) return window.tbCards.upgrade(node);
    if (window.CustomElements && window.CustomElements.upgradeSubtree) { try { window.CustomElements.upgradeSubtree(node); } catch (e) {} }
  }
  function off() {
    return html.classList.contains("layout-tv") || html.classList.contains("tb-pop-open") || html.classList.contains("tb-launch-on") ||
      (document.body && document.body.classList.contains("dashboardDocument")) || /^#!?\/?video/i.test(location.hash);
  }

  // ── when to show ──
  document.addEventListener("mouseover", function (e) {
    var t = e.target;
    if (!t || !t.closest || (box && box.contains(t))) return;
    var c = t.closest(".card[data-id]");
    if (c === card) return;
    clearTimeout(timer);
    card = null;
    if (!c || off() || !TYPES[c.getAttribute("data-type")] || c.closest("#tb-pop, #tb-pep, #tb-hc, .tb-studios")) return;
    card = c;
    // not while the mouse rests on the poster's own play button (the card would cover it): it waits until the
    // mouse moves off it, onto the rest of the poster
    var onPlay = function () { return !!c.querySelector(".cardOverlayFab-primary:hover, .cardOverlayButton-centered:hover, button[data-action='play']:hover, button[data-action='resume']:hover"); };
    var wait = function (ms) {
      timer = setTimeout(function () {
        if (card !== c || !c.matches(":hover") || off()) return;
        if (onPlay()) return wait(250);
        show(c);
      }, ms);
    };
    wait(DELAY);
  }, { passive: true });
  // the pointer ended up outside both the card and its preview (it can open a little off to the side near the
  // window's edges, where mouseleave never fires)
  document.addEventListener("mousemove", function (e) {
    if (!box || !showing) return;
    var t = e.target;
    if (box.contains(t) || (showing.card && showing.card.contains(t))) return;
    hide();
  }, { passive: true });
  ["scroll", "wheel"].forEach(function (ev) { document.addEventListener(ev, function () { clearTimeout(timer); if (box) hide(true); }, { capture: true, passive: true }); });
  ["hashchange", "popstate", "blur"].forEach(function (ev) { window.addEventListener(ev, function () { clearTimeout(timer); card = null; if (box) hide(true); }); });
  document.addEventListener("viewshow", function () { if (box) hide(true); });

  // ── the card ──
  function show(c) {
    var sc = c.querySelector(".cardScalable") || c;
    var r = sc.getBoundingClientRect();
    if (r.width < 40) return;
    hide(true);
    var my = ++gen, id = c.getAttribute("data-id"), type = c.getAttribute("data-type");
    showing = { id: id, type: type, card: c };
    var W = Math.round(Math.min(440, Math.max(330, r.width * 1.6))), ART = Math.round(W * 9 / 16);
    var poster = c.querySelector(".cardImageContainer");
    var posterBg = poster ? getComputedStyle(poster).backgroundImage : "none";
    var meta = window.tbItemMeta && window.tbItemMeta[id];
    var bd = meta && window.tbBackdropUrl ? window.tbBackdropUrl(meta) : null;
    var hasX = !!c.querySelector(".tb-cw-x");

    var wrap = document.createElement("div");
    wrap.innerHTML = '<div id="tb-hc" is="emby-itemscontainer" style="width:' + W + 'px">' +
      '<div class="tb-hc-art" style="height:' + ART + 'px;background-image:' + (bd ? 'url(&quot;' + esc(bd) + '&quot;)' : esc(posterBg)) + '">' +
        '<div class="tb-hc-logo"></div><div class="tb-hc-prog"></div></div>' +
      '<div class="tb-hc-info"><div class="tb-hc-btns"><span class="tb-hc-wait"></span></div>' +
        '<div class="tb-hc-meta"></div><div class="tb-hc-gen"></div></div></div>';
    box = wrap.firstChild;
    document.body.appendChild(box);

    // place it over the card, kept inside the window
    var H = box.offsetHeight;
    var left = Math.max(12, Math.min(window.innerWidth - W - 12, r.left + r.width / 2 - W / 2));
    var top = Math.max(12, Math.min(window.innerHeight - H - 12, r.top + r.height / 2 - ART / 2 - 20));
    box.style.left = left + "px";
    box.style.top = top + "px";
    var ox = r.left + r.width / 2 - left, oy = r.top + r.height / 2 - top;
    box.style.transformOrigin = ox + "px " + oy + "px";
    if (!REDUCE && box.animate) box.animate([{ transform: "scale(" + (r.width / W).toFixed(3) + ")", opacity: 0.5 }, { transform: "none", opacity: 1 }], { duration: 230, easing: EASE });

    box.addEventListener("mouseleave", function () { if (box && showing && showing.id === id) hide(); });
    box.addEventListener("click", function (e) {
      var t = e.target;
      if (t.closest(".tb-hc-x")) { e.preventDefault(); var x = c.querySelector(".tb-cw-x"); hide(true); if (x) x.click(); return; }
      if (t.closest('[data-action="play"], [data-action="resume"]')) {
        var lg = box.querySelector(".tb-hc-logo img"), art = box.querySelector(".tb-hc-art");
        if (window.tbLaunch) window.tbLaunch({ bg: art && art.style.backgroundImage, logo: lg && lg.src, title: showing && showing.name, sub: showing && showing.sub });
        setTimeout(function () { hide(true); }, 50);
        return;
      }
      if (t.closest("[data-action], button:not(.tb-hc-more)")) return;   // favourite / watched: their own buttons
      e.preventDefault();
      openFull(id, type);
    });

    // the full details: logo, buttons, meta
    itemOf(id).then(function (it) {
      if (my !== gen || !box || !it) return;
      var a = api();
      showing.name = it.Type === "Episode" ? (it.SeriesName || it.Name) : it.Name;
      var art = box.querySelector(".tb-hc-art");
      if (!bd && window.tbBackdropUrl) { var b2 = window.tbBackdropUrl(it); if (b2) { var im = new Image(); im.onload = function () { if (my === gen && art) art.style.backgroundImage = 'url("' + b2 + '")'; }; im.src = b2; } }
      var logoId = it.ImageTags && it.ImageTags.Logo ? it.Id : it.ParentLogoItemId, logoTag = it.ImageTags && it.ImageTags.Logo ? it.ImageTags.Logo : it.ParentLogoImageTag;
      var lg = box.querySelector(".tb-hc-logo");
      if (logoId && logoTag) lg.innerHTML = '<img alt="' + esc(showing.name) + '" src="' + esc(a.getScaledImageUrl(logoId, { type: "Logo", tag: logoTag, maxWidth: 480, quality: 90 })) + '">';
      else lg.innerHTML = '<b>' + esc(showing.name) + "</b>";
      var m = [];
      if (it.CommunityRating) m.push('<span class="tb-hc-star">★ ' + (Math.round(it.CommunityRating * 10) / 10).toFixed(1) + "</span>");
      if (it.Type === "Episode" && it.ParentIndexNumber != null && it.IndexNumber != null) m.push("<span>S" + it.ParentIndexNumber + ":E" + it.IndexNumber + "</span>");
      if (it.ProductionYear) m.push("<span>" + it.ProductionYear + "</span>");
      if (it.Type === "Series" && it.ChildCount) m.push("<span>" + it.ChildCount + (it.ChildCount === 1 ? " Season" : " Seasons") + "</span>");
      else if (it.RunTimeTicks) m.push("<span>" + runtime(it.RunTimeTicks) + "</span>");
      if (it.OfficialRating) m.push('<span class="tb-hc-age">' + esc(it.OfficialRating) + "</span>");
      box.querySelector(".tb-hc-meta").innerHTML = m.join("");
      var genres = it.Genres && it.Genres.length ? it.Genres : (it.Type === "Episode" && it.Name ? [it.Name] : []);
      box.querySelector(".tb-hc-gen").innerHTML = genres.slice(0, 3).map(esc).join('<i class="tb-hc-dot"></i>');
      var target = it.Type === "Series" ? nextUpOf(it.Id).then(function (n) { return (n && n.Items && n.Items[0]) || it; }, function () { return it; }) : Promise.resolve(it);
      target.then(function (tg) {
        if (my !== gen || !box) return;
        buttons(it, tg, hasX);
      });
    }, function () {});
  }

  function buttons(it, tg, hasX) {
    var s = sid(), u = tg.UserData || {}, iu = it.UserData || {};
    var playable = tg.Type !== "Series" && tg.Type !== "BoxSet";
    if (tg.Type === "Episode" && it.Type === "Series" && tg.ParentIndexNumber != null) showing.sub = "S" + tg.ParentIndexNumber + ":E" + tg.IndexNumber + " · " + (tg.Name || "");
    else if (it.Type === "Episode") showing.sub = "S" + it.ParentIndexNumber + ":E" + it.IndexNumber + " · " + (it.Name || "");
    var pos = u.PlaybackPositionTicks;
    var h = "";
    if (playable) {
      h += '<span data-id="' + tg.Id + '" data-serverid="' + esc(tg.ServerId || s) + '" data-type="' + esc(tg.Type) + '" data-isfolder="false" data-mediatype="Video"' + (pos ? ' data-positionticks="' + pos + '"' : "") + ">" +
        '<button type="button" class="itemAction tb-hc-play" data-action="' + (pos ? "resume" : "play") + '" title="' + (pos ? "Resume" : "Play") + '">' + icon("play_arrow") + "</button></span>";
    }
    h += '<button is="emby-ratingbutton" type="button" data-action="none" class="tb-hc-b" title="My List" data-id="' + it.Id + '" data-serverid="' + esc(it.ServerId || s) + '" data-itemtype="' + esc(it.Type) + '" data-likes="" data-isfavorite="' + !!iu.IsFavorite + '">' + icon("favorite") + "</button>";
    h += '<button is="emby-playstatebutton" type="button" data-action="none" class="tb-hc-b" title="Watched" data-id="' + it.Id + '" data-serverid="' + esc(it.ServerId || s) + '" data-itemtype="' + esc(it.Type) + '" data-played="' + !!iu.Played + '">' + icon("check") + "</button>";
    if (hasX) h += '<button type="button" class="tb-hc-b tb-hc-x" title="Remove from Continue Watching">' + icon("close") + "</button>";
    h += '<button type="button" class="tb-hc-b tb-hc-more" title="More info">' + icon("expand_more") + "</button>";
    var btns = box.querySelector(".tb-hc-btns");
    btns.innerHTML = h;
    upgrade(btns);
    if (pos && tg.RunTimeTicks) {
      var pct = Math.min(100, Math.max(2, Math.round(pos / tg.RunTimeTicks * 100)));
      box.querySelector(".tb-hc-prog").innerHTML = "<i style=\"width:" + pct + '%"></i>';
      box.querySelector(".tb-hc-prog").classList.add("on");
    }
  }

  function openFull(id, type) {
    var art = box && box.querySelector(".tb-hc-art");
    var src = art ? { rect: art.getBoundingClientRect(), bg: art.style.backgroundImage, radius: "12px", el: showing && showing.card && showing.card.querySelector(".cardImageContainer") } : null;
    hide(true);
    if (window.tbPopOpen && window.tbPopOpen(id, type, src)) return;
    location.hash = "#/details?id=" + id + "&serverId=" + sid();
  }

  function hide(now) {
    clearTimeout(timer);
    gen++;
    var b = box;
    box = null;
    showing = null;
    if (!b) return;
    if (now || REDUCE || !b.animate) { b.remove(); return; }
    b.style.pointerEvents = "none";
    b.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.92)" }], { duration: 150, easing: "ease-in", fill: "forwards" }).onfinish = function () { b.remove(); };
  }

  var st = document.createElement("style");
  st.id = "tb-hc-style";
  st.textContent =
    "#tb-hc{position:fixed;z-index:1100;border-radius:12px;overflow:hidden;background:#18181b;color:#fff;box-shadow:0 22px 60px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.08);cursor:pointer;display:block!important}" +
    "#tb-hc .tb-hc-art{position:relative;background:#222 50% 30%/cover no-repeat}" +
    "#tb-hc .tb-hc-art::after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,rgba(24,24,27,1) 0%,rgba(24,24,27,.35) 38%,transparent 65%)}" +
    "#tb-hc .tb-hc-logo{position:absolute;left:14px;bottom:12px;z-index:1;max-width:62%}" +
    "#tb-hc .tb-hc-logo img{display:block;max-width:100%;max-height:64px;object-fit:contain;object-position:left bottom;filter:drop-shadow(0 2px 10px rgba(0,0,0,.6))}" +
    "#tb-hc .tb-hc-logo b{font:400 30px/1 var(--title-font,'Bebas Neue',sans-serif);letter-spacing:.02em;text-shadow:0 2px 12px rgba(0,0,0,.7)}" +
    "#tb-hc .tb-hc-prog{position:absolute;left:14px;right:14px;bottom:0;z-index:1;height:3px;border-radius:2px;background:rgba(255,255,255,.22);overflow:hidden;display:none}" +
    "#tb-hc .tb-hc-prog.on{display:block}#tb-hc .tb-hc-prog i{display:block;height:100%;background:var(--sleekfin-accent,#dc2626)}" +
    "#tb-hc .tb-hc-info{padding:12px 14px 14px}" +
    "#tb-hc .tb-hc-btns{display:flex;align-items:center;gap:8px;min-height:38px}" +
    "#tb-hc .tb-hc-btns>span{display:contents}" +
    "#tb-hc .tb-hc-wait{display:block;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,.08)}" +
    "#tb-hc .tb-hc-play,#tb-hc .tb-hc-b{all:unset;box-sizing:border-box;width:38px;height:38px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:transform .12s ease,background-color .12s ease,border-color .12s ease}" +
    "#tb-hc .tb-hc-play{background:#fff;color:#0b0b0b}#tb-hc .tb-hc-play .material-icons{font-size:26px}" +
    "#tb-hc .tb-hc-b{border:2px solid rgba(255,255,255,.45);color:#fff;background:rgba(40,40,44,.6)}" +
    "#tb-hc .tb-hc-b .material-icons{font-size:19px}" +
    "#tb-hc .tb-hc-b:hover{border-color:#fff;background:rgba(255,255,255,.12)}#tb-hc .tb-hc-play:hover{transform:scale(1.08)}" +
    "#tb-hc .tb-hc-b[data-isfavorite='true'] .material-icons,#tb-hc .tb-hc-b[data-played='true'] .material-icons{color:var(--sleekfin-accent,#dc2626)}" +
    "#tb-hc .tb-hc-more{margin-left:auto}" +
    "#tb-hc .tb-hc-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin-top:12px;font:600 13px/1.3 var(--app-font,Inter,sans-serif);color:rgba(255,255,255,.9)}" +
    "#tb-hc .tb-hc-star{color:var(--sleekfin-accent,#dc2626)}" +
    "#tb-hc .tb-hc-age{border:1px solid rgba(255,255,255,.5);border-radius:3px;padding:0 5px;font-size:11px;line-height:17px}" +
    "#tb-hc .tb-hc-gen{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:8px;font:500 13px/1.3 var(--app-font,Inter,sans-serif);color:rgba(255,255,255,.72)}" +
    "#tb-hc .tb-hc-dot{display:inline-block;width:4px;height:4px;border-radius:50%;background:rgba(255,255,255,.4)}";
  (window.tbCss || function (s) { document.head.appendChild(s); })(st);
})();

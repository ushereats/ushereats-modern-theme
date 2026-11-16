(function tbTitlePopup() {
  // Title pop-up (setting "Title opens as": Full page / Pop-up for admins / Pop-up for everyone).
  // Netflix's way: clicking a movie, show, season or episode doesn't change page. A panel is drawn on top of the
  // page you're on (which stays live underneath, untouched), filled with that title: banner, Play / Resume,
  // favourite, watched, Jellyfin's own ⋮ menu, episodes, cast, more like this. Every button is Jellyfin's real
  // action (the same ones the cards' hover buttons use). Closing (✕, Esc, clicking outside, back) just removes
  // the panel. Back / forward work through a marker in the browser history (the address itself doesn't change).
  // With the setting on Full page this file isn't loaded at all.
  if (window.__tbTitlePopup) return;
  window.__tbTitlePopup = true;

  var html = document.documentElement;
  var TYPES = { Movie: 1, Series: 1, Season: 1, Episode: 1 };
  var enabled = false;
  var root = null, panel = null, cur = null, gen = 0, pushing = false;

  function C() { return window.tbCards; }
  function api() { return window.ApiClient || null; }
  function uid() { try { return api().getCurrentUserId(); } catch (e) { return null; } }
  function sid() { try { return api().serverId(); } catch (e) { return ""; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function get(path, params) { var a = api(); return Promise.resolve(a.getJSON(a.getUrl(path, params || {}))); }
  var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
  if (base.charAt(base.length - 1) !== "/") base += "/";
  function imgUrl(id, type, tag, q) { return base + "Items/" + id + "/Images/" + type + "?" + q + "&quality=85" + (window.__tbImgFmt || "") + "&tag=" + encodeURIComponent(tag); }

  var css =
    "html.tb-pop-open #tb-pop{display:flex}" +
    "#tb-pop{display:none;position:fixed;inset:0;z-index:1200;justify-content:center;align-items:flex-start}" +
    "#tb-pop .tb-pop-shade{position:absolute;inset:0;background:rgba(0,0,0,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}" +
    "#tb-pop .tb-pop-box{position:relative;display:flex;margin-top:5vh;width:min(1100px,calc(100vw - 48px));max-height:90vh;border-radius:18px;overflow:hidden;isolation:isolate;" +
    "background:var(--sleekfin-background,#0b0b0d);box-shadow:0 30px 90px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.08)}" +
    // the panel's background: the title's own picture, softened, like the ambient background everywhere else
    "#tb-pop .tb-pop-amb{position:absolute;inset:-12%;z-index:-1;background:50% 30%/cover no-repeat;filter:blur(46px) saturate(1.25);opacity:0;transition:opacity .35s ease}" +
    "#tb-pop .tb-pop-amb.on{opacity:1}" +
    "#tb-pop .tb-pop-box::after{content:'';position:absolute;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,.55) 45%,rgba(0,0,0,.72) 100%)}" +
    "#tb-pop .tb-pop-panel{position:relative;flex:1;min-width:0;max-height:90vh;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;outline:none;scrollbar-width:thin;color:#fff;background:transparent}" +
    "#tb-pop .tb-pop-bar{position:sticky;top:0;height:0;z-index:5}" +
    "#tb-pop .tb-pop-close{position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;border:0;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#fff;padding:0;" +
    "background:rgba(20,20,24,.72);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 0 0 1px rgba(255,255,255,.14)}" +
    "#tb-pop .tb-pop-close:hover{background:rgba(40,40,46,.9)}" +
    "#tb-pop .tb-pop-hero{position:relative;min-height:min(62vh,560px);display:flex;align-items:flex-end}" +
    "#tb-pop .tb-pop-bd{position:absolute;inset:0;background:50% 25%/cover no-repeat;-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 50%,rgba(0,0,0,.6) 72%,transparent 100%);mask-image:linear-gradient(180deg,#000 0%,#000 50%,rgba(0,0,0,.6) 72%,transparent 100%)}" +
    "#tb-pop .tb-pop-bd::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.36) 45%,transparent 78%)}" +
    "#tb-pop .tb-pop-in{position:relative;z-index:1;padding:56px 48px 26px;max-width:680px}" +
    "#tb-pop .tb-pop-logo{display:block;max-width:min(380px,75%);max-height:140px;margin:0 0 16px;object-fit:contain;object-position:left bottom}" +
    "#tb-pop .tb-pop-title{font-family:'Bebas Neue',var(--app-font);font-size:58px;line-height:.95;margin:0 0 14px;font-weight:400;letter-spacing:.01em}" +
    "#tb-pop .tb-pop-sub{font-weight:700;font-size:17px;margin:0 0 8px}" +
    "#tb-pop .tb-pop-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:14px;font-weight:600;color:rgba(255,255,255,.92)}" +
    "#tb-pop .tb-pop-star{color:var(--sleekfin-accent,#4fc3f7)}" +
    "#tb-pop .tb-pop-age{border:1px solid rgba(255,255,255,.55);border-radius:4px;padding:0 5px;font-size:11px;line-height:17px}" +
    "#tb-pop .tb-pop-genres{margin-top:6px;font-size:14px;color:rgba(255,255,255,.72)}" +
    "#tb-pop .tb-pop-prog{display:flex;align-items:center;gap:12px;margin-top:14px;font-size:13px;font-weight:600;color:rgba(255,255,255,.8)}" +
    "#tb-pop .tb-pop-prog b{display:block;width:180px;height:4px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden}" +
    "#tb-pop .tb-pop-prog b i{display:block;height:100%;background:var(--sleekfin-accent,#4fc3f7)}" +
    "#tb-pop .tb-pop-ov{margin:14px 0 0;font-size:15px;line-height:1.5;color:rgba(255,255,255,.88);display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}" +
    "#tb-pop .tb-pop-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:22px;min-height:44px}" +
    "#tb-pop .tb-pop-actions>span{display:contents}" +
    "#tb-pop .tb-pop-ic{width:44px!important;height:44px!important;min-width:0!important;border-radius:50%!important;display:inline-flex;align-items:center;justify-content:center;color:#fff!important;padding:0!important;margin:0!important;cursor:pointer}" +
    "#tb-pop .tb-pop-ic .material-icons{font-size:20px}" +
    "#tb-pop .tb-pop-actions .sleekfin-button{cursor:pointer;margin:0}" +
    "#tb-pop .tb-pop-actions .sleekfin-button .material-icons{font-size:22px}" +
    "#tb-pop .tb-pop-body{padding:6px 48px 44px}" +
    "#tb-pop .tb-pop-body .padded-left,#tb-pop .tb-pop-body .padded-right{padding-left:0!important;padding-right:0!important}" +
    "#tb-pop .tb-pop-body .verticalSection{margin:26px 0 0!important}" +
    "#tb-pop .tb-pop-body .emby-scroller{margin:0!important;padding-left:0!important;padding-right:0!important}" +
    "#tb-pop .tb-pop-eph{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:26px 0 10px}" +
    "#tb-pop .tb-pop-eph .sectionTitle{margin:0}" +
    "#tb-pop .tb-pop-season{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.18);border-radius:10px;padding:8px 12px;font:inherit;font-weight:600;cursor:pointer}" +
    "#tb-pop .tb-pop-season option{background:#16161a;color:#fff}" +
    "#tb-pop .tb-pop-eps{display:block!important;min-height:120px;white-space:normal!important;overflow:visible!important}" +
    "#tb-pop .tb-pop-ep{display:block!important;width:100%!important;flex:none!important;border-top:1px solid rgba(255,255,255,.07)}" +
    "#tb-pop .tb-pop-ep-btn{all:unset;box-sizing:border-box;display:grid;grid-template-columns:34px 190px 1fr;gap:18px;align-items:center;width:100%;padding:14px 10px;border-radius:12px;cursor:pointer}" +
    "#tb-pop .tb-pop-ep-btn:hover,#tb-pop .tb-pop-ep-btn:focus-visible{background:rgba(255,255,255,.06)}" +
    "#tb-pop .tb-pop-ep-n{font-size:22px;color:rgba(255,255,255,.55);text-align:center}" +
    "#tb-pop .tb-pop-ep-img{position:relative;aspect-ratio:16/9;border-radius:8px;background:#1c1c20 center/cover no-repeat;overflow:hidden}" +
    "#tb-pop .tb-pop-ep-img .material-icons{position:absolute;inset:0;margin:auto;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);opacity:0;transition:opacity .15s}" +
    "#tb-pop .tb-pop-ep-btn:hover .tb-pop-ep-img .material-icons{opacity:1}" +
    "#tb-pop .tb-pop-ep-bar{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(255,255,255,.25)}" +
    "#tb-pop .tb-pop-ep-bar i{display:block;height:100%;background:var(--sleekfin-accent,#4fc3f7)}" +
    "#tb-pop .tb-pop-ep-t{display:flex;justify-content:space-between;gap:12px;font-weight:700;font-size:15px}" +
    "#tb-pop .tb-pop-ep-t em{font-style:normal;font-weight:600;color:rgba(255,255,255,.55);white-space:nowrap}" +
    "#tb-pop .tb-pop-ep-t .material-icons{font-size:16px;vertical-align:-3px;margin-left:6px;color:var(--sleekfin-accent,#4fc3f7)}" +
    "#tb-pop .tb-pop-ep-o{display:-webkit-box;margin-top:6px;font-size:13px;line-height:1.45;color:rgba(255,255,255,.68);-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}" +
    "#tb-pop .tb-pop-empty{padding:18px 10px;color:rgba(255,255,255,.55);font-size:14px}" +
    "#tb-pop .tb-pop-role{opacity:.65}" +
    "@media (max-width:700px){#tb-pop .tb-pop-box{margin:0;width:100vw;max-height:none;height:100%;border-radius:0}#tb-pop .tb-pop-panel{max-height:none}" +
    "#tb-pop .tb-pop-in{padding:56px 20px 20px}#tb-pop .tb-pop-body{padding:4px 20px 32px}#tb-pop .tb-pop-title{font-size:44px}" +
    "#tb-pop .tb-pop-ep-btn{grid-template-columns:24px 120px 1fr;gap:12px}#tb-pop .tb-pop-ep-o{display:none}" +
    "#tb-pop .tb-pop-close{top:12px;right:12px}}";

  // ── the panel's frame (made once) ──
  function frame() {
    if (root) return;
    root = document.createElement("div");
    root.id = "tb-pop";
    root.innerHTML = '<div class="tb-pop-shade"></div><div class="tb-pop-box"><div class="tb-pop-amb"></div><div class="tb-pop-panel" role="dialog" aria-modal="true" tabindex="-1"></div></div>';
    document.body.appendChild(root);
    panel = root.querySelector(".tb-pop-panel");
    var shade = root.querySelector(".tb-pop-shade");
    shade.addEventListener("click", userClose);
    // the page behind doesn't scroll while the panel is open
    ["wheel", "touchmove"].forEach(function (t) { shade.addEventListener(t, function (e) { e.preventDefault(); }, { passive: false }); });
    panel.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest(".tb-pop-close")) { e.preventDefault(); userClose(); }
    });
    panel.addEventListener("change", function (e) {
      var s = e.target;
      if (s && s.classList && s.classList.contains("tb-pop-season") && cur) loadEpisodes(cur.seriesId, s.value, gen);
    });
  }

  // ── open / close ──
  function open(id, type, fromHistory) {
    if (!id || !api() || !uid()) return false;
    frame();
    if (!fromHistory) {
      // a marker in the browser history (same address), so back / forward close and reopen the panel
      var st = {};
      try { var s0 = history.state; if (s0 && typeof s0 === "object") for (var k in s0) if (k !== "tbPop") st[k] = s0[k]; } catch (e) {}
      st.tbPop = id;
      pushing = true;
      try { if (cur && history.state && history.state.tbPop) history.replaceState(st, "", location.href); else history.pushState(st, "", location.href); } catch (e) {}
      pushing = false;
    }
    var token = ++gen;
    cur = { id: id, type: type || "", seriesId: null };
    html.classList.add("tb-pop-open");
    // instant first draw from what hovering the poster already fetched, then the full details
    var known = window.tbItemMeta && window.tbItemMeta[id];
    draw(known && known.Name ? known : { Id: id, Type: type || "" }, token, true);
    panel.scrollTop = 0;
    try { panel.focus({ preventScroll: true }); } catch (e) {}
    Promise.resolve(api().getItem(uid(), id)).then(function (item) {
      if (token !== gen || !item) return;
      if (item.Type === "Season" && item.SeriesId) {
        // a season: show its show, on that season
        return Promise.resolve(api().getItem(uid(), item.SeriesId)).then(function (series) {
          if (token !== gen || !series) return;
          cur.id = series.Id;
          draw(series, token, false, item.Id);
        });
      }
      draw(item, token, false);
    })["catch"](function () {
      if (token !== gen) return;
      var b = panel.querySelector(".tb-pop-body");
      if (b) b.innerHTML = '<div class="tb-pop-empty">Couldn’t load this title. <a href="' + detailsHref(id) + '" style="color:inherit;text-decoration:underline">Open the full page</a></div>';
    });
    return true;
  }

  function closeUI() {
    if (!cur && !html.classList.contains("tb-pop-open")) return;
    gen++;
    cur = null;
    html.classList.remove("tb-pop-open");
    if (panel) panel.innerHTML = "";
    ambient(null);
  }
  function userClose() {
    if (!cur) return;
    if (history.state && history.state.tbPop) history.back();   // the back below closes it
    else closeUI();
  }

  function detailsHref(id) { return "#/details?id=" + id + "&serverId=" + sid(); }
  function runtime(ticks) {
    var m = Math.round((ticks || 0) / 600000000);
    if (!m) return "";
    return m >= 60 ? Math.floor(m / 60) + "h" + (m % 60 ? " " + (m % 60) + "m" : "") : m + "m";
  }
  function attrs(it, withPos) {
    var u = it.UserData || {};
    return ' data-id="' + it.Id + '" data-serverid="' + esc(it.ServerId || sid()) + '" data-type="' + esc(it.Type) + '"' +
      ' data-isfolder="' + !!it.IsFolder + '"' + (it.MediaType ? ' data-mediatype="' + esc(it.MediaType) + '"' : "") +
      (withPos && u.PlaybackPositionTicks ? ' data-positionticks="' + u.PlaybackPositionTicks + '"' : "");
  }
  function icon(name) { return '<span class="material-icons ' + name + '" aria-hidden="true"></span>'; }

  // ── drawing ──
  // quick: the first draw from what's already known (no buttons until the full details are in)
  function draw(it, token, quick, seasonId) {
    var a = api();
    var isEp = it.Type === "Episode";
    var bd = window.tbBackdropUrl ? window.tbBackdropUrl(it) : null;
    var logoId = it.ImageTags && it.ImageTags.Logo ? it.Id : it.ParentLogoItemId;
    var logoTag = it.ImageTags && it.ImageTags.Logo ? it.ImageTags.Logo : it.ParentLogoImageTag;
    var logo = logoId && logoTag && a ? a.getScaledImageUrl(logoId, { type: "Logo", tag: logoTag, maxWidth: 760, quality: 90 }) : null;
    var name = isEp ? (it.SeriesName || it.Name) : it.Name;
    var h = '<div class="tb-pop-bar"><button type="button" class="tb-pop-close" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    ambient(bd);
    h += '<div class="tb-pop-hero"><div class="tb-pop-bd"' + (bd ? ' style="background-image:url(&quot;' + esc(bd) + '&quot;)"' : "") + '></div><div class="tb-pop-in">';
    h += logo ? '<img class="tb-pop-logo" alt="' + esc(name) + '" src="' + esc(logo) + '">' : (name ? '<h1 class="tb-pop-title">' + esc(name) + "</h1>" : "");
    if (isEp) h += '<div class="tb-pop-sub">' + (it.ParentIndexNumber != null && it.IndexNumber != null ? "S" + it.ParentIndexNumber + ":E" + it.IndexNumber + " · " : "") + esc(it.Name || "") + "</div>";
    if (!quick) {
      var meta = [];
      if (it.CommunityRating) meta.push('<span><span class="tb-pop-star">★</span> ' + (Math.round(it.CommunityRating * 10) / 10) + "</span>");
      if (it.ProductionYear) meta.push("<span>" + it.ProductionYear + "</span>");
      if (it.Type === "Series" && it.ChildCount) meta.push("<span>" + it.ChildCount + (it.ChildCount === 1 ? " Season" : " Seasons") + "</span>");
      else if (it.RunTimeTicks) meta.push("<span>" + runtime(it.RunTimeTicks) + "</span>");
      if (it.OfficialRating) meta.push('<span class="tb-pop-age">' + esc(it.OfficialRating) + "</span>");
      if (meta.length) h += '<div class="tb-pop-meta">' + meta.join("") + "</div>";
      if (it.Genres && it.Genres.length) h += '<div class="tb-pop-genres">' + it.Genres.slice(0, 4).map(esc).join(" · ") + "</div>";
      var u = it.UserData || {};
      if (it.Type === "Movie" && u.PlaybackPositionTicks && it.RunTimeTicks) {
        var pct = Math.min(100, Math.max(1, Math.round(u.PlaybackPositionTicks / it.RunTimeTicks * 100)));
        h += '<div class="tb-pop-prog"><b><i style="width:' + pct + '%"></i></b>' + runtime(it.RunTimeTicks - u.PlaybackPositionTicks) + " left</div>";
      }
      if (it.Overview) h += '<p class="tb-pop-ov">' + esc(it.Overview) + "</p>";
      h += '<div class="tb-pop-actions" is="emby-itemscontainer" data-tb-pop-actions></div>';
    }
    h += '</div></div><div class="tb-pop-body"></div>';
    panel.innerHTML = h;
    if (quick) return;
    actions(it, token);
    var body = panel.querySelector(".tb-pop-body");
    if (it.Type === "Series" || (isEp && it.SeriesId)) {
      cur.seriesId = isEp ? it.SeriesId : it.Id;
      body.insertAdjacentHTML("beforeend", '<div class="tb-pop-eph"><h2 class="sectionTitle sectionTitle-cards">Episodes</h2><select class="tb-pop-season" aria-label="Season" disabled></select></div><div class="tb-pop-eps" is="emby-itemscontainer"></div>');
      upgrade(body);
      seasons(cur.seriesId, isEp ? it.SeasonId : seasonId, token, isEp ? it.ParentIndexNumber : null);
    }
    cast(it, body);
    similar(isEp && it.SeriesId ? it.SeriesId : it.Id, body, token);
  }
  function upgrade(node) { var c = C(); if (c && node) c.upgrade(node); }
  var ambUrl = null;
  function ambient(url) {
    var a = root && root.querySelector(".tb-pop-amb");
    if (!a || url === ambUrl) return;
    ambUrl = url;
    if (!url) { a.classList.remove("on"); a.style.backgroundImage = ""; return; }
    // the softened picture: a small copy is enough (it's blurred), shown once it has loaded
    var small = url.replace(/([?&])(maxWidth|fillWidth)=\d+/i, "$1$2=480");
    var im = new Image();
    a.classList.remove("on");
    im.onload = function () { if (ambUrl !== url) return; a.style.backgroundImage = 'url("' + small.replace(/"/g, "%22") + '")'; a.classList.add("on"); };
    im.src = small;
  }

  // Play / Resume, start again, favourite, watched, Jellyfin's ⋮ menu, full page
  function actions(it, token) {
    var box = panel.querySelector("[data-tb-pop-actions]");
    if (!box) return;
    var s = sid();
    upgrade(box.parentNode);
    function build(target) {
      if (token !== gen || !box.isConnected) return;
      var u = (target && target.UserData) || {};
      var h = "";
      var label = target && target.Type === "Episode" && it.Type === "Series" && target.ParentIndexNumber != null && target.IndexNumber != null ? " S" + target.ParentIndexNumber + ":E" + target.IndexNumber : "";
      if (target) {
        if (u.PlaybackPositionTicks) {
          h += "<span" + attrs(target, true) + '><button type="button" class="itemAction sleekfin-button sleekfin-button-primary" data-action="resume">' + icon("play_arrow") + "<span>Resume" + label + "</span></button></span>";
          h += "<span" + attrs(target, false) + '><button type="button" class="itemAction sleekfin-button sleekfin-button-control sleekfin-control-3d" data-action="play">' + icon("replay") + "<span>Play from start</span></button></span>";
        } else {
          h += "<span" + attrs(target, false) + '><button type="button" class="itemAction sleekfin-button sleekfin-button-primary" data-action="play">' + icon("play_arrow") + "<span>Play" + label + "</span></button></span>";
        }
      }
      var iu = it.UserData || {};
      h += '<button is="emby-ratingbutton" type="button" data-action="none" class="tb-pop-ic sleekfin-control-3d" title="Favourite" data-id="' + it.Id + '" data-serverid="' + esc(it.ServerId || s) + '" data-itemtype="' + esc(it.Type) + '" data-likes="" data-isfavorite="' + !!iu.IsFavorite + '">' + icon("favorite") + "</button>";
      h += '<button is="emby-playstatebutton" type="button" data-action="none" class="tb-pop-ic sleekfin-control-3d" title="Watched" data-id="' + it.Id + '" data-serverid="' + esc(it.ServerId || s) + '" data-itemtype="' + esc(it.Type) + '" data-played="' + !!iu.Played + '">' + icon("check") + "</button>";
      h += "<span" + attrs(it, false) + '><button type="button" class="itemAction tb-pop-ic sleekfin-control-3d" data-action="menu" title="More">' + icon("more_vert") + "</button></span>";
      h += '<a class="tb-pop-ic sleekfin-control-3d" href="' + detailsHref(it.Id) + '" title="Full page">' + icon("open_in_full") + "</a>";
      box.innerHTML = h;
      upgrade(box);
    }
    if (it.Type === "Series") {
      // the episode to continue with: Jellyfin's own Next Up for this show
      get("Shows/NextUp", { userId: uid(), SeriesId: it.Id, Limit: 1, EnableResumable: true }).then(function (r) {
        build(r && r.Items && r.Items[0] ? r.Items[0] : it);
      }, function () { build(it); });
    } else build(it);
  }

  function seasons(seriesId, want, token, wantNum) {
    get("Shows/" + seriesId + "/Seasons", { userId: uid() }).then(function (r) {
      if (token !== gen) return;
      var list = (r && r.Items) || [], sel = panel.querySelector(".tb-pop-season"), eps = panel.querySelector(".tb-pop-eps");
      if (!sel || !eps) return;
      if (!list.length) { eps.innerHTML = '<div class="tb-pop-empty">No episodes yet.</div>'; sel.style.display = "none"; return; }
      var go = function (id) {
        if (token !== gen) return;
        if (!id || !list.some(function (x) { return x.Id === id; })) { var first = list.filter(function (x) { return x.IndexNumber > 0; })[0] || list[0]; id = first.Id; }
        sel.innerHTML = list.map(function (x) { return '<option value="' + x.Id + '"' + (x.Id === id ? " selected" : "") + ">" + esc(x.Name || ("Season " + x.IndexNumber)) + "</option>"; }).join("");
        sel.disabled = list.length < 2;
        loadEpisodes(seriesId, id, token);
      };
      if (want && list.some(function (x) { return x.Id === want; })) return go(want);
      // an episode whose season id doesn't match the list: find its season by number
      if (wantNum != null) { var byNum = list.filter(function (x) { return x.IndexNumber === wantNum; })[0]; if (byNum) return go(byNum.Id); }
      // the season you're up to
      get("Shows/NextUp", { userId: uid(), SeriesId: seriesId, Limit: 1, EnableResumable: true }).then(function (n) {
        var e = n && n.Items && n.Items[0];
        go(e && e.SeasonId);
      }, function () { go(null); });
    }, function () {
      if (token !== gen) return;
      var b = panel.querySelector(".tb-pop-eps");
      if (b) b.innerHTML = '<div class="tb-pop-empty">Couldn’t load the episodes.</div>';
    });
  }

  function loadEpisodes(seriesId, seasonId, token) {
    var box = panel.querySelector(".tb-pop-eps");
    if (!box || !seriesId || !seasonId) return;
    box.style.minHeight = Math.max(120, box.offsetHeight) + "px";   // keeps its height while the next season loads
    get("Shows/" + seriesId + "/Episodes", { userId: uid(), seasonId: seasonId, Fields: "Overview", EnableImageTypes: "Primary,Thumb,Backdrop", ImageTypeLimit: 1 }).then(function (r) {
      if (token !== gen || !box.isConnected) return;
      var eps = (r && r.Items) || [], h = "";
      eps.forEach(function (e) {
        var u = e.UserData || {}, still = "";
        if (e.ImageTags && e.ImageTags.Primary) still = imgUrl(e.Id, "Primary", e.ImageTags.Primary, "fillWidth=400&fillHeight=225");
        else if (e.ParentThumbItemId && e.ParentThumbImageTag) still = imgUrl(e.ParentThumbItemId, "Thumb", e.ParentThumbImageTag, "fillWidth=400&fillHeight=225");
        else if (e.ParentBackdropItemId && e.ParentBackdropImageTags && e.ParentBackdropImageTags[0]) still = imgUrl(e.ParentBackdropItemId, "Backdrop", e.ParentBackdropImageTags[0], "fillWidth=400&fillHeight=225");
        var pct = u.PlaybackPositionTicks && e.RunTimeTicks ? Math.min(100, Math.max(1, Math.round(u.PlaybackPositionTicks / e.RunTimeTicks * 100))) : 0;
        h += '<div class="tb-pop-ep"' + attrs(e, true) + '><button type="button" class="itemAction tb-pop-ep-btn" data-action="' + (u.PlaybackPositionTicks ? "resume" : "play") + '" title="Play ' + esc(e.Name) + '">' +
          '<span class="tb-pop-ep-n">' + (e.IndexNumber != null ? e.IndexNumber : "") + "</span>" +
          '<span class="tb-pop-ep-img"' + (still ? ' style="background-image:url(&quot;' + esc(still) + '&quot;)"' : "") + ">" + icon("play_arrow") + (pct ? '<span class="tb-pop-ep-bar"><i style="width:' + pct + '%"></i></span>' : "") + "</span>" +
          '<span><span class="tb-pop-ep-t"><span>' + esc(e.Name) + (u.Played ? icon("check_circle") : "") + "</span><em>" + runtime(e.RunTimeTicks) + "</em></span>" +
          (e.Overview ? '<span class="tb-pop-ep-o">' + esc(e.Overview) + "</span>" : "") + "</span></button></div>";
      });
      box.innerHTML = h || '<div class="tb-pop-empty">No episodes in this season yet.</div>';
      box.style.minHeight = "";
    }, function () {
      if (token !== gen || !box.isConnected) return;
      box.innerHTML = '<div class="tb-pop-empty">Couldn’t load the episodes.</div>';
      box.style.minHeight = "";
    });
  }

  function row(title, cards, cls) {
    var c = C();
    if (!c || !cards) return null;
    return c.frag(c.section({ title: title, cls: "tb-row show-card-titles " + (cls || ""), cards: cards }));
  }
  function put(body, sec, before) {
    var c = C();
    if (!sec || !c || !body.isConnected) return;
    if (before && before.parentNode === body) body.insertBefore(sec, before); else body.appendChild(sec);
    c.upgrade(sec);
    c.load(sec);
    c.refreshScroller(sec);
    c.decorate();
  }

  function cast(it, body) {
    var c = C();
    var people = (it.People || []).filter(function (p) { return p && p.Id && p.Name; });
    if (!c || !people.length) return;
    var actors = people.filter(function (p) { return p.Type === "Actor" || p.Type === "GuestStar"; });
    var crew = people.filter(function (p) { return p.Type === "Director" || p.Type === "Writer" || p.Type === "Creator"; });
    var list = actors.slice(0, 18).concat(crew.slice(0, 4)), s = sid(), out = "";
    list.forEach(function (p, i) {
      var card = c.card({ Id: p.Id, Name: p.Name, Type: "Person", Primary: p.PrimaryImageTag, UserData: {} }, "poster", i, s, "", false, false);
      var role = p.Role ? "as " + p.Role : p.Type;
      out += card.replace(/<\/div><\/div>$/, '<div class="cardText cardTextCentered cardText-secondary tb-pop-role"><bdi>' + esc(role) + "</bdi></div></div></div>");
    });
    put(body, row("Cast & Crew", out, "tb-pop-cast"), body.querySelector(".tb-pop-similar"));
  }

  function similar(id, body, token) {
    get("Items/" + id + "/Similar", { userId: uid(), limit: 12, Fields: "PrimaryImageAspectRatio", EnableImageTypes: "Primary,Backdrop,Thumb", ImageTypeLimit: 1 }).then(function (r) {
      if (token !== gen) return;
      var c = C(), items = (r && r.Items) || [];
      if (!c || !items.length) return;
      var slim = window.__tbRowsBoot && window.__tbRowsBoot.slim, s = sid(), out = "";
      items.forEach(function (x, i) {
        var it = slim ? slim(x) : { Id: x.Id, Name: x.Name, Type: x.Type, ProductionYear: x.ProductionYear, Primary: x.ImageTags && x.ImageTags.Primary, UserData: x.UserData || {} };
        out += c.card(it, "poster", i, s, "", false, false);
      });
      put(body, row("More like this", out, "tb-pop-similar"));
    }, function () {});
  }

  // ── clicks on titles open the panel instead of the page ──
  window.addEventListener("click", function (e) {
    if (!enabled || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (html.classList.contains("layout-tv") || document.body.classList.contains("dashboardDocument")) return;
    var t = e.target;
    if (!t || !t.closest) return;
    var card = t.closest(".card[data-id]");
    if (!card) return;
    // the card's own buttons (play, watched, favourite, menu) keep doing what they do
    var act = t.closest("[data-action]");
    if (act && act.getAttribute("data-action") !== "link") return;
    var btn = t.closest("button");
    if (btn && btn !== act) return;
    var holder = t.closest("[data-id]") || card;
    var id = holder.getAttribute("data-id"), type = holder.getAttribute("data-type") || card.getAttribute("data-type");
    if (!id || !TYPES[type]) return;
    if (!open(id, type)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !cur) return;
    // a Jellyfin menu or dialog opened from the panel closes first
    if (document.querySelector(".dialogContainer .dialog, .actionSheet")) return;
    e.preventDefault();
    e.stopPropagation();
    userClose();
  }, true);

  // back / forward: leaving the marker closes the panel (and nothing else hears about it: the page didn't
  // change); coming back to a marker (back from the player or a person's page) opens it again
  window.addEventListener("popstate", function (e) {
    if (!enabled) return;
    var st = history.state;
    if (st && st.tbPop) {
      if (!cur || cur.id !== st.tbPop) open(st.tbPop, null, true);
      return;
    }
    if (cur) {
      closeUI();
      e.stopImmediatePropagation();
    }
  }, true);
  // any real page change (a person, the player, the full page) closes it
  function moved() { if (cur && !pushing && !(history.state && history.state.tbPop)) closeUI(); }
  window.addEventListener("hashchange", moved, true);
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    if (typeof orig !== "function") return;
    history[m] = function () {
      var r = orig.apply(this, arguments);
      try { moved(); } catch (e) {}
      return r;
    };
  });

  function start(on) {
    if (!on || enabled) return;
    enabled = true;
    html.classList.add("tb-tmodal-on");   // instant titles stays out of the way
    var st = document.createElement("style");
    st.id = "tb-pop-css";
    st.textContent = css;
    document.head.appendChild(st);
    // reloaded while a panel was open: open it again
    try { if (history.state && history.state.tbPop) { var again = history.state.tbPop; setTimeout(function () { if (history.state && history.state.tbPop === again) open(again, null, true); }, 600); } } catch (e) {}
  }
  // Everyone: straight away. Admins only: once we know you're an admin.
  var lvl = parseInt((window.TB_CONFIG || {}).TitlePopup, 10) || 0;
  if (lvl >= 2) start(true);
  else if (lvl === 1) {
    var tries = 0;
    (function ask() {
      if (window.tbFeat && window.ApiClient && window.ApiClient.getCurrentUserId && window.ApiClient.getCurrentUserId()) window.tbFeat("TitlePopup").then(start);
      else if (++tries < 40) setTimeout(ask, 250);
    })();
  }
})();

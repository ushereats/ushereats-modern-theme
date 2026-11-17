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
  var TYPES = { Movie: 1, Series: 1, Season: 1, Episode: 1, Person: 1, BoxSet: 1 };
  var enabled = false;
  var root = null, panel = null, cur = null, gen = 0, pushing = false;

  function C() { return window.tbCards; }
  function api() { return window.ApiClient || null; }
  function uid() { try { return api().getCurrentUserId(); } catch (e) { return null; } }
  function sid() { try { return api().serverId(); } catch (e) { return ""; } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var cache = {}, KEEP = 60000;
  function get(path, params) {
    var a = api(), url = a.getUrl(path, params || {}), hit = cache[url];
    if (hit && Date.now() - hit.at < KEEP) return hit.p;
    var p = Promise.resolve(a.getJSON(url));
    cache[url] = { at: Date.now(), p: p };
    p["catch"](function () { if (cache[url] && cache[url].p === p) delete cache[url]; });
    return p;
  }
  // a title's details, kept a minute (hovering fetches them; opening the panel uses them straight away)
  var items = {};
  function itemP(id) {
    var h = items[id];
    if (h && Date.now() - h.at < KEEP) return h.p;
    var e = { at: Date.now(), v: null };
    e.p = Promise.resolve(api().getItem(uid(), id)).then(function (it) { e.v = it; return it; });
    e.p["catch"](function () { if (items[id] === e) delete items[id]; });
    items[id] = e;
    return e.p;
  }
  // anything that changes something (watched, favourite, playing) makes the kept answers stale
  function forget() { cache = {}; items = {}; }
  window.addEventListener("tb-playback-stopped", forget);
  (function () {
    var f = window.fetch;
    if (typeof f === "function") window.fetch = function (input, init) {
      var m = (init && init.method) || (input && input.method) || "GET";
      if (String(m).toUpperCase() !== "GET") forget();
      return f.apply(this, arguments);
    };
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m) { if (String(m).toUpperCase() !== "GET") forget(); return open.apply(this, arguments); };
  })();
  // the requests the panel makes (the same ones hovering makes ahead of time)
  function qNextUp(seriesId) { return get("Shows/NextUp", { userId: uid(), SeriesId: seriesId, Limit: 1, EnableResumable: true }); }
  function qSeasons(seriesId) { return get("Shows/" + seriesId + "/Seasons", { userId: uid() }); }
  function qEpisodes(seriesId, seasonId) { return get("Shows/" + seriesId + "/Episodes", { userId: uid(), seasonId: seasonId, Fields: "Overview", EnableImageTypes: "Primary,Thumb,Backdrop", ImageTypeLimit: 1 }); }
  function qPersonItems(id) { return get("Items", { userId: uid(), PersonIds: id, Recursive: true, IncludeItemTypes: "Movie,Series", SortBy: "PremiereDate,ProductionYear,SortName", SortOrder: "Descending", Fields: "PrimaryImageAspectRatio", EnableImageTypes: "Primary,Backdrop,Thumb", ImageTypeLimit: 1, Limit: 120 }); }
  function qCollection(id) { return get("Items", { userId: uid(), ParentId: id, SortBy: "PremiereDate,ProductionYear,SortName", SortOrder: "Ascending", Fields: "PrimaryImageAspectRatio", EnableImageTypes: "Primary,Backdrop,Thumb", ImageTypeLimit: 1 }); }
  function qSimilar(id) { return get("Items/" + id + "/Similar", { userId: uid(), limit: 12, Fields: "PrimaryImageAspectRatio", EnableImageTypes: "Primary,Backdrop,Thumb", ImageTypeLimit: 1 }); }
  var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
  if (base.charAt(base.length - 1) !== "/") base += "/";
  function imgUrl(id, type, tag, q) { return base + "Items/" + id + "/Images/" + type + "?" + q + "&quality=85" + (window.__tbImgFmt || "") + "&tag=" + encodeURIComponent(tag); }

  var css =
    "html.tb-pop-open #tb-pop{display:flex}" +
    "#tb-pop{display:none;position:fixed;inset:0;z-index:1200;justify-content:center;align-items:flex-start}" +
    "#tb-pop .tb-pop-shade{position:absolute;inset:0;background:rgba(0,0,0,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}" +
    "#tb-pop .tb-pop-box{position:relative;display:flex;margin-top:5vh;width:min(1100px,calc(100vw - 48px));height:90vh;max-height:90vh;border-radius:18px;overflow:hidden;isolation:isolate;" +
    "background:var(--sleekfin-background,#0b0b0d);box-shadow:0 30px 90px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.08)}" +
    // the panel's background: the title's own picture, softened, like the ambient background everywhere else
    "#tb-pop .tb-pop-amb{position:absolute;inset:0;z-index:-1;background:50% 30%/cover no-repeat;opacity:0;transition:opacity .35s ease}" +
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
    "#tb-pop .tb-pop-logo-ph{height:110px;margin:0 0 16px}" +
    "#tb-pop .tb-pop-logo,#tb-pop .tb-pop-title{animation:tbPopIn .25s ease-out}@keyframes tbPopIn{from{opacity:0}to{opacity:1}}" +
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
    "#tb-pop .tb-pop-skel i{display:block;height:13px;margin-top:5px;border-radius:7px;background:rgba(255,255,255,.1);animation:tbPopSk 1.2s ease-in-out infinite alternate}" +
    "#tb-pop .tb-pop-skel i.o{width:100%;max-width:560px;margin-top:10px}#tb-pop .tb-pop-skel i:nth-of-type(3){margin-top:20px}" +
    "#tb-pop .tb-pop-skel b{display:block;width:260px;height:44px;margin-top:24px;border-radius:10px;background:rgba(255,255,255,.08);animation:tbPopSk 1.2s ease-in-out infinite alternate}" +
    "@keyframes tbPopSk{from{opacity:.55}to{opacity:1}}" +
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
    "#tb-pop .tb-pop-ep{position:relative;border-radius:12px;transition:background-color .16s ease}" +
    "#tb-pop .tb-pop-ep+.tb-pop-ep::before{content:'';position:absolute;left:12px;right:12px;top:0;height:1px;background:rgba(255,255,255,.07)}" +
    "#tb-pop .tb-pop-ep:hover,#tb-pop .tb-pop-ep:focus-within{background:rgba(255,255,255,.05)}" +
    "#tb-pop .tb-pop-ep-btn{all:unset;box-sizing:border-box;display:grid;width:100%;cursor:pointer;grid-template-columns:64px 240px minmax(0,1fr);" +
    "grid-template-areas:'num img title' 'num img ov' 'num img foot';grid-template-rows:auto auto auto;align-content:center;column-gap:22px;row-gap:6px;padding:16px 16px 16px 6px}" +
    "#tb-pop .tb-pop-ep-n{grid-area:num;align-self:center;justify-self:center;font-family:var(--title-font,'Bebas Neue',sans-serif);font-size:46px;line-height:1;letter-spacing:.02em;color:rgba(255,255,255,.38)}" +
    "#tb-pop .tb-pop-ep[data-current] .tb-pop-ep-n{color:var(--sleekfin-accent,#4fc3f7)}" +
    "#tb-pop .tb-pop-ep[data-played]:not([data-current]) .tb-pop-ep-n{color:rgba(255,255,255,.2)}" +
    "#tb-pop .tb-pop-ep-img{grid-area:img;grid-row:1/span 3;position:relative;width:240px;height:135px;align-self:center;border-radius:8px;background:#1c1c20 center/cover no-repeat;overflow:hidden;box-shadow:0 6px 18px -8px rgba(0,0,0,.7)}" +
    "#tb-pop .tb-pop-ep[data-played]:not([data-current]) .tb-pop-ep-img{opacity:.55}" +
    "#tb-pop .tb-pop-ep-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);opacity:0;transition:opacity .16s ease}" +
    "#tb-pop .tb-pop-ep-play::after{content:'';width:44px;height:44px;border-radius:50%;box-shadow:0 4px 14px rgba(0,0,0,.5);background:#fff url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%230b0b0b' d='M8 5.5v13l11-6.5z'/%3E%3C/svg%3E\") 55% 50%/20px 20px no-repeat}" +
    "#tb-pop .tb-pop-ep:hover .tb-pop-ep-play,#tb-pop .tb-pop-ep:focus-within .tb-pop-ep-play{opacity:1}" +
    "#tb-pop .tb-pop-ep-bar{position:absolute;left:8px;right:8px;bottom:8px;height:4px;border-radius:2px;background:rgba(255,255,255,.25);overflow:hidden}" +
    "#tb-pop .tb-pop-ep-bar i{display:block;height:100%;border-radius:2px;background:var(--sleekfin-accent,#4fc3f7)}" +
    "#tb-pop .tb-pop-ep-t{grid-area:title;align-self:end;font:600 17px/1.3 var(--app-font,Inter,sans-serif);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    "#tb-pop .tb-pop-ep-o{grid-area:ov;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font:400 14px/1.5 var(--app-font,Inter,sans-serif);color:rgba(255,255,255,.62)}" +
    "#tb-pop .tb-pop-ep-f{grid-area:foot;align-self:start;display:flex;gap:16px;margin-top:2px;font:600 12px/16px var(--app-font,Inter,sans-serif);color:rgba(255,255,255,.55)}" +
    "#tb-pop .tb-pop-ep-f span{display:inline-flex;align-items:center;gap:4px}" +
    "#tb-pop .tb-pop-ep-f .material-icons{font-size:13px}" +
    "#tb-pop .tb-pop-person{display:flex;gap:36px;align-items:flex-end;padding:64px 48px 24px}" +
    "#tb-pop .tb-pop-face{flex:none;width:220px;aspect-ratio:2/3;border-radius:14px;background:#1c1c20 50% 20%/cover no-repeat;box-shadow:0 18px 40px -12px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center}" +
    "#tb-pop .tb-pop-face .material-icons{font-size:72px;opacity:.4}" +
    "#tb-pop .tb-pop-pin{min-width:0;flex:1}" +
    "#tb-pop .tb-pop-bio{-webkit-line-clamp:6}" +
    "#tb-pop .tb-pop-coll .itemsContainer{display:flex;flex-wrap:wrap;gap:0}" +
    "@media (max-width:700px){#tb-pop .tb-pop-person{flex-direction:column;align-items:flex-start;gap:18px;padding:56px 20px 16px}#tb-pop .tb-pop-face{width:140px}}" +
    "#tb-pop .tb-pop-empty{padding:18px 10px;color:rgba(255,255,255,.55);font-size:14px}" +
    "#tb-pop .tb-pop-role{opacity:.65}" +
    "@media (max-width:700px){#tb-pop .tb-pop-box{margin:0;width:100vw;max-height:none;height:100%;border-radius:0}#tb-pop .tb-pop-panel{max-height:none}" +
    "#tb-pop .tb-pop-in{padding:56px 20px 20px}#tb-pop .tb-pop-body{padding:4px 20px 32px}#tb-pop .tb-pop-title{font-size:44px}" +
    "#tb-pop .tb-pop-ep-btn{grid-template-columns:30px 40% minmax(0,1fr);grid-template-areas:'num img title' 'num img foot' 'ov ov ov';column-gap:12px;padding:12px 4px}" +
    "#tb-pop .tb-pop-ep-img{grid-row:1/span 2;width:100%;height:auto;aspect-ratio:16/9}#tb-pop .tb-pop-ep-n{grid-row:1/span 2;font-size:28px}" +
    "#tb-pop .tb-pop-ep-t{white-space:normal;font-size:15px}#tb-pop .tb-pop-ep-o{margin-top:8px;font-size:13px}" +
    "#tb-pop .tb-pop-close{top:12px;right:12px}}" +
    ".tb-pop-ghost{position:fixed;z-index:1201;pointer-events:none;background:#16161a center/cover no-repeat;transform-origin:50% 50%;will-change:transform,opacity;box-shadow:0 20px 60px rgba(0,0,0,.5)}";

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
    // Play / Resume (the main button or an episode): the title's picture stays up while the video starts,
    // instead of a black screen (36-play-launch.js)
    panel.addEventListener("click", function (e) {
      var b = e.target && e.target.closest && e.target.closest('[data-action="play"], [data-action="resume"]');
      if (!b || !window.tbLaunch) return;
      var bd = panel.querySelector(".tb-pop-bd"), lg = panel.querySelector(".tb-pop-logo"), tt = panel.querySelector(".tb-pop-title");
      var ep = b.closest(".tb-pop-ep"), sub = "";
      if (ep) {
        var n = ep.querySelector(".tb-pop-ep-n"), et = ep.querySelector(".tb-pop-ep-t");
        sub = (n && n.textContent ? "E" + parseInt(n.textContent, 10) + " · " : "") + (et ? et.textContent : "");
      } else {
        var lab = b.querySelector("span:last-child");
        sub = lab ? lab.textContent.replace(/^(Play|Resume)\s*/, "").trim() : "";
      }
      window.tbLaunch({ bg: bd && bd.style.backgroundImage, logo: lg && lg.src, title: tt ? tt.textContent : (lg ? lg.alt : ""), sub: sub });
    }, true);
    panel.addEventListener("change", function (e) {
      var s = e.target;
      if (s && s.classList && s.classList.contains("tb-pop-season") && cur) loadEpisodes(cur.seriesId, s.value, gen);
    });
  }

  // ── open / close ──
  // ── the poster growing into the panel (setting: Titles > Poster to pop-up animation) ──
  // (the setting decides, not the computer's "reduce motion": Windows turns that on with "Animation effects" off,
  // which most people did for speed, not because animations bother them)
  var ANIM = tbCfg("PopupAnimation", true) !== false;
  window.tbPopDebug = function () {
    return { popup: enabled, animation: ANIM, reduceMotionOnThisComputer: !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches), webAnimations: !!document.body.animate };
  };
  var EASE = "cubic-bezier(.2,.8,.2,1)";
  // the picture of what was clicked: where it is on screen and what it shows
  function sourceOf(el) {
    var c = el && el.closest ? (el.closest(".card[data-id]") || el.closest(".listItem[data-id]")) : null;
    var img = c && (c.querySelector(".cardImageContainer") || c.querySelector(".cardScalable") || c.querySelector(".listItemImage"));
    if (!img) return null;
    var r = img.getBoundingClientRect();
    if (r.width < 24 || r.height < 24 || r.bottom < 0 || r.top > window.innerHeight) return null;
    var bg = getComputedStyle(img).backgroundImage;
    if (!bg || bg === "none") bg = img.getAttribute("data-tb-src") ? 'url("' + img.getAttribute("data-tb-src") + '")' : null;
    if (!bg) return null;
    var sh = shapeOf(img);
    if (sh) return { el: sh.el, rect: sh.el.getBoundingClientRect(), bg: bg, radius: "0px", clip: sh.clip };
    return { el: img, rect: r, bg: bg, radius: getComputedStyle(img).borderRadius || "8px" };
  }
  // The real panel opens out of the poster's spot (a clip on the panel itself: what you see growing is exactly
  // what you end up with, at its final size), while the poster grows and fades over it. Closing runs it backwards.
  // Only clip / transform / opacity move.
  var anims = [];
  function stopAnims() { anims.forEach(function (x) { try { x.cancel(); } catch (e) {} }); anims = []; }
  // the poster's own shape: cards with a release-date or time-left badge have a notch cut out of the corner
  // (a clip on .cardScalable, in its own pixels), so the flying poster gets the same box and the same cut
  function shapeOf(el) {
    var sc = el && el.closest ? el.closest(".cardScalable") : null;
    if (!sc) return null;
    var cp = getComputedStyle(sc).clipPath;
    if (!cp || cp === "none") return null;
    return { el: sc, clip: cp };
  }
  function layer(bg, r, radius, clip) {
    var g = document.createElement("div");
    g.className = "tb-pop-ghost";
    g.style.cssText = "left:" + r.left + "px;top:" + r.top + "px;width:" + r.width + "px;height:" + r.height + "px;border-radius:" + radius + ";background-image:" + bg +
      (clip ? ";clip-path:" + clip + ";box-shadow:none" : "");
    document.body.appendChild(g);
    return g;
  }
  function insetOf(r, to) {
    var t = Math.max(0, r.top - to.top), l = Math.max(0, r.left - to.left);
    var b = Math.max(0, to.top + to.height - (r.top + r.height)), rt = Math.max(0, to.left + to.width - (r.left + r.width));
    return "inset(" + t + "px " + rt + "px " + b + "px " + l + "px round 10px)";
  }
  // two looks (setting: Titles > Animation style): "genie" = the poster flies out of its spot into the panel and
  // back down into it on close; "melt" = the poster melts in place and the panel fades into the spot on close
  var GENIE = String(tbCfg("PopupAnimationStyle", "genie")).toLowerCase() !== "melt";
  function moveTo(r, to) {
    var sx = Math.min(to.width / r.width, to.height / r.height) * 0.55;
    var dx = to.left + to.width / 2 - (r.left + r.width / 2), dy = to.top + Math.min(to.height, 520) / 2 - (r.top + r.height / 2);
    return "translate(" + dx + "px," + dy + "px) scale(" + sx.toFixed(3) + ")";
  }
  function visibleRect(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return null;
    var r = el.getBoundingClientRect();
    return r.width < 24 || r.bottom < 0 || r.top > window.innerHeight ? null : r;
  }
  function flyIn(src) {
    if (!ANIM || !src || !root || !root.animate) return;
    stopAnims();
    var box = root.querySelector(".tb-pop-box"), shade = root.querySelector(".tb-pop-shade");
    var to = box.getBoundingClientRect(), r = src.rect, D = GENIE ? 400 : 380;
    anims.push(box.animate([{ clipPath: insetOf(r, to) }, { clipPath: "inset(0px 0px 0px 0px round 18px)" }], { duration: D, easing: EASE }));
    anims.push(shade.animate([{ opacity: 0 }, { opacity: 1 }], { duration: D, easing: "ease-out" }));
    // the poster stays on its own spot and melts away in the first moment (moving it across the panel showed
    // the title twice)
    var p = layer(src.bg, r, src.radius, src.clip);
    if (GENIE) p.animate([{ transform: "none", opacity: 1 }, { transform: moveTo(r, to), opacity: 0 }], { duration: D * 0.75, easing: EASE, fill: "forwards" }).onfinish = function () { p.remove(); };
    else p.animate([{ transform: "none", opacity: 1 }, { transform: "scale(1.06)", opacity: 0 }], { duration: 170, easing: "ease-out", fill: "forwards" }).onfinish = function () { p.remove(); };
  }
  // closing: returns true when it animates (the panel is cleared when the animation ends)
  function flyBack(src, done) {
    if (!ANIM || !src || !root || !root.animate) return false;
    var sh = shapeOf(src.el);
    if (sh) { src.el = sh.el; src.clip = sh.clip; src.radius = "0px"; }
    var r = visibleRect(src.el);
    if (!r) return false;
    stopAnims();
    var box = root.querySelector(".tb-pop-box"), shade = root.querySelector(".tb-pop-shade");
    var from = box.getBoundingClientRect(), D = 300;
    root.style.pointerEvents = "none";
    var a, p = layer(src.bg, r, src.radius, src.clip);
    if (GENIE) {
      // the panel shrinks into the poster's spot while the poster flies down into it
      // (the panel dissolves on the way, so only the poster lands in the card: a still-solid panel showed as a slab
      // stuck to the poster's side near the end)
      a = box.animate([{ clipPath: "inset(0px 0px 0px 0px round 18px)", opacity: 1, offset: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 0, offset: 0.62 }, { clipPath: insetOf(r, from), opacity: 0, offset: 1 }],
        { duration: D + 20, easing: EASE, fill: "forwards" });
      p.animate([{ transform: moveTo(r, from), opacity: 0, offset: 0 }, { opacity: 1, offset: 0.3 }, { transform: "none", opacity: 1, offset: 0.85 }, { transform: "none", opacity: 1, offset: 1 }],
        { duration: D + 60, easing: EASE, fill: "forwards" }).onfinish = function () { p.remove(); };
    } else {
      // the panel fades as it shrinks into the poster's spot (no scraps of it in the small box); the poster comes
      // back underneath it
      a = box.animate([{ clipPath: "inset(0px 0px 0px 0px round 18px)", opacity: 1 }, { opacity: 1, offset: 0.35 }, { clipPath: insetOf(r, from), opacity: 0 }],
        { duration: D, easing: EASE, fill: "forwards" });
      p.style.zIndex = "1199";
      p.style.boxShadow = "none";
      p.animate([{ opacity: 0 }, { opacity: 0, offset: 0.35 }, { opacity: 1 }], { duration: D, easing: "ease-out", fill: "forwards" }).onfinish = function () {
        setTimeout(function () { p.remove(); }, 30);
      };
    }
    anims.push(a);
    anims.push(shade.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D, easing: "ease-in", fill: "forwards" }));
    a.onfinish = done;
    return true;
  }

  function open(id, type, fromHistory, src) {
    if (!id || !api() || !uid()) return false;
    frame();
    stopAnims();
    if (root) root.style.pointerEvents = "";
    var wasOpen = html.classList.contains("tb-pop-open") && !closing;
    closing = false;
    if (!fromHistory) {
      // a marker in the browser history (same address), so back / forward close and reopen the panel
      var st = {};
      try { var s0 = history.state; if (s0 && typeof s0 === "object") for (var k in s0) if (k !== "tbPop") st[k] = s0[k]; } catch (e) {}
      st.tbPop = id;
      pushing = true;
      try { if (cur && history.state && history.state.tbPop) history.replaceState(st, "", location.href); else history.pushState(st, "", location.href); } catch (e) {}
      pushing = false;
    }
    if (!fromHistory && window.tbTitleSound) window.tbTitleSound();
    var token = ++gen;
    // (opened from inside the panel, like "More like this": it was already open, nothing flies)
    var from = !fromHistory && !wasOpen && src && src.bg ? src : null;
    cur = { id: id, type: type || "", seriesId: null, src: from || (wasOpen && cur ? cur.src : null) };
    html.classList.add("tb-pop-open");
    panel.scrollTop = 0;
    var full = function (item) {
      if (token !== gen || !item) return;
      if (item.Type === "Person") return drawPerson(item, token);
      if (!TYPES[item.Type]) {
        // not something the pop-up shows (an album, a folder...): its normal page instead
        closeUI();
        try { if (history.state && history.state.tbPop) { var st2 = {}; for (var k2 in history.state) if (k2 !== "tbPop") st2[k2] = history.state[k2]; pushing = true; history.replaceState(st2, "", location.href); pushing = false; } } catch (e) { pushing = false; }
        location.hash = detailsHref(item.Id);
        return;
      }
      if (item.Type === "Season" && item.SeriesId) {
        // a season: show its show, on that season
        return itemP(item.SeriesId).then(function (series) {
          if (token !== gen || !series) return;
          cur.id = series.Id;
          draw(series, token, false, item.Id);
        });
      }
      draw(item, token, false);
    };
    var failed = function () {
      if (token !== gen) return;
      var bb = panel.querySelector(".tb-pop-body");
      if (bb) bb.innerHTML = '<div class="tb-pop-empty">Couldn’t load this title. <a href="' + detailsHref(id) + '" style="color:inherit;text-decoration:underline">Open the full page</a></div>';
    };
    // hovering the poster already fetched the details: the panel opens complete (rows included), nothing swaps
    // in afterwards
    var hit = items[id], ready = hit && hit.v && Date.now() - hit.at < KEEP ? hit.v : null;
    if (ready && ready.Type !== "Season") {
      full(ready);
      if (from) flyIn(from);
    } else {
      if (from) cur.holdUntil = Date.now() + 380;   // drawing arriving mid-animation waits for its end
      // not fetched yet: the picture first (the logo fades in when the details arrive), then everything
      var known = window.tbItemMeta && window.tbItemMeta[id];
      draw(known ? known : { Id: id, Type: type || "" }, token, true);
      if (from) flyIn(from);
      itemP(id).then(function (item) {
        var wait = cur && cur.holdUntil ? cur.holdUntil - Date.now() : 0;
        return wait > 0 ? new Promise(function (res) { setTimeout(function () { res(item); }, wait); }) : item;
      }).then(full)["catch"](failed);
    }
    try { panel.focus({ preventScroll: true }); } catch (e) {}
    return true;
  }

  var closing = false;
  function closeUI(animate) {
    if (!cur && !html.classList.contains("tb-pop-open")) return;
    var src = cur && cur.src;
    var my = ++gen;
    cur = null;
    var finish = function () {
      if (my !== gen) return;          // opened again meanwhile
      closing = false;
      stopAnims();
      if (root) root.style.pointerEvents = "";
      html.classList.remove("tb-pop-open");
      if (panel) panel.innerHTML = "";
      ambient(null);
    };
    var flew = false;
    if (animate && src) { try { closing = true; flew = flyBack(src, finish); } catch (e) { flew = false; } }
    if (!flew) finish();
  }
  function userClose() {
    if (!cur) return;
    if (history.state && history.state.tbPop) history.back();   // the back below closes it
    else closeUI(true);
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
    h += logo ? '<img class="tb-pop-logo" alt="' + esc(name) + '" src="' + esc(logo) + '">' : (name && !quick ? '<h1 class="tb-pop-title">' + esc(name) + "</h1>" : quick ? '<div class="tb-pop-logo-ph"></div>' : "");
    if (isEp) h += '<div class="tb-pop-sub">' + (it.ParentIndexNumber != null && it.IndexNumber != null ? "S" + it.ParentIndexNumber + ":E" + it.IndexNumber + " · " : "") + esc(it.Name || "") + "</div>";
    if (!quick) {
      var meta = [];
      if (it.CommunityRating) meta.push('<span><span class="tb-pop-star">★</span> ' + (Math.round(it.CommunityRating * 10) / 10) + "</span>");
      if (it.ProductionYear) meta.push("<span>" + it.ProductionYear + "</span>");
      if (it.Type === "Series" && it.ChildCount) meta.push("<span>" + it.ChildCount + (it.ChildCount === 1 ? " Season" : " Seasons") + "</span>");
      else if (it.Type === "BoxSet" && it.ChildCount) meta.push("<span>" + it.ChildCount + (it.ChildCount === 1 ? " title" : " titles") + "</span>");
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
    } else {
      // the room the details will take (rating line, genres, overview, buttons), so the logo doesn't jump up
      // when they arrive
      h += '<div class="tb-pop-skel" aria-hidden="true"><i style="width:210px"></i><i style="width:150px;margin-top:9px"></i>' +
        '<i class="o"></i><i class="o"></i><i class="o" style="width:55%"></i><b></b></div>';
    }
    h += '</div></div><div class="tb-pop-body"></div>';
    panel.innerHTML = h;
    if (quick) return;
    actions(it, token);
    var wait = cur && cur.holdUntil ? cur.holdUntil - Date.now() : 0;
    if (wait > 0) { setTimeout(function () { if (token === gen) rows(it, token, isEp, seasonId); }, wait); return; }
    rows(it, token, isEp, seasonId);
  }
  function rows(it, token, isEp, seasonId) {
    var body = panel.querySelector(".tb-pop-body");
    if (!body) return;
    if (it.Type === "BoxSet") { collection(it.Id, body, token); return; }
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

  // an actor / director: photo, born, about, and everything they're in from your library
  function drawPerson(p, token) {
    var a = api(), s = sid();
    var pic = p.ImageTags && p.ImageTags.Primary && a ? a.getScaledImageUrl(p.Id, { type: "Primary", tag: p.ImageTags.Primary, maxHeight: 900, quality: 90 }) : null;
    ambient(pic);
    var born = "";
    if (p.PremiereDate) { try { born = new Date(p.PremiereDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }); } catch (e) {} }
    var where = p.ProductionLocations && p.ProductionLocations[0] ? p.ProductionLocations[0] : "";
    var h = '<div class="tb-pop-bar"><button type="button" class="tb-pop-close" aria-label="Close"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
    h += '<div class="tb-pop-person">' + (pic ? '<div class="tb-pop-face" style="background-image:url(&quot;' + esc(pic) + '&quot;)"></div>' : '<div class="tb-pop-face">' + icon("person") + "</div>") + '<div class="tb-pop-pin">';
    h += '<h1 class="tb-pop-title">' + esc(p.Name) + "</h1>";
    if (born || where) h += '<div class="tb-pop-meta">' + (born ? "<span>Born " + esc(born) + "</span>" : "") + (where ? "<span>" + esc(where) + "</span>" : "") + "</div>";
    if (p.Overview) h += '<p class="tb-pop-ov tb-pop-bio">' + esc(p.Overview) + "</p>";
    var iu = p.UserData || {};
    h += '<div class="tb-pop-actions" is="emby-itemscontainer">' +
      '<button is="emby-ratingbutton" type="button" data-action="none" class="tb-pop-ic sleekfin-control-3d" title="Favourite" data-id="' + p.Id + '" data-serverid="' + esc(p.ServerId || s) + '" data-itemtype="Person" data-likes="" data-isfavorite="' + !!iu.IsFavorite + '">' + icon("favorite") + "</button>" +
      '<a class="tb-pop-ic sleekfin-control-3d tb-pop-full" href="' + detailsHref(p.Id) + '" title="Full page">' + icon("open_in_full") + "</a></div>";
    h += '</div></div><div class="tb-pop-body"></div>';
    panel.innerHTML = h;
    upgrade(panel.querySelector(".tb-pop-person"));
    var body = panel.querySelector(".tb-pop-body");
    qPersonItems(p.Id).then(function (r) {
      if (token !== gen) return;
      var items = (r && r.Items) || [];
      var films = items.filter(function (x) { return x.Type === "Movie"; }), shows = items.filter(function (x) { return x.Type === "Series"; });
      if (!items.length) { body.innerHTML = '<div class="tb-pop-empty">Nothing with ' + esc(p.Name) + " in your library yet.</div>"; return; }
      if (films.length) put(body, row("Movies", cardsOf(films), "tb-pop-films"));
      if (shows.length) put(body, row("Shows", cardsOf(shows), "tb-pop-shows"));
    }, function () { if (token === gen) body.innerHTML = '<div class="tb-pop-empty">Couldn\u2019t load their titles.</div>'; });
  }
  function cardsOf(items) {
    var c = C(), slim = window.__tbRowsBoot && window.__tbRowsBoot.slim, s = sid(), out = "";
    items.forEach(function (x, i) {
      var it = slim ? slim(x) : { Id: x.Id, Name: x.Name, Type: x.Type, ProductionYear: x.ProductionYear, Primary: x.ImageTags && x.ImageTags.Primary, UserData: x.UserData || {} };
      out += c.card(it, "poster", i, s, "", false, false);
    });
    return out;
  }
  // a collection: its films in order, as a grid
  function collection(id, body, token) {
    qCollection(id).then(function (r) {
      if (token !== gen) return;
      var c = C(), items = (r && r.Items) || [];
      if (!c || !items.length) return;
      var sec = c.frag(c.section({ title: "In this collection", cls: "tb-row show-card-titles tb-pop-coll", cards: cardsOf(items), wrap: true }));
      put(body, sec);
    }, function () {});
  }
  var ambUrl = null;
  function ambient(url) {
    var a = root && root.querySelector(".tb-pop-amb");
    if (!a || url === ambUrl) return;
    ambUrl = url;
    if (!url) { a.classList.remove("on"); a.style.backgroundImage = ""; return; }
    // the softened picture, made once: a tiny copy squashed and smoothed on a canvas, then stretched (looks
    // blurred, costs nothing: a live blur filter re-blurred the whole panel every frame of every animation)
    var small = url.replace(/([?&])(maxWidth|fillWidth)=\d+/i, "$1$2=160");
    var im = new Image();
    a.classList.remove("on");
    im.onload = function () {
      if (ambUrl !== url) return;
      var out = 'url("' + small.replace(/"/g, "%22") + '")';
      try {
        var c1 = document.createElement("canvas"), c2 = document.createElement("canvas");
        c1.width = 24; c1.height = 14; c2.width = 192; c2.height = 108;
        c1.getContext("2d").drawImage(im, 0, 0, 24, 14);
        var g = c2.getContext("2d");
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
        if ("filter" in g) g.filter = "saturate(1.25)";
        g.drawImage(c1, 0, 0, 192, 108);
        out = 'url("' + c2.toDataURL("image/jpeg", 0.85) + '")';
      } catch (e) {}
      a.style.backgroundImage = out;
      a.classList.add("on");
    };
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
      if (target && target.Type === "Episode" && cur) { cur.nextId = target.Id; markCurrent(); }
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
      h += '<a class="tb-pop-ic sleekfin-control-3d tb-pop-full" href="' + detailsHref(it.Id) + '" title="Full page">' + icon("open_in_full") + "</a>";
      box.innerHTML = h;
      upgrade(box);
    }
    if (it.Type === "Series") {
      // the episode to continue with: Jellyfin's own Next Up for this show
      qNextUp(it.Id).then(function (r) {
        build(r && r.Items && r.Items[0] ? r.Items[0] : it);
      }, function () { build(it); });
    } else build(it);
  }

  function seasons(seriesId, want, token, wantNum) {
    qSeasons(seriesId).then(function (r) {
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
      qNextUp(seriesId).then(function (n) {
        var e = n && n.Items && n.Items[0];
        go(e && e.SeasonId);
      }, function () { go(null); });
    }, function () {
      if (token !== gen) return;
      var b = panel.querySelector(".tb-pop-eps");
      if (b) b.innerHTML = '<div class="tb-pop-empty">Couldn’t load the episodes.</div>';
    });
  }

  function markCurrent() {
    if (!panel || !cur) return;
    Array.prototype.forEach.call(panel.querySelectorAll(".tb-pop-ep"), function (e) {
      var on = cur.nextId ? e.getAttribute("data-id") === cur.nextId : e.hasAttribute("data-positionticks");
      if (on) e.setAttribute("data-current", ""); else e.removeAttribute("data-current");
    });
  }
  function loadEpisodes(seriesId, seasonId, token) {
    var box = panel.querySelector(".tb-pop-eps");
    if (!box || !seriesId || !seasonId) return;
    box.style.minHeight = Math.max(120, box.offsetHeight) + "px";   // keeps its height while the next season loads
    qEpisodes(seriesId, seasonId).then(function (r) {
      if (token !== gen || !box.isConnected) return;
      var eps = (r && r.Items) || [], h = "";
      eps.forEach(function (e) {
        var u = e.UserData || {}, still = "";
        if (e.ImageTags && e.ImageTags.Primary) still = imgUrl(e.Id, "Primary", e.ImageTags.Primary, "fillWidth=400&fillHeight=225");
        else if (e.ParentThumbItemId && e.ParentThumbImageTag) still = imgUrl(e.ParentThumbItemId, "Thumb", e.ParentThumbImageTag, "fillWidth=400&fillHeight=225");
        else if (e.ParentBackdropItemId && e.ParentBackdropImageTags && e.ParentBackdropImageTags[0]) still = imgUrl(e.ParentBackdropItemId, "Backdrop", e.ParentBackdropImageTags[0], "fillWidth=400&fillHeight=225");
        var pct = u.PlaybackPositionTicks && e.RunTimeTicks ? Math.min(100, Math.max(1, Math.round(u.PlaybackPositionTicks / e.RunTimeTicks * 100))) : 0;
        var n = e.IndexNumber != null ? (e.IndexNumber < 10 ? "0" : "") + e.IndexNumber : "";
        var foot = (e.RunTimeTicks ? "<span>" + icon("play_arrow") + runtime(e.RunTimeTicks) + "</span>" : "") +
          (e.CommunityRating ? "<span>" + icon("star") + (Math.round(e.CommunityRating * 10) / 10).toFixed(1) + "</span>" : "");
        h += '<div class="tb-pop-ep"' + attrs(e, true) + (u.Played ? " data-played" : "") + '><button type="button" class="itemAction tb-pop-ep-btn" data-action="' + (u.PlaybackPositionTicks ? "resume" : "play") + '" title="Play ' + esc(e.Name) + '">' +
          '<span class="tb-pop-ep-n">' + n + "</span>" +
          '<span class="tb-pop-ep-img"' + (still ? ' style="background-image:url(&quot;' + esc(still) + '&quot;)"' : "") + '><span class="tb-pop-ep-play"></span>' + (pct ? '<span class="tb-pop-ep-bar"><i style="width:' + pct + '%"></i></span>' : "") + "</span>" +
          '<span class="tb-pop-ep-t">' + esc(e.Name) + "</span>" +
          (e.Overview ? '<span class="tb-pop-ep-o">' + esc(e.Overview) + "</span>" : "") +
          (foot ? '<span class="tb-pop-ep-f">' + foot + "</span>" : "") + "</button></div>";
      });
      box.innerHTML = h || '<div class="tb-pop-empty">No episodes in this season yet.</div>';
      box.style.minHeight = "";
      markCurrent();
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
    qSimilar(id).then(function (r) {
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

  // ── hovering a title for a moment gets its whole panel ready (so clicking shows it complete) ──
  var warmT = 0, warmedAt = {};
  var warmPics = {};
  function preload(id, type) {
    if (!enabled || !id || !api() || !uid()) return;
    // the wide picture the panel (and its opening animation) shows, in the browser before the click
    var mt = window.tbItemMeta && window.tbItemMeta[id], bu = mt && window.tbBackdropUrl ? window.tbBackdropUrl(mt) : null;
    if (bu && !warmPics[bu]) { warmPics[bu] = 1; var wi = new Image(); wi.decoding = "async"; wi.src = bu; }
    if (warmedAt[id] && Date.now() - warmedAt[id] < KEEP) return;
    warmedAt[id] = Date.now();
    var pics = function (r) {
      ((r && r.Items) || []).slice(0, 8).forEach(function (e) {
        if (e.ImageTags && e.ImageTags.Primary) { var im = new Image(); im.decoding = "async"; im.src = imgUrl(e.Id, "Primary", e.ImageTags.Primary, "fillWidth=400&fillHeight=225"); }
      });
    };
    var show = function (seriesId, seasonId) {
      qSeasons(seriesId);
      if (seasonId) qEpisodes(seriesId, seasonId).then(pics, function () {});
      else qNextUp(seriesId).then(function (n) { var e = n && n.Items && n.Items[0]; if (e && e.SeasonId) qEpisodes(seriesId, e.SeasonId).then(pics, function () {}); }, function () {});
    };
    itemP(id).then(function (it) {
      if (!it) return;
      if (it.Type === "Series") { qNextUp(it.Id); show(it.Id, null); qSimilar(it.Id); }
      else if (it.Type === "Episode" && it.SeriesId) { show(it.SeriesId, it.SeasonId); qSimilar(it.SeriesId); }
      else if (it.Type === "Season" && it.SeriesId) { itemP(it.SeriesId); show(it.SeriesId, it.Id); qSimilar(it.SeriesId); }
      else if (it.Type === "Person") qPersonItems(it.Id);
      else if (it.Type === "BoxSet") qCollection(it.Id);
      else qSimilar(it.Id);
    })["catch"](function () {});
  }
  document.addEventListener("mouseover", function (e) {
    if (!enabled) return;
    var card = e.target && e.target.closest && e.target.closest(".card[data-id]");
    clearTimeout(warmT);
    if (!card || !TYPES[card.getAttribute("data-type")]) return;
    var id = card.getAttribute("data-id"), type = card.getAttribute("data-type");
    warmT = setTimeout(function () { preload(id, type); }, 150);
  }, { capture: true, passive: true });

  // ── every way of opening a title opens the panel instead of the page ──
  // cards, the home banner's "More info", the show name under an episode, list rows, plain links to a title
  function typeOf(id) {
    var m = window.tbItemMeta && window.tbItemMeta[id];
    if (m && m.Type) return Promise.resolve(m.Type);
    return Promise.resolve(api().getItem(uid(), id)).then(function (it) { return it && it.Type; });
  }
  window.addEventListener("click", function (e) {
    if (!enabled || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (html.classList.contains("layout-tv") || document.body.classList.contains("dashboardDocument")) return;
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".tb-pop-full, .tb-pop-ep, #tb-pop .tb-pop-actions")) return;   // full page button; the panel's own play buttons
    // a card's or row's own buttons (play, watched, favourite, menu) keep doing what they do
    var act = t.closest("[data-action]");
    if (act && act.getAttribute("data-action") !== "link") return;
    var btn = t.closest("button");
    if (btn && btn !== act) return;
    var id = null, type = null;
    var holder = act ? (act.hasAttribute("data-id") ? act : act.closest("[data-id]")) : t.closest(".card[data-id], .listItem[data-id]");
    if (holder) {
      id = holder.getAttribute("data-id");
      type = holder.getAttribute("data-type") || ((holder.closest(".card[data-id], .listItem[data-id]") || holder).getAttribute("data-type"));
    } else {
      var a = t.closest("a[href]"), m = a && /details\?(?:[^#]*&)?id=([0-9a-f]{32}|[0-9a-f-]{36})/i.exec(a.getAttribute("href") || "");
      if (m) id = m[1].replace(/-/g, "");
    }
    if (!id || (type && !TYPES[type])) return;
    if (!api() || !uid()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var src = ANIM ? sourceOf(t) : null;
    if (type) { open(id, type, false, src); return; }
    // a plain link: find out what it is, then the panel or its normal page
    typeOf(id).then(function (tp) {
      if (TYPES[tp]) open(id, tp, false, src);
      else location.hash = detailsHref(id);
    }, function () { location.hash = detailsHref(id); });
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
      closeUI(true);
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

  // for the hover cards: open a title's panel, growing from a given picture ({ rect, bg, radius })
  window.tbPopOpen = function (id, type, src) {
    if (!enabled || !TYPES[type]) return false;
    return open(id, type, false, src && src.bg ? src : null);
  };

  function start(on) {
    if (!on || enabled) return;
    enabled = true;
    var st = document.createElement("style");
    st.id = "tb-pop-css";
    st.textContent = css;
    document.head.appendChild(st);
    // landed straight on a title's page (a shared link, a bookmark): home, with that title's panel on top
    var dm = /^#!?\/?details\?(?:[^#]*&)?id=([0-9a-f]{32}|[0-9a-f-]{36})/i.exec(location.hash);
    if (dm) {
      var did = dm[1].replace(/-/g, "");
      (function when() {
        if (!api() || !uid()) return setTimeout(when, 200);
        typeOf(did).then(function (tp) {
          if (!TYPES[tp] || !/details/i.test(location.hash)) return;
          location.replace(location.href.replace(/#.*$/, "#/home"));
          setTimeout(function () { open(did, tp); }, 400);
        }, function () {});
      })();
    }
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

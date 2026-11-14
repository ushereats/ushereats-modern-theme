(function prefetchDetails() {
  // Details pages open faster:
  //  - resting the pointer on a poster (or focusing it with a remote) gets that title, its backdrop and its logo
  //    ready, so they're already there when you click
  //  - the details page asks for the same title several times when it opens: asked once, shared
  // Only one kind of request is shared ("this title, for this user"), for 15 s at most, and anything that
  // changes something (watched, favourite, edit...) clears it.
  if (window.__tbPrefetch || !window.fetch) return;
  window.__tbPrefetch = true;

  // Jellyfin 10.9+ uses /Items/{id}?userId=... ; older used /Users/{uid}/Items/{id}. Match both.
  var ITEM = /\/Items\/[0-9a-f]{32}(\?|$)/i;
  var ITEM_KEEP = 600000, ITEM_FRESH = 15000;
  var cache = {};   // url -> { at, x: { status, statusText, headers, body } }

  function key(url) { return String(url).replace(/^https?:\/\/[^/]+/i, "").replace(/[?&]tbBench=\d+/, ""); }
  function clear() { cache = {}; lists = {}; }

  // ── library pages like the home rows ──
  // A library page (Movies, Shows, a collection, a genre...) you've already opened shows at once from the
  // copy kept from last time, and is checked for changes in the background right away (the next visit gets
  // what changed). Kept 10 minutes, in this tab only; anything you change (watched, favourite, edit...) clears it.
  var LIST = /\/(Users\/[0-9a-f]{32}\/)?Items\?(?=.*[?&]ParentId=)/i;
  var LIST_KEEP = 600000, LIST_FRESH = 20000, LIST_MAX = 40;
  var lists = {};
  function grab(self, args) {
    return realFetch.apply(self, args).then(function (r) {
      return r.text().then(function (body) {
        var h = {};
        r.headers.forEach(function (v, n) { h[n] = v; });
        return { status: r.status, statusText: r.statusText, headers: h, body: body };
      });
    });
  }
  function respond(x) { return new Response(x.body, { status: x.status, statusText: x.statusText, headers: x.headers }); }
  function listFetch(self, args, url) {
    var k = key(url), hit = lists[k], now = Date.now();
    if (hit && hit.x && now - hit.at < LIST_KEEP) {
      if (now - hit.at > LIST_FRESH && !hit.busy) {
        hit.busy = true;
        grab(self, args).then(function (x) { if (x.status === 200 && lists[k] === hit) lists[k] = { at: Date.now(), x: x }; else hit.busy = false; }, function () { hit.busy = false; });
      }
      return Promise.resolve(respond(hit.x));
    }
    return grab(self, args).then(function (x) {
      if (x.status === 200) {
        var ks = Object.keys(lists);
        if (ks.length >= LIST_MAX) delete lists[ks.sort(function (a, b) { return lists[a].at - lists[b].at; })[0]];
        lists[k] = { at: Date.now(), x: x };
      }
      return respond(x);
    });
  }

  // ── Favourites (the home page's second tab) ──
  // Jellyfin asks for each kind of favourite separately (movies, shows, episodes, people, artists, studios...) and
  // shows the tab once they're back. Kept like the library pages, and the requests it made last time are made again
  // in idle time after the site opens, so even the first visit of a session shows at once.
  var FAV = /[?&](Filters=[^&]*IsFavorite|isFavorite=true)/i;
  var FAV_KEY = "tb-fav-urls";
  function rememberFav(url) {
    try {
      var k = String(new URL(url, location.href)), l = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
      if (l.indexOf(k) >= 0) return;
      l.push(k); if (l.length > 24) l.shift();
      localStorage.setItem(FAV_KEY, JSON.stringify(l));
    } catch (e) {}
  }
  function warmFavs() {
    var api = window.ApiClient, uid = api && api.getCurrentUserId && api.getCurrentUserId();
    if (!uid || !api.accessToken || !api.accessToken()) return;
    var l = [];
    try { l = JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch (e) {}
    l.forEach(function (k, i) {
      if (k.indexOf(uid) < 0 || lists[key(k)]) return;   // another user's, or already here
      setTimeout(function () {
        window.fetch(k, { headers: { Authorization: 'MediaBrowser Token="' + api.accessToken() + '"' } })["catch"](function () {});
      }, i * 60);
    });
  }
  window.addEventListener("load", function () {
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 2500); };
    setTimeout(function () { idle(warmFavs, { timeout: 4000 }); }, 2500);
  });

  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method !== "GET") {
      clear();
      if (/\/Sessions\/Playing\/Stopped/i.test(url)) { try { window.dispatchEvent(new Event("tb-playback-stopped")); } catch (e) {} }
      return realFetch.apply(this, arguments);
    }
    if (LIST.test(url) && !(init && init.cache === "no-store") && !/[?&](SearchTerm|searchTerm)=/.test(url) && !/^#\/?home/i.test(location.hash)) return listFetch(this, arguments, url);
    // Favourites: shown at once from the copy kept from last time (and fetched ahead in idle time, see below)
    if (FAV.test(url) && !(init && init.cache === "no-store")) { rememberFav(url); return listFetch(this, arguments, url); }
    if (!ITEM.test(url) || (init && init.cache === "no-store")) return realFetch.apply(this, arguments);
    var k = key(url), hit = cache[k], now = Date.now();
    // stale-while-revalidate: return stale data at once, refresh in background
    if (hit && hit.x && now - hit.at < ITEM_KEEP) {
      if (now - hit.at > ITEM_FRESH && !hit.busy) {
        hit.busy = true;
        grab(this, arguments).then(function (x) { if (x.status === 200 && cache[k] === hit) cache[k] = { at: Date.now(), x: x }; else hit.busy = false; }, function () { hit.busy = false; });
      }
      return Promise.resolve(respond(hit.x));
    }
    return grab(this, arguments).then(function (x) {
      if (x.status === 200) cache[k] = { at: Date.now(), x: x };
      return respond(x);
    });
  };
  // changes made through Jellyfin's newer code (XMLHttpRequest) also clear it
  var open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (String(method).toUpperCase() !== "GET") {
      clear();
      if (/\/Sessions\/Playing\/Stopped/i.test(String(url || ""))) { try { window.dispatchEvent(new Event("tb-playback-stopped")); } catch (e) {} }
    }
    return open.apply(this, arguments);
  };

  function webp() { return /webp/.test(window.__tbImgFmt || ""); }
  function fmt(clear) { return webp() ? "webp" : clear ? "" : "jpg"; }

  // ── posters made by Jellyfin's newer pages (they build their own image links, not through ApiClient) ──
  // The same as below: twice the size, quality 96, WebP. Changed as the link is put on the picture, before it
  // downloads. Links that already name a format (ours, the theme's own rows) are left alone.
  var IMG = /\/Items\/[0-9a-f]{32}\/Images\/(Primary|Thumb|Banner)(\/\d+)?\?/i;
  // Jellyfin's React pages pre-multiply by DPR before setting img.src.
  // We divide back to CSS pixels, then apply our one rule: CSS × max(2, min(DPR, 3)), snapped to 40 px.
  var _pbDpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  var _pbK = Math.max(2, _pbDpr);
  function _snap40(px) { return px ? Math.min(1000, Math.ceil(px / 40) * 40) : px; }
  function sharpUrl(u) {
    if (typeof u !== "string" || u.length > 2000 || !IMG.test(u) || /[?&]format=/i.test(u)) return u;
    try {
      var i = u.indexOf("?"), q = new URLSearchParams(u.slice(i + 1));
      var fw = +q.get("fillWidth") || 0, fh = +q.get("fillHeight") || 0;
      if (!(fw || fh || q.get("maxWidth") || q.get("maxHeight") || q.get("width") || q.get("height"))) return u;
      if (fw && fh) {
        var nw = _snap40((fw / _pbDpr) * _pbK);
        q.set("fillWidth", nw); q.set("fillHeight", Math.round(nw * fh / fw));
      } else {
        ["fillWidth", "fillHeight", "maxWidth", "maxHeight", "width", "height"].forEach(function(n) {
          var v = +q.get(n); if (v) q.set(n, _snap40((v / _pbDpr) * _pbK));
        });
      }
      q.set("quality", Math.max(+q.get("quality") || 0, (window.TB_CONFIG && window.TB_CONFIG.PosterQuality) || 85));
      q.set("format", fmt(false));
      return u.slice(0, i) + "?" + q.toString();
    } catch (e) { return u; }
  }
  window.tbSharpUrl = sharpUrl;
  (function patchImages() {
    try {
      var d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
      if (d && d.set && d.configurable) {
        Object.defineProperty(HTMLImageElement.prototype, "src", { configurable: true, enumerable: d.enumerable, get: d.get, set: function (v) { d.set.call(this, sharpUrl(v)); } });
      }
      var sa = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (n, v) {
        if (this instanceof HTMLImageElement && (n === "src" || n === "SRC")) v = sharpUrl(String(v));
        return sa.call(this, n, v);
      };
      var bd = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, "backgroundImage");
      if (bd && bd.set && bd.configurable) {
        Object.defineProperty(CSSStyleDeclaration.prototype, "backgroundImage", { configurable: true, enumerable: bd.enumerable, get: bd.get,
          set: function (v) { bd.set.call(this, typeof v === "string" && v.indexOf("/Images/") > 0 ? v.replace(/url\((["']?)([^"')]+)\1\)/g, function (m, qq, u) { return "url(" + qq + sharpUrl(u) + qq + ")"; }) : v); } });
      }
    } catch (e) {}
  })();

  // ── title logos at the size they're shown ──
  // Jellyfin's title page asks for a title's logo with no size, so the full original comes down (often
  // 0.3-1 MB, sometimes thousands of pixels wide) for a logo shown about 340 px wide. Every logo link made
  // through Jellyfin's connection now asks for one a little bigger than it's ever shown (sharp on high-DPI
  // screens too). Logos asked for with a size of their own are left as they are.
  function sizeLogos(api) {
    if (!api || api.__tbLogoSized || typeof api.getScaledImageUrl !== "function") return;
    api.__tbLogoSized = true;
    var dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    var W = Math.min(1800, Math.ceil(600 * dpr)), H = Math.min(600, Math.ceil(200 * dpr));
    // ApiClient receives CSS pixel values; apply the one-rule multiplier, snap to 40 px.
    var k = Math.max(2, dpr);
    var depth = 0;
    function copy(o) { var c = {}; for (var x in o) c[x] = o[x]; return c; }
    function up(v) { return v ? Math.min(1000, Math.ceil(v * k / 40) * 40) : v; }
    function sharpen(o) {
      var c = copy(o);
      // fill sizes keep their exact shape (the server crops to it)
      var r = c.fillWidth && c.fillHeight ? c.fillHeight / c.fillWidth : 0;
      ["fillWidth", "maxWidth", "width"].forEach(function (n) { if (c[n]) c[n] = up(+c[n]); });
      if (r) c.fillHeight = Math.round(c.fillWidth * r);
      ["maxHeight", "height"].concat(r ? [] : ["fillHeight"]).forEach(function (n) { if (c[n]) c[n] = up(+c[n]); });
      c.quality = Math.max(+c.quality || 0, (window.TB_CONFIG && window.TB_CONFIG.PosterQuality) || 85);
      // named format (WebP, else JPEG) so a cache in front of the server keeps them apart; art and disc
      // images can be see-through, so they only get WebP (JPEG has no transparency)
      if (!c.format) { var f = fmt(/^(art|disc)$/i.test(String(c.type || ""))); if (f) c.format = f; }
      return c;
    }
    ["getScaledImageUrl", "getImageUrl"].forEach(function (m) {
      var orig = api[m];
      if (typeof orig !== "function") return;
      api[m] = function (id, o) {
        // getScaledImageUrl calls getImageUrl: only the outer call changes the size
        if (depth) return orig.call(this, id, o);
        if (o && typeof o === "object") {
          var type = String(o.type || "");
          if (/^logo$/i.test(type) && !(o.maxWidth || o.maxHeight || o.width || o.height || o.fillWidth || o.fillHeight)) {
            o = copy(o);
            o.maxWidth = W; o.maxHeight = H;
          } else if (/^(primary|thumb|banner|art|disc)$/i.test(type) && (o.fillWidth || o.maxWidth || o.width || o.fillHeight || o.maxHeight || o.height)) {
            // library pages, lists, search, seasons, cast: Jellyfin asks for each card's image at (about) the card's
            // size, which the server's resize leaves soft. Same as the home rows: twice the size (up to the screen's
            // own sharpness, never past 1000 px), quality 96, and WebP where the browser shows it.
            o = sharpen(o);
          }
        }
        depth++;
        try { return orig.call(this, id, o); } finally { depth--; }
      };
    });
  }
  (function watchApi() {
    // Jellyfin sets (and can replace) its connection on window.ApiClient: size logos on whichever is current
    var current = window.ApiClient;
    sizeLogos(current);
    try {
      var d = Object.getOwnPropertyDescriptor(window, "ApiClient");
      if (!d || d.configurable) {
        Object.defineProperty(window, "ApiClient", {
          configurable: true, enumerable: true,
          get: function () { return current; },
          set: function (v) { current = v; try { sizeLogos(v); } catch (e) {} }
        });
        return;
      }
    } catch (e) {}
    var n = 0, t = setInterval(function () { sizeLogos(window.ApiClient); if (++n > 40) clearInterval(t); }, 250);
  })();

  // ── Home: the logo (top left) and the Home button ──
  // Straight to the very top of home with the same cross-fade as every page change (like cinejoy). The logo's link is
  // "/", which Jellyfin first opens as an empty page and only then sends on to home; the Home button calls this itself.
  function goHome() {
    if (/^#\/home(\.html)?(\?|$)/.test(location.hash) && !/[?&]tab=/.test(location.hash)) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    if (window.tbCrossfade) window.tbCrossfade(300);
    location.hash = "#/home";
    if (window.tbScroll && !document.documentElement.classList.contains("tb-vt")) window.tbScroll.top();
  }
  window.tbGoHome = goHome;
  document.addEventListener("click", function (e) {
    if (window.__tbNoHomeFix || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    if (!/^(#!?\/|\/?(web\/)?(index\.html)?#!?\/|\/)$/.test(a.getAttribute("href") || "")) return;
    e.preventDefault();
    e.stopPropagation();
    goHome();
  }, true);

  // the backdrop link a title page uses (exactly SleekFin's / Jellyfin's, so the browser downloads it once)
  function backdropUrl(item) {
    var api = window.ApiClient;
    if (!api || !item) return null;
    var w = window.tbBackdropWidth ? window.tbBackdropWidth() : 1920;
    var own = item.BackdropImageTags && item.BackdropImageTags.length;
    var bOwner = own ? item.BackdropItemId || item.Id : item.ParentBackdropItemId;
    var bTag = own ? item.BackdropImageTags[0] : (item.ParentBackdropImageTags || [])[0];
    if (!bOwner || !bTag) return null;
    var bdFmt = /webp/.test(window.__tbImgFmt || "") ? "webp" : "jpg";
    return api.getScaledImageUrl(bOwner, { type: "Backdrop", tag: bTag, maxWidth: w, quality: 80, format: bdFmt, index: 0 });
  }
  window.tbBackdropUrl = backdropUrl;

  // ── getting a title ready before it's clicked ──
  var warmed = {}, timer = 0;
  function warm(id) {
    var api = window.ApiClient;
    if (!api || !id || warmed[id] && Date.now() - warmed[id] < ITEM_FRESH) return;
    warmed[id] = Date.now();
    if (window.tbLoadPart) window.tbLoadPart("details");
    var uid = api.getCurrentUserId();
    if (!uid) return;
    var auth = { headers: { Authorization: 'MediaBrowser Token="' + api.accessToken() + '"' } };
    // Use Jellyfin's own getItem so the URL and fields match exactly what the details page requests,
    // ensuring our fetch interceptor's cache is populated with the right key.
    api.getItem(uid, id)
      .then(function (item) {
        if (!item) return;
        var imgs = [];
        (window.tbItemMeta || (window.tbItemMeta = {}))[item.Id] = item;
        var bd = backdropUrl(item);
        if (bd) { imgs.push(bd); if (window.tbAmbientWarm) window.tbAmbientWarm(bd); }
        if (item.ImageTags && item.ImageTags.Logo) imgs.push(api.getScaledImageUrl(item.Id, { type: "Logo", tag: item.ImageTags.Logo }));
        else if (item.ParentLogoItemId && item.ParentLogoImageTag) imgs.push(api.getScaledImageUrl(item.ParentLogoItemId, { type: "Logo", tag: item.ParentLogoImageTag }));
        imgs.forEach(function (u, i) { var im = new Image(); im.decoding = "async"; if (i === 0) im.fetchPriority = "high"; im.src = u; });
        // fire the same related requests the details page will make, so they're cached (or in-flight) on arrival
        var extras = [
          "Items/" + id + "/Similar?userId=" + uid + "&limit=12",
          "Items/" + id + "/Ancestors?userId=" + uid,
          "Items/" + id + "/ThemeMedia?userId=" + uid + "&inheritFromParent=true",
        ];
        if (item.Type === "Series") {
          extras.push("Shows/" + id + "/Seasons?userId=" + uid + "&fields=BasicSyncInfo,ImageTags");
          extras.push("Shows/NextUp?userId=" + uid + "&SeriesId=" + id + "&limit=1");
        }
        extras.forEach(function (path) { window.fetch(api.getUrl(path), auth)["catch"](function () {}); });
      })
      .catch(function () {});
  }
  function idOf(t) {
    var card = t && t.closest && t.closest(".card[data-id]");
    if (!card) return null;
    var type = card.getAttribute("data-type");
    return /^(Movie|Series|Season|Episode|BoxSet|MusicAlbum|MusicArtist|Video|MusicVideo)$/.test(type || "") ? card.getAttribute("data-id") : null;
  }
  // a short rest on a poster (not every poster the pointer crosses)
  document.addEventListener("mouseover", function (e) {
    var id = idOf(e.target);
    clearTimeout(timer);
    if (id) timer = setTimeout(function () { warm(id); }, 120);
  }, true);
  document.addEventListener("focusin", function (e) { var id = idOf(e.target); if (id) warm(id); }, true);
  document.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse" && e.button === 0) { var id = idOf(e.target); if (id) warm(id); } }, true);
  // phones: the moment a finger lands on a poster
  document.addEventListener("touchstart", function (e) { var id = idOf(e.target); if (id) warm(id); }, { capture: true, passive: true });
})();

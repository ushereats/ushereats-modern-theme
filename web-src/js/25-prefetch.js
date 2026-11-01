(function prefetchDetails() {
  // Details pages open faster:
  //  - resting the pointer on a poster (or focusing it with a remote) gets that title, its backdrop and its logo
  //    ready, so they're already there when you click
  //  - the details page asks for the same title several times when it opens: asked once, shared
  // Only one kind of request is shared ("this title, for this user"), for 15 s at most, and anything that
  // changes something (watched, favourite, edit...) clears it.
  if (window.__tbPrefetch || !window.fetch) return;
  window.__tbPrefetch = true;

  var ITEM = /\/Users\/[0-9a-f]{32}\/Items\/[0-9a-f]{32}(\?|$)/i;
  var TTL = 15000;
  var cache = {};   // url -> { at, p: Promise<{ status, statusText, headers, body }> }

  function key(url) { return String(url).replace(/^https?:\/\/[^/]+/i, "").replace(/[?&]tbBench=\d+/, ""); }
  function clear() { cache = {}; }

  var realFetch = window.fetch;
  window.fetch = function (input, init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (method !== "GET") {
      clear();
      if (/\/Sessions\/Playing\/Stopped/i.test(url)) { try { window.dispatchEvent(new Event("tb-playback-stopped")); } catch (e) {} }
      return realFetch.apply(this, arguments);
    }
    if (!ITEM.test(url) || /[?&](fields|Fields)=/.test(url) || (init && init.cache === "no-store")) return realFetch.apply(this, arguments);
    var k = key(url), hit = cache[k];
    if (!hit || Date.now() - hit.at > TTL) {
      var p = realFetch.apply(this, arguments).then(function (r) {
        return r.text().then(function (body) {
          var h = {};
          r.headers.forEach(function (v, n) { h[n] = v; });
          return { status: r.status, statusText: r.statusText, headers: h, body: body };
        });
      });
      hit = cache[k] = { at: Date.now(), p: p };
      p.then(function (x) { if (x.status !== 200 && cache[k] === hit) delete cache[k]; }, function () { if (cache[k] === hit) delete cache[k]; });
    }
    return hit.p.then(function (x) { return new Response(x.body, { status: x.status, statusText: x.statusText, headers: x.headers }); });
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
    ["getScaledImageUrl", "getImageUrl"].forEach(function (m) {
      var orig = api[m];
      if (typeof orig !== "function") return;
      api[m] = function (id, o) {
        if (o && typeof o === "object" && /^logo$/i.test(o.type || "") && !(o.maxWidth || o.maxHeight || o.width || o.height || o.fillWidth || o.fillHeight)) {
          var c = {};
          for (var k in o) c[k] = o[k];
          c.maxWidth = W; c.maxHeight = H;
          o = c;
        }
        return orig.call(this, id, o);
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

  // ── the logo (top left) goes straight to home ──
  // Its link is "/", which Jellyfin first opens as an empty page and only then sends on to home: in between
  // the page you were on lost its styling for a moment (a details page flashed in Jellyfin's own look).
  // Going to home directly is the same smooth change as the Back button.
  document.addEventListener("click", function (e) {
    if (window.__tbNoHomeFix || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank") return;
    var href = a.getAttribute("href") || "";
    if (!/^(#!?\/|\/?(web\/)?(index\.html)?#!?\/|\/)$/.test(href)) return;
    e.preventDefault();
    e.stopPropagation();
    if (/^#\/home(\.html)?(\?|$)/.test(location.hash) && !/[?&]tab=/.test(location.hash)) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    location.hash = "#/home";
  }, true);

  // the backdrop link a title page uses (exactly SleekFin's / Jellyfin's, so the browser downloads it once)
  function backdropUrl(item) {
    var api = window.ApiClient;
    if (!api || !item) return null;
    var widths = [480, 720, 1280, 1440, 1920, 2560, 3840, 5120, 7680];
    var w = window.innerWidth || 3840, h = window.innerHeight || 2160;
    if (h > w) w = h * 16 / 9;
    widths.sort(function (a, b) { return Math.abs(w - a) - Math.abs(w - b); });
    var own = item.BackdropImageTags && item.BackdropImageTags.length;
    var bOwner = own ? item.BackdropItemId || item.Id : item.ParentBackdropItemId;
    var bTag = own ? item.BackdropImageTags[0] : (item.ParentBackdropImageTags || [])[0];
    return bOwner && bTag ? api.getScaledImageUrl(bOwner, { type: "Backdrop", tag: bTag, maxWidth: widths[0], index: 0 }) : null;
  }
  window.tbBackdropUrl = backdropUrl;

  // ── getting a title ready before it's clicked ──
  var warmed = {}, timer = 0;
  function warm(id) {
    var api = window.ApiClient;
    if (!api || !id || warmed[id] && Date.now() - warmed[id] < TTL) return;
    warmed[id] = Date.now();
    if (window.tbLoadPart) window.tbLoadPart("details");   // the details page script, if not here yet
    var uid = api.getCurrentUserId();
    if (!uid) return;
    // same link and sign-in as Jellyfin's own request, so the page reuses it
    window.fetch(api.getUrl("Users/" + uid + "/Items/" + id), { headers: { Authorization: 'MediaBrowser Token="' + api.accessToken() + '"' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (item) {
        if (!item) return;
        var urls = [];
        (window.tbItemMeta || (window.tbItemMeta = {}))[item.Id] = item;
        var bd = backdropUrl(item);
        if (bd) urls.push(bd);
        // logo: the link Jellyfin's details page uses
        if (item.ImageTags && item.ImageTags.Logo) urls.push(api.getScaledImageUrl(item.Id, { type: "Logo", tag: item.ImageTags.Logo }));
        else if (item.ParentLogoItemId && item.ParentLogoImageTag) urls.push(api.getScaledImageUrl(item.ParentLogoItemId, { type: "Logo", tag: item.ParentLogoImageTag }));
        urls.forEach(function (u) { var im = new Image(); im.decoding = "async"; im.src = u; });
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

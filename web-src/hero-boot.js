/* Inlined in the page head by the plugin (runs before Jellyfin starts).
   1. Paints the hero we're about to show straight away (from the last visit's list) and starts its download.
   2. Asks the server for the fresh hero list + SleekFin's hero look settings immediately,
      using your sign-in token, in parallel with Jellyfin starting up.
   ES5 only: this runs on TVs too. */
(function () {
  try {
    var root = document.documentElement;
    root.classList.add("tb-hero-on");   // rows wait for the banner (see sleekfin-media.css)
    var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
    if (base.charAt(base.length - 1) !== "/") base += "/";
    var dpr = window.devicePixelRatio || 1;

    // One image-URL builder shared with the hero script, so preloaded images are reused exactly.
    window.__tbHeroImg = function (id, type, tag) {
      if (type === "Backdrop") {
        var w = Math.min(2560, Math.max(960, Math.ceil((window.innerWidth || 1280) * dpr / 160) * 160));
        return base + "Items/" + id + "/Images/Backdrop/0?tag=" + encodeURIComponent(tag) + "&maxWidth=" + w + "&quality=90";
      }
      return base + "Items/" + id + "/Images/Logo?tag=" + encodeURIComponent(tag) + "&maxHeight=" + Math.ceil(140 * dpr) + "&quality=90";
    };

    var hash = location.hash;
    var m = /^#\/(?:home)?(?:\?([^#]*))?$/.exec(hash);
    var home = hash === "" || hash === "#" || (!!m && !/(^|&)seerrfinTab=/.test(m[1] || "") && !/(^|&)tab=(?!0(&|$))/.test(m[1] || ""));

    function preload(url, high) {
      var l = document.createElement("link");
      l.rel = "preload";
      l.as = "image";
      l.href = url;
      if (high) l.setAttribute("fetchpriority", "high");
      document.head.appendChild(l);
    }

    // ── 1. Instant first frame from the last visit's list ──
    var cache = null;
    try { cache = JSON.parse(localStorage.getItem("tbHeroCache") || "null"); } catch (e) {}
    if (home && cache && cache.items && cache.items.length) {
      // a banner is coming: the page starts under the top bar straight away (it used to start below it and
      // jump up 80 px when the banner arrived)
      root.classList.add("tb-hero-boot");
      var first = cache.items[Math.floor(Math.random() * cache.items.length)];
      window.__tbHeroFirst = first.Id;
      var bg = window.__tbHeroImg(first.Id, "Backdrop", first.Backdrop);
      preload(bg, true);
      if (first.Logo) preload(window.__tbHeroImg(first.Id, "Logo", first.Logo), false);
      var r = cache.rect;
      if (r && r.w && Math.abs(r.vw - window.innerWidth) <= window.innerWidth * 0.1 && Math.abs(r.vh - window.innerHeight) <= window.innerHeight * 0.15) {
        var s = root.style;
        s.setProperty("--tb-hs-t", r.t + "px");
        s.setProperty("--tb-hs-l", r.l + "px");
        s.setProperty("--tb-hs-w", r.w + "px");
        s.setProperty("--tb-hs-h", r.h + "px");
        s.setProperty("--tb-hs-img", 'url("' + bg.replace(/["\\]/g, "") + '")');
        root.classList.add("tb-hs");
        setTimeout(function () { root.classList.remove("tb-hs", "tb-hs-out"); }, 8000);
      }
    }

    // ── 2. Fresh list + look settings, straight away ──
    var creds = null;
    try { creds = JSON.parse(localStorage.getItem("jellyfin_credentials") || "null"); } catch (e) {}
    var servers = (creds && creds.Servers) || [];
    var srv = null;
    for (var i = 0; i < servers.length; i++) {
      var x = servers[i];
      if (x && x.AccessToken && x.UserId && (!srv || (x.DateLastAccessed || 0) > (srv.DateLastAccessed || 0))) srv = x;
    }
    if (!srv || !window.fetch) return;
    var headers = { Authorization: 'MediaBrowser Token="' + srv.AccessToken + '"' };
    var query = "Items?UserId=" + encodeURIComponent(srv.UserId) +
      "&IncludeItemTypes=Movie,Series&Recursive=true&SortBy=PremiereDate,SortName&SortOrder=Descending&Limit=10" +
      "&Fields=Overview,Genres&ImageTypes=Backdrop&EnableImageTypes=Logo,Backdrop&ImageTypeLimit=1" +
      "&EnableUserData=false&EnableTotalRecordCount=false&MaxPremiereDate=" + encodeURIComponent(new Date().toISOString());
    function get(url) {
      return fetch(base + url, { headers: headers, credentials: "same-origin" })
        .then(function (res) { return res.ok ? res.json() : null; })
        ["catch"](function () { return null; });
    }
    window.__tbHero = {
      user: srv.UserId,
      items: get(query).then(function (j) { return (j && j.Items) || null; }),
      // the look settings are already in the page (built-in SleekFin); the old route only if SleekFin is separate
      settings: window.__tbSleekHero ? Promise.resolve(window.__tbSleekHero) : get("SleekFin/Hero/Settings")
    };
  } catch (e) {}
})();

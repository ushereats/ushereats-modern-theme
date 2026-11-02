/* Added to the end of Jellyfin's own service worker (serviceworker.js) by the theme.
   Measured: the browser's own cache already keeps Jellyfin's app files, the theme and the pictures, so those are
   left to it. What made opening the site wait was a chain of requests Jellyfin makes one after another before it
   draws anything (the page, its settings file, server info twice, server details, your account): over the internet
   each one is a round trip to the server. Those are answered here from the copy kept from last time, at once,
   while a fresh copy is fetched in the background for next time.
   Only for the signed-in user they belong to (the copy is kept per sign-in), only reads, and anything unexpected
   goes to the network as if this weren't here. */
(function () {
  var V = "tb-2";
  var KEEP = V + "-start";

  self.addEventListener("install", function () { self.skipWaiting(); });
  self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("tb-") === 0 && k.indexOf(V + "-") !== 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
  });

  // the sign-in a request is made with (part of the key, so one person's copy never answers another)
  function token(req, u) {
    var a = req.headers.get("authorization") || req.headers.get("x-emby-authorization") || "";
    var m = /Token="([^"]+)"/i.exec(a);
    return (m && m[1]) || req.headers.get("x-emby-token") || req.headers.get("x-mediabrowser-token") || u.searchParams.get("api_key") || "";
  }

  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

  function kind(req) {
    if (req.method !== "GET" || req.headers.has("range")) return null;
    var u;
    try { u = new URL(req.url); } catch (e) { return null; }
    if (u.origin !== self.location.origin) return null;
    var p = u.pathname;
    // the page itself (index.html)
    if (req.mode === "navigate") return /\/web\/(index\.html)?$/i.test(p) ? { key: p.replace(/index\.html$/i, "") } : null;
    // Jellyfin's settings file and server info (the same for everyone)
    if (/\/web\/config\.json$/i.test(p) || /\/System\/Info\/Public$/i.test(p) || /\/Branding\/Configuration$/i.test(p)) return { key: p };
    // things that belong to the signed-in person: only with their sign-in, kept per sign-in
    if (/\/System\/Info$/i.test(p) || /\/Users\/[0-9a-f]{32}$/i.test(p) || /\/UserViews$/i.test(p) || /\/DisplayPreferences\/usersettings$/i.test(p)) {
      var t = token(req, u);
      return t ? { key: p + u.search + (u.search ? "&" : "?") + "tb-who=" + hash(t) } : null;
    }
    return null;
  }

  // the copy from last time straight away (if there is one), a fresh one fetched behind it for next time
  function fromCopy(e, k) {
    var req = e.request, key = new Request(new URL(k.key, self.location.origin).href);
    return caches.open(KEEP).then(function (c) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.ok && res.status === 200 && res.type === "basic" && !res.redirected) c.put(key, res.clone())["catch"](function () {});
        else if (res && (res.status === 401 || res.status === 403)) c["delete"](key)["catch"](function () {});   // signed out / no longer allowed
        return res;
      });
      return c.match(key).then(function (hit) {
        if (!hit) return fresh;
        e.waitUntil(fresh["catch"](function () {}));
        return hit;
      });
    });
  }

  self.addEventListener("fetch", function (e) {
    var k = kind(e.request);
    if (!k) return;
    // never let the copy stand between you and the server: any error goes to the network
    e.respondWith(fromCopy(e, k)["catch"](function () { return fetch(e.request); }));
  });
})();

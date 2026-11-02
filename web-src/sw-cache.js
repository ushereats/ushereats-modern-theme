/* Added to the end of Jellyfin's own service worker (serviceworker.js) by the theme.
   Keeps the files that never change on the device, so opening the site doesn't wait for the network for them:
   Jellyfin's app files, the theme's files, fonts, and posters / pictures (each picture link names its version,
   so a copy is never out of date). The page itself opens from the copy from last time while a fresh one is fetched
   for next time. Anything that changes (your rows, lists, settings) is left to the network, except config.json,
   which is answered from the copy and refreshed at most once a minute.
   Anything unexpected: the request just goes to the network as if this weren't here. */
(function () {
  var V = "tb-1";
  var STATIC = V + "-static", IMG = V + "-img", MISC = V + "-misc";
  var MAX_STATIC = 400, MAX_IMG = 1000;

  self.addEventListener("install", function () { self.skipWaiting(); });
  self.addEventListener("activate", function (e) {
    e.waitUntil(caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("tb-") === 0 && k.indexOf(V + "-") !== 0; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); }));
  });

  function kind(req) {
    if (req.method !== "GET" || req.headers.has("range")) return null;
    var u;
    try { u = new URL(req.url); } catch (e) { return null; }
    if (u.origin !== self.location.origin) return null;
    var p = u.pathname;
    // pictures: only versioned links (tag=...), never ones that could change
    if (/\/Items\/[0-9a-f-]+\/Images\//i.test(p) && /[?&]tag=/.test(u.search)) return "img";
    // the theme's files carry their version in the link
    if (/\/UshereatsTheme\/(theme\.(css|js)|part\/[\w-]+\.js|splash\.js|dashboard\.js)$/i.test(p) && /[?&]v=/.test(u.search)) return "static";
    if (/\/UshereatsTheme\/(font|studio)\//i.test(p)) return "static";
    // Jellyfin's app files (their names / links change with every Jellyfin version)
    if (/\/web\/[^?]*\.(js|css|woff2?|ttf|svg|png|ico|webp|json)$/i.test(p) && !/\/web\/(config|manifest)\.json$/i.test(p) && !/serviceworker\.js$/i.test(p)) {
      if (/^\?[0-9a-f]{8,}$/i.test(u.search) || /[?&][\w]+=[0-9a-f]{8,}/i.test(u.search) || /[.-][0-9a-f]{8,}\.(chunk\.)?(js|css)$/i.test(p) || /\.(woff2?|ttf)$/i.test(p) || /\/web\/(assets|themes)\//i.test(p)) return "static";
      return null;
    }
    if (/\/web\/config\.json$/i.test(p)) return "config";
    // the page itself (index.html): the copy from last time straight away, the fresh one fetched behind it for
    // next time. Everything it links to carries its version, so an older copy still finds its files.
    if (req.mode === "navigate" && /\/web\/(index\.html)?$/i.test(p)) return "page";
    return null;
  }

  function trim(name, max) {
    return caches.open(name).then(function (c) {
      return c.keys().then(function (keys) {
        if (keys.length <= max) return;
        return Promise.all(keys.slice(0, keys.length - max).map(function (k) { return c.delete(k); }));
      });
    })["catch"](function () {});
  }
  var trimTimer = {};
  function trimSoon(name, max) {
    clearTimeout(trimTimer[name]);
    trimTimer[name] = setTimeout(function () { trim(name, max); }, 5000);
  }

  // from the device if there; otherwise from the network, keeping a copy
  function cacheFirst(e, name, max) {
    var req = e.request;
    var key = new Request(req.url, { credentials: "same-origin" });
    return caches.open(name).then(function (c) {
      return c.match(key, { ignoreVary: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).then(function (res) {
          if (res && res.ok && res.status === 200 && res.type === "basic") {
            var copy = res.clone();
            e.waitUntil(c.put(key, copy).then(function () { trimSoon(name, max); })["catch"](function () {}));
          }
          return res;
        });
      });
    });
  }

  // config.json: Jellyfin asks for it several times on every page change
  var cfgAt = 0;
  function config(e) {
    var req = e.request, key = new Request(new URL(req.url).pathname);
    return caches.open(MISC).then(function (c) {
      return c.match(key).then(function (hit) {
        var refresh = function () {
          return fetch(req).then(function (res) {
            if (res && res.ok) { cfgAt = Date.now(); c.put(key, res.clone())["catch"](function () {}); }
            return res;
          });
        };
        if (!hit) return refresh();
        if (Date.now() - cfgAt > 60000) e.waitUntil(refresh()["catch"](function () {}));
        return hit;
      });
    });
  }

  function page(e) {
    var req = e.request, key = new Request(new URL(req.url).pathname.replace(/index\.html$/i, ""));
    return caches.open(MISC).then(function (c) {
      var fresh = fetch(req).then(function (res) {
        if (res && res.ok && res.status === 200 && res.type === "basic" && !res.redirected) c.put(key, res.clone())["catch"](function () {});
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
    var answer = k === "img" ? cacheFirst(e, IMG, MAX_IMG) : k === "static" ? cacheFirst(e, STATIC, MAX_STATIC) : k === "page" ? page(e) : config(e);
    // never let the cache stand between you and the page: any error goes to the network
    e.respondWith(answer["catch"](function () { return fetch(e.request); }));
  });
})();

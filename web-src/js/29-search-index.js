(function tbSearchIndex() {
  // Instant search: downloads a local search index from /UshereatsTheme/search-index when idle,
  // stores it in IndexedDB (db: tb-search, store: idx, key: userId+"|"+serverId).
  // Exposes window.__tbSearchLocal(term, types) -> Promise<item[]> for 23-search.js to use.
  // 23-search.js falls back to the server when the local index is not ready.
  if (window.__tbSearchIndex || !window.indexedDB || !window.fetch) return;
  window.__tbSearchIndex = true;

  var DB_NAME = "tb-search", STORE = "idx", VERSION = 1;
  var REFRESH_MS = 6 * 60 * 60 * 1000;   // re-download after 6 hours

  var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
  if (base.charAt(base.length - 1) !== "/") base += "/";

  // --- IndexedDB helpers ---
  function openDb(cb) {
    try {
      var req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = function (e) {
        try { e.target.result.createObjectStore(STORE); } catch (x) {}
      };
      req.onsuccess = function (e) { cb(null, e.target.result); };
      req.onerror = function () { cb(req.error); };
    } catch (x) { cb(x); }
  }

  function dbGet(db, key, cb) {
    try {
      var tx = db.transaction(STORE, "readonly");
      var req = tx.objectStore(STORE).get(key);
      req.onsuccess = function () { cb(null, req.result); };
      req.onerror = function () { cb(req.error); };
    } catch (x) { cb(x); }
  }

  function dbPut(db, key, val, cb) {
    try {
      var tx = db.transaction(STORE, "readwrite");
      var req = tx.objectStore(STORE).put(val, key);
      req.onsuccess = function () { cb && cb(null); };
      req.onerror = function () { cb && cb(req.error); };
    } catch (x) { cb && cb(x); }
  }

  // --- In-memory index state ---
  var _db = null, _ready = false, _items = null, _version = null;

  // --- Auth helpers ---
  function creds() {
    try {
      var c = JSON.parse(localStorage.getItem("jellyfin_credentials") || "null");
      var servers = (c && c.Servers) || [], best = null;
      for (var i = 0; i < servers.length; i++) {
        var s = servers[i];
        if (s && s.AccessToken && (!best || (s.DateLastAccessed || 0) > (best.DateLastAccessed || 0))) best = s;
      }
      return best || null;
    } catch (e) { return null; }
  }

  // --- Download and store index ---
  function download(srv, force) {
    var tk = srv.AccessToken, uid = srv.UserId;
    if (!tk || !uid) return;
    var url = base + "UshereatsTheme/search-index?userId=" + encodeURIComponent(uid);
    var headers = { Authorization: 'MediaBrowser Token="' + tk + '"' };
    if (!force && _version) headers["If-None-Match"] = '"' + _version + '"';
    fetch(url, { headers: headers })
      .then(function (r) {
        if (r.status === 304) return null;      // already up to date
        if (r.status === 403) return null;      // feature off for this user
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        _items = data.items || [];
        _version = data.version || "";
        _ready = true;
        // Store in IndexedDB for next session
        if (_db) {
          var key = uid + "|" + (srv.Id || "");
          dbPut(_db, key, { v: _version, items: _items, at: Date.now() });
        }
      })
      ["catch"](function () {});
  }

  // --- Load from IndexedDB on startup, then refresh if stale ---
  function init() {
    var srv = creds();
    if (!srv) return;
    var uid = srv.UserId || "", sid = srv.Id || "";
    openDb(function (err, db) {
      if (err || !db) { download(srv, true); return; }
      _db = db;
      var key = uid + "|" + sid;
      dbGet(db, key, function (err2, stored) {
        if (!err2 && stored && stored.items && stored.items.length) {
          _items = stored.items;
          _version = stored.v || "";
          _ready = true;
          // Re-download in background if stale
          if (!stored.at || Date.now() - stored.at > REFRESH_MS) download(srv, false);
        } else {
          download(srv, true);
        }
      });
    });
  }

  // --- Local search ---
  // Returns items matching term, filtered to the given types array (like GROUPS from 23-search.js).
  // Scores: exact name match > starts-with > contains. Sorts by score desc, year desc.
  window.__tbSearchLocal = function (term, types) {
    if (!_ready || !_items) return null;   // not ready: caller should use server
    var t = term.toLowerCase().trim();
    if (!t) return [];
    var typeSet = {};
    if (types && types.length) for (var i = 0; i < types.length; i++) typeSet[types[i]] = 1;
    var out = [];
    for (var n = 0; n < _items.length; n++) {
      var it = _items[n];
      if (types && types.length && !typeSet[it.type]) continue;
      var name = (it.name || "").toLowerCase();
      var orig = (it.originalTitle || "").toLowerCase();
      var score = 0;
      if (name === t || orig === t) score = 3;
      else if (name.indexOf(t) === 0 || orig.indexOf(t) === 0) score = 2;
      else if (name.indexOf(t) >= 0 || orig.indexOf(t) >= 0) score = 1;
      if (!score) continue;
      out.push({ score: score, it: it });
    }
    out.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (b.it.year || 0) - (a.it.year || 0);
    });
    // Convert to the shape 23-search.js expects (same as slimLite)
    return out.map(function (x) {
      var it = x.it;
      return {
        Id: it.id, Name: it.name, Type: it.type,
        ProductionYear: it.year,
        Primary: it.primary, Thumb: it.thumb,
        UserData: {}
      };
    });
  };

  // Start in idle time after page load
  window.addEventListener("load", function () {
    var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 3000); };
    setTimeout(function () { idle(init, { timeout: 10000 }); }, 1500);
  });

  // Re-download when user changes (sign-in/sign-out)
  window.addEventListener("hashchange", function () {
    if (_ready) return;   // already loaded; refresh happens on next session load
    var srv = creds();
    if (srv && _db) download(srv, true);
  });
})();

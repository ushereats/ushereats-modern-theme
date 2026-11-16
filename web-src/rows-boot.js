/* Inlined in the page head by the plugin when "Home rows" is on (runs before Jellyfin starts).
   - hides Jellyfin's own home rows from the first frame (ours replace them)
   - holds the one place that knows how to ask the server for each row (the home rows script reuses it)
   - on the home page, asks for every row straight away, in parallel, with your sign-in token
   The row layout comes from the plugin settings (remembered from the last visit; the home rows
   script re-checks it and refreshes if you changed it).
   ES5 only: this runs on TVs too. */
(function () {
  try {
    var root = document.documentElement;
    root.className += " tb-rows";
    var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
    if (base.charAt(base.length - 1) !== "/") base += "/";

    var COMMON = "&Fields=PrimaryImageAspectRatio&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb&EnableTotalRecordCount=false";

    function get(url, token) {
      return fetch(base + url, { headers: { Authorization: 'MediaBrowser Token="' + token + '"' }, credentials: "same-origin" })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
    }
    function list(j) { return j && j.Items ? j.Items : (j && j.length !== undefined ? j : []); }
    function enc(s) { return encodeURIComponent(s); }
    function num(v, d) { v = parseInt(v, 10); return v > 0 ? v : d; }

    // only what the cards need (also what gets remembered for the next visit)
    function slim(it) {
      var u = it.UserData || {}, t = it.ImageTags || {}, o = {
        Id: it.Id, Name: it.Name, Type: it.Type, IsFolder: !!it.IsFolder
      };
      function k(n, v) { if (v !== undefined && v !== null && v !== "") o[n] = v; }
      k("MediaType", it.MediaType); k("CollectionType", it.CollectionType);
      k("SeriesId", it.SeriesId); k("SeriesName", it.SeriesName);
      k("ParentIndexNumber", it.ParentIndexNumber); k("IndexNumber", it.IndexNumber);
      k("ProductionYear", it.ProductionYear); k("Status", it.Status); k("EndDate", it.EndDate);
      k("PremiereDate", it.PremiereDate); k("RunTimeTicks", it.RunTimeTicks); k("LocationType", it.LocationType);
      k("Primary", t.Primary); k("Thumb", t.Thumb);
      k("Backdrop", it.BackdropImageTags && it.BackdropImageTags[0]);
      k("ParentThumbItemId", it.ParentThumbItemId); k("ParentThumbImageTag", it.ParentThumbImageTag);
      k("ParentBackdropItemId", it.ParentBackdropItemId);
      k("ParentBackdropImageTag", it.ParentBackdropImageTags && it.ParentBackdropImageTags[0]);
      k("SeriesPrimaryImageTag", it.SeriesPrimaryImageTag);
      var ud = {};
      if (u.PlayedPercentage) ud.PlayedPercentage = Math.round(u.PlayedPercentage * 10) / 10;
      if (u.PlaybackPositionTicks) ud.PlaybackPositionTicks = u.PlaybackPositionTicks;
      if (u.Played) ud.Played = true;
      if (u.UnplayedItemCount) ud.UnplayedItemCount = u.UnplayedItemCount;
      if (u.IsFavorite) ud.IsFavorite = true;
      if (u.LastPlayedDate) ud.LastPlayedDate = u.LastPlayedDate;
      o.UserData = ud;
      return o;
    }

    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
      return a;
    }

    // Continue Watching & Next Up in one row, the same rules as the server (only used if the server can't answer):
    // everything part-watched (films and episodes) + the next episode of each show, newest first, one card per show.
    // A next episode counts as "watched" as recently as the show's latest part-watched episode.
    function showKey(x) { return x.SeriesId || x.Id; }
    function mergeContinue(resume, next, limit) {
      var showLast = {}, all = [], i;
      for (i = 0; i < resume.length; i++) {
        var d = resume[i].UserData && resume[i].UserData.LastPlayedDate ? Date.parse(resume[i].UserData.LastPlayedDate) : 0;
        all.push({ it: resume[i], d: d, r: 0, i: i });
        if (resume[i].SeriesId && d > (showLast[resume[i].SeriesId] || 0)) showLast[resume[i].SeriesId] = d;
      }
      for (i = 0; i < next.length; i++) all.push({ it: next[i], d: showLast[next[i].SeriesId] || 0, r: 1, i: i });
      all.sort(function (a, b) { return (b.d - a.d) || (a.r - b.r) || (a.i - b.i); });
      var seen = {}, out = [];
      for (i = 0; i < all.length && out.length < limit; i++) {
        var k = showKey(all[i].it);
        if (seen[k]) continue;
        seen[k] = 1;
        if (all[i].it.UserData) delete all[i].it.UserData.LastPlayedDate;
        out.push(all[i].it);
      }
      return out;
    }

    // one row -> Promise of its cards (rejects if the server couldn't be reached: keep what's shown)
    function load(row, user, token) {
      var L = num(row.limit, 16), U = "userId=" + enc(user);
      var type = row.type;
      if (type === "studios") return Promise.resolve(null);
      if (type === "continue") {
        var CL = Math.min(60, Math.max(L, 40));
        // the server's version of this row on its own first (same rules as the home request), then Jellyfin's lists
        return get("UshereatsTheme/home?userId=" + enc(user) + "&rows=" + enc(JSON.stringify([row])), token).then(function (j) {
          var arr = j && j[row.id];
          if (!arr) throw new Error("no row");
          var r = [];
          for (var n = 0; n < arr.length; n++) r.push(slim(arr[n]));
          return r;
        })["catch"](function () {
          var resume = get("UserItems/Resume?" + U + "&MediaTypes=Video&IncludeItemTypes=Movie,Episode&Limit=60" + COMMON, token)["catch"](function () { return null; });
          var next = get("Shows/NextUp?" + U + "&Limit=60&EnableResumable=false&EnableRewatching=false" + COMMON, token)["catch"](function () { return null; });
          return Promise.all([resume, next]).then(function (r) {
            var m = list(r[0]), e = list(r[1]), a = [], b = [], i;
            if (!r[0] && !r[1]) throw new Error("offline");
            for (i = 0; i < m.length; i++) a.push(slim(m[i]));
            for (i = 0; i < e.length; i++) b.push(slim(e[i]));
            return mergeContinue(a, b, CL);
          });
        });
      }
      if (type === "trending") {
        // TMDB's weekly trending chart, already matched to your library by the server (in TMDB's order)
        return get("UshereatsTheme/trending", token).then(function (j) {
          var ids = [], src = (j && j.items) || [];
          for (var i = 0; i < src.length && ids.length < L + 10; i++) {
            if (src[i] && src[i].id && (src[i].out || row.released === false)) ids.push(src[i].id);
          }
          if (!ids.length) return [];
          return get("Items?" + U + "&Ids=" + ids.join(",") + COMMON, token).then(function (r) {
            var items = list(r), byId = {}, out = [], n;
            for (n = 0; n < items.length; n++) byId[items[n].Id] = items[n];
            for (n = 0; n < ids.length && out.length < L; n++) if (byId[ids[n]]) out.push(slim(byId[ids[n]]));
            return out;
          });
        });
      }
      var url;
      if (type === "latest") {
        url = "Items/Latest?" + U + "&Limit=" + L + (row.parentId ? "&ParentId=" + enc(row.parentId) : "") +
          (row.types ? "&IncludeItemTypes=" + enc(row.types) : "") + COMMON;
      } else {
        url = "Items?" + U + "&Recursive=true&Limit=" + L +
          (row.parentId ? "&ParentId=" + enc(row.parentId) : "") +
          (row.types ? "&IncludeItemTypes=" + enc(row.types) : "") +
          (row.sortBy && row.sortBy !== "Random" ? "&SortBy=" + enc(row.sortBy) + "&SortOrder=" + (row.sortOrder === "Ascending" ? "Ascending" : "Descending") : "") +
          (row.sortBy === "Random" ? "&SortBy=Random" : "") +
          (row.released ? "&MaxPremiereDate=" + enc(new Date().toISOString()) : "") +
          (row.query ? "&" + String(row.query).replace(/^[?&]+/, "") : "") + COMMON;
      }
      return get(url, token).then(function (j) {
        var items = list(j), out = [];
        for (var i = 0; i < items.length; i++) out.push(slim(items[i]));
        if (row.shuffle) shuffle(out);
        return out;
      });
    }

    // Feature level: 0=Off, 1=AdminsOnly (treated as Off at boot — can't check admin status synchronously), 2=Everyone
    // Test override: localStorage['tb-force-features'] = "Feat1,Feat2" forces those features on in this browser.
    function featOn(key) {
      var v = window.TB_CONFIG && parseInt(window.TB_CONFIG[key], 10);
      if (v === 2) return true;
      try { var ff = localStorage.getItem("tb-force-features"); if (ff && ff.split(",").indexOf(key) >= 0) return true; } catch (x) {}
      return false;
    }

    function run(rows, user, token) {
      var out = {};
      var nonStudio = rows.filter(function (r) { return r.type !== "studios"; });
      var batchP;
      try {
        // HomeInOneRequest: use batch endpoint (and SW cache copy) only when feature is on for Everyone
        var earlyHome = featOn("HomeFromDeviceCopy") ? window.__tbEarlyHome : null;
        batchP = featOn("HomeInOneRequest")
          ? (earlyHome ||
              get("UshereatsTheme/home?userId=" + enc(user) + "&rows=" + enc(JSON.stringify(nonStudio)), token)
                ["catch"](function () { return null; }))
          : Promise.resolve(null);
      } catch (e) {
        batchP = Promise.resolve(null);
      }
      for (var i = 0; i < rows.length; i++) {
        (function (row) {
          if (row.type === "studios") { out[row.id] = Promise.resolve(null); return; }
          var id = row.id;
          var p = batchP.then(function (batch) {
            var arr = batch && batch[id];
            if (arr && (arr.length || row.type === "continue")) {
              var r = [];
              for (var n = 0; n < arr.length; n++) r.push(slim(arr[n]));
              return r;
            }
            return load(row, user, token);
          });
          p["catch"](function () {});
          out[id] = p;
        })(rows[i]);
      }
      return out;
    }

    window.__tbRowsBoot = { base: base, run: run, slim: slim };

    // ── start asking straight away when the page opens on Home ──
    var hash = location.hash;
    var m = /^#\/(?:home)?(?:\?([^#]*))?$/.exec(hash);
    var home = hash === "" || hash === "#" || (!!m && !/(^|&)seerrfinTab=/.test(m[1] || "") && !/(^|&)tab=(?!0(&|$))/.test(m[1] || ""));
    if (!home || !window.fetch || !window.Promise) return;
    var rows = null, key = null;
    try { rows = JSON.parse(localStorage.getItem("tbRowsCfg") || "null"); key = localStorage.getItem("tbRowsCfgKey"); } catch (e) {}
    if (!rows || !rows.length) return;
    var creds = null;
    try { creds = JSON.parse(localStorage.getItem("jellyfin_credentials") || "null"); } catch (e) {}
    var servers = (creds && creds.Servers) || [], srv = null;
    for (var i = 0; i < servers.length; i++) {
      var x = servers[i];
      if (x && x.AccessToken && x.UserId && (!srv || (x.DateLastAccessed || 0) > (srv.DateLastAccessed || 0))) srv = x;
    }
    if (!srv) return;
    window.__tbRowsBoot.first = { user: srv.UserId, key: key, at: Date.now(), data: run(rows, srv.UserId, srv.AccessToken) };
  } catch (e) {}
})();

/* Jellyfin's own home rows: our rows replace them, so Jellyfin shouldn't build them at all (it used to
   fetch and draw every section in the background, hidden: double the requests and a freeze on Home).
   This browser is told every home section is "None"; the settings saved on the server are never
   changed (TV apps keep theirs): when this browser saves its settings, the real home sections are put back
   in first. Only Jellyfin's "usersettings" (client "emby") are touched. ES5. */
(function () {
  try {
    var KEY = /\/DisplayPreferences\/usersettings\?/i;
    function isPrefs(url) { return KEY.test(url) && /[?&]client=emby(&|$)/i.test(url); }
    function hide(text) {
      try {
        var j = JSON.parse(text);
        j.CustomPrefs = j.CustomPrefs || {};
        for (var i = 0; i < 12; i++) j.CustomPrefs["homesection" + i] = "none";
        return JSON.stringify(j);
      } catch (e) { return text; }
    }

    // reading (Jellyfin's newer code: XMLHttpRequest)
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (String(method).toUpperCase() === "GET" && isPrefs(String(url))) {
        var x = this;
        x.addEventListener("readystatechange", function () {
          if (x.readyState !== 4 || x.status !== 200) return;
          var text = hide(x.responseText);
          try {
            Object.defineProperty(x, "responseText", { configurable: true, get: function () { return text; } });
            Object.defineProperty(x, "response", { configurable: true, get: function () { return x.responseType === "json" ? JSON.parse(text) : text; } });
          } catch (e) {}
        });
      }
      return open.apply(this, arguments);
    };

    // reading and saving (Jellyfin's older code: fetch)
    var realFetch = window.fetch;
    if (!realFetch) return;
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      if (!isPrefs(url)) return realFetch.apply(this, arguments);
      var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (method === "GET") {
        return realFetch.apply(this, arguments).then(function (r) {
          if (!r.ok) return r;
          return r.text().then(function (t) { return new Response(hide(t), { status: r.status, statusText: r.statusText, headers: r.headers }); });
        });
      }
      if (method === "POST" && init && typeof init.body === "string") {
        // put the real home sections (as saved on the server) back before saving
        return realFetch(url, { headers: init.headers, credentials: init.credentials || "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (saved) {
          var real = (saved && saved.CustomPrefs) || {};
          var body = JSON.parse(init.body);
          body.CustomPrefs = body.CustomPrefs || {};
          for (var i = 0; i < 12; i++) {
            var k = "homesection" + i;
            if (real[k] != null) body.CustomPrefs[k] = real[k];
            else delete body.CustomPrefs[k];
          }
          var next = {};
          for (var p in init) next[p] = init[p];
          next.body = JSON.stringify(body);
          return realFetch(url, next);
        }, function () { throw new Error("home sections: could not read the saved settings, not saving"); });   // never save the "None"s
      }
      return realFetch.apply(this, arguments);
    };
  } catch (e) {}
})();

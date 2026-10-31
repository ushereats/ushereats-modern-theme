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

    // Continue Watching & Next Up in one row: films you're part-way through + the next episode of
    // each show, newest watched first (same rules KefinTweaks used)
    function mergeContinue(movies, episodes, limit) {
      for (var i = episodes.length - 1; i >= 0; i--) {
        var e = episodes[i];
        if (!e.UserData.LastPlayedDate) {
          for (var j = i + 1; j < episodes.length; j++) {
            if (episodes[j].UserData.LastPlayedDate) { e.UserData.LastPlayedDate = episodes[j].UserData.LastPlayedDate; break; }
          }
        }
      }
      var all = movies.concat(episodes), seen = {}, out = [];
      all.sort(function (a, b) {
        var x = a.UserData.LastPlayedDate ? Date.parse(a.UserData.LastPlayedDate) : 0;
        var y = b.UserData.LastPlayedDate ? Date.parse(b.UserData.LastPlayedDate) : 0;
        return y - x;
      });
      for (var n = 0; n < all.length && out.length < limit; n++) {
        if (seen[all[n].Id]) continue;
        seen[all[n].Id] = 1;
        delete all[n].UserData.LastPlayedDate;
        out.push(all[n]);
      }
      return out;
    }

    // one row -> Promise of its cards (rejects if the server couldn't be reached: keep what's shown)
    function load(row, user, token) {
      var L = num(row.limit, 16), U = "userId=" + enc(user);
      var type = row.type;
      if (type === "studios") return Promise.resolve(null);
      if (type === "continue") {
        var movies = get("UserItems/Resume?" + U + "&MediaTypes=Video&IncludeItemTypes=Movie&Limit=" + num(row.resumeLimit, 12) + COMMON, token);
        var next = get("Shows/NextUp?" + U + "&Limit=" + num(row.nextUpLimit, 24) + "&EnableResumable=true&EnableRewatching=false" + COMMON, token);
        return Promise.all([movies, next]).then(function (r) {
          var m = list(r[0]), e = list(r[1]), a = [], b = [], i;
          for (i = 0; i < m.length; i++) a.push(slim(m[i]));
          for (i = 0; i < e.length; i++) b.push(slim(e[i]));
          return mergeContinue(a, b, L);
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

    function run(rows, user, token) {
      var out = {};
      for (var i = 0; i < rows.length; i++) {
        (function (row) {
          var p = load(row, user, token);
          p["catch"](function () {});
          out[row.id] = p;
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

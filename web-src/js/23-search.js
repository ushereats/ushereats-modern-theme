(function tbSearch() {
  // Search (replaces KefinTweaks' Enhanced Search).
  //  - searches as you type; Movies/TV (movies, shows, episodes, people) by default, chips for All / Music / Books
  //  - every type is asked for at the same time; a newer search cancels the older one
  //  - results grouped by type, posters first; same element ids/classes as before so the search restyle applies
  //  - Jellyfin's own search box stays on the page (hidden) so nothing of Jellyfin's is removed from under it
  if (window.__tbSearchStarted) return;
  window.__tbSearchStarted = true;
  var C = window.tbCards;
  if (!C) return;

  var GROUPS = {
    videos: ["Movie", "Series", "Episode", "Person"],
    music: ["MusicArtist", "MusicAlbum", "Audio", "MusicVideo"],
    books: ["Book", "AudioBook"]
  };
  GROUPS.all = GROUPS.videos.concat(GROUPS.music, GROUPS.books, ["BoxSet", "Playlist", "TvChannel"]);
  var NAMES = {
    Movie: "Movies", Series: "Shows", Episode: "Episodes", Person: "People", MusicArtist: "Artists", MusicAlbum: "Albums",
    Audio: "Songs", MusicVideo: "Music Videos", Book: "Books", AudioBook: "Audiobooks", BoxSet: "Collections",
    Playlist: "Playlists", TvChannel: "Channels"
  };
  var SHAPE = { Episode: "thumb", MusicVideo: "thumb", TvChannel: "square", MusicArtist: "square", MusicAlbum: "square", Audio: "square", Playlist: "square" };
  var LIMIT = 40, TTL = 60000;

  var tbWatch = window.tbWatch || (window.tbWatch = (function () {
    var subs = [], mo = null, last = 0;
    function busy() {
      if (document.hidden) return true;
      var osd = document.getElementById("videoOsdPage");
      return !!(osd && !osd.classList.contains("hide") && document.querySelector(".videoPlayerContainer"));
    }
    window.tbBusy = busy;
    function fire() {
      if (busy()) { var now = Date.now(); if (now - last < 1500) return; last = now; }
      for (var i = 0; i < subs.length; i++) { try { subs[i](); } catch (e) {} }
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) fire(); });
    return function (fn) {
      subs.push(fn);
      if (!mo) { mo = new MutationObserver(fire); mo.observe(document.documentElement, { childList: true, subtree: true }); }
    };
  })());

  var cache = {}, ctrl = null, timer = 0, mode = "videos", libs = null;

  function hashParam(name) {
    var m = new RegExp("[?&]" + name + "=([^&#]*)").exec(location.hash);
    return m ? decodeURIComponent(m[1].replace(/\+/g, " ")) : "";
  }
  // remember the search in the address (so Back returns to it) without Jellyfin running its own search
  function remember(term) {
    var h = location.hash.replace(/([?&])(tbq|tbt)=[^&#]*/g, "$1").replace(/[?&]+$/, "").replace(/\?&+/, "?");
    if (term) h += (h.indexOf("?") < 0 ? "?" : "&") + "tbq=" + encodeURIComponent(term) + (mode !== "videos" ? "&tbt=" + mode : "");
    if (h !== location.hash) { try { history.replaceState(history.state, "", location.pathname + location.search + h); } catch (e) {} }
  }

  function get(url, signal) {
    var api = window.ApiClient;
    return fetch(C.base + url, { headers: { Authorization: 'MediaBrowser Token="' + api.accessToken() + '"' }, credentials: "same-origin", signal: signal })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function slimAll(j) {
    var items = (j && j.Items) || [], out = [], s = window.__tbRowsBoot && window.__tbRowsBoot.slim;
    for (var i = 0; i < items.length; i++) out.push(s ? s(items[i]) : slimLite(items[i]));
    // posters first
    out.sort(function (a, b) { return (b.Primary ? 1 : 0) - (a.Primary ? 1 : 0); });
    return out;
  }
  function slimLite(it) {
    var t = it.ImageTags || {}, u = it.UserData || {};
    return {
      Id: it.Id, Name: it.Name, Type: it.Type, IsFolder: !!it.IsFolder, MediaType: it.MediaType, SeriesId: it.SeriesId,
      SeriesName: it.SeriesName, ParentIndexNumber: it.ParentIndexNumber, IndexNumber: it.IndexNumber, ProductionYear: it.ProductionYear,
      Status: it.Status, EndDate: it.EndDate, Primary: t.Primary, Thumb: t.Thumb, Backdrop: it.BackdropImageTags && it.BackdropImageTags[0],
      ParentThumbItemId: it.ParentThumbItemId, ParentThumbImageTag: it.ParentThumbImageTag, ParentBackdropItemId: it.ParentBackdropItemId,
      ParentBackdropImageTag: it.ParentBackdropImageTags && it.ParentBackdropImageTags[0], SeriesPrimaryImageTag: it.SeriesPrimaryImageTag,
      UserData: { Played: u.Played, PlayedPercentage: u.PlayedPercentage, UnplayedItemCount: u.UnplayedItemCount, IsFavorite: u.IsFavorite }
    };
  }
  // an answer we already have: this exact search, or a shorter one that returned everything it found
  // (fewer than LIMIT): typing more letters then only narrows it down, no need to ask the server again
  function known(type, term) {
    var t = term.toLowerCase(), hit = cache[type + "|" + t], now = Date.now();
    if (hit && now - hit.at < TTL) return hit.items;
    for (var n = t.length - 1; n >= 2; n--) {
      var p = cache[type + "|" + t.slice(0, n)];
      if (p && now - p.at < TTL && p.items.length < LIMIT) {
        return p.items.filter(function (it) {
          return [it.Name, it.SeriesName, it.OriginalTitle].some(function (s) { return s && s.toLowerCase().indexOf(t) >= 0; });
        });
      }
    }
    return null;
  }
  function query(type, term, signal) {
    var key = type + "|" + term.toLowerCase(), have = known(type, term);
    if (have) return Promise.resolve(have);
    var q = "&SearchTerm=" + encodeURIComponent(term) + "&Limit=" + LIMIT + "&Fields=PrimaryImageAspectRatio,ProductionYear&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb&EnableTotalRecordCount=false";
    var uid = encodeURIComponent(ApiClient.getCurrentUserId());
    var url = type === "Person" ? "Persons?userId=" + uid + q
      : type === "MusicArtist" ? "Artists?userId=" + uid + q
      : "Items?userId=" + uid + "&IncludeItemTypes=" + type + "&Recursive=true" + q;
    return get(url, signal).then(function (j) {
      var items = slimAll(j);
      cache[key] = { at: Date.now(), items: items };
      return items;
    });
  }

  function els() {
    var page = document.getElementById("searchPage");
    if (!page) return null;
    return { page: page, results: page.querySelector("#smart-search-results"), input: page.querySelector(".tb-search-input") };
  }

  function showResults(e, on) {
    e.page.classList.toggle("tb-searching", !!on);
  }

  function run(term) {
    var e = els();
    if (!e || !e.results) return;
    clearTimeout(timer);
    if (ctrl) { try { ctrl.abort(); } catch (x) {} ctrl = null; }
    remember(term);
    if (!term) { e.results.innerHTML = ""; showResults(e, false); return; }
    var types = GROUPS[mode] || GROUPS.videos;
    var c = window.AbortController ? new AbortController() : null;
    ctrl = c;
    var wanted = mode + "|" + term;
    Promise.all(types.map(function (t) {
      return query(t, term, c && c.signal).then(function (items) { return items; }, function (err) { return err && err.name === "AbortError" ? null : []; });
    })).then(function (res) {
      var now = els();
      if (!now || !now.results || ctrl !== c || (mode + "|" + (now.input ? now.input.value.trim() : "")) !== wanted) return;
      ctrl = null;
      var out = "", sid = C.serverId();
      types.forEach(function (t, i) {
        var items = res[i];
        if (!items || !items.length) return;
        var cards = "";
        for (var n = 0; n < items.length; n++) cards += C.card(items[n], SHAPE[t] || "poster", n, sid, "", true);
        out += C.section({ title: NAMES[t] || t, cards: cards, wrap: true, cls: "tb-search-section", attrs: ' data-type="' + t + '"' });
      });
      now.results.innerHTML = out || '<div class="noItemsMessage centerMessage">Sorry! No results found for "' + C.esc(term) + '"</div>';
      C.upgrade(now.results);
      C.loadEach(now.results);
      C.decorate();
      showResults(now, true);
    });
  }

  function setMode(m, e) {
    mode = GROUPS[m] ? m : "videos";
    var btns = e.page.querySelectorAll(".smart-search-btn");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-mode") === mode;
      btns[i].classList.toggle("active", on);
      btns[i].classList.toggle("button-submit", on);
    }
    if (e.input) run(e.input.value.trim());
  }

  // Music / Books chips only when you have those libraries
  function libraries() {
    if (libs) return libs;
    libs = Promise.resolve(ApiClient.getUserViews({}, ApiClient.getCurrentUserId())).then(function (r) {
      var t = {};
      ((r && r.Items) || []).forEach(function (v) { if (v.CollectionType) t[v.CollectionType] = 1; });
      return t;
    }, function () { libs = null; return {}; });
    return libs;
  }

  function mount() {
    var page = document.getElementById("searchPage");
    if (!page || !window.ApiClient) return;
    var have = page.querySelector("#smart-search-wrapper");
    if (have) return;
    var fields = page.querySelector(".searchFields");
    if (!fields) return;
    var wrap = document.createElement("div");
    wrap.id = "smart-search-wrapper";
    wrap.className = "smart-search-wrapper";
    wrap.innerHTML =
      '<div class="input-wrapper"><span class="searchfields-icon material-icons search" aria-hidden="true"></span>' +
      '<input type="search" class="smart-search-input emby-input searchfields-txtSearch tb-search-input" placeholder="Search..." autocomplete="off" spellcheck="false" aria-label="Search"></div>' +
      '<div class="smart-search-buttons">' +
      '<button type="button" class="smart-search-btn emby-button flat" data-mode="all">All</button>' +
      '<button type="button" class="smart-search-btn emby-button flat" data-mode="videos">Movies/TV</button>' +
      '<button type="button" class="smart-search-btn emby-button flat hide" data-mode="music">Music</button>' +
      '<button type="button" class="smart-search-btn emby-button flat hide" data-mode="books">Books</button></div>';
    fields.insertBefore(wrap, fields.firstChild);
    var results = document.createElement("div");
    results.id = "smart-search-results";
    results.className = "smart-search-results padded-top padded-bottom-page";
    page.appendChild(results);

    var e = els(), input = e.input;
    libraries().then(function (t) {
      if (t.music) wrap.querySelector('[data-mode="music"]').classList.remove("hide");
      if (t.books) wrap.querySelector('[data-mode="books"]').classList.remove("hide");
    });
    wrap.querySelector(".smart-search-buttons").addEventListener("click", function (ev) {
      var b = ev.target.closest(".smart-search-btn");
      if (b) setMode(b.getAttribute("data-mode"), els());
    });
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var v = input.value.trim();
      if (!v) { run(""); return; }
      // already known (typed before, or narrowing a finished search): straight away; otherwise a short pause while typing
      var types = GROUPS[mode] || GROUPS.videos;
      var ready = types.every(function (ty) { return known(ty, v); });
      timer = setTimeout(function () { run(input.value.trim()); }, ready ? 0 : 180);
    });
    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); run(input.value.trim()); }
    });

    // back to a search you'd made, or a link with ?query=
    var start = hashParam("tbq") || hashParam("query");
    mode = GROUPS[hashParam("tbt")] ? hashParam("tbt") : "videos";
    setMode(mode, e);
    if (start) { input.value = start; run(start); }
    // opened again with a different search in the link (?tbq=...): run that one
    wrap.__tbFollow = function () {
      var q = hashParam("tbq") || hashParam("query");
      if (q && q !== input.value.trim()) { input.value = q; run(q); }
    };
    if (!("ontouchstart" in window)) { try { input.focus({ preventScroll: true }); } catch (x) {} }
  }

  tbWatch(function () { if (/^#\/search/.test(location.hash)) mount(); });
  window.addEventListener("hashchange", function () {
    if (!/^#\/search/.test(location.hash)) return;
    var have = document.querySelector("#searchPage #smart-search-wrapper");
    if (have && have.__tbFollow) have.__tbFollow(); else mount();
  });

  var st = document.createElement("style");
  st.id = "tb-search-style";
  st.textContent = [
    // Jellyfin's own box + results stay mounted but out of sight (ours replace them)
    "#searchPage .searchFields > :not(#smart-search-wrapper) { display: none !important; }",
    "#searchPage .searchResults:not(#smart-search-results) { display: none !important; }",
    "#searchPage.tb-searching .searchSuggestions { display: none !important; }",
    "#searchPage #smart-search-wrapper .input-wrapper { position: relative; }",
    "#searchPage .smart-search-input { width: 100%; box-sizing: border-box; }",
    "#searchPage .smart-search-input::-webkit-search-cancel-button { -webkit-appearance: none; }",
    "#searchPage .smart-search-buttons { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; justify-content: center; }",
    "#searchPage .smart-search-btn.hide { display: none !important; }",
    "#searchPage #smart-search-results .verticalSection { margin-bottom: 2em; }"
  ].join("\n");
  tbCss(st);

  if (/^#\/search/.test(location.hash)) mount();
})();

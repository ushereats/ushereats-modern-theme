(function tbHomeRows() {
  // Home rows (replaces KefinTweaks' Enhanced Home Screen).
  //  - one layout for everyone, set in the plugin settings
  //  - the rows were already requested from the page head before Jellyfin started
  //  - shown instantly from the last visit, then quietly updated (only rows that actually changed are redrawn)
  //  - built once and kept: coming back to Home re-uses them; no fades, no loading placeholders
  //  - Jellyfin's own home rows are hidden (it still decides nothing about what's shown here)
  if (window.__tbRowsStarted) return;
  window.__tbRowsStarted = true;
  var B = window.__tbRowsBoot, C = window.tbCards;
  var html = document.documentElement;
  if (!B || !C) { html.classList.remove("tb-rows"); return; }

  // ── the layout from the plugin settings ──
  function parseRows() {
    var raw = tbCfg("HomeRowsJson", "[]"), list;
    try { list = typeof raw === "string" ? JSON.parse(raw) : raw; } catch (e) { list = []; }
    if (!Array.isArray(list)) list = [];
    var seen = {};
    return list.filter(function (r) {
      if (!r || r.on === false || !r.type) return false;
      if (!r.id || seen[r.id]) r.id = "r" + Math.random().toString(36).slice(2, 8);
      seen[r.id] = 1;
      return true;
    });
  }
  var rows = parseRows();
  if (!rows.length) { html.classList.remove("tb-rows"); return; }
  html.classList.add("tb-rows");
  var cfgStr = JSON.stringify(rows);
  var cfgKey = (function (s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); })(cfgStr);
  try {
    if (localStorage.getItem("tbRowsCfgKey") !== cfgKey) {
      localStorage.setItem("tbRowsCfg", cfgStr);   // so the next page load can ask for these rows from the head
      localStorage.setItem("tbRowsCfgKey", cfgKey);
    }
  } catch (e) {}

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

  function isHomeRoute() {
    var h = location.hash;
    if (h === "" || h === "#") return true;
    var m = /^#\/(?:home)?(?:\?([^#]*))?$/.exec(h);
    if (!m) return false;
    var q = m[1] || "";
    return !/(^|&)seerrfinTab=/.test(q) && !/(^|&)tab=(?!0(&|$))/.test(q);
  }
  function who() {
    try {
      var api = window.ApiClient;
      if (!api) return null;
      var id = api.getCurrentUserId(), tok = api.accessToken();
      return id && tok ? { id: id, token: tok } : null;
    } catch (e) { return null; }
  }

  // ── remembered rows (per user, per layout) ──
  function cacheName(u) { return "tbRowsData:" + u; }
  function readCache(u) {
    try {
      var c = JSON.parse(localStorage.getItem(cacheName(u)) || "null");
      return c && c.key === cfgKey && c.rows ? c.rows : null;
    } catch (e) { return null; }
  }
  var saveTimer = 0;
  function saveCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      if (!user) return;
      var out = {};
      rows.forEach(function (r) { if (data[r.id]) out[r.id] = data[r.id]; });
      try { localStorage.setItem(cacheName(user), JSON.stringify({ key: cfgKey, at: Date.now(), rows: out })); } catch (e) {}
    }, 500);
  }

  // ── building ──
  var root = null, user = null, data = {}, sections = {}, lastFetch = 0, fetching = null, everPlaced = false;

  function shape(r) { return r.type === "studios" ? "logo" : r.shape || (r.type === "continue" ? "thumb" : "poster"); }

  function studioItems(r) {
    var a = (r.items || []).filter(function (x) { return x && (x.id || x.url); }).slice();
    if (r.shuffle !== false) {
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
    }
    return a;
  }

  function cardsHtml(r, items) {
    var sid = C.serverId(), s = shape(r), out = "";
    var own = r.type === "continue";   // Continue Watching: each episode's own picture (movies: their thumb)
    var noText = !(r.titles != null ? r.titles : r.type === "continue");   // titles under posters: Continue Watching only, unless set
    for (var i = 0; i < items.length; i++) out += r.type === "studios" ? C.logoCard(items[i], i, sid) : C.card(items[i], s, i, sid, "", own, noText);
    return out;
  }

  function setRow(r, items, attached) {
    var sec = sections[r.id];
    if (!sec || !items) return;
    var sig = JSON.stringify(items);
    if (sec.__tbSig === sig) return;          // nothing changed: leave it exactly as it is
    sec.__tbSig = sig;
    var ic = sec.querySelector(".itemsContainer");
    ic.innerHTML = cardsHtml(r, items);
    var want = items.length ? "" : "none";
    if (sec.style.display !== want) sec.style.display = want;
    if (attached) { C.upgrade(ic); C.refreshScroller(sec); C.decorate(); }
    C.load(sec);
  }

  function build(u, initial) {
    user = u;
    data = {};
    sections = {};
    root = document.createElement("div");
    root.className = "sections homeSectionsContainer tb-rows-c";
    rows.forEach(function (r) {
      var titles = r.titles != null ? r.titles : r.type === "continue";
      var t0 = String(r.title || "").toLowerCase();
      var noPop = r.type === "continue" || r.type === "trending" || /^(continue watching|next up|trending this week|latest releases)/.test(t0);
      var cls = "tb-row" + (titles && r.type !== "studios" ? " show-card-titles" : "") + (noPop ? " no-hover-pop" : "") + (r.ranked ? " ranked-list" : "") +
        (r.type === "studios" ? " tb-studios" : "") + (r.cls ? " " + String(r.cls).replace(/[^\w -]/g, "") : "");
      var sec = C.frag(C.section({ title: r.title, hideTitle: r.hideTitle || r.type === "studios", more: r.more, cls: cls, attrs: ' data-tb-row="' + C.esc(r.id) + '"' }));
      sec.style.display = "none";
      sections[r.id] = sec;
      root.appendChild(sec);
      if (r.type === "studios") { data[r.id] = studioItems(r); setRow(r, data[r.id], false); }
      else if (initial && initial[r.id]) { data[r.id] = initial[r.id]; setRow(r, data[r.id], false); }
    });
  }

  // get fresh rows and redraw only the ones that changed
  function refresh(first) {
    var me = who();
    if (!me || fetching) return fetching;
    var promises = first && first.user === me.id && first.key === cfgKey ? first.data : B.run(rows.filter(function (r) { return r.type !== "studios"; }), me.id, me.token);
    lastFetch = first ? first.at : Date.now();
    var list = rows.filter(function (r) { return r.type !== "studios"; });
    fetching = Promise.all(list.map(function (r) {
      var p = promises[r.id] || B.run([r], me.id, me.token)[r.id];
      return p.then(function (items) { return items || []; }, function () { return null; });
    })).then(function (res) {
      fetching = null;
      if (me.id !== user) return false;
      var ok = !list.length;          // only static rows (studios): nothing to fetch
      list.forEach(function (r, i) {
        if (!res[i]) return;                 // couldn't reach the server: keep what's shown
        ok = true;
        data[r.id] = res[i];
        setRow(r, res[i], !!(root && root.isConnected));
      });
      if (ok) saveCache();
      return ok;
    });
    return fetching;
  }

  // ── keeping it on the page ──
  function findSpot() {
    var page = document.getElementById("indexPage");
    if (!page || page.classList.contains("hide")) return null;
    var tab = page.querySelector(":scope > #homeTab") || page.querySelector("#homeTab");
    if (!tab) return null;
    var native = tab.querySelector(":scope > .sections:not(.tb-rows-c)");
    return native ? { tab: tab, native: native } : null;
  }
  function place() {
    if (!root) return;
    var s = findSpot();
    if (!s || root.parentNode === s.tab) return;
    // moving the rows re-creates Jellyfin's row arrows: drop the old ones first
    if (everPlaced) {
      var old = root.querySelectorAll(".emby-scrollbuttons");
      for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
    }
    s.tab.insertBefore(root, s.native.nextSibling);
    everPlaced = true;
    C.upgrade(root);
    C.decorate();
  }

  var started = false, retryAt = 0;
  function reconcile() {
    var me = who();
    if (!me) return;
    if (root && user !== me.id) {           // signed in as someone else
      if (root.parentNode) root.parentNode.removeChild(root);
      root = null; everPlaced = false; started = false;
    }
    if (!root) {
      if (started || Date.now() < retryAt) return;
      started = true;
      var cached = readCache(me.id);
      var first = B.first; B.first = null;
      if (cached) {
        build(me.id, cached);               // instant: last visit's rows
        place();
        refresh(first);
      } else {
        user = me.id;
        var p = refresh(first);
        if (p) p.then(function (ok) {
          if (!ok) { started = false; retryAt = Date.now() + 15000; html.classList.remove("tb-rows"); return; }   // nothing loaded: show Jellyfin's rows
          var fresh = data;
          build(me.id, fresh);
          html.classList.add("tb-rows");
          place();
        });
      }
      return;
    }
    if (isHomeRoute()) place();
  }

  // coming back to Home: quietly re-check (Continue Watching after you watched something, new items...)
  var wasHome = isHomeRoute();
  function onRoute() {
    var home = isHomeRoute();
    if (home && !wasHome && root && Date.now() - lastFetch > 8000) refresh();
    wasHome = home;
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; reconcile(); }, 0);
  }
  tbWatch(function () { if (root) place(); schedule(); });
  window.addEventListener("hashchange", function () { onRoute(); schedule(); });
  window.addEventListener("popstate", function () { onRoute(); schedule(); });
  document.addEventListener("viewshow", function () { onRoute(); schedule(); });
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && root && isHomeRoute() && Date.now() - lastFetch > 300000) refresh();
  });

  var st = document.createElement("style");
  st.id = "tb-rows-style";
  st.textContent = [
    // Jellyfin's own rows are replaced by ours
    "html.tb-rows #homeTab > .sections:not(.tb-rows-c) { display: none !important; }",
    // studio logos: white, no tile behind them, no titles
    ".tb-studios .itemsContainer > .card { width: 8vw !important; min-width: 96px; }",
    "@media (max-width: 768px) { .tb-studios .itemsContainer > .card { width: 30vw !important; } }",
    // (:not(#tb-x) outranks SleekFin's "html.sleekfin-main-ui .cardBox:not(.visualCardBox) .cardPadder" tile colour)
    ".tb-studios .cardPadder:not(#tb-x), .tb-studios .cardImageContainer:not(#tb-x), .tb-studios .cardContent:not(#tb-x) { background: transparent !important; box-shadow: none !important; border-radius: 0 !important; }",
    ".tb-studios .tb-logo-img { position: absolute; top: 10%; left: 8%; right: 8%; bottom: 10%; background: center / contain no-repeat; filter: brightness(0) invert(1); opacity: .92; transition: opacity .15s ease; }",
    ".tb-studios .tb-logo-link:hover .tb-logo-img, .tb-studios .tb-logo-link:focus .tb-logo-img { opacity: 1; }",
    ".tb-studios .cardBox { margin-bottom: 0 !important; }",
    // no poster backing, shadow, dim layer or hover shadow behind the logos
    ".tb-studios .card .cardScalable:not(#tb-x) { background: none !important; box-shadow: none !important; border: 0 !important; clip-path: none !important; }",
    ".tb-studios .card .cardScalable:not(#tb-x)::before, .tb-studios .card .cardScalable:not(#tb-x)::after { content: none !important; display: none !important; }",
    ".tb-studios .card:not(#tb-x) .cardBox, .tb-studios .card:hover:not(#tb-x) .cardBox { filter: none !important; box-shadow: none !important; background: none !important; }"
  ].join("\n");
  document.head.appendChild(st);

  schedule();
})();

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

  var tbWatch = window.tbWatch;   // shared page watcher (in every theme file)

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
  var MAX_AGE = 6 * 3600 * 1000;   // older than this: not shown, today's rows are loaded instead
  function readCache(u) {
    try {
      var c = JSON.parse(localStorage.getItem(cacheName(u)) || "null");
      if (!c || c.key !== cfgKey || !c.rows || !(Date.now() - (c.at || 0) < MAX_AGE)) return null;
      // something was watched since (Continue Watching / Next Up will differ): wait briefly for fresh rows first
      var st = +(localStorage.getItem("tbRowsStale") || 0);
      return { rows: c.rows, at: c.at, stale: st > (c.at || 0) };
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

  function cardHtml(r, item, i, sid) {
    var own = r.type === "continue";   // Continue Watching: each episode's own picture (movies: their thumb)
    var noText = !(r.titles != null ? r.titles : r.type === "continue");   // titles under posters: Continue Watching only, unless set
    return r.type === "studios" ? C.logoCard(item, i, sid) : C.card(item, shape(r), i, sid, "", own, noText);
  }
  function cardsHtml(r, items) {
    var sid = C.serverId(), out = "";
    for (var i = 0; i < items.length; i++) out += cardHtml(r, items[i], i, sid);
    return out;
  }

  // Only the cards that changed are touched: unchanged cards stay the same element (same picture, already
  // drawn, nothing flickers), moved ones are moved, new ones are added, gone ones removed.
  // each card remembers which title (and which state of it) it shows, so cards are matched by what they are,
  // not by their place: other features re-sort a row (release dates), and matching by place then reused the
  // wrong card for a title (the same title showing two or three times until a reload)
  function patch(r, ic, items, newSigs) {
    var sid = C.serverId(), pool = {}, kids = Array.prototype.slice.call(ic.children), i;
    for (i = 0; i < kids.length; i++) { var k = kids[i].__tbSig; if (k != null) (pool[k] || (pool[k] = [])).push(kids[i]); }
    var nodes = [];
    for (i = 0; i < items.length; i++) {
      var reuse = pool[newSigs[i]] && pool[newSigs[i]].shift();
      if (!reuse) { reuse = C.frag(cardHtml(r, items[i], i, sid)); reuse.__tbSig = newSigs[i]; }
      nodes.push(reuse);
    }
    for (i = 0; i < kids.length; i++) if (nodes.indexOf(kids[i]) < 0 && kids[i].parentNode === ic) ic.removeChild(kids[i]);
    for (i = 0; i < nodes.length; i++) {
      if (ic.children[i] !== nodes[i]) ic.insertBefore(nodes[i], ic.children[i] || null);
      if (nodes[i].getAttribute("data-index") !== String(i)) nodes[i].setAttribute("data-index", String(i));
    }
  }

  function setRow(r, items, attached) {
    var sec = sections[r.id];
    if (!sec || !items) return;
    var sig = items.map(function (x) { return x.Id || x.id || ""; }).join(",");
    if (sec.__tbSig === sig) return;          // nothing changed: leave it exactly as it is
    sec.__tbSig = sig;
    var ic = sec.querySelector(".itemsContainer");
    var newSigs = items.map(function (x) { return JSON.stringify(x); });
    var tagged = ic.children.length && Array.prototype.every.call(ic.children, function (c) { return c.__tbSig != null; });
    if (attached && tagged) patch(r, ic, items, newSigs);
    else {
      ic.innerHTML = cardsHtml(r, items);
      for (var i = 0; i < ic.children.length && i < newSigs.length; i++) ic.children[i].__tbSig = newSigs[i];
    }
    var want = items.length ? "" : "none";
    if (sec.style.display !== want) sec.style.display = want;
    if (attached) { C.upgrade(ic); C.refreshScroller(sec); C.decorate(); }
    C.load(sec);
    if (r.type === "continue") addRemove(ic);
    if (r.ranked) widen(sec);
  }

  // ── Top 10: the #1 title as a wide card (its backdrop and logo, a few words, Play / Trailer / More info) ──
  // Its details are kept from the last visit, so the card is wide from the first frame.
  if (tbCfg("TopTenStyle", "badges") === "badges") html.classList.add("tb-rank-badges");
  var wideInfo = (function () { try { return JSON.parse(localStorage.getItem("tbWide") || "null"); } catch (e) { return null; } })();
  function ytId(it) {
    var t = (it.RemoteTrailers || []).map(function (x) { return /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/)|youtu\.be\/)([\w-]{11})/.exec(x.Url || ""); }).filter(Boolean)[0];
    return t ? t[1] : "";
  }
  function wideData(it) {
    return {
      id: it.Id, name: it.Name || "", year: it.ProductionYear || "", rating: it.CommunityRating ? it.CommunityRating.toFixed(1) : "",
      genres: (it.Genres || []).slice(0, 2).join(", "), cast: (it.People || []).filter(function (x) { return x.Type === "Actor"; }).slice(0, 3).map(function (x) { return x.Name; }).join(", "),
      ov: it.Overview || "", bd: (it.BackdropImageTags || [])[0] || "", logo: (it.ImageTags && it.ImageTags.Logo) || "", yt: ytId(it)
    };
  }
  function wideHtml(d) {
    var api = window.ApiClient, bd = "", logo = "";
    try {
      if (d.bd) bd = api.getScaledImageUrl(d.id, { type: "Backdrop", maxWidth: 1280, quality: 90, tag: d.bd });
      if (d.logo) logo = api.getScaledImageUrl(d.id, { type: "Logo", maxWidth: 600, quality: 90, tag: d.logo });
    } catch (e) {}
    var meta = [d.rating ? "<b>\u2605 " + C.esc(d.rating) + "</b>" : "", C.esc(String(d.year)), C.esc(d.genres), '<span class="tb-wide-cast">' + C.esc(d.cast) + "</span>"].filter(function (x) { return x && x !== '<span class="tb-wide-cast"></span>'; }).join(" \u00b7 ");
    return '<div class="tb-wide-info"' + (bd ? ' style="background-image:linear-gradient(90deg,rgba(0,0,0,.82),rgba(0,0,0,.5) 42%,transparent 75%),linear-gradient(0deg,rgba(0,0,0,.6),transparent 55%),url(&quot;' + C.esc(bd) + '&quot;)"' : "") + ">" +
      (logo ? '<img class="tb-wide-logo" alt="' + C.esc(d.name) + '" src="' + C.esc(logo) + '">' : '<div class="tb-wide-name">' + C.esc(d.name) + "</div>") +
      '<div class="tb-wide-meta">' + meta + "</div>" + (d.ov ? '<div class="tb-wide-ov">' + C.esc(d.ov) + "</div>" : "") +
      '<div class="tb-wide-btns"><button type="button" class="itemAction tb-wide-play" data-action="play"><span class="material-icons play_arrow" aria-hidden="true"></span>Play</button>' +
      (d.yt ? '<button type="button" class="tb-wide-tr" data-action="none" data-yt="' + C.esc(d.yt) + '">Trailer</button>' : "") +
      '<span class="tb-wide-more">More info</span></div></div>';
  }
  function unwide(c) {
    c.classList.remove("tb-wide");
    var i = c.querySelector(".tb-wide-info");
    if (i) i.parentNode.removeChild(i);
    c.__tbWide = null;
  }
  function applyWide(sec, c, d) {
    if (!c.parentNode || c.getAttribute("data-id") !== d.id) return;
    var img = c.querySelector(".cardImageContainer");
    if (!img) return;
    var key = JSON.stringify(d);
    if (c.__tbWide === key && img.querySelector(".tb-wide-info")) return;
    var old = img.querySelector(".tb-wide-info");
    if (old) old.parentNode.removeChild(old);
    img.insertAdjacentHTML("beforeend", wideHtml(d));
    c.__tbWide = key;
    if (!c.classList.contains("tb-wide")) { c.classList.add("tb-wide"); if (sec.isConnected) C.refreshScroller(sec); }
  }
  function widen(sec) {
    var ic = sec.querySelector(".itemsContainer");
    if (!ic) return;
    var c = null;
    for (var k = ic.firstElementChild; k; k = k.nextElementSibling) {
      if (!c && k.classList.contains("card") && k.hasAttribute("data-id")) c = k;
      else if (k.classList.contains("tb-wide")) unwide(k);
    }
    if (!c) return;
    var id = c.getAttribute("data-id"), api = window.ApiClient;
    if (wideInfo && wideInfo.id === id) applyWide(sec, c, wideInfo);
    if (!api || c.__tbWideAsked === id) return;
    c.__tbWideAsked = id;
    Promise.resolve(api.getItem(api.getCurrentUserId(), id)).then(function (it) {
      var d = wideData(it);
      wideInfo = d;
      try { localStorage.setItem("tbWide", JSON.stringify(d)); } catch (e) {}
      applyWide(sec, c, d);
    }, function () { c.__tbWideAsked = null; });
  }
  // Trailer: YouTube's player in a box over the page (Escape, the ✕ or a click outside closes it)
  function trailer(yt) {
    var box = document.createElement("div");
    box.className = "tb-trailer";
    box.innerHTML = '<div class="tb-trailer-in"><iframe src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(yt) + '?autoplay=1&rel=0&modestbranding=1" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen title="Trailer"></iframe>' +
      '<button type="button" class="tb-trailer-x" aria-label="Close">\u2715</button></div>';
    function close() { if (box.parentNode) box.parentNode.removeChild(box); document.removeEventListener("keydown", key, true); }
    function key(e) { if (e.key === "Escape" || e.key === "Backspace" || e.keyCode === 461) { e.preventDefault(); e.stopPropagation(); close(); } }
    box.addEventListener("click", function (e) { if (e.target === box || e.target.closest(".tb-trailer-x")) close(); });
    document.addEventListener("keydown", key, true);
    document.body.appendChild(box);
  }
  window.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest(".tb-wide-tr");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    trailer(b.getAttribute("data-yt"));
  }, true);

  // ── Continue Watching: ✕ on a card removes it ──
  //  - part-watched: the saved position is cleared in Jellyfin, so every app (Moonfin, phones, TVs) drops it too
  //  - next episodes (and the part-watched one, so it doesn't come straight back as the next episode): kept on
  //    the theme's own list for you, until you watch further in that show
  // Watched / unwatched marks are never touched.
  var X_BTN = '<button type="button" class="tb-cw-x" data-action="none" title="Remove from Continue Watching" aria-label="Remove from Continue Watching">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  function addRemove(ic) {
    var cards = ic.querySelectorAll(".card[data-id]");
    for (var i = 0; i < cards.length; i++) {
      var sc = cards[i].querySelector(".cardScalable");
      if (sc && !sc.querySelector(".tb-cw-x")) sc.insertAdjacentHTML("beforeend", X_BTN);
    }
  }
  function removeFromContinue(btn) {
    var card = btn.closest(".card[data-id]"), sec = btn.closest("[data-tb-row]"), me = who(), api = window.ApiClient;
    if (!card || !sec || !me || !api || card.classList.contains("tb-cw-going")) return;
    var id = card.getAttribute("data-id"), rid = sec.getAttribute("data-tb-row");
    var r = rows.filter(function (x) { return x.id === rid; })[0];
    card.classList.add("tb-cw-going");
    var jobs = [api.ajax({ type: "POST", url: api.getUrl("UshereatsTheme/continue/hide", { itemId: id }) })];
    if (card.hasAttribute("data-positionticks"))
      jobs.push(api.ajax({ type: "POST", url: api.getUrl("UserItems/" + id + "/UserData"), data: JSON.stringify({ PlaybackPositionTicks: 0 }), contentType: "application/json" }));
    Promise.all(jobs)
      .then(function () {
        try { localStorage.setItem("tbRowsStale", String(Date.now())); } catch (e) {}
        setTimeout(function () {
          if (r && data[rid]) {
            data[rid] = data[rid].filter(function (x) { return (x.Id || x.id) !== id; });
            setRow(r, data[rid], !!(root && root.isConnected));
            saveCache();
          }
          // the row from the server: the show's next episode can take its place
          setTimeout(function () { if (root && !fetching) refresh(); }, 600);
        }, 320);
      }, function () {
        card.classList.remove("tb-cw-going");
      });
  }
  window.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest(".tb-cw-x");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    removeFromContinue(b);
  }, true);

  function build(u, initial) {
    user = u;
    data = {};
    sections = {};
    root = document.createElement("div");
    root.className = "sections homeSectionsContainer tb-rows-c";
    rows.forEach(function (r) {
      var titles = r.titles != null ? r.titles : r.type === "continue";
      var cls = "tb-row" + (titles && r.type !== "studios" ? " show-card-titles" : "") + (r.ranked ? " ranked-list" : "") +
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
    if (window.tbHeroHold) window.tbHeroHold();
    everPlaced = true;
    C.upgrade(root);
    C.decorate();
    // rows wait (invisible) for the banner above them, so they never jump down when it arrives; 1.5 s at most
    setTimeout(function () { document.documentElement.classList.add("tb-rows-ok"); }, 450);
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
      if (cached && !cached.stale) {
        build(me.id, cached.rows);          // instant: last visit's rows (the update only touches what changed)
        place();
        refresh(first);
      } else if (cached) {
        // something was watched since: fresh rows if they come within 400 ms, else last visit's, then patched
        user = me.id;
        var shown = false;
        var fallback = setTimeout(function () { if (shown) return; shown = true; build(me.id, cached.rows); place(); }, 400);
        var pr = refresh(first);
        if (pr) pr.then(function (ok) {
          if (shown) return;
          shown = true; clearTimeout(fallback);
          var fresh = data;
          build(me.id, ok ? fresh : cached.rows);
          place();
        });
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
  var wasHome = isHomeRoute(), playerAt = 0, stoppedAt = 0;
  function onRoute() {
    var home = isHomeRoute();
    if (/^#!?\/?video/i.test(location.hash)) playerAt = Date.now();
    // straight back from the player: the refresh after "playback stopped" brings the new Continue Watching (one
    // asked now would come before the server has saved where you stopped, and be asked again a moment later)
    var fromPlayer = Date.now() - playerAt < 4000 || Date.now() - stoppedAt < 4000;
    if (home && !wasHome && root && !fromPlayer && Date.now() - lastFetch > 8000) refresh();
    wasHome = home;
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; reconcile(); }, 0);
  }
  tbWatch(function () { if (root) place(); schedule(); });
  window.addEventListener("tb-playback-stopped", function () {
    stoppedAt = Date.now();
    try { localStorage.setItem("tbRowsStale", String(Date.now())); } catch (e) {}
    setTimeout(function () { if (root) refresh(); }, 300);   // (announced once the server has saved it)
  });
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
    ".tb-studios .cardPadder, .tb-studios .cardImageContainer, .tb-studios .cardContent { background: transparent !important; box-shadow: none !important; border-radius: 0 !important; }",
    ".tb-studios .tb-logo-img { position: absolute; top: 10%; left: 8%; right: 8%; bottom: 10%; background: center / contain no-repeat; filter: brightness(0) invert(1); opacity: .92; transition: opacity .15s ease; }",
    ".tb-studios .tb-logo-link:hover .tb-logo-img, .tb-studios .tb-logo-link:focus .tb-logo-img { opacity: 1; }",
    ".tb-studios .cardBox { margin-bottom: 0 !important; }",
    // no poster backing, shadow, dim layer or hover shadow behind the logos
    ".tb-studios .card .cardScalable { background: none !important; box-shadow: none !important; border: 0 !important; }",
    // Continue Watching: the remove button (top right, shows on hover; always there on touch screens)
    ".tb-cw-x { position: absolute; top: 8px; right: 8px; z-index: 5; width: 30px; height: 30px; padding: 7px; border: 0; border-radius: 50%; cursor: pointer;" +
      " background: rgba(10,10,12,.62); -webkit-backdrop-filter: blur(8px); backdrop-filter: blur(8px); box-shadow: 0 0 0 1px rgba(255,255,255,.18);" +
      " opacity: 0; transform: scale(.85); transition: opacity .15s ease, transform .15s ease, background .15s ease; }",
    ".tb-cw-x svg { display: block; width: 100%; height: 100%; fill: none; stroke: #fff; stroke-width: 2.4; stroke-linecap: round; }",
    ".card:hover .tb-cw-x, .card:focus-within .tb-cw-x { opacity: 1; transform: none; }",
    ".tb-cw-x:hover { background: var(--ue-accent, #dc2626); }",
    "@media (hover: none) { .tb-cw-x { opacity: .9; transform: none; } }",
    "html.layout-tv .tb-cw-x { display: none; }",
    ".card.tb-cw-going { opacity: 0; transform: scale(.92); transition: opacity .3s ease, transform .3s ease; pointer-events: none; }"
  ].join("\n");
  tbCss(st);

  schedule();
})();

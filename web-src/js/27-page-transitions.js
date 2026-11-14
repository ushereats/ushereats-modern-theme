(function pageTransitions() {
  // Page changes exactly as on cinejoy.pk (measured from cinejoy running): the page you were on stays on screen
  // until the next one is ready, then the whole screen cross-fades with the browser's own View Transition, left
  // exactly as the browser draws it: 250 ms, "ease", the two pages blended "plus-lighter" (no dip in brightness).
  // Opening a title, going back (back arrow, browser / mouse back), changing page.
  // Browsers without View Transitions (Firefox before 144, Safari before 18) just change page.
  // Off on TVs, while a video plays and on the very first page. Like cinejoy it also runs when the computer has
  // "animation effects" turned off (Windows / macOS): a 250 ms fade, not movement.
  if (window.__tbPageFx) return;
  window.__tbPageFx = true;

  // ── where each page was scrolled to (one place for it: SleekFin's own copy is gone) ──
  // Going back puts you where you were; anything else (a title, the home button, a library) starts at the top.
  // Set while the old page is still held, and kept for a moment after, because Jellyfin and the rows growing
  // move the page a moment after it shows (that was the jump seen right after the change).
  var pos = {}, want = null, until = 0, userMoved = false, running = false;
  try { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; } catch (e) {}
  function scrolled() { var e = document.scrollingElement || document.documentElement; return Math.max(window.pageYOffset || 0, e ? e.scrollTop : 0); }
  function scrollNow(y) { try { window.scrollTo({ top: y, left: 0, behavior: "instant" }); } catch (e) { window.scrollTo(0, y); } }
  window.addEventListener("scroll", function () {
    if (want !== null && Date.now() < until && !userMoved) { if (Math.abs(scrolled() - want) > 1) scrollNow(want); return; }
    if (!running) pos[location.hash] = scrolled();
  }, { passive: true });
  // you scrolling yourself always wins
  ["wheel", "touchstart", "keydown", "mousedown"].forEach(function (t) { window.addEventListener(t, function () { if (!running) userMoved = true; }, { passive: true, capture: true }); });
  function keep(y) {
    want = y; userMoved = false; until = Date.now() + 2000;
    scrollNow(y);
    // rows growing don't send a scroll event: checked a few times too
    [0, 50, 120, 250, 500, 900, 1400, 1950].forEach(function (d) { setTimeout(function () { if (want === y && Date.now() < until && !userMoved && Math.abs(scrolled() - y) > 1) scrollNow(y); }, d); });
  }
  // Library pages with a tab row in the top bar (Movies, Shows, Music, Live TV): the room for that row is kept from
  // the moment the address changes (sleekfin-header-shared.css), instead of the page moving down when Jellyfin
  // adds the row a moment later
  function libRoute() { document.documentElement.classList.toggle("tb-libtabs", /^#!?\/(movies|tv|music|livetv)(\.html)?([?#]|$)/i.test(location.hash)); }
  libRoute();
  window.addEventListener("hashchange", libRoute, true);
  window.addEventListener("popstate", libRoute, true);

  var fx = tbCfg("PageTransitions", true) && typeof document.startViewTransition === "function";
  window.tbScroll = { top: function () { pos[location.hash] = 0; keep(0); } };
  if (!fx) {
    // no cross-fade here: the same scroll handling, straight away
    window.addEventListener("popstate", function () { var y = pos[location.hash]; if (y !== undefined) setTimeout(function () { keep(y); }, 0); });
    return;
  }

  var html = document.documentElement;

  function off() {
    return html.classList.contains("layout-tv") || (document.body && document.body.classList.contains("layout-tv")) ||
      /^#\/?(video|queue)/i.test(location.hash) || !!document.getElementById("videoOsdPage") && !document.getElementById("videoOsdPage").classList.contains("hide") ||
      (document.body && document.body.classList.contains("dashboardDocument"));
  }
  function current() {
    var ps = document.querySelectorAll(".page:not(.hide)");
    for (var i = ps.length - 1; i >= 0; i--) if (!ps[i].closest(".hide") && ps[i].id !== "videoOsdPage") return ps[i];
    return null;
  }

  // No styling of the fade itself (that's the point: the browser's default is what cinejoy shows).
  // Only: the rows' own entrance fade would be frozen at "invisible" while the old page is held and play after
  // the cross-fade (old page -> empty -> rows); rows that were there for a cross-fade don't play it.
  var st = document.createElement("style");
  st.textContent = "html.tb-vt :is(#indexPage,#searchPage) .verticalSection,html.tb-vt :is(#moviesPage,#tvshowsPage,#tvRecommendedPage) .itemsContainer,.verticalSection.tb-noenter,.itemsContainer.tb-noenter{animation:none!important}" +
    // while the crossfade runs, skip layout/paint for sections below the banner so the main thread
    // doesn't waste time laying out cast/similar/episodes before the animation even starts
    "html.tb-vt #itemDetailPage .verticalSection,html.tb-vt #itemDetailPage .itemsContainer{content-visibility:hidden}" +
    // the browser's ::view-transition overlay sits at z-index 10M with pointer-events:auto by default;
    // started on pointerdown, it blocks the click that follows — set none so clicks fall through
    "::view-transition,::view-transition-group(*),::view-transition-image-pair(*),::view-transition-old(*),::view-transition-new(*){pointer-events:none}";
  document.head.appendChild(st);

  var started = false, captured = false, held = [], replaying = false;

  var log = window.__tbVt = [];
  function note(x) { if (log.length > 80) log.shift(); log.push([Math.round(performance.now()), x]); }

  // ready = what cinejoy fades into: the finished page (no loading placeholders, no empty banner)
  function ready(p, t, before) {
    if (!p) return false;
    // the background colour follows the page in the same cross-fade (not a slow change after it).
    // Title pages skip this: backdrop is prefetched, ambient fires immediately.
    if (p && p.id !== "itemDetailPage" && t < 700 && window.tbAmbientPending && window.tbAmbientPending()) return false;
    if (p.id === "itemDetailPage") {
      // collections, albums, artists, playlists, people: Jellyfin's own layout (SleekFin leaves them alone)
      if (p.classList.contains("sleekfin-details-native")) {
        if (html.classList.contains("sleekfin-details-concealed")) return false;
        var nn = p.querySelector(".itemName");
        return !!(nn && nn.textContent.trim()) && nn.textContent !== before;
      }
      var sleek = !!document.querySelector("[data-sleekfin-details]") || html.classList.contains("sleekfin-details-mounted") || html.classList.contains("sleekfin-details-concealed");
      if (sleek) {
        if (!html.classList.contains("sleekfin-details-mounted") || html.classList.contains("sleekfin-details-concealed") || p.getAttribute("data-sleekfin-details") !== "true") return false;
        var st = p.querySelectorAll(".sleekfin-details-title");
        if (st.length !== 1 || !st[0].childNodes.length) return false;
        // banner complete: backdrop loaded (if the hero is there) and at least one action button visible
        var sfhero = p.querySelector(".sleekfin-hero");
        if (sfhero && !sfhero.querySelector("[data-loaded='true']")) return false;
        if (!p.querySelector(".sleekfin-details-actions :is(button, a)")) return false;
        // Jellyfin's own title still showing next to SleekFin's (for a moment the name is there twice)
        var nat = p.querySelectorAll(".nameContainer, .itemName, .parentName");
        for (var i = 0; i < nat.length; i++) if (!nat[i].closest(".sleekfin-details-hero") && nat[i].getClientRects().length && nat[i].textContent.trim()) return false;
        return st[0].innerHTML !== before;   // a new title, not the one we came from
      }
      var n = p.querySelector(".itemName");
      return !!(n && n.textContent.trim()) && n.textContent !== before;
    }
    if ((p.id === "indexPage" || p.querySelector("#homeTab")) && !/[?&]tab=[1-9]/.test(location.hash)) {
      // the banner's picture is in and the rows are really showing (Jellyfin re-draws home on the way back)
      var hero = p.querySelector(".sleekfin-hero");
      if (html.classList.contains("tb-hero-on") && !hero && t < 400) return false;
      if (hero && t < 300 && !hero.querySelector(".sleekfin-hero-slide[data-active='true'] .sleekfin-hero-backdrop[data-loaded='true']")) return false;
      if (hero && t < 300 && !hero.getClientRects().length) return false;
      var rowsOk = html.classList.contains("tb-rows-ok") && !!p.querySelector(".tb-rows-c");
      return rowsOk || seen(p) || t > 300;
    }
    // search: the theme's search box is put in a moment after Jellyfin's page shows
    if (p.id === "searchPage" && t < 800 && !p.querySelector("#smart-search-wrapper")) return false;
    return seen(p) || t > 300;
  }
  // a poster that's really on screen: laid out, inside the window, and not inside something hidden
  function seen(p) {
    var cards = p.querySelectorAll(".card[data-id], .listItem[data-id]"), h = window.innerHeight || 800;
    for (var i = 0; i < cards.length && i < 30; i++) {
      var r = cards[i].getBoundingClientRect();
      if (!r.height || r.bottom < 0 || r.top > h) continue;
      var e = cards[i], ok = true;
      while (e && e !== p) { var cs = getComputedStyle(e); if (cs.visibility === "hidden" || cs.display === "none") { ok = false; break; } e = e.parentElement; }
      if (ok) return true;
    }
    return false;
  }
  // a title page you open starts at the top: Jellyfin scrolls there a moment after showing it (seen as a jump);
  // pages you go back to keep where you were, so this only applies to opening a title
  function shownTab(p) {
    if (!p) return null;
    var ts = p.querySelectorAll(".pageTabContent");
    for (var i = 0; i < ts.length; i++) if (ts[i].getClientRects().length) return ts[i];
    return null;
  }
  function stamp(p) {
    if (!p) return "";
    var st = p.querySelector(".sleekfin-details-title") || p.querySelector(".itemName");
    return st ? (st.classList.contains("itemName") ? st.textContent : st.innerHTML) : "";
  }

  function crossfade(wait, already) {
    if (running || !started || off()) return false;
    running = true;
    captured = false;
    note("start " + location.hash);
    // already: the address has changed (back / forward), the page hasn't yet
    var from = already ? null : location.hash, page0 = current(), t0 = Date.now(), moved = already ? t0 : 0, before = stamp(page0);
    // switching tabs inside a page (home -> Favourites) keeps the same page: the tab on screen is what changes
    var tab0 = shownTab(page0);
    if (!already) pos[location.hash] = scrolled();
    var target = already ? (pos[location.hash] !== undefined ? pos[location.hash] : null) : 0;
    want = null;
    var tr;
    try {
      html.classList.add("tb-vt");
      tr = document.startViewTransition(function () {
        // the old page is held from here: back/forward events kept until now go to Jellyfin
        captured = true;
        t0 = Date.now();
        if (moved) moved = t0;
        note("held");
        var q = held; held = [];
        replaying = true;
        try { q.forEach(function (ev) { window.dispatchEvent(ev); note("replayed " + ev.type); }); } catch (e) {}
        replaying = false;
        // a title page counts as finished once it has also stopped being rebuilt for a moment (titles swapped,
        // placeholders removed). Not other pages: going back to home, posters keep loading in for a while and
        // that would hold the old page to the limit.
        // Only the page itself is watched, and only what changes its layout: pictures arriving and the background
        // colour changing don't count (they never stop on a busy page and would hold the old page to the limit).
        var last = Date.now(), watched = null, mo = new MutationObserver(function () { last = Date.now(); });
        function watchPage(p) {
          if (p === watched) return;
          watched = p;
          mo.disconnect();
          if (p) try { mo.observe(p, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden"] }); } catch (e) {}
          last = Date.now();
        }
        return new Promise(function (res) {
          var resolve = function () {
            mo.disconnect();
            try { Array.prototype.forEach.call(document.querySelectorAll(".verticalSection, .itemsContainer"), function (e) { e.classList.add("tb-noenter"); }); } catch (e) {}
            res();
          };
          // the page's position on screen (the gap under the top bar grows a moment later on some pages, e.g. a
          // library's tab row): the old page is held until that has settled too, so nothing moves after the fade
          var sig = "", sigAt = Date.now();
          function layout(p) {
            var sp = document.querySelector("header.MuiAppBar-root + div[aria-hidden='true']");
            var x = (sp ? sp.offsetHeight : -1) + "|" + (p ? Math.round(p.getBoundingClientRect().top) : -1);
            if (x !== sig) { sig = x; sigAt = Date.now(); }
            return Date.now() - sigAt;
          }
          // timers, not animation frames: the page isn't drawn while the old one is held
          (function tick() {
            var now = Date.now(), p = current();
            if (!moved && (location.hash !== from || p !== page0)) moved = now;
            if (moved) watchPage(p);
            if (!moved && now - t0 > wait) { note("no page change"); return resolve(); }
            var changed = moved && (from === null ? (p !== page0 || (p && p.id === "itemDetailPage") || (tab0 && shownTab(p) !== tab0)) : (p !== page0 || location.hash !== from));
            if (changed && target !== null && Math.abs(scrolled() - target) > 1) scrollNow(target);
            var still = changed ? layout(p) : 0;
            var isDetail = p && p.id === "itemDetailPage";
            var goingToDetail = !isDetail && /\/details\b/i.test(location.hash);
            if (changed && !goingToDetail && (isDetail || still >= 60) && (isDetail || !p || now - last >= 50) && ready(p, now - moved, before)) { note("ready " + (now - t0) + "ms " + (p && p.id)); if (target !== null) keep(target); return resolve(); }
            // a title page waits for its content (cinejoy fades straight into the finished page, never a placeholder)
            if (now - t0 > (p && p.id === "itemDetailPage" ? 2500 : 1200)) { note("timeout " + (p && p.id) + " changed=" + !!changed + " still=" + still + " sig=" + sig + " ready=" + ready(p, now - moved, before)); if (changed && target !== null) keep(target); return resolve(); }
            setTimeout(tick, 16);
          })();
        });
      });
    } catch (e) { running = false; html.classList.remove("tb-vt"); return false; }
    // Click/pointerdown-initiated transitions: navigation must go through immediately.
    // The old-state snapshot was taken synchronously by startViewTransition, so setting
    // captured=true now means hold() won't intercept the click's resulting hashchange.
    // Back/forward (already=true) keeps the original async path: captured is set inside the callback.
    if (!already) captured = true;
    var done = function () { running = false; captured = false; html.classList.remove("tb-vt"); };
    tr.finished.then(function () { note("done"); done(); }, function (e) { note("skipped " + (e && e.message)); done(); });
    return true;
  }
  window.tbCrossfade = crossfade;

  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    crossfade(400);
  }, true);

  // browser / mouse back and forward, and the back arrows (they call history.back()). Jellyfin swaps the page
  // straight away on these: the event is kept from Jellyfin until the old page is held, then handed on unchanged.
  function hold(e) {
    if (replaying || !started || off()) return;
    if (running && captured) return;
    if (!running && !crossfade(300, true)) return;
    e.stopImmediatePropagation();
    held.push(e.type === "popstate" ? new PopStateEvent("popstate", { state: e.state }) : new HashChangeEvent("hashchange", { oldURL: e.oldURL, newURL: e.newURL }));
    note("kept " + e.type);
  }
  // listened to from the page's first line (the plugin puts a hook there), so before Jellyfin's own listeners
  if (window.__tbEarlyHold) window.__tbHold = hold;
  else { window.addEventListener("popstate", hold, true); window.addEventListener("hashchange", hold, true); }

  // the first page shows as it is; from then on, page changes cross-fade
  function begin() { started = true; }
  if (document.readyState === "complete") setTimeout(begin, 1200); else window.addEventListener("load", function () { setTimeout(begin, 1200); });
})();

(function pageTransitions() {
  // Smoother page changes, as on cinejoy.pk: opening a title (or anything else) and going back cross-fade the
  // whole screen, top bar included: the old screen fades out while the new one fades in on top of it.
  // Done with the browser's View Transitions (Chrome/Edge 111+, Safari 18+, Firefox 144+): the screen you were on
  // is held as a picture for the moment the new page takes to appear (never longer than ~0.9 s), then the two
  // blend. Browsers without it: the new page fades in (optionally rising a few pixels), as before.
  // Off on TVs, while a video plays, on the very first page, and when the device asks for less motion.
  if (window.__tbPageFx || !tbCfg("PageTransitions", true)) return;
  window.__tbPageFx = true;

  var STYLE = String(tbCfg("PageTransitionStyle", "Rise"));
  var MS = Math.max(80, Math.min(600, +tbCfg("PageTransitionMs", 200) || 200));
  var html = document.documentElement;
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
  var VT = typeof document.startViewTransition === "function";

  function off() {
    return reduce.matches || html.classList.contains("layout-tv") || (document.body && document.body.classList.contains("layout-tv")) ||
      /^#\/?(video|queue)/i.test(location.hash) || !!document.getElementById("videoOsdPage") && !document.getElementById("videoOsdPage").classList.contains("hide") ||
      (document.body && document.body.classList.contains("dashboardDocument"));
  }
  function current() {
    var ps = document.querySelectorAll(".page:not(.hide)");
    for (var i = ps.length - 1; i >= 0; i--) if (!ps[i].closest(".hide") && ps[i].id !== "videoOsdPage") return ps[i];
    return null;
  }

  if (VT) {
    var st = document.createElement("style");
    st.textContent =
      "::view-transition-old(root),::view-transition-new(root){animation-duration:" + MS + "ms;animation-timing-function:ease}" +
      "::view-transition-old(root){animation-name:tb-vt-out}::view-transition-new(root){animation-name:tb-vt-in}" +
      "@keyframes tb-vt-out{to{opacity:0}}@keyframes tb-vt-in{from{opacity:0}}" +
      // nothing else on the page takes part (one blend of the whole screen)
      "html.tb-vt *{view-transition-name:none!important}";
    document.head.appendChild(st);
  }

  // ── cross-fade (View Transitions) ──
  var running = false, started = false, captured = false, held = [], replaying = false;
  var log = window.__tbVt = [];
  function note(x) { if (log.length < 60) log.push([Math.round(performance.now()), x]); }
  // a title page counts as ready once its title is there (the backdrop fades in on its own, as on cinejoy)
  // (no half-built page in between: no loading placeholders, no empty banner, no rows popping in after)
  function ready(p, t, before) {
    if (!p) return false;
    if (p.id === "itemDetailPage") {
      var sleek = !!document.querySelector("[data-sleekfin-details]") || html.classList.contains("sleekfin-details-mounted") || html.classList.contains("sleekfin-details-concealed");
      if (sleek) {
        if (!html.classList.contains("sleekfin-details-mounted") || html.classList.contains("sleekfin-details-concealed") || p.getAttribute("data-sleekfin-details") !== "true") return false;
        var st = p.querySelector(".sleekfin-details-title");
        if (!st || !(st.childNodes.length)) return false;
        return st.innerHTML !== before;   // a new title, not the one we came from
      }
      var n = p.querySelector(".itemName");
      return !!(n && n.textContent.trim()) && n.textContent !== before;
    }
    if (p.id === "indexPage" || p.querySelector("#homeTab")) {
      // the banner's picture is in and the rows are really showing (Jellyfin re-draws home on the way back)
      var hero = p.querySelector(".sleekfin-hero");
      if (html.classList.contains("tb-hero-on") && !hero && t < 400) return false;
      if (hero && !hero.querySelector(".sleekfin-hero-slide[data-active='true'] .sleekfin-hero-backdrop[data-loaded='true']")) return false;
      if (hero && !hero.getClientRects().length) return false;
      return seen(p) || t > 500;
    }
    return seen(p) || t > 300;
  }
  // a poster that's really on screen: laid out, inside the window, and not inside something hidden
  // (fades don't count: they don't move while the old screen is held, and play once it lets go)
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
  function stamp(p) {
    if (!p) return "";
    var st = p.querySelector(".sleekfin-details-title") || p.querySelector(".itemName");
    return st ? (st.classList.contains("itemName") ? st.textContent : st.innerHTML) : "";
  }
  function crossfade(wait, already) {
    if (!VT || running || !started || off()) return false;
    running = true;
    captured = false;
    note("start " + location.hash);
    // already: the address has changed (back / forward), the page hasn't yet
    var from = already ? null : location.hash, page0 = current(), t0 = Date.now(), moved = already ? t0 : 0, before = stamp(page0);
    var tr;
    try {
      html.classList.add("tb-vt");
      tr = document.startViewTransition(function () {
        // the old screen is held as a picture from here: back/forward events kept until now go to Jellyfin
        captured = true;
        t0 = Date.now();
        if (moved) moved = t0;
        note("held");
        var q = held; held = [];
        replaying = true;
        try { q.forEach(function (ev) { window.dispatchEvent(ev); note("replayed " + ev.type); }); } catch (e) {}
        replaying = false;
        // the page counts as finished once it has also stopped changing for a moment (Jellyfin and the theme
        // put pages together in steps: rows shown after the banner, titles swapped, placeholders removed)
        var last = Date.now(), mo = new MutationObserver(function () { last = Date.now(); });
        try { mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "hidden", "src", "data-loaded"] }); } catch (e) {}
        return new Promise(function (res) {
          var resolve = function () { mo.disconnect(); res(); };
          // timers, not animation frames: the page isn't drawn while the old screen is held
          (function tick() {
            var now = Date.now(), p = current();
            if (!moved && (location.hash !== from || p !== page0)) moved = now;
            if (!moved && now - t0 > wait) { note("no page change"); return resolve(); }
            if (moved && (p !== page0 || location.hash !== from) && now - last >= 70 && ready(p, now - moved, before)) { note("ready " + (now - t0) + "ms " + (p && p.id)); return resolve(); }
            if (now - t0 > 900) { note("timeout " + (p && p.id)); return resolve(); }   // never hold the screen longer
            setTimeout(tick, 16);
          })();
        });
      });
    } catch (e) { running = false; html.classList.remove("tb-vt"); return false; }
    var done = function () { running = false; captured = false; html.classList.remove("tb-vt"); };
    tr.finished.then(function () { note("done"); done(); }, function (e) { note("skipped " + (e && e.message)); done(); });
    return true;
  }
  window.tbCrossfade = crossfade;

  if (VT) {
    // clicks that open a page: posters, links, the back arrows (before Jellyfin handles them)
    document.addEventListener("click", function (e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var t = e.target && e.target.closest ? e.target : null;
      if (!t) return;
      if (t.closest(".sleekfin-details-back, .headerBackButton")) { crossfade(300); return; }
      var b = t.closest("button");
      if (b && !b.matches("[data-action='link'], .cardImageContainer, .itemAction[data-action='link']")) return;   // play, menus, favourites...
      var a = t.closest("a[href]");
      if (a && (a.target === "_blank" || !/#!?\//.test(a.getAttribute("href") || ""))) return;
      if (a || t.closest(".card[data-id], [data-action='link']")) crossfade(400);
    }, true);
    // browser / mouse back and forward, and the back arrows (they call history.back()). Jellyfin swaps the page
    // straight away on these, before the old screen could be held: the event is kept from Jellyfin (capturing
    // at the window runs first) until the old screen is held, then handed on unchanged.
    function hold(e) {
      if (replaying || !VT || !started || off()) return;
      if (running && captured) return;
      if (!running && !crossfade(300, true)) return;
      e.stopImmediatePropagation();
      held.push(e.type === "popstate" ? new PopStateEvent("popstate", { state: e.state }) : new HashChangeEvent("hashchange", { oldURL: e.oldURL, newURL: e.newURL }));
      note("kept " + e.type);
    }
    window.addEventListener("popstate", hold, true);
    window.addEventListener("hashchange", hold, true);
  }

  // ── fallback: the new page fades in (browsers without View Transitions) ──
  function fx(page) {
    if (off() || !page || !Element.prototype.animate) return;
    // title pages have their own entrance (SleekFin's)
    if (page.id === "itemDetailPage" && (html.classList.contains("sleekfin-details-mounted") || html.classList.contains("sleekfin-details-concealed") || page.hasAttribute("data-sleekfin-details"))) return;
    var o = { duration: MS, easing: EASE };
    try {
      page.animate([{ opacity: 0 }, { opacity: 1 }], o);
      if (STYLE === "Rise") {
        // the page's own blocks rise (not the page: anything fixed inside it must not move)
        var kids = page.children, n = 0;
        for (var i = 0; i < kids.length && n < 12; i++) {
          var k = kids[i];
          if (k.classList.contains("hide")) continue;
          var pos = getComputedStyle(k).position;
          if (pos === "fixed" || pos === "sticky") continue;
          k.animate([{ transform: "translateY(10px)" }, { transform: "none" }], o);
          n++;
        }
      }
    } catch (e) {}
  }

  var last = null, watching = 0;
  function watch() {
    if (!started) return;
    var my = ++watching, t0 = performance.now();
    (function tick() {
      if (my !== watching) return;
      var p = current();
      if (p && p !== last) { last = p; if (!running) fx(p); return; }
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
    })();
  }
  if (!VT) {
    window.addEventListener("hashchange", watch);
    window.addEventListener("popstate", watch);
    ["pushState", "replaceState"].forEach(function (m) {
      var orig = history[m];
      history[m] = function () { var r = orig.apply(this, arguments); setTimeout(watch, 0); return r; };
    });
  }
  // the first page shows as it is; from then on, page changes fade
  function begin() { last = current(); started = true; }
  if (document.readyState === "complete") setTimeout(begin, 1200); else window.addEventListener("load", function () { setTimeout(begin, 1200); });
})();

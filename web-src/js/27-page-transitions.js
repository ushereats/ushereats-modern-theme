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
  var running = false, started = false;
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
      if (html.classList.contains("tb-rows") && !html.classList.contains("tb-rows-ok")) return false;
      var hero = p.querySelector(".sleekfin-hero");
      if (html.classList.contains("tb-hero-on") && !hero && t < 400) return false;
      if (hero && !hero.querySelector(".sleekfin-hero-slide[data-active='true'] .sleekfin-hero-backdrop[data-loaded='true']")) return false;
      return !!p.querySelector(".card[data-id]") || t > 300;
    }
    return !!p.querySelector(".card[data-id], .listItem, .itemsContainer > *") || t > 250;
  }
  function stamp(p) {
    if (!p) return "";
    var st = p.querySelector(".sleekfin-details-title") || p.querySelector(".itemName");
    return st ? (st.classList.contains("itemName") ? st.textContent : st.innerHTML) : "";
  }
  function crossfade(wait) {
    if (!VT || running || !started || off()) return false;
    running = true;
    var from = location.hash, page0 = current(), t0 = Date.now(), moved = 0, before = stamp(page0);
    var tr;
    try {
      html.classList.add("tb-vt");
      tr = document.startViewTransition(function () {
        return new Promise(function (resolve) {
          // timers, not animation frames: the page isn't drawn while the old screen is held
          (function tick() {
            var now = Date.now(), p = current();
            if (!moved && (location.hash !== from || p !== page0)) moved = now;
            if (!moved && now - t0 > wait) return resolve();        // the click didn't change page
            if (moved && (p !== page0 || location.hash !== from) && ready(p, now - moved, before)) return resolve();
            if (now - t0 > 900) return resolve();                      // never hold the screen longer
            setTimeout(tick, 16);
          })();
        });
      });
    } catch (e) { running = false; html.classList.remove("tb-vt"); return false; }
    var done = function () { running = false; html.classList.remove("tb-vt"); };
    tr.finished.then(done, done);
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
    // browser / mouse back and forward (capturing at the window runs before Jellyfin's own listener)
    window.addEventListener("popstate", function () { crossfade(250); }, true);
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

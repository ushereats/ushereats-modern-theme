(function pageTransitions() {
  // Smoother page changes: the page you open fades in (optionally rising a few pixels) instead of
  // appearing in one frame. The top bar and the background stay still; only the page itself moves.
  // Nothing waits for it: the page is shown as soon as Jellyfin has it, the fade just runs on top.
  // Off on TVs, while a video plays, on the very first page, and when the device asks for less motion.
  if (window.__tbPageFx || !tbCfg("PageTransitions", true)) return;
  window.__tbPageFx = true;

  var STYLE = String(tbCfg("PageTransitionStyle", "Rise"));
  var MS = Math.max(80, Math.min(600, +tbCfg("PageTransitionMs", 200) || 200));
  var html = document.documentElement;
  var reduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  var EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

  function off() {
    return reduce.matches || html.classList.contains("layout-tv") || (document.body && document.body.classList.contains("layout-tv")) ||
      /^#\/?(video|queue)/i.test(location.hash) || !Element.prototype.animate;
  }
  function current() {
    var ps = document.querySelectorAll(".page:not(.hide)");
    for (var i = ps.length - 1; i >= 0; i--) if (!ps[i].closest(".hide") && ps[i].id !== "videoOsdPage") return ps[i];
    return null;
  }

  var last = null, lastHash = location.hash, watching = 0, started = false;
  function fx(page) {
    if (off() || !page) return;
    // title pages have their own entrance (SleekFin's); the dashboard is left as it is
    if (page.id === "itemDetailPage" && html.classList.contains("sleekfin-details-mounted")) return;
    if (document.body.classList.contains("dashboardDocument")) return;
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

  // after each route change, watch a few frames for the page Jellyfin shows
  function watch() {
    if (!started) return;
    var my = ++watching, t0 = performance.now();
    (function tick() {
      if (my !== watching) return;
      var p = current();
      if (p && p !== last) { last = p; fx(p); return; }
      if (p && p === last && location.hash !== lastHash && performance.now() - t0 > 60) {
        // same page element, new content (e.g. one title page to another): fade once its content changed
        lastHash = location.hash;
        return;
      }
      if (performance.now() - t0 < 900) requestAnimationFrame(tick);
    })();
    lastHash = location.hash;
  }
  window.addEventListener("hashchange", watch);
  window.addEventListener("popstate", watch);
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); setTimeout(watch, 0); return r; };
  });
  // the first page shows as it is; from then on, page changes fade
  function begin() { last = current(); started = true; }
  if (document.readyState === "complete") setTimeout(begin, 1200); else window.addEventListener("load", function () { setTimeout(begin, 1200); });
})();

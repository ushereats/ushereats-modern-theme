(function tvRemote() {
  // TV / Xbox (remote or controller), TV layout only. Fills the gaps in Jellyfin's arrow-key moving:
  //  - home opens on the banner's Play button; Up from the first row goes to the banner, Up from the
  //    banner to the top bar, Down from the banner to the first row (Jellyfin couldn't reach the banner)
  //  - a title's page opens on its Play (or Resume) button
  if (window.__tbTvRemote) return;
  window.__tbTvRemote = true;
  var html = document.documentElement;

  function tv() { return html.classList.contains("layout-tv") || !!(document.body && document.body.classList.contains("layout-tv")); }
  function shown(e) {
    if (!e || !e.getClientRects().length) return false;
    var r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.right < 0 || r.left > innerWidth) return false;
    var cs = getComputedStyle(e);
    return cs.visibility !== "hidden" && cs.display !== "none";
  }
  function list(root, sel) { return root ? Array.prototype.filter.call(root.querySelectorAll(sel), shown) : []; }
  function home() { return document.querySelector("#indexPage:not(.hide)"); }
  function heroButtons() {
    var p = home(), h = p && p.querySelector(".sleekfin-hero");
    if (!h) return [];
    var s = h.querySelector('.sleekfin-hero-slide[data-active="true"]') || h;
    return list(s, ".sleekfin-hero-actions button");
  }
  function firstRow() {
    var p = home(), c = p && p.querySelector(".tb-rows-c");
    if (!c) return null;
    var rows = c.querySelectorAll(".verticalSection");
    for (var i = 0; i < rows.length; i++) {
      var f = list(rows[i], ".itemsContainer a[href], .itemsContainer button");
      if (f.length) return { row: rows[i], items: f };
    }
    return null;
  }
  function topBar() {
    var a = document.getElementById("tb-header-avatar");
    var h = document.querySelector("[data-sleekfin-header]");
    var f = list(h, "a[href], button").filter(function (e) { return e.getAttribute("tabindex") !== "-1"; });
    if (shown(a) && f.indexOf(a) < 0) f.push(a);
    return f;
  }
  function nearestX(items, from) {
    var x = from ? from.getBoundingClientRect().left : 0, best = items[0], d = Infinity;
    items.forEach(function (e) { var dd = Math.abs(e.getBoundingClientRect().left - x); if (dd < d) { d = dd; best = e; } });
    return best;
  }
  function go(e, top) {
    if (!e) return false;
    try { e.focus({ preventScroll: true }); } catch (x) { e.focus(); }
    if (top) window.scrollTo(0, 0);
    else { try { e.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch (x) {} }
    return document.activeElement === e;
  }

  window.addEventListener("keydown", function (ev) {
    if (!tv() || ev.defaultPrevented) return;
    var k = ev.key, a = document.activeElement;
    if (k !== "ArrowUp" && k !== "ArrowDown" && k !== "ArrowLeft" && k !== "ArrowRight") return;
    var hb = heroButtons();
    if (!hb.length) return;
    var done = false, i = hb.indexOf(a);
    if (i >= 0) {
      if (k === "ArrowDown") { var fr = firstRow(); done = fr ? go(nearestX(fr.items, a)) : false; }
      else if (k === "ArrowUp") { var t = topBar(); done = t.length ? go(nearestX(t, a), true) : true; }
      else if (k === "ArrowLeft") done = i > 0 ? go(hb[i - 1], true) : true;
      else if (k === "ArrowRight") done = i < hb.length - 1 ? go(hb[i + 1], true) : true;
    } else if (k === "ArrowUp") {
      var r = firstRow();
      if (r && r.row.contains(a)) done = go(hb[0], true);
    } else if (k === "ArrowDown" && topBar().indexOf(a) >= 0) {
      done = go(hb[0], true);
    }
    if (done) { ev.preventDefault(); ev.stopImmediatePropagation(); }
  }, true);

  // where focus starts when a page opens
  var timer = 0, firstHome = true;
  function start() {
    if (!tv()) return;
    clearTimeout(timer);
    var tries = 0;
    (function attempt() {
      var a = document.activeElement, idle = !a || a === document.body || a === html;
      if (home()) {
        var hb = heroButtons(), fr = firstRow();
        // Jellyfin puts it on the first thing in the rows (or nowhere): the banner's Play is first on screen
        // (only the first time: coming back, Jellyfin puts you back on the title you left from)
        if (hb.length && (idle || firstHome && ((fr && fr.row.contains(a)) || topBar().indexOf(a) >= 0))) { firstHome = false; go(hb[0], true); return; }
      } else {
        var page = document.querySelector("#itemDetailPage:not(.hide)");
        if (page && (idle || topBar().indexOf(a) >= 0)) {
          var b = list(page, ".btnResume:not(.hide), .btnPlay:not(.hide), .sleekfin-button-primary");
          if (b.length) { go(b[0]); return; }
        }
        if (!page) return;
      }
      if (++tries < 24) timer = setTimeout(attempt, 150);
    })();
  }
  document.addEventListener("viewshow", function () { clearTimeout(timer); timer = setTimeout(start, 250); });
  window.addEventListener("hashchange", function () { clearTimeout(timer); timer = setTimeout(start, 400); });
  if (document.readyState === "complete") setTimeout(start, 600); else window.addEventListener("load", function () { setTimeout(start, 600); });
})();

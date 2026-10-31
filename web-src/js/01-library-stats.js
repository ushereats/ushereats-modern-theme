(function libraryStats() {
  var ID = "jf-stats";
  // Updates when the page loads, when you come back to the home page, or back to the tab.
  // No background timers.

  // last known numbers, so the line shows instantly on the next page load (then gets updated)
  var counts = null;
  var active = null;                  // null = unknown / not allowed
  try {
    var saved = JSON.parse(localStorage.getItem("tbStats") || "null");
    if (saved && saved.c) { counts = saved.c; active = saved.a == null ? null : saved.a; }
  } catch (e) {}
  var countsAt = 0;
  var stale = true;
  var busy = false;

  // Only the main Home screen: not Favourites or other home tabs, not any other page.
  // Jellyfin changes pages without always firing hashchange, so the page itself is checked too.
  function isHome() {
    var h = location.hash, m;
    if (!(h === "" || h === "#")) {
      m = /^#\/(?:home)?(?:\.html)?(?:\?([^#]*))?$/.exec(h);
      if (!m) return false;
      var q = m[1] || "";
      if (/(^|&)seerrfinTab=/.test(q) || /(^|&)tab=(?!0(&|$))/.test(q)) return false;
    }
    var page = document.getElementById("indexPage");
    return !!(page && !page.classList.contains("hide"));
  }

  function isPlaying() {
    return /^#\/?video/i.test(location.hash) ||
      !!document.querySelector(".videoPlayerContainer:not(.hide)");
  }

  function shouldShow() {
    // Phones/narrow windows: the line would run under the header buttons, so hide it
    var wide = (window.innerWidth || document.documentElement.clientWidth) >= 900;
    return wide && isHome() && !isPlaying() && document.visibilityState === "visible";
  }

  function getEl() {
    var el = document.getElementById(ID);
    if (!el) {
      el = document.createElement("div");
      el.id = ID;
      document.body.appendChild(el);
    }
    return el;
  }

  function render() {
    var show = shouldShow() && counts;
    var el = document.getElementById(ID);
    if (!show) { if (el) el.style.display = "none"; return; }
    el = getEl();
    var parts = [
      counts.MovieCount + " Movies",
      counts.SeriesCount + " Shows",
      counts.EpisodeCount + " Episodes"
    ];
    if (active !== null) parts.push(active + " Active");
    var text = parts.join(" · ");
    if (el.textContent !== text) el.textContent = text;
    el.style.display = "";
  }

  function refresh() {
    if (busy || !window.ApiClient) return;
    busy = true;
    Promise.resolve(ApiClient.getItemCounts(ApiClient.getCurrentUserId()))
      .then(function (c) { counts = c; })
      .catch(function () {})
      // only sessions active in the last 16 min: a few KB instead of every device ever seen.
      // May be refused for non-admin users; then "Active" is just left off
      .then(function () { return tbShared.sessions({ ActiveWithinSeconds: 960 }); })
      .then(function (sessions) {
        active = (sessions || []).filter(function (s) { return s.NowPlayingItem; }).length;
      })
      .catch(function () { active = null; })
      .then(function () {
        busy = false;
        if (counts) { try { localStorage.setItem("tbStats", JSON.stringify({ c: { MovieCount: counts.MovieCount, SeriesCount: counts.SeriesCount, EpisodeCount: counts.EpisodeCount }, a: active })); } catch (e) {} }
        render();
      });
  }

  var wasHome = false;
  function update() {
    var home = isHome();
    if (home && !wasHome) stale = true;   // came back to Home (by any route)
    wasHome = home;
    render();
    if (stale && shouldShow()) { stale = false; refresh(); }
  }
  function markStale() { if (isHome() && document.visibilityState === "visible") stale = true; }

  var poll = setInterval(function () {
    if (window.ApiClient) { clearInterval(poll); update(); }
  }, 500);

  window.addEventListener("hashchange", function () { markStale(); update(); });
  window.addEventListener("resize", update);
  document.addEventListener("visibilitychange", function () { markStale(); update(); });

  // Page changes / player overlay: re-check whenever the page changes (shared page watcher)
  var queued = false;
  function soon() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; update(); });
  }
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
  tbWatch(soon);
  window.addEventListener("popstate", soon);
})();

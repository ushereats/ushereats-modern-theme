(function libraryStats() {
  var ID = "jf-stats";
  // Updates when the page loads, when you come back to the home page, or back to the tab.
  // No background timers.

  var counts = null;
  var active = null;                  // null = unknown / not allowed
  var countsAt = 0;
  var stale = true;
  var busy = false;

  function isHome() {
    var h = location.hash;
    return h === "" || h === "#" || /^#\/?(home)(\.html)?([?#]|$)/i.test(h);
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
      el.style.cssText = "position:fixed;top:33px;left:145px;color:rgba(255,255,255,0.4);font-size:0.72rem;z-index:9999;pointer-events:none;white-space:nowrap;";
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
      .then(function () { busy = false; render(); });
  }

  function update() {
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

  // Player overlay can appear without a hash change; check once per frame at most
  var queued = false;
  new MutationObserver(function () {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; update(); }); }, 250);   // batched: at most every 250ms
  }).observe(document.body, { childList: true });
})();

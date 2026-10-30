(function libraryStats() {
  var ID = "jf-stats";
  var COUNTS_EVERY = 5 * 60 * 1000;   // library counts: every 5 min
  var ACTIVE_EVERY = 15 * 1000;       // active streams: every 15 s

  var counts = null;
  var active = null;                  // null = unknown / not allowed
  var countsAt = 0;
  var timer = 0;
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
    if (busy || !window.ApiClient || !shouldShow()) return;
    busy = true;
    var needCounts = !counts || Date.now() - countsAt > COUNTS_EVERY;
    var countsStep = needCounts
      ? Promise.resolve(ApiClient.getItemCounts(ApiClient.getCurrentUserId()))
          .then(function (c) { counts = c; countsAt = Date.now(); })
          .catch(function () {})
      : Promise.resolve();
    countsStep
      // May be refused for non-admin users; then "Active" is just left off
      .then(function () { return ApiClient.getSessions(); })
      .then(function (sessions) {
        active = (sessions || []).filter(function (s) { return s.NowPlayingItem; }).length;
      })
      .catch(function () { active = null; })
      .then(function () { busy = false; render(); });
  }

  // Poll only while the home page is visible; stop everywhere else
  function update() {
    render();
    if (shouldShow()) {
      if (!timer) {
        refresh();
        timer = setInterval(refresh, ACTIVE_EVERY);
      }
    } else if (timer) {
      clearInterval(timer);
      timer = 0;
    }
  }

  var poll = setInterval(function () {
    if (window.ApiClient) { clearInterval(poll); update(); }
  }, 500);

  window.addEventListener("hashchange", update);
  window.addEventListener("resize", update);
  document.addEventListener("visibilitychange", update);

  // Player overlay can appear without a hash change; check once per frame at most
  var queued = false;
  new MutationObserver(function () {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; update(); }); }, 250);   // batched: at most every 250ms
  }).observe(document.body, { childList: true });
})();

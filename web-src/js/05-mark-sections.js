(function markSections() {
  // Shared page watcher: ONE observer for all custom scripts instead of one each.
  // While a video is playing full screen (or the tab is hidden) it only checks every 1.5s.
  var tbWatch = window.tbWatch;   // shared page watcher (in every theme file)
  function mark() { watchScrollers(); }

  // Arrow positions only change when a row's size changes -> measure then, not on every DOM change
  var ro = typeof window.ResizeObserver === "function"
    ? new ResizeObserver(function () { requestAnimationFrame(placeScrollButtons); }) : null;
  function watchScrollers() {
    var fresh = false;
    document.querySelectorAll(".verticalSection > .emby-scroller").forEach(function (sc) {
      if (sc.__tbRo) return;
      sc.__tbRo = true; fresh = true;
      if (ro) ro.observe(sc);
    });
    if (fresh) requestAnimationFrame(placeScrollButtons);
  }

  // Line the side arrows up with the poster row (below the title)
  function placeScrollButtons() {
    // 1) measure every row first (one layout pass) ...
    var list = document.querySelectorAll(".verticalSection > .emby-scrollbuttons");
    var jobs = [];
    for (var i = 0; i < list.length; i++) {
      var sb0 = list[i];
      var sc0 = sb0.parentElement.querySelector(":scope > .emby-scroller");
      if (!sc0 || !sc0.offsetHeight) continue;
      jobs.push([sb0, sc0, sc0.offsetTop + "px", sc0.offsetHeight + "px", sc0.offsetLeft + "px", sc0.offsetWidth + "px",
        Math.max(parseFloat(getComputedStyle(sc0).paddingLeft) || 0, 40) + "px"]);
    }
    // 2) ... then write (no read/write ping-pong = no forced re-layouts)
    jobs.forEach(function (j) {
      var sb = j[0], sc = j[1], top = j[2], h = j[3], left = j[4], w = j[5], g = j[6];
      if (sb.style.top !== top) sb.style.setProperty("top", top, "important");
      if (sb.style.height !== h) {
        sb.style.setProperty("height", h, "important");
        sb.style.setProperty("bottom", "auto", "important");
      }
      if (sb.style.left !== left) sb.style.setProperty("left", left, "important");
      if (sb.style.width !== w) {
        sb.style.setProperty("width", w, "important");
        sb.style.setProperty("right", "auto", "important");
      }
      if (sb.style.getPropertyValue("--row-g") !== g) {
        sb.style.setProperty("--row-g", g);
        sc.style.setProperty("--row-g", g);
      }
    });
  }
  window.addEventListener("resize", function () { requestAnimationFrame(placeScrollButtons); });

  // Disable hover effects while the page is scrolling (wheel, middle-click, keys)
  var scrollTimer = 0;
  var root = document.documentElement;
  window.addEventListener("scroll", function () {
    if (!scrollTimer) root.classList.add("is-scrolling");
    var down = (window.scrollY || document.documentElement.scrollTop || 0) > 20;
    if (down !== root.classList.contains("tb-scrolled")) root.classList.toggle("tb-scrolled", down);
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      scrollTimer = 0;
      root.classList.remove("is-scrolling");
    }, 120);
  }, { passive: true, capture: true });

  var queued = false;
  function scheduleMark() {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; mark(); }); }, 40);
  }

  tbWatch(scheduleMark);
  mark();
})();

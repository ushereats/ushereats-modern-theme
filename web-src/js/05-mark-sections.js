(function markSections() {
  // Shared page watcher: ONE observer for all custom scripts instead of one each.
  // While a video is playing full screen (or the tab is hidden) it only checks every 1.5s.
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
  var SHOW_TITLES = ["continue watching & next up", "continue watching", "next up"];
  var NO_POP = ["continue watching & next up", "continue watching", "next up", "trending this week", "latest releases"];

  function mark() {
    document.querySelectorAll(".sectionTitleContainer").forEach(function (header) {
      var btn = header.querySelector(".sectionTitleTextButton, .sectionTitle");
      if (!btn) return;
      var section = header.parentElement;
      if (!section) return;
      var text = btn.textContent.replace(/\s+/g, " ").trim().toLowerCase();
      // already handled this row with this title: only new cards need their "S1 · E1" line
      if (section.__tbMarked === text) {
        if (section.classList.contains("show-card-titles")) formatEpisodeMeta(section);
        return;
      }
      section.__tbMarked = text;
      var matches = function (list) {
        return list.some(function (t) { return text.indexOf(t) === 0; });
      };
      if (matches(SHOW_TITLES)) {
        section.classList.add("show-card-titles");
        formatEpisodeMeta(section);
      }
      if (matches(NO_POP)) section.classList.add("no-hover-pop");
    });
    watchScrollers();
  }

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

  // "S1:E1  Episode" -> "S1 · E1"   (movies -> year)
  // Re-checked whenever the card's own text changes; never leaves an empty line behind.
  function formatEpisodeMeta(section) {
    section.querySelectorAll(".sleekfin-meta").forEach(function (meta) {
      var own = meta.querySelector(".tb-ep");
      var src = "";
      meta.childNodes.forEach(function (n) {
        if (n !== own) src += " " + n.textContent;
      });
      var shown = own ? own.textContent : "";
      if (meta.__tbSrc === src && meta.__tbLabel === shown && (shown || !own)) return;   // nothing changed
      meta.__tbSrc = src;

      var label = "";
      var m = src.match(/S(\d+)\s*:\s*E(\d+)/i);
      if (m) {
        label = "S" + m[1] + " \u00b7 E" + m[2];        // episode
      } else {
        var y = src.match(/\b(19|20)\d{2}\b/);
        label = y ? y[0] : "";                            // movie -> year
      }
      meta.__tbLabel = label;

      if (!label) {
        // nothing to show yet (SleekFin still loading the text): keep SleekFin's own line visible
        if (own) own.parentNode.removeChild(own);
        meta.classList.remove("tb-ep-meta");
        meta.__tbLabel = "";
        meta.setAttribute("data-tb-done", "");
        return;
      }
      if (!own) {
        own = document.createElement("span");
        own.className = "tb-ep";
        meta.appendChild(own);
      }
      own.textContent = label;
      meta.classList.add("tb-ep-meta");
      meta.setAttribute("data-tb-done", "");
    });
  }

  // Safety net: SleekFin can change a card's text in place (no new elements), which the
  // page watcher doesn't see. Re-check just the Continue Watching row every 2s on screen.
  setInterval(function () {
    if (document.hidden || (window.tbBusy && window.tbBusy())) return;
    document.querySelectorAll(".show-card-titles").forEach(formatEpisodeMeta);
  }, 2000);

  var queued = false;
  function scheduleMark() {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; mark(); }); }, 40);
  }

  tbWatch(scheduleMark);
  mark();
})();

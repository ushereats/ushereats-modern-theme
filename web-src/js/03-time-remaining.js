(function () {
  // Shared page watcher: ONE observer for all custom scripts instead of one each.
  // While a video is playing full screen (or the tab is hidden) it only checks every 1.5s.
  var BADGE_CLASS = "time-remaining-badge";

  function formatTime(ticks) {
    var totalMin = Math.round(ticks / 600000000);
    if (totalMin < 1) return null;
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h > 0) return h + "h " + m + "m left";
    return m + "m left";
  }

  function getItemId(card) {
    var id = card.getAttribute("data-id");
    if (id) return id;
    var a = card.querySelector("a[href]");
    if (a) {
      var match = a.href.match(/id=([a-f0-9]+)/i);
      if (match) return match[1];
    }
    var btn = card.querySelector("[data-id]");
    if (btn) return btn.getAttribute("data-id");
    return null;
  }

  function isContinueWatchingSection(section) {
    var header = section.querySelector(".sectionTitleContainer");
    if (!header) return false;
    var btn = header.querySelector(".sectionTitleTextButton, .sectionTitle");
    if (!btn) return false;
    var text = btn.textContent.trim();
    return (
      text === "Continue Watching" ||
      text === "Continue Watching & Next Up" ||
      text === "Next Up"
    );
  }

  // Re-carve whenever a card (or its badge) changes size: window resize,
  // zoom, breakpoints, image finishing layout, etc.
  var observed = new Set();
  // Older TV browsers lack ResizeObserver -> fall back to re-carving on window resize
  var ro = window.ResizeObserver ? new ResizeObserver(function (entries) {
    entries.forEach(function (entry) {
      var sc = entry.target.classList.contains("cardScalable")
        ? entry.target
        : entry.target.parentElement && entry.target.parentElement.querySelector(".cardScalable");
      if (!sc) return;
      var badge = sc.parentElement && sc.parentElement.querySelector("." + BADGE_CLASS);
      if (badge) carve(sc, badge);
    });
  }) : null;
  if (!ro) {
    window.addEventListener("resize", function () {
      document.querySelectorAll("." + BADGE_CLASS).forEach(function (b) {
        var sc = b.parentElement && b.parentElement.querySelector(".cardScalable");
        if (sc) carve(sc, b);
      });
    });
  }

  function watch(el) {
    if (!ro || observed.has(el)) return;
    observed.add(el);
    ro.observe(el);
  }

  // Drop observers for cards Jellyfin has removed from the page
  function pruneObserved() {
    observed.forEach(function (el) {
      if (!el.isConnected) { if (ro) ro.unobserve(el); observed.delete(el); }
    });
  }

  function addBadge(card, text) {
    var box = card.querySelector(".cardBox") || card;
    var scalable = box.querySelector(".cardScalable");
    if (!scalable) return;

    // Reuse the badge if it exists, otherwise create it (top-left of cardBox)
    var badge = box.querySelector("." + BADGE_CLASS);
    if (!badge) {
      badge = document.createElement("div");
      badge.className = BADGE_CLASS;
      box.style.position = "relative";
      box.appendChild(badge);
    }
    badge.textContent = text;

    watch(scalable);
    watch(badge);
    carve(scalable, badge);
  }

  // Notches for every badged poster are cut together: all the sizes are read first, then all the cuts are
  // written, once a frame. (Each poster reading its size and then writing its cut made the browser redo the
  // page's layout once per poster.) Shared by the time-left and release-date badges.
  window.tbNotch = window.tbNotch || (function () {
    var q = new Map(), raf = 0;
    function path(sc, b) {
      var bw = b.offsetWidth, bh = b.offsetHeight, sw = sc.offsetWidth, sh = sc.offsetHeight;
      if (!sw || !sh || !bw || !bh) return null;   // not laid out yet: the size watcher calls again
      var cr = parseFloat(getComputedStyle(sc).borderTopRightRadius) || 6, r = 10, r2 = 6;
      return "M " + (bw + r2) + " 0 L " + (sw - cr) + " 0 Q " + sw + " 0 " + sw + " " + cr +
        " L " + sw + " " + (sh - cr) + " Q " + sw + " " + sh + " " + (sw - cr) + " " + sh +
        " L " + cr + " " + sh + " Q 0 " + sh + " 0 " + (sh - cr) + " L 0 " + (bh + r2) +
        " Q 0 " + bh + " " + r2 + " " + bh + " L " + (bw - r) + " " + bh +
        " Q " + bw + " " + bh + " " + bw + " " + (bh - r) + " L " + bw + " " + r2 +
        " Q " + bw + " 0 " + (bw + r2) + " 0 Z";
    }
    function flush() {
      raf = 0;
      var jobs = [];
      q.forEach(function (b, sc) { if (sc.isConnected && b.isConnected) jobs.push([sc, path(sc, b)]); });
      q.clear();
      for (var i = 0; i < jobs.length; i++) {
        if (!jobs[i][1]) continue;
        var c = "path('" + jobs[i][1] + "')";
        if (jobs[i][0].style.clipPath !== c) jobs[i][0].style.clipPath = c;
      }
    }
    return function (sc, b) { q.set(sc, b); if (!raf) raf = requestAnimationFrame(flush); };
  })();
  function carve(scalable, badge) { window.tbNotch(scalable, badge); return true; }

  // itemId -> badge text ("" = no badge). Filled by one batched request.
  var cache = new Map();
  var pending = new Set();

  function applyBadges(cards) {
    cards.forEach(function (card) {
      var id = getItemId(card);
      if (!id || !cache.has(id)) return;
      var text = cache.get(id);
      var box = card.querySelector(".cardBox") || card;
      var existing = box.querySelector("." + BADGE_CLASS);
      if (!text) return;
      if (existing && existing.textContent === text) return;
      addBadge(card, text);
    });
  }

  function fetchBatch(ids, cards) {
    ids.forEach(function (id) { pending.add(id); });
    window.tbItems(ids, "UserData").then(function (res) {
      var items = (res && res.Items) || [];
      var seen = new Set();
      items.forEach(function (item) {
        seen.add(item.Id);
        var runtime = item.RunTimeTicks;
        var pos = item.UserData && item.UserData.PlaybackPositionTicks;
        var rem = runtime && pos ? runtime - pos : 0;
        cache.set(item.Id, rem > 0 ? (formatTime(rem) || "") : "");
      });
      ids.forEach(function (id) { if (!seen.has(id)) cache.set(id, ""); });
    }).catch(function () {}).then(function () {
      ids.forEach(function (id) { pending.delete(id); });
      applyBadges(cards);
    });
  }

  function scan(only) {
    if (!window.ApiClient) return;
    pruneObserved();
    var sections = only || document.querySelectorAll(".section, .verticalSection");
    sections.forEach(function (section) {
      if (!isContinueWatchingSection(section)) return;
      var cards = Array.prototype.slice.call(section.querySelectorAll(".card"));
      if (!cards.length) return;
      var missing = [];
      cards.forEach(function (card) {
        var id = getItemId(card);
        // our own cards carry runtime + position: no lookup needed
        var run = +card.getAttribute("data-runtimeticks"), pos = +card.getAttribute("data-positionticks");
        if (id && run && pos && !cache.has(id)) cache.set(id, run > pos ? (formatTime(run - pos) || "") : "");
        if (id && !cache.has(id) && !pending.has(id) && missing.indexOf(id) < 0) missing.push(id);
      });
      applyBadges(cards);
      if (missing.length) fetchBatch(missing, cards);
    });
  }

  // Batched: DOM changes arrive in bursts while rows load
  var queued = false;
  function scheduleScan() {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; scan(); }); }, 120);   // batched: at most every 120ms
  }

  var style = document.createElement("style");
  style.textContent = [
    "." + BADGE_CLASS + " {",
    "  position: absolute;",
    "  top: 0;",
    "  left: 0;",
    "  z-index: 5;",
    "  color: rgba(255, 255, 255, 0.7);",
    "  font-family: Inter, 'Noto Sans', sans-serif;",
    "  font-size: 11px;",
    "  font-weight: 600;",
    "  padding: 4px 8px;",
    "  pointer-events: none;",
    "  white-space: nowrap;",
    "}"
  ].join("\n");
  tbCss(style);

  var poll = setInterval(function () {
    if (window.ApiClient) {
      clearInterval(poll);
      scan();
    }
  }, 500);

  // only the rows that just appeared or changed
  tbAdded(function (roots) {
    if (!window.ApiClient) return;
    var secs = tbUp(roots, ".section, .verticalSection");
    if (secs.length) scan(secs);
  });

  // also run right as our own rows/search draw their cards (so badges are there on the first frame)
  (window.tbCardDecorators = window.tbCardDecorators || []).push(function () { scan(); });

  // Progress changes after watching — refetch when returning home
  window.addEventListener("hashchange", function () {
    cache.clear();
    scheduleScan();
  });
})();

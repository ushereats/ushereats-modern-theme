(function () {
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
    requestAnimationFrame(function () { carve(scalable, badge); });
  }

  // Clip cardScalable to carve the notch around the badge
  function carve(scalable, badge) {
      var bw = badge.offsetWidth;
      var bh = badge.offsetHeight;
      var sw = scalable.offsetWidth;
      var sh = scalable.offsetHeight;
      // Not laid out yet: ResizeObserver will call again once it has a size
      if (!sw || !sh || !bw || !bh) return;

      var cr = parseFloat(getComputedStyle(scalable).borderTopRightRadius) || 6;
      var r = 10;  // concave curve radius at inside corner
      var r2 = 6;  // small concave curves at edge intersections

      // Single L-shaped path: full card minus top-left notch
      // with concave curves at notch-card transitions
      var d =
        // Start on top edge, right of notch
        "M " + (bw + r2) + " 0" +
        // Top edge to near top-right corner
        " L " + (sw - cr) + " 0" +
        // Top-right rounded corner
        " Q " + sw + " 0 " + sw + " " + cr +
        // Right edge
        " L " + sw + " " + (sh - cr) +
        // Bottom-right rounded corner
        " Q " + sw + " " + sh + " " + (sw - cr) + " " + sh +
        // Bottom edge
        " L " + cr + " " + sh +
        // Bottom-left rounded corner
        " Q 0 " + sh + " 0 " + (sh - cr) +
        // Left edge up to near notch bottom
        " L 0 " + (bh + r2) +
        // Small concave curve: left edge → notch bottom
        " Q 0 " + bh + " " + r2 + " " + bh +
        // Notch bottom edge to near inside corner
        " L " + (bw - r) + " " + bh +
        // Main concave curve at inside corner
        " Q " + bw + " " + bh + " " + bw + " " + (bh - r) +
        // Notch right edge up to near top
        " L " + bw + " " + r2 +
        // Small concave curve: notch right edge → top edge
        " Q " + bw + " 0 " + (bw + r2) + " 0" +
        " Z";

      var clip = "path('" + d + "')";
      if (scalable.style.clipPath !== clip) scalable.style.clipPath = clip;
  }

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
    Promise.resolve(ApiClient.getItems(ApiClient.getCurrentUserId(), {
      Ids: ids.join(","),
      Fields: "UserData",
      EnableImages: false
    })).then(function (res) {
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

  function scan() {
    if (!window.ApiClient) return;
    pruneObserved();
    var sections = document.querySelectorAll(".section, .verticalSection");
    sections.forEach(function (section) {
      if (!isContinueWatchingSection(section)) return;
      var cards = Array.prototype.slice.call(section.querySelectorAll(".card"));
      if (!cards.length) return;
      var missing = [];
      cards.forEach(function (card) {
        var id = getItemId(card);
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
  document.head.appendChild(style);

  var poll = setInterval(function () {
    if (window.ApiClient) {
      clearInterval(poll);
      scan();
    }
  }, 500);

  tbWatch(scheduleScan);

  // Progress changes after watching — refetch when returning home
  window.addEventListener("hashchange", function () {
    cache.clear();
    scheduleScan();
  });
})();

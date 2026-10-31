(function qualityBadge() {
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
  // ── Settings ──
  var TYPES = ["Movie", "Episode", "Video", "MusicVideo"];   // have their own file
  var CONTAINERS = ["Series", "Season"];                    // use their newest episode
  var CONTAINER_TTL = 24 * 60 * 60 * 1000;                  // remember show quality for a day
  var CONTAINER_PARALLEL = 4;
  var BADGE_CLASS = "tb-quality";
  var SKIP_IF = ".time-remaining-badge, .release-date-badge";  // carved-corner cards

  var cache = new Map();   // itemId -> info | null
  var pending = new Set();

  var DOLBY_MARK =
    '<svg class="tb-q-dmark" viewBox="0 0 24 14" aria-hidden="true">' +
    '<path d="M0 0h5.5a4.5 7 0 0 1 0 14H0z"/>' +
    '<path d="M24 0h-5.5a4.5 7 0 0 0 0 14H24z"/>' +
    '</svg>';

  // HDR10+ wordmark (square letters, "+" on the 0)
  var HDR10P_MARK =
    '<svg class="tb-q-hdr10p" viewBox="0 0 51 14" aria-label="HDR10+">' +
    '<g fill="none" stroke="#fff" stroke-width="2.3" stroke-linejoin="round">' +
    '<path d="M1.2 1v12M7.6 1v12M1.2 7h6.4"/>' +
    '<path d="M11 1h4.6q3 0 3 3v6q0 3-3 3H11z"/>' +
    '<path d="M22.3 13V1h4.6q2.6 0 2.6 2.7v.9q0 2.7-2.6 2.7h-4.6M26.4 6.3l3.4 6.7"/>' +
    '<path d="M33.2 1v12"/>' +
    '<path d="M42.4 1h-3.4q-2.2 0-2.2 2.2v7.6q0 2.2 2.2 2.2h3.4q2.2 0 2.2-2.2V7.6"/>' +
    '<path d="M44.8 4.4h5.4M47.5 1.7v5.4"/>' +
    '</g></svg>';

  function getItemId(card) {
    var id = card.getAttribute("data-id");
    if (id) return id;
    var el = card.querySelector("[data-id]");
    return el ? el.getAttribute("data-id") : null;
  }

  // Only tall poster cards (skips wide thumbnails, episode stills, square music art)
  var POSTER_CLASSES = ["portraitCard", "overflowPortraitCard"];

  function isPoster(card) {
    for (var i = 0; i < POSTER_CLASSES.length; i++) {
      if (card.classList.contains(POSTER_CLASSES[i])) return true;
    }
    return false;
  }

  function wantedCard(card) {
    if (!isPoster(card)) return false;
    var t = card.getAttribute("data-type");
    return !t || TYPES.indexOf(t) >= 0 || CONTAINERS.indexOf(t) >= 0;
  }

  // ── Show / season quality: newest episode, cached per device for a day ──
  var containerQueue = [];
  var containerActive = 0;

  function lsGet(id) {
    try {
      var v = JSON.parse(localStorage.getItem("tbq:" + id) || "null");
      if (v && Date.now() - v.t < CONTAINER_TTL) return v.i;
    } catch (e) {}
    return undefined;
  }
  function lsSet(id, info) {
    try { localStorage.setItem("tbq:" + id, JSON.stringify({ t: Date.now(), i: info })); } catch (e) {}
  }

  function queueContainer(id) {
    var stored = lsGet(id);
    if (stored !== undefined) { cache.set(id, stored); return; }
    pending.add(id);
    containerQueue.push(id);
    pumpContainers();
  }

  function pumpContainers() {
    while (containerActive < CONTAINER_PARALLEL && containerQueue.length) {
      (function (id) {
        containerActive++;
        ApiClient.getItems(ApiClient.getCurrentUserId(), {
          ParentId: id,
          Recursive: true,
          IncludeItemTypes: "Episode",
          SortBy: "DateCreated",
          SortOrder: "Descending",
          Limit: 1,
          Fields: "MediaStreams",
          EnableImages: false,
          EnableUserData: false
        }).then(function (res) {
          var ep = res && res.Items && res.Items[0];
          var info = ep ? parseItem(ep) : null;
          cache.set(id, info);
          lsSet(id, info);
        }).catch(function () {
          cache.set(id, null);
        }).then(function () {
          pending.delete(id);
          containerActive--;
          scheduleScan();
          pumpContainers();
        });
      })(containerQueue.shift());
    }
  }

  function resolution(w, h) {
    if (w >= 3200 || h >= 2000) return "4K";
    if (w >= 2200 || h >= 1300) return "1440p";
    if (w >= 1800 || h >= 1000) return "1080p";
    if (w >= 1200 || h >= 700) return "720p";
    if (w || h) return "SD";
    return null;
  }

  function parseItem(item) {
    if (TYPES.indexOf(item.Type) < 0) return null;
    var streams = item.MediaStreams ||
      (item.MediaSources && item.MediaSources[0] && item.MediaSources[0].MediaStreams) || [];
    var video = null, atmos = false, dd = false;
    streams.forEach(function (s) {
      if (s.Type === "Video" && !video) video = s;
      if (s.Type === "Audio") {
        var desc = [s.Profile, s.DisplayTitle, s.Title, s.Codec].join(" ").toLowerCase();
        if (desc.indexOf("atmos") >= 0 || desc.indexOf("joc") >= 0) atmos = true;
        else if (/\b(e?ac-?3|dolby digital|dd\+?)\b/.test(desc)) dd = true;
      }
    });
    if (!video) return null;
    var rt = String(video.VideoRangeType || "").toUpperCase();
    var dv = rt.indexOf("DOVI") === 0;
    var hdr = dv ? null
      : rt === "HDR10PLUS" ? "HDR10+"
      : rt === "HLG" ? "HLG"
      : (rt.indexOf("HDR") === 0 || String(video.VideoRange || "").toUpperCase() === "HDR") ? "HDR"
      : null;
    return {
      res: resolution(video.Width || 0, video.Height || 0),
      dv: dv,
      audio: atmos ? "ATMOS" : (dd ? "DIGITAL" : null),
      hdr: hdr
    };
  }

  function buildHtml(info) {
    var html = "";
    // Dolby logo: shown when there's Dolby Vision and/or Dolby audio
    if (info.dv || info.audio) {
      var sub = [info.audio, info.dv ? "VISION" : null].filter(Boolean).join(" · ");
      html += '<span class="tb-q-dolby"><span class="tb-q-dtop">' + DOLBY_MARK +
        '<span class="tb-q-dword">Dolby</span></span>' +
        '<span class="tb-q-dsub">' + sub + '</span></span>';
    }
    if (info.hdr === "HDR10+") html += HDR10P_MARK;
    else if (info.hdr) html += '<span class="tb-q-hdr">' + info.hdr + '</span>';
    if (info.res) html += '<span class="tb-q-res">' + info.res + '</span>';
    return html;
  }

  function hasRankTag(scalable, badge) {
    // Another plugin's "#17 Today" tag sits top-left -> push ours right
    var t = scalable.textContent || "";
    if (badge) t = t.replace(badge.textContent, "");
    return /#\d+\s*Today/i.test(t);
  }

  function applyBadge(card) {
    var id = getItemId(card);
    if (!id || !cache.has(id)) return;
    var info = cache.get(id);
    var box = card.querySelector(".cardBox") || card;
    var scalable = box.querySelector(".cardScalable");
    if (!scalable) return;
    var badge = scalable.querySelector("." + BADGE_CLASS);

    var html = info && !box.querySelector(SKIP_IF) ? buildHtml(info) : "";
    if (!html) { if (badge) badge.remove(); return; }

    if (!badge) {
      badge = document.createElement("div");
      badge.className = BADGE_CLASS;
      scalable.appendChild(badge);
    }
    if (badge.dataset.html !== html) {
      badge.innerHTML = html;
      badge.dataset.html = html;
    }
    badge.classList.toggle("tb-q-right", hasRankTag(scalable, badge));
  }

  function fetchBatch(ids, cards) {
    ids.forEach(function (id) { pending.add(id); });
    Promise.resolve(ApiClient.getItems(ApiClient.getCurrentUserId(), {
      Ids: ids.join(","),
      Fields: "MediaStreams",
      EnableImages: false,
      EnableUserData: false
    })).then(function (res) {
      var seen = new Set();
      ((res && res.Items) || []).forEach(function (item) {
        seen.add(item.Id);
        if (CONTAINERS.indexOf(item.Type) >= 0) {
          pending.delete(item.Id);
          queueContainer(item.Id);   // card had no data-type; it's a show/season
        } else {
          var info = parseItem(item);
          cache.set(item.Id, info);
          lsSet(item.Id, info);   // remembered for a day, so the badge is there on the next visit
        }
      });
      ids.forEach(function (id) { if (!seen.has(id)) cache.set(id, null); });
    }).catch(function () {}).then(function () {
      ids.forEach(function (id) { if (cache.has(id)) pending.delete(id); });
      cards.forEach(applyBadge);
    });
  }

  function scan() {
    if (!window.ApiClient) return;
    var cards = Array.prototype.slice.call(document.querySelectorAll(".card"))
      .filter(function (c) { return wantedCard(c); });   // no layout reads here (they force a reflow)
    var missing = [];
    cards.forEach(function (card) {
      var id = getItemId(card);
      if (!id) return;
      if (cache.has(id)) {
        // skip cards already done (re-check only if a carved badge or a rank tag appeared since)
        var k = id + "|" + !!card.querySelector(SKIP_IF) + "|" + (card.textContent.indexOf("Today") >= 0);
        if (card.__tbq !== k) { card.__tbq = k; applyBadge(card); }
        return;
      }
      if (pending.has(id)) return;
      var stored = lsGet(id);
      if (stored !== undefined) { cache.set(id, stored); card.__tbq = id + "|" + !!card.querySelector(SKIP_IF) + "|" + (card.textContent.indexOf("Today") >= 0); applyBadge(card); return; }
      if (CONTAINERS.indexOf(card.getAttribute("data-type")) >= 0) {
        queueContainer(id);
        if (cache.has(id)) applyBadge(card);
      } else if (missing.indexOf(id) < 0) {
        missing.push(id);
      }
    });
    for (var i = 0; i < missing.length; i += 50) fetchBatch(missing.slice(i, i + 50), cards);
  }

  var queued = false;
  function scheduleScan() {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; scan(); }); }, 150);   // batched: at most every 150ms
  }

  var style = document.createElement("style");
  style.textContent = [
    "." + BADGE_CLASS + " {",
    "  position: absolute; z-index: 4;",
    "  top: 12px; left: 0; right: 0;",
    "  display: flex; align-items: center; justify-content: center; gap: 9px;",
    "  padding: 0 10px;",
    "  pointer-events: none;",
    "  font-family: var(--app-font, Inter, sans-serif);",
    "  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.45));",
    "}",
    "." + BADGE_CLASS + ".tb-q-right { justify-content: flex-end; }",

    /* Resolution chip */
    ".tb-q-res {",
    "  display: inline-flex; align-items: center; justify-content: center;",
    "  height: 17px; padding: 0 5px; min-width: 15px;",
    "  border-radius: 4px;",
    "  background: rgba(242, 242, 242, 0.94);",
    "  color: #141414;",
    "  font-size: 12px; font-weight: 800; line-height: 1;",
    "  letter-spacing: -0.02em;",
    "}",

    /* Dolby logo */
    ".tb-q-dolby { display: inline-flex; flex-direction: column; align-items: center; color: #fff; line-height: 1; }",
    ".tb-q-dtop { display: inline-flex; align-items: center; gap: 2px; }",
    ".tb-q-dmark { width: 13px; height: 7.5px; fill: #fff; }",
    ".tb-q-dword { font-size: 10.5px; font-weight: 500; letter-spacing: -0.01em; }",
    ".tb-q-dsub { margin-top: 2px; font-size: 5.5px; font-weight: 700; letter-spacing: 0.22em; opacity: 0.9; padding-left: 0.22em; }",

    /* HDR10+ / HDR / HLG wordmark */
    ".tb-q-hdr { color: #fff; font-size: 11px; font-weight: 800; letter-spacing: 0.02em; }",
    ".tb-q-hdr10p { width: 40px; height: 11px; display: block; }"
  ].join("\n");
  document.head.appendChild(style);

  var poll = setInterval(function () {
    if (window.ApiClient) { clearInterval(poll); scan(); }
  }, 500);

  tbWatch(scheduleScan);

  // also run right as our own rows/search draw their cards (so badges are there on the first frame)
  (window.tbCardDecorators = window.tbCardDecorators || []).push(scan);
  window.addEventListener("hashchange", scheduleScan);
})();

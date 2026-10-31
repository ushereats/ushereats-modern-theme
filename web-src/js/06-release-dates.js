(function releaseDateBadge() {
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
  // "Latest Releases" row: shows each film's DIGITAL release date (from TMDB) on the carved badge
  // and sorts the row newest digital release first.
  // Films with no digital date on TMDB (and shows) fall back to Jellyfin's premiere date.

  // ── Settings ──
  var TMDB_KEY = String(tbCfg("TmdbKey", "")).trim();   // TMDB "API Key" (32 characters) or "API Read Access Token" (long one)
  var COUNTRIES = String(tbCfg("TmdbCountries", "AU,US")).split(",").map(function (c) { return c.trim().toUpperCase(); }).filter(Boolean);           // which country's digital date to prefer, in order
  var SORT_ROW = true;                    // false = keep Jellyfin's order, only show the dates

  var BADGE_CLASS = "release-date-badge";
  var SECTION_TITLES = ["latest releases"];
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAY = 86400000;
  var HAS_KEY = !!TMDB_KEY && TMDB_KEY.indexOf("PASTE_") !== 0;
  if (!HAS_KEY) console.warn("[Release dates] No TMDB key set: showing premiere dates, row not re-sorted.");

  var cache = new Map();   // itemId -> { time: ms, digital: bool } | null   (null = no date at all)
  var pending = new Set();

  function getItemId(card) {
    var id = card.getAttribute("data-id");
    if (id) return id;
    var el = card.querySelector("[data-id]");
    if (el) return el.getAttribute("data-id");
    var a = card.querySelector("a[href]");
    var m = a && a.href.match(/id=([a-f0-9]+)/i);
    return m ? m[1] : null;
  }

  function isTargetSection(section) {
    var btn = section.querySelector(".sectionTitleContainer .sectionTitleTextButton, .sectionTitleContainer .sectionTitle");
    if (!btn) return false;
    var t = btn.textContent.replace(/\s+/g, " ").trim().toLowerCase();
    return SECTION_TITLES.some(function (s) { return t.indexOf(s) === 0; });
  }

  function toTime(iso) {
    if (!iso) return null;
    var t = Date.parse(iso);
    return isNaN(t) ? null : t;
  }

  // ── TMDB digital dates (cached on this device: 7 days, or 1 day while unknown/upcoming) ──
  function lsGet(k) {
    try {
      var v = JSON.parse(localStorage.getItem("tbdig:" + k) || "null");
      if (v && Date.now() - v.at < v.ttl) return v;
    } catch (e) {}
    return null;
  }
  function lsSet(k, iso) {
    var t = toTime(iso);
    var ttl = t && t <= Date.now() ? 7 * DAY : DAY;
    try { localStorage.setItem("tbdig:" + k, JSON.stringify({ at: Date.now(), ttl: ttl, d: iso || null })); } catch (e) {}
  }

  function pickDigital(results) {
    var best = function (list) {
      var dates = [];
      (list || []).forEach(function (r) {
        (r.release_dates || []).forEach(function (x) { if (x.type === 4 && x.release_date) dates.push(x.release_date); });
      });
      dates.sort();
      return dates[0] || null;
    };
    for (var i = 0; i < COUNTRIES.length; i++) {
      var c = COUNTRIES[i];
      var hit = best((results || []).filter(function (r) { return r.iso_3166_1 === c; }));
      if (hit) return hit;
    }
    return best(results);   // any country, earliest
  }

  var queue = [], active = 0, MAX = 4;
  var tmdbWaiting = new Map();   // tmdbId -> [callbacks]
  function tmdbDigital(tmdbId, cb) {
    var hit = lsGet(tmdbId);
    if (hit) { cb(hit.d); return; }
    if (tmdbWaiting.has(tmdbId)) { tmdbWaiting.get(tmdbId).push(cb); return; }
    tmdbWaiting.set(tmdbId, [cb]);
    queue.push(tmdbId);
    pump();
  }
  function pump() {
    while (active < MAX && queue.length) {
      (function (id) {
        active++;
        var bearer = TMDB_KEY.length > 40;
        var url = "https://api.themoviedb.org/3/movie/" + id + "/release_dates" + (bearer ? "" : "?api_key=" + encodeURIComponent(TMDB_KEY));
        var opts = bearer ? { headers: { Authorization: "Bearer " + TMDB_KEY, Accept: "application/json" } } : {};
        fetch(url, opts).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) {
            var d = j ? pickDigital(j.results) : null;
            if (j) lsSet(id, d);
            return d;
          })
          .catch(function () { return null; })
          .then(function (d) {
            active--;
            var cbs = tmdbWaiting.get(id) || [];
            tmdbWaiting.delete(id);
            cbs.forEach(function (cb) { cb(d); });
            pump();
          });
      })(queue.shift());
    }
  }

  // ── Badge (carved corner) ──
  function carve(scalable, badge) {
    var bw = badge.offsetWidth, bh = badge.offsetHeight;
    var sw = scalable.offsetWidth, sh = scalable.offsetHeight;
    if (!sw || !sh || !bw || !bh) return false;
    var cr = parseFloat(getComputedStyle(scalable).borderTopRightRadius) || 6;
    var r = 10, r2 = 6;
    var d =
      "M " + (bw + r2) + " 0" +
      " L " + (sw - cr) + " 0" +
      " Q " + sw + " 0 " + sw + " " + cr +
      " L " + sw + " " + (sh - cr) +
      " Q " + sw + " " + sh + " " + (sw - cr) + " " + sh +
      " L " + cr + " " + sh +
      " Q 0 " + sh + " 0 " + (sh - cr) +
      " L 0 " + (bh + r2) +
      " Q 0 " + bh + " " + r2 + " " + bh +
      " L " + (bw - r) + " " + bh +
      " Q " + bw + " " + bh + " " + bw + " " + (bh - r) +
      " L " + bw + " " + r2 +
      " Q " + bw + " 0 " + (bw + r2) + " 0" +
      " Z";
    scalable.style.clipPath = "path('" + d + "')";
    scalable.dataset.rdbSize = sw + "x" + sh;
    return true;
  }

  // Re-carve only when a card actually changes size (no layout reads on every page change)
  var ro = typeof window.ResizeObserver === "function" ? new ResizeObserver(function (entries) {
    entries.forEach(function (en) {
      var sc = en.target, box = sc.parentElement;
      var b = box && box.querySelector("." + BADGE_CLASS);
      if (b) carve(sc, b);
    });
  }) : null;
  var observed = new Set();
  function watchSize(sc) {
    if (!ro || observed.has(sc)) return;
    observed.add(sc);
    ro.observe(sc);
  }
  function pruneObserved() {
    observed.forEach(function (el) { if (!el.isConnected) { ro.unobserve(el); observed.delete(el); } });
  }

  function applyBadge(card) {
    var id = getItemId(card);
    if (!id || !cache.has(id)) return;
    var info = cache.get(id);
    if (!info) return;
    var box = card.querySelector(".cardBox") || card;
    var scalable = box.querySelector(".cardScalable");
    if (!scalable) return;

    var dt = new Date(info.time);
    var day = dt.getUTCDate(), mon = MONTHS[dt.getUTCMonth()];
    var key = day + " " + mon + (info.digital ? " d" : "");
    var badge = box.querySelector("." + BADGE_CLASS);
    watchSize(scalable);
    if (badge && badge.dataset.key === key) return;   // re-carving on resize is done by the ResizeObserver

    if (!badge) {
      badge = document.createElement("div");
      badge.className = BADGE_CLASS;
      box.style.position = "relative";
      box.appendChild(badge);
    }
    badge.dataset.key = key;
    badge.title = info.digital ? "Digital release" : "Premiere date";
    badge.innerHTML = "<b>" + day + "</b> <span>" + mon + "</span>";
    requestAnimationFrame(function () { carve(scalable, badge); });
  }

  // ── Sort the row: newest digital release first, upcoming at the end, unknown last ──
  function sortSection(section) {
    if (!SORT_ROW || !HAS_KEY) return;
    var cards = Array.prototype.slice.call(section.querySelectorAll(".card"));
    if (cards.length < 2) return;
    var parent = cards[0].parentElement;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].parentElement !== parent) return;      // unexpected layout: leave it alone
      var id = getItemId(cards[i]);
      if (!id || !cache.has(id)) return;                  // wait until every date is known
    }
    var now = Date.now();
    var rank = function (card) {
      var info = cache.get(getItemId(card));
      if (!info) return [2, 0];
      return info.time <= now ? [0, -info.time] : [1, info.time];
    };
    var sorted = cards.slice().sort(function (a, b) {
      var ra = rank(a), rb = rank(b);
      return ra[0] - rb[0] || ra[1] - rb[1];
    });
    var same = true;
    for (var j = 0; j < cards.length; j++) if (cards[j] !== sorted[j]) { same = false; break; }
    if (same) return;
    sorted.forEach(function (c) { parent.appendChild(c); });
  }

  function fetchBatch(ids, section) {
    ids.forEach(function (id) { pending.add(id); });
    Promise.resolve(ApiClient.getItems(ApiClient.getCurrentUserId(), {
      Ids: ids.join(","),
      Fields: "PremiereDate,ProviderIds",
      EnableImages: false,
      EnableUserData: false
    })).then(function (res) {
      var items = (res && res.Items) || [];
      var seen = new Set();
      var waits = items.map(function (item) {
        seen.add(item.Id);
        var premiere = toTime(item.PremiereDate);
        var tmdb = item.ProviderIds && (item.ProviderIds.Tmdb || item.ProviderIds.tmdb);
        if (!HAS_KEY || item.Type !== "Movie" || !tmdb) {
          cache.set(item.Id, premiere ? { time: premiere, digital: false } : null);
          return Promise.resolve();
        }
        return new Promise(function (resolve) {
          tmdbDigital(String(tmdb), function (iso) {
            var t = toTime(iso);
            cache.set(item.Id, t ? { time: t, digital: true } : (premiere ? { time: premiere, digital: false } : null));
            resolve();
          });
        });
      });
      ids.forEach(function (id) { if (!seen.has(id)) cache.set(id, null); });
      return Promise.all(waits);
    }).catch(function () {}).then(function () {
      ids.forEach(function (id) { pending.delete(id); if (!cache.has(id)) cache.set(id, null); });
      section.querySelectorAll(".card").forEach(applyBadge);
      sortSection(section);
    });
  }

  function scan(only) {
    if (!window.ApiClient) return;
    if (ro) pruneObserved();
    Array.prototype.forEach.call(only || document.querySelectorAll(".section, .verticalSection"), function (section) {
      if (!isTargetSection(section)) return;
      var cards = Array.prototype.slice.call(section.querySelectorAll(".card"));
      var missing = [];
      cards.forEach(function (card) {
        var id = getItemId(card);
        if (id && !cache.has(id) && !pending.has(id) && missing.indexOf(id) < 0) missing.push(id);
        else applyBadge(card);
      });
      if (missing.length) fetchBatch(missing, section);
      else sortSection(section);
    });
  }

  var queued = false;
  function scheduleScan() {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; scan(); }); }, 120);   // batched: at most every 120ms
  }

  var style = document.createElement("style");
  style.textContent = [
    "." + BADGE_CLASS + " {",
    "  position: absolute; top: 0; left: 0; z-index: 5;",
    "  padding: 4px 9px 5px 8px;",
    "  font-family: Inter, 'Noto Sans', sans-serif;",
    "  font-size: 11px; line-height: 1.2;",
    "  white-space: nowrap; pointer-events: none;",
    "  color: rgba(255,255,255,0.55);",
    "}",
    "." + BADGE_CLASS + " b { color: rgba(255,255,255,0.92); font-weight: 700; }",
    "." + BADGE_CLASS + " span { font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }"
  ].join("\n");
  tbCss(style);

  var poll = setInterval(function () {
    if (window.ApiClient) { clearInterval(poll); scan(); }
  }, 500);

  // only the rows that just appeared or changed
  tbAdded(function (roots) {
    if (!window.ApiClient) return;
    var secs = tbUp(roots, ".section, .verticalSection");
    if (secs.length) scan(secs);
  });

  // also run right as our own rows/search draw their cards (so badges are there on the first frame)
  (window.tbCardDecorators = window.tbCardDecorators || []).push(function () { scan(); });
  if (!ro) window.addEventListener("resize", function () {
    document.querySelectorAll("." + BADGE_CLASS).forEach(function (b) { b.dataset.key = ""; });
    scheduleScan();
  });
})();

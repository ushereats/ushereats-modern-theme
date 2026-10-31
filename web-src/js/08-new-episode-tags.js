(function newEpisodeTag() {
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
  // Windows are counted from the episode's air date (falls back to date added)
  var EPISODE_DAYS = 7;          // "New episode": aired within the last week
  var SEASON_DAYS = 28;          // "New season": season premiere (S2+ E1) aired within ~a month
  var REFRESH_MS = 10 * 60 * 1000;
  var TAG_CLASS = "tb-new-tag";

  var seriesTag = new Map();     // seriesId -> "New season" | "New episode"
  var episodeTag = new Map();    // episodeId -> "New season" | "New episode"
  var loadedAt = 0;
  var loading = null;
  // last answer, remembered on this device: tags are drawn straight away, then refreshed
  try {
    var saved = JSON.parse(localStorage.getItem("tbNewTags") || "null");
    if (saved && saved.s && saved.e) { seriesTag = new Map(saved.s); episodeTag = new Map(saved.e); loadedAt = saved.t || 0; }
  } catch (e) {}

  function getItemId(card) {
    var id = card.getAttribute("data-id");
    if (id) return id;
    var el = card.querySelector("[data-id]");
    return el ? el.getAttribute("data-id") : null;
  }

  function daysAgo(iso) {
    if (!iso) return Infinity;
    var t = Date.parse(iso);
    return isNaN(t) ? Infinity : (Date.now() - t) / 86400000;
  }

  function load() {
    if (loading) return loading;
    var userId, url;
    try {
        userId = ApiClient.getCurrentUserId();
        url = ApiClient.getUrl("Users/" + userId + "/Items/Latest", {
          IncludeItemTypes: "Episode",
          GroupItems: false,
          Limit: 300,
          Fields: "DateCreated,PremiereDate",
          EnableImages: false,
          EnableUserData: true
        });
    } catch (err) { return Promise.resolve(); }
    loading = Promise.resolve(ApiClient.getJSON(url)).then(function (eps) {
        var s = new Map(), e = new Map();
        var seasonSeries = new Set();   // series with a season premiere in the window
        var unwatchedNew = new Set();   // series with at least one unwatched new episode

        (eps || []).forEach(function (ep) {
          var age = daysAgo(ep.PremiereDate || ep.DateCreated);
          var played = !!(ep.UserData && ep.UserData.Played);
          var isPremiere = ep.IndexNumber === 1 && (ep.ParentIndexNumber || 0) > 1;

          if (isPremiere && age <= SEASON_DAYS) {
            if (ep.SeriesId) seasonSeries.add(ep.SeriesId);
            if (!played) e.set(ep.Id, "New season");
          } else if (age <= EPISODE_DAYS && !played) {
            e.set(ep.Id, "New episode");
          }
          if (!played && ep.SeriesId &&
              (age <= EPISODE_DAYS || (isPremiere && age <= SEASON_DAYS))) {
            unwatchedNew.add(ep.SeriesId);
          }
        });

        // Series label: season wins for the whole season window; gone once all new eps are watched
        unwatchedNew.forEach(function (sid) {
          s.set(sid, seasonSeries.has(sid) ? "New season" : "New episode");
        });
        seasonSeries.forEach(function (sid) {
          if (!s.has(sid)) {
            // Premiere watched but newer episodes in the season window still unwatched?
            (eps || []).some(function (ep) {
              if (ep.SeriesId !== sid || (ep.UserData && ep.UserData.Played)) return false;
              if (daysAgo(ep.PremiereDate || ep.DateCreated) > SEASON_DAYS) return false;
              s.set(sid, "New season");
              return true;
            });
          }
        });
        seriesTag = s;
        episodeTag = e;
        loadedAt = Date.now();
        try { localStorage.setItem("tbNewTags", JSON.stringify({ t: loadedAt, s: Array.from(s), e: Array.from(e) })); } catch (err) {}
    }).catch(function () {}).then(function () { loading = null; });
    return loading;
  }

  function labelFor(card) {
    var id = getItemId(card);
    if (!id) return null;
    var type = card.getAttribute("data-type");
    if (type === "Series") return seriesTag.get(id) || null;
    if (type === "Episode") return episodeTag.get(id) || null;
    if (!type) return seriesTag.get(id) || episodeTag.get(id) || null;
    return null;
  }

  function apply(only) {
    Array.prototype.forEach.call(only || document.querySelectorAll(".card"), function (card) {
      var label = labelFor(card);
      var key = (getItemId(card) || "") + "|" + (label || "");
      if (card.__tbNew === key && card.__tbNewAt === loadedAt) return;   // nothing changed for this card
      card.__tbNew = key; card.__tbNewAt = loadedAt;
      var scalable = card.querySelector(".cardScalable");
      if (!scalable) return;
      var tag = scalable.querySelector("." + TAG_CLASS);
      if (!label) { if (tag) tag.remove(); return; }
      if (tag && tag.textContent === label) return;
      if (!tag) {
        tag = document.createElement("div");
        tag.className = TAG_CLASS;
        scalable.appendChild(tag);
      }
      tag.textContent = label;
    });
  }

  function run() {
    if (!window.ApiClient) return;
    var step = (!loadedAt || Date.now() - loadedAt > REFRESH_MS) ? load() : Promise.resolve();
    Promise.resolve(step).then(apply);
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; run(); }); }, 150);   // batched: at most every 150ms
  }

  var style = document.createElement("style");
  style.textContent = [
    "." + TAG_CLASS + " {",
    "  position: absolute;",
    "  left: 50%; bottom: 0;",
    "  transform: translateX(-50%);",
    "  z-index: 4;",
    "  height: 20px;",
    "  padding: 0 8px;",
    "  display: inline-flex; align-items: center;",
    "  background: #E50914;",
    "  color: #fff;",
    "  font-family: var(--app-font, 'Funnel Sans', Inter, sans-serif);",
    "  font-size: 12px; font-weight: 700; line-height: 1;",
    "  letter-spacing: 0;",
    "  white-space: nowrap;",
    "  border-radius: 3px 3px 0 0;",
    "  pointer-events: none;",
    "}"
  ].join("\n");
  tbCss(style);

  var poll = setInterval(function () {
    if (window.ApiClient) { clearInterval(poll); run(); }
  }, 500);

  // only the cards that just appeared (the tag list itself is refreshed every 10 min)
  tbAdded(function (roots) {
    if (!window.ApiClient) return;
    var cards = tbIn(roots, ".card");
    if (!cards.length) return;
    if (!loadedAt || Date.now() - loadedAt > REFRESH_MS) run();
    else apply(cards);
  });

  // also run right as our own rows/search draw their cards (so badges are there on the first frame)
  (window.tbCardDecorators = window.tbCardDecorators || []).push(function () { apply(); });
  window.addEventListener("hashchange", schedule);
})();

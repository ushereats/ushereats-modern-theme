(function episodeList() {
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
  // Netflix-style episode list on show pages (restyles SleekFin's "list" view):
  // big Bebas episode number, wide still with a gold progress bar, title, 2-line synopsis, runtime.
  // Opens in list view by default; if you switch to grid it remembers that instead.

  // ── Settings ──
  var DEFAULT_VIEW = "list";      // "list" or "grid"
  var KEY = "tbEpisodeView";

  function pref() {
    try { return localStorage.getItem(KEY) || DEFAULT_VIEW; } catch (e) { return DEFAULT_VIEW; }
  }

  function viewButton(section, view) {
    var b = section.querySelector('.sleekfin-details-view-controls [data-view="' + view + '"]');
    if (b) return b;
    var all = section.querySelectorAll(".sleekfin-details-view-controls button");
    return all.length === 2 ? all[view === "grid" ? 0 : 1] : null;
  }

  function scan() {
    var sections = document.querySelectorAll(".sleekfin-details-episodes");
    for (var i = 0; i < sections.length; i++) {
      var sec = sections[i];
      var list = sec.querySelector(".sleekfin-details-episode-list");
      if (!list) continue;
      // open in the preferred view once per show page
      if (!sec.getAttribute("data-tb-view")) {
        sec.setAttribute("data-tb-view", "1");
        var want = pref();
        if (list.getAttribute("data-view") !== want) {
          var b = viewButton(sec, want);
          if (b) b.click();
        }
      }
      // "E3" -> "03" for the big number
      var nums = list.querySelectorAll(".sleekfin-details-episode-number");
      for (var j = 0; j < nums.length; j++) {
        var m = /(\d+)/.exec(nums[j].textContent || "");
        var v = m ? (m[1].length < 2 ? "0" + m[1] : m[1]) : "";
        if (nums[j].getAttribute("data-tb-num") !== v) nums[j].setAttribute("data-tb-num", v);
      }
    }
  }

  // remember the view you pick
  document.addEventListener("click", function (e) {
    if (!e.isTrusted) return;
    var b = e.target && e.target.closest && e.target.closest(".sleekfin-details-view-controls button");
    if (!b) return;
    var sec = b.closest(".sleekfin-details-episodes");
    var view = b.getAttribute("data-view");
    if (!view && sec) {
      var all = sec.querySelectorAll(".sleekfin-details-view-controls button");
      view = all[0] === b ? "grid" : "list";
    }
    try { localStorage.setItem(KEY, view); } catch (err) {}
    document.documentElement.classList.toggle("tb-ep-list", view === "list");
  }, true);

  // Open new episode sections in the preferred view straight away (inside the page watcher, i.e. before
  // the browser paints), so SleekFin's grid never shows first when you prefer the list.
  function quickView() {
    var fresh = document.querySelectorAll(".sleekfin-details-episodes:not([data-tb-view])");
    for (var i = 0; i < fresh.length; i++) {
      var sec = fresh[i], list = sec.querySelector(".sleekfin-details-episode-list");
      if (!list) continue;
      var want = pref(), b = list.getAttribute("data-view") !== want ? viewButton(sec, want) : null;
      if (list.getAttribute("data-view") !== want && !b) continue;   // buttons not there yet
      sec.setAttribute("data-tb-view", "1");
      if (b) b.click();
    }
  }
  document.documentElement.classList.toggle("tb-ep-list", pref() === "list");

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; scan(); }); }, 120);
  }
  tbWatch(function () { quickView(); schedule(); });
  quickView();
  schedule();

  // ── Styles (list view only; grid view stays SleekFin's) ──
  var L = "html .sleekfin-details-episode-list[data-view='list']:not(#tb-x)";
  var E = L + " .sleekfin-details-episode";
  var ACC = "var(--sleekfin-accent, rgb(233, 196, 106))";
  var PLAY = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%230b0b0b' d='M8 5.5v13l11-6.5z'/%3E%3C/svg%3E\")";
  var css = [
    // while you prefer the list: SleekFin's first (grid) render stays invisible until it switches
    "html.tb-ep-list .sleekfin-details-episodes:not([data-tb-view]) .sleekfin-details-episode-list[data-view='grid'] { visibility: hidden !important; }",
    L + " { gap: 0 !important; margin-top: 14px !important; }",

    /* row */
    E + ".card { height: auto !important; aspect-ratio: auto !important; border: 0 !important; border-radius: 12px !important;",
    "  overflow: visible !important; background: transparent; transition: background-color 160ms ease; }",
    E + ".card + .sleekfin-details-episode.card::before { content: ''; position: absolute; left: 12px; right: 12px; top: 0;",
    "  height: 1px; background: rgba(255,255,255,0.07); }",
    E + ".card:hover, " + E + ".card:focus-within { background: rgba(255,255,255,0.05); }",
    /* no global poster pop / shadow / hover-card overlay on a full-width row */
    E + " > .cardBox { height: auto !important; transform: none !important; filter: none !important; box-shadow: none !important;",
    "  clip-path: none !important; background: transparent !important; overflow: visible !important; }",
    E + " .cardScalable::after, " + E + " .tb-hover-info { display: none !important; }",

    /* layout: number | still | text */
    E + "-action { display: grid !important; height: auto !important; background: transparent !important;",
    "  grid-template-columns: 64px 240px minmax(0, 1fr);",
    "  grid-template-areas: 'num img title' 'num img overview' 'num img footer';",
    "  grid-template-rows: auto auto auto; align-content: center;",
    "  column-gap: 22px; row-gap: 6px; padding: 16px 128px 16px 6px !important;",
    /* Jellyfin gives this element "contain: strict", which makes it ignore its contents' height
       (squashed rows, clipped titles). Lift that here. */
    "  contain: none !important; overflow: visible !important; border-radius: 0 !important; }",
    E + "-copy, " + E + "-heading { display: contents !important; }",

    /* still */
    E + "-action > img { position: relative !important; inset: auto !important; grid-area: img; grid-row: 1 / span 3;",
    "  width: 240px !important; height: 135px !important; aspect-ratio: 16 / 9; object-fit: cover; align-self: center;",
    "  border-radius: 8px; transform: none !important; box-shadow: 0 6px 18px -8px rgba(0,0,0,0.7); }",
    /* hover: darken the still + white play button */
    E + "-shade { position: relative !important; inset: auto !important; grid-area: img; grid-row: 1 / span 3; align-self: stretch;",
    "  display: flex !important; align-items: center; justify-content: center; z-index: 1;",
    "  border-radius: 8px; background: rgba(0,0,0,0.35) !important; opacity: 0; transition: opacity 160ms ease; }",
    E + "-shade::after { content: ''; width: 44px; height: 44px; border-radius: 50%;",
    "  background: #fff " + PLAY + " 55% 50% / 20px 20px no-repeat; box-shadow: 0 4px 14px rgba(0,0,0,0.5); }",
    E + ".card:hover " + ".sleekfin-details-episode-shade, " + E + ".card:focus-within .sleekfin-details-episode-shade { opacity: 1; }",
    /* progress bar on the still */
    E + " .innerCardFooter { position: relative !important; grid-area: img; grid-row: 3; align-self: end; z-index: 2;",
    "  left: auto !important; right: auto !important; bottom: auto !important; margin: 0 8px 8px; background: none !important; }",
    E + " .itemProgressBar { height: 4px !important; border-radius: 2px; background: rgba(255,255,255,0.25) !important; overflow: hidden; }",
    E + " .itemProgressBar { display: block !important; position: relative; }",
    E + " .itemProgressBarForeground { display: block; height: 100%; background: " + ACC + " !important; border-radius: 2px; }",

    /* big number */
    E + "-number { grid-area: num; grid-row: 1 / span 3; justify-self: center; align-self: center; position: static !important;",
    "  padding: 0 !important; background: none !important; border: 0 !important; box-shadow: none !important;",
    "  -webkit-backdrop-filter: none !important; backdrop-filter: none !important;",
    "  font-family: var(--title-font, 'Bebas Neue', sans-serif) !important; font-size: 46px !important; line-height: 1 !important;",
    "  letter-spacing: 0.02em; color: rgba(255,255,255,0.38) !important; }",
    E + "-number[data-tb-num] { font-size: 0 !important; }",
    E + "-number[data-tb-num]::after { content: attr(data-tb-num); font-size: 46px; }",
    E + ".card:has(.itemProgressBar) .sleekfin-details-episode-number { color: " + ACC + " !important; }",

    /* text */
    E + "-title.cardText { grid-area: title; align-self: end; font: 600 17px/1.3 var(--app-font, Inter, sans-serif) !important;",
    "  color: #fff; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis; }",
    E + "-overview { grid-area: overview; margin: 0 !important; -webkit-line-clamp: 2 !important;",
    "  font: 400 14px/1.5 var(--app-font, Inter, sans-serif) !important; color: rgba(255,255,255,0.62) !important; }",
    E + "-footer { grid-area: footer; align-self: start; justify-content: flex-start !important; gap: 16px; margin: 2px 0 0 !important;",
    "  font: 600 12px/16px var(--app-font, Inter, sans-serif) !important; color: rgba(255,255,255,0.55) !important; }",

    /* watched: quieter */
    E + ".card:has(button[data-played='true']) .sleekfin-details-episode-action > img { opacity: 0.55; }",
    E + ".card:has(button[data-played='true']) .sleekfin-details-episode-number { color: rgba(255,255,255,0.2) !important; }",

    /* watched / favourite / more: right side, show on hover */
    E + "-actions { top: 50% !important; right: 14px !important; transform: translateY(-50%);",
    "  opacity: 0; transition: opacity 160ms ease; }",
    E + ".card:hover .sleekfin-details-episode-actions, " + E + ".card:focus-within .sleekfin-details-episode-actions { opacity: 1; }",
    "@media (hover: none) { " + E + "-actions { opacity: 1; } }",

    /* "New episode" tag sits on the still */
    E + " .tb-new-tag { left: 112px !important; top: 22px !important; bottom: auto !important; transform: none !important;",
    "  border-radius: 4px !important; z-index: 3; }",

    /* phones */
    "@media (max-width: 767px) {",
    "  " + E + "-action { grid-template-columns: 30px 40% minmax(0, 1fr);",
    "    grid-template-areas: 'num img title' 'num img footer' 'ov ov ov'; grid-template-rows: auto auto auto;",
    "    column-gap: 12px; padding: 12px 44px 12px 4px !important; }",
    "  " + E + "-action > img, " + E + "-shade { grid-row: 1 / span 2; width: 100% !important; }",
    "  " + E + "-action > img { height: auto !important; }",
    "  " + E + " .innerCardFooter { grid-row: 2; }",
    "  " + E + "-number { grid-row: 1 / span 2; font-size: 28px !important; }",
    "  " + E + "-number[data-tb-num]::after { font-size: 28px; }",
    "  " + E + "-title.cardText { font-size: 15px !important; white-space: normal !important; display: -webkit-box !important;",
    "    -webkit-line-clamp: 2; -webkit-box-orient: vertical; }",
    "  " + E + "-overview { display: -webkit-box !important; grid-area: ov; margin-top: 8px !important; font-size: 13px !important; }",
    "  " + E + "-actions { top: 12px !important; transform: none; }",
    "  " + E + "-actions .sleekfin-details-episode-user-actions, " + E + "-actions .sleekfin-details-episode-download { display: none !important; }",
    "  " + E + " .tb-new-tag { left: 46px !important; top: 16px !important; }",
    "}"
  ].join("\n");
  var style = document.createElement("style");
  style.id = "tb-episode-list";
  style.textContent = css;
  document.head.appendChild(style);
})();

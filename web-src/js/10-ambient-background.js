(function ambientBackground() {
  // Shared page watcher: ONE observer for all custom scripts instead of one each.
  // While a video is playing full screen (or the tab is hidden) it only checks every 1.5s.
  var tbWatch = window.tbWatch;   // shared page watcher (in every theme file)
  // ── Settings ──
  var DIM = tbCfg("AmbientDim", 0.48);          // 0 = full colour, 1 = black. How dark the page tint is.
  var FADE_MS = tbCfg("AmbientFade", true) ? 1200 : 0;   // cross-fade (plugin setting "Ambient fade")
  var SOURCE_WIDTH = 48;   // size of the image fetched from Jellyfin (tiny = soft + fast)

  var ROOT_CLASS = "tb-ambient";
  var layers = [], current = 0, currentSrc = "", token = 0;

  // ── Layers: two images for cross-fading + a fixed tint on top ──
  function build() {
    if (document.getElementById("tb-ambient")) return;
    var wrap = document.createElement("div");
    wrap.id = "tb-ambient";
    wrap.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 2; i++) {
      var l = document.createElement("div");
      l.className = "tb-amb-layer";
      wrap.appendChild(l);
      layers.push(l);
    }
    var tint = document.createElement("div");
    tint.className = "tb-amb-tint";
    wrap.appendChild(tint);
    document.body.insertBefore(wrap, document.body.firstChild);
  }

  // Tiny image -> small soft blurred picture (done once per slide, no live blur)
  function soften(src, cb) {
    var img = new Image();
    img.decoding = "async";
    img.onload = function () {
      try {
        var w = 96, h = 54;
        var small = document.createElement("canvas");
        small.width = 24; small.height = 14;
        var sctx = small.getContext("2d");
        sctx.imageSmoothingEnabled = true;
        sctx.drawImage(img, 0, 0, 24, 14);            // squash = blur
        var c = document.createElement("canvas");
        c.width = w; c.height = h;
        var ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = true;
        if ("filter" in ctx) ctx.filter = "saturate(1.15)";
        ctx.drawImage(small, 0, 0, w, h);              // smooth upscale
        cb(c.toDataURL("image/jpeg", 0.92));
      } catch (e) {
        cb(src);                                      // canvas blocked -> use the tiny image directly
      }
    };
    img.onerror = function () { cb(null); };
    img.src = src;
  }

  function tinyUrl(src) {
    try {
      var u = new URL(src, location.href);
      ["maxWidth", "maxHeight", "width", "height", "fillWidth", "fillHeight"].forEach(function (k) { u.searchParams.delete(k); });
      u.searchParams.set("maxWidth", String(SOURCE_WIDTH));
      u.searchParams.set("quality", "60");
      return u.toString();
    } catch (e) { return src; }
  }

  function show(src) {
    if (!src || src === currentSrc) return;
    var first = !currentSrc;   // the very first background appears instantly
    currentSrc = src;
    var my = ++token;
    soften(tinyUrl(src), function (data) {
      if (my !== token || !data) return;
      var next = layers[1 - current];
      next.style.backgroundImage = 'url("' + data + '")';
      // make sure the new image is painted before fading it in
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (my !== token) return;
          if (first) {
            next.style.transition = "none";
            requestAnimationFrame(function () { next.style.transition = ""; });
          }
          next.classList.add("on");
          layers[current].classList.remove("on");
          current = 1 - current;
        });
      });
    });
  }

  // ── Where are we? ──
  function homeHero() {
    var hero = document.querySelector("#indexPage:not(.hide) .sleekfin-hero, .sleekfin-hero");
    if (!hero || hero.closest(".hide")) return null;   // class check: no forced layout
    return hero;
  }
  function onVideo() {
    return /^#\/?video/i.test(location.hash) || !!document.querySelector(".videoPlayerContainer:not(.hide)");
  }

  function activeBackdrop(hero) {
    var img = hero.querySelector('.sleekfin-hero-slide[data-active="true"] img.sleekfin-hero-backdrop') ||
              hero.querySelector("img.sleekfin-hero-backdrop");
    return img && (img.currentSrc || img.src);
  }

  // Details page (SleekFin): the title's backdrop sits on #itemBackdrop as a CSS background
  function detailsPage() {
    var page = document.querySelector("#itemDetailPage:not(.hide)");
    if (!page || page.closest(".hide")) return null;
    return page;
  }
  function detailsBackdrop(page) {
    var el = page.querySelector("#itemBackdrop") || document.getElementById("itemBackdrop");
    if (!el) return null;
    var bg = el.style.backgroundImage || getComputedStyle(el).backgroundImage || "";
    var m = bg.match(/url\((['"]?)(.*?)\1\)/);
    return m ? m[2] : null;
  }

  // ── Every other page (Movies, Shows, collections, favourites...) ──
  // Colour comes from a random backdrop in that library, then follows the card you hover/select.
  // The page on screen. Jellyfin 10.11 has two kinds: old-style pages inside .mainAnimatedPages,
  // and newer React pages (Movies, Shows, Collections, Settings...) that live elsewhere.
  function visiblePage() {
    // cheap class check first; only measure (forces layout) if it's still ambiguous
    var ps = document.querySelectorAll(".page:not(.hide)"), live = [];
    for (var i = 0; i < ps.length; i++) if (!ps[i].closest(".hide")) live.push(ps[i]);
    if (live.length <= 1) return live[0] || null;
    for (var j = live.length - 1; j >= 0; j--) {
      if (live[j].getClientRects().length) return live[j];
    }
    return null;
  }
  function excluded(page) {
    if (!page) return true;
    var id = page.id || "";
    if (id === "searchPage" || id === "loginPage" || id === "videoOsdPage" ||
        id === "forgotPasswordPage" || id === "selectServerPage") return true;
    var b = document.body, h = document.documentElement;
    if (b.classList.contains("dashboardDocument") || h.classList.contains("dashboardDocument")) return true;
    if (page.classList.contains("type-interior") && !page.classList.contains("libraryPage")) return true;
    return false;
  }

  var hoverSrc = null, hoverTimer = null;
  var pageKey = "", pageSrc = null;
  var libCache = {};

  function parentIdFromUrl() {
    var m = /[?&](?:topParentId|parentId)=([0-9a-f]{32})/i.exec(location.hash + location.search);
    return m ? m[1] : null;
  }
  function loadLibraryBackdrop(pid) {
    if (libCache[pid] !== undefined || !window.ApiClient) return;
    libCache[pid] = null;
    try {
      Promise.resolve(ApiClient.getItems(ApiClient.getCurrentUserId(), {
        ParentId: pid, Recursive: true, SortBy: "Random", Limit: 1,
        IncludeItemTypes: "Movie,Series,MusicAlbum,BoxSet",
        ImageTypes: "Backdrop", EnableImageTypes: "Backdrop", ImageTypeLimit: 1,
        EnableUserData: false
      })).then(function (res) {
        var it = res && res.Items && res.Items[0];
        if (it && it.BackdropImageTags && it.BackdropImageTags.length) {
          libCache[pid] = ApiClient.getUrl("Items/" + it.Id + "/Images/Backdrop/0", { tag: it.BackdropImageTags[0], maxWidth: SOURCE_WIDTH });
          schedule();
        }
      }).catch(function () {});
    } catch (e) {}
  }

  function cardImage(card) {
    var c = card.querySelector(".cardImageContainer, .cardImage");
    if (!c) return null;
    if (c.tagName === "IMG") return c.currentSrc || c.src || c.getAttribute("data-src");
    var bg = c.style.backgroundImage || "";
    var m = bg.match(/url\((['"]?)(.*?)\1\)/);
    return m ? m[2] : c.getAttribute("data-src");
  }
  function onCardActive(e) {
    if (!document.documentElement.classList.contains(ROOT_CLASS + "-page")) return;
    var card = e.target && e.target.closest && e.target.closest(".card");
    if (!card) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () {
      var src = cardImage(card);
      if (src && src.indexOf("data:") !== 0) { hoverSrc = src; schedule(); }
    }, 350);
  }
  document.addEventListener("pointerover", function (e) { if (!e.pointerType || e.pointerType === "mouse") onCardActive(e); }, { passive: true });
  document.addEventListener("focusin", onCardActive);

  function update() {
    var root = document.documentElement;
    var src = null, mode = "";
    if (!onVideo()) {
      var hero = homeHero();
      if (hero) { mode = "home"; src = activeBackdrop(hero); }
      else {
        var page = detailsPage();
        if (page && detailsBackdrop(page)) { mode = "details"; src = detailsBackdrop(page); }
        else {
          var vp = visiblePage();
          if (!excluded(vp)) {
            mode = "page";
            var key = location.hash;
            if (key !== pageKey) { pageKey = key; hoverSrc = null; pageSrc = null; }
            var pid = parentIdFromUrl();
            if (pid) { loadLibraryBackdrop(pid); pageSrc = libCache[pid] || pageSrc; }
            src = hoverSrc || pageSrc;   // nothing yet -> keep the last colours
          }
        }
      }
    }
    var on = !!mode;
    root.classList.toggle(ROOT_CLASS, on);
    root.classList.toggle(ROOT_CLASS + "-details", mode === "details");
    root.classList.toggle(ROOT_CLASS + "-page", mode === "page");
    if (!on) return;
    build();
    if (src) show(src);
    else if (!currentSrc) {
      // first page ever opened has nothing yet: use any backdrop from the server
      var any = "__any__";
      if (libCache[any] === undefined && window.ApiClient) {
        libCache[any] = null;
        try {
          Promise.resolve(ApiClient.getItems(ApiClient.getCurrentUserId(), {
            Recursive: true, SortBy: "Random", Limit: 1, IncludeItemTypes: "Movie,Series",
            ImageTypes: "Backdrop", EnableImageTypes: "Backdrop", ImageTypeLimit: 1, EnableUserData: false
          })).then(function (res) {
            var it = res && res.Items && res.Items[0];
            if (it && it.BackdropImageTags && it.BackdropImageTags.length) {
              show(ApiClient.getUrl("Items/" + it.Id + "/Images/Backdrop/0", { tag: it.BackdropImageTags[0], maxWidth: SOURCE_WIDTH }));
            }
          }).catch(function () {});
        } catch (e) {}
      }
    }
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    // at most ~6 times a second: DOM changes come in bursts (scrolling, rows loading)
    setTimeout(function () { requestAnimationFrame(function () { queued = false; update(); }); }, 150);
  }

  // ── Styles ──
  var css = [
    "#tb-ambient { position: fixed; inset: 0; z-index: -1; pointer-events: none; display: none; background: #000; }",
    "html." + ROOT_CLASS + " #tb-ambient { display: block; }",
    ".tb-amb-layer {",
    "  position: absolute; inset: -4%;",
    "  background-size: cover; background-position: 50% 30%; background-repeat: no-repeat;",
    "  opacity: 0; transition: opacity " + FADE_MS + "ms ease;",
    "  will-change: opacity;",
    "}",
    ".tb-amb-layer.on { opacity: 1; }",
    ".tb-amb-tint {",
    "  position: absolute; inset: 0;",
    "  background:",
    "    linear-gradient(90deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.12) 40%, rgba(0,0,0,0) 65%),",
    "    linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.10) 55%, rgba(0,0,0,0.30) 100%),",
    "    rgba(0,0,0," + DIM + ");",
    "}",

    /* Home page only: remove the black so the ambient layer shows through */
    "html." + ROOT_CLASS + ".sleekfin-main-ui:not(.transparentDocument) body,",
    "html." + ROOT_CLASS + " body { background: transparent !important; background-color: transparent !important; }",
    "html." + ROOT_CLASS + " :is(.backgroundContainer, .mainAnimatedPages, .skinBody, .mainAnimatedPage) { background: transparent !important; }",
    /* Jellyfin's own full-screen backdrop ("Backdrops" display setting) sits fixed behind the page.
       SleekFin's black page used to hide it; with the page see-through it showed up sharp as a
       second copy. The ambient layer replaces it, so hide it while ambient is on. */
    "html." + ROOT_CLASS + " .backdropContainer, html." + ROOT_CLASS + " .backgroundContainer.withBackdrop { display: none !important; }",
    "html." + ROOT_CLASS + ".sleekfin-media-mounted #indexPage#indexPage, html." + ROOT_CLASS + " #indexPage#indexPage { background: transparent !important; }",
    "html." + ROOT_CLASS + " .sleekfin-hero.sleekfin-hero { background: transparent !important; }",
    "html." + ROOT_CLASS + " .homeSectionsContainer, html." + ROOT_CLASS + " #homeTab { background: transparent !important; }",
    /* Library and other pages: see-through so the ambient layer shows */
    "html." + ROOT_CLASS + "-page .mainAnimatedPage:not(.hide):not(#tb-x),",
    "html." + ROOT_CLASS + "-page .page:not(.hide):not(#tb-x),",
    /* SleekFin paints these library pages black by ID */
    "html." + ROOT_CLASS + "-page :is(#moviesPage, #tvshowsPage, #tvRecommendedPage, #indexPage):not(#tb-x),",
    "html." + ROOT_CLASS + "-page .mainAnimatedPage:not(.hide) .pageTabContent:not(#tb-x),",
    "html." + ROOT_CLASS + "-page .mainAnimatedPage:not(.hide) .itemsContainer:not(#tb-x) { background: transparent !important; }",

    /* Details page: no black page; backdrop fades into the ambient layer */
    "html." + ROOT_CLASS + "-details #itemDetailPage#itemDetailPage, html." + ROOT_CLASS + "-details #itemDetailPage[data-sleekfin-details]#itemDetailPage { background: transparent !important; }",
    "html." + ROOT_CLASS + "-details.sleekfin-details-mounted, html." + ROOT_CLASS + "-details .detailPageWrapperContainer { background: transparent !important; }",
    "html." + ROOT_CLASS + "-details #itemDetailPage > #itemBackdrop {",
    "  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 50%, rgba(0,0,0,0.7) 68%, rgba(0,0,0,0.3) 85%, transparent 100%) !important;",
    "  mask-image: linear-gradient(180deg, #000 0%, #000 50%, rgba(0,0,0,0.7) 68%, rgba(0,0,0,0.3) 85%, transparent 100%) !important;",
    "}",
    "html." + ROOT_CLASS + "-details #itemDetailPage > #itemBackdrop::after { background: none !important; }",

    /* Hero melts into the background instead of fading to black */
    "html." + ROOT_CLASS + " .sleekfin-hero-seam { background: none !important; }",
    "html." + ROOT_CLASS + " .sleekfin-hero-vignette {",
    "  background: none !important;",
    /* fade SleekFin's dark left-side gradient out before the hero ends -> no hard line */
    "  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 50%, rgba(0,0,0,0.4) 78%, transparent 100%);",
    "  mask-image: linear-gradient(180deg, #000 0%, #000 50%, rgba(0,0,0,0.4) 78%, transparent 100%);",
    "}",
    /* the hero image itself fades out a little earlier so it melts into the ambient layer */
    "html." + ROOT_CLASS + " .sleekfin-hero-backdrop {",
    "  -webkit-mask-image: linear-gradient(180deg, #000 0%, #000 45%, rgba(0,0,0,0.75) 62%, rgba(0,0,0,0.35) 80%, transparent 100%) !important;",
    "  mask-image: linear-gradient(180deg, #000 0%, #000 45%, rgba(0,0,0,0.75) 62%, rgba(0,0,0,0.35) 80%, transparent 100%) !important;",
    "}"
  ].join("\n");
  var style = document.createElement("style");
  style.id = "tb-ambient-style";
  style.textContent = css;
  tbCss(style);

  // ── Watch for the hero mounting and for slide changes ──
  // New / removed elements come from the shared watcher; attribute changes are filtered here so
  // ordinary image lazy-loading and hover classes don't wake this script up.
  tbWatch(schedule);
  new MutationObserver(function (recs) {
    for (var i = 0; i < recs.length; i++) {
      var t = recs[i].target, a = recs[i].attributeName, cl = t.classList;
      if (!cl) continue;
      if (a === "data-active" ||
          (a === "class" && (cl.contains("page") || cl.contains("sleekfin-hero-slide"))) ||
          ((a === "src" || a === "data-loaded") && cl.contains("sleekfin-hero-backdrop")) ||
          (a === "style" && t.id === "itemBackdrop")) { schedule(); return; }
    }
  }).observe(document.body, {
    subtree: true, attributes: true, attributeFilter: ["data-active", "src", "data-loaded", "class", "style"]
  });
  window.addEventListener("hashchange", schedule);
  document.addEventListener("visibilitychange", schedule);
  schedule();
})();

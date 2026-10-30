(function customIcon() {
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
  // Swaps the Jellyfin icon for your own: browser tab, header logo, loading/sign-in screens,
  // and "add to home screen".
  // ── Settings ── paste DIRECT image links (they end in .png / .jpg / .svg / .webp)
  var ICON_URL = tbCfg("IconUrl", "https://i.imgur.com/ckrwhZ1.png");   // square icon, ideally 512x512 PNG
  var LOGO_URL = "";                                 // optional wide header logo; empty = use ICON_URL

  if (!/^https?:\/\//i.test(ICON_URL)) {
    console.warn("[Custom Icon] ICON_URL is not set to a direct image link.");
    return;
  }
  var HEADER = LOGO_URL || ICON_URL;
  var MARK = "data-tb-icon";

  // ── Tab icon + home-screen icon ──
  function setLinks() {
    var head = document.head;
    var links = head.querySelectorAll('link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]');
    var hasIcon = false, hasApple = false;
    for (var i = 0; i < links.length; i++) {
      var l = links[i];
      if (l.getAttribute("href") !== ICON_URL) {
        l.setAttribute("href", ICON_URL);
        l.removeAttribute("type");
      }
      if (/apple/.test(l.rel)) hasApple = true; else hasIcon = true;
    }
    if (!hasIcon) {
      var a = document.createElement("link");
      a.rel = "icon"; a.href = ICON_URL; a.setAttribute(MARK, "");
      head.appendChild(a);
    }
    if (!hasApple) {
      var b = document.createElement("link");
      b.rel = "apple-touch-icon"; b.href = ICON_URL; b.setAttribute(MARK, "");
      head.appendChild(b);
    }
  }

  // ── Header logo (SleekFin brand + Jellyfin's own) ──
  var DEFAULT_IMG = /icon-transparent|banner-light|banner-dark|touchicon|favicon|jellyfin.*\.(png|svg)/i;
  function setHeader() {
    // images
    var imgs = document.querySelectorAll(
      "[data-sleekfin-header-brand] img, .sleekfin-header-fallback-brand img, a[href='#/'] img, .headerLeft img, .splashLogo img"
    );
    for (var i = 0; i < imgs.length; i++) {
      var im = imgs[i];
      if (im.getAttribute("src") === HEADER) continue;
      var inBrand = im.closest && im.closest("[data-sleekfin-header-brand], .sleekfin-header-fallback-brand, a[href='#/']");
      if (inBrand || DEFAULT_IMG.test(im.getAttribute("src") || "")) {
        im.removeAttribute("srcset");
        im.setAttribute("src", HEADER);
      }
    }
    // inline SVG logos inside the brand -> swap for an image
    var svgs = document.querySelectorAll("[data-sleekfin-header-brand] svg, a[href='#/'] > svg");
    for (var j = 0; j < svgs.length; j++) {
      var sv = svgs[j];
      var rep = document.createElement("img");
      rep.src = HEADER; rep.alt = "";
      sv.parentNode.replaceChild(rep, sv);
    }
  }

  function run() { setLinks(); setHeader(); }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    // at most ~6 times a second: DOM changes come in bursts (scrolling, rows loading)
    setTimeout(function () { requestAnimationFrame(function () { queued = false; run(); }); }, 150);
  }
  tbWatch(schedule);
  run();

  // ── CSS-drawn logos (loading splash, Jellyfin's default header logo) ──
  var style = document.createElement("style");
  style.id = "tb-custom-icon";
  style.textContent = [
    ".splashLogo, .pageTitleWithDefaultLogo, .pageTitleWithLogo {",
    "  background-image: url(\"" + HEADER + "\") !important;",
    "  background-size: contain !important; background-repeat: no-repeat !important;",
    "}",
    ".splashLogo { background-position: center !important; }",
    ".pageTitleWithDefaultLogo, .pageTitleWithLogo { background-position: left center !important; }"
  ].join("\n");
  document.head.appendChild(style);
})();

(function ushereatsHero() {
  // Home hero: a copy of SleekFin's hero (same markup + classes, so SleekFin's own styling and all
  // theme tweaks apply), but instant:
  //  - the list + SleekFin's look settings were already requested from the page head before Jellyfin started
  //  - the first backdrop was already downloading (and painted) from the head
  //  - it is built once and kept: coming back to Home re-uses it, nothing reloads
  //  - only the shown slide + the next one load their backdrop (SleekFin loads all of them at once)
  // Content: the 10 newest movies & shows by release date, random order.
  // Needs SleekFin's own hero switched OFF in SleekFin's settings.
  if (window.__tbHeroStarted) return;
  window.__tbHeroStarted = true;

  var CACHE_KEY = "tbHeroCache";
  var html = document.documentElement;
  var DEFAULTS = {
    autoRotateSeconds: 10, backdropFit: "Cover", backdropFocusX: 50, backdropFocusY: 28, backdropOpacity: 100,
    buttonCornerStyle: "Pill", buttonHeight: 44, contentAlignment: "Left", contentMaxWidth: 560,
    descriptionColor: "rgba(255, 255, 255, 0.88)", descriptionLines: 3, descriptionSize: 15, descriptionWeight: 400,
    desktopHeight: 85, mobileHeight: 70, primaryButtonBackgroundColor: "#F1F2F4", primaryButtonOpacity: 100,
    primaryButtonTextColor: "#05070A", secondaryButtonBackgroundColor: "#161618", secondaryButtonOpacity: 82,
    secondaryButtonTextColor: "#F1F2F4", swipeEnabled: true, titleCase: "Uppercase", titleColor: "#FFFFFF",
    titleSize: 48, titleTreatment: "Auto", titleWeight: 800, transitionDurationMs: 380, transitionStyle: "SlideFade",
    verticalAlignment: "Bottom", vignetteStrength: 72
  };
  var ICONS = {
    play: '<svg class="sleekfin-icon" data-sleekfin-icon="play" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 19,12 5,21"></polygon></svg>',
    info: '<svg class="sleekfin-icon" data-sleekfin-icon="info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>',
    star: '<svg class="sleekfin-icon" data-sleekfin-icon="star" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
  };

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

  // ── helpers ──
  function isHomeRoute() {
    var h = location.hash;
    if (h === "" || h === "#") return true;
    var m = /^#\/(?:home)?(?:\?([^#]*))?$/.exec(h);
    if (!m) return false;
    var q = m[1] || "";
    return !/(^|&)seerrfinTab=/.test(q) && !/(^|&)tab=(?!0(&|$))/.test(q);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function frag(markup) {
    var t = document.createElement("template");
    t.innerHTML = markup.trim();
    return t.content.firstElementChild;
  }
  var imgUrl = window.__tbHeroImg || (function () {
    var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
    if (base.charAt(base.length - 1) !== "/") base += "/";
    var dpr = window.devicePixelRatio || 1;
    return function (id, type, tag) {
      if (type === "Backdrop") {
        var w = Math.min(2560, Math.max(960, Math.ceil((window.innerWidth || 1280) * dpr / 160) * 160));
        return base + "Items/" + id + "/Images/Backdrop/0?tag=" + encodeURIComponent(tag) + "&maxWidth=" + w + "&quality=90";
      }
      return base + "Items/" + id + "/Images/Logo?tag=" + encodeURIComponent(tag) + "&maxHeight=" + Math.ceil(140 * dpr) + "&quality=90";
    };
  })();
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)), t = a[i];
      a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function slim(it) {
    return {
      Id: it.Id, Name: it.Name, Type: it.Type, ServerId: it.ServerId, IsFolder: !!it.IsFolder, MediaType: it.MediaType || "Video",
      ProductionYear: it.ProductionYear, PremiereDate: it.PremiereDate, CommunityRating: it.CommunityRating,
      Overview: it.Overview || "", Genres: (it.Genres || []).slice(0, 2),
      Logo: it.ImageTags && it.ImageTags.Logo || null, Backdrop: it.BackdropImageTags && it.BackdropImageTags[0] || null
    };
  }

  // ── data: from the page head if it ran, otherwise ask Jellyfin ourselves ──
  var dataPromise = null;
  function loadData() {
    if (dataPromise) return dataPromise;
    var pre = window.__tbHero;
    var items = pre && pre.items ? pre.items : Promise.resolve(null);
    var look = pre && pre.settings ? pre.settings : Promise.resolve(null);
    dataPromise = Promise.all([items, look]).then(function (r) {
      if (r[0] && r[0].length) return r;
      var api = window.ApiClient;
      if (!api) return [null, r[1]];
      var uid = api.getCurrentUserId();
      return Promise.all([
        Promise.resolve(api.getItems(uid, {
          IncludeItemTypes: "Movie,Series", Recursive: true, SortBy: "PremiereDate,SortName", SortOrder: "Descending", Limit: 10,
          Fields: "Overview,Genres", ImageTypes: "Backdrop", EnableImageTypes: "Logo,Backdrop", ImageTypeLimit: 1,
          EnableUserData: false, EnableTotalRecordCount: false, MaxPremiereDate: new Date().toISOString()
        })).then(function (j) { return (j && j.Items) || null; })["catch"](function () { return null; }),
        r[1] ? Promise.resolve(r[1]) : Promise.resolve(api.ajax({ type: "GET", url: api.getUrl("SleekFin/Hero/Settings"), dataType: "json" }))["catch"](function () { return null; })
      ]);
    }).then(function (r) {
      var list = (r[0] || []).map(slim).filter(function (x) { return x.Backdrop; });
      list = shuffle(list);
      // the slide the page head already painted goes first, so nothing swaps
      var first = window.__tbHeroFirst;
      if (first) {
        for (var i = 0; i < list.length; i++) if (list[i].Id === first) { list.unshift(list.splice(i, 1)[0]); break; }
      }
      if (!list.length) dataPromise = null;   // not signed in yet: try again on the next page change
      return { list: list, look: r[1] || {} };
    })["catch"](function () { dataPromise = null; return null; });
    return dataPromise;
  }

  // ── look (same CSS variables SleekFin sets) ──
  function applyLook(root, s) {
    function pick(k) { return s[k] != null && s[k] !== "" ? s[k] : DEFAULTS[k]; }
    var radius = { Pill: "999px", Rounded: "12px", Square: "0" }[pick("buttonCornerStyle")] || "999px";
    var v = {
      "--sleekfin-hero-backdrop-fit": String(pick("backdropFit")).toLowerCase(),
      "--sleekfin-hero-backdrop-focus": pick("backdropFocusX") + "% " + pick("backdropFocusY") + "%",
      "--sleekfin-hero-backdrop-opacity": String(pick("backdropOpacity") / 100),
      "--sleekfin-hero-button-height": pick("buttonHeight") + "px",
      "--sleekfin-hero-button-radius": radius,
      "--sleekfin-hero-content-max-width": pick("contentMaxWidth") + "px",
      "--sleekfin-hero-description-color": pick("descriptionColor"),
      "--sleekfin-hero-description-lines": String(pick("descriptionLines")),
      "--sleekfin-hero-description-size": pick("descriptionSize") + "px",
      "--sleekfin-hero-description-weight": String(pick("descriptionWeight")),
      "--sleekfin-hero-desktop-height": pick("desktopHeight") + "vh",
      "--sleekfin-hero-mobile-height": pick("mobileHeight") + "vh",
      "--sleekfin-hero-primary-background": pick("primaryButtonBackgroundColor"),
      "--sleekfin-hero-primary-opacity": pick("primaryButtonOpacity") + "%",
      "--sleekfin-hero-primary-text": pick("primaryButtonTextColor"),
      "--sleekfin-hero-secondary-background": pick("secondaryButtonBackgroundColor"),
      "--sleekfin-hero-secondary-opacity": pick("secondaryButtonOpacity") + "%",
      "--sleekfin-hero-secondary-text": pick("secondaryButtonTextColor"),
      "--sleekfin-hero-title-color": pick("titleColor"),
      "--sleekfin-hero-title-size": pick("titleSize") + "px",
      "--sleekfin-hero-title-transform": pick("titleCase") === "Uppercase" ? "uppercase" : "none",
      "--sleekfin-hero-title-weight": String(pick("titleWeight")),
      "--sleekfin-hero-transition-duration": pick("transitionDurationMs") + "ms",
      "--sleekfin-hero-vignette-opacity": String(pick("vignetteStrength") / 100)
    };
    for (var k in v) root.style.setProperty(k, v[k]);
    root.setAttribute("data-content-alignment", String(pick("contentAlignment")).toLowerCase());
    root.setAttribute("data-swipe-enabled", String(pick("swipeEnabled") !== false));
    root.setAttribute("data-transition-style", String(pick("transitionStyle")).toLowerCase());
    root.setAttribute("data-vertical-alignment", String(pick("verticalAlignment")).toLowerCase());
  }

  // ── building (same markup as SleekFin's HeroSlide) ──
  function button(item, action, variant, icon, label) {
    var b = el("button", "sleekfin-button sleekfin-button-" + variant + (variant === "control" ? " sleekfin-control-3d" : "") + " itemAction");
    b.type = "button";
    b.setAttribute("data-action", action);
    b.setAttribute("data-id", item.Id);
    b.setAttribute("data-isfolder", String(!!item.IsFolder));
    b.setAttribute("data-mediatype", item.MediaType || "Video");
    b.setAttribute("data-type", item.Type || "");
    var sid = item.ServerId || (window.ApiClient && ApiClient.serverId && ApiClient.serverId()) || "";
    if (sid) b.setAttribute("data-serverid", sid);
    b.appendChild(frag(ICONS[icon]));
    b.appendChild(el("span", "sleekfin-button-label", label));
    return b;
  }
  function facts(item) {
    var out = [];
    var rating = Number(item.CommunityRating || 0);
    if (rating > 0) out.push({ cls: "sleekfin-hero-score", icon: "star", text: rating.toFixed(1) });
    var year = item.ProductionYear ? String(item.ProductionYear) : (item.PremiereDate ? String(new Date(item.PremiereDate).getFullYear()) : "");
    out.push({ text: year });
    out.push({ text: item.Type === "Series" ? "TV Show" : (item.Type || "") });
    (item.Genres || []).forEach(function (g) { out.push({ text: g }); });
    var box = el("div", "sleekfin-hero-facts");
    out.filter(function (f) { return f.text; }).forEach(function (f, i) {
      if (i > 0) box.appendChild(el("span", "sleekfin-fact-dot", "·"));
      var s = el("span", "sleekfin-fact" + (f.cls ? " " + f.cls : ""));
      if (f.icon) s.appendChild(frag(ICONS[f.icon]));
      s.appendChild(document.createTextNode(f.text));
      box.appendChild(s);
    });
    return box;
  }
  function expandable(p) {
    // click a cut-off description to open it (as SleekFin does)
    var open = false;
    function cut() { return p.scrollHeight - p.clientHeight > 1; }
    function set(v) {
      open = v;
      if (v) p.setAttribute("data-sleekfin-expanded", "true"); else p.removeAttribute("data-sleekfin-expanded");
      p.style.display = v ? "block" : "";
      p.style.setProperty("-webkit-line-clamp", v ? "unset" : "");
    }
    function animate(from, to, done) {
      var t = 0;
      function fin(e) {
        if (e && e.target !== p) return;
        clearTimeout(t);
        p.removeEventListener("transitionend", fin);
        p.style.height = ""; p.style.overflow = ""; p.style.transition = "";
        if (done) done();
      }
      p.style.height = from + "px"; p.style.overflow = "hidden";
      p.getBoundingClientRect();
      p.style.transition = "height 320ms cubic-bezier(0.22, 1, 0.36, 1)";
      p.style.height = to + "px";
      p.addEventListener("transitionend", fin);
      t = setTimeout(fin, 400);
    }
    p.addEventListener("click", function (e) {
      if ((!open && !cut()) || (e.target.closest && e.target.closest("a"))) return;
      e.preventDefault(); e.stopPropagation();
      var from = p.offsetHeight;
      if (!open) { set(true); animate(from, p.scrollHeight); return; }
      set(false); var to = p.offsetHeight; set(true);
      animate(from, to, function () { set(false); });
    });
  }
  function buildSlide(item, look) {
    var sec = el("section", "sleekfin-hero-slide");
    sec.setAttribute("data-active", "false");
    var bg = el("img", "sleekfin-hero-backdrop");
    bg.alt = "";
    bg.decoding = "async";
    bg.setAttribute("data-loaded", "false");
    bg.__tbSrc = imgUrl(item.Id, "Backdrop", item.Backdrop);
    bg.addEventListener("load", function () { bg.setAttribute("data-loaded", "true"); });
    sec.appendChild(bg);
    sec.appendChild(el("div", "sleekfin-hero-vignette"));
    sec.appendChild(el("div", "sleekfin-hero-seam"));
    var content = el("div", "sleekfin-hero-content");
    var stack = el("div", "sleekfin-hero-stack");
    var titleBox = el("div", "sleekfin-hero-title-box");
    var treat = look.titleTreatment || DEFAULTS.titleTreatment;
    var title = function () { titleBox.textContent = ""; titleBox.appendChild(el("span", "sleekfin-hero-title", item.Name || "")); };
    if (treat !== "Text" && item.Logo) {
      var logo = el("img", "sleekfin-hero-title-logo");
      logo.alt = "";
      logo.setAttribute("data-loaded", "false");
      logo.addEventListener("load", function () { logo.setAttribute("data-loaded", "true"); });
      logo.addEventListener("error", function () { if (treat !== "Logo") title(); });
      logo.src = imgUrl(item.Id, "Logo", item.Logo);
      if (logo.complete && logo.naturalWidth) logo.setAttribute("data-loaded", "true");
      titleBox.appendChild(logo);
    } else if (treat !== "Logo") {
      title();
    }
    stack.appendChild(titleBox);
    stack.appendChild(facts(item));
    if (item.Overview) {
      var p = el("p", "sleekfin-hero-description", item.Overview);
      stack.appendChild(p);
      expandable(p);
    }
    var actions = el("div", "sleekfin-hero-actions");
    actions.appendChild(button(item, "play", "primary", "play", "Play"));
    actions.appendChild(button(item, "link", "control", "info", "More info"));
    stack.appendChild(actions);
    content.appendChild(stack);
    sec.appendChild(content);
    sec.__tbBg = bg;
    return sec;
  }

  // ── state ──
  var root = null, slides = [], list = [], active = 0, look = {};
  var timer = 0, pointerX = null, handedOver = false, rectSaved = false, rectTimer = 0;

  function loadBackdrop(i) {
    var s = slides[i];
    if (!s || s.__tbBg.getAttribute("src")) return;
    var bg = s.__tbBg;
    bg.src = bg.__tbSrc;
    // already in the browser (preloaded from the page head or seen before): show it with no fade
    if (bg.complete && bg.naturalWidth) bg.setAttribute("data-loaded", "true");
  }
  function show(i) {
    if (!slides.length) return;
    active = (i + slides.length) % slides.length;
    loadBackdrop(active);
    loadBackdrop((active + 1) % slides.length);   // next one ready before it's needed
    for (var k = 0; k < slides.length; k++) {
      var v = k === active ? "true" : "false";
      if (slides[k].getAttribute("data-active") !== v) slides[k].setAttribute("data-active", v);
    }
  }
  function startTimer() {
    stopTimer();
    if (slides.length < 2) return;
    var secs = Number(look.autoRotateSeconds) || DEFAULTS.autoRotateSeconds;
    timer = setInterval(function () {
      if (document.hidden || pointerX !== null || !isHomeRoute() || !root || !root.isConnected) return;
      if (root.querySelector('.sleekfin-hero-slide[data-active="true"] [data-sleekfin-expanded]')) return;
      show(active + 1);
    }, secs * 1000);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = 0; } }

  function build(data) {
    list = data.list;
    look = data.look || {};
    root = frag('<div is="emby-itemscontainer" class="sleekfin-hero itemsContainer" data-contextmenu="false" data-multiselect="false" data-state="ready"></div>');
    applyLook(root, look);
    slides = list.map(function (it) { return buildSlide(it, look); });
    slides.forEach(function (s) { root.appendChild(s); });
    show(0);
    if (look.swipeEnabled !== false) {
      root.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse" || e.button === 0) pointerX = e.clientX; });
      window.addEventListener("pointerup", function (e) {
        if (pointerX === null) return;
        var d = e.clientX - pointerX;
        pointerX = null;
        if (Math.abs(d) >= 72) { show(active + (d < 0 ? 1 : -1)); startTimer(); }
      });
      var cancel = function () { pointerX = null; };
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("blur", cancel);
    }
    // remember this list for the next page load's instant first frame
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ items: list, rect: null, at: Date.now() })); } catch (e) {}
  }

  function saveRect(force) {
    if ((rectSaved && force !== true) || !root || !root.isConnected || !isHomeRoute()) return;
    var r = root.getBoundingClientRect();   // once per page load
    if (r.width < 200 || r.height < 120) return;
    rectSaved = true;
    try {
      var c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null") || { items: list };
      c.rect = { t: Math.round(r.top + (window.scrollY || 0)), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, vh: window.innerHeight };
      localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) {}
  }

  // hand over from the page-head picture once the real slide's backdrop is on screen
  function handOver() {
    if (handedOver || !html.classList.contains("tb-hs")) { handedOver = true; return; }
    var bg = slides[active] && slides[active].__tbBg;
    if (!bg || bg.getAttribute("data-loaded") !== "true") return;
    handedOver = true;
    requestAnimationFrame(function () {
      html.classList.add("tb-hs-out");
      setTimeout(function () { html.classList.remove("tb-hs", "tb-hs-out"); }, 320);
    });
  }

  function findHost() {
    var hosts = document.querySelectorAll("#indexPage #homeTab.is-active .sections");
    for (var i = 0; i < hosts.length; i++) if (!hosts[i].closest(".hide")) return hosts[i];
    return null;
  }

  function reconcile() {
    if (!isHomeRoute()) {
      html.classList.remove("sleekfin-hero-mounted", "tb-hs", "tb-hs-out");
      stopTimer();
      return;
    }
    var host = findHost();
    if (!host) return;
    if (!root) {
      loadData().then(function (data) {
        if (!data || !data.list.length || root) return;
        build(data);
        schedule();
      });
      return;
    }
    if (root.nextElementSibling !== host || !root.isConnected) {
      host.parentNode.insertBefore(root, host);
      if (window.CustomElements && typeof window.CustomElements.upgradeSubtree === "function") window.CustomElements.upgradeSubtree(root);
    }
    html.classList.add("sleekfin-hero-mounted");
    if (!timer) startTimer();
    handOver();
    if (!rectTimer && !rectSaved) rectTimer = setTimeout(saveRect, 3000);   // once the page has settled
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; reconcile(); }, 0);
  }
  tbWatch(schedule);
  window.addEventListener("hashchange", schedule);
  window.addEventListener("popstate", schedule);
  window.addEventListener("pageshow", schedule);
  // re-measure right before you leave/reload, when the layout is final
  window.addEventListener("pagehide", function () { saveRect(true); });
  document.addEventListener("visibilitychange", function () { if (document.hidden) saveRect(true); });
  document.addEventListener("viewshow", schedule);
  document.addEventListener("load", function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains("sleekfin-hero-backdrop")) handOver();
  }, true);
  loadData();   // start using the head's data straight away
  schedule();
})();

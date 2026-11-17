(function ushereatsHero() {
  // Home hero: a copy of UeTheme's hero (same markup + classes, so UeTheme's own styling and all
  // theme tweaks apply), but instant:
  //  - the list + UeTheme's look settings were already requested from the page head before Jellyfin started
  //  - the first backdrop was already downloading (and painted) from the head
  //  - it is built once and kept: coming back to Home re-uses it, nothing reloads
  //  - it lives directly in the home page (#indexPage), OUTSIDE the rows area that KefinTweaks/Jellyfin
  //    rebuild, and if anything ever removes it, it's put back before the next frame is drawn (no flash)
  //  - only the shown slide + the next one load their backdrop (UeTheme loads all of them at once)
  // Content: the 10 newest movies & shows by release date, random order.
  // Needs UeTheme's own hero switched OFF in UeTheme's settings.
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
    play: '<svg class="ue-icon" data-ue-icon="play" viewBox="0 0 24 24" fill="currentColor" stroke="none" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="5,3 19,12 5,21"></polygon></svg>',
    info: '<svg class="ue-icon" data-ue-icon="info" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>',
    star: '<svg class="ue-icon" data-ue-icon="star" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
  };

  // Shared page watcher: ONE observer for all custom scripts instead of one each.
  // While a video is playing full screen (or the tab is hidden) it only checks every 1.5s.
  var tbWatch = window.tbWatch;   // shared page watcher (in every theme file)

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
        var w = window.tbBackdropWidth ? window.tbBackdropWidth() : Math.min(2560, Math.max(960, Math.ceil((window.innerWidth || 1280) * dpr / 160) * 160));
        return base + "Items/" + id + "/Images/Backdrop/0?tag=" + encodeURIComponent(tag) + "&maxWidth=" + w + "&quality=80" + (window.__tbImgFmt || "");
      }
      return base + "Items/" + id + "/Images/Logo?tag=" + encodeURIComponent(tag) + "&maxHeight=" + Math.ceil(140 * dpr) + "&quality=90" + (/webp/.test(window.__tbImgFmt || "") ? window.__tbImgFmt : "");   // logos are see-through: WebP or as they are
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
        r[1] ? Promise.resolve(r[1]) : window.__tbLook && window.__tbLook.hero ? Promise.resolve(window.__tbLook.hero) : Promise.resolve(null)
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

  // ── look (same CSS variables UeTheme sets) ──
  function applyLook(root, s) {
    function pick(k) { return s[k] != null && s[k] !== "" ? s[k] : DEFAULTS[k]; }
    var radius = { Pill: "999px", Rounded: "12px", Square: "0" }[pick("buttonCornerStyle")] || "999px";
    var v = {
      "--ue-hero-backdrop-fit": String(pick("backdropFit")).toLowerCase(),
      "--ue-hero-backdrop-focus": pick("backdropFocusX") + "% " + pick("backdropFocusY") + "%",
      "--ue-hero-backdrop-opacity": String(pick("backdropOpacity") / 100),
      "--ue-hero-button-height": pick("buttonHeight") + "px",
      "--ue-hero-button-radius": radius,
      "--ue-hero-content-max-width": pick("contentMaxWidth") + "px",
      "--ue-hero-description-color": pick("descriptionColor"),
      "--ue-hero-description-lines": String(pick("descriptionLines")),
      "--ue-hero-description-size": pick("descriptionSize") + "px",
      "--ue-hero-description-weight": String(pick("descriptionWeight")),
      "--ue-hero-desktop-height": pick("desktopHeight") + "vh",
      "--ue-hero-mobile-height": pick("mobileHeight") + "vh",
      "--ue-hero-primary-background": pick("primaryButtonBackgroundColor"),
      "--ue-hero-primary-opacity": pick("primaryButtonOpacity") + "%",
      "--ue-hero-primary-text": pick("primaryButtonTextColor"),
      "--ue-hero-secondary-background": pick("secondaryButtonBackgroundColor"),
      "--ue-hero-secondary-opacity": pick("secondaryButtonOpacity") + "%",
      "--ue-hero-secondary-text": pick("secondaryButtonTextColor"),
      "--ue-hero-title-color": pick("titleColor"),
      "--ue-hero-title-size": pick("titleSize") + "px",
      "--ue-hero-title-transform": pick("titleCase") === "Uppercase" ? "uppercase" : "none",
      "--ue-hero-title-weight": String(pick("titleWeight")),
      "--ue-hero-transition-duration": pick("transitionDurationMs") + "ms",
      "--ue-hero-vignette-opacity": String(pick("vignetteStrength") / 100)
    };
    for (var k in v) root.style.setProperty(k, v[k]);
    root.setAttribute("data-content-alignment", String(pick("contentAlignment")).toLowerCase());
    root.setAttribute("data-swipe-enabled", String(pick("swipeEnabled") !== false));
    root.setAttribute("data-transition-style", String(pick("transitionStyle")).toLowerCase());
    root.setAttribute("data-vertical-alignment", String(pick("verticalAlignment")).toLowerCase());
  }

  // ── building (same markup as UeTheme's HeroSlide) ──
  function button(item, action, variant, icon, label) {
    var b = el("button", "ue-button ue-button-" + variant + (variant === "control" ? " ue-control-3d" : "") + " itemAction");
    b.type = "button";
    b.setAttribute("data-action", action);
    b.setAttribute("data-id", item.Id);
    b.setAttribute("data-isfolder", String(!!item.IsFolder));
    b.setAttribute("data-mediatype", item.MediaType || "Video");
    b.setAttribute("data-type", item.Type || "");
    var sid = item.ServerId || (window.ApiClient && ApiClient.serverId && ApiClient.serverId()) || "";
    if (sid) b.setAttribute("data-serverid", sid);
    b.appendChild(frag(ICONS[icon]));
    b.appendChild(el("span", "ue-button-label", label));
    return b;
  }
  function facts(item) {
    var out = [];
    var rating = Number(item.CommunityRating || 0);
    if (rating > 0) out.push({ cls: "ue-hero-score", icon: "star", text: rating.toFixed(1) });
    var year = item.ProductionYear ? String(item.ProductionYear) : (item.PremiereDate ? String(new Date(item.PremiereDate).getFullYear()) : "");
    out.push({ text: year });
    out.push({ text: item.Type === "Series" ? "TV Show" : (item.Type || "") });
    (item.Genres || []).forEach(function (g) { out.push({ text: g }); });
    var box = el("div", "ue-hero-facts");
    out.filter(function (f) { return f.text; }).forEach(function (f, i) {
      if (i > 0) box.appendChild(el("span", "ue-fact-dot", "·"));
      var s = el("span", "ue-fact" + (f.cls ? " " + f.cls : ""));
      if (f.icon) s.appendChild(frag(ICONS[f.icon]));
      s.appendChild(document.createTextNode(f.text));
      box.appendChild(s);
    });
    return box;
  }
  function expandable(p) {
    // click a cut-off description to open it (as UeTheme does)
    var open = false;
    function cut() { return p.scrollHeight - p.clientHeight > 1; }
    function set(v) {
      open = v;
      if (v) p.setAttribute("data-ue-expanded", "true"); else p.removeAttribute("data-ue-expanded");
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
    var sec = el("section", "ue-hero-slide");
    sec.setAttribute("data-active", "false");
    var bg = el("img", "ue-hero-backdrop");
    bg.alt = "";
    bg.draggable = false;
    bg.decoding = "async";
    bg.setAttribute("data-loaded", "false");
    bg.__tbSrc = imgUrl(item.Id, "Backdrop", item.Backdrop);
    bg.addEventListener("load", function () { bg.setAttribute("data-loaded", "true"); });
    sec.appendChild(bg);
    sec.appendChild(el("div", "ue-hero-vignette"));
    sec.appendChild(el("div", "ue-hero-seam"));
    var content = el("div", "ue-hero-content");
    var stack = el("div", "ue-hero-stack");
    var titleBox = el("div", "ue-hero-title-box");
    var treat = look.titleTreatment || DEFAULTS.titleTreatment;
    var title = function () { titleBox.textContent = ""; titleBox.appendChild(el("span", "ue-hero-title", item.Name || "")); };
    if (treat !== "Text" && item.Logo) {
      var logo = el("img", "ue-hero-title-logo");
      logo.alt = "";
      logo.draggable = false;
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
      var p = el("p", "ue-hero-description", item.Overview);
      stack.appendChild(p);
      expandable(p);
    }
    var actions = el("div", "ue-hero-actions");
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
    if (i === 0) bg.fetchPriority = "high";
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
      if (root.querySelector('.ue-hero-slide[data-active="true"] [data-ue-expanded]')) return;
      show(active + 1);
    }, secs * 1000);
  }
  function stopTimer() { if (timer) { clearInterval(timer); timer = 0; } }

  function build(data) {
    list = data.list;
    look = data.look || {};
    root = frag('<div is="emby-itemscontainer" class="ue-hero itemsContainer" data-contextmenu="false" data-multiselect="false" data-state="ready"></div>');
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

  // The hero sits right before the Home tab, as a direct child of the home page.
  function findHost() {
    var page = document.getElementById("indexPage");
    if (!page || page.classList.contains("hide")) return null;
    var tab = page.querySelector(":scope > #homeTab");
    return tab && tab.querySelector(".sections") ? tab : null;
  }

  // Runs inside the page watcher, i.e. before the browser paints: keeps the hero in place with no gap.
  // The banner's space, kept from the moment home appears until the banner itself is there: an empty block of the
  // banner's exact size (same classes, same settings) in its place, swapped for the banner in one go. Without it
  // home's rows are first laid out at the top and then pushed down by the banner (a page jump).
  var holder = null;
  function hold(host) {
    if (holder || !html.classList.contains("tb-hero-on") || !host || !host.parentNode) return;
    holder = document.createElement("div");
    holder.className = "ue-hero tb-hero-hold";
    holder.setAttribute("aria-hidden", "true");
    try { applyLook(holder, window.__tbLookHero || (window.__tbLook && window.__tbLook.hero) || {}); } catch (e) {}
    host.parentNode.insertBefore(holder, host);
  }
  // the home rows call this as they go in, so the banner's space is there in the same frame as the rows
  // (when the rows came first, they showed at the top for a moment and were then pushed down by the banner)
  window.tbHeroHold = function () { if (!root && isHomeRoute()) hold(findHost()); };
  function unhold() {
    if (holder && holder.parentNode) holder.parentNode.removeChild(holder);
    holder = null;
  }
  function place(host) {
    if (!root || !host) return;
    if (holder) unhold();
    if (root.parentNode !== host.parentNode || root.nextElementSibling !== host) {
      host.parentNode.insertBefore(root, host);
      if (window.CustomElements && typeof window.CustomElements.upgradeSubtree === "function") window.CustomElements.upgradeSubtree(root);
    }
  }
  function fastPlace() {
    if (!root) return;
    var home = isHomeRoute();
    var want = home ? "" : "none";
    if (root.style.display !== want) root.style.display = want;   // hidden on the other home tabs (Favourites...)
    if (home) place(findHost());
  }

  function reconcile() {
    if (!isHomeRoute()) {
      if (root && root.style.display !== "none") root.style.display = "none";
      html.classList.remove("ue-hero-mounted", "tb-hs", "tb-hs-out", "tb-hero-boot");
      stopTimer();
      return;
    }
    var host = findHost();
    if (!host) return;
    if (!root) {
      hold(host);
      loadData().then(function (data) {
        if (!data || !data.list.length) { html.classList.remove("tb-hero-boot"); unhold(); }   // no banner after all
        if (!data || !data.list.length || root) return;
        build(data);
        schedule();
      });
      return;
    }
    if (root.style.display) root.style.display = "";
    place(host);
    html.classList.add("ue-hero-mounted");
    html.classList.remove("tb-hero-boot");
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
  tbWatch(function () { fastPlace(); schedule(); });
  window.addEventListener("hashchange", function () { fastPlace(); schedule(); });
  window.addEventListener("popstate", schedule);
  window.addEventListener("pageshow", schedule);
  // re-measure right before you leave/reload, when the layout is final
  window.addEventListener("pagehide", function () { saveRect(true); });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { stopTimer(); saveRect(true); }
    else if (root && root.isConnected && isHomeRoute()) startTimer();
  });
  document.addEventListener("viewshow", schedule);
  document.addEventListener("load", function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains("ue-hero-backdrop")) handOver();
  }, true);

  loadData();   // start using the head's data straight away
  schedule();
})();

(function tbTitlePopup() {
  // Title pop-up (setting "Title opens as": Full page / Pop-up for admins / Pop-up for everyone).
  // Netflix-style: opening a title shows your normal title page (same hero, buttons, cast, episodes, styling)
  // as a panel over the page you were on, instead of replacing it. The address still changes, so back, the
  // back arrow, refresh and links all work as before. Closing (✕, Esc, clicking outside, back) goes back to
  // exactly where you were.
  if (window.__tbTitlePopup) return;
  window.__tbTitlePopup = true;

  var html = document.documentElement;
  var enabled = false;      // the setting is on for this user
  var under = null;         // the page you opened the title from (kept on screen behind the panel)
  var underY = 0;           // where that page was scrolled to
  var pressY = null;        // where the page was when you pressed (taken before the browser can move it)

  var css =
    // the page behind stays where it was, frozen and not clickable
    "html:is(.tb-tmodal,.tb-tmodal-closing) .page.tb-under{display:block!important;position:fixed!important;left:0;right:0;top:var(--tb-under-top,0px);pointer-events:none!important;visibility:visible!important;transition:filter .22s ease}" +
    "html.tb-tmodal .page.tb-under{filter:blur(7px) brightness(.62)}" +
    "html.tb-tmodal-closing .page.tb-under{filter:none}" +
    // the panel: your title page, centred, scrolling on its own, everything around it dimmed
    "html:is(.tb-tmodal,.tb-tmodal-closing) #itemDetailPage:not(.hide){position:fixed!important;z-index:1000;top:6vh!important;bottom:6vh!important;" +
    "left:max(24px,calc((100vw - 1100px) / 2))!important;right:max(24px,calc((100vw - 1100px) / 2))!important;width:auto!important;height:auto!important;min-height:0!important;" +
    "overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;border-radius:18px;" +
    "background:var(--sleekfin-background,#0b0b0d)!important;box-shadow:0 30px 90px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.08);" +
    "animation:tbTmodalIn .22s ease-out both;scrollbar-width:thin}" +
    "@keyframes tbTmodalIn{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}" +
    "html.tb-tmodal-closing #itemDetailPage:not(.hide){animation:tbTmodalOut .18s ease-in both;pointer-events:none}" +
    "@keyframes tbTmodalOut{to{opacity:0;transform:translateY(14px) scale(.985)}}" +
    // sizes inside the panel: a shorter banner, no room kept for the top bar
    "html.tb-tmodal #itemDetailPage[data-sleekfin-details],html.tb-tmodal #itemDetailPage[data-sleekfin-details]>*{" +
    "--sleekfin-details-hero-height:min(66vh,620px)!important;--sleekfin-page-gutter:48px!important;--sleekfin-header-height:0px!important}" +
    "html.tb-tmodal #itemDetailPage .sleekfin-details-hero{padding-top:48px!important}" +
    // the top bar steps aside while the panel is open
    "html.tb-tmodal :is(header.MuiAppBar-root,.skinHeader){opacity:0!important;pointer-events:none!important;transition:opacity .2s}" +
    // close button
    "#tb-tmodal-close{position:fixed;z-index:1001;top:calc(6vh + 16px);right:calc(max(24px,calc((100vw - 1100px) / 2)) + 16px);width:40px;height:40px;" +
    "border-radius:50%;border:0;display:none;align-items:center;justify-content:center;cursor:pointer;color:#fff;" +
    "background:rgba(20,20,24,.72);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 0 0 1px rgba(255,255,255,.14)}" +
    "#tb-tmodal-close:hover{background:rgba(40,40,46,.9)}" +
    "html.tb-tmodal #tb-tmodal-close{display:flex}" +
    // phones: the panel fills the screen
    "@media (max-width:700px){html.tb-tmodal #itemDetailPage:not(.hide){top:0!important;bottom:0!important;left:0!important;right:0!important;border-radius:0;box-shadow:none}" +
    "html.tb-tmodal #itemDetailPage[data-sleekfin-details],html.tb-tmodal #itemDetailPage[data-sleekfin-details]>*{--sleekfin-page-gutter:20px!important}" +
    "#tb-tmodal-close{top:14px;right:14px}}";

  function isDetail(h) { return /^#!?\/?details\b/i.test(h || ""); }
  function visiblePage() {
    var ps = document.querySelectorAll(".page:not(.hide)");
    for (var i = ps.length - 1; i >= 0; i--) if (!ps[i].closest(".hide") && ps[i].id !== "videoOsdPage") return ps[i];
    return null;
  }
  function scrolled() { var e = document.scrollingElement || document.documentElement; return Math.max(window.pageYOffset || 0, e ? e.scrollTop : 0); }

  function closeBtn() {
    var b = document.getElementById("tb-tmodal-close");
    if (b) return b;
    b = document.createElement("button");
    b.id = "tb-tmodal-close";
    b.type = "button";
    b.setAttribute("aria-label", "Close");
    b.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); close(); });
    document.body.appendChild(b);
    return b;
  }

  function close() {
    if (!html.classList.contains("tb-tmodal")) return;
    // back to where you came from; opened straight from a link (nothing behind): home
    if (under && under.isConnected && history.length > 1) history.back();
    else location.hash = "#/home";
  }

  function enter() {
    var p = visiblePage();
    // keep the page you came from behind the panel (not another title, not the player)
    if (p && p.id !== "itemDetailPage") {
      if (under && under !== p) release(false);
      under = p;
      underY = pressY !== null ? pressY : scrolled();
      under.style.setProperty("--tb-under-top", -underY + "px");
      under.classList.add("tb-under");
    }
    html.classList.add("tb-tmodal");
    closeBtn();
    // a new title opened from inside the panel starts at its top
    var d = document.getElementById("itemDetailPage");
    if (d) d.scrollTop = 0;
  }

  function release(restore) {
    if (!under) return;
    under.classList.remove("tb-under");
    under.style.removeProperty("--tb-under-top");
    under = null;
    if (restore) { try { window.scrollTo({ top: underY, left: 0, behavior: "instant" }); } catch (e) { window.scrollTo(0, underY); } }
  }

  var closeTimer = 0;
  function leave() {
    html.classList.remove("tb-tmodal");
    if (!under) return;
    // the panel slides away and the page behind sharpens, staying exactly where it was while Jellyfin swaps pages
    // back (it would otherwise blink: the title page full-size for a frame, or an empty frame)
    html.classList.add("tb-tmodal-closing");
    var u = under, t0 = Date.now();
    clearTimeout(closeTimer);
    (function wait() {
      var vp = visiblePage(), back = !u.classList.contains("hide"), elsewhere = !!vp && vp !== u && vp.id !== "itemDetailPage";
      if (back || elsewhere || Date.now() - t0 > 1500 || html.classList.contains("tb-tmodal")) {
        if (!html.classList.contains("tb-tmodal")) release(back);
        html.classList.remove("tb-tmodal-closing");
        return;
      }
      closeTimer = setTimeout(wait, 16);
    })();
  }

  function sync() {
    if (!enabled) return;
    var detail = isDetail(location.hash);
    if (detail) enter();
    else if (html.classList.contains("tb-tmodal")) leave();
    // going to the player keeps the page behind remembered (coming back from playback reopens the panel over it)
  }

  // Esc and clicks outside the panel close it (never while a menu or dialog is open)
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !html.classList.contains("tb-tmodal")) return;
    if (document.querySelector(".dialogContainer .dialog, .actionSheet, [role='dialog']:not([aria-hidden='true'])")) return;
    e.preventDefault();
    close();
  }, true);
  window.addEventListener("click", function (e) {
    if (!enabled || html.classList.contains("tb-tmodal") || e.button !== 0) return;
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var a = t.closest("a[href]"), card = t.closest(".card[data-id]");
    var toTitle = (a && /details\?/i.test(a.getAttribute("href") || "")) ||
      (card && !/^(CollectionFolder|UserView|Folder|Person|Genre|Studio)$/.test(card.getAttribute("data-type") || ""));
    if (!toTitle) return;
    window.__tbPopupNav = true;
    setTimeout(function () { window.__tbPopupNav = false; }, 800);
  }, true);
  document.addEventListener("click", function (e) {
    if (!html.classList.contains("tb-tmodal") || e.button !== 0) return;
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("#itemDetailPage, #tb-tmodal-close, .dialogContainer, .actionSheet, [role='dialog'], [role='menu'], .MuiPopover-root, .MuiMenu-root")) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }, true);

  // the position is taken the moment you press, because changing the address can move the page before we hear about it
  ["pointerdown", "keydown"].forEach(function (t) {
    window.addEventListener(t, function () { if (!html.classList.contains("tb-tmodal")) pressY = scrolled(); }, { capture: true, passive: true });
  });
  window.addEventListener("hashchange", sync, true);
  window.addEventListener("popstate", sync, true);
  // Jellyfin opens pages with history.pushState, which fires no event: hear about those too (the old page is
  // still on screen at that moment, which is the one kept behind the panel)
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    if (typeof orig !== "function") return;
    history[m] = function () {
      var r = orig.apply(this, arguments);
      try { sync(); } catch (e) {}
      return r;
    };
  });

  function start(on) {
    if (!on) return;
    enabled = true;
    html.classList.add("tb-tmodal-on");
    var st = document.createElement("style");
    st.id = "tb-tmodal-css";
    st.textContent = css;
    document.head.appendChild(st);
    sync();
  }
  // Everyone: straight away. Admins only: once we know you're an admin.
  var lvl = parseInt((window.TB_CONFIG || {}).TitlePopup, 10) || 0;
  if (lvl >= 2) start(true);
  else if (lvl === 1) {
    var tries = 0;
    (function ask() {
      if (window.tbFeat && window.ApiClient && window.ApiClient.getCurrentUserId && window.ApiClient.getCurrentUserId()) window.tbFeat("TitlePopup").then(start);
      else if (++tries < 40) setTimeout(ask, 250);
    })();
  }
})();

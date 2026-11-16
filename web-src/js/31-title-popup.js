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
    "html.tb-tmodal .page.tb-under{display:block!important;position:fixed!important;left:0;right:0;top:var(--tb-under-top,0px);pointer-events:none!important;visibility:visible!important}" +
    // the panel: your title page, centred, scrolling on its own, everything around it dimmed
    "html.tb-tmodal #itemDetailPage:not(.hide){position:fixed!important;z-index:1000;top:28px;bottom:0;" +
    "left:max(16px,calc((100vw - 1180px) / 2));right:max(16px,calc((100vw - 1180px) / 2));" +
    "overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;border-radius:var(--sleekfin-radius,12px) var(--sleekfin-radius,12px) 0 0;" +
    "background:var(--sleekfin-background,#0b0b0d)!important;box-shadow:0 0 0 100vmax rgba(0,0,0,.72),0 24px 80px rgba(0,0,0,.6);" +
    "animation:tbTmodalIn .22s ease-out both;scrollbar-width:thin}" +
    "@keyframes tbTmodalIn{from{opacity:0;transform:translateY(18px) scale(.985)}to{opacity:1;transform:none}}" +
    // sizes inside the panel: a shorter banner, no room kept for the top bar
    "html.tb-tmodal #itemDetailPage[data-sleekfin-details],html.tb-tmodal #itemDetailPage[data-sleekfin-details]>*{" +
    "--sleekfin-details-hero-height:min(66vh,620px)!important;--sleekfin-page-gutter:48px!important;--sleekfin-header-height:0px!important}" +
    "html.tb-tmodal #itemDetailPage .sleekfin-details-hero{padding-top:48px!important}" +
    // the top bar steps aside while the panel is open
    "html.tb-tmodal :is(header.MuiAppBar-root,.skinHeader){opacity:0!important;pointer-events:none!important;transition:opacity .2s}" +
    // close button
    "#tb-tmodal-close{position:fixed;z-index:1001;top:44px;right:calc(max(16px,calc((100vw - 1180px) / 2)) + 16px);width:40px;height:40px;" +
    "border-radius:50%;border:0;display:none;align-items:center;justify-content:center;cursor:pointer;color:#fff;" +
    "background:rgba(20,20,24,.72);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);box-shadow:0 0 0 1px rgba(255,255,255,.14)}" +
    "#tb-tmodal-close:hover{background:rgba(40,40,46,.9)}" +
    "html.tb-tmodal #tb-tmodal-close{display:flex}" +
    // phones: the panel fills the screen
    "@media (max-width:700px){html.tb-tmodal #itemDetailPage:not(.hide){top:0;left:0;right:0;border-radius:0;box-shadow:none}" +
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

  function leave() {
    html.classList.remove("tb-tmodal");
    // going back to the page that was behind: it's exactly where you left it
    release(true);
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

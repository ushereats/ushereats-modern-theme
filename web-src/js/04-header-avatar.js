(function headerAvatar() {
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
  var ID = "tb-header-avatar";
  var currentKey = "";
  var imgUrl = null;
  var initial = "";        // fallback when the user has no profile picture
  var tint = "#444";
  var busy = false;

  var style = document.createElement("style");
  style.textContent = [
    "#" + ID + " {",
    "  position: absolute;",
    "  top: calc(var(--sleekfin-header-bar-top, 20px) + 2px);",
    "  right: var(--sleekfin-page-gutter, 24px);",
    "  width: 36px; height: 36px;",
    "  border-radius: 8px;",
    "  overflow: hidden;",
    "  pointer-events: auto;",
    "  cursor: pointer;",
    "  z-index: 4;",
    "  box-shadow: 0 4px 14px -4px rgba(0,0,0,0.6);",
    "  transition: transform 180ms ease, box-shadow 180ms ease;",
    "}",
    "#" + ID + " { padding: 0; margin: 0; border: 0; background: none; -webkit-appearance: none; appearance: none; }",
    "#" + ID + ":hover { transform: scale(1.06); box-shadow: 0 6px 18px -4px rgba(0,0,0,0.75); }",
    // Visible focus ring for TV / keyboard navigation
    "#" + ID + ":focus-visible, #" + ID + ".show-focus:focus, .layout-tv #" + ID + ":focus {",
    "  outline: 3px solid #fff; outline-offset: 3px; transform: scale(1.08);",
    "}",
    "#" + ID + " img { width: 100%; height: 100%; object-fit: cover; display: block; }",
    "#" + ID + " .tb-av-initial {",
    "  width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;",
    "  color: #fff; font-family: var(--app-font, Inter, sans-serif);",
    "  font-size: 16px; font-weight: 700; line-height: 1; text-transform: uppercase;",
    "}",
    // Phones/tablets: keep it (it's the easy way into the user menu), just smaller
    "@media (max-width: 899px) { #" + ID + " { width: 32px; height: 32px; top: calc(env(safe-area-inset-top) + 16px); right: 16px; } }",
    // Hide while a video is playing
    "body:has(.videoPlayerContainer:not(.hide)) #" + ID + ",",
    "body:has(#videoOsdPage:not(.hide)) #" + ID + " { display: none !important; }"
  ].join("\n");
  document.head.appendChild(style);

  function getHeader() {
    return document.querySelector("[data-sleekfin-header]");
  }

  function isVideoPage() {
    return /^#\/?video/i.test(location.hash);
  }

  function remove() {
    var el = document.getElementById(ID);
    if (el) el.remove();
  }

  function render() {
    var header = getHeader();
    if (!header || !(imgUrl || initial) || isVideoPage()) { remove(); return; }
    var mode = imgUrl ? "img:" + imgUrl : "txt:" + initial + tint;
    var el = document.getElementById(ID);
    if (el && el.parentElement === header && el.dataset.mode === mode) return;
    remove();
    // Real <button> + Jellyfin's "focusable" class so TV remotes/controllers can reach it
    el = document.createElement("button");
    el.id = ID;
    el.type = "button";
    el.className = "focusable";
    el.setAttribute("aria-label", "User menu");
    el.title = "Profile";
    // A real button already turns Enter / A-button / Space into a click
    el.addEventListener("click", openUserMenu);
    el.dataset.mode = mode;
    if (imgUrl) {
      var img = document.createElement("img");
      img.alt = "";
      img.src = imgUrl;
      // Broken image -> fall back to the initial
      img.onerror = function () { imgUrl = null; render(); };
      el.appendChild(img);
    } else {
      var span = document.createElement("span");
      span.className = "tb-av-initial";
      span.textContent = initial;
      el.style.background = tint;
      el.appendChild(span);
    }
    header.appendChild(el);
  }

  // Find Jellyfin's real user-menu button (the small avatar in the pill)
  function findUserMenuButton() {
    var selectors = [
      "[data-sleekfin-header-profile] button",
      "[data-sleekfin-header-profile] a",
      "[data-sleekfin-header-profile]",
      "button[aria-controls='app-user-menu']",
      "button[aria-label='User Menu']",
      ".headerUserButton"
    ];
    for (var i = 0; i < selectors.length; i++) {
      var b = document.querySelector(selectors[i]);
      if (b && b.id !== ID) return b;
    }
    return null;
  }

  // Move the opened menu so it drops down under our avatar
  function repositionMenu(tries) {
    var avatar = document.getElementById(ID);
    var papers = document.querySelectorAll(".MuiPopover-root .MuiPaper-root, .MuiMenu-root .MuiPaper-root, .actionSheet");
    var paper = papers[papers.length - 1];
    if (!avatar || !paper || !paper.offsetWidth) {
      if (tries > 0) requestAnimationFrame(function () { repositionMenu(tries - 1); });
      return;
    }
    var r = avatar.getBoundingClientRect();
    var left = Math.max(8, r.right - paper.offsetWidth);
    paper.style.setProperty("left", left + "px", "important");
    paper.style.setProperty("top", (r.bottom + 8) + "px", "important");
    paper.style.setProperty("transform-origin", "top right", "important");
  }

  function openUserMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    var btn = findUserMenuButton();
    if (btn) {
      btn.click();
      requestAnimationFrame(function () { repositionMenu(30); });
    } else {
      location.hash = "#/mypreferencesmenu";
    }
  }

  // Stable, muted colour per user name
  function colorFor(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return "hsl(" + (h % 360) + ", 45%, 38%)";
  }

  // Letter/number test. Unicode-aware where supported; simple fallback on old TV browsers
  var LETTER = (function () {
    try { return new RegExp("[\\p{L}\\p{N}]", "u"); }
    catch (e) { return /[0-9A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u06FF\u0900-\u0DFF\u3040-\u30FF\u3400-\u9FFF\uAC00-\uD7AF]/; }
  })();

  function refreshUser() {
    if (busy || !window.ApiClient) return;
    var userId = ApiClient.getCurrentUserId && ApiClient.getCurrentUserId();
    if (!userId) { imgUrl = null; initial = ""; currentKey = ""; remove(); return; }
    busy = true;
    Promise.resolve(ApiClient.getUser(userId)).then(function (user) {
      var tag = user && user.PrimaryImageTag;
      var name = (user && user.Name) || "";
      var key = userId + ":" + (tag || "") + ":" + name;
      if (key !== currentKey) {
        currentKey = key;
        imgUrl = tag
          ? ApiClient.getUrl("Users/" + userId + "/Images/Primary", { tag: tag, quality: 90, maxHeight: 96 })
          : null;
        // First letter/number of the name (handles emoji & non-Latin names)
        var m = Array.from(name.trim()).find(function (ch) { return LETTER.test(ch); });
        initial = m || "?";
        tint = colorFor(name || userId);
      }
    }).catch(function () {
      imgUrl = null;
    }).then(function () {
      busy = false;
      render();
    });
  }

  // The app can be ready before login finishes (common on iPhone) -> keep trying
  // every 0.5 s until a user is found, for up to a minute.
  var tries = 0;
  var poll = setInterval(function () {
    tries++;
    if (currentKey || tries > 120) { clearInterval(poll); return; }
    if (window.ApiClient) refreshUser();
  }, 500);
  var lastRetry = 0;
  function retryIfMissing() {
    if (currentKey || busy || !window.ApiClient) return;
    var now = Date.now();
    if (now - lastRetry < 1500) return;
    lastRetry = now;
    refreshUser();
  }

  // Header can re-render; re-attach if it does
  var queued = false;
  var obs = function () {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      if (isVideoPage()) { remove(); return; }
      if (!currentKey) { retryIfMissing(); return; }
      if ((imgUrl || initial) && !document.getElementById(ID)) render();
    });
  };
  tbWatch(obs);

  // Pick up user switches / new profile pictures
  window.addEventListener("hashchange", refreshUser);
  // Coming back to the app on iPhone (resume / back-forward cache)
  window.addEventListener("pageshow", function () { currentKey = ""; refreshUser(); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") refreshUser();
  });
})();

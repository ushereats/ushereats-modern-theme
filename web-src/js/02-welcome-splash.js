(function welcomeSplash(SOUND_DATA) {
  // Once per browser session after you're signed in:
  // gold light bloom, your icon, "GOOD EVENING", your name with a light sweep, then a soft exit.
  // The startup sound fades out with the splash (trimmed to the part you actually hear).

  // ── Settings ──
  var SOUND_SRC = SOUND_DATA;  // startup sound (embedded below). Or set a direct .mp3 link here instead.
  var VOLUME = tbCfg("SplashVolume", 0.5);            // 0 to 1
  var SOUND_FADE_S = 1.5;      // sound fades out over N seconds, starting when the splash fades
  var SPLASH_MS = 2500;        // total splash time, including its fade-out (original timing)
  var EXIT_MS = 750;           // the splash's own fade-out
  var RESPECT_REDUCE_MOTION = false;  // true = no animation when the device has "reduce motion" / Windows animations off

  if (window.__tbSplash) return;
  window.__tbSplash = true;
  var seen = false;
  try { seen = !!sessionStorage.getItem("jf-welcomed"); } catch (e) {}
  if (seen) return;

  // ── Sound (loaded straight away so it starts instantly) ──
  var audio = null;
  if (SOUND_SRC) {
    try { audio = new Audio(); audio.preload = "auto"; audio.src = SOUND_SRC; audio.load(); } catch (e) { audio = null; }
  }
  function playSound() {
    var a = audio;
    if (!a) return;
    a.volume = VOLUME;
    // fade out together with the splash, then stop
    setTimeout(function () {
      var start = Date.now(), from = a.volume, ms = SOUND_FADE_S * 1000;
      (function step() {
        var t = Math.min(1, (Date.now() - start) / ms);
        a.volume = Math.max(0, from * (1 - t));
        if (t < 1) requestAnimationFrame(step); else { a.pause(); }
      })();
    }, Math.max(0, SPLASH_MS - EXIT_MS));
    var started = false;
    function tryPlay() {
      if (started) return;
      var p = a.play();
      if (p && p.then) {
        p.then(function () { started = true; cleanup(); }).catch(function () {
          console.info("[Welcome splash] Browser blocked the sound until you click or press a key.");
        });
      } else { started = true; }
    }
    // blocked? play on the first click / key / tap while the splash is still up
    var evs = ["pointerdown", "keydown", "touchstart"];
    function onGesture() { tryPlay(); }
    function cleanup() { evs.forEach(function (ev) { document.removeEventListener(ev, onGesture, true); }); }
    evs.forEach(function (ev) { document.addEventListener(ev, onGesture, true); });
    setTimeout(cleanup, SPLASH_MS);
    tryPlay();
  }

  // ── Splash ──
  function iconUrl() {
    var l = document.querySelector('link[rel="apple-touch-icon"]') || document.querySelector('link[rel~="icon"]');
    var h = l && l.getAttribute("href");
    return h && !/favicon\.ico$/i.test(h) ? h : null;
  }

  function showSplash(name) {
    var h = new Date().getHours();
    var g = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    var ACC = "var(--sleekfin-accent, rgb(232, 192, 80))";
    var TITLE = "var(--title-font, 'Bebas Neue', sans-serif)";
    
    var style = document.createElement("style");
    style.textContent = [
      "#tb-splash { position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 999999; pointer-events: none;",
      "  overflow: hidden; background: #040405;",
      "  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;",
      "  transition: opacity " + EXIT_MS + "ms cubic-bezier(.4,0,.2,1), transform " + EXIT_MS + "ms cubic-bezier(.4,0,.2,1); }",
      "#tb-splash.tb-sp-leave { opacity: 0; transform: scale(1.04); }",

      /* gold bloom that swells behind everything */
      "#tb-splash .tb-sp-bloom { position: absolute; left: 50%; top: 50%; width: 120vmax; height: 120vmax;",
      "  margin: -60vmax 0 0 -60vmax; border-radius: 50%;",
      "  background: radial-gradient(closest-side, rgba(var(--tb-accent-rgb, 232, 192, 80), 0.22) 0%, rgba(200,120,40,0.10) 35%, rgba(0,0,0,0) 70%);",
      "  transform: scale(0.2); opacity: 0; animation: tbSpBloom 1.8s cubic-bezier(.2,.8,.2,1) 0s forwards; }",
      "@keyframes tbSpBloom { to { transform: scale(1); opacity: 1; } }",

      /* horizontal light streak */
      "#tb-splash .tb-sp-streak { position: absolute; left: 0; right: 0; top: 50%; height: 2px; margin-top: -1px;",
      "  background: linear-gradient(90deg, rgba(var(--tb-accent-rgb, 232, 192, 80), 0) 0%, rgba(255,230,170,0.9) 50%, rgba(var(--tb-accent-rgb, 232, 192, 80), 0) 100%);",
      "  transform: scaleX(0); opacity: 0; animation: tbSpStreak 1.1s cubic-bezier(.2,.8,.2,1) 0.15s forwards; }",
      "@keyframes tbSpStreak { 0% { transform: scaleX(0); opacity: 0; } 40% { opacity: 1; } 100% { transform: scaleX(1); opacity: 0; } }",

      "#tb-splash .tb-sp-inner { position: relative; display: flex; flex-direction: column; align-items: center; }",
      "#tb-splash .tb-sp-icon { width: 76px; height: 76px; object-fit: contain; margin-bottom: 26px;",
      "  filter: drop-shadow(0 6px 24px rgba(var(--tb-accent-rgb, 232, 192, 80), 0.35));",
      "  opacity: 0; transform: scale(0.7); animation: tbSpPop 0.7s cubic-bezier(.2,1.2,.3,1) 0.1s forwards; }",
      "@keyframes tbSpPop { to { opacity: 1; transform: scale(1); } }",
      "#tb-splash .tb-sp-greet { font-family: " + TITLE + "; font-size: 22px; letter-spacing: 0.42em; padding-left: 0.42em;",
      "  color: " + ACC + "; opacity: 0; animation: tbSpUp 0.6s cubic-bezier(.2,.8,.2,1) 0.25s forwards; }",
      "#tb-splash .tb-sp-name { font-family: " + TITLE + "; font-size: 112px; line-height: 0.95; letter-spacing: 0.02em;",
      "  margin-top: 10px; max-width: 90vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
      /* white text with a gold light sweeping through it */
      "  color: #fff;",
      "  background: linear-gradient(100deg, #fff 0%, #fff 40%, rgba(255,226,150,1) 50%, #fff 60%, #fff 100%);",
      "  background-size: 250% 100%; background-position: 100% 0;",
      "  -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent;",
      "  opacity: 0; animation: tbSpUp 0.7s cubic-bezier(.2,.8,.2,1) 0.35s forwards, tbSpShine 1.1s ease-in-out 0.7s forwards; }",
      "@keyframes tbSpUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }",
      "@keyframes tbSpShine { to { background-position: 0 0; } }",
      "#tb-splash .tb-sp-line { width: 140px; height: 2px; margin-top: 22px; background: " + ACC + ";",
      "  transform: scaleX(0); animation: tbSpLine 0.8s cubic-bezier(.2,.8,.2,1) 0.6s forwards; }",
      "@keyframes tbSpLine { to { transform: scaleX(1); } }",
      "@media (max-width: 600px) {",
      "  #tb-splash .tb-sp-name { font-size: 68px; }",
      "  #tb-splash .tb-sp-greet { font-size: 16px; }",
      "  #tb-splash .tb-sp-icon { width: 56px; height: 56px; margin-bottom: 18px; }",
      "}",
      /* Only when RESPECT_REDUCE_MOTION is true: no movement for "reduce motion" devices */
      (RESPECT_REDUCE_MOTION ? [
        "@media (prefers-reduced-motion: reduce) {",
        "  #tb-splash * { animation: none !important; opacity: 1 !important; transform: none !important; }",
        "  #tb-splash .tb-sp-streak { display: none; }",
        "  #tb-splash .tb-sp-name { -webkit-text-fill-color: #fff; }",
        "}"].join("\n") : "")
    ].join("\n");
    document.head.appendChild(style);

    var overlay = document.createElement("div");
    overlay.id = "tb-splash";
    var bloom = document.createElement("div"); bloom.className = "tb-sp-bloom";
    var streak = document.createElement("div"); streak.className = "tb-sp-streak";
    var inner = document.createElement("div"); inner.className = "tb-sp-inner";
    var ic = iconUrl();
    if (ic) {
      var img = document.createElement("img");
      img.className = "tb-sp-icon"; img.alt = ""; img.src = ic;
      img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); };
      inner.appendChild(img);
    }
    var greet = document.createElement("div"); greet.className = "tb-sp-greet"; greet.textContent = g;
    var who = document.createElement("div"); who.className = "tb-sp-name"; who.textContent = name;
    var line = document.createElement("div"); line.className = "tb-sp-line";
    inner.appendChild(greet); inner.appendChild(who); inner.appendChild(line);
    overlay.appendChild(bloom); overlay.appendChild(streak); overlay.appendChild(inner);
    document.body.appendChild(overlay);

    setTimeout(function () { overlay.classList.add("tb-sp-leave"); }, Math.max(0, SPLASH_MS - EXIT_MS));
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      if (style.parentNode) style.parentNode.removeChild(style);
    }, SPLASH_MS + 100);
  }

  // ── Black cover straight away, so the site never flashes before the splash ──
  var cover = document.createElement("div");
  cover.id = "tb-splash-cover";
  cover.style.cssText = "position:fixed;top:0;right:0;bottom:0;left:0;z-index:999998;background:#040405;pointer-events:none;transition:opacity 250ms ease;";
  (document.body || document.documentElement).appendChild(cover);
  function dropCover(fade) {
    // the plugin also paints an instant black cover from the page head (html.tb-cover)
    var root = document.documentElement;
    if (root.classList.contains("tb-cover")) {
      if (fade) { root.classList.add("tb-cover-out"); setTimeout(function () { root.classList.remove("tb-cover", "tb-cover-out"); }, 300); }
      else root.classList.remove("tb-cover", "tb-cover-out");
    }
    if (!cover || !cover.parentNode) return;
    if (fade) {
      cover.style.opacity = "0";
      setTimeout(function () { if (cover.parentNode) cover.parentNode.removeChild(cover); }, 300);
    } else {
      cover.parentNode.removeChild(cover);
    }
  }
  setTimeout(function () { dropCover(true); }, 4000);   // safety: never block the site for long

  function loginVisible() {
    var lp = document.getElementById("loginPage");
    return !!(lp && !lp.classList.contains("hide"));
  }

  // ── Wait until someone is actually signed in (so it also plays right after the sign-in page) ──
  var tries = 0;
  var check = setInterval(function () {
    if (++tries > 6000) { clearInterval(check); dropCover(true); return; }   // give up after ~5 minutes
    if (loginVisible()) { dropCover(true); return; }                          // signed out: show the sign-in page
    if (!window.ApiClient) return;
    var uid = null;
    try { uid = ApiClient.getCurrentUserId(); } catch (e) {}
    if (!uid) { if (tries > 30) dropCover(true); return; }
    clearInterval(check);
    Promise.resolve(ApiClient.getCurrentUser()).then(function (user) {
      if (!user) { dropCover(true); return; }
      try { sessionStorage.setItem("jf-welcomed", "1"); } catch (e) {}
      showSplash(user.Name || "there");
      playSound();
      setTimeout(function () { dropCover(false); }, 50);   // the splash is on top now
    }).catch(function () { dropCover(true); });
  }, 50);
})(
  // "Musical startup sound variation 6" from Pixabay (Pixabay Content License): served by the plugin as splash.mp3
  tbCfg("SplashSound", true) ? "__TB_MP3__" : ""
);

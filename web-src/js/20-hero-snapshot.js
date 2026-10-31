(function heroSnapshot() {
  // Hero snapshot: remembers the home hero (image + where it sits) so the next page load can show it
  // on the very first frame. The plugin paints it from the page head and starts downloading the image
  // straight away; this script saves it and hands over to SleekFin's real hero once that is showing.
  var KEY = "tbHeroSnap";
  var FADE = tbCfg("HeroFade", true);
  var root = document.documentElement;
  var saved = false;
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

  function isHome() {
    var h = location.hash;
    return h === "" || h === "#" || /^#\/?home(\.html)?([?#]|$)/i.test(h);
  }

  function drop(fade) {
    if (!root.classList.contains("tb-hs")) return;
    if (fade) {
      root.classList.add("tb-hs-out");
      setTimeout(function () { root.classList.remove("tb-hs", "tb-hs-out"); }, 320);
    } else {
      root.classList.remove("tb-hs", "tb-hs-out");
    }
  }

  function check() {
    if (!isHome()) { drop(false); return; }
    var hero = document.querySelector("#indexPage:not(.hide) .sleekfin-hero");
    if (!hero || hero.closest(".hide")) return;
    var img = hero.querySelector('.sleekfin-hero-slide[data-active="true"] img.sleekfin-hero-backdrop') ||
              hero.querySelector("img.sleekfin-hero-backdrop");
    if (!img || !img.complete || !img.naturalWidth) return;

    // SleekFin's real hero is on screen: hand over on the next frame
    requestAnimationFrame(function () { drop(FADE); });

    // remember the FIRST slide shown on this load (that's the one the next load starts with)
    if (saved) return;
    saved = true;
    var r = hero.getBoundingClientRect();   // measured once per page load
    if (r.width < 200 || r.height < 120) return;
    var snap = {
      src: img.currentSrc || img.src,
      t: Math.round(r.top + (window.scrollY || 0)), l: Math.round(r.left),
      w: Math.round(r.width), h: Math.round(r.height),
      vw: window.innerWidth, vh: window.innerHeight
    };
    try { localStorage.setItem(KEY, JSON.stringify(snap)); } catch (e) {}
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; check(); }, 80);
  }
  tbWatch(schedule);
  // image load events don't bubble, but they can be caught on the way down
  document.addEventListener("load", function (e) {
    var t = e.target;
    if (t && t.classList && t.classList.contains("sleekfin-hero-backdrop")) schedule();
  }, true);
  window.addEventListener("hashchange", schedule);
  schedule();
})();

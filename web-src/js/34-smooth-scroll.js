(function tbSmoothScroll() {
  // Smooth scrolling (setting: Features > Scrolling). Mouse wheel only: each notch glides and eases to a stop
  // instead of jumping. Touchpads, touch screens, keyboards, the scrollbar and TVs keep the browser's own
  // scrolling. Optional extras while moving: rows lean slightly with the speed, and a light motion blur.
  if (window.__tbSmooth) return;
  window.__tbSmooth = true;
  var html = document.documentElement;
  if (!window.tbFeat) return;
  window.tbFeat("SmoothScroll").then(function (on) { if (on) start(); });

  function start() {
    var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var mouse = window.matchMedia ? matchMedia("(pointer: fine)").matches : true;
    if (reduce || !mouse) return;
    var STRETCH = tbCfg("ScrollStretch", true) !== false;
    var BLUR = tbCfg("ScrollBlur", false) === true;
    var EASE = 0.12;          // share of the remaining distance covered per frame (60 fps); lower = longer glide
    var STEP = 1.15;          // distance per wheel notch, relative to the browser's own

    var el = null, y = 0, target = 0, lastSet = -1, raf = 0, lastT = 0, vel = 0, doc = null;
    function scrollingDoc() { return document.scrollingElement || html; }

    // the wheel: is it a mouse wheel (notches), not a touchpad (a stream of small precise steps)?
    function isNotch(e) {
      if (e.deltaMode === 1 || e.deltaMode === 2) return true;
      var w = e.wheelDeltaY;
      if (w == null || w === 0) return false;
      return Math.abs(w) % 120 === 0 && Math.abs(e.deltaY) >= 40;
    }
    function distance(e) {
      var d = e.deltaY;
      if (e.deltaMode === 1) d *= 40;
      else if (e.deltaMode === 2) d *= window.innerHeight * 0.9;
      return d * STEP;
    }
    function maxOf(s) { return s === doc ? s.scrollHeight - window.innerHeight : s.scrollHeight - s.clientHeight; }
    function posOf(s) { return s === el ? target : s.scrollTop; }
    // the nearest thing under the mouse that can scroll further in that direction (the page itself last)
    function scroller(t, dy) {
      for (var n = t; n && n !== document.body && n !== html; n = n.parentElement) {
        if (n.nodeType !== 1) continue;
        if (n.id === "videoOsdPage" || n.tagName === "SELECT" || n.tagName === "TEXTAREA" || n.isContentEditable || (n.tagName === "INPUT" && n.type === "range")) return null;
        if (n.scrollHeight <= n.clientHeight + 1) continue;
        var oy = getComputedStyle(n).overflowY;
        if (oy !== "auto" && oy !== "scroll" && oy !== "overlay") continue;
        var p = posOf(n);
        if (dy > 0 ? p < maxOf(n) - 1 : p > 0) return n;
      }
      var p2 = posOf(doc);
      return (dy > 0 ? p2 < maxOf(doc) - 1 : p2 > 0) ? doc : null;
    }

    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (el) el.style.scrollBehavior = "";
      el = null;
      vel = 0;
      settle();
    }

    function frame(now) {
      raf = 0;
      if (!el || !el.isConnected) { stop(); return; }
      var dt = Math.min(64, now - (lastT || now - 16.7)) || 16.7;
      lastT = now;
      var k = 1 - Math.pow(1 - EASE, dt / 16.7);
      var prev = y;
      y += (target - y) * k;
      if (Math.abs(target - y) < 0.5) y = target;
      lastSet = Math.round(y);
      el.scrollTop = y;
      lastSet = el.scrollTop;
      if (el === doc) { vel = vel * 0.6 + ((y - prev) / dt) * 0.4; effects(); }
      if (y !== target) raf = requestAnimationFrame(frame);
      else { el.style.scrollBehavior = ""; vel = 0; settle(); el = null; }
    }

    window.addEventListener("wheel", function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || !e.deltaY) return;
      if (html.classList.contains("layout-tv") || !isNotch(e)) return;
      doc = scrollingDoc();
      var dy = distance(e), s = scroller(e.target, dy);
      if (!s) return;
      e.preventDefault();
      if (s !== el) {
        if (el) el.style.scrollBehavior = "";
        el = s;
        y = s.scrollTop;
        target = y;
        lastT = 0;
      }
      el.style.scrollBehavior = "auto";   // the page's own smooth setting would fight the glide
      target = Math.max(0, Math.min(maxOf(el), target + dy));
      if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: false });

    // anything else scrolls (keyboard, scrollbar, a jump to the top, a page change): the glide gives way
    window.addEventListener("scroll", function () {
      if (el === doc && Math.abs(doc.scrollTop - lastSet) > 2) stop();
    }, { passive: true });
    document.addEventListener("scroll", function (e) {
      if (el && el !== doc && e.target === el && Math.abs(el.scrollTop - lastSet) > 2) stop();
    }, { capture: true, passive: true });
    ["keydown", "mousedown", "touchstart"].forEach(function (t) { window.addEventListener(t, function () { if (el) stop(); }, { passive: true, capture: true }); });
    ["hashchange", "popstate"].forEach(function (t) { window.addEventListener(t, stop); });
    document.addEventListener("viewshow", stop);

    // ── the extras while the page moves ──
    var moving = false, blurNode = null, lastBlur = -1;
    if (BLUR) {
      var ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", "0"); svg.setAttribute("height", "0");
      svg.setAttribute("aria-hidden", "true");
      svg.style.position = "absolute";
      svg.innerHTML = '<filter id="tb-ss-blur" x="0" y="-10%" width="100%" height="120%"><feGaussianBlur in="SourceGraphic" stdDeviation="0 0"/></filter>';
      document.body.appendChild(svg);
      blurNode = svg.querySelector("feGaussianBlur");
    }
    function effects() {
      var v = vel;   // px per ms; a fast flick is about 3-6
      if (!moving && Math.abs(v) > 0.4) { moving = true; html.classList.add("tb-ss-moving"); }
      if (!moving) return;
      if (STRETCH) html.style.setProperty("--tb-ss-skew", (Math.max(-1.6, Math.min(1.6, -v * 0.35))).toFixed(2) + "deg");
      if (blurNode) {
        var b = Math.round(Math.min(6, Math.max(0, Math.abs(v) - 1) * 1.6) * 2) / 2;   // half-pixel steps
        if (b !== lastBlur) { lastBlur = b; blurNode.setAttribute("stdDeviation", "0 " + b); html.classList.toggle("tb-ss-blur", b > 0); }
      }
      if (Math.abs(v) < 0.08) settle();
    }
    function settle() {
      if (!moving) return;
      moving = false;
      html.classList.remove("tb-ss-moving", "tb-ss-blur");
      html.style.removeProperty("--tb-ss-skew");
      if (blurNode) { blurNode.setAttribute("stdDeviation", "0 0"); lastBlur = -1; }
    }

    var st = document.createElement("style");
    st.id = "tb-ss-style";
    st.textContent =
      (STRETCH ? "html.tb-ss-moving .verticalSection{transform:skewY(var(--tb-ss-skew,0deg));transform-origin:50% 50%;will-change:transform}" : "") +
      (BLUR ? "html.tb-ss-blur .verticalSection .itemsContainer{filter:url(#tb-ss-blur)}" : "");
    (window.tbCss || function (s) { document.head.appendChild(s); })(st);
  }
})();

(function tbPlayLaunch() {
  // Play without a black screen: pressing Play in the title pop-up or on a hover card keeps the title's own
  // picture and logo up (with a thin loading line) until the video's first frame is showing, then fades away.
  // window.tbLaunch({ bg: 'url("…")', logo: "…", title: "…", sub: "S2:E3 · Name" })
  if (window.tbLaunch) return;
  var html = document.documentElement, el = null, on = false, poll = 0, startedAt = 0, gen = 0;

  var esc = window.tbEsc;   // core.js
  function inPlayer() { return /^#!?\/?video/i.test(location.hash); }

  function finish(fast) {
    if (!on) return;
    on = false;
    clearInterval(poll);
    var my = ++gen;
    html.classList.add("tb-launch-out");
    setTimeout(function () {
      if (my !== gen) return;
      html.classList.remove("tb-launch-on", "tb-launch-out");
      if (el) el.innerHTML = "";
    }, fast ? 0 : 420);
  }

  window.tbLaunch = function (art) {
    if (html.classList.contains("layout-tv")) return;
    if (!el) {
      el = document.createElement("div");
      el.id = "tb-launch";
      el.setAttribute("aria-hidden", "true");
      document.body.appendChild(el);
    }
    gen++;
    el.innerHTML = '<div class="tb-launch-bd"' + (art && art.bg && art.bg !== "none" ? ' style="background-image:' + esc(art.bg) + '"' : "") + "></div>" +
      '<div class="tb-launch-in">' +
        (art && art.logo ? '<img class="tb-launch-logo" alt="" decoding="async" src="' + esc(art.logo) + '">' : '<div class="tb-launch-title">' + esc(art && art.title) + "</div>") +
        (art && art.sub ? '<div class="tb-launch-sub">' + esc(art.sub) + "</div>" : "") +
        '<div class="tb-launch-bar"><i></i></div>' +
      "</div>";
    html.classList.remove("tb-launch-out");
    html.classList.add("tb-launch-on");
    on = true;
    startedAt = Date.now();
    clearInterval(poll);
    poll = setInterval(function () {
      if (!on) return clearInterval(poll);
      var t = Date.now() - startedAt;
      // Jellyfin asks something first (resume or start over, a version, an error): get out of its way
      if (document.querySelector(".actionSheet, .dialogContainer .dialog, .toast")) return finish(true);
      if (t > 6000 && !inPlayer()) return finish();   // it never got to the player
      if (t > 25000) return finish();                 // never hang around
    }, 200);
  };

  // the first frame is on screen
  document.addEventListener("playing", function (e) {
    if (on && e.target && e.target.tagName === "VIDEO") finish();
  }, true);
  document.addEventListener("keydown", function (e) { if (on && e.key === "Escape") finish(true); }, true);

  var st = document.createElement("style");
  st.id = "tb-launch-style";
  st.textContent =
    "#tb-launch{display:none;position:fixed;inset:0;z-index:2000;background:#000;opacity:1;transition:opacity .4s ease;pointer-events:none}" +
    "html.tb-launch-on #tb-launch{display:block}" +
    "html.tb-launch-out #tb-launch{opacity:0}" +
    "#tb-launch .tb-launch-bd{position:absolute;inset:0;background:50% 30%/cover no-repeat;transform:scale(1.04);animation:tbLaunchZoom 14s ease-out forwards}" +
    "@keyframes tbLaunchZoom{to{transform:scale(1.12)}}" +
    "#tb-launch .tb-launch-bd::after{content:'';position:absolute;inset:0;background:linear-gradient(0deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,.35) 45%,rgba(0,0,0,.25) 100%)}" +
    "#tb-launch .tb-launch-in{position:absolute;left:6vw;right:6vw;bottom:12vh;display:flex;flex-direction:column;align-items:flex-start;gap:14px}" +
    "#tb-launch .tb-launch-logo{max-width:min(460px,70vw);max-height:22vh;object-fit:contain;object-position:left bottom;filter:drop-shadow(0 4px 18px rgba(0,0,0,.6))}" +
    "#tb-launch .tb-launch-title{font:400 64px/1 var(--title-font,'Bebas Neue',sans-serif);color:#fff;text-shadow:0 4px 18px rgba(0,0,0,.6)}" +
    "#tb-launch .tb-launch-sub{font:600 18px/1.3 var(--app-font,Inter,sans-serif);color:rgba(255,255,255,.88)}" +
    "#tb-launch .tb-launch-bar{position:relative;width:min(320px,60vw);height:3px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden;margin-top:6px}" +
    "#tb-launch .tb-launch-bar i{position:absolute;top:0;bottom:0;width:35%;border-radius:2px;background:var(--ue-accent,#dc2626);animation:tbLaunchBar 1.1s ease-in-out infinite}" +
    "@keyframes tbLaunchBar{from{left:-35%}to{left:100%}}" +
    "@media (prefers-reduced-motion:reduce){#tb-launch .tb-launch-bd{animation:none}}" +
    "@media (max-width:700px){#tb-launch .tb-launch-title{font-size:42px}#tb-launch .tb-launch-sub{font-size:15px}}";
  (window.tbCss || function (s) { document.head.appendChild(s); })(st);
})();

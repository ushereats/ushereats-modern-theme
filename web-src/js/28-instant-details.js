(function instantDetails() {
  // Title pages show their backdrop the moment you click: while the page is still being put together
  // (hidden behind the loading bars), the same backdrop - same picture, same size, same place, same
  // shading - is drawn underneath, so when the real page appears nothing moves or changes: the title,
  // buttons and rows simply fade in on top of a picture that's already there.
  // Only when it can be exact: the picture is known (from the poster you clicked or one already looked up),
  // and a title page has been shown on this screen size before (its look is copied from that one).
  if (window.__tbInstant) return;
  window.__tbInstant = true;
  var html = document.documentElement;
  var KEY = "tb-bd-look";
  var TYPES = /^(Movie|Series|Season|Episode)$/;
  var look = null;
  try { look = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}

  // ── remember exactly how a title page's backdrop looks on this screen ──
  function record() {
    var page = document.querySelector("#itemDetailPage[data-sleekfin-details='true']:not(.hide)");
    var bd = page && page.querySelector("#itemBackdrop");
    var art = bd && bd.querySelector(".sleekfin-details-artwork");
    if (!bd || !art) return;
    var r = bd.getBoundingClientRect(), pg = page.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var c = getComputedStyle(bd), a = getComputedStyle(art), b = getComputedStyle(bd, "::before"), f = getComputedStyle(bd, "::after");
    look = {
      vw: innerWidth, vh: innerHeight, amb: !!tbCfg("AmbientBackground", true),
      left: Math.round(r.left), top: Math.round(r.top - pg.top), width: Math.round(r.width), height: Math.round(r.height),
      mask: c.webkitMaskImage || c.maskImage || "none",
      art: { pos: a.backgroundPosition, size: a.backgroundSize, filter: a.filter, opacity: a.opacity },
      before: { bg: b.backgroundImage, op: b.opacity },
      after: { bg: f.backgroundImage, op: f.opacity, h: f.height }
    };
    try { localStorage.setItem(KEY, JSON.stringify(look)); } catch (e) {}
  }

  // ── the stand-in backdrop ──
  var layer = null, removeTimer = 0;
  function idFromHash() {
    var m = /^#\/?details\?(?:.*&)?id=([0-9a-f]{32})/i.exec(location.hash);
    return m ? m[1] : null;
  }
  function usable() {
    return look && look.vw === innerWidth && look.vh === innerHeight && look.amb === !!tbCfg("AmbientBackground", true);
  }
  function show(url) {
    hide(true);
    var l = document.createElement("div");
    l.id = "tb-instant-bd";
    l.setAttribute("aria-hidden", "true");
    var s = l.style;
    s.cssText = "position:fixed;pointer-events:none;z-index:-1;overflow:hidden;left:" + look.left + "px;top:" + look.top + "px;width:" + look.width + "px;height:" + look.height + "px;";
    if (look.mask && look.mask !== "none") { s.webkitMaskImage = look.mask; s.maskImage = look.mask; }
    var art = document.createElement("div");
    art.style.cssText = "position:absolute;inset:0;background-repeat:no-repeat;background-image:url(\"" + url.replace(/["\\]/g, "") + "\");background-position:" + look.art.pos + ";background-size:" + look.art.size + ";filter:" + look.art.filter + ";opacity:" + look.art.opacity + ";";
    var before = document.createElement("div");
    before.style.cssText = "position:absolute;inset:0;background-image:" + look.before.bg + ";opacity:" + look.before.op + ";";
    var after = document.createElement("div");
    after.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:" + look.after.h + ";background-image:" + look.after.bg + ";opacity:" + look.after.op + ";";
    l.appendChild(art); l.appendChild(before); l.appendChild(after);
    var amb = document.getElementById("tb-ambient");
    if (amb && amb.parentNode === document.body) document.body.insertBefore(l, amb.nextSibling); else document.body.insertBefore(l, document.body.firstChild);
    layer = l;
    html.classList.add("tb-instant");
    clearTimeout(removeTimer);
    removeTimer = setTimeout(function () { hide(); }, 5000);   // never left behind
  }
  function hide(now) {
    clearTimeout(removeTimer);
    if (layer) { layer.remove(); layer = null; }
    if (now !== true) setTimeout(function () { if (!layer) html.classList.remove("tb-instant"); }, 400);
  }

  // only for titles opened by clicking a poster (going Back restores the old page's scroll position instead)
  var clicked = null;
  document.addEventListener("click", function (e) {
    var card = e.target && e.target.closest && e.target.closest(".card[data-id]");
    clicked = card ? { id: card.getAttribute("data-id"), at: Date.now() } : null;
  }, true);

  function onRoute() {
    var id = idFromHash();
    if (!id) { hide(); return; }
    if (!clicked || clicked.id !== id || Date.now() - clicked.at > 1500) return;
    var meta = (window.tbItemMeta || {})[id];
    if (!meta || (meta.Type && !TYPES.test(meta.Type)) || !usable() || !window.tbBackdropUrl) return;
    if (!html.classList.contains("sleekfin-details-concealed")) return;   // already showing (or not a SleekFin page)
    var url = window.tbBackdropUrl(meta);
    if (url) { clicked = null; show(url); }
  }

  // page revealed: the real backdrop is identical and in place, so the stand-in goes in the same frame
  new MutationObserver(function () {
    var concealed = html.classList.contains("sleekfin-details-concealed");
    if (!concealed && layer) hide();
    if (!concealed && html.classList.contains("sleekfin-details-mounted")) requestAnimationFrame(record);
  }).observe(html, { attributes: true, attributeFilter: ["class"] });
  // run right after SleekFin hides the old page for the new route (it does that inside the same navigation)
  // (a microtask: after every other route handler, before the next frame is drawn)
  function soon() { Promise.resolve().then(onRoute); }
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () { var r = orig.apply(this, arguments); soon(); return r; };
  });
  window.addEventListener("popstate", soon);
  window.addEventListener("hashchange", soon);

  // with the picture already there, the page doesn't slide in: only its title, buttons and rows fade in
  var st = document.createElement("style");
  st.textContent = [
    "html.tb-instant #itemDetailPage.sleekfin-details-entering { animation: none !important; }",
    "html.tb-instant #itemDetailPage.sleekfin-details-entering > :not(#itemBackdrop) { animation: tb-instant-in 220ms ease both; }",
    "@keyframes tb-instant-in { from { opacity: 0; } to { opacity: 1; } }"
  ].join("\n");
  (window.tbCss ? window.tbCss(st) : document.head.appendChild(st));
})();

(function tbInstantTitles() {
  // PART 3B: show the top of a title page immediately from cached data (window.tbItemMeta),
  // before SleekFin's bundle finishes building the hero. Feature-gated by InstantTitles.
  if (window.__tbInstantTitles || !window.fetch) return;
  window.__tbInstantTitles = true;

  function featOn() {
    if (document.documentElement.classList.contains("tb-tmodal-on")) return false;   // the title pop-up is on instead
    var v = window.TB_CONFIG && parseInt(window.TB_CONFIG.InstantTitles, 10);
    if (!v || v === 0) return false;
    if (v >= 2) return true;
    // Test override: localStorage tb-force-features = "InstantTitles,..." forces this feature on
    try { var ff = localStorage.getItem("tb-force-features"); if (ff && ff.split(",").indexOf("InstantTitles") >= 0) return true; } catch (x) {}
    // AdminsOnly: use cached admin status (checked async by 25-prefetch.js)
    return !!window.__tbHoverWarmAdmin;
  }

  // Extract item id from the detail route hash
  function detailId(hash) {
    if (!/^#\/?details/i.test(hash)) return null;
    var m = /[?&]id=([0-9a-f]{8,36})/i.exec(hash);
    return m ? m[1].replace(/-/g, "") : null;
  }

  // Build the backdrop image URL the same way 25-prefetch.js does
  function backdropUrl(item) {
    if (window.tbBackdropUrl) return window.tbBackdropUrl(item);
    var api = window.ApiClient;
    if (!api || !item) return null;
    var w = 1920;
    var own = item.BackdropImageTags && item.BackdropImageTags.length;
    var bOwner = own ? (item.BackdropItemId || item.Id) : item.ParentBackdropItemId;
    var bTag = own ? item.BackdropImageTags[0] : (item.ParentBackdropImageTags || [])[0];
    if (!bOwner || !bTag) return null;
    var fmt = /webp/.test(window.__tbImgFmt || "") ? "webp" : "jpg";
    if (api.getScaledImageUrl) return api.getScaledImageUrl(bOwner, { type: "Backdrop", tag: bTag, maxWidth: w, quality: 80, format: fmt, index: 0 });
    return null;
  }

  var overlay = null, hideTimer = 0;

  function removeOverlay() {
    if (!overlay) return;
    overlay.style.opacity = "0";
    var el = overlay;
    setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 350);
    overlay = null;
  }

  function showOverlay(item) {
    if (!featOn() || !item) return;
    var bd = backdropUrl(item);

    // Build overlay element
    var el = document.createElement("div");
    el.id = "tb-instant-title";
    el.setAttribute("aria-hidden", "true");

    var title = item.Name || "";
    var year = item.ProductionYear || "";
    var overview = item.Overview || "";
    if (overview.length > 220) overview = overview.slice(0, 220).replace(/\s\S+$/, "") + "…";

    // Logo image if available, else text title
    var logoHtml = "";
    var api = window.ApiClient;
    if (api && item.ImageTags && item.ImageTags.Logo && api.getScaledImageUrl) {
      var logoUrl = api.getScaledImageUrl(item.Id, { type: "Logo", tag: item.ImageTags.Logo, maxWidth: 400, quality: 90 });
      logoHtml = '<img class="tb-it-logo" src="' + logoUrl + '" alt="' + title.replace(/"/g, "&quot;") + '" decoding="async">';
    } else if (item.ParentLogoItemId && item.ParentLogoImageTag && api && api.getScaledImageUrl) {
      var logoUrl2 = api.getScaledImageUrl(item.ParentLogoItemId, { type: "Logo", tag: item.ParentLogoImageTag, maxWidth: 400, quality: 90 });
      logoHtml = '<img class="tb-it-logo" src="' + logoUrl2 + '" alt="' + title.replace(/"/g, "&quot;") + '" decoding="async">';
    } else {
      logoHtml = '<div class="tb-it-title">' + title.replace(/</g, "&lt;") + '</div>';
    }

    el.innerHTML =
      (bd ? '<div class="tb-it-backdrop" style="background-image:url(' + JSON.stringify(bd) + ')"></div>' : '') +
      '<div class="tb-it-shade"></div>' +
      '<div class="tb-it-content">' +
        logoHtml +
        (year ? '<div class="tb-it-meta">' + year + '</div>' : '') +
        (overview ? '<div class="tb-it-overview">' + overview.replace(/</g, "&lt;") + '</div>' : '') +
      '</div>';

    document.body.appendChild(el);
    overlay = el;

    // Auto-remove once SleekFin mounts (class change on <html>)
    var obs = new MutationObserver(function () {
      if (document.documentElement.classList.contains("sleekfin-details-mounted")) {
        obs.disconnect();
        clearTimeout(hideTimer);
        // small delay so the cross-fade has started
        hideTimer = setTimeout(removeOverlay, 180);
      }
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    // Failsafe: remove after 5s regardless
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { obs.disconnect(); removeOverlay(); }, 5000);
  }

  // On hash change to a details route, show overlay if we have cached item data
  function onNavigate() {
    // Always kill any lingering overlay div immediately — even if overlay ref was already cleared during its fade
    var dead = overlay || document.getElementById("tb-instant-title");
    if (dead && dead.parentNode) dead.parentNode.removeChild(dead);
    clearTimeout(hideTimer);
    overlay = null;
    if (!featOn()) return;
    var id = detailId(location.hash);
    if (!id) return;
    var meta = window.tbItemMeta;
    if (!meta) return;
    // tbItemMeta keys may be full GUIDs (with or without dashes); normalise
    var item = meta[id] || meta[id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, "$1-$2-$3-$4-$5")];
    if (item) showOverlay(item);
  }

  window.addEventListener("hashchange", onNavigate);

  // ── CSS ──
  var st = document.createElement("style");
  st.id = "tb-instant-titles-style";
  st.textContent = [
    "#tb-instant-title{position:fixed;inset:0;z-index:9000;pointer-events:none;transition:opacity 350ms ease}",
    "#tb-instant-title .tb-it-backdrop{position:absolute;inset:0;background-size:cover;background-position:50% 20%;filter:blur(0)}",
    "#tb-instant-title .tb-it-shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,.8) 0%,rgba(0,0,0,.55) 30%,rgba(0,0,0,.2) 60%,transparent 85%),linear-gradient(0deg,rgba(0,0,0,.7) 0%,transparent 50%)}",
    "#tb-instant-title .tb-it-content{position:absolute;bottom:14vh;left:max(24px,var(--sleekfin-page-gutter,24px));max-width:min(560px,calc(100vw - 48px));display:flex;flex-direction:column;gap:12px}",
    "#tb-instant-title .tb-it-logo{max-width:min(360px,70vw);max-height:120px;object-fit:contain;object-position:left center;filter:drop-shadow(0 2px 8px rgba(0,0,0,.7))}",
    "#tb-instant-title .tb-it-title{font-size:clamp(1.6rem,5vw,3rem);font-weight:700;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,.8);line-height:1.1}",
    "#tb-instant-title .tb-it-meta{font-size:.9rem;color:rgba(255,255,255,.75);text-shadow:0 1px 4px rgba(0,0,0,.8)}",
    "#tb-instant-title .tb-it-overview{font-size:.88rem;line-height:1.5;color:rgba(255,255,255,.8);text-shadow:0 1px 4px rgba(0,0,0,.8);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}",
    // Skeleton placeholders below the content (match SleekFin's section heights)
    "#tb-instant-title .tb-it-content::after{content:'';display:block;width:min(480px,80vw);height:52px;background:linear-gradient(rgba(255,255,255,.12) 0 0) 0 0/100% 36px no-repeat,linear-gradient(rgba(255,255,255,.08) 0 0) 0 48px/80% 14px no-repeat;border-radius:4px;margin-top:4px}",
    "@media(max-width:600px){#tb-instant-title .tb-it-content{bottom:12vh}}"
  ].join("\n");
  document.head.appendChild(st);
})();

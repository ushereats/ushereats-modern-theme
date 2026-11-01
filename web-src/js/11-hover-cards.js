(function hoverCard() {
  // Hover look: dimmed poster, white round play button, bold title, "2026 ★ 7.1"
  var INFO_CLASS = "tb-hover-info";
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.94 6.2 6.81.8-5.04 4.66 1.36 6.72L12 17.52l-6.07 3.36 1.36-6.72L2.25 9.5l6.81-.8z"/></svg>';

  var cache = new Map();     // itemId -> { year, rating, name }
  var pending = new Map();   // itemId -> Promise

  function getItemId(card) {
    var id = card.getAttribute("data-id");
    if (id) return id;
    var el = card.querySelector("[data-id]");
    return el ? el.getAttribute("data-id") : null;
  }

  function domTitle(card) {
    var t = card.querySelector(".cardText-first, .cardFooter .cardText, .cardText");
    var s = t && t.textContent.trim();
    if (s) return s;
    var a = card.querySelector(".cardImageContainer[aria-label], [aria-label]");
    return a ? a.getAttribute("aria-label") : "";
  }

  // Title logo: the item's own, else the parent's (episodes -> their show)
  function logoUrl(item) {
    var ownerId = null, tag = null;
    if (item.ImageTags && item.ImageTags.Logo) { ownerId = item.Id; tag = item.ImageTags.Logo; }
    else if (item.ParentLogoItemId && item.ParentLogoImageTag) { ownerId = item.ParentLogoItemId; tag = item.ParentLogoImageTag; }
    if (!ownerId) return null;
    try {
      return ApiClient.getUrl("Items/" + ownerId + "/Images/Logo", { tag: tag, maxWidth: 400, quality: 90 });
    } catch (e) { return null; }
  }

  var WIDE = ".backdropCard, .overflowBackdropCard, .smallBackdropCard, .overflowSmallBackdropCard";

  function fetchInfo(id) {
    if (cache.has(id)) return Promise.resolve(cache.get(id));
    if (pending.has(id)) return pending.get(id);
    var p = ApiClient.getItem(ApiClient.getCurrentUserId(), id).then(function (item) {
      var info = {
        name: item.Name || "",
        type: item.Type,
        year: item.ProductionYear || (item.PremiereDate ? new Date(item.PremiereDate).getUTCFullYear() : null),
        rating: typeof item.CommunityRating === "number" ? item.CommunityRating.toFixed(1) : null,
        ep: item.Type === "Episode" && item.IndexNumber != null
          ? "S" + (item.ParentIndexNumber || 0) + " · E" + item.IndexNumber : null,
        series: item.Type === "Episode" ? item.SeriesName : null,
        logo: logoUrl(item)
      };
      cache.set(id, info);
      pending.delete(id);
      return info;
    }).catch(function () { pending.delete(id); return null; });
    pending.set(id, p);
    return p;
  }

  function render(el, title, info, wide) {
    var name = (info && info.series) || (info && info.name) || title || "";
    var meta = [];
    if (info && info.ep) meta.push("<span>" + info.ep + "</span>");
    else if (info && info.year) meta.push("<span>" + info.year + "</span>");
    if (info && info.rating) meta.push('<span class="tb-hv-rate">' + STAR + info.rating + "</span>");
    var useLogo = !!(wide && info && info.logo);
    var head = useLogo ? '<img class="tb-hv-logo" alt="">' : '<div class="tb-hv-title"></div>';
    var html = head + (meta.length ? '<div class="tb-hv-meta">' + meta.join("") + "</div>" : "");
    var key = html + name + (useLogo ? info.logo : "");
    el.classList.toggle("tb-hv-wide", !!wide);
    if (el.dataset.html !== key) {
      el.innerHTML = html;
      if (useLogo) {
        var img = el.querySelector(".tb-hv-logo");
        img.alt = name;
        // logo failed to load -> fall back to the text title
        img.onerror = function () { info.logo = null; render(el, title, info, wide); };
        img.src = info.logo;
      } else {
        el.querySelector(".tb-hv-title").textContent = name;
      }
      el.dataset.html = key;
    }
  }

  function onEnter(e) {
    var card = e.target.closest && e.target.closest(".card");
    if (!card || card.dataset.tbHover === "off") return;
    if (card.matches(".tb-logo-card, .personCard, [data-type='Person'], [data-type='CollectionFolder'], [data-type='UserView'], [data-type='Folder']")) return;
    var scalable = card.querySelector(".cardScalable");
    if (!scalable) return;
    var el = scalable.querySelector("." + INFO_CLASS);
    if (!el) {
      el = document.createElement("div");
      el.className = INFO_CLASS;
      scalable.appendChild(el);
    }
    var title = domTitle(card);
    var id = getItemId(card);
    var wide = card.matches(WIDE);
    card.classList.toggle("tb-wide-card", wide);
    render(el, title, id && cache.get(id), wide);
    if (id && window.ApiClient && !cache.has(id)) {
      fetchInfo(id).then(function (info) { if (info) render(el, title, info, wide); });
    }
  }

  // Only on devices with a real mouse; phones and TVs keep their normal behaviour
  var canHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (!canHover) return;

  document.addEventListener("pointerover", function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    onEnter(e);
  }, { passive: true });

  var X = ":not(#tb-x)";   // adds ID-level weight so these rules beat SleekFin's
  var H = ".card:not(.personCard):not(.tb-logo-card):not([data-type='Person']):hover";
  var css = [
    "@media (hover: hover) and (pointer: fine) {",

    /* dim layer */
    "  .card .cardScalable::after {",
    "    content: ''; position: absolute; inset: 0; z-index: 3; pointer-events: none;",
    "    background: linear-gradient(180deg, rgba(0,0,0,0.38) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.62) 100%);",
    "    opacity: 0; transition: opacity 180ms ease;",
    "    border-radius: inherit;",
    "  }",
    "  " + H + " .cardScalable::after { opacity: 1; }",
    /* a hover trailer is playing: lighter dim so the video stays visible */
    "  " + H + " .cardScalable:has(iframe, video)::after { opacity: 0.45; }",

    /* Jellyfin overlay: keep only the play button */
    "  " + X + " .card .cardOverlayContainer { background: transparent !important; z-index: 4 !important; }",
    "  " + X + " .card .cardOverlayContainer > :not(.cardOverlayFab-primary):not(.cardOverlayButton-centered):not(a) { display: none !important; }",
    "  " + X + " .card .cardOverlayButton-br, " + X + " .card .cardOverlayButton-hover:not(.cardOverlayFab-primary):not(.cardOverlayButton-centered) { display: none !important; }",

    /* white round play button, nudged up so the text sits under it */
    "  " + X + " .card .cardOverlayContainer > button.cardOverlayFab-primary,",
    "  " + X + " .card button.cardOverlayButton-centered {",
    "    position: absolute !important; left: 50% !important; top: 50% !important;",
    "    width: 54px !important; height: 54px !important;",
    "    margin: -52px 0 0 -27px !important; padding: 0 !important;",
    "    border-radius: 50% !important;",
    "    background: #fff !important; color: #0b0b0b !important;",
    "    border: 0 !important; outline: none !important;",
    "    background-image: none !important;",
    "    -webkit-backdrop-filter: none !important; backdrop-filter: none !important;",
    "    opacity: 1 !important;",
    "    box-shadow: 0 6px 18px -4px rgba(0,0,0,0.55) !important;",
    "    display: flex !important; align-items: center; justify-content: center;",
    "    transition: transform 150ms ease !important;",
    "  }",
    "  " + X + " .card .cardOverlayContainer > button.cardOverlayFab-primary:hover { transform: scale(1.07) !important; background: #fff !important; }",
    "  " + X + " .card :is(.cardOverlayContainer > button.cardOverlayFab-primary, button.cardOverlayButton-centered) > :is(.cardOverlayButtonIcon, .material-icons, .MuiSvgIcon-root, svg) {",
    "    font-size: 32px !important; width: 32px !important; height: 32px !important;",
    "    color: #0b0b0b !important; fill: #0b0b0b !important; margin: 0 0 0 3px !important;",
    "    opacity: 1 !important; background: none !important;",
    "  }",

    /* title + meta */
    "  .card ." + INFO_CLASS + " {",
    "    position: absolute; left: 8px; right: 8px; top: calc(50% + 14px); z-index: 5;",
    "    display: flex; flex-direction: column; align-items: center; gap: 4px;",
    "    text-align: center; color: #fff; pointer-events: none;",
    "    font-family: var(--app-font, Inter, sans-serif);",
    "    opacity: 0; transform: translateY(4px);",
    "    transition: opacity 180ms ease, transform 180ms ease;",
    "  }",
    "  " + H + " ." + INFO_CLASS + " { opacity: 1; transform: none; }",
    "  .tb-hv-title {",
    "    max-width: 100%; font-size: 15px; font-weight: 700; line-height: 1.2; letter-spacing: -0.01em;",
    "    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;",
    "    text-shadow: 0 1px 8px rgba(0,0,0,0.5);",
    "  }",
    "  .tb-hv-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.82); }",
    "  .tb-hv-rate { display: inline-flex; align-items: center; gap: 3px; color: #fff; }",
    "  .tb-hv-rate svg { width: 14px; height: 14px; fill: #f5c518; }",

    /* ── Wide cards (Continue Watching etc.): logo bottom-left, smaller centred play ── */
    "  " + X + " .card.tb-wide-card .cardOverlayContainer > button.cardOverlayFab-primary {",
    "    width: 46px !important; height: 46px !important; margin: -23px 0 0 -23px !important;",
    "  }",
    "  " + X + " .card.tb-wide-card .cardOverlayContainer > button.cardOverlayFab-primary > :is(.cardOverlayButtonIcon, .material-icons, .MuiSvgIcon-root, svg) {",
    "    font-size: 28px !important; width: 28px !important; height: 28px !important;",
    "  }",
    "  .card ." + INFO_CLASS + ".tb-hv-wide {",
    "    top: auto; bottom: 10px; left: 12px; right: auto; max-width: 58%;",
    "    align-items: flex-start; text-align: left; gap: 5px;",
    "  }",
    "  .tb-hv-logo {",
    "    display: block; max-width: 100%; max-height: 42px; width: auto; height: auto;",
    "    object-fit: contain; object-position: left bottom;",
    "    filter: drop-shadow(0 2px 8px rgba(0,0,0,0.6));",
    "  }",
    "  .tb-hv-wide .tb-hv-title { font-size: 14px; }",
    "  .tb-hv-wide .tb-hv-meta { font-size: 12px; }",
    /* darker bottom on wide cards so the logo reads */
    "  " + H + ".tb-wide-card .cardScalable::after {",
    "    background: linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.8) 100%);",
    "  }",

    /* clean top: fade badges/indicators while hovering */
    "  " + H + " :is(.tb-quality, .tb-new-tag, .cardIndicators, .countIndicator, .playedIndicator) { opacity: 0 !important; transition: opacity 150ms ease; }",

    "}"
  ].join("\n");

  var style = document.createElement("style");
  style.id = "tb-hover-card";
  style.textContent = css;
  tbCss(style);
})();

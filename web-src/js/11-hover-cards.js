(function hoverCard() {
  // Hover look (as cinejoy.pk): the poster dims evenly, a white round play button with a soft glow fades in and grows to 110%, the title and "2026 ★ 7.1" under it
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

  // (its look is part of the main stylesheet, from the first frame: sleekfin/Inject/Components/sleekfin-hover.css)
})();

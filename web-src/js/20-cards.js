(function tbCardsLib() {
  // Shared by the home rows and search: builds cards with Jellyfin's own markup (same classes and
  // data-attributes as Jellyfin's card builder), so SleekFin's styling, the click/play/menu handling,
  // played ticks, and every theme script (badges, hover cards, release dates...) treat them as native.
  if (window.tbCards) return;

  var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
  if (base.charAt(base.length - 1) !== "/") base += "/";

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;";
    });
  }
  function layout() {
    var c = document.documentElement.classList;
    return c.contains("layout-tv") ? "tv" : c.contains("layout-mobile") ? "mobile" : "desktop";
  }
  function serverId() {
    try { return window.ApiClient && ApiClient.serverId() || ""; } catch (e) { return ""; }
  }

  // image sizes: matched to how big the card is on this screen (rounded so the server's resize cache is reused)
  function size(shape) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), vw = window.innerWidth || 1280;
    if (shape === "thumb") {
      var tw = Math.min(960, Math.ceil(Math.max(280, vw * 0.24) * dpr / 80) * 80);
      return "fillWidth=" + tw + "&fillHeight=" + Math.round(tw * 9 / 16);
    }
    if (shape === "square") {
      var sw = Math.min(600, Math.ceil(Math.max(160, vw * 0.13) * dpr / 80) * 80);
      return "fillWidth=" + sw + "&fillHeight=" + sw;
    }
    var pw = Math.min(600, Math.ceil(Math.max(160, vw * 0.13) * dpr / 80) * 80);
    return "fillWidth=" + pw + "&fillHeight=" + Math.round(pw * 1.5);
  }
  function img(id, type, tag, shape) {
    return base + "Items/" + id + "/Images/" + type + "?" + size(shape) + "&quality=90&tag=" + encodeURIComponent(tag);
  }
  // same image choice as Jellyfin's home rows
  function imageFor(it, shape, own) {
    if (shape === "thumb") {
      if (own && it.Type === "Episode" && it.Primary) return img(it.Id, "Primary", it.Primary, shape);
      if (it.Thumb) return img(it.Id, "Thumb", it.Thumb, shape);
      if (it.ParentThumbItemId && it.ParentThumbImageTag) return img(it.ParentThumbItemId, "Thumb", it.ParentThumbImageTag, shape);
      if (it.Backdrop) return img(it.Id, "Backdrop", it.Backdrop, shape);
      if (it.ParentBackdropItemId && it.ParentBackdropImageTag && it.Type === "Episode") return img(it.ParentBackdropItemId, "Backdrop", it.ParentBackdropImageTag, shape);
      if (it.Primary) return img(it.Id, "Primary", it.Primary, shape);
      return "";
    }
    if (it.Primary) return img(it.Id, "Primary", it.Primary, shape);
    if (it.Type === "Episode" && it.SeriesId && it.SeriesPrimaryImageTag) return img(it.SeriesId, "Primary", it.SeriesPrimaryImageTag, shape);
    if (it.Thumb) return img(it.Id, "Thumb", it.Thumb, shape);
    return "";
  }

  var SHAPES = { poster: "overflowPortrait", thumb: "overflowBackdrop", square: "overflowSquare", logo: "overflowBackdrop" };
  var PLAYABLE = { Movie: 1, Episode: 1, Series: 1, Season: 1, Video: 1, MusicVideo: 1, Audio: 1, MusicAlbum: 1, MusicArtist: 1, Playlist: 1, BoxSet: 1, Book: 0, AudioBook: 1, TvChannel: 1, Program: 1 };
  var MARKABLE = { Movie: 1, Episode: 1, Series: 1, Season: 1, Video: 1, MusicVideo: 1, BoxSet: 1 };
  var ICONS = { Movie: "movie", Series: "tv", Episode: "tv", Season: "tv", Person: "person", MusicAlbum: "album", Audio: "audiotrack", MusicArtist: "person", Book: "book", AudioBook: "book", BoxSet: "collections", Playlist: "queue_music" };

  function href(id, sid) { return "#/details?id=" + id + "&serverId=" + sid; }

  function lines(it, sid) {
    var a = [];
    if (it.Type === "Episode") {
      a.push(it.SeriesId
        ? '<a href="' + href(it.SeriesId, sid) + '" data-id="' + it.SeriesId + '" data-serverid="' + sid + '" data-type="Series" data-isfolder="true" class="itemAction textActionButton" title="' + esc(it.SeriesName) + '" data-action="link">' + esc(it.SeriesName) + "</a>"
        : esc(it.SeriesName || it.Name));
      var ep = it.ParentIndexNumber != null && it.IndexNumber != null ? "S" + it.ParentIndexNumber + ":E" + it.IndexNumber + " - " : "";
      a.push(esc(ep + (it.Name || "")));
    } else {
      a.push(esc(it.Name));
      if (it.Type === "Series" && it.ProductionYear) {
        if (it.Status === "Continuing") a.push(it.ProductionYear + " - Present");
        else if (it.EndDate) {
          var end = new Date(it.EndDate).getFullYear();
          a.push(end && end !== it.ProductionYear ? it.ProductionYear + " - " + end : String(it.ProductionYear));
        } else a.push(String(it.ProductionYear));
      } else if (it.ProductionYear && it.Type !== "Person") a.push(String(it.ProductionYear));
    }
    var out = "";
    for (var i = 0; i < a.length; i++) {
      if (!a[i]) continue;
      out += '<div class="cardText cardTextCentered ' + (out ? "cardText-secondary" : "cardText-first") + '"><bdi>' + a[i] + "</bdi></div>";
    }
    return out;
  }

  function indicators(it) {
    var u = it.UserData || {}, h = "";
    if (MARKABLE[it.Type]) {
      if (u.UnplayedItemCount) h += '<div class="countIndicator indicator">' + (u.UnplayedItemCount >= 100 ? "99+" : u.UnplayedItemCount) + "</div>";
      else if (u.Played || u.PlayedPercentage >= 100) h += '<div class="playedIndicator indicator"><span class="material-icons indicatorIcon check" aria-hidden="true"></span></div>';
    }
    return h ? '<div class="cardIndicators">' + h + "</div>" : "";
  }

  function hoverMenu(it, sid) {
    var u = it.UserData || {}, b = "cardOverlayButton cardOverlayButton-hover itemAction paper-icon-button-light", h = '<div class="cardOverlayContainer itemAction" data-action="link">';
    if (PLAYABLE[it.Type] && it.LocationType !== "Virtual") h += '<button is="paper-icon-button-light" class="' + b + ' cardOverlayFab-primary" data-action="resume" title="Play"><span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover play_arrow" aria-hidden="true"></span></button>';
    h += '<div class="cardOverlayButton-br flex">';
    if (MARKABLE[it.Type]) h += '<button is="emby-playstatebutton" type="button" data-action="none" class="' + b + '" data-id="' + it.Id + '" data-serverid="' + sid + '" data-itemtype="' + it.Type + '" data-played="' + !!u.Played + '"><span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover check" aria-hidden="true"></span></button>';
    if (it.Type !== "Person") h += '<button is="emby-ratingbutton" type="button" data-action="none" class="' + b + '" data-id="' + it.Id + '" data-serverid="' + sid + '" data-itemtype="' + it.Type + '" data-likes="" data-isfavorite="' + !!u.IsFavorite + '"><span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover favorite" aria-hidden="true"></span></button>';
    h += '<button is="paper-icon-button-light" class="' + b + '" data-action="menu" title="More"><span class="material-icons cardOverlayButtonIcon cardOverlayButtonIcon-hover more_vert" aria-hidden="true"></span></button>';
    return h + "</div></div>";
  }

  // one card (images are filled in by load() so off-screen rows don't download yet)
  function card(it, shape, index, sid, extraClass, own, noText) {
    sid = sid || serverId();
    var cls = SHAPES[shape] || SHAPES.poster, mode = layout(), u = it.UserData || {};
    var src = imageFor(it, shape, own);
    var pct = u.PlayedPercentage && u.PlayedPercentage < 100 ? u.PlayedPercentage : 0;
    var name = it.SeriesName && it.Type === "Episode" ? it.SeriesName : it.Name;
    var prefix = (it.Name || "").substring(0, 3).toUpperCase();
    var h = '<div data-index="' + index + '" data-isfolder="' + !!it.IsFolder + '" data-serverid="' + sid + '" data-id="' + it.Id + '" data-type="' + it.Type + '"' +
      (it.MediaType ? ' data-mediatype="' + it.MediaType + '"' : "") +
      (it.CollectionType ? ' data-collectiontype="' + it.CollectionType + '"' : "") +
      (u.PlaybackPositionTicks ? ' data-positionticks="' + u.PlaybackPositionTicks + '"' : "") +
      (it.RunTimeTicks ? ' data-runtimeticks="' + it.RunTimeTicks + '"' : "") +
      ' data-prefix="' + esc(prefix) + '" class="card ' + cls + "Card" + (mode === "desktop" ? " card-hoverable" : "") +
      (mode === "tv" ? " show-focus" : "") + (it.Type === "Person" ? " personCard" : "") +
      (/^(MusicAlbum|MusicArtist|Audio)$/.test(it.Type) ? "" : " card-withuserdata") + (extraClass ? " " + extraClass : "") + '">';
    h += '<div class="cardBox' + (noText ? "" : " cardBox-bottompadded") + '"><div class="cardScalable"><div class="cardPadder cardPadder-' + cls + '">' +
      (src ? "" : '<span class="cardImageIcon material-icons ' + (ICONS[it.Type] || "folder") + '" aria-hidden="true"></span>') + "</div>";
    h += '<a href="' + href(it.Id, sid) + '" data-action="link" class="cardImageContainer coveredImage cardContent itemAction"' +
      (src ? ' data-tb-src="' + esc(src) + '"' : "") + ' aria-label="' + esc(name) + '" role="img">';
    h += indicators(it);
    if (pct) h += '<div class="innerCardFooter fullInnerCardFooter innerCardFooterClear"><div class="itemProgressBar"><div class="itemProgressBarForeground" style="width:' + pct + '%;"></div></div></div>';
    h += "</a>";
    if (mode === "desktop") h += hoverMenu(it, sid);
    else if (PLAYABLE[it.Type] && it.LocationType !== "Virtual") h += '<button is="paper-icon-button-light" class="cardOverlayButton cardOverlayButton-br itemAction" data-action="play" title="Play"><span class="material-icons cardOverlayButtonIcon play_arrow" aria-hidden="true"></span></button>';
    h += "</div>" + (noText ? "" : lines(it, sid)) + "</div></div>";   // rows without titles: none are drawn at all
    return h;
  }

  // studio / custom logo tile (plain link: no item lookups by other scripts)
  function logoCard(x, index, sid) {
    sid = sid || serverId();
    var logo = String(x.logo || x.name || "");
    var src = /^(https?:)?\/\//i.test(logo) || logo.charAt(0) === "/" ? logo : base + "UshereatsTheme/studio/" + encodeURIComponent(logo.replace(/\.svg$/i, "")) + ".svg";
    var link = x.url || (x.id ? href(x.id, sid) : "#");
    return '<div data-index="' + index + '" class="card overflowBackdropCard tb-logo-card' + (layout() === "desktop" ? " card-hoverable" : "") + '">' +
      '<div class="cardBox"><div class="cardScalable"><div class="cardPadder cardPadder-overflowBackdrop"></div>' +
      '<a href="' + esc(link) + '" class="cardImageContainer cardContent tb-logo-link" aria-label="' + esc(x.name) + '" title="' + esc(x.name) + '">' +
      '<span class="tb-logo-img" data-tb-src="' + esc(src) + '"></span></a></div></div></div>';
  }

  function section(o) {
    var t = "";
    if (o.title && !o.hideTitle) {
      t = '<div class="sectionTitleContainer sectionTitleContainer-cards padded-left">' + (o.more
        ? '<a is="emby-linkbutton" href="' + esc(o.more) + '" class="more button-flat button-flat-mini sectionTitleTextButton emby-button"><h2 class="sectionTitle sectionTitle-cards">' + esc(o.title) + '</h2><span class="material-icons chevron_right" aria-hidden="true"></span></a>'
        : '<h2 class="sectionTitle sectionTitle-cards">' + esc(o.title) + "</h2>") + "</div>";
    }
    var inner = '<div is="emby-itemscontainer" class="itemsContainer ' + (o.wrap ? "vertical-wrap padded-left padded-right" : "scrollSlider") + ' focuscontainer-x">' + (o.cards || "") + "</div>";
    return '<div class="verticalSection' + (o.cls ? " " + o.cls : "") + '"' + (o.attrs || "") + ">" + t +
      (o.wrap ? inner : '<div is="emby-scroller" class="padded-top-focusscale padded-bottom-focusscale emby-scroller" data-centerfocus="true">' + inner + "</div>") + "</div>";
  }

  function frag(markup) {
    var t = document.createElement("template");
    t.innerHTML = markup.trim();
    return t.content.firstElementChild;
  }

  // the image at the size the card really is on this screen (x screen sharpness), in steps of 40px so the
  // server's resized copies are shared; never bigger than first asked
  function fitted(url, width) {
    var m = /fillWidth=(\d+)&fillHeight=(\d+)/.exec(url);
    if (!m || !width) return url;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.min(+m[1], Math.max(80, Math.ceil(width * dpr / 40) * 40));
    if (w === +m[1]) return url;
    return url.replace(m[0], "fillWidth=" + w + "&fillHeight=" + Math.round(w * (+m[2]) / (+m[1])));
  }
  function show(e, width) {
    e.style.backgroundImage = 'url("' + fitted(e.getAttribute("data-tb-src"), width).replace(/["\\]/g, "") + '")';
    e.removeAttribute("data-tb-src");
  }
  function fill(scope) {
    var list = scope.querySelectorAll("[data-tb-src]"), widths = [], i;
    for (i = 0; i < list.length; i++) widths.push(list[i].offsetWidth);   // all sizes read first, then all images set
    for (i = 0; i < list.length; i++) show(list[i], widths[i]);
  }
  // search: each poster loads when it comes near the screen (not all of them at once)
  var cardIo = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      cardIo.unobserve(en.target);
      if (en.target.hasAttribute("data-tb-src")) show(en.target, en.boundingClientRect.width);
    });
  }, { rootMargin: "400px 0px" }) : null;
  function loadEach(scope) {
    if (!cardIo) { fill(scope); return; }
    var list = scope.querySelectorAll("[data-tb-src]");
    for (var i = 0; i < list.length; i++) cardIo.observe(list[i]);
  }
  // Images start downloading when their row comes near the screen (rows already on screen: straight away)
  var io = "IntersectionObserver" in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) {
      if (!en.isIntersecting) return;
      io.unobserve(en.target);
      fill(en.target);
    });
  }, { rootMargin: "900px 0px" }) : null;
  function load(scope, now) {
    if (now || !io) { fill(scope); return; }
    io.unobserve(scope);
    io.observe(scope);
  }

  // Jellyfin's row scroller: re-measure after its cards change
  function refreshScroller(scope) {
    var sc = scope.querySelector(".emby-scroller");
    if (sc && sc.scroller && typeof sc.scroller.reload === "function") { try { sc.scroller.reload(); } catch (e) {} }
  }
  function upgrade(node) {
    if (window.CustomElements && typeof window.CustomElements.upgradeSubtree === "function") { try { window.CustomElements.upgradeSubtree(node); } catch (e) {} }
  }

  // badges (quality, time left, release date, new episode) drawn right away on cards we just put on the page
  function decorate() {
    var list = window.tbCardDecorators || [];
    for (var i = 0; i < list.length; i++) { try { list[i](); } catch (e) {} }
  }

  window.tbCards = { decorate: decorate, loadEach: loadEach, esc: esc, card: card, logoCard: logoCard, section: section, frag: frag, load: load, refreshScroller: refreshScroller, upgrade: upgrade, base: base, serverId: serverId };
})();

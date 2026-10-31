(function nowPlaying() {
  // "Now Playing" on the admin dashboard home: one card per stream with the poster, who/where, progress,
  // finish time, quality, and exactly what's being converted and why. Live (every 3 s), only while the
  // dashboard home is open and the tab is visible. Replaces the PlayInfo plugin's panel.
  if (window.__tbNowPlaying) return;
  window.__tbNowPlaying = true;

  var ID = "tb-np";
  var PREF = "tbNowPlaying";
  var prefs = (function () { try { return JSON.parse(localStorage.getItem(PREF) || "{}") || {}; } catch (e) { return {}; } })();
  function savePrefs() { try { localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (e) {} }

  var CSS = [
    "#tb-np{--np-acc:rgb(var(--tb-accent-rgb,233,196,106));margin:0 0 24px;color:#fff;font-family:var(--app-font,'Funnel Sans',Inter,sans-serif)}",
    "#tb-np *{box-sizing:border-box}",
    "#tb-np .np-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px}",
    "#tb-np .np-title{display:flex;align-items:center;gap:10px;font:400 30px/1 var(--title-font,'Bebas Neue',sans-serif);letter-spacing:.02em;margin-right:6px}",
    "#tb-np .np-title svg{width:26px;height:26px}",
    "#tb-np .np-pill{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;font:600 12px/1 inherit;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);white-space:nowrap}",
    "#tb-np .np-live::before{content:'';width:6px;height:6px;border-radius:50%;background:#3ee0a1;box-shadow:0 0 8px #3ee0a1;animation:np-pulse 1.6s ease-in-out infinite}",
    "@keyframes np-pulse{50%{opacity:.35}}",
    "#tb-np .np-dp{color:#3ee0a1;border-color:rgba(62,224,161,.35);background:rgba(62,224,161,.08)}",
    "#tb-np .np-ds{color:#4fb4ff;border-color:rgba(79,180,255,.35);background:rgba(79,180,255,.08)}",
    "#tb-np .np-rm{color:#b98cff;border-color:rgba(185,140,255,.35);background:rgba(185,140,255,.08)}",
    "#tb-np .np-tc{color:#ff6b8a;border-color:rgba(255,107,138,.35);background:rgba(255,107,138,.08)}",
    "#tb-np .np-pa{color:#ffbe55;border-color:rgba(255,190,85,.35);background:rgba(255,190,85,.08)}",
    "#tb-np .np-tools{margin-left:auto;display:flex;gap:8px}",
    "#tb-np .np-btn{height:32px;padding:0 14px;border-radius:9px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#fff;font:600 13px/1 inherit;cursor:pointer}",
    "#tb-np .np-btn:hover{background:rgba(255,255,255,.12)}",
    "#tb-np .np-btn[aria-pressed=true]{border-color:var(--np-acc);color:var(--np-acc)}",
    "#tb-np .np-stats{display:flex;align-items:center;gap:22px;flex-wrap:wrap;padding:12px 18px;margin-bottom:16px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(18,18,22,.55);font:600 12px/1 inherit;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.55)}",
    "#tb-np .np-stats b{font-size:16px;letter-spacing:0;color:#fff;margin-right:6px}",
    "#tb-np .np-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px}",
    "#tb-np.np-compact .np-grid{grid-template-columns:repeat(auto-fill,minmax(300px,1fr))}",
    "#tb-np .np-card{position:relative;overflow:hidden;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:rgba(16,16,20,.82)}",
    "#tb-np .np-card[data-m=tc]{border-color:rgba(255,107,138,.45)}",
    "#tb-np .np-card[data-m=dp]{border-color:rgba(62,224,161,.4)}",
    "#tb-np .np-card[data-m=ds],#tb-np .np-card[data-m=rm]{border-color:rgba(79,180,255,.4)}",
    "#tb-np .np-card[data-paused=true]{border-color:rgba(255,190,85,.45)}",
    "#tb-np .np-bg{position:absolute;inset:0;background-size:cover;background-position:center;filter:blur(30px) saturate(1.3);opacity:.28;transform:scale(1.2)}",
    "#tb-np .np-top{position:relative;display:flex;gap:14px;padding:14px}",
    "#tb-np .np-poster{position:relative;flex:0 0 150px;aspect-ratio:2/3;border-radius:12px;background:#111 center/cover no-repeat;box-shadow:0 10px 24px -10px rgba(0,0,0,.8)}",
    "#tb-np.np-compact .np-poster{flex-basis:96px}",
    "#tb-np .np-pct{position:absolute;right:8px;bottom:8px;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font:700 10px/1 inherit;background:conic-gradient(var(--np-acc) calc(var(--p)*1%),rgba(255,255,255,.18) 0);}",
    "#tb-np .np-pct span{width:28px;height:28px;border-radius:50%;background:rgba(10,10,12,.92);display:flex;align-items:center;justify-content:center}",
    "#tb-np .np-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:8px}",
    "#tb-np .np-who{display:flex;align-items:center;gap:10px;min-width:0}",
    "#tb-np .np-av{flex:0 0 30px;width:30px;height:30px;border-radius:50%;background:#333 center/cover;display:flex;align-items:center;justify-content:center;font:700 13px/1 inherit}",
    "#tb-np .np-user{font:700 15px/1.2 inherit}",
    "#tb-np .np-dev{font:500 12px/1.35 inherit;color:rgba(255,255,255,.55);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}",
    "#tb-np .np-row{display:flex;flex-wrap:wrap;gap:6px}",
    "#tb-np .np-name{font:700 18px/1.2 inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "#tb-np .np-sub{font:500 12px/1.3 inherit;color:rgba(255,255,255,.55);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    "#tb-np .np-bar{height:4px;border-radius:3px;background:rgba(255,255,255,.14);overflow:hidden;position:relative}",
    "#tb-np .np-bar i{position:absolute;left:0;top:0;bottom:0;background:var(--np-acc);border-radius:3px}",
    "#tb-np .np-bar u{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.25);border-radius:3px}",
    "#tb-np .np-time{display:flex;justify-content:space-between;font:600 11px/1 inherit;color:rgba(255,255,255,.5)}",
    "#tb-np .np-chip{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 8px;border-radius:7px;font:600 12px/1 inherit;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);white-space:nowrap}",
    "#tb-np .np-chip.np-blue{color:#7cc4ff;background:rgba(79,180,255,.1);border-color:rgba(79,180,255,.3)}",
    "#tb-np .np-chip.np-gold{color:#ffd166;background:rgba(255,209,102,.1);border-color:rgba(255,209,102,.3)}",
    "#tb-np .np-chip.np-red{color:#ff8fa5;background:rgba(255,107,138,.1);border-color:rgba(255,107,138,.3)}",
    "#tb-np .np-chip.np-green{color:#5fe8b0;background:rgba(62,224,161,.1);border-color:rgba(62,224,161,.3)}",
    "#tb-np .np-chip.np-violet{color:#c9a6ff;background:rgba(185,140,255,.1);border-color:rgba(185,140,255,.3)}",
    "#tb-np .np-why{display:flex;align-items:flex-start;gap:6px;padding:7px 10px;border-radius:9px;font:600 12px/1.35 inherit;color:#ff8fa5;background:rgba(255,107,138,.08);border:1px solid rgba(255,107,138,.3)}",
    "#tb-np .np-why.np-warn{color:#ffd166;background:rgba(255,209,102,.07);border-color:rgba(255,209,102,.3)}",
    "#tb-np .np-details{position:relative;margin:0 14px 14px;padding:12px 14px;border-radius:12px;background:rgba(6,6,8,.72);border:1px solid rgba(255,255,255,.08);display:grid;grid-template-columns:88px 1fr;gap:9px 12px;font:500 13px/1.35 inherit}",
    "#tb-np:not(.np-show) .np-details{display:none}",
    "#tb-np .np-details dt{font:700 10px/1.9 inherit;letter-spacing:.12em;color:rgba(255,255,255,.45);text-transform:uppercase}",
    "#tb-np .np-details dd{margin:0;color:rgba(255,255,255,.88)}",
    "#tb-np .np-details dd em{font-style:normal;display:inline-block;margin-right:8px;padding:2px 8px;border-radius:6px;font:700 10px/1.5 inherit;letter-spacing:.06em}",
    "#tb-np .np-details dd em.np-direct{color:#5fe8b0;background:rgba(62,224,161,.12)}",
    "#tb-np .np-details dd em.np-conv{color:#ff8fa5;background:rgba(255,107,138,.12)}",
    "#tb-np .np-empty{padding:18px;border-radius:14px;border:1px dashed rgba(255,255,255,.14);color:rgba(255,255,255,.5);font:600 13px/1 inherit}",
    "#tb-np.np-collapsed .np-stats,#tb-np.np-collapsed .np-grid,#tb-np.np-collapsed .np-empty{display:none}",
    "@media (max-width:600px){#tb-np .np-grid{grid-template-columns:1fr}#tb-np .np-poster{flex-basis:96px}#tb-np .np-tools{margin-left:0}}"
  ].join("\n");

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function words(s) { return String(s || "").replace(/([a-z0-9])([A-Z])/g, "$1 $2"); }
  function api() { return window.ApiClient; }
  function img(id, type, tag, opts) {
    if (!id || !tag) return "";
    var o = { tag: tag, quality: 90 };
    for (var k in opts) o[k] = opts[k];
    try { return api().getScaledImageUrl(id, Object.assign({ type: type }, o)); } catch (e) { return ""; }
  }
  function clock(ticks) {
    var s = Math.max(0, Math.floor((ticks || 0) / 1e7)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (x < 10 ? "0" : "") + x;
  }
  function eta(remainTicks) {
    var d = new Date(Date.now() + remainTicks / 1e4);
    try { return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); } catch (e) { return d.getHours() + ":" + ("0" + d.getMinutes()).slice(-2); }
  }
  function mbps(bps) { return bps ? (bps / 1e6).toFixed(1) + " Mbps" : ""; }
  function res(w, h) {
    if (!w) return "";
    if (w >= 3200 || h >= 1800) return "4K";
    if (w >= 1800 || h >= 1000) return "1080p";
    if (w >= 1200 || h >= 700) return "720p";
    return (h || w) + "p";
  }
  function codec(c) { c = String(c || "").toLowerCase(); return ({ h264: "H.264", hevc: "HEVC", h265: "HEVC", av1: "AV1", vp9: "VP9", mpeg2video: "MPEG-2", eac3: "E-AC3", ac3: "AC3", truehd: "TrueHD", dts: "DTS", aac: "AAC", opus: "OPUS", flac: "FLAC", mp3: "MP3", pgssub: "PGS", subrip: "SRT", ass: "ASS", dvdsub: "VobSub" })[c] || c.toUpperCase(); }
  function channels(n, layout) { if (layout && /^\d/.test(layout)) return layout.replace(/\(.*\)/, "").trim(); return n ? (n === 2 ? "2.0" : n === 6 ? "5.1" : n === 8 ? "7.1" : n === 1 ? "1.0" : n + "ch") : ""; }
  var REASONS = {
    ContainerNotSupported: "Container not supported", VideoCodecNotSupported: "Video codec not supported", AudioCodecNotSupported: "Audio codec not supported",
    SubtitleCodecNotSupported: "Subtitles burned in (format not supported)", AudioIsExternal: "External audio track", SecondaryAudioNotSupported: "Second audio track not supported",
    VideoProfileNotSupported: "Video profile not supported", VideoLevelNotSupported: "Video level not supported", VideoResolutionNotSupported: "Resolution too high for the device",
    VideoBitDepthNotSupported: "Bit depth not supported", VideoFramerateNotSupported: "Frame rate not supported", RefFramesNotSupported: "Reference frames not supported",
    AnamorphicVideoNotSupported: "Anamorphic video not supported", InterlacedVideoNotSupported: "Interlaced video not supported", AudioChannelsNotSupported: "Audio channel layout not supported",
    AudioProfileNotSupported: "Audio profile not supported", AudioSampleRateNotSupported: "Audio sample rate not supported", AudioBitDepthNotSupported: "Audio bit depth not supported",
    ContainerBitrateExceedsLimit: "Bitrate is over the device's limit", VideoBitrateNotSupported: "Video bitrate over the limit", AudioBitrateNotSupported: "Audio bitrate over the limit",
    UnknownVideoStreamInfo: "Unknown video stream", UnknownAudioStreamInfo: "Unknown audio stream", DirectPlayError: "Direct play failed", VideoRangeTypeNotSupported: "HDR type not supported (tone mapping)"
  };
  var WARN = { ContainerBitrateExceedsLimit: 1, AudioChannelsNotSupported: 1, VideoBitrateNotSupported: 1, AudioBitrateNotSupported: 1 };

  // source streams per item (sessions don't always include them): asked once per item
  var streamCache = {};
  function streamsFor(s) {
    var it = s.NowPlayingItem;
    if (it.MediaStreams && it.MediaStreams.length) return Promise.resolve(it.MediaStreams);
    var key = it.Id + "|" + (s.PlayState && s.PlayState.MediaSourceId || "");
    if (!streamCache[key]) {
      streamCache[key] = api().getItem(api().getCurrentUserId(), it.Id).then(function (full) {
        var srcs = full.MediaSources || [], id = s.PlayState && s.PlayState.MediaSourceId;
        var src = srcs.filter(function (m) { return m.Id === id; })[0] || srcs[0] || {};
        return src.MediaStreams || full.MediaStreams || [];
      }, function () { return []; });
    }
    return streamCache[key];
  }

  function method(s) {
    var ps = s.PlayState || {}, ti = s.TranscodingInfo;
    if (ps.PlayMethod === "Transcode" && ti) {
      if (ti.IsVideoDirect && ti.IsAudioDirect) return "rm";
      return "tc";
    }
    if (ps.PlayMethod === "DirectStream") return "ds";
    return "dp";
  }
  var LABEL = { dp: "Direct Play", ds: "Direct Stream", rm: "Remux", tc: "Transcode" };

  function card(s, streams) {
    var it = s.NowPlayingItem, ps = s.PlayState || {}, ti = s.TranscodingInfo || null, m = method(s);
    var v = streams.filter(function (x) { return x.Type === "Video"; })[0] || {};
    var a = streams.filter(function (x) { return x.Type === "Audio" && x.Index === ps.AudioStreamIndex; })[0] || streams.filter(function (x) { return x.Type === "Audio" && x.IsDefault; })[0] || streams.filter(function (x) { return x.Type === "Audio"; })[0] || {};
    var sub = ps.SubtitleStreamIndex != null && ps.SubtitleStreamIndex >= 0 ? streams.filter(function (x) { return x.Index === ps.SubtitleStreamIndex; })[0] : null;
    var hdr = v.VideoRange === "HDR" || /HDR|DOVI|HLG/i.test(v.VideoRangeType || "");
    var hdrName = /DOVI/i.test(v.VideoRangeType || "") ? "Dolby Vision" : /HDR10Plus/i.test(v.VideoRangeType || "") ? "HDR10+" : /HLG/i.test(v.VideoRangeType || "") ? "HLG" : hdr ? "HDR" : "SDR";
    var run = it.RunTimeTicks || 0, pos = ps.PositionTicks || 0, pct = run ? Math.min(100, pos / run * 100) : 0;
    var buffered = ti && ti.CompletionPercentage ? ti.CompletionPercentage : 0;
    var fps = v.RealFrameRate || v.AverageFrameRate;
    var bitrate = ti && ti.Bitrate ? ti.Bitrate : (v.BitRate || 0) + (a.BitRate || 0) || it.Bitrate;
    var container = String(it.Container || (ti && ti.Container) || "").split(",")[0].toUpperCase();
    var outContainer = ti && ti.Container ? ti.Container.toUpperCase() : container;
    var videoOut = ti && !ti.IsVideoDirect ? codec(ti.VideoCodec) : codec(v.Codec);
    var audioOut = ti && !ti.IsAudioDirect ? codec(ti.AudioCodec) : codec(a.Codec);
    var toneMap = hdr && ti && !ti.IsVideoDirect && !/DOVI|HDR|HLG/i.test(ti.VideoRangeType || "");

    var poster = it.Type === "Episode" ? (img(it.SeriesId, "Primary", it.SeriesPrimaryImageTag, { maxHeight: 360 }) || img(it.Id, "Primary", it.ImageTags && it.ImageTags.Primary, { maxHeight: 360 }))
      : img(it.Id, "Primary", it.ImageTags && it.ImageTags.Primary, { maxHeight: 360 });
    var title = it.Type === "Episode" ? (it.SeriesName || it.Name) : it.Name;
    var subTitle = it.Type === "Episode" ? "S" + (it.ParentIndexNumber || 0) + ":E" + (it.IndexNumber || 0) + " • " + it.Name : (it.ProductionYear || "");
    if (it.Type === "Audio") { title = it.Name; subTitle = (it.Artists || []).join(", ") + (it.Album ? " • " + it.Album : ""); }
    var av = s.UserPrimaryImageTag ? img(s.UserId, "Primary", s.UserPrimaryImageTag, { maxHeight: 64 }) : "";

    var chips = [];
    if (v.Width) chips.push('<span class="np-chip np-blue">' + res(v.Width, v.Height) + "</span>");
    if (v.Width) chips.push('<span class="np-chip np-gold">' + hdrName + "</span>");
    chips.push('<span class="np-chip">' + LABEL[m] + "</span>");
    if (v.Codec) chips.push('<span class="np-chip' + (ti && !ti.IsVideoDirect ? " np-red" : "") + '">' + codec(v.Codec) + (ti && !ti.IsVideoDirect ? "→" + videoOut : "") + "</span>");
    if (v.BitDepth) chips.push('<span class="np-chip">' + v.BitDepth + "-bit</span>");
    if (a.Codec) {
      chips.push('<span class="np-chip' + (ti && !ti.IsAudioDirect ? " np-red" : " np-violet") + '">' + channels(a.Channels, a.ChannelLayout) + "</span>");
      chips.push('<span class="np-chip' + (ti && !ti.IsAudioDirect ? " np-red" : " np-violet") + '">' + codec(a.Codec) + (ti && !ti.IsAudioDirect ? "→" + audioOut : "") + "</span>");
      if (/atmos/i.test((a.Profile || "") + (a.DisplayTitle || ""))) chips.push('<span class="np-chip np-violet">Atmos</span>');
    }
    if (container) chips.push('<span class="np-chip">' + container + (outContainer && outContainer !== container ? "→" + outContainer : "") + "</span>");
    if (bitrate) chips.push('<span class="np-chip' + (ti && (ti.TranscodeReasons || []).indexOf("ContainerBitrateExceedsLimit") >= 0 ? " np-gold" : " np-green") + '">' + mbps(bitrate) + "</span>");
    if (fps) chips.push('<span class="np-chip">' + Math.round(fps * 1000) / 1000 + " fps</span>");
    if (sub) chips.push('<span class="np-chip' + (ti && (ti.TranscodeReasons || []).indexOf("SubtitleCodecNotSupported") >= 0 ? " np-red" : "") + '">' + esc(sub.Language || codec(sub.Codec)).toUpperCase() + "</span>");

    var why = ((ti && ti.TranscodeReasons) || []).map(function (r) {
      return '<div class="np-why' + (WARN[r] ? " np-warn" : "") + '">⚠ ' + esc(REASONS[r] || words(r)) + (r === "ContainerBitrateExceedsLimit" && ti.HardwareAccelerationType ? " [" + esc(ti.HardwareAccelerationType.toUpperCase()) + "]" : "") + "</div>";
    }).join("");

    function line(label, direct, text) {
      return "<dt>" + label + "</dt><dd>" + (direct == null ? "" : '<em class="' + (direct ? "np-direct" : "np-conv") + '">' + (direct ? "DIRECT" : "TRANSCODE") + "</em>") + text + "</dd>";
    }
    var details = "";
    if (v.Codec) details += line("Video", !ti || ti.IsVideoDirect, esc(codec(v.Codec) + " → " + videoOut) + " • " + (v.Width ? v.Width + "x" + v.Height + " → " + (ti && !ti.IsVideoDirect && ti.Width ? ti.Width + "x" + ti.Height : v.Width + "x" + v.Height) : "") + (fps ? " • " + Math.round(fps * 1000) / 1000 + " fps" : ""));
    if (a.Codec) details += line("Audio", !ti || ti.IsAudioDirect, esc(codec(a.Codec) + " → " + audioOut) + " • " + esc((a.Language || "").toUpperCase()) + " " + channels(a.Channels, a.ChannelLayout));
    details += line("Subtitles", null, sub ? esc((sub.DisplayTitle || sub.Language || "") + " (" + codec(sub.Codec) + ")") : "Not active");
    details += line("Container", null, esc(container + " → " + outContainer) + (bitrate ? " • Overall bitrate: " + mbps(bitrate) : ""));
    if (v.Codec) details += line("HDR", null, hdrName + " • Tone mapping: " + (toneMap ? "Active" : hdr ? "Not needed" : "Not used"));
    details += line("Engine", null, ti ? esc(ti.HardwareAccelerationType ? ti.HardwareAccelerationType.toUpperCase() : "Software (CPU)") + (ti.Framerate ? " • " + Math.round(ti.Framerate) + " fps" : "") : "Not applicable");

    var paused = !!ps.IsPaused;
    var bg = img(it.Type === "Episode" ? it.SeriesId : it.Id, "Backdrop", it.Type === "Episode" ? (it.ParentBackdropImageTags || [])[0] : (it.BackdropImageTags || [])[0], { maxWidth: 480 }) || poster;
    return '<div class="np-card" data-m="' + m + '" data-paused="' + paused + '">' +
      (bg ? '<div class="np-bg" style="background-image:url(\'' + esc(bg) + '\')"></div>' : "") +
      '<div class="np-top">' +
        '<div class="np-poster" style="' + (poster ? "background-image:url('" + esc(poster) + "')" : "") + '"><div class="np-pct" style="--p:' + Math.round(pct) + '"><span>' + Math.round(pct) + "%</span></div></div>" +
        '<div class="np-info">' +
          '<div class="np-who"><div class="np-av" style="' + (av ? "background-image:url('" + esc(av) + "')" : "") + '">' + (av ? "" : esc((s.UserName || "?").charAt(0).toUpperCase())) + "</div>" +
            '<div style="min-width:0"><div class="np-user">' + esc(s.UserName || "") + '</div><div class="np-dev">' + esc((s.Client || "") + " — " + (s.DeviceName || "") + (s.ApplicationVersion ? " (v" + s.ApplicationVersion + ")" : "")) + "</div></div></div>" +
          '<div class="np-row"><span class="np-pill ' + (paused ? "np-pa" : "np-dp") + '">' + (paused ? "❚❚ Paused" : "▶ Playing") + '</span><span class="np-pill np-' + m + '">' + LABEL[m].toUpperCase() + "</span></div>" +
          '<div><div class="np-name">' + esc(title) + '</div><div class="np-sub">' + esc(subTitle) + "</div></div>" +
          '<div class="np-bar"><u style="width:' + Math.min(100, buffered) + '%"></u><i style="width:' + pct + '%"></i></div>' +
          '<div class="np-time"><span>' + clock(pos) + "</span><span>ETA " + eta(Math.max(0, run - pos)) + "</span><span>" + clock(run) + "</span></div>" +
          '<div class="np-row">' + chips.join("") + "</div>" + why +
        "</div>" +
      "</div>" +
      '<dl class="np-details">' + details + "</dl>" +
    "</div>";
  }

  function header(list) {
    var c = { dp: 0, ds: 0, rm: 0, tc: 0 }, paused = 0, bw = 0;
    list.forEach(function (x) {
      c[method(x.s)]++;
      if (x.s.PlayState && x.s.PlayState.IsPaused) paused++;
      var ti = x.s.TranscodingInfo, v = x.st.filter(function (y) { return y.Type === "Video"; })[0] || {};
      bw += ti && ti.Bitrate ? ti.Bitrate : (x.s.NowPlayingItem.Bitrate || v.BitRate || 0);
    });
    return { counts: c, paused: paused, bw: bw };
  }

  var root = null, timer = 0, busy = false, lastHtml = "";
  function shell() {
    var r = document.createElement("section");
    r.id = ID;
    r.innerHTML =
      '<div class="np-head"><div class="np-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z" fill="currentColor"/></svg>NOW PLAYING</div>' +
      '<span class="np-pill np-live">LIVE</span><span class="np-pill np-dp" data-c="dp"></span><span class="np-pill np-ds" data-c="ds"></span><span class="np-pill np-rm" data-c="rm"></span><span class="np-pill np-tc" data-c="tc"></span><span class="np-pill np-pa" data-c="pa"></span>' +
      '<div class="np-tools"><button type="button" class="np-btn" data-t="compact">Compact</button><button type="button" class="np-btn" data-t="collapsed">Hide</button><button type="button" class="np-btn" data-t="show">Show details</button></div></div>' +
      '<div class="np-stats"></div><div class="np-grid"></div>';
    r.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".np-btn");
      if (!b) return;
      var k = b.getAttribute("data-t");
      prefs[k] = !prefs[k];
      savePrefs();
      applyPrefs(r);
    });
    applyPrefs(r);
    return r;
  }
  function applyPrefs(r) {
    ["compact", "collapsed", "show"].forEach(function (k) {
      r.classList.toggle("np-" + k, !!prefs[k]);
      var b = r.querySelector('.np-btn[data-t="' + k + '"]');
      if (b) { b.setAttribute("aria-pressed", String(!!prefs[k])); if (k === "collapsed") b.textContent = prefs[k] ? "Show" : "Hide"; if (k === "show") b.textContent = prefs[k] ? "Hide details" : "Show details"; }
    });
  }

  function host() {
    var p = document.getElementById("dashboardPage");
    if (!p || p.classList.contains("hide")) return null;
    return p.querySelector(".content-primary");
  }

  function refresh() {
    if (busy || document.hidden || !api()) return;
    var h = host();
    if (!h) { stop(); return; }
    if (!root) {
      root = shell();
      var st = document.createElement("style"); st.id = "tb-np-css"; st.textContent = CSS;
      if (!document.getElementById("tb-np-css")) document.head.appendChild(st);
    }
    if (root.parentNode !== h) h.insertBefore(root, h.firstChild);
    busy = true;
    Promise.resolve(api().getSessions({ ActiveWithinSeconds: 960 })).then(function (sessions) {
      var playing = (sessions || []).filter(function (s) { return s.NowPlayingItem; });
      return Promise.all(playing.map(function (s) { return streamsFor(s).then(function (st) { return { s: s, st: st || [] }; }); }));
    }).then(function (list) {
      list.sort(function (a, b) { return (a.s.UserName || "").localeCompare(b.s.UserName || "") || (a.s.DeviceName || "").localeCompare(b.s.DeviceName || ""); });
      var hd = header(list), c = hd.counts;
      var set = function (k, n, label) { var e = root.querySelector('[data-c="' + k + '"]'); if (e) e.textContent = n + " " + label; };
      set("dp", c.dp, "Direct Play"); set("ds", c.ds, "Direct Stream"); set("rm", c.rm, "Remux"); set("tc", c.tc, "Transcode"); set("pa", hd.paused, "Paused");
      root.querySelector(".np-stats").innerHTML = "<span><b>" + list.length + "</b>Active streams</span><span><b>" + (c.dp + c.ds + c.rm) + "</b>Direct</span><span><b>" + c.tc + "</b>Transcoding</span><span><b>" + (hd.bw / 1e6).toFixed(1) + " Mbps</b>Bandwidth</span>";
      var html = list.length ? list.map(function (x) { return card(x.s, x.st); }).join("") : '<div class="np-empty">Nothing is playing right now.</div>';
      if (html !== lastHtml) { root.querySelector(".np-grid").innerHTML = html; lastHtml = html; }
    }).catch(function () {}).then(function () { busy = false; });
  }

  function start() { if (!timer) { timer = setInterval(refresh, 3000); } refresh(); }
  function stop() { if (timer) { clearInterval(timer); timer = 0; } }

  // runs while the dashboard home is showing
  var queued = false;
  function check() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      var h = host();
      if (h) { if (!root || root.parentNode !== h || !timer) start(); }
      else stop();
    });
  }
  new MutationObserver(check).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) check(); });
  window.addEventListener("hashchange", check);
  check();
})();

(function tbTitleSound() {
  // A short, soft "pop" when you open a title (setting: Features > Titles > Title click sound).
  // Made on the spot with the browser's own sound engine: nothing to download, so it plays the instant you click.
  // Two quick rising tones with a gentle fade, quiet by default. Pop-up mode calls window.tbTitleSound() itself;
  // full-page mode listens for title clicks here.
  if (window.tbTitleSound) return;
  var ctx = null, last = 0;
  var vol = Math.max(0, Math.min(1, parseFloat((window.TB_CONFIG || {}).TitleSoundVolume)));
  if (isNaN(vol)) vol = 0.35;

  function tone(at, from, to, len, peak, type) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, at);
    o.frequency.exponentialRampToValueAtTime(to, at + len * 0.6);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    o.connect(g);
    g.connect(ctx.__out);
    o.start(at);
    o.stop(at + len + 0.02);
  }

  window.tbTitleSound = function () {
    if (vol <= 0) return;
    var now = Date.now();
    if (now - last < 120) return;   // a double click is one sound
    last = now;
    try {
      if (!ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        // a soft low-pass so it's warm, not beepy
        var f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 3200;
        f.connect(ctx.destination);
        ctx.__out = f;
      }
      if (ctx.state === "suspended") ctx.resume();
      var t = ctx.currentTime + 0.005, v = 0.22 * vol;
      tone(t, 520, 760, 0.16, v, "sine");                 // the pop
      tone(t + 0.055, 980, 1180, 0.22, v * 0.55, "sine");  // a light sparkle on top
      tone(t, 260, 380, 0.12, v * 0.35, "triangle");       // a little body underneath
    } catch (e) {}
  };

  // full-page mode: a click that opens a title (a poster, More info, a title link)
  var TYPES = { Movie: 1, Series: 1, Season: 1, Episode: 1, BoxSet: 1, Person: 1 };
  window.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target;
    if (!t || !t.closest || document.body.classList.contains("dashboardDocument")) return;
    var act = t.closest("[data-action]");
    if (act && act.getAttribute("data-action") !== "link") return;
    var btn = t.closest("button");
    if (btn && btn !== act) return;
    var holder = act ? (act.hasAttribute("data-id") ? act : act.closest("[data-id]")) : t.closest(".card[data-id], .listItem[data-id]");
    if (holder) {
      var type = holder.getAttribute("data-type") || ((holder.closest(".card[data-id]") || holder).getAttribute("data-type"));
      if (TYPES[type]) window.tbTitleSound();
      return;
    }
    var a = t.closest("a[href]");
    if (a && /details\?(?:[^#]*&)?id=/i.test(a.getAttribute("href") || "")) window.tbTitleSound();
  }, true);
})();

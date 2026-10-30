(function accentColour() {
  // Reads the accent colour set in SleekFin's settings and shares it as plain numbers
  // (--tb-accent-rgb: "232, 192, 80") so see-through glows across the UI can follow it too.
  // Change the accent in SleekFin -> everything follows. No settings here.
  var FALLBACK = "232, 192, 80";   // used only when SleekFin's colour isn't available (e.g. before sign-in)
  var root = document.documentElement;
  var probe = null, last = "";

  function toRgb(colour) {
    if (!colour) return null;
    if (!probe) {
      probe = document.createElement("span");
      probe.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;visibility:hidden;";
      (document.body || root).appendChild(probe);
    }
    probe.style.color = "";
    probe.style.color = colour;
    if (!probe.style.color) return null;   // not a valid colour
    var m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(getComputedStyle(probe).color);
    return m ? m[1] + ", " + m[2] + ", " + m[3] : null;
  }

  function apply() {
    var raw = getComputedStyle(root).getPropertyValue("--sleekfin-accent").trim();
    var rgb = toRgb(raw) || FALLBACK;
    if (rgb !== last) {
      last = rgb;
      root.style.setProperty("--tb-accent-rgb", rgb);
    }
  }

  // SleekFin sets its colour after it loads, and again if you change it: re-check then.
  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; apply(); }, 200);
  }
  new MutationObserver(schedule).observe(root, { attributes: true, attributeFilter: ["style", "class"] });
  new MutationObserver(schedule).observe(document.head, { childList: true });
  if (document.body) apply(); else document.addEventListener("DOMContentLoaded", apply);
  setTimeout(apply, 1500);
  setTimeout(apply, 5000);
})();

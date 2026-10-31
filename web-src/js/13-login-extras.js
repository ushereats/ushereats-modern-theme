(function signInExtras() {
  // Shared page watcher: ONE observer for all custom scripts instead of one each.
  // While a video is playing full screen (or the tab is hidden) it only checks every 1.5s.
  var tbWatch = window.tbWatch || (window.tbWatch = (function () {
    var subs = [], mo = null, last = 0;
    function busy() {
      if (document.hidden) return true;
      var osd = document.getElementById("videoOsdPage");
      return !!(osd && !osd.classList.contains("hide") && document.querySelector(".videoPlayerContainer"));
    }
    window.tbBusy = busy;
    function fire() {
      if (busy()) { var now = Date.now(); if (now - last < 1500) return; last = now; }
      for (var i = 0; i < subs.length; i++) { try { subs[i](); } catch (e) {} }
    }
    document.addEventListener("visibilitychange", function () { if (!document.hidden) fire(); });
    return function (fn) {
      subs.push(fn);
      if (!mo) { mo = new MutationObserver(fire); mo.observe(document.documentElement, { childList: true, subtree: true }); }
    };
  })());
  // 1) Clickable Discord pill on the sign-in page
  // 2) Quick Connect pop-up: big gold code + clear instructions
  var DISCORD_URL = tbCfg("DiscordUrl", "https://discord.gg/fgKX5u4Zn9");
  var DISCORD_TEXT_1 = tbCfg("DiscordText1", "Forgot password or need help? Join our Discord");
  var DISCORD_TEXT_2 = tbCfg("DiscordText2", "discord.gg/fgKX5u4Zn9");

  function addDiscordLink() {
    var box = document.querySelector("#loginPage .loginDisclaimerContainer");
    if (!box || box.querySelector(".tb-discord-pill")) return;
    var a = document.createElement("a");
    a.className = "tb-discord-pill";
    a.href = DISCORD_URL;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.appendChild(document.createTextNode(DISCORD_TEXT_1));
    a.appendChild(document.createElement("br"));
    a.appendChild(document.createTextNode(DISCORD_TEXT_2));
    box.appendChild(a);
    box.classList.add("tb-has-link");
  }

  function styleQuickConnect() {
    var dlg = document.getElementById("quickConnectAlert");
    if (!dlg || dlg.dataset.tbDone) return;
    var text = dlg.querySelector(".text");
    if (!text || !text.textContent) return;
    var raw = text.textContent.replace(/\s+/g, " ");
    var m = /\b(\d{4,10})\b/.exec(raw) || /\b([A-Z0-9]{4,10})\b/.exec(raw);
    if (!m) return;
    var code = m[1];
    dlg.dataset.tbDone = "1";
    dlg.classList.add("tb-qc");
    var spaced = code.length === 6 ? code.slice(0, 3) + " " + code.slice(3) : code;
    text.innerHTML = "";
    var c = document.createElement("div");
    c.className = "tb-qc-code";
    c.textContent = spaced;
    var h = document.createElement("div");
    h.className = "tb-qc-help";
    h.textContent = "On a device that's already signed in, open Settings → Quick Connect and enter this code. This screen signs you in by itself.";
    var w = document.createElement("div");
    w.className = "tb-qc-wait";
    w.textContent = "Waiting for approval…";
    text.appendChild(c);
    text.appendChild(h);
    text.appendChild(w);
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () {
      queued = false;
      if (!document.getElementById("loginPage") && !document.getElementById("quickConnectAlert")) return;   // nothing to do elsewhere
      addDiscordLink();
      styleQuickConnect();
    }, 100);
  }
  tbWatch(schedule);
  window.addEventListener("hashchange", schedule);
  schedule();

  var ACC = "var(--sleekfin-accent, rgb(232, 192, 80))";
  var css = [
    "#quickConnectAlert.tb-qc {",
    "  background: #0b0b0d !important; color: #fff;",
    "  border: 1px solid rgba(255,255,255,0.08); border-radius: 20px !important;",
    "  box-shadow: 0 30px 80px -20px rgba(0,0,0,0.9) !important;",
    "  max-width: 460px; padding: 10px 6px;",
    "  font-family: var(--app-font, Inter, sans-serif);",
    "}",
    "#quickConnectAlert.tb-qc .formDialogHeaderTitle {",
    "  font-family: var(--title-font, 'Bebas Neue', sans-serif) !important;",
    "  font-size: 34px !important; font-weight: 400 !important; letter-spacing: 0.04em;",
    "  color: #fff; margin-top: 18px !important;",
    "}",
    "#quickConnectAlert.tb-qc .tb-qc-code {",
    "  font-family: var(--title-font, 'Bebas Neue', sans-serif);",
    "  font-size: 76px; line-height: 1; letter-spacing: 0.14em;",
    "  color: " + ACC + "; margin: 6px 0 18px; padding-left: 0.14em;",
    "  white-space: pre;",
    "}",
    "#quickConnectAlert.tb-qc .tb-qc-help {",
    "  font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.7); max-width: 340px; margin: 0 auto;",
    "}",
    "#quickConnectAlert.tb-qc .tb-qc-wait {",
    "  margin-top: 16px; font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;",
    "  color: rgba(255,255,255,0.4); animation: tbQcPulse 1.6s ease-in-out infinite;",
    "}",
    "@keyframes tbQcPulse { 0%, 100% { opacity: 0.45; } 50% { opacity: 1; } }",
    "#quickConnectAlert.tb-qc .formDialogFooter .btnOption {",
    "  height: 48px; border-radius: 12px !important; min-width: 160px;",
    "  background: rgba(255,255,255,0.06) !important; color: #fff !important;",
    "  border: 1px solid rgba(255,255,255,0.14) !important;",
    "  font-family: var(--title-font, 'Bebas Neue', sans-serif) !important;",
    "  font-size: 20px !important; font-weight: 400 !important; letter-spacing: 0.06em;",
    "}",
    "#quickConnectAlert.tb-qc .formDialogFooter .btnOption:focus { outline: none; box-shadow: 0 0 0 2px " + ACC + " !important; }"
  ].join("\n");
  var style = document.createElement("style");
  style.id = "tb-signin-extras";
  style.textContent = css;
  tbCss(style);
})();

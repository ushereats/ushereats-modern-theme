(function userMenu() {
  // Restyles the avatar menu (Profile, Settings, Dashboard, Sign out...):
  // dark glass panel, header with your picture + name in Bebas, gold hover bar, red Sign out.

  var HEAD = "tb-um-head";
  var user = null;

  function loadUser() {
    if (!window.ApiClient) return Promise.resolve(null);
    return Promise.resolve(ApiClient.getCurrentUser()).then(function (u) { user = u; return u; }).catch(function () { return null; });
  }

  function hue(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  }

  function buildHead(u) {
    var head = document.createElement("div");
    head.className = HEAD;
    head.setAttribute("aria-hidden", "true");
    var pic;
    if (u && u.PrimaryImageTag) {
      pic = document.createElement("img");
      pic.className = "tb-um-pic";
      pic.alt = "";
      try { pic.src = ApiClient.getUrl("Users/" + u.Id + "/Images/Primary", { tag: u.PrimaryImageTag, maxWidth: 120, quality: 90 }); } catch (e) {}
    } else {
      pic = document.createElement("div");
      pic.className = "tb-um-pic tb-um-initial";
      var n = (u && u.Name) || "?";
      pic.textContent = n.charAt(0).toUpperCase();
      pic.style.background = "hsl(" + hue(n) + ", 45%, 38%)";
    }
    var txt = document.createElement("div");
    txt.className = "tb-um-text";
    var name = document.createElement("div");
    name.className = "tb-um-name";
    name.textContent = (u && u.Name) || "";
    var sub = document.createElement("div");
    sub.className = "tb-um-sub";
    sub.textContent = u && u.Policy && u.Policy.IsAdministrator ? "Administrator" : "Signed in";
    txt.appendChild(name);
    txt.appendChild(sub);
    head.appendChild(pic);
    head.appendChild(txt);
    return head;
  }

  function decorate() {
    var menu = document.getElementById("app-user-menu");
    if (!menu) return;
    var paper = menu.querySelector(".MuiPaper-root");
    if (!paper) return;
    var have = paper.querySelector("." + HEAD);
    var key = user ? user.Id + "|" + user.Name + "|" + (user.PrimaryImageTag || "") : "";
    if (have && have.getAttribute("data-key") === key) return;
    if (have) have.parentNode.removeChild(have);
    if (!user) return;
    var head = buildHead(user);
    head.setAttribute("data-key", key);
    paper.insertBefore(head, paper.firstChild);
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(function () { requestAnimationFrame(function () { queued = false; decorate(); }); }, 60);
  }
  // refresh the name/picture each time the menu is opened
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest && e.target.closest("button[aria-controls='app-user-menu'], #tb-header-avatar");
    if (t) loadUser().then(schedule);
  }, true);
  new MutationObserver(schedule).observe(document.body, { childList: true });
  var poll = setInterval(function () {
    if (window.ApiClient) { clearInterval(poll); loadUser().then(schedule); }
  }, 500);

  // ── Styles ──
  var M = "#app-user-menu";
  var ACC = "var(--sleekfin-accent, rgb(233, 196, 106))";
  var css = [
    M + " .MuiPaper-root:not(#tb-x) {",
    "  min-width: 264px !important; padding: 6px !important; margin-top: 8px;",
    "  background: rgba(14, 14, 16, 0.94) !important; background-image: none !important; color: #fff !important;",
    "  border: 1px solid rgba(255, 255, 255, 0.08) !important; border-radius: 16px !important;",
    "  box-shadow: 0 24px 60px -16px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(0, 0, 0, 0.4) !important;",
    "  font-family: var(--app-font, Inter, sans-serif) !important;",
    "}",
    "@supports ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {",
    "  " + M + " .MuiPaper-root:not(#tb-x) { background: rgba(14, 14, 16, 0.78) !important;",
    "    -webkit-backdrop-filter: blur(22px) saturate(1.2); backdrop-filter: blur(22px) saturate(1.2); }",
    "}",
    M + " .MuiMenu-list:not(#tb-x) { padding: 0 !important; }",

    /* header */
    M + " ." + HEAD + " { display: flex; align-items: center; gap: 12px; padding: 12px 12px 14px;",
    "  margin-bottom: 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }",
    M + " .tb-um-pic { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; flex: 0 0 44px;",
    "  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.12); }",
    M + " .tb-um-initial { display: flex; align-items: center; justify-content: center; color: #fff;",
    "  font-family: var(--title-font, 'Bebas Neue', sans-serif); font-size: 24px; padding-top: 2px; box-sizing: border-box; }",
    M + " .tb-um-text { min-width: 0; }",
    M + " .tb-um-name { font-family: var(--title-font, 'Bebas Neue', sans-serif); font-size: 26px; line-height: 1;",
    "  letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }",
    M + " .tb-um-sub { margin-top: 3px; font-size: 12px; font-weight: 600; color: rgba(255, 255, 255, 0.5); }",

    /* items */
    M + " .MuiMenuItem-root:not(#tb-x) {",
    "  position: relative; min-height: 0 !important; margin: 1px 0; padding: 10px 12px !important;",
    "  border-radius: 10px !important; color: rgba(255, 255, 255, 0.88) !important;",
    "  transition: background-color 120ms ease, color 120ms ease;",
    "}",
    M + " .MuiMenuItem-root:not(#tb-x) .MuiListItemText-root .MuiTypography-root {",
    "  font-family: var(--app-font, Inter, sans-serif) !important; font-size: 14px !important; font-weight: 500 !important;",
    "}",
    M + " .MuiMenuItem-root:not(#tb-x) .MuiListItemIcon-root { min-width: 32px !important; color: rgba(255, 255, 255, 0.6) !important; }",
    M + " .MuiMenuItem-root:not(#tb-x) .MuiSvgIcon-root { font-size: 20px !important; }",
    /* hover / remote focus: soft highlight + gold bar on the left */
    M + " .MuiMenuItem-root:not(#tb-x):hover, " + M + " .MuiMenuItem-root.Mui-focusVisible:not(#tb-x) {",
    "  background: rgba(255, 255, 255, 0.07) !important; color: #fff !important;",
    "}",
    M + " .MuiMenuItem-root:not(#tb-x)::before { content: ''; position: absolute; left: 0; top: 9px; bottom: 9px; width: 3px;",
    "  border-radius: 2px; background: " + ACC + "; opacity: 0; transform: scaleY(0.4); transition: opacity 120ms ease, transform 160ms ease; }",
    M + " .MuiMenuItem-root:not(#tb-x):hover::before, " + M + " .MuiMenuItem-root.Mui-focusVisible:not(#tb-x)::before { opacity: 1; transform: none; }",
    M + " .MuiMenuItem-root:not(#tb-x):hover .MuiListItemIcon-root, " + M + " .MuiMenuItem-root.Mui-focusVisible:not(#tb-x) .MuiListItemIcon-root { color: " + ACC + " !important; }",
    /* dividers */
    M + " .MuiDivider-root:not(#tb-x) { margin: 6px 8px !important; border-color: rgba(255, 255, 255, 0.08) !important; }",
    /* Sign out: muted red */
    M + " .MuiMenuItem-root:not(#tb-x):has(svg[data-testid='LogoutIcon']) { color: #ff7a7a !important; }",
    M + " .MuiMenuItem-root:not(#tb-x):has(svg[data-testid='LogoutIcon']) .MuiListItemIcon-root { color: #ff7a7a !important; }",
    M + " .MuiMenuItem-root:not(#tb-x):has(svg[data-testid='LogoutIcon']):hover { background: rgba(255, 90, 90, 0.1) !important; }",
    M + " .MuiMenuItem-root:not(#tb-x):has(svg[data-testid='LogoutIcon'])::before { background: #ff7a7a; }"
  ].join("\n");
  var style = document.createElement("style");
  style.id = "tb-user-menu";
  style.textContent = css;
  document.head.appendChild(style);
})();

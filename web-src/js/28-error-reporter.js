(function errorReporter() {
  if (!window.fetch || !window.Promise || window.__tbErrRep) return;
  window.__tbErrRep = true;

  var base = location.pathname.replace(/\/web(\/.*)?$/, "/");
  if (base.charAt(base.length - 1) !== "/") base += "/";
  var queue = [], busy = false, lastSent = 0;
  var THROTTLE = 2000, MAX_QUEUE = 20;

  function token() {
    try {
      var c = JSON.parse(localStorage.getItem("jellyfin_credentials") || "null");
      var servers = (c && c.Servers) || [], best = null;
      for (var i = 0; i < servers.length; i++) {
        var s = servers[i];
        if (s && s.AccessToken && (!best || (s.DateLastAccessed || 0) > (best.DateLastAccessed || 0))) best = s;
      }
      return best && best.AccessToken ? best.AccessToken : null;
    } catch (e) { return null; }
  }

  function version() {
    return (window.TB_CONFIG && window.TB_CONFIG.__version) || "";
  }

  function send(item) {
    var tk = token();
    if (!tk) return;
    var now = Date.now();
    if (now - lastSent < THROTTLE) {
      setTimeout(function () { if (queue.length) flush(); }, THROTTLE);
      return;
    }
    lastSent = now;
    if (busy) return;
    busy = true;
    fetch(base + "UshereatsTheme/errors", {
      method: "POST",
      headers: {
        Authorization: 'MediaBrowser Token="' + tk + '"',
        "Content-Type": "application/json"
      },
      body: JSON.stringify(item),
      keepalive: true
    })["catch"](function () {})["finally"](function () { busy = false; });
  }

  function flush() {
    if (!queue.length) return;
    send(queue.shift());
  }

  function enqueue(msg, stack, page) {
    if (queue.length >= MAX_QUEUE) return;
    queue.push({
      message: String(msg || "").slice(0, 500),
      stack: String(stack || "").slice(0, 1000),
      page: String(page || location.hash || "").slice(0, 200),
      browser: (navigator.userAgent || "").slice(0, 200),
      themeVersion: version()
    });
    flush();
  }

  window.onerror = function (msg, src, line, col, err) {
    var stack = (err && err.stack) ? err.stack : (src + ":" + line + ":" + col);
    enqueue(msg, stack, location.hash);
    return false;
  };

  window.addEventListener("unhandledrejection", function (e) {
    var reason = e.reason;
    var msg = reason instanceof Error ? reason.message : String(reason || "Unhandled rejection").slice(0, 500);
    var stack = reason instanceof Error && reason.stack ? reason.stack : "";
    enqueue(msg, stack, location.hash);
  });
})();

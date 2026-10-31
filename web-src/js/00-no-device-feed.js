(function noDeviceFeed() {
  // The dashboard's "Devices" list is not shown (the Now Playing panel replaces it), so its live feed is
  // never asked for: otherwise the server pushes every device/session to the browser every 1.5 s while
  // the dashboard is open. Only that one message ("SessionsStart") is dropped.
  if (!window.WebSocket || WebSocket.prototype.__tbNoSessions) return;
  var send = WebSocket.prototype.send;
  WebSocket.prototype.send = function (data) {
    if (typeof data === "string" && data.indexOf('"SessionsStart"') >= 0) return;
    return send.apply(this, arguments);
  };
  WebSocket.prototype.__tbNoSessions = true;
})();

// Shared helpers for every feature script. The plugin puts this at the top of theme.js (after TB_CONFIG),
// so each feature can rely on them in any load order. ES5: TVs run it too.
//   tbCfg(key, default)  a setting from TB_CONFIG
//   tbAdded(fn)          one page watcher: fn(addedElements) once per frame
//   tbCss(styleEl)       all feature styles go into one <style id="tb-js-css">
//   tbIn / tbUp          find matches inside / above a list of added elements
//   tbItems(ids, fields) poster lookups made within 30 ms merged into one request
//   tbWatch(fn)          whole-page watcher, once per frame (every 1.5 s while a video plays or the tab is hidden)
//   tbShared             one shared answer for your user / sessions when several scripts ask at once
//   tbEsc(text)          text made safe to put into HTML
window.tbCfg = function(k, d) {
  var c = window.TB_CONFIG || {}, v = c[k];
  return v === undefined || v === null || v === "" ? d : v;
};

window.tbAdded = window.tbAdded || function() {
  var subs = [], mo = null, pending = [], queued = false;
  function flush() {
    queued = false;
    var r = pending;
    pending = [];
    for (var i = 0; i < subs.length; i++) {
      try {
        subs[i](r);
      } catch (e) {}
    }
  }
  return function(fn) {
    subs.push(fn);
    if (!mo) {
      mo = new MutationObserver(function(l) {
        for (var i = 0; i < l.length; i++) {
          var a = l[i].addedNodes;
          for (var j = 0; j < a.length; j++) {
            if (a[j].nodeType === 1) pending.push(a[j]);
          }
        }
        if (pending.length && !queued) {
          queued = true;
          requestAnimationFrame(flush);
        }
      });
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  };
}();

window.tbCss = window.tbCss || function() {
  var el = null;
  return function(s) {
    if (!el) {
      el = document.getElementById("tb-js-css");
      if (!el) {
        el = document.createElement("style");
        el.id = "tb-js-css";
        document.head.appendChild(el);
      }
    }
    el.appendChild(document.createTextNode("\n" + s.textContent));
  };
}();

window.tbIn = function(roots, sel) {
  var out = [], seen = new Set;
  for (var i = 0; i < roots.length; i++) {
    var r = roots[i];
    if (!r.isConnected) continue;
    if (r.matches && r.matches(sel) && !seen.has(r)) {
      seen.add(r);
      out.push(r);
    }
    var l = r.querySelectorAll ? r.querySelectorAll(sel) : [];
    for (var j = 0; j < l.length; j++) {
      if (!seen.has(l[j])) {
        seen.add(l[j]);
        out.push(l[j]);
      }
    }
  }
  return out;
};

window.tbUp = function(roots, sel) {
  var out = [], seen = new Set;
  for (var i = 0; i < roots.length; i++) {
    var r = roots[i];
    if (!r.isConnected || !r.closest) continue;
    var c = r.closest(sel);
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
    var l = r.querySelectorAll(sel);
    for (var j = 0; j < l.length; j++) {
      if (!seen.has(l[j])) {
        seen.add(l[j]);
        out.push(l[j]);
      }
    }
  }
  return out;
};

window.tbItems = window.tbItems || function() {
  var q = null;
  function flush() {
    var b = q;
    if (!b) return;
    q = null;
    clearTimeout(b.t);
    var p = Promise.resolve(ApiClient.getItems(ApiClient.getCurrentUserId(), {
      Ids: Object.keys(b.ids).join(","),
      Fields: Object.keys(b.f).join(","),
      EnableImages: false
    }));
    for (var i = 0; i < b.w.length; i++) b.w[i](p);
  }
  return function(ids, fields) {
    return new Promise(function(res, rej) {
      if (!q) q = {
        ids: {},
        f: {},
        w: [],
        n: 0,
        t: setTimeout(flush, 30)
      };
      for (var i = 0; i < ids.length; i++) {
        if (!q.ids[ids[i]]) {
          q.ids[ids[i]] = 1;
          q.n++;
        }
      }
      String(fields || "").split(",").forEach(function(x) {
        if (x) q.f[x] = 1;
      });
      q.w.push(function(p) {
        p.then(function(r) {
          var want = {};
          for (var i = 0; i < ids.length; i++) want[ids[i]] = 1;
          res({
            Items: (r && r.Items || []).filter(function(it) {
              return want[it.Id];
            })
          });
        }, rej);
      });
      if (q.n >= 120) flush();
    });
  };
}();

window.tbWatch = window.tbWatch || function() {
  var subs = [], mo = null, last = 0, queued = false;
  function busy() {
    if (document.hidden) return true;
    var o = document.getElementById("videoOsdPage");
    return !!(o && !o.classList.contains("hide") && document.querySelector(".videoPlayerContainer"));
  }
  window.tbBusy = busy;
  function run() {
    queued = false;
    if (busy()) {
      var n = Date.now();
      if (n - last < 1500) return;
      last = n;
    }
    for (var i = 0; i < subs.length; i++) {
      try {
        subs[i]();
      } catch (e) {}
    }
  }
  function fire() {
    if (queued) return;
    queued = true;
    if (document.hidden || document.documentElement.classList.contains("tb-vt")) setTimeout(run, 0); else requestAnimationFrame(run);
  }
  document.addEventListener("visibilitychange", function() {
    if (!document.hidden) fire();
  });
  return function(fn) {
    subs.push(fn);
    if (!mo) {
      mo = new MutationObserver(fire);
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
    }
  };
}();

window.tbShared = window.tbShared || function() {
  var m = {};
  function c(k, t, f) {
    var e = m[k], n = Date.now();
    if (e && n - e.t < t) return e.p;
    var p = Promise.resolve().then(f);
    m[k] = {
      t: n,
      p: p
    };
    p.catch(function() {
      if (m[k] && m[k].p === p) delete m[k];
    });
    return p;
  }
  return {
    user: function() {
      var id = ApiClient.getCurrentUserId();
      return c("u:" + id, 1e4, function() {
        return ApiClient.getUser(id);
      });
    },
    sessions: function(q) {
      return c("s:" + JSON.stringify(q || {}), 4e3, function() {
        return ApiClient.getSessions(q);
      });
    }
  };
}();

window.tbEsc = window.tbEsc || function(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function(c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
};

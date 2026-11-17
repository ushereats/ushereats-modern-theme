// Collects every stylesheet the theme ships: base look + theme.css + the CSS each feature script adds at runtime.
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '../../src/Jellyfin.Plugin.UshereatsTheme/Assets');
module.exports = async function collect(browser) {
  const p = await browser.newPage();
  await p.setContent('<html><head></head><body></body></html>');
  const files = ['core.js'].concat(fs.readdirSync(A).filter((f) => /^js_\d+_.*\.js$/.test(f)).sort());
  const css = await p.evaluate((scripts) => {
    const fn = () => fn; const stub = new Proxy(fn, { get: (t, k) => (k === 'then' ? undefined : (...a) => Promise.resolve({ Items: [], TotalRecordCount: 0 })), apply: () => Promise.resolve({}) });
    window.ApiClient = stub; window.TB_CONFIG = window.TB_CONFIG || {}; window.Emby = {}; window.require = () => {};
    const fails = [];
    for (const [name, code] of scripts) { try { (0, eval)(code); } catch (e) { fails.push(name + ': ' + e.message); } }
    const out = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
    return { out, fails };
  }, files.map((f) => [f, fs.readFileSync(path.join(A, f), 'utf8')]));
  await p.close();
  const look = fs.readFileSync(path.join(A, 'look.css'), 'utf8');
  const theme = fs.readFileSync(path.join(__dirname, '../../web-src/theme.css'), 'utf8');
  const jf = fs.readFileSync(path.join(__dirname, 'jellyfin.css'), 'utf8');
  return { css: (jf + '\n' + look + '\n.tb-look-end{--tb-look-end:1}\n' + theme + '\n' + css.out).replace(/__TB_[A-Z_]+__/g, '1'), fails: css.fails };
};

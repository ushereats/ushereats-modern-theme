// Style checker: proves a CSS change didn't change how anything looks.
//   npm run check-styles -- save   snapshot the current build (do this before a change)
//   npm run check-styles           rebuild-free compare against the snapshot (run after `node build-assets.mjs`)
// It renders, for every selector the theme ships (base look, theme.css and the scripts' own styles), a small piece of
// markup that selector matches, plus a sample of real Jellyfin pages, and compares every computed style property
// (hover/focus states forced where a selector needs them). Snapshot lives in ci/styles/.baseline (not committed).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { chromium } = require('playwright');
const postcss = require('postcss');
const sp = require('postcss-selector-parser');
const collect = require('./collect.cjs');
const DIR = path.join(__dirname, '.baseline'), FILE = path.join(DIR, 'snapshot.json.gz');
const SVG = new Set(['svg', 'path', 'circle', 'rect', 'g', 'line', 'polyline', 'polygon', 'use']);
const STATE = new Set(['hover', 'focus', 'focus-visible', 'focus-within', 'active']);

function compound() { return { tag: '', id: '', classes: [], attrs: [], has: [], states: [], pe: '' }; }
function simpleInto(c, n) {   // a simple selector node into a compound; false = can't build it
  if (n.type === 'tag') c.tag = n.value.toLowerCase();
  else if (n.type === 'id') c.id = n.value;
  else if (n.type === 'class') c.classes.push(n.value);
  else if (n.type === 'attribute') c.attrs.push([n.attribute, n.value != null ? String(n.value).replace(/^["']|["']$/g, '') : '']);
  else if (n.type === 'universal' || n.type === 'nesting' || n.type === 'comment') { /* nothing */ }
  else if (n.type === 'pseudo') {
    const v = n.value.toLowerCase().replace(/^:+/, '');
    if (n.value.startsWith('::') || v === 'before' || v === 'after') { c.pe = '::' + v; return true; }
    if (STATE.has(v)) { c.states.push(v); return true; }
    if (v === 'checked') { c.attrs.push(['checked', '']); return true; }
    if (v === 'disabled') { c.attrs.push(['disabled', '']); return true; }
    if (v === 'root') { c.tag = 'html'; return true; }
    if (v === 'is' || v === 'where' || v === 'matches' || v === '-webkit-any') {
      const first = n.nodes[0]; if (!first || first.nodes.some((x) => x.type === 'combinator')) return false;
      for (const x of first.nodes) if (!simpleInto(c, x)) return false;
      return true;
    }
    if (v === 'has') {
      const first = n.nodes[0]; if (!first) return false;
      const inner = compound(); let ok = true;
      first.nodes.forEach((x, i) => { if (i === 0 && x.type === 'combinator') return; if (x.type === 'combinator') ok = false; else if (!simpleInto(inner, x)) ok = false; });
      if (!ok) return false; c.has.push(inner); return true;
    }
    return true;   // :not(), :nth-*, :first-child, :empty …: ignored (the piece may or may not match; it is checked below)
  }
  return true;
}
function plan(selector) {   // -> {html, body, chain:[{c, rel}]} or null
  let out = null;
  try {
    sp((root) => {
      if (root.nodes.length !== 1) return;
      const chain = []; let cur = compound(), rel = '';
      for (const n of root.nodes[0].nodes) {
        if (n.type === 'combinator') { chain.push({ c: cur, rel }); rel = n.value.trim() || ' '; cur = compound(); continue; }
        if (!simpleInto(cur, n)) return;
      }
      chain.push({ c: cur, rel });
      const res = { html: compound(), body: compound(), chain: [] };
      for (const x of chain) {
        if (x.c.tag === 'html') { Object.assign(res.html, x.c); continue; }
        if (x.c.tag === 'body') { Object.assign(res.body, x.c); continue; }
        res.chain.push(x);
      }
      if (!res.chain.length) return;
      res.chain[0].rel = '';
      out = res;
    }).processSync(selector);
  } catch { return null; }
  return out;
}

async function snapshot(browser, css) {
  const sels = new Set();
  postcss.parse(css).walkRules((r) => { if (r.parent.type === 'atrule' && /keyframes/.test(r.parent.name)) return; r.selectors.forEach((s) => sels.add(s.trim())); });
  const groups = new Map();
  const planned = [];
  for (const s of sels) { const p = plan(s); if (p) planned.push([s, p]); }
  // pieces matched by two selectors at once (same element), so rules that compete are checked against each other
  const bySubject = new Map();
  for (const [s, p] of planned) {
    const sub = p.chain[p.chain.length - 1].c;
    for (const k of sub.classes.concat(sub.id ? ['#' + sub.id] : [])) { if (!bySubject.has(k)) bySubject.set(k, []); bySubject.get(k).push([s, p]); }
  }
  const pairs = new Set(), extra = [];
  const ok = (p) => p.chain.every((x) => x.rel === '' || x.rel === ' ' || x.rel === '>');
  for (const list of bySubject.values()) {
    if (list.length > 60) continue;
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      let [sa, a] = list[i], [sb, b] = list[j];
      if (!ok(a) || !ok(b)) continue;
      const ra = a.chain[a.chain.length - 1].rel, rb = b.chain[b.chain.length - 1].rel;
      if (ra === '>' && rb === '>') continue;
      if (ra === '>') { [sa, a, sb, b] = [sb, b, sa, a]; }   // the one that needs a direct parent goes inside
      const key = sa + ' || ' + sb; if (pairs.has(key)) continue; pairs.add(key);
      const sa_ = a.chain[a.chain.length - 1].c, sb_ = b.chain[b.chain.length - 1].c;
      const subj = { tag: sb_.tag || sa_.tag, id: sb_.id || sa_.id, classes: [...new Set(sa_.classes.concat(sb_.classes))], attrs: sa_.attrs.concat(sb_.attrs), has: sa_.has.concat(sb_.has), states: [...new Set(sa_.states.concat(sb_.states))], pe: sb_.pe || sa_.pe };
      if (sa_.tag && sb_.tag && sa_.tag !== sb_.tag) continue;
      const chain = a.chain.slice(0, -1).concat(b.chain.slice(0, -1).map((x, k) => ({ c: x.c, rel: k === 0 ? ' ' : x.rel })), [{ c: subj, rel: b.chain.length > 1 ? rb : (a.chain.length > 1 ? ' ' : '') }]);
      chain[0].rel = '';
      const merge = (x, y) => ({ ...x, classes: [...new Set(x.classes.concat(y.classes))], attrs: x.attrs.concat(y.attrs), id: x.id || y.id });
      extra.push([key, { html: merge(a.html, b.html), body: merge(a.body, b.body), chain }]);
    }
  }
  for (const [s, p] of planned.concat(extra)) {
    const key = JSON.stringify([p.html.classes.sort(), p.html.attrs, p.body.classes.sort(), p.body.attrs, p.html.id, p.body.id]);
    if (!groups.has(key)) groups.set(key, { html: p.html, body: p.body, items: [] });
    groups.get(key).items.push({ s, chain: p.chain });
  }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const out = {};
  const sample = fs.readFileSync(path.join(__dirname, 'sample.html'), 'utf8');
  const pages = [{ name: 'sample', html: sample.replace('/*CSS*/', () => css) }];
  for (const [key, g] of groups) pages.push({ name: key, g });
  for (const pg of pages) {
    if (pg.html) await page.setContent(pg.html);
    else await page.setContent('<html><head><style>' + css.replace(/<\/style/gi, '') + '</style></head><body></body></html>');
    const forced = await page.evaluate(({ g, SVG }) => {
      const mk = (c) => {
        const tag = c.tag && c.tag !== '*' ? c.tag : 'div';
        const e = SVG.includes(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
        if (c.id) e.id = c.id;
        c.classes.forEach((x) => e.classList.add(x));
        c.attrs.forEach(([a, v]) => { try { e.setAttribute(a, v); } catch (err) { /* odd attribute name */ } });
        (c.has || []).forEach((h) => e.appendChild(mk(h)));
        return e;
      };
      const apply = (el, c) => { c.classes.forEach((x) => el.classList.add(x)); c.attrs.forEach(([a, v]) => el.setAttribute(a, v)); if (c.id) el.id = c.id; };
      document.querySelectorAll('[data-tb-snap]').forEach((e) => e.removeAttribute('data-tb-snap'));
      if (g) {
        apply(document.documentElement, g.html); apply(document.body, g.body);
        g.items.forEach((it, i) => {
          let prev = null, parent = document.body;
          it.chain.forEach((x, k) => {
            const e = mk(x.c);
            if (x.rel === '+' || x.rel === '~') { (prev.parentNode || parent).appendChild(e); }
            else { (prev || parent).appendChild(e); }
            if (x.c.states.length) e.setAttribute('data-tb-state', x.c.states.join(' '));
            prev = e;
            if (k === it.chain.length - 1) e.setAttribute('data-tb-snap', String(i));
          });
        });
      } else {
        document.querySelectorAll('body *').forEach((e, i) => e.setAttribute('data-tb-snap', String(i)));
      }
      return document.querySelectorAll('[data-tb-state]').length;
    }, { g: pg.g || null, SVG: [...SVG] });
    if (forced.length) {
      const doc = await cdp.send('DOM.getDocument', { depth: -1 });
      const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: '[data-tb-state]' });
      for (const nodeId of nodeIds) {
        const { attributes } = await cdp.send('DOM.getAttributes', { nodeId });
        const st = attributes[attributes.indexOf('data-tb-state') + 1];
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: st.split(' ') });
      }
    }
    const snap = await page.evaluate(({ g, name }) => {
      document.getAnimations().forEach((a) => { try { a.pause(); a.currentTime = 0; } catch (e) { /* not seekable */ } });
      const res = {};
      document.querySelectorAll('[data-tb-snap]').forEach((e) => {
        const i = +e.getAttribute('data-tb-snap');
        const label = g ? g.items[i].s : name + ':' + i + ':' + e.tagName + '.' + [...e.classList].join('.');
        for (const ps of [null, '::before', '::after']) {
          const cs = getComputedStyle(e, ps);
          if (ps && (cs.content === 'none' || cs.content === 'normal')) continue;
          const o = []; for (let k = 0; k < cs.length; k++) o.push(cs[k] + ':' + cs.getPropertyValue(cs[k]));
          res[label + (ps || '')] = o.join('\n');
        }
      });
      return res;
    }, { g: pg.g || null, name: pg.name });
    Object.assign(out, snap);
  }
  await page.close();
  return out;
}

(async () => {
  const save = process.argv.includes('save');
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  const { css, fails } = await collect(browser);
  if (fails.length) console.log('scripts that could not run here (their styles are missing):\n  ' + fails.join('\n  '));
  const snap = await snapshot(browser, css);
  await browser.close();
  if (save) {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, zlib.gzipSync(JSON.stringify(snap)));
    console.log('saved', Object.keys(snap).length, 'styled pieces');
    return;
  }
  if (!fs.existsSync(FILE)) { console.error('no snapshot: run `npm run check-styles -- save` first'); process.exit(2); }
  const base = JSON.parse(zlib.gunzipSync(fs.readFileSync(FILE)));
  let diffs = 0; const lines = [];
  for (const k of Object.keys(base)) {
    if (!(k in snap)) continue;   // selector removed/renamed: nothing to compare
    if (base[k] === snap[k]) continue;
    const a = Object.fromEntries(base[k].split('\n').map((x) => [x.slice(0, x.indexOf(':')), x.slice(x.indexOf(':') + 1)]));
    const b = Object.fromEntries(snap[k].split('\n').map((x) => [x.slice(0, x.indexOf(':')), x.slice(x.indexOf(':') + 1)]));
    for (const p of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[p] !== b[p]) { diffs++; if (lines.length < 60) lines.push(k.slice(0, 120) + ' | ' + p + ' | ' + a[p] + ' -> ' + b[p]); }
  }
  const ji = process.argv.indexOf('--json');
  if (ji > 0) fs.writeFileSync(process.argv[ji + 1], JSON.stringify(Object.keys(base).filter((k) => k in snap && base[k] !== snap[k])));
  const gone = Object.keys(base).filter((k) => !(k in snap)).length, added = Object.keys(snap).filter((k) => !(k in base)).length;
  console.log(lines.join('\n'));
  console.log(`compared ${Object.keys(base).length - gone} styled pieces: ${diffs} differences (${gone} no longer exist, ${added} new)`);
  process.exit(diffs ? 1 : 0);
})();

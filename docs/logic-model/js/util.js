/* =============================================================================
   util.js — small shared helpers: ids, cloning, DOM building, color math,
   safe localStorage, downloads, events.

   Every file in js/ is a plain "classic" script (no modules, no build step) so
   the app also works when index.html is opened straight from disk. Each file
   adds its piece to one global object, window.LMB ("Logic Model Builder").
   ========================================================================== */
(function () {
  'use strict';
  var LMB = (window.LMB = window.LMB || {});
  var U = {};

  /* ---------- ids & data ---------- */
  var counter = 0;
  /** Short unique id, e.g. uid('i') -> "i3kf9a2b". */
  U.uid = function (prefix) {
    counter = (counter + 1) % 1679616;
    return (prefix || '') + Date.now().toString(36).slice(-4) +
      Math.random().toString(36).slice(2, 6) + counter.toString(36);
  };
  U.clone = function (o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); };

  /** Structural equality for JSON-like values (key order does not matter). */
  U.deepEqual = function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      for (var i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
      return true;
    }
    var ka = Object.keys(a).filter(function (k) { return a[k] !== undefined; });
    var kb = Object.keys(b).filter(function (k) { return b[k] !== undefined; });
    if (ka.length !== kb.length) return false;
    for (var j = 0; j < ka.length; j++) if (!deepEqual(a[ka[j]], b[ka[j]])) return false;
    return true;
  };

  U.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  U.round = function (v, step) { step = step || 1; return Math.round(v / step) * step; };
  U.isBlank = function (s) { return !s || !String(s).trim(); };

  U.debounce = function (fn, ms) {
    var t = null;
    var d = function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
    d.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    d.cancel = function () { clearTimeout(t); t = null; };
    return d;
  };

  /** Run fn at most once per animation frame. */
  U.rafThrottle = function (fn) {
    var queued = false;
    return function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn(); });
    };
  };

  U.slug = function (s) {
    var out = String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
    return out || 'untitled';
  };

  /**
   * Remove invisible control characters that copy-paste from PDFs and
   * PowerPoint brings along (U+0002 for a hyphen, U+000C at a page break,
   * U+000B for a PowerPoint soft return, ...). XML forbids most of them, so
   * one stray character would break every SVG/PNG export.
   *   multiline = true   line breaks (U+000B, a PowerPoint soft return, and
   *                      U+2028/9, U+0085) become "\n"; otherwise a space.
   *   A page break (U+000C, mid-sentence in PDF text) always becomes a space.
   * Tabs, newlines and ordinary text are left alone; lone halves of an emoji
   * (unpaired surrogates) are dropped.
   */
  var BREAKS = /[\u000B\u0085\u2028\u2029]/g;
  var BAD = /[\u0000-\u0008\u000E-\u001F\u007F-\u009F\uFFFE\uFFFF]/g;
  var SURROGATES = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;
  U.cleanText = function (s, multiline) {
    s = String(s == null ? '' : s);
    if (!U.hasBadChars(s)) return s; // fast path: nearly every string
    return s.replace(BREAKS, multiline ? '\n' : ' ').replace(/\u000C/g, ' ').replace(BAD, '')
      .replace(SURROGATES, function (m) { return m.length === 2 ? m : ''; });
  };
  var ANY_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u2028\u2029\uD800-\uDFFF\uFFFE\uFFFF]/;
  U.hasBadChars = function (s) { return ANY_BAD.test(s); };

  /** Escape text for SVG/HTML output (also drops XML-illegal characters). */
  U.escXML = function (s) {
    return U.cleanText(s, false).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  U.escHTML = U.escXML;

  /** Format a number for SVG output: at most 2 decimals, no trailing zeros. */
  U.n = function (v) {
    if (!isFinite(v)) return '0';
    var r = Math.round(v * 100) / 100;
    return String(r === 0 ? 0 : r);
  };

  U.isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
  U.modKey = function (e) { return U.isMac ? e.metaKey : e.ctrlKey; };
  U.modLabel = U.isMac ? '⌘' : 'Ctrl+';

  /* ---------- DOM ---------- */
  /**
   * h('button', {class: 'x', onclick: fn, attrs: {'aria-label': 'Close'}}, 'Close')
   * Tiny hyperscript helper used to build the UI in code.
   */
  U.h = function (tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'attrs') Object.keys(v).forEach(function (a) { if (v[a] != null && v[a] !== false) el.setAttribute(a, v[a] === true ? '' : v[a]); });
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k in el) { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v);
    });
    for (var i = 2; i < arguments.length; i++) U.append(el, arguments[i]);
    return el;
  };
  U.append = function (el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { U.append(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  };
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /** Inline SVG icon (24-unit stroke icons drawn in icons below). */
  U.icon = function (name, size) {
    var body = U.ICONS[name] || '';
    size = size || 18;
    return '<svg class="ico" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  };
  U.ICONS = {
    // Undo / redo: a hook-shaped arrow, the head joined to the shaft.
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    grip: '<circle cx="9" cy="6" r="1.3"/><circle cx="15" cy="6" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="18" r="1.3"/><circle cx="15" cy="18" r="1.3"/>',
    up: '<path d="m6 15 6-6 6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    pointer: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5A6 6 0 0 1 5 18l-2-4a1.5 1.5 0 0 1 2.6-1.5L8 15"/>',
    arrow: '<path d="M4 20 19 5"/><path d="M10 5h9v9"/>',
    line: '<path d="M4 20 20 4"/>',
    rect: '<rect x="3.5" y="6" width="17" height="12"/>',
    rounded: '<rect x="3.5" y="6" width="17" height="12" rx="3.5"/>',
    pill: '<rect x="3" y="7" width="18" height="10" rx="5"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="9" ry="6.5"/>',
    diamond: '<path d="M12 3.5 21 12l-9 8.5L3 12z"/>',
    hexagon: '<path d="M7.5 5.5h9L21 12l-4.5 6.5h-9L3 12z"/>',
    parallelogram: '<path d="M7 6h14l-4 12H3z"/>',
    chevron: '<path d="M3 6h13l5 6-5 6H3z"/>',
    note: '<path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/>',
    text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    // Bracket: drawn as the diagram's Control / Influence bracket (which is how
    // a new one is placed): a label over a wide, flat bracket opening down.
    bracket: '<path d="M8 5.5h8"/><path d="M3 17v-3.5A2.5 2.5 0 0 1 5.5 11h13a2.5 2.5 0 0 1 2.5 2.5V17"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    magnet: '<path d="M6 4v8a6 6 0 0 0 12 0V4"/><path d="M6 8h4M14 8h4"/>',
    front: '<rect x="8" y="8" width="12" height="12" fill="currentColor" fill-opacity=".25"/><path d="M4 16V4h12"/>',
    back: '<rect x="4" y="4" width="12" height="12"/><path d="M8 20h12V8" /><rect x="8" y="8" width="12" height="12" fill="currentColor" fill-opacity=".25" stroke="none"/>',
    // all the way: the same, with one more layer passed
    tofront: '<path d="M3 14V3h11"/><path d="M6.5 17.5v-11h11"/><rect x="10" y="10" width="11" height="11" fill="currentColor" fill-opacity=".25"/>',
    toback: '<rect x="10" y="10" width="11" height="11" fill="currentColor" fill-opacity=".25" stroke="none"/><path d="M10 17.5v3.5h11V10h-3.5"/><path d="M6.5 14v3.5h11v-11H14"/><rect x="3" y="3" width="11" height="11"/>',
    rotate: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    pencil: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V4H4v12h4"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    print: '<path d="M7 8V3h10v5M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/>',
    table: '<rect x="3.5" y="5" width="17" height="14"/><path d="M3.5 10h17M9.5 5v14M15 5v14"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5.5-5 4 3.5 2.5-2 4 3.5"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v6M12 7.5v.5"/>',
    layout: '<rect x="3.5" y="4" width="5" height="16"/><rect x="10" y="4" width="5" height="16"/><rect x="16.5" y="4" width="4" height="16"/>',
    alignL: '<path d="M4 3v18"/><rect x="7" y="6" width="12" height="4"/><rect x="7" y="14" width="7" height="4"/>',
    alignC: '<path d="M12 3v18"/><rect x="5" y="6" width="14" height="4"/><rect x="8" y="14" width="8" height="4"/>',
    alignR: '<path d="M20 3v18"/><rect x="5" y="6" width="12" height="4"/><rect x="10" y="14" width="7" height="4"/>',
    alignT: '<path d="M3 4h18"/><rect x="6" y="7" width="4" height="12"/><rect x="14" y="7" width="4" height="7"/>',
    alignM: '<path d="M3 12h18"/><rect x="6" y="5" width="4" height="14"/><rect x="14" y="8" width="4" height="8"/>',
    alignB: '<path d="M3 20h18"/><rect x="6" y="5" width="4" height="12"/><rect x="14" y="10" width="4" height="7"/>',
    distH: '<path d="M4 3v18M20 3v18"/><rect x="9" y="8" width="6" height="8"/>',
    distV: '<path d="M3 4h18M3 20h18"/><rect x="8" y="9" width="8" height="6"/>',
    textL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    textC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
    textR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
    bold: '<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>',
    italic: '<path d="M10 5h8M6 19h8M14 5l-4 14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>'
  };

  /* ---------- color ---------- */
  U.parseColor = function (c) {
    if (!c || c === 'none' || c === 'transparent') return null;
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).trim());
    if (!m) return null;
    var hex = m[1];
    if (hex.length === 3) hex = hex.split('').map(function (x) { return x + x; }).join('');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  };
  U.toHex = function (rgb) {
    return '#' + rgb.map(function (v) { return ('0' + Math.round(U.clamp(v, 0, 255)).toString(16)).slice(-2); }).join('');
  };
  /** Blend color a toward b by t (0 = a, 1 = b). */
  U.mix = function (a, b, t) {
    var A = U.parseColor(a), B = U.parseColor(b);
    if (!A || !B) return a;
    return U.toHex([0, 1, 2].map(function (i) { return A[i] + (B[i] - A[i]) * t; }));
  };
  U.luminance = function (c) {
    var rgb = U.parseColor(c);
    if (!rgb) return 1;
    var v = rgb.map(function (x) { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  /** WCAG contrast ratio between two colors. */
  U.contrast = function (a, b) {
    var la = U.luminance(a), lb = U.luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  /** Darken (or lighten, on dark backgrounds) fg until it reaches `ratio` against every bg. */
  U.ensureContrast = function (fg, bgs, ratio) {
    bgs = [].concat(bgs).filter(Boolean);
    ratio = ratio || 4.5;
    var ok = function (c) { return bgs.every(function (b) { return U.contrast(c, b) >= ratio; }); };
    if (ok(fg)) return fg;
    var darkBg = bgs.every(function (b) { return U.luminance(b) < 0.2; });
    var target = darkBg ? '#ffffff' : '#000000';
    for (var t = 0.05; t <= 1.001; t += 0.05) {
      var c = U.mix(fg, target, t);
      if (ok(c)) return c;
    }
    return target;
  };
  /** Pick whichever candidate text color reads best on bg. */
  U.bestOn = function (bg, candidates) {
    candidates = candidates || ['#ffffff', '#102a43'];
    var best = candidates[0], bestR = 0;
    candidates.forEach(function (c) { var r = U.contrast(c, bg); if (r > bestR) { bestR = r; best = c; } });
    return best;
  };

  /* ---------- events ---------- */
  U.emitter = function () {
    var map = {};
    return {
      on: function (ev, fn) { (map[ev] = map[ev] || []).push(fn); return function () { map[ev] = (map[ev] || []).filter(function (f) { return f !== fn; }); }; },
      emit: function (ev, data) { (map[ev] || []).slice().forEach(function (fn) { fn(data); }); }
    };
  };

  /* ---------- storage (never throws) ---------- */
  U.storage = {
    get: function (key) {
      try { var v = window.localStorage.getItem(key); return v == null ? null : JSON.parse(v); } catch (e) { return null; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove: function (key) { try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  };

  /* ---------- files ---------- */
  U.download = function (filename, data, mime) {
    var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = U.h('a', { href: url, download: filename, style: { display: 'none' } });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
  };

  LMB.util = U;
})();

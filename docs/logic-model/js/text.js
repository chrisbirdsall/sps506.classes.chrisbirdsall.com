/* =============================================================================
   text.js — fonts, text measurement and line wrapping.

   The diagram is drawn with real SVG <text> lines (never HTML inside SVG), so
   wrapping is done here, in JavaScript, by measuring words with a hidden
   <canvas>. The canvas uses exactly the same font stack the SVG uses, so what
   is measured is what is drawn.

   FONT CHOICES live in T.FONTS below. Only installed system fonts are used —
   nothing is downloaded.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var T = {};

  /** Font choices shown in the Design panel. `stack` is the CSS font-family. */
  T.FONTS = {
    avenir: { label: 'Avenir (course look)', stack: '"Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif' },
    sans: { label: 'Helvetica / Arial', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
    serif: { label: 'Times New Roman', stack: '"Times New Roman", Times, serif' },
    georgia: { label: 'Georgia', stack: 'Georgia, "Times New Roman", serif' }
  };
  T.stack = function (key) { return (T.FONTS[key] || T.FONTS.avenir).stack; };

  /** Line height as a multiple of font size. */
  T.LINE_HEIGHT = 1.26;
  /** Wrap a little short of the box edge so text never kisses the border,
      even if the SVG is opened on a computer whose fallback font is wider. */
  T.SLACK = 0.965;

  var ctx = null;
  var cache = new Map();
  function getCtx() {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    return ctx;
  }
  /** CSS font shorthand for a spec {size, bold, italic, stack}. */
  T.fontCSS = function (spec) {
    return (spec.italic ? 'italic ' : '') + (spec.bold ? '700 ' : '400 ') + spec.size + 'px ' + spec.stack;
  };
  /** Width of a string in diagram units (CSS px). Cached. */
  T.width = function (str, spec) {
    var f = T.fontCSS(spec);
    var key = f + '\u0001' + str;
    var w = cache.get(key);
    if (w === undefined) {
      var c = getCtx();
      c.font = f;
      w = c.measureText(str).width;
      if (cache.size > 40000) cache.clear();
      cache.set(key, w);
    }
    return w;
  };
  /** Forget cached widths (called once system fonts have finished loading). */
  T.clearCache = function () { cache.clear(); };

  /**
   * Pieces of a word where a line may break after a hyphen ("first-" /
   * "generation"). A piece of 3 letters or fewer never stands alone, so
   * "follow-up", "one-on-one" and "e-mail" stay whole. (Written without a
   * regex lookbehind, which older iPhones and iPads can't read at all.)
   */
  function hyphenPieces(w) {
    var raw = w.replace(/([A-Za-z]-)(?=[A-Za-z])/g, '$1\u0000').split('\u0000');
    var letters = function (p) { return p.replace(/[^A-Za-z]/g, '').length; };
    var out = [raw[0]];
    for (var i = 1; i < raw.length; i++) {
      if (letters(raw[i - 1]) <= 3 || letters(raw[i]) <= 3) out[out.length - 1] += raw[i];
      else out.push(raw[i]);
    }
    return out;
  }

  /**
   * Split text into lines no wider than maxW. Honors explicit newlines.
   * The result is an array of lines with one extra number on it, `broken`:
   * how many times a word too long for the box had to be split inside the
   * word (each split ends its line with a hyphen). Layout uses it to widen
   * columns, and the Write and Design steps warn about it.
   */
  T.wrap = function (text, spec, maxW) {
    var out = [];
    out.broken = 0;
    maxW = Math.max(4, maxW);
    String(text == null ? '' : text).replace(/\r/g, '').split('\n').forEach(function (hard) {
      var words = hard.split(/[ \t]+/).filter(function (w) { return w.length; });
      if (!words.length) { out.push(''); return; }
      var tokens = [];
      words.forEach(function (w) {
        hyphenPieces(w).forEach(function (p, i) { tokens.push({ t: p, glue: i > 0 }); });
      });
      var line = '';
      tokens.forEach(function (tok) {
        var word = tok.t;
        var test = line ? line + (tok.glue ? '' : ' ') + word : word;
        if (T.width(test, spec) <= maxW) { line = test; return; }
        if (line) out.push(line);
        if (T.width(word, spec) <= maxW) { line = word; return; }
        // A single word longer than the box: break it by characters, with a
        // hyphen at each break so it still reads as one word.
        var chunk = '';
        Array.from(word).forEach(function (ch) {
          if (chunk.length > 1 && T.width(chunk + ch + '-', spec) > maxW) { out.push(chunk + '-'); out.broken++; chunk = ch; } else chunk += ch;
        });
        line = chunk;
      });
      out.push(line);
    });
    return out;
  };

  /**
   * Lay out a list of paragraphs inside a box of the given width.
   *   paras: [{text, size, bold, italic, color, align, bullet, before}]
   * Returns {lines: [{text, x, y, size, bold, italic, color, anchor}], height, broken}
   * where y is the text baseline measured from the top of the box, and
   * broken counts words split inside the word (see T.wrap).
   */
  T.layoutParas = function (paras, width, stack) {
    var lines = [];
    var y = 0;
    var first = true;
    var broken = 0;
    paras.forEach(function (p) {
      if (p.text == null) return;
      var spec = { size: p.size, bold: !!p.bold, italic: !!p.italic, stack: stack };
      var lh = p.size * T.LINE_HEIGHT;
      if (!first) y += p.before != null ? p.before : 0;
      first = false;
      var indent = 0;
      if (p.bullet) indent = T.width('•', spec) + p.size * 0.5;
      var wrapped = T.wrap(p.text, spec, (width - indent) * T.SLACK);
      broken += wrapped.broken;
      var align = p.bullet ? 'left' : (p.align || 'left');
      wrapped.forEach(function (ln, i) {
        var baseline = y + lh / 2 + p.size * 0.35;
        if (p.bullet && i === 0) {
          lines.push({ text: '•', x: 0, y: baseline, size: p.size, bold: false, italic: false, color: p.bulletColor || p.color, anchor: 'start' });
        }
        var x = align === 'center' ? indent + (width - indent) / 2 : align === 'right' ? width : indent;
        lines.push({
          text: ln, x: x, y: baseline, size: p.size, bold: !!p.bold, italic: !!p.italic,
          color: p.color, anchor: align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start'
        });
        y += lh;
      });
    });
    return { lines: lines, height: y, broken: broken };
  };

  LMB.text = T;
})();

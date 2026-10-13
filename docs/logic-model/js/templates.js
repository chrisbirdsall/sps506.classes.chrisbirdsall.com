/* =============================================================================
   templates.js — the three LAYOUT TEMPLATES.

   Each template has:
     name, blurb       shown in the Design panel
     defaultPage       page size chosen when switching to it
     defaultShow       which optional parts are on when switching to it
     supports          optional parts the template knows how to place
     panelPad          space inside a column panel around its boxes (× L.s)
     style(role, st)   tweaks the base style of a role (content.js) for this look
     edgeStyle(edge)   tweaks the automatic arrows
     layout(L)         places every visible linked box. L is a small helper API
                       built in layout.js:
                         L.X0, L.Y0, L.W   left, top and width of the page area
                         L.s               scale factor (base font size / 11)
                         L.chain           section keys in the chain (in order)
                         L.node(id)        a visible node, or null
                         L.items(key)      visible item nodes of a section
                         L.need(node, w)   height needed for its text at width w
                         L.breaks(node, w) words that must be split to fit width w
                         L.put(node, x, y, w, h)
                         L.bottom          lowest edge put so far
   Node ids used by layouts: title, theory, problem, context, assumptions,
   pnl-<section> (panel), hdr-<section> (header), brk-control, brk-influence,
   world, str-program, str-outcome, related.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, TH = LMB.themes;

  function isProg(k) { return TH.PROGRAM.indexOf(k) >= 0; }
  function isOut(k) { return TH.OUTCOME.indexOf(k) >= 0; }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }

  /** Title + theory at the top. Returns the y where content starts. */
  function header(L, y, center) {
    var title = L.node('title'), theory = L.node('theory');
    if (title) {
      var h = L.need(title, L.W);
      L.put(title, L.X0, y, L.W, h);
      y += h + 3 * L.s;
    }
    if (theory) {
      var tw = Math.min(L.W, 900 * L.s);
      var th = L.need(theory, tw);
      L.put(theory, center ? L.X0 + (L.W - tw) / 2 : L.X0, y, tw, th);
      y += th;
    }
    if (title || theory) y += 16 * L.s;
    return y;
  }

  /**
   * Shared column layout for the two landscape templates: panels side by side,
   * header on top of each, items stacked. Returns geometry for brackets etc.
   *   opt: left, width, gap, bigGap (gap between program and outcome
   *        columns), pad, headerGap, itemGap, minH, and optionally `tight`:
   *        smaller gap / bigGap / pad to try when a word is too long for the
   *        columns (on a portrait page, say).
   */
  function columnsRow(L, opt) {
    var g = measureColumns(L, opt);
    if (g.broken && opt.tight) {
      var g2 = measureColumns(L, Object.assign({}, opt, opt.tight));
      if (g2.broken < g.broken) g = g2;
    }
    return g;
  }
  function measureColumns(L, opt) {
    var cols = L.chain;
    var n = cols.length;
    var left = opt.left, width = opt.width;
    var gap = opt.gap, big = opt.bigGap;
    var gaps = [];
    for (var i = 0; i < n - 1; i++) gaps.push(isProg(cols[i]) && isOut(cols[i + 1]) ? big : gap);
    var cw = n ? (width - sum(gaps)) / n : 0;
    var xs = [], x = left;
    cols.forEach(function (k, i) { xs.push(x); x += cw + (gaps[i] || 0); });
    var pad = opt.pad, hg = opt.headerGap, ig = opt.itemGap;
    var inner = cw - 2 * pad;
    var broken = 0;
    // Every header gets the height of the tallest one, so the first items
    // of all the columns line up ("Resources (inputs)" may take two lines).
    var hh = 0;
    cols.forEach(function (k) {
      var hdr = L.node('hdr-' + k);
      if (hdr) { hh = Math.max(hh, L.need(hdr, inner)); broken += L.breaks(hdr, inner); }
    });
    var data = cols.map(function (k, i) {
      var hdr = L.node('hdr-' + k);
      var its = L.items(k).map(function (nd) { broken += L.breaks(nd, inner); return { n: nd, h: L.need(nd, inner) }; });
      var h0 = hdr ? hh : 0;
      var ch = pad + h0 + (hdr && its.length ? hg : 0) + sum(its.map(function (t) { return t.h; })) + Math.max(0, its.length - 1) * ig + pad;
      return { k: k, i: i, hdr: hdr, hh: h0, its: its, ch: ch };
    });
    var H = Math.max(opt.minH || 0, Math.max.apply(null, [0].concat(data.map(function (d) { return d.ch; }))));
    return { cols: cols, xs: xs, cw: cw, H: H, data: data, pad: pad, hg: hg, ig: ig, broken: broken };
  }
  function placeColumns(L, g, top) {
    g.data.forEach(function (d) {
      var x = g.xs[d.i];
      var pn = L.node('pnl-' + d.k);
      if (pn) L.put(pn, x, top, g.cw, g.H);
      var y = top + g.pad;
      if (d.hdr) { L.put(d.hdr, x + g.pad, y, g.cw - 2 * g.pad, d.hh); y += d.hh + g.hg; }
      d.its.forEach(function (it) { L.put(it.n, x + g.pad, y, g.cw - 2 * g.pad, it.h); y += it.h + g.ig; });
    });
  }
  function span(g, keys) {
    var idx = keys.map(function (k) { return g.cols.indexOf(k); }).filter(function (i) { return i >= 0; });
    if (!idx.length) return null;
    var a = Math.min.apply(null, idx), b = Math.max.apply(null, idx);
    return { x: g.xs[a], w: g.xs[b] + g.cw - g.xs[a] };
  }
  /** Influence bracket covers outcomes the program can still influence (all but long-term). */
  function influenceKeys(cols) {
    var outs = cols.filter(isOut);
    if (outs.length > 1 && outs.indexOf('longTerm') >= 0) return outs.filter(function (k) { return k !== 'longTerm'; });
    return outs;
  }

  /** Brackets above the columns; returns the height they need. */
  function bracketHeight(L) {
    var h = 0;
    ['brk-control', 'brk-influence'].forEach(function (id) { var b = L.node(id); if (b) h = Math.max(h, L.need(b, 160)); });
    return h;
  }
  function placeBrackets(L, g, top, h) {
    var y = top - 5 * L.s - h;
    var bc = L.node('brk-control'), bi = L.node('brk-influence'), world = L.node('world');
    var sp = span(g, g.cols.filter(isProg));
    if (bc && sp) { bc.dir = 'down'; L.put(bc, sp.x, y, sp.w, h); }
    var ik = influenceKeys(g.cols);
    var si = span(g, ik);
    if (bi && si) { bi.dir = 'down'; L.put(bi, si.x, y, si.w, h); }
    if (world && ik.indexOf('longTerm') < 0) {
      var sw = span(g, ['longTerm']);
      if (sw) L.put(world, sw.x, y, sw.w, h - C().bracketDepth({ strokeWidth: 2.5 }) - 4);
    }
  }
  function placeStructure(L, g, y) {
    var sp = L.node('str-program'), so = L.node('str-outcome');
    var a = span(g, g.cols.filter(isProg)), b = span(g, g.cols.filter(isOut));
    var h = 0;
    if (sp && a) h = Math.max(h, L.need(sp, a.w));
    if (so && b) h = Math.max(h, L.need(so, b.w));
    if (!h) return y;
    y += 8 * L.s;
    if (sp && a) { sp.dir = 'up'; L.put(sp, a.x, y, a.w, h); }
    if (so && b) { so.dir = 'up'; L.put(so, b.x, y, b.w, h); }
    return y + h;
  }
  function C() { return LMB.content; }

  var TEMPLATES = {};

  /* ---------------------------------------------------------------- Handbook */
  TEMPLATES.handbook = {
    id: 'handbook',
    name: 'Handbook (Figure 3.1)',
    blurb: 'Figure 3.1 from the textbook: program and outcome structure, control and influence, related program logics.',
    defaultPage: 'letter-landscape',
    defaultShow: { brackets: true, structureLabels: true, related: true },
    supports: { brackets: true, structureLabels: true, contextArrows: true, world: true, related: true },
    panelPad: 5,
    style: function (role, st, x) {
      if (role === 'item') { st.radius = 3; st.pad = 6; st.padY = 5; }
    },
    /**
     * Figure 3.1 draws the problem as an arrow block at the far left. When
     * that doesn't fit the page (a long model, or a portrait page where the
     * columns get too narrow for words like "postsecondary"), the problem
     * moves to a full-width band above the columns, as in Columns, and the
     * columns get its width back. Whichever arrangement fits better wins.
     */
    layout: function (L) {
      var problem = L.node('problem');
      var side = handbookPass(L, false);
      if (!problem) return;
      var pageBottom = L.doc.diagram.page === 'none' ? Infinity : L.page.h - L.Y0;
      if (!side.broken && side.bottom <= pageBottom) return;
      var band = handbookPass(L, true);
      var better = band.broken < side.broken || (band.broken === side.broken && band.bottom < side.bottom - 0.5);
      if (!better) handbookPass(L, false);
    }
  };

  /** One Handbook arrangement; band = problem across the top. Returns {bottom, broken}. */
  function handbookPass(L, band) {
    var s = L.s;
    L.bottom = 0;
    var y = header(L, L.Y0);
    var problem = L.node('problem');
    var side = problem && !band;
    var P = side ? U.clamp(L.W * 0.14, 120, 190 * s) : 0;
    var gapP = side ? 16 * s : 0;
    if (problem && band) {
      var bh0 = L.need(problem, L.W);
      L.put(problem, L.X0, y, L.W, bh0);
      y += bh0 + 16 * s;
    }
    var g = columnsRow(L, {
      left: L.X0 + P + gapP, width: L.W - P - gapP, gap: 22 * s, bigGap: 34 * s,
      pad: TEMPLATES.handbook.panelPad * s, headerGap: 7 * s, itemGap: 6 * s, minH: 120 * s,
      tight: { gap: 14 * s, bigGap: 22 * s, pad: 4 * s }
    });
    if (side) g.H = Math.max(g.H, L.need(problem, P));
    var bh = bracketHeight(L);
    if (bh) y += bh + 5 * L.s;
    var top = y;
    placeColumns(L, g, top);
    var broken = g.broken;
    if (side) {
      // A block arrow centered on the columns: tall enough for its text, short enough to read as an arrow.
      var need = L.need(problem, P);
      var ph = Math.min(g.H, Math.max(need + 28 * s, g.H * 0.62));
      L.put(problem, L.X0, top + (g.H - ph) / 2, P, ph);
      broken += L.breaks(problem, P);
    }
    if (bh) placeBrackets(L, g, top, bh);
    y = top + g.H;
    // "Related program logics" sits under the first program columns, as in Figure 3.1.
    var rel = L.node('related');
    var rs = span(g, g.cols.filter(isProg).slice(0, 2));
    if (rel && rs) {
      var rw = Math.min(rs.w, g.cw * 1.25);
      var rh = L.need(rel, rw);
      L.put(rel, rs.x, y + 10 * s, rw, rh);
      y += 10 * s + rh;
    }
    y = placeStructure(L, g, y);
    var ctx = L.node('context'), as = L.node('assumptions');
    if (ctx) {
      y += 30 * s;
      var ch = L.need(ctx, L.W);
      L.put(ctx, L.X0, y, L.W, ch);
      y += ch;
    }
    if (as) {
      y += 12 * s;
      var ah = L.need(as, L.W);
      L.put(as, L.X0, y, L.W, ah);
    }
    return { bottom: L.bottom, broken: broken };
  }

  /* ----------------------------------------------------------------- Columns */
  TEMPLATES.columns = {
    id: 'columns',
    name: 'Columns (table style)',
    blurb: 'Colored column headers and cards with block arrows, like the Kellogg and UW-Extension templates.',
    defaultPage: 'letter-landscape',
    defaultShow: { brackets: false, structureLabels: false, related: false },
    supports: { brackets: true, structureLabels: true, contextArrows: false, world: true },
    panelPad: 6,
    style: function (role, st, x) {
      var tok = x.tok, th = x.theme;
      switch (role) {
        case 'problem': Object.assign(st, { shape: 'rounded', radius: 6, stroke: 'none', pad: 14, padY: 10 }); break;
        case 'header': Object.assign(st, { shape: 'rounded', radius: 4, fill: tok.chip, textColor: tok.on, pad: 6, padY: 6 }); break;
        case 'panel': Object.assign(st, { shape: 'rounded', radius: 6, stroke: 'none', fill: U.mix(tok.accent, '#ffffff', 0.9) }); break;
        case 'item': Object.assign(st, { shape: 'rect', radius: 3, fill: '#ffffff', stroke: tok.line, accentBar: tok.accent, align: 'left', pad: 8, padY: 6 }); break;
        case 'context': Object.assign(st, { radius: 6 }); break;
        default: break;
      }
    },
    edgeStyle: function (edge, st, x) {
      if (!/^ae-ctx/.test(edge.id) && edge.id !== 'ae-problem') {
        var from = edge.from && edge.from.replace(/^pnl-/, '');
        var tok = TH.tokens(x.doc.diagram.theme, from);
        st.look = 'block';
        st.fill = U.mix(tok.accent, '#ffffff', 0.25);
        st.color = st.fill;
      }
    },
    layout: function (L) {
      var s = L.s;
      var y = header(L, L.Y0);
      var problem = L.node('problem');
      if (problem) {
        var ph = L.need(problem, L.W);
        L.put(problem, L.X0, y, L.W, ph);
        y += ph + 16 * s;
      }
      var g = columnsRow(L, {
        left: L.X0, width: L.W, gap: 26 * s, bigGap: 26 * s,
        pad: TEMPLATES.columns.panelPad * s, headerGap: 8 * s, itemGap: 7 * s, minH: 110 * s,
        tight: { gap: 16 * s, bigGap: 16 * s, pad: 4 * s }
      });
      var bh = bracketHeight(L);
      if (bh) y += bh + 5 * s;
      var top = y;
      placeColumns(L, g, top);
      if (bh) placeBrackets(L, g, top, bh);
      y = placeStructure(L, g, top + g.H);
      // Assumptions (left) and External influences (right) as two bands.
      var as = L.node('assumptions'), ext = L.node('context');
      if (as || ext) y += 16 * s;
      if (as && ext) {
        // Split the width so neither box is much taller than it needs to be:
        // try a few splits and keep the one with the shortest taller box.
        var gap = 14 * s, room = L.W - gap, best = null;
        [0.5, 0.45, 0.4, 0.35].forEach(function (f) {
          var wa = room * f, wc = room - wa;
          var ha = L.need(as, wa), hc = L.need(ext, wc);
          if (!best || Math.max(ha, hc) < best.m - 0.5) best = { wa: wa, wc: wc, ha: ha, hc: hc, m: Math.max(ha, hc) };
        });
        // Same height when they are close (tidier); otherwise each box fits
        // its own text, both top-aligned, so neither is left half empty.
        var same = Math.abs(best.ha - best.hc) < 14 * s;
        L.put(as, L.X0, y, best.wa, same ? best.m : best.ha);
        L.put(ext, L.X0 + best.wa + gap, y, best.wc, same ? best.m : best.hc);
      } else if (as || ext) {
        var one = as || ext;
        L.put(one, L.X0, y, L.W, L.need(one, L.W));
      }
    }
  };

  /* ---------------------------------------------------------------- Top-down */
  TEMPLATES.topdown = {
    id: 'topdown',
    name: 'Top-down',
    blurb: 'A portrait flow: each section is a row, arrows point down the page.',
    defaultPage: 'letter-portrait',
    defaultShow: { brackets: false, structureLabels: false, related: false },
    panelPad: 9,
    supports: { brackets: true, structureLabels: false, contextArrows: false, world: false, problemArrow: true },
    style: function (role, st, x) {
      var tok = x.tok;
      switch (role) {
        case 'problem': Object.assign(st, { shape: 'rounded', radius: 6, stroke: 'none', pad: 14, padY: 10 }); break;
        case 'header': Object.assign(st, { align: 'left', valign: 'top', fontSize: x.B * 1.08, pad: 0, padY: 0 }); break;
        case 'panel': Object.assign(st, { shape: 'rounded', radius: 6, strokeWidth: 1.5 }); break;
        case 'item': Object.assign(st, { shape: 'rounded', radius: 4 }); break;
        case 'bracket': st.fontSize = x.B * 1.15; break;
        default: break;
      }
    },
    layout: function (L) {
      var s = L.s;
      var y = header(L, L.Y0);
      var problem = L.node('problem');
      var rowGap = (L.node('pnl-' + L.chain[0]) && L.doc.diagram.show.columnArrows) ? 24 * s : 12 * s;
      if (problem) {
        var ph = L.need(problem, L.W);
        L.put(problem, L.X0, y, L.W, ph);
        y += ph + rowGap;
      }
      var hasBr = L.node('brk-control') || L.node('brk-influence');
      var brW = hasBr ? 92 * s : 0;
      var panelW = L.W - brW;
      var pad = 9 * s, labW = U.clamp(panelW * 0.2, 112, 160 * s), g = 8 * s, minCard = 128 * s;
      var areaX = L.X0 + pad + labW + 12 * s;
      var areaW = L.X0 + panelW - pad - areaX;
      var perMax = Math.max(1, Math.floor((areaW + g) / (minCard + g)));
      var rows = {};
      L.chain.forEach(function (k, idx) {
        var pn = L.node('pnl-' + k), hdr = L.node('hdr-' + k);
        var its = L.items(k);
        var nRows = Math.max(1, Math.ceil(its.length / perMax));
        var per = Math.max(1, Math.ceil(its.length / nRows));
        var cardW = (areaW - (per - 1) * g) / per;
        var hh = hdr ? L.need(hdr, labW) : 0;
        var gy = y + pad;
        for (var r = 0; r < nRows; r++) {
          var row = its.slice(r * per, r * per + per);
          if (!row.length) break;
          var rh = Math.max.apply(null, row.map(function (n) { return L.need(n, cardW); }));
          row.forEach(function (n, i) { L.put(n, areaX + i * (cardW + g), gy, cardW, rh); });
          gy += rh + g;
        }
        var contentH = its.length ? gy - g - (y + pad) : 0;
        var H = Math.max(hh, contentH, 22 * s) + 2 * pad;
        if (hdr) L.put(hdr, L.X0 + pad, y + pad, labW, Math.max(hh, H - 2 * pad));
        if (pn) L.put(pn, L.X0, y, panelW, H);
        rows[k] = { y: y, h: H };
        y += H + (idx < L.chain.length - 1 ? rowGap : 0);
      });
      // Brackets down the right side, opening toward the rows.
      function vspan(keys) {
        keys = keys.filter(function (k) { return rows[k]; });
        if (!keys.length) return null;
        var a = rows[keys[0]], b = rows[keys[keys.length - 1]];
        return { y: a.y, h: b.y + b.h - a.y };
      }
      var bc = L.node('brk-control'), bi = L.node('brk-influence');
      var sp = vspan(L.chain.filter(isProg)), si = vspan(influenceKeys(L.chain));
      if (bc && sp) { bc.dir = 'left'; L.put(bc, L.X0 + panelW + 8 * s, sp.y, brW - 8 * s, sp.h); }
      if (bi && si) { bi.dir = 'left'; L.put(bi, L.X0 + panelW + 8 * s, si.y, brW - 8 * s, si.h); }
      var ctx = L.node('context'), as = L.node('assumptions');
      if (ctx) { y += 18 * s; var ch = L.need(ctx, L.W); L.put(ctx, L.X0, y, L.W, ch); y += ch; }
      if (as) { y += 12 * s; var ah = L.need(as, L.W); L.put(as, L.X0, y, L.W, ah); }
    }
  };

  LMB.templates = {
    TEMPLATES: TEMPLATES,
    ids: function () { return Object.keys(TEMPLATES); },
    get: function (id) { return TEMPLATES[id] || null; },
    of: function (doc) { return TEMPLATES[doc.diagram.template] || TEMPLATES.handbook; }
  };
})();

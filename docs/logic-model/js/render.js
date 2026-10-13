/* =============================================================================
   render.js — turns a doc into SVG markup.

   One renderer serves the Design canvas, the Write preview and every export,
   so what students see is exactly what they download. In "canvas" mode each
   box carries a data-id (for clicking) and each arrow an invisible wide hit
   line; in "export" mode the output is clean, standalone SVG with nothing but
   shapes, real <text> lines and arrows.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, C = LMB.content, T = LMB.text, M = LMB.model, TH = LMB.themes;
  var n = U.n, esc = U.escXML;
  var R = {};

  function hasGeom(nd) { return nd && !nd.hidden && nd.x != null && nd.w != null && nd.h != null && nd.y != null; }
  R.hasGeom = hasGeom;

  /* ---------------------------------------------------------------------------
     ARROWS
     ------------------------------------------------------------------------ */
  function box(nd) { return { x: nd.x, y: nd.y, w: nd.w, h: nd.h, r: nd.x + nd.w, b: nd.y + nd.h, cx: nd.x + nd.w / 2, cy: nd.y + nd.h / 2 }; }
  var SIDES = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };

  /*
   * Arrow ends sit on a shape's real outline, not its bounding box.
   * outlinePoly() gives the outline of the non-rectangular shapes as a list of
   * corner points (rounded corners as short runs of points), matching the
   * drawing in content.js shapePath(). Plain rectangles, text and brackets
   * return null and use the box itself; ellipses are solved exactly.
   */
  function arcPts(cx, cy, r, a0, a1, out) {
    for (var i = 0; i <= 6; i++) { var a = a0 + (a1 - a0) * i / 6; out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
  }
  function outlinePoly(b, shape, st) {
    var x = b.x, y = b.y, w = b.w, h = b.h, P = Math.PI;
    var r = Math.max(0, Math.min((st && st.radius) || 0, w / 2, h / 2));
    switch (shape) {
      case 'pill': r = Math.min(w, h) / 2; break;
      case 'rounded': if (!r) r = Math.min(8, w / 2, h / 2); break;
      case 'rect': break;
      case 'diamond': return [{ x: x + w / 2, y: y }, { x: x + w, y: y + h / 2 }, { x: x + w / 2, y: y + h }, { x: x, y: y + h / 2 }];
      case 'hexagon': {
        var hx = Math.min(h * 0.29, w * 0.22);
        return [{ x: x + hx, y: y }, { x: x + w - hx, y: y }, { x: x + w, y: y + h / 2 }, { x: x + w - hx, y: y + h }, { x: x + hx, y: y + h }, { x: x, y: y + h / 2 }];
      }
      case 'parallelogram': {
        var sk = Math.min(w * 0.18, h * 0.5, 26);
        return [{ x: x + sk, y: y }, { x: x + w, y: y }, { x: x + w - sk, y: y + h }, { x: x, y: y + h }];
      }
      case 'chevron': {
        var t = C.chevronTip(w, h);
        return [{ x: x, y: y }, { x: x + w - t, y: y }, { x: x + w, y: y + h / 2 }, { x: x + w - t, y: y + h }, { x: x, y: y + h }];
      }
      case 'note': {
        var f = Math.min(14, w / 3, h / 3);
        return [{ x: x, y: y }, { x: x + w - f, y: y }, { x: x + w, y: y + f }, { x: x + w, y: y + h }, { x: x, y: y + h }];
      }
      default: return null;
    }
    if (r < 1.5) return null; // square corners: the box is the outline
    var pts = [];
    arcPts(x + w - r, y + r, r, -P / 2, 0, pts);
    arcPts(x + w - r, y + h - r, r, 0, P / 2, pts);
    arcPts(x + r, y + h - r, r, P / 2, P, pts);
    arcPts(x + r, y + r, r, P, P * 1.5, pts);
    return pts;
  }
  /**
   * Where a ray from o (inside the shape) in direction (dx, dy) leaves the
   * shape. Every shape here is convex, so there is one exit; the farthest
   * crossing is taken to be safe.
   */
  function exitPt(b, shape, st, o, dx, dy) {
    if (!dx && !dy) return { x: o.x, y: o.y };
    var t;
    if (shape === 'ellipse') {
      var hw = b.w / 2, hh = b.h / 2, ox = o.x - b.cx, oy = o.y - b.cy;
      var qa = dx * dx / (hw * hw) + dy * dy / (hh * hh), qb = 2 * (ox * dx / (hw * hw) + oy * dy / (hh * hh));
      var qc = ox * ox / (hw * hw) + oy * oy / (hh * hh) - 1;
      t = (-qb + Math.sqrt(Math.max(0, qb * qb - 4 * qa * qc))) / (2 * qa);
    } else {
      var poly = outlinePoly(b, shape, st);
      t = -Infinity;
      if (poly) {
        for (var i = 0; i < poly.length; i++) {
          var p = poly[i], q = poly[(i + 1) % poly.length];
          var ex = q.x - p.x, ey = q.y - p.y, den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) continue; // parallel to this edge
          var s = ((p.x - o.x) * ey - (p.y - o.y) * ex) / den;  // along the ray
          var u = ((p.x - o.x) * dy - (p.y - o.y) * dx) / den;  // along the edge
          if (u >= -1e-6 && u <= 1 + 1e-6 && s > t) t = s;
        }
      }
      if (!(t >= 0)) { // a plain box (or the ray missed the outline): use the box itself
        var tx = dx > 0 ? (b.r - o.x) / dx : dx < 0 ? (b.x - o.x) / dx : Infinity;
        var ty = dy > 0 ? (b.b - o.y) / dy : dy < 0 ? (b.y - o.y) / dy : Infinity;
        t = Math.min(tx, ty);
      }
    }
    return { x: o.x + dx * t, y: o.y + dy * t };
  }
  /** Point where a ray from the box center toward p leaves the shape. */
  function clip(b, shape, p, st) {
    return exitPt(b, shape, st, { x: b.cx, y: b.cy }, p.x - b.cx, p.y - b.cy);
  }
  /** Middle of one side (top/right/bottom/left), on the shape's outline
   *  (a parallelogram's left and right sides are slanted, for example). */
  function sidePt(b, side, shape, st) {
    var p = side === 'top' ? { x: b.cx, y: b.y } : side === 'bottom' ? { x: b.cx, y: b.b }
      : side === 'left' ? { x: b.x, y: b.cy } : { x: b.r, y: b.cy };
    return shape ? clip(b, shape, p, st) : p;
  }
  function autoSides(a, b) {
    var dx = b.cx - a.cx, dy = b.cy - a.cy;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  }
  function dirTo(p, q) {
    var dx = q.x - p.x, dy = q.y - p.y, l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  }

  /**
   * Geometry of an arrow: {pts: [...]} for straight/elbow or
   * {pts:[p0,p3], curve:[c1,c2]} for curved. Null if an end is missing.
   */
  R.edgeGeom = function (doc, e, byId) {
    var A = e.from ? byId[e.from] : null, B = e.to ? byId[e.to] : null;
    if (e.from && !hasGeom(A)) return null;
    if (e.to && !hasGeom(B)) return null;
    if (!A && !e.fromPt) return null;
    if (!B && !e.toPt) return null;
    var a = A ? box(A) : null, b = B ? box(B) : null;
    var stA = A ? C.style(doc, A) : null, stB = B ? C.style(doc, B) : null;
    var shA = stA && stA.shape, shB = stB && stB.shape;
    var pa = a ? { x: a.cx, y: a.cy } : e.fromPt, pb = b ? { x: b.cx, y: b.cy } : e.toPt;
    var route = e.route || 'straight';
    var p0, p3;

    if (route === 'straight') {
      if (a && b && !e.fromSide && !e.toSide) {
        var ox = Math.min(a.r, b.r) - Math.max(a.x, b.x);
        var oy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
        if (oy > 6 && ox < 0) { // side by side: level horizontal arrow
          // Level line at y, from the outline of one shape to the outline of the other.
          var y = (Math.max(a.y, b.y) + Math.min(a.b, b.b)) / 2, dir = a.cx < b.cx ? 1 : -1;
          p0 = exitPt(a, shA, stA, { x: a.cx, y: y }, dir, 0);
          p3 = exitPt(b, shB, stB, { x: b.cx, y: y }, -dir, 0);
          return { pts: [p0, p3] };
        }
        if (ox > 6 && oy < 0) { // stacked: vertical arrow
          var x = (Math.max(a.x, b.x) + Math.min(a.r, b.r)) / 2, dy = a.cy < b.cy ? 1 : -1;
          p0 = exitPt(a, shA, stA, { x: x, y: a.cy }, 0, dy);
          p3 = exitPt(b, shB, stB, { x: x, y: b.cy }, 0, -dy);
          return { pts: [p0, p3] };
        }
      }
      p0 = a ? (e.fromSide ? sidePt(a, e.fromSide, shA, stA) : clip(a, shA, e.toSide && b ? sidePt(b, e.toSide, shB, stB) : pb, stA)) : pa;
      p3 = b ? (e.toSide ? sidePt(b, e.toSide, shB, stB) : clip(b, shB, p0, stB)) : pb;
      if (a && !e.fromSide) p0 = clip(a, shA, p3, stA);
      return { pts: [p0, p3] };
    }

    var fs = e.fromSide, ts = e.toSide;
    if (a && b) {
      var as = autoSides(a, b);
      fs = fs || as[0]; ts = ts || as[1];
    } else if (a) {
      fs = fs || autoSides(a, { cx: pb.x, cy: pb.y })[0];
    } else if (b) {
      ts = ts || autoSides(b, { cx: pa.x, cy: pa.y })[0];
    }
    p0 = a ? sidePt(a, fs, shA, stA) : pa;
    p3 = b ? sidePt(b, ts, shB, stB) : pb;
    var d0 = fs ? SIDES[fs] : dirTo(p0, p3);
    var d3 = ts ? SIDES[ts] : dirTo(p3, p0);

    if (route === 'curved') {
      var k = Math.max(30, Math.hypot(p3.x - p0.x, p3.y - p0.y) * 0.4);
      return { pts: [p0, p3], curve: [{ x: p0.x + d0[0] * k, y: p0.y + d0[1] * k }, { x: p3.x + d3[0] * k, y: p3.y + d3[1] * k }] };
    }
    // elbow
    var h0 = Math.abs(d0[0]) > Math.abs(d0[1]), h3 = Math.abs(d3[0]) > Math.abs(d3[1]);
    var pts;
    if (h0 && h3) { var mx = (p0.x + p3.x) / 2; pts = [p0, { x: mx, y: p0.y }, { x: mx, y: p3.y }, p3]; }
    else if (!h0 && !h3) { var my = (p0.y + p3.y) / 2; pts = [p0, { x: p0.x, y: my }, { x: p3.x, y: my }, p3]; }
    else if (h0) pts = [p0, { x: p3.x, y: p0.y }, p3];
    else pts = [p0, { x: p0.x, y: p3.y }, p3];
    pts = pts.filter(function (p, i) { return i === 0 || Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) > 0.5; });
    if (pts.length < 2) pts = [p0, p3];
    return { pts: pts };
  };

  function headSize(w) { return { len: 6 + w * 2.6, half: 3.2 + w * 1.4 }; }
  function headPoly(tip, u, w) {
    var hs = headSize(w);
    var bx = tip.x - u[0] * hs.len, by = tip.y - u[1] * hs.len;
    return [tip, { x: bx - u[1] * hs.half, y: by + u[0] * hs.half }, { x: bx + u[1] * hs.half, y: by - u[0] * hs.half }];
  }
  function polyStr(pts) { return pts.map(function (p) { return n(p.x) + ',' + n(p.y); }).join(' '); }

  /** Midpoint of an arrow (for its label and handles). */
  R.edgeMid = function (g) {
    if (g.curve) {
      var p0 = g.pts[0], p3 = g.pts[1], c1 = g.curve[0], c2 = g.curve[1];
      return { x: 0.125 * p0.x + 0.375 * c1.x + 0.375 * c2.x + 0.125 * p3.x, y: 0.125 * p0.y + 0.375 * c1.y + 0.375 * c2.y + 0.125 * p3.y };
    }
    var segs = [], total = 0;
    for (var i = 1; i < g.pts.length; i++) { var l = Math.hypot(g.pts[i].x - g.pts[i - 1].x, g.pts[i].y - g.pts[i - 1].y); segs.push(l); total += l; }
    var half = total / 2;
    for (var j = 0; j < segs.length; j++) {
      if (half <= segs[j] || j === segs.length - 1) {
        var t = segs[j] ? half / segs[j] : 0, A = g.pts[j], B = g.pts[j + 1];
        return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
      }
      half -= segs[j];
    }
    return g.pts[0];
  };

  function edgeSVG(doc, e, byId, opts) {
    var g = R.edgeGeom(doc, e, byId);
    if (!g) return '';
    var st = C.edgeStyle(doc, e);
    var w = st.width;
    var out = [];
    var pts = g.pts.map(function (p) { return { x: p.x, y: p.y }; });
    var last = pts.length - 1;

    if (st.look === 'block' && !g.curve) {
      // Chunky chevron between columns (Columns template).
      var A = pts[0], B = pts[last];
      var u = dirTo(A, B), len = Math.hypot(B.x - A.x, B.y - A.y);
      var inset = Math.min(4, len * 0.12);
      A = { x: A.x + u[0] * inset, y: A.y + u[1] * inset };
      len -= inset * 2;
      if (len > 4) {
        var s = doc.diagram.baseFontSize / 11;
        var hh = 11 * s, tip = Math.min(len * 0.55, 11 * s), notch = Math.min(len * 0.35, 7 * s);
        var P = function (al, pe) { return { x: A.x + u[0] * al - u[1] * pe, y: A.y + u[1] * al + u[0] * pe }; };
        var poly = [P(0, -hh), P(len - tip, -hh), P(len, 0), P(len - tip, hh), P(0, hh), P(notch, 0)];
        out.push('<polygon points="' + polyStr(poly) + '" fill="' + esc(st.fill) + '"/>');
      }
    } else {
      var startHead = st.head === 'start' || st.head === 'both';
      var endHead = st.head === 'end' || st.head === 'both';
      var uEnd, uStart;
      if (g.curve) {
        uEnd = dirTo(g.curve[1], pts[1]);
        if (Math.hypot(g.curve[1].x - pts[1].x, g.curve[1].y - pts[1].y) < 1) uEnd = dirTo(pts[0], pts[1]);
        uStart = dirTo(g.curve[0], pts[0]);
        if (Math.hypot(g.curve[0].x - pts[0].x, g.curve[0].y - pts[0].y) < 1) uStart = dirTo(pts[1], pts[0]);
      } else {
        uEnd = dirTo(pts[last - 1], pts[last]);
        uStart = dirTo(pts[1], pts[0]);
      }
      var hs = headSize(w);
      var tipEnd = pts[last], tipStart = pts[0];
      var lineEnd = endHead ? { x: tipEnd.x - uEnd[0] * hs.len * 0.8, y: tipEnd.y - uEnd[1] * hs.len * 0.8 } : tipEnd;
      var lineStart = startHead ? { x: tipStart.x - uStart[0] * hs.len * 0.8, y: tipStart.y - uStart[1] * hs.len * 0.8 } : tipStart;
      var d;
      if (g.curve) {
        d = 'M' + n(lineStart.x) + ' ' + n(lineStart.y) + 'C' + n(g.curve[0].x) + ' ' + n(g.curve[0].y) + ' ' + n(g.curve[1].x) + ' ' + n(g.curve[1].y) + ' ' + n(lineEnd.x) + ' ' + n(lineEnd.y);
      } else {
        var lp = pts.slice();
        lp[0] = lineStart; lp[last] = lineEnd;
        d = 'M' + lp.map(function (p) { return n(p.x) + ' ' + n(p.y); }).join('L');
      }
      var dash = C.dashArray(st.dash, w);
      out.push('<path d="' + d + '" fill="none" stroke="' + esc(st.color) + '" stroke-width="' + n(w) + '"' +
        (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linejoin="round" stroke-linecap="' + (dash ? 'butt' : 'round') + '"/>');
      if (endHead) out.push('<polygon points="' + polyStr(headPoly(tipEnd, uEnd, w)) + '" fill="' + esc(st.color) + '"/>');
      if (startHead) out.push('<polygon points="' + polyStr(headPoly(tipStart, uStart, w)) + '" fill="' + esc(st.color) + '"/>');
    }
    if (e.label && e.label.trim()) {
      var mid = R.edgeMid(g);
      var stack = T.stack(doc.diagram.fontFamily);
      var spec = { size: st.fontSize, bold: false, italic: false, stack: stack };
      var tw = T.width(e.label.trim(), spec);
      var bg = opts.labelBg || '#ffffff';
      out.push('<rect x="' + n(mid.x - tw / 2 - 4) + '" y="' + n(mid.y - st.fontSize * 0.75) + '" width="' + n(tw + 8) + '" height="' + n(st.fontSize * 1.5) + '" rx="3" fill="' + esc(bg) + '"/>');
      out.push('<text x="' + n(mid.x) + '" y="' + n(mid.y + st.fontSize * 0.35) + '" font-size="' + n(st.fontSize) + '" fill="' + esc(st.labelColor) + '" text-anchor="middle">' + esc(e.label.trim()) + '</text>');
    }
    var inner = out.join('');
    if (opts.mode === 'canvas') {
      var hitD = g.curve
        ? 'M' + n(pts[0].x) + ' ' + n(pts[0].y) + 'C' + n(g.curve[0].x) + ' ' + n(g.curve[0].y) + ' ' + n(g.curve[1].x) + ' ' + n(g.curve[1].y) + ' ' + n(pts[1].x) + ' ' + n(pts[1].y)
        : 'M' + pts.map(function (p) { return n(p.x) + ' ' + n(p.y); }).join('L');
      return '<g class="lmb-edge" data-edge="' + esc(e.id) + '">' + inner + '<path class="hit" d="' + hitD + '" fill="none" stroke="transparent" stroke-width="12"/></g>';
    }
    return '<g>' + inner + '</g>';
  }

  /* ---------------------------------------------------------------------------
     BOXES
     ------------------------------------------------------------------------ */
  function textSVG(lines, ox, oy) {
    return lines.map(function (ln) {
      if (!ln.text) return '';
      return '<text x="' + n(ox + ln.x) + '" y="' + n(oy + ln.y) + '" font-size="' + n(ln.size) + '"' +
        (ln.bold ? ' font-weight="700"' : '') + (ln.italic ? ' font-style="italic"' : '') +
        ' fill="' + esc(ln.color) + '"' + (ln.anchor !== 'start' ? ' text-anchor="' + ln.anchor + '"' : '') + '>' + esc(ln.text) + '</text>';
    }).join('');
  }

  /** Text block for a node: returns {lines, ox, oy} in absolute coordinates. */
  R.nodeTextLayout = function (doc, nd, st) {
    var area = C.textArea(st.shape, nd.w, nd.h, st);
    var lay = C.layoutText(doc, nd, st, area.w);
    var oy = nd.y + area.y;
    if (st.valign === 'middle' || st.shape === 'bracket' && (st.dir === 'left' || st.dir === 'right')) oy += (area.h - lay.height) / 2;
    else if (st.valign === 'bottom') oy += area.h - lay.height;
    if (st.shape === 'bracket' && st.dir === 'down') oy = nd.y + area.y + Math.max(0, area.h - lay.height); // label hugs the bracket
    return { lines: lay.lines, ox: nd.x + area.x, oy: oy, area: area, height: lay.height };
  };

  function nodeSVG(doc, nd, opts) {
    var st = C.style(doc, nd);
    var x = nd.x, y = nd.y, w = nd.w, h = nd.h;
    var out = [];
    var shape = st.shape;
    var dash = C.dashArray(st.dash, st.strokeWidth);
    var stroke = st.stroke && st.stroke !== 'none' && st.dash !== 'none' && st.strokeWidth > 0 ? st.stroke : 'none';
    if (shape !== 'text') {
      var d = C.shapePath(shape, x, y, w, h, st);
      if (C.isOpenShape(shape)) {
        // Canvas only: an invisible body, so a bracket can be clicked anywhere
        // in its box, not just on its thin line or the letters of its label.
        if (opts.mode === 'canvas') out.push('<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="transparent"/>');
        out.push('<path d="' + d + '" fill="none" stroke="' + esc(stroke) + '" stroke-width="' + n(st.strokeWidth) + '"' +
          (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"/>');
      } else {
        out.push('<path d="' + d + '" fill="' + esc(st.fill || 'none') + '"' +
          (stroke !== 'none' ? ' stroke="' + esc(stroke) + '" stroke-width="' + n(st.strokeWidth) + '" stroke-linejoin="round"' : '') +
          (stroke !== 'none' && dash ? ' stroke-dasharray="' + dash + '"' : '') + '/>');
      }
      if (st.accentBar && st.accentBar !== 'none' && shape !== 'bracket') {
        var r = Math.min(st.radius || 0, 4), bw = 4;
        out.push('<path d="M' + n(x + r) + ' ' + n(y) + 'H' + n(x + bw) + 'V' + n(y + h) + 'H' + n(x + r) +
          (r ? 'Q' + n(x) + ' ' + n(y + h) + ' ' + n(x) + ' ' + n(y + h - r) + 'V' + n(y + r) + 'Q' + n(x) + ' ' + n(y) + ' ' + n(x + r) + ' ' + n(y) : 'H' + n(x) + 'V' + n(y) + 'H' + n(x + r)) +
          'Z" fill="' + esc(st.accentBar) + '"/>');
      }
    } else if (opts.mode === 'canvas') {
      // Invisible body so borderless text can still be clicked.
      out.push('<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '" fill="transparent"/>');
    }
    if (nd.role !== 'panel' && opts.editingId !== nd.id) {
      var tl = R.nodeTextLayout(doc, nd, st);
      out.push(textSVG(tl.lines, tl.ox, tl.oy));
    }
    var op = st.opacity != null && st.opacity < 1 ? ' opacity="' + n(st.opacity) + '"' : '';
    if (opts.mode === 'canvas') {
      return '<g class="lmb-node" data-id="' + esc(nd.id) + '" data-role="' + esc(nd.role) + '"' + op + '>' + out.join('') + '</g>';
    }
    return '<g' + op + '>' + out.join('') + '</g>';
  }

  /* ---------------------------------------------------------------------------
     WHOLE DIAGRAM
     ------------------------------------------------------------------------ */
  R.byId = function (doc) {
    var m = {};
    doc.diagram.nodes.forEach(function (nd) { m[nd.id] = nd; });
    return m;
  };

  /** Inner markup (boxes, then arrows on top). */
  R.body = function (doc, opts) {
    opts = opts || {};
    var byId = R.byId(doc);
    var parts = [];
    doc.diagram.nodes.forEach(function (nd) { if (hasGeom(nd)) parts.push(nodeSVG(doc, nd, opts)); });
    doc.diagram.edges.forEach(function (e) { if (!e.hidden) parts.push(edgeSVG(doc, e, byId, opts)); });
    return '<g font-family="' + esc(T.stack(doc.diagram.fontFamily)) + '">' + parts.join('') + '</g>';
  };

  /**
   * An added "Text (no border)" box. The text shape draws no outline or fill
   * (see nodeSVG), so with no text it draws nothing at all: it is left out of
   * the bounds, and the editor removes it when it is emptied.
   */
  R.isBareText = function (doc, nd) {
    return nd.role === 'free' && C.style(doc, nd).shape === 'text';
  };

  /** Tight bounding box of everything drawn. */
  R.bounds = function (doc) {
    var byId = R.byId(doc);
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    function add(x, y, pad) { pad = pad || 0; x1 = Math.min(x1, x - pad); y1 = Math.min(y1, y - pad); x2 = Math.max(x2, x + pad); y2 = Math.max(y2, y + pad); }
    doc.diagram.nodes.forEach(function (nd) {
      if (!hasGeom(nd)) return;
      if (U.isBlank(nd.text) && R.isBareText(doc, nd)) return; // draws nothing (see R.isBareText)
      var st = C.style(doc, nd);
      var p = st.shape === 'text' ? 0 : (st.strokeWidth || 0) / 2 + 0.5;
      add(nd.x, nd.y, p); add(nd.x + nd.w, nd.y + nd.h, p);
    });
    doc.diagram.edges.forEach(function (e) {
      if (e.hidden) return;
      var g = R.edgeGeom(doc, e, byId);
      if (!g) return;
      var st = C.edgeStyle(doc, e);
      var pad = st.look === 'block' ? 12 : headSize(st.width).half + st.width;
      g.pts.forEach(function (p) { add(p.x, p.y, pad); });
      if (g.curve) { var m = R.edgeMid(g); add(m.x, m.y, pad); }
      if (e.label && e.label.trim()) {
        var m2 = R.edgeMid(g);
        var tw = T.width(e.label.trim(), { size: st.fontSize, stack: T.stack(doc.diagram.fontFamily) });
        add(m2.x - tw / 2 - 5, m2.y - st.fontSize, 0); add(m2.x + tw / 2 + 5, m2.y + st.fontSize, 0);
      }
    });
    if (!isFinite(x1)) return { x: 0, y: 0, w: 400, h: 300, empty: true };
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  };

  /** The page background color for a doc (or null for transparent). */
  R.background = function (doc, override) {
    var bg = override || doc.diagram.background;
    if (bg === 'transparent') return null;
    if (bg === 'paper') return TH.get(doc.diagram.theme).paper;
    return '#ffffff';
  };

  /**
   * Standalone SVG file.
   *   opts.area: 'drawing' (tight + margin) or 'page'
   *   opts.background: 'white' | 'transparent' | 'paper' (default: diagram setting)
   * Returns {svg, box: {x,y,w,h} (the viewBox), size: {w,h} (output size in
   * px at 96 per inch), inches: {w,h} | null, overflow: true when a 'page'
   * export had to shrink the drawing by `shrink` to fit it on the page}
   */
  R.exportSVG = function (doc, opts) {
    opts = opts || {};
    var page = M.page(doc);
    var hasPage = doc.diagram.page !== 'none';
    var area = opts.area === 'page' && hasPage ? 'page' : 'drawing';
    var bx, size, shrink = 1;
    var b = R.bounds(doc);
    if (area === 'page') {
      bx = { x: 0, y: 0, w: page.w, h: page.h };
      size = { w: page.w, h: page.h };
      // The drawing runs past the page: rather than cut it off, widen the
      // view (keeping the page's proportions) so all of it shows, a little
      // smaller. The Export step says so (overflow / shrink below).
      if (!b.empty && (b.x < -0.5 || b.y < -0.5 || b.x + b.w > page.w + 0.5 || b.y + b.h > page.h + 0.5)) {
        var pad = 12;
        var ux = Math.min(0, b.x - pad), uy = Math.min(0, b.y - pad);
        var uw = Math.max(page.w, b.x + b.w + pad) - ux, uh = Math.max(page.h, b.y + b.h + pad) - uy;
        var k = Math.max(uw / page.w, uh / page.h);
        bx = { x: ux - (page.w * k - uw) / 2, y: uy - (page.h * k - uh) / 2, w: page.w * k, h: page.h * k };
        shrink = 1 / k;
      }
    } else {
      var m = opts.margin != null ? opts.margin : 18;
      bx = { x: Math.floor(b.x - m), y: Math.floor(b.y - m), w: Math.ceil(b.w + 2 * m), h: Math.ceil(b.h + 2 * m) };
      size = { w: bx.w, h: bx.h };
    }
    var bg = R.background(doc, opts.background);
    var inches = hasPage || area === 'drawing' ? { w: size.w / 96, h: size.h / 96 } : null;
    if (area === 'page') inches = { w: page.inW, h: page.inH };
    var title = M.titleOf(doc);
    var desc = M.outline(doc);
    var attrs = 'xmlns="http://www.w3.org/2000/svg" version="1.1"' +
      ' width="' + (inches ? n(inches.w) + 'in' : n(size.w)) + '" height="' + (inches ? n(inches.h) + 'in' : n(size.h)) + '"' +
      ' viewBox="' + n(bx.x) + ' ' + n(bx.y) + ' ' + n(bx.w) + ' ' + n(bx.h) + '" role="img" aria-labelledby="lm-title lm-desc"';
    var svg = '<svg ' + attrs + '>' +
      '<title id="lm-title">' + esc(title) + '</title>' +
      '<desc id="lm-desc">' + esc(desc) + '</desc>' +
      (bg ? '<rect x="' + n(bx.x) + '" y="' + n(bx.y) + '" width="' + n(bx.w) + '" height="' + n(bx.h) + '" fill="' + bg + '"/>' : '') +
      R.body(doc, { mode: 'export', labelBg: bg || '#ffffff' }) +
      '</svg>';
    return { svg: svg, box: bx, size: size, inches: inches, background: bg, overflow: shrink < 1, shrink: shrink };
  };

  LMB.render = R;
})();

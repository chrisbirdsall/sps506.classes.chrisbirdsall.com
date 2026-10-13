/* =============================================================================
   content.js — what goes inside each box, and how it looks.

   For any node (box) this module answers:
     style(doc, node)      final style = template default for its role
                           + theme colors + the node's own overrides
     text(doc, node)       the words in it (linked boxes read the Write form)
     layout(doc, node, w)  wrapped text lines for a given box width
     need(doc, node, w)    the smallest height that fits the text
     geometry helpers      shape outlines and the text area inside each shape

   Layout (layout.js), the canvas (editor.js) and every export (render.js) go
   through these functions, so the editor and the exported file always match.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, T = LMB.text, TH = LMB.themes, M = LMB.model;
  var C = {};

  /** Labels for diagram parts that are not typed in the Write form. */
  C.LABELS = {
    control: 'Control',
    influence: 'Influence',
    program: 'Program structure',
    outcome: 'Outcome structure',
    world: 'State of the world',
    contextTitle: 'External influences',
    contextSub: '(driving and restraining factors)',
    problem: 'Problem',
    related: 'Related program logics'
  };

  /** Shapes offered in the toolbar and inspector. */
  C.SHAPES = [
    { id: 'rect', label: 'Box' },
    { id: 'rounded', label: 'Rounded box' },
    { id: 'pill', label: 'Pill' },
    { id: 'ellipse', label: 'Ellipse' },
    { id: 'diamond', label: 'Diamond' },
    { id: 'hexagon', label: 'Hexagon' },
    { id: 'parallelogram', label: 'Parallelogram' },
    { id: 'chevron', label: 'Chevron / arrow block' },
    { id: 'note', label: 'Note' },
    { id: 'text', label: 'Text (no border)' },
    { id: 'bracket', label: 'Bracket' }
  ];

  /** Style keys a user can override (anything else is ignored). */
  C.STYLE_KEYS = ['fill', 'stroke', 'strokeWidth', 'dash', 'radius', 'textColor', 'labelColor', 'fontSize', 'bold', 'italic', 'align', 'valign', 'opacity', 'accentBar'];

  function sectionOf(node) { return node.link && node.link.section; }
  C.sectionOf = sectionOf;
  C.isProgram = function (k) { return TH.PROGRAM.indexOf(k) >= 0; };
  C.isOutcome = function (k) { return TH.OUTCOME.indexOf(k) >= 0; };

  /* ---------------------------------------------------------------------------
     STYLE
     ------------------------------------------------------------------------ */

  /** Template-independent starting style for each role. */
  function baseStyle(doc, node) {
    var dg = doc.diagram;
    var B = dg.baseFontSize;
    var th = TH.get(dg.theme);
    var sec = sectionOf(node);
    var tok = TH.tokens(dg.theme, sec || (node.link && node.link.part === 'outcome' ? 'shortTerm' : 'inputs'));
    var sw = th.strokeScale || 1;
    var st = {
      shape: 'rect', fill: 'none', stroke: 'none', strokeWidth: 1.5 * sw, dash: 'solid', radius: 0,
      textColor: th.ink, labelColor: th.ink, fontSize: B, bold: false, italic: false,
      align: 'center', valign: 'middle', opacity: 1, accentBar: 'none', pad: 6, padY: 5
    };
    switch (node.role) {
      case 'title':
        return Object.assign(st, { shape: 'text', fontSize: Math.round(B * 1.8 * 2) / 2, bold: true, align: 'left', valign: 'top', pad: 0, padY: 0 });
      case 'theory':
        return Object.assign(st, { shape: 'text', textColor: th.muted, italic: true, align: 'left', valign: 'top', pad: 0, padY: 0, fontSize: B * 1.02 });
      case 'problem':
        return Object.assign(st, { shape: 'chevron', fill: th.problem.fill, stroke: th.problem.stroke, labelColor: U.ensureContrast(th.problem.label, th.problem.fill, 4.5), align: 'left', pad: 9, padY: 8 });
      case 'header':
        return Object.assign(st, { shape: 'text', textColor: tok.text, bold: true, fontSize: B * 1.05, pad: 2, padY: 1 });
      case 'panel':
        return Object.assign(st, { shape: 'rect', fill: tok.wash, stroke: tok.accent, strokeWidth: 2 * sw, radius: 2 });
      case 'item':
        return Object.assign(st, { shape: 'rect', fill: tok.tint, stroke: tok.line, strokeWidth: 1 * sw, radius: 3 });
      case 'context':
        return Object.assign(st, {
          shape: 'rounded', radius: 10, fill: th.context.fill, textColor: th.context.text,
          labelColor: U.ensureContrast(th.context.label, th.context.fill, 4.5), align: 'left', valign: 'top', pad: 14, padY: 10, fontSize: B * 0.98
        });
      case 'assumptions':
        return Object.assign(st, {
          shape: 'rounded', radius: 6, fill: th.assumptions.fill, stroke: th.assumptions.stroke, dash: 'dashed', strokeWidth: 1.2 * sw,
          labelColor: U.ensureContrast(th.assumptions.label, th.assumptions.fill, 4.5), align: 'left', valign: 'top', pad: 14, padY: 10, fontSize: B * 0.98
        });
      case 'bracket':
        return Object.assign(st, { shape: 'bracket', stroke: th.bracket, strokeWidth: 2.5 * sw, textColor: U.ensureContrast(th.bracket, '#ffffff', 4.5), bold: true, italic: true, fontSize: B * 1.3, pad: 0, padY: 0 });
      case 'structure': {
        var t2 = TH.tokens(dg.theme, node.link && node.link.part === 'outcome' ? 'shortTerm' : 'inputs');
        return Object.assign(st, { shape: 'bracket', stroke: t2.accent, strokeWidth: 2 * sw, textColor: t2.text, bold: true, fontSize: B * 1.15, pad: 0, padY: 0 });
      }
      case 'world':
        return Object.assign(st, { shape: 'text', textColor: th.muted, italic: true, fontSize: B * 1.1, pad: 0, padY: 0, valign: 'bottom' });
      case 'related': // Figure 3.1's "Related program logics" box, drawn like a program panel
        return Object.assign(st, { shape: 'rect', fill: tok.wash, stroke: tok.accent, strokeWidth: 1.5 * sw, textColor: tok.text, pad: 8, padY: 6 });
      default: { // free elements
        var shape = node.shape || 'rounded';
        // "Box" has square corners; "Rounded box" (the default) has 8-unit ones.
        var f = { fill: th.free.fill, stroke: th.free.stroke, radius: shape === 'rect' ? 0 : 8 };
        if (shape === 'note') f = { fill: th.note.fill, stroke: th.note.stroke };
        if (shape === 'text') f = { fill: 'none', stroke: 'none' };
        if (shape === 'bracket') f = { fill: 'none', stroke: th.bracket, strokeWidth: 2.5 * sw, textColor: U.ensureContrast(th.bracket, '#ffffff', 4.5), bold: true, italic: true, fontSize: B * 1.2 };
        return Object.assign(st, f, { shape: shape, pad: 8, padY: 6 });
      }
    }
  }

  /** Final style for a node: base → template tweaks → user overrides. */
  C.style = function (doc, node) {
    var st = baseStyle(doc, node);
    var tpl = LMB.templates.of(doc);
    if (tpl.style && node.role !== 'free') {
      var sec = sectionOf(node);
      tpl.style(node.role, st, {
        doc: doc, node: node, theme: TH.get(doc.diagram.theme),
        tok: TH.tokens(doc.diagram.theme, sec || 'inputs'), B: doc.diagram.baseFontSize
      });
    }
    if (node.shape && node.shape !== st.shape) {
      // A shape picked in the inspector: "Box" means square corners and
      // "Rounded box" visibly rounded ones, whatever the role started with.
      st.shape = node.shape;
      if (node.shape === 'rect') st.radius = 0;
      else if (node.shape === 'rounded' && (st.radius || 0) < 6) st.radius = 8;
    }
    var o = node.style || {};
    C.STYLE_KEYS.forEach(function (k) { if (o[k] !== undefined && o[k] !== null && o[k] !== '') st[k] = o[k]; });
    if (st.shape === 'text' && !(o.fill) && node.role === 'free') st.fill = 'none';
    st.dir = node.dir || (node.role === 'structure' ? 'up' : 'down');
    return st;
  };

  /** Style for an arrow (edge). */
  C.edgeStyle = function (doc, edge) {
    var th = TH.get(doc.diagram.theme);
    var sw = th.strokeScale || 1;
    var st = { color: th.arrow, width: 1.6 * sw, dash: 'solid', head: 'end', look: 'line', fill: th.arrow, labelColor: th.ink, fontSize: doc.diagram.baseFontSize * 0.95 };
    if (edge.auto && /^ae-ctx/.test(edge.id)) { st.color = th.ink; st.width = 1.5 * sw; }
    var tpl = LMB.templates.of(doc);
    if (edge.auto && tpl.edgeStyle) tpl.edgeStyle(edge, st, { doc: doc, theme: th });
    var o = edge.style || {};
    ['color', 'width', 'dash', 'head', 'look', 'fill', 'labelColor'].forEach(function (k) { if (o[k] !== undefined && o[k] !== '') st[k] = o[k]; });
    if (o.color && !o.fill) st.fill = o.color;
    return st;
  };

  /* ---------------------------------------------------------------------------
     TEXT
     ------------------------------------------------------------------------ */

  C.findItem = function (doc, itemId, section) {
    var keys = section ? [section] : M.LISTS;
    for (var i = 0; i < keys.length; i++) {
      var list = doc.content.sections[keys[i]].items;
      for (var j = 0; j < list.length; j++) if (list[j].id === itemId) return { section: keys[i], index: j, item: list[j] };
    }
    return null;
  };

  /** Plain text of a single-text node (null for composite boxes). */
  C.text = function (doc, node) {
    var c = doc.content;
    switch (node.role) {
      case 'title': return c.title || '';
      case 'theory': return c.theory || '';
      case 'header': return c.sections[sectionOf(node)].label || '';
      case 'item': { var f = C.findItem(doc, node.link.itemId, node.link.section); return f ? f.item.text : ''; }
      case 'bracket':
      case 'structure':
      case 'related':
      case 'world': return node.text != null ? node.text : C.LABELS[node.link && node.link.part] || '';
      case 'free': return node.text || '';
      default: return null;
    }
  };
  C.isComposite = function (node) { return node.role === 'problem' || node.role === 'context' || node.role === 'assumptions'; };

  /** What each kind of box is called (inspector headings, screen-reader names). */
  C.ROLE_NAME = { title: 'Title', theory: 'Program theory', problem: 'Problem statement', header: 'Column header', panel: 'Column panel', item: 'Item', context: 'External influences', assumptions: 'Assumptions', bracket: 'Bracket', structure: 'Structure label', world: 'Label', related: 'Related program logics', free: 'Shape' };

  /**
   * A box's name for screen readers and editor labels: "Activities item 2",
   * "Column header, Outputs", "Rounded box", "Title".
   */
  C.boxName = function (doc, node) {
    var sec = node.link && node.link.section && doc.content.sections[node.link.section];
    if (node.role === 'item' && sec) {
      var f = C.findItem(doc, node.link.itemId, node.link.section);
      return sec.label + ' item' + (f ? ' ' + (f.index + 1) : '');
    }
    if ((node.role === 'header' || node.role === 'panel') && sec) return C.ROLE_NAME[node.role] + ', ' + sec.label;
    if (node.role === 'free') return (C.SHAPES.filter(function (s) { return s.id === node.shape; })[0] || { label: 'Shape' }).label;
    return C.ROLE_NAME[node.role] || 'Box';
  };

  function para(text, st, extra) {
    return Object.assign({ text: text, size: st.fontSize, bold: st.bold, italic: st.italic, color: st.textColor, align: st.align }, extra || {});
  }
  function bullets(doc, key, st, color) {
    return M.filled(doc, key).map(function (it) {
      return { text: it.text.trim(), size: st.fontSize, color: color || st.textColor, bullet: true, before: st.fontSize * 0.28, italic: st.italic, bold: false };
    });
  }

  /** Lay out several columns of paragraphs side by side. */
  function columns(cols, width, gap, stack) {
    var flexCount = cols.filter(function (c) { return !c.w; }).length;
    var fixed = cols.reduce(function (a, c) { return a + (c.w || 0); }, 0);
    var flexW = flexCount ? Math.max(20, (width - fixed - gap * (cols.length - 1)) / flexCount) : 0;
    var x = 0, lines = [], height = 0, broken = 0;
    cols.forEach(function (c) {
      var w = c.w || flexW;
      var r = T.layoutParas(c.paras, w, stack);
      r.lines.forEach(function (ln) { ln.x += x; lines.push(ln); });
      height = Math.max(height, r.height);
      broken += r.broken;
      x += w + gap;
    });
    return { lines: lines, height: height, broken: broken };
  }
  function stackBlocks(blocks, gap) {
    var lines = [], y = 0, first = true, broken = 0;
    blocks.forEach(function (b) {
      if (!b || !b.lines.length && !b.height) return;
      if (!first) y += gap;
      first = false;
      b.lines.forEach(function (ln) { ln.y += y; lines.push(ln); });
      y += b.height;
      broken += b.broken || 0;
    });
    return { lines: lines, height: y, broken: broken };
  }
  function half(list) {
    var k = Math.ceil(list.length / 2);
    return [list.slice(0, k), list.slice(k)];
  }

  /**
   * Wrapped text for a node whose text area is `w` wide.
   * Returns {lines, height}; line x/y are relative to the text area.
   */
  C.layoutText = function (doc, node, st, w) {
    var stack = T.stack(doc.diagram.fontFamily);
    var c = doc.content;
    var fs = st.fontSize;
    if (node.role === 'problem') {
      var label = para(C.LABELS.problem, st, { bold: true, color: st.labelColor, size: fs * 0.92, italic: false });
      var body = U.isBlank(c.problem) ? null : para(c.problem.trim(), st, { before: fs * 0.3 });
      if (w >= 520 && body) { // wide band: label on the left, statement on the right
        return columns([{ w: U.clamp(w * 0.14, 100, 150), paras: [Object.assign({}, label, { align: 'left' })] }, { paras: [Object.assign({}, body, { before: 0 })] }], w, 16, stack);
      }
      return T.layoutParas(body ? [label, body] : [label], w, stack);
    }
    if (node.role === 'context') {
      var tt = [para(C.LABELS.contextTitle, st, { bold: true, size: fs * 1.08, italic: false, align: 'left' }),
        para(C.LABELS.contextSub, st, { size: fs * 0.9, before: 1, italic: false, align: 'left' })];
      var groups = M.CONTEXT.map(function (k) {
        return [para(c.sections[k].label, st, { bold: true, color: st.labelColor, size: fs * 0.95, italic: false, align: 'left' })].concat(bullets(doc, k, st));
      });
      if (w >= 600) return columns([{ w: U.clamp(w * 0.14, 110, 150), paras: tt }, { paras: groups[0] }, { paras: groups[1] }], w, 22, stack);
      if (w >= 330) return stackBlocks([T.layoutParas(tt, w, stack), columns([{ paras: groups[0] }, { paras: groups[1] }], w, 16, stack)], fs * 0.5);
      return stackBlocks([T.layoutParas(tt, w, stack), T.layoutParas(groups[0], w, stack), T.layoutParas(groups[1], w, stack)], fs * 0.5);
    }
    if (node.role === 'assumptions') {
      var lab = [para(c.sections.assumptions.label, st, { bold: true, color: st.labelColor, size: fs * 1.08, italic: false, align: 'left' })];
      var bl = bullets(doc, 'assumptions', st);
      if (w >= 600) {
        var h2 = half(bl);
        return columns([{ w: U.clamp(w * 0.14, 110, 150), paras: lab }, { paras: h2[0] }, { paras: h2[1] }], w, 22, stack);
      }
      if (w >= 330 && bl.length > 2) {
        var h3 = half(bl);
        return stackBlocks([T.layoutParas(lab, w, stack), columns([{ paras: h3[0] }, { paras: h3[1] }], w, 16, stack)], fs * 0.3);
      }
      return T.layoutParas(lab.concat(bl), w, stack);
    }
    // Trailing spaces / line breaks (say, pasted from Word) would add an empty line.
    var text = (C.text(doc, node) || '').replace(/\s+$/, '');
    return T.layoutParas([para(text, st)], w, stack);
  };

  /* ---------------------------------------------------------------------------
     GEOMETRY
     ------------------------------------------------------------------------ */

  /** Bracket depth (how far its arms reach). */
  C.bracketDepth = function (st) { return 9 + st.strokeWidth * 1.5; };

  /**
   * Text area inside a shape of size w×h (relative to the node's top-left).
   */
  C.textArea = function (shape, w, h, st) {
    var px = st.pad, py = st.padY;
    var l = px, r = px, t = py, b = py;
    switch (shape) {
      case 'ellipse': l += w * 0.146; r += w * 0.146; t += h * 0.146; b += h * 0.146; break;
      case 'diamond': l += w * 0.25; r += w * 0.25; t += h * 0.25; b += h * 0.25; break;
      case 'hexagon': { var hx = Math.min(h * 0.29, w * 0.22); l += hx * 0.8; r += hx * 0.8; break; }
      case 'parallelogram': { var sk = Math.min(w * 0.18, h * 0.5, 26); l += sk * 0.9; r += sk * 0.9; break; }
      case 'chevron': r += C.chevronTip(w, h); break;
      case 'pill': { var pr = Math.min(h / 2, w / 2); l += pr * 0.45; r += pr * 0.45; break; }
      case 'note': r += 6; t += 2; break;
      case 'bracket': {
        var d = C.bracketDepth(st) + 4;
        if (st.dir === 'down') b += d; else if (st.dir === 'up') t += d; else if (st.dir === 'left') l += d; else r += d;
        break;
      }
      default: break;
    }
    if (st.accentBar && st.accentBar !== 'none') l += 4;
    return { x: l, y: t, w: Math.max(4, w - l - r), h: Math.max(4, h - t - b) };
  };
  C.chevronTip = function (w, h) { return Math.min(w * 0.24, h * 0.5, 30); };

  /**
   * How many words had to be split inside the word to fit a node of width w
   * (0 when every word fits on a line of its own). See T.wrap.
   */
  C.breaks = function (doc, node, w) {
    if (node.role === 'panel') return 0;
    var st = C.style(doc, node);
    var area = C.textArea(st.shape, w, node.h || 1000, st);
    return C.layoutText(doc, node, st, area.w).broken || 0;
  };

  /** The minimum height for a node of width w so its text fits. */
  C.need = function (doc, node, w) {
    var st = C.style(doc, node);
    return C.needFor(doc, node, st, w);
  };
  C.needFor = function (doc, node, st, w) {
    if (node.role === 'panel') return 24;
    var shape = st.shape;
    // Text area width does not depend on height for most shapes; solve for height.
    var area = C.textArea(shape, w, 1000, st);
    var lay = C.layoutText(doc, node, st, area.w);
    var th = lay.height;
    var fracY = 0, fixedY = st.padY * 2;
    if (shape === 'ellipse') fracY = 0.146 * 2;
    else if (shape === 'diamond') fracY = 0.5;
    if (shape === 'bracket') {
      if (st.dir === 'down' || st.dir === 'up') fixedY += C.bracketDepth(st) + 4;
      else fixedY = 0;
    }
    if (shape === 'note') fixedY += 2;
    if (shape === 'hexagon' || shape === 'parallelogram') {
      // horizontal insets depend on height: re-measure once with a height estimate
      var est = th + fixedY;
      var area2 = C.textArea(shape, w, est, st);
      th = C.layoutText(doc, node, st, area2.w).height;
    }
    var hmin = (th + fixedY) / (1 - fracY);
    return Math.ceil(Math.max(hmin, st.fontSize + 2) * 2) / 2;
  };

  /** SVG path data for a shape (absolute coordinates). */
  C.shapePath = function (shape, x, y, w, h, st) {
    var n = U.n;
    var r = Math.max(0, Math.min(st.radius || 0, w / 2, h / 2));
    switch (shape) {
      case 'text': return '';
      case 'pill': r = Math.min(w, h) / 2; /* falls through */
      case 'rounded':
        if (shape === 'rounded' && !r) r = Math.min(8, w / 2, h / 2);
        /* falls through */
      case 'rect':
        if (!r) return 'M' + n(x) + ' ' + n(y) + 'H' + n(x + w) + 'V' + n(y + h) + 'H' + n(x) + 'Z';
        return 'M' + n(x + r) + ' ' + n(y) + 'H' + n(x + w - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x + w) + ' ' + n(y + r) +
          'V' + n(y + h - r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x + w - r) + ' ' + n(y + h) +
          'H' + n(x + r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x) + ' ' + n(y + h - r) +
          'V' + n(y + r) + 'A' + n(r) + ' ' + n(r) + ' 0 0 1 ' + n(x + r) + ' ' + n(y) + 'Z';
      case 'ellipse': {
        var rx = w / 2, ry = h / 2;
        return 'M' + n(x) + ' ' + n(y + ry) + 'A' + n(rx) + ' ' + n(ry) + ' 0 1 1 ' + n(x + w) + ' ' + n(y + ry) +
          'A' + n(rx) + ' ' + n(ry) + ' 0 1 1 ' + n(x) + ' ' + n(y + ry) + 'Z';
      }
      case 'diamond':
        return 'M' + n(x + w / 2) + ' ' + n(y) + 'L' + n(x + w) + ' ' + n(y + h / 2) + 'L' + n(x + w / 2) + ' ' + n(y + h) + 'L' + n(x) + ' ' + n(y + h / 2) + 'Z';
      case 'hexagon': {
        var hx = Math.min(h * 0.29, w * 0.22);
        return 'M' + n(x + hx) + ' ' + n(y) + 'H' + n(x + w - hx) + 'L' + n(x + w) + ' ' + n(y + h / 2) + 'L' + n(x + w - hx) + ' ' + n(y + h) +
          'H' + n(x + hx) + 'L' + n(x) + ' ' + n(y + h / 2) + 'Z';
      }
      case 'parallelogram': {
        var sk = Math.min(w * 0.18, h * 0.5, 26);
        return 'M' + n(x + sk) + ' ' + n(y) + 'H' + n(x + w) + 'L' + n(x + w - sk) + ' ' + n(y + h) + 'H' + n(x) + 'Z';
      }
      case 'chevron': {
        var t = C.chevronTip(w, h);
        var cr = Math.min(r, 6);
        if (!cr) return 'M' + n(x) + ' ' + n(y) + 'H' + n(x + w - t) + 'L' + n(x + w) + ' ' + n(y + h / 2) + 'L' + n(x + w - t) + ' ' + n(y + h) + 'H' + n(x) + 'Z';
        return 'M' + n(x + cr) + ' ' + n(y) + 'H' + n(x + w - t) + 'L' + n(x + w) + ' ' + n(y + h / 2) + 'L' + n(x + w - t) + ' ' + n(y + h) +
          'H' + n(x + cr) + 'Q' + n(x) + ' ' + n(y + h) + ' ' + n(x) + ' ' + n(y + h - cr) + 'V' + n(y + cr) + 'Q' + n(x) + ' ' + n(y) + ' ' + n(x + cr) + ' ' + n(y) + 'Z';
      }
      case 'note': {
        var f = Math.min(14, w / 3, h / 3);
        return 'M' + n(x) + ' ' + n(y) + 'H' + n(x + w - f) + 'L' + n(x + w) + ' ' + n(y + f) + 'V' + n(y + h) + 'H' + n(x) + 'Z' +
          'M' + n(x + w - f) + ' ' + n(y) + 'V' + n(y + f) + 'H' + n(x + w);
      }
      case 'bracket': return C.bracketPath(x, y, w, h, st);
      default: return 'M' + n(x) + ' ' + n(y) + 'H' + n(x + w) + 'V' + n(y + h) + 'H' + n(x) + 'Z';
    }
  };

  /** A rounded "[" opening toward the content (dir = the side it opens to). */
  C.bracketPath = function (x, y, w, h, st) {
    var n = U.n, d = C.bracketDepth(st);
    var r = Math.min(d * 0.8, 9);
    switch (st.dir) {
      case 'up': { // arms point up, label below
        var yl = y + d;
        return 'M' + n(x) + ' ' + n(y) + 'V' + n(yl - r) + 'Q' + n(x) + ' ' + n(yl) + ' ' + n(x + r) + ' ' + n(yl) +
          'H' + n(x + w - r) + 'Q' + n(x + w) + ' ' + n(yl) + ' ' + n(x + w) + ' ' + n(yl - r) + 'V' + n(y);
      }
      case 'left': { // arms point left, label on the right
        var xl = x + d;
        return 'M' + n(x) + ' ' + n(y) + 'H' + n(xl - r) + 'Q' + n(xl) + ' ' + n(y) + ' ' + n(xl) + ' ' + n(y + r) +
          'V' + n(y + h - r) + 'Q' + n(xl) + ' ' + n(y + h) + ' ' + n(xl - r) + ' ' + n(y + h) + 'H' + n(x);
      }
      case 'right': { // arms point right, label on the left
        var xr = x + w - d;
        return 'M' + n(x + w) + ' ' + n(y) + 'H' + n(xr + r) + 'Q' + n(xr) + ' ' + n(y) + ' ' + n(xr) + ' ' + n(y + r) +
          'V' + n(y + h - r) + 'Q' + n(xr) + ' ' + n(y + h) + ' ' + n(xr + r) + ' ' + n(y + h) + 'H' + n(x + w);
      }
      default: { // 'down': arms point down, label above
        var yd = y + h - d;
        return 'M' + n(x) + ' ' + n(y + h) + 'V' + n(yd + r) + 'Q' + n(x) + ' ' + n(yd) + ' ' + n(x + r) + ' ' + n(yd) +
          'H' + n(x + w - r) + 'Q' + n(x + w) + ' ' + n(yd) + ' ' + n(x + w) + ' ' + n(yd + r) + 'V' + n(y + h);
      }
    }
  };

  /** Shapes drawn as open strokes (no fill). */
  C.isOpenShape = function (shape) { return shape === 'bracket'; };

  /** SVG stroke-dasharray for a dash style. */
  C.dashArray = function (dash, sw) {
    if (dash === 'dashed') return U.n(sw * 3 + 3) + ' ' + U.n(sw * 2 + 2.5);
    if (dash === 'dotted') return U.n(Math.max(sw, 1)) + ' ' + U.n(sw * 1.6 + 1.6);
    return null;
  };

  LMB.content = C;
})();

/* =============================================================================
   editor.js — Step 2, "Design": the drawing canvas.

   What you can do here (mouse, trackpad, touch, keyboard):
     click / Shift-click / drag on empty canvas    select, add to selection, marquee
     drag a box (or a loose line by its middle)    move (snaps to an 8-unit grid)
     handles                                       resize; text re-wraps
     double-click (or Enter)                       edit text in place
     drag from a blue port dot                     draw an arrow to another box
     ] / [                                         select the next / previous box or arrow
     A, then Enter on one box and Enter on another connect them from the keyboard
     Delete, arrows (Shift = 10), ⌘C ⌘V ⌘D ⌘X     delete, nudge, copy, paste, duplicate, cut
     ⌘] / ⌘[  (with ⇧: all the way)                bring forward / send back
     wheel or two fingers = pan; ⌘/Ctrl + wheel or pinch = zoom; Space-drag = pan
   The canvas draws the same SVG as the exports (render.js) plus an overlay
   layer for selection, handles and ports, which never reaches an export.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, S = LMB.store, R = LMB.render, C = LMB.content, M = LMB.model, T = LMB.text;
  var h = U.h, n = U.n;

  var E = {};
  var svg, vp, layerBg, layerDia, layerOv, wrap, notice, emptyNote, toolbar, zoomCtl, zoomVal, live;
  var view = { z: 1, x: 0, y: 0 };
  var fitted = false;
  var lastFit = null;            // the view E.fit made, to tell whether the student has zoomed or panned since
  var inspBtn = null;            // "Properties" (narrow screens only)
  var tool = 'select';           // 'select' | 'hand' | 'arrow'
  var snap = true;
  var GRID = 8;
  var hoverId = null;
  var hoverPt = null;            // where the pointer is (diagram units), for the port dots
  var gesture = null;
  var pointers = new Map();
  var spaceDown = false;
  var editing = null;            // {id, el, kind}
  var clipboard = null;
  var pasteCount = 0;
  var arrowSource = null;        // two-click arrow tool: first node
  var downType = 'mouse';        // pointer type of the last press ('mouse' | 'pen' | 'touch')
  var noticeDismissed = false;
  var dirty = true;

  /** Size of each new element added from the toolbar. */
  var NEW_SIZE = {
    rect: [150, 56], rounded: [150, 56], pill: [150, 44], ellipse: [150, 72], diamond: [130, 92],
    hexagon: [150, 60], parallelogram: [150, 56], chevron: [150, 56], note: [150, 90], text: [180, 30], bracket: [220, 40]
  };

  /* ---------------------------------------------------------------------------
     VIEW (zoom / pan)
     ------------------------------------------------------------------------ */
  function rect() { return svg.getBoundingClientRect(); }
  function toWorld(cx, cy) { var r = rect(); return { x: (cx - r.left - view.x) / view.z, y: (cy - r.top - view.y) / view.z }; }
  function applyView() {
    vp.setAttribute('transform', 'translate(' + n(view.x) + ' ' + n(view.y) + ') scale(' + view.z + ')');
    if (zoomVal) {
      // The spoken name starts with the visible number (so "click 84 percent" works by voice).
      zoomVal.textContent = Math.round(view.z * 100) + '%';
      zoomVal.setAttribute('aria-label', zoomVal.textContent + ', reset zoom to 100%');
    }
    drawBg();
    drawOverlay();
    if (editing) positionEditor();
  }
  function zoomAt(z, cx, cy) {
    z = U.clamp(z, 0.1, 6);
    var r = rect();
    var px = cx - r.left, py = cy - r.top;
    var wx = (px - view.x) / view.z, wy = (py - view.y) / view.z;
    view.z = z;
    view.x = px - wx * z;
    view.y = py - wy * z;
    applyView();
  }
  function zoomBy(f) { var r = rect(); zoomAt(view.z * f, r.left + r.width / 2, r.top + r.height / 2); }
  /**
   * On narrow screens the Properties panel is a sheet over the bottom of the
   * canvas, with the Properties button just above it. How many pixels at the
   * bottom of the canvas they cover (0 on wide screens, where the panel sits
   * beside the canvas and the button is hidden).
   */
  function coveredBottom() {
    if (!inspBtn || !inspBtn.offsetParent) return 0;
    var insp = document.getElementById('inspector');
    var open = insp && insp.classList.contains('open');
    return (open ? insp.offsetHeight + 8 : 12) + inspBtn.offsetHeight + 8;
  }
  /** Keep the Properties button 8 px above the top of the open sheet. */
  function placeInspBtn() {
    if (!inspBtn) return;
    var insp = document.getElementById('inspector');
    inspBtn.style.bottom = insp.classList.contains('open') && inspBtn.offsetParent ? (insp.offsetHeight + 8) + 'px' : '';
  }

  /** Fit the page (and anything outside it) in the window: the part of it
   *  not under the Properties sheet, on narrow screens. */
  E.fit = function () {
    var r = rect();
    if (!r.width || !r.height) return;
    var cover = coveredBottom();
    var hgt = Math.max(80, r.height - cover);
    var doc = S.doc, page = M.page(doc);
    var b = R.bounds(doc);
    var x1, y1, x2, y2;
    if (doc.diagram.page !== 'none') { x1 = 0; y1 = 0; x2 = page.w; y2 = page.h; } else { x1 = Infinity; y1 = Infinity; x2 = -Infinity; y2 = -Infinity; }
    if (!b.empty) { x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h); }
    if (!isFinite(x1)) { x1 = 0; y1 = 0; x2 = page.w; y2 = page.h; }
    var pad = r.width < 600 ? 16 : 40;
    function place(bottomPad) {
      var z = Math.min((r.width - 2 * pad) / (x2 - x1), (hgt - pad - bottomPad) / (y2 - y1));
      view.z = U.clamp(z, 0.1, 2);
      view.x = (r.width - (x2 - x1) * view.z) / 2 - x1 * view.z;
      view.y = pad + (hgt - pad - bottomPad - (y2 - y1) * view.z) / 2 - y1 * view.z;
    }
    place(pad);
    // The zoom buttons float over the bottom-right corner of the canvas. If
    // the page's corner ends up under them, fit again with room left below.
    var zc = zoomCtl && zoomCtl.offsetParent ? zoomCtl.getBoundingClientRect() : null;
    if (zc && zc.height) {
      var zl = zc.left - r.left - 8, zt = zc.top - r.top - 8;
      if (view.x + x2 * view.z > zl && view.y + y2 * view.z > zt) place(Math.max(pad, hgt - zt));
    }
    fitted = true;
    lastFit = { z: view.z, x: view.x, y: view.y };
    applyView();
  };

  /* ---------------------------------------------------------------------------
     DRAWING
     ------------------------------------------------------------------------ */
  function visible() { return S.ui.step === 'design'; }
  var queue = U.rafThrottle(function () { render(); });
  function render() {
    if (!visible()) { dirty = true; return; }
    dirty = false;
    layerDia.innerHTML = R.body(S.doc, { mode: 'canvas', editingId: editing && editing.kind === 'inline' ? editing.id : null, labelBg: R.background(S.doc) || '#ffffff' });
    drawBg();
    drawOverlay();
    updateNotice();
    updateToolbar();
  }

  function drawBg() {
    var doc = S.doc, page = M.page(doc);
    var r = rect();
    var x0 = -view.x / view.z, y0 = -view.y / view.z, w = r.width / view.z, hh = r.height / view.z;
    var bg = R.background(doc) || '#ffffff';
    var out = '<rect x="' + n(x0) + '" y="' + n(y0) + '" width="' + n(w) + '" height="' + n(hh) + '" fill="url(#dotgrid)"/>';
    if (doc.diagram.page !== 'none') {
      out += '<rect x="0" y="0" width="' + page.w + '" height="' + page.h + '" fill="' + bg + '" filter="url(#pageshadow)"/>';
      out += '<rect x="0" y="0" width="' + page.w + '" height="' + page.h + '" fill="none" stroke="#8a9aa6" stroke-width="' + n(1 / view.z) + '" stroke-dasharray="' + n(6 / view.z) + ' ' + n(4 / view.z) + '"/>';
    } else {
      var b = R.bounds(doc);
      if (!b.empty) out += '<rect x="' + n(b.x - 24) + '" y="' + n(b.y - 24) + '" width="' + n(b.w + 48) + '" height="' + n(b.h + 48) + '" fill="' + bg + '" filter="url(#pageshadow)"/>';
    }
    layerBg.innerHTML = out;
  }

  function nodeById(id) { return S.node(id); }
  function selNodes() { return S.selected().map(nodeById).filter(function (nd) { return nd && !nd.hidden; }); }
  function selEdges() { return S.selected().map(function (id) { return S.edge(id); }).filter(Boolean); }

  function drawOverlay() {
    if (!layerOv) return;
    var z = view.z, out = [];
    var sw = 1.5 / z;
    var byId = R.byId(S.doc);
    var nodes = selNodes();
    nodes.forEach(function (nd) {
      out.push('<rect class="sel-box" x="' + n(nd.x) + '" y="' + n(nd.y) + '" width="' + n(nd.w) + '" height="' + n(nd.h) + '" fill="none" stroke="#1d8fc0" stroke-width="' + n(sw) + '" pointer-events="none"/>');
    });
    // Hover outline + ports (none while text is being edited: they would sit on the words)
    var showPorts = (tool === 'select' || tool === 'arrow') && !gesture && !editing && hoverId && byId[hoverId] && !byId[hoverId].hidden;
    if (hoverId && byId[hoverId] && !byId[hoverId].hidden && nodes.indexOf(byId[hoverId]) < 0 && (!gesture || gesture.type === 'connect' || gesture.type === 'end')) {
      var hv = byId[hoverId];
      out.push('<rect x="' + n(hv.x) + '" y="' + n(hv.y) + '" width="' + n(hv.w) + '" height="' + n(hv.h) + '" fill="none" stroke="#1d8fc0" stroke-opacity=".55" stroke-width="' + n(sw) + '" pointer-events="none"/>');
    }
    if (gesture && (gesture.type === 'connect' || gesture.type === 'end') && gesture.target) {
      var tg = byId[gesture.target];
      if (tg) out.push('<rect x="' + n(tg.x - 3 / z) + '" y="' + n(tg.y - 3 / z) + '" width="' + n(tg.w + 6 / z) + '" height="' + n(tg.h + 6 / z) + '" fill="none" stroke="#1d8fc0" stroke-width="' + n(2 / z) + '" rx="' + n(3 / z) + '" pointer-events="none"/>');
    }
    // Resize handles (single node; none while its text is being edited)
    if (nodes.length === 1 && !gesture && !editing) {
      var nd = nodes[0];
      var hs = 8 / z;
      handlePoints(nd).forEach(function (p) {
        out.push('<rect data-handle="' + p.d + '" x="' + n(p.x - hs / 2) + '" y="' + n(p.y - hs / 2) + '" width="' + n(hs) + '" height="' + n(hs) + '" fill="#ffffff" stroke="#1d8fc0" stroke-width="' + n(1.2 / z) + '" style="cursor:' + p.c + '"/>');
      });
      if (nd.role === 'item') {
        // "+" adds a sibling below. It sits just outside the box's bottom-right
        // corner, not under the box: items in a column are only a few pixels
        // apart, so anything below the box would cover the next item's words.
        // The white ring keeps it readable over a column border.
        var px = nd.x + nd.w + 16 / z, py = nd.y + nd.h, pr = 8 / z;
        out.push('<g data-plus="' + U.escXML(nd.id) + '" style="cursor:pointer"><title>Add an item below</title><circle cx="' + n(px) + '" cy="' + n(py) + '" r="' + n(pr) + '" fill="#1d8fc0" stroke="#ffffff" stroke-width="' + n(4 / z) + '" paint-order="stroke"/>' +
          '<path d="M' + n(px - pr * 0.5) + ' ' + n(py) + 'H' + n(px + pr * 0.5) + 'M' + n(px) + ' ' + n(py - pr * 0.5) + 'V' + n(py + pr * 0.5) + '" stroke="#fff" stroke-width="' + n(1.6 / z) + '" stroke-linecap="round"/></g>');
      }
    }
    if (showPorts) {
      var hn = byId[hoverId];
      portPoints(hn, 13 / z).filter(function (p) { return portShown(hn, p.side); }).forEach(function (p) {
        // A white ring first, so the dot stands out from any text it sits on.
        out.push('<circle cx="' + n(p.x) + '" cy="' + n(p.y) + '" r="' + n(4.5 / z) + '" fill="#ffffff" stroke="#ffffff" stroke-width="' + n(5.6 / z) + '" pointer-events="none"/>');
        out.push('<circle data-port="' + p.side + '" data-node="' + U.escXML(hn.id) + '" cx="' + n(p.x) + '" cy="' + n(p.y) + '" r="' + n(4.5 / z) + '" fill="#ffffff" stroke="#1d8fc0" stroke-width="' + n(1.6 / z) + '" style="cursor:crosshair"/>');
      });
    }
    // Selected arrows: highlight + draggable ends
    selEdges().forEach(function (e) {
      var g = R.edgeGeom(S.doc, e, byId);
      if (!g) return;
      var d = g.curve
        ? 'M' + n(g.pts[0].x) + ' ' + n(g.pts[0].y) + 'C' + n(g.curve[0].x) + ' ' + n(g.curve[0].y) + ' ' + n(g.curve[1].x) + ' ' + n(g.curve[1].y) + ' ' + n(g.pts[1].x) + ' ' + n(g.pts[1].y)
        : 'M' + g.pts.map(function (p) { return n(p.x) + ' ' + n(p.y); }).join('L');
      out.push('<path d="' + d + '" fill="none" stroke="#1d8fc0" stroke-opacity=".35" stroke-width="' + n(6 / z) + '" pointer-events="none"/>');
      // Automatic column arrows always run between their columns (layout.js
      // re-attaches them on every change), so their ends get no drag handles.
      if (e.auto) return;
      var a = g.pts[0], b = g.pts[g.pts.length - 1];
      [['from', a], ['to', b]].forEach(function (pp) {
        out.push('<circle data-end="' + pp[0] + '" data-edge-id="' + U.escXML(e.id) + '" cx="' + n(pp[1].x) + '" cy="' + n(pp[1].y) + '" r="' + n(5.5 / z) + '" fill="#ffffff" stroke="#1d8fc0" stroke-width="' + n(2 / z) + '" style="cursor:move"/>');
      });
    });
    // Live gestures
    if (gesture && gesture.type === 'marquee' && gesture.moved) {
      var m = gesture.box;
      out.push('<rect x="' + n(m.x) + '" y="' + n(m.y) + '" width="' + n(m.w) + '" height="' + n(m.h) + '" fill="rgba(29,143,192,.08)" stroke="#1d8fc0" stroke-width="' + n(1 / z) + '" pointer-events="none"/>');
    }
    if (gesture && (gesture.type === 'connect' || gesture.type === 'line') && gesture.moved) {
      out.push('<path d="M' + n(gesture.a.x) + ' ' + n(gesture.a.y) + 'L' + n(gesture.b.x) + ' ' + n(gesture.b.y) + '" stroke="#1d8fc0" stroke-width="' + n(2 / z) + '" stroke-dasharray="' + n(5 / z) + ' ' + n(4 / z) + '" pointer-events="none"/>');
    }
    if (gesture && gesture.guides) {
      gesture.guides.forEach(function (gd) {
        out.push('<path d="M' + n(gd.x1) + ' ' + n(gd.y1) + 'L' + n(gd.x2) + ' ' + n(gd.y2) + '" stroke="#e0457b" stroke-width="' + n(1 / z) + '" pointer-events="none"/>');
      });
    }
    if (arrowSource && byId[arrowSource]) {
      var as = byId[arrowSource];
      out.push('<rect x="' + n(as.x - 3 / z) + '" y="' + n(as.y - 3 / z) + '" width="' + n(as.w + 6 / z) + '" height="' + n(as.h + 6 / z) + '" fill="none" stroke="#1d8fc0" stroke-width="' + n(2 / z) + '" stroke-dasharray="' + n(4 / z) + ' ' + n(3 / z) + '" pointer-events="none"/>');
    }
    layerOv.innerHTML = out.join('');
  }

  function handlePoints(nd) {
    var x = nd.x, y = nd.y, w = nd.w, hh = nd.h;
    return [
      { d: 'nw', x: x, y: y, c: 'nwse-resize' }, { d: 'n', x: x + w / 2, y: y, c: 'ns-resize' }, { d: 'ne', x: x + w, y: y, c: 'nesw-resize' },
      { d: 'e', x: x + w, y: y + hh / 2, c: 'ew-resize' }, { d: 'se', x: x + w, y: y + hh, c: 'nwse-resize' }, { d: 's', x: x + w / 2, y: y + hh, c: 'ns-resize' },
      { d: 'sw', x: x, y: y + hh, c: 'nesw-resize' }, { d: 'w', x: x, y: y + hh / 2, c: 'ew-resize' }
    ];
  }
  /** Side midpoints; `off` pushes them outward (ports sit just outside the box, clear of the resize handles). */
  function portPoints(nd, off) {
    off = off || 0;
    return [
      { side: 'top', x: nd.x + nd.w / 2, y: nd.y - off }, { side: 'right', x: nd.x + nd.w + off, y: nd.y + nd.h / 2 },
      { side: 'bottom', x: nd.x + nd.w / 2, y: nd.y + nd.h + off }, { side: 'left', x: nd.x - off, y: nd.y + nd.h / 2 }
    ];
  }
  /**
   * Is a port dot shown on this side of the hovered box? Items in a column sit
   * only a few pixels apart, so their top and bottom dots would cover the
   * header or the neighbouring item's words: those two appear only once the
   * pointer comes near that edge (the outer quarter of the box, at most
   * 8 screen pixels in) or goes past it. Every other side, and every other
   * box, always shows its dot.
   */
  function portShown(nd, side) {
    if (nd.role !== 'item' || (side !== 'top' && side !== 'bottom')) return true;
    if (!hoverPt) return false;
    var inside = side === 'top' ? hoverPt.y - nd.y : nd.y + nd.h - hoverPt.y; // distance in from that edge
    return inside <= Math.min(8 / view.z, nd.h / 4);
  }
  /** Which ports are shown now (to redraw only when that changes). */
  function portKey() {
    var nd = hoverId && nodeById(hoverId);
    return nd ? hoverId + ':' + portShown(nd, 'top') + portShown(nd, 'bottom') : '';
  }

  /** Port side nearest to a world point, if within reach. */
  function nearSide(nd, p) {
    var best = null, bd = 16 / view.z;
    portPoints(nd).forEach(function (q) { var d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q.side; } });
    return best;
  }

  /* ---------------------------------------------------------------------------
     HIT TESTING
     ------------------------------------------------------------------------ */
  function nodeAtPoint(p, exclude) {
    var nodes = S.doc.diagram.nodes;
    for (var i = nodes.length - 1; i >= 0; i--) {
      var nd = nodes[i];
      if (nd.hidden || !R.hasGeom(nd) || nd.id === exclude) continue;
      if (p.x >= nd.x && p.x <= nd.x + nd.w && p.y >= nd.y && p.y <= nd.y + nd.h) return nd;
    }
    return null;
  }

  /* ---------------------------------------------------------------------------
     MUTATION HELPERS
     ------------------------------------------------------------------------ */
  function isLinked(nd) { return nd.role !== 'free'; }
  function snapV(v) { return snap ? Math.round(v / GRID) * GRID : Math.round(v * 2) / 2; }
  /** First hand edit of a linked box switches auto layout off (with a notice). */
  function manualOff(d, nodes) {
    if (d.diagram.autoLayout && nodes.some(isLinked)) { d.diagram.autoLayout = false; noticeDismissed = false; return true; }
    return false;
  }

  /**
   * Ids that move with a node: dragging a panel carries its header and items,
   * including the hidden box of an item that is blank for now (so it comes
   * back inside the column when it gets text again).
   */
  function moveSet(ids) {
    var set = {};
    ids.forEach(function (id) {
      var nd = nodeById(id);
      if (!nd || nd.hidden) return;
      set[id] = true;
      if (nd.role === 'panel') {
        S.doc.diagram.nodes.forEach(function (m) {
          if ((m.role === 'item' || m.role === 'header') && m.link && m.link.section === nd.link.section && (!m.hidden || (m.role === 'item' && m.x != null && m.y != null))) set[m.id] = true;
        });
      }
    });
    return Object.keys(set);
  }

  /* ---------------------------------------------------------------------------
     POINTER INPUT
     ------------------------------------------------------------------------ */
  function onDown(e) {
    if (editing) commitEdit();
    if (e.button === 2) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (document.activeElement !== svg) svg.focus({ preventScroll: true });
    if (pointers.size === 2) {
      // A second finger means pinch-zoom. If the first finger already dragged
      // or resized a box, take that back (box, undo step and auto-arrange).
      if (gesture && gesture.entry) S.discard(gesture.entry);
      startPinch();
      return;
    }
    if (pointers.size > 2) return;
    var p = toWorld(e.clientX, e.clientY);
    var t = e.target;
    var touch = e.pointerType === 'touch';
    downType = e.pointerType || 'mouse';

    if (e.button === 1 || spaceDown || tool === 'hand') { startPan(e); return; }

    var handle = t.closest && t.closest('[data-handle]');
    var port = t.closest && t.closest('[data-port]');
    var end = t.closest && t.closest('[data-end]');
    var plus = t.closest && t.closest('[data-plus]');
    var nodeEl = t.closest && t.closest('.lmb-node');
    var edgeEl = t.closest && t.closest('.lmb-edge');

    if (plus) { e.preventDefault(); addSibling(plus.getAttribute('data-plus')); return; }
    if (handle) { startResize(e, handle.getAttribute('data-handle'), p); return; }
    if (end) { startEnd(e, end.getAttribute('data-edge-id'), end.getAttribute('data-end'), p); return; }
    if (port) { startConnect(e, port.getAttribute('data-node'), port.getAttribute('data-port'), p); return; }

    if (tool === 'arrow') {
      if (nodeEl) { startConnect(e, nodeEl.getAttribute('data-id'), null, p); return; }
      if (arrowSource) {
        // Second click of the two-click arrow tool landed on empty space:
        // the arrow ends there, with a loose end (as when dragging from a port).
        var from = arrowSource;
        arrowSource = null;
        createEdge({ from: from, to: null, toPt: { x: snapV(p.x), y: snapV(p.y) } });
        gesture = { type: 'none' };
        return;
      }
      startLine(e, p);
      return;
    }
    if (edgeEl) {
      var eid = edgeEl.getAttribute('data-edge');
      var esel = S.selected();
      // Dragging a line by its middle moves it, when both its ends are loose
      // (or it is part of a selection with boxes, which all move together).
      // An arrow attached to a box stays put; drag its end dots instead.
      var ed0 = S.edge(eid);
      var movable = ed0 && !ed0.auto && (!ed0.from && !ed0.to || selNodes().length);
      var eToggleOff = false;
      if (e.shiftKey || U.modKey(e)) {
        if (esel.indexOf(eid) >= 0) {
          // Shift-click on a selected line takes it out of the selection, but
          // only once the button comes up without a drag (Shift-drag moves it).
          if (!movable) { S.select(esel.filter(function (x) { return x !== eid; }), 'canvas'); gesture = { type: 'none' }; return; }
          eToggleOff = true;
        } else S.select(esel.concat([eid]), 'canvas');
      } else if (esel.indexOf(eid) < 0) {
        S.select([eid], 'canvas');
      }
      if (movable) { startMove(e, eid, p); gesture.toggleOff = eToggleOff; return; }
      gesture = { type: 'none' };
      return;
    }
    if (nodeEl) {
      var id = nodeEl.getAttribute('data-id');
      var sel = S.selected();
      var toggleOff = false;
      if (e.shiftKey || U.modKey(e)) {
        // Shift/⌘-click on a selected box takes it out of the selection, but
        // only if the button comes up without a drag: Shift-drag moves the
        // selection along one axis instead (see doMove).
        if (sel.indexOf(id) >= 0) toggleOff = true;
        else S.select(sel.concat([id]), 'canvas');
      } else if (sel.indexOf(id) < 0) {
        S.select([id], 'canvas');
      }
      startMove(e, id, p);
      gesture.toggleOff = toggleOff;
      return;
    }
    // Empty canvas
    if (touch) { if (!e.shiftKey) S.select([], 'canvas'); startPan(e); return; }
    gesture = { type: 'marquee', start: p, sx: e.clientX, sy: e.clientY, add: e.shiftKey || U.modKey(e), base: S.selected(), moved: false, box: { x: p.x, y: p.y, w: 0, h: 0 } };
    if (!gesture.add) S.select([], 'canvas');
  }

  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture && gesture.type === 'pinch') { movePinch(); return; }
    var p = toWorld(e.clientX, e.clientY);
    if (!gesture) {
      // Hover: ports on the box under the pointer.
      var t = e.target;
      var el = t.closest && (t.closest('.lmb-node') || t.closest('[data-port]'));
      var id = el ? (el.getAttribute('data-id') || el.getAttribute('data-node')) : null;
      var was = portKey();
      hoverPt = p;
      var hv = hoverId !== id && hoverId && nodeById(hoverId);
      if (hv && !hv.hidden) {
        // Keep the ports of the box just left, so the pointer can reach them:
        // while it is just outside the box over empty canvas or the column
        // panel around it, and while it is on one of those dots' spots (an
        // item's bottom dot sits over the next item).
        var m = 22 / view.z, cand = id && nodeById(id);
        var near = p.x > hv.x - m && p.x < hv.x + hv.w + m && p.y > hv.y - m && p.y < hv.y + hv.h + m;
        var onPort = portPoints(hv, 13 / view.z).some(function (q) { return portShown(hv, q.side) && Math.hypot(q.x - p.x, q.y - p.y) < 10 / view.z; });
        if (onPort || (near && (!cand || (cand.role === 'panel' && hv.role !== 'panel')))) id = hoverId;
      }
      if (id !== hoverId) { hoverId = id; drawOverlay(); } else if (portKey() !== was) drawOverlay();
      return;
    }
    var dxs = e.clientX - (gesture.sx || e.clientX), dys = e.clientY - (gesture.sy || e.clientY);
    // A press only becomes a drag past a few pixels; more for a finger, which
    // drifts while it rests on the glass (and may be the start of a pinch).
    if (!gesture.moved && Math.hypot(dxs, dys) < (downType === 'touch' ? 10 : 4)) return;
    gesture.moved = true;
    switch (gesture.type) {
      case 'pan': view.x = gesture.vx + dxs; view.y = gesture.vy + dys; applyView(); break;
      case 'move': doMove(p, e); break;
      case 'resize': doResize(p, e); break;
      case 'marquee': doMarquee(p); break;
      case 'connect': case 'line': case 'end': doLink(p); break;
      default: break;
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    try { svg.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (gesture && gesture.type === 'pinch') { if (pointers.size < 2) gesture = null; return; }
    var g = gesture;
    gesture = null;
    if (!g) return;
    var p = toWorld(e.clientX, e.clientY);
    // A drag that ends where it started (a small jiggle that snapped back)
    // leaves no undo step and does not switch auto-arrange off.
    if ((g.type === 'move' || g.type === 'resize') && g.entry && backWhereStarted(g)) { S.discard(g.entry); g.turnedOff = false; }
    if (g.type === 'move' && g.moved && g.turnedOff) showNoticeToast();
    if (g.type === 'move' && !g.moved && g.toggleOff) S.select(S.selected().filter(function (x) { return x !== g.clickedId; }), 'canvas');
    else if (g.type === 'move' && !g.moved && g.clickedId && !(e.shiftKey || U.modKey(e))) {
      // A plain click on a box that was part of a multi-selection selects just it.
      if (S.selected().length > 1) S.select([g.clickedId], 'canvas');
    }
    if (g.type === 'connect') endConnect(g, p);
    if (g.type === 'line') endLine(g, p);
    if (g.type === 'end') endEnd(g, p);
    if (g.type === 'resize' && g.moved && g.turnedOff) showNoticeToast();
    drawOverlay();
    updateToolbar();
  }

  /**
   * Esc while the button is still down: take the drag back. Boxes and lines
   * return to where they were (with no undo step and auto-arrange as it was),
   * a marquee restores the old selection, a pan the old view, and an arrow
   * being drawn is dropped. Releasing the button afterwards does nothing.
   */
  function cancelGesture() {
    var g = gesture;
    gesture = null;
    svg.classList.remove('panning');
    if (!g) return;
    if (g.entry) S.discard(g.entry);
    if (g.type === 'marquee') S.select(g.add ? g.base : [], 'canvas');
    if (g.type === 'pan') { view.x = g.vx; view.y = g.vy; applyView(); }
    drawOverlay();
    updateToolbar();
  }

  /* pan & pinch */
  function startPan(e) {
    gesture = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    svg.classList.add('panning');
  }
  function startPinch() {
    var ps = Array.from(pointers.values());
    gesture = { type: 'pinch', d0: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y) || 1, z0: view.z, m0: { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 }, vx: view.x, vy: view.y };
  }
  function movePinch() {
    var ps = Array.from(pointers.values());
    if (ps.length < 2) return;
    var g = gesture;
    var d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
    var m = { x: (ps[0].x + ps[1].x) / 2, y: (ps[0].y + ps[1].y) / 2 };
    var z = U.clamp(g.z0 * d / g.d0, 0.1, 6);
    var r = rect();
    var wx = (g.m0.x - r.left - g.vx) / g.z0, wy = (g.m0.y - r.top - g.vy) / g.z0;
    view.z = z;
    view.x = m.x - r.left - wx * z;
    view.y = m.y - r.top - wy * z;
    applyView();
  }

  /* move */
  function startMove(e, id, p) {
    var ids = moveSet(S.selected());
    var orig = {};
    ids.forEach(function (i) { var nd = nodeById(i); orig[i] = { x: nd.x, y: nd.y, base: nd.base ? U.clone(nd.base) : null }; });
    var edges = {}, edgeAnchor = null;
    S.selected().forEach(function (i) {
      var ed = S.edge(i);
      if (!ed) return;
      edges[i] = { fromPt: U.clone(ed.fromPt), toPt: U.clone(ed.toPt) };
      if (!edgeAnchor) edgeAnchor = !ed.from && ed.fromPt ? ed.fromPt : !ed.to && ed.toPt ? ed.toPt : null;
    });
    gesture = { type: 'move', sx: e.clientX, sy: e.clientY, start: p, ids: ids, orig: orig, edges: edges, edgeAnchor: edgeAnchor, clickedId: id, anchor: id, moved: false, key: 'gesture:' + U.uid() };
  }
  /** Did a move or resize end exactly where it started? */
  function backWhereStarted(g) {
    if (g.type === 'resize') {
      var r = nodeById(g.id);
      return !r || (r.x === g.o.x && r.y === g.o.y && r.w === g.o.w && r.h === g.o.h);
    }
    var same = g.ids.every(function (i) { var nd = nodeById(i), o = g.orig[i]; return !nd || !o || (nd.x === o.x && nd.y === o.y); });
    return same && Object.keys(g.edges).every(function (eid) { var ed = S.edge(eid); return !ed || U.deepEqual(ed.fromPt, g.edges[eid].fromPt) && U.deepEqual(ed.toPt, g.edges[eid].toPt); });
  }
  function doMove(p, e) {
    var g = gesture;
    var dx = p.x - g.start.x, dy = p.y - g.start.y;
    // Shift held: move along one axis only, whichever the pointer has gone further along.
    var lockX = e.shiftKey && Math.abs(dy) > Math.abs(dx), lockY = e.shiftKey && !lockX;
    if (lockX) dx = 0;
    if (lockY) dy = 0;
    // Snap the clicked box to the grid (a lone loose line: its first loose end).
    var a = g.orig[g.anchor] || g.orig[g.ids[0]] || g.edgeAnchor;
    var an = nodeById(g.anchor);
    // Smart guides: line the moving group up with other boxes (edges and centers).
    g.guides = [];
    var moving = {};
    g.ids.forEach(function (i) { moving[i] = true; });
    var bb = groupBox(g.ids, g.orig, dx, dy);
    var thr = 5 / view.z, gx = null, gy = null;
    if (!e.altKey && bb) {
      var xs = [bb.x, bb.x + bb.w / 2, bb.x + bb.w], ys = [bb.y, bb.y + bb.h / 2, bb.y + bb.h];
      S.doc.diagram.nodes.forEach(function (o) {
        if (moving[o.id] || o.hidden || !R.hasGeom(o) || o.role === 'panel' && g.ids.length < 3) return;
        [o.x, o.x + o.w / 2, o.x + o.w].forEach(function (ox) {
          xs.forEach(function (mx) { var d = ox - mx; if (Math.abs(d) < thr && (gx === null || Math.abs(d) < Math.abs(gx.d))) gx = { d: d, x: ox, o: o }; });
        });
        [o.y, o.y + o.h / 2, o.y + o.h].forEach(function (oy) {
          ys.forEach(function (my) { var d = oy - my; if (Math.abs(d) < thr && (gy === null || Math.abs(d) < Math.abs(gy.d))) gy = { d: d, y: oy, o: o }; });
        });
      });
    }
    if (lockX) gx = null; else if (gx) dx += gx.d; else if (a && !e.altKey) dx = snapV(a.x + dx) - a.x;
    if (lockY) gy = null; else if (gy) dy += gy.d; else if (a && !e.altKey) dy = snapV(a.y + dy) - a.y;
    var bb2 = groupBox(g.ids, g.orig, dx, dy);
    if (gx && bb2) g.guides.push({ x1: gx.x, y1: Math.min(bb2.y, gx.o.y) - 8, x2: gx.x, y2: Math.max(bb2.y + bb2.h, gx.o.y + gx.o.h) + 8 });
    if (gy && bb2) g.guides.push({ x1: Math.min(bb2.x, gy.o.x) - 8, y1: gy.y, x2: Math.max(bb2.x + bb2.w, gy.o.x + gy.o.w) + 8, y2: gy.y });
    var ids = g.ids;
    var changed = S.mutate('Move', function (d) {
      var nodes = []; // boxes that really moved (only those switch auto-arrange off)
      ids.forEach(function (i) {
        var nd = findIn(d, i), o = g.orig[i];
        if (!nd || !o) return;
        nd.x = Math.round((o.x + dx) * 100) / 100;
        nd.y = Math.round((o.y + dy) * 100) / 100;
        if (o.base) nd.base = { x: o.base.x + dx, y: o.base.y + dy, w: o.base.w, h: o.base.h };
        if (nd.x !== o.x || nd.y !== o.y) nodes.push(nd);
      });
      Object.keys(g.edges).forEach(function (eid) {
        var ed = findEdgeIn(d, eid), o = g.edges[eid];
        if (!ed) return;
        if (o.fromPt && !ed.from) ed.fromPt = { x: o.fromPt.x + dx, y: o.fromPt.y + dy };
        if (o.toPt && !ed.to) ed.toPt = { x: o.toPt.x + dx, y: o.toPt.y + dy };
      });
      if (manualOff(d, nodes)) g.turnedOff = true;
    }, { coalesce: g.key, source: 'canvas' });
    // The gesture's undo step, so a pinch or a return to the start can take it back.
    if (changed && !g.entry) g.entry = LMB.history.top();
    void an;
  }
  function groupBox(ids, orig, dx, dy) {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    ids.forEach(function (i) {
      var nd = nodeById(i), o = orig[i];
      if (!nd || !o) return;
      x1 = Math.min(x1, o.x + dx); y1 = Math.min(y1, o.y + dy); x2 = Math.max(x2, o.x + dx + nd.w); y2 = Math.max(y2, o.y + dy + nd.h);
    });
    return isFinite(x1) ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
  }
  function findIn(d, id) { for (var i = 0; i < d.diagram.nodes.length; i++) if (d.diagram.nodes[i].id === id) return d.diagram.nodes[i]; return null; }
  function findEdgeIn(d, id) { for (var i = 0; i < d.diagram.edges.length; i++) if (d.diagram.edges[i].id === id) return d.diagram.edges[i]; return null; }

  /* resize */
  function startResize(e, dir, p) {
    var nd = selNodes()[0];
    if (!nd) return;
    gesture = { type: 'resize', dir: dir, id: nd.id, sx: e.clientX, sy: e.clientY, start: p, o: { x: nd.x, y: nd.y, w: nd.w, h: nd.h }, moved: false, key: 'gesture:' + U.uid() };
  }
  function doResize(p, e) {
    var g = gesture, o = g.o, dir = g.dir;
    var nd = nodeById(g.id);
    if (!nd) return;
    var x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
    var dx = p.x - g.start.x, dy = p.y - g.start.y;
    if (/w/.test(dir)) x1 = snapV(o.x + dx);
    if (/e/.test(dir)) x2 = snapV(o.x + o.w + dx);
    if (/n/.test(dir)) y1 = snapV(o.y + dy);
    if (/s/.test(dir)) y2 = snapV(o.y + o.h + dy);
    var minW = 24;
    if (x2 - x1 < minW) { if (/w/.test(dir)) x1 = x2 - minW; else x2 = x1 + minW; }
    var w = x2 - x1;
    var st = C.style(S.doc, nd);
    var minH = nd.role === 'panel' ? 24 : (st.shape === 'bracket' && (st.dir === 'left' || st.dir === 'right') ? 24 : C.needFor(S.doc, nd, st, w));
    if (y2 - y1 < minH) { if (/n/.test(dir)) y1 = y2 - minH; else y2 = y1 + minH; }
    var changed = S.mutate('Resize', function (d) {
      var m = findIn(d, g.id);
      m.x = x1; m.y = y1; m.w = w; m.h = y2 - y1;
      m.fit = false;
      if (m.role === 'panel') m.base = { x: m.x, y: m.y, w: m.w, h: m.h };
      if (manualOff(d, [m])) g.turnedOff = true;
    }, { coalesce: g.key, source: 'canvas' });
    if (changed && !g.entry) g.entry = LMB.history.top(); // see doMove
  }

  /* marquee */
  function doMarquee(p) {
    var g = gesture;
    var b = { x: Math.min(g.start.x, p.x), y: Math.min(g.start.y, p.y), w: Math.abs(p.x - g.start.x), h: Math.abs(p.y - g.start.y) };
    g.box = b;
    var ids = [];
    S.doc.diagram.nodes.forEach(function (nd) {
      if (nd.hidden || !R.hasGeom(nd)) return;
      var inside = nd.x >= b.x && nd.y >= b.y && nd.x + nd.w <= b.x + b.w && nd.y + nd.h <= b.y + b.h;
      var hits = nd.x < b.x + b.w && nd.x + nd.w > b.x && nd.y < b.y + b.h && nd.y + nd.h > b.y;
      // Big background panels are only picked up when fully enclosed.
      if (nd.role === 'panel' ? inside : hits) ids.push(nd.id);
    });
    var byId = R.byId(S.doc);
    S.doc.diagram.edges.forEach(function (ed) {
      if (ed.hidden) return;
      var gg = R.edgeGeom(S.doc, ed, byId);
      if (!gg) return;
      var all = gg.pts.every(function (q) { return q.x >= b.x && q.x <= b.x + b.w && q.y >= b.y && q.y <= b.y + b.h; });
      if (all) ids.push(ed.id);
    });
    S.select(g.add ? g.base.concat(ids) : ids, 'canvas');
    drawOverlay();
  }

  /* connectors */
  function startConnect(e, nodeId, side, p) {
    var nd = nodeById(nodeId);
    if (!nd) return;
    if (tool === 'arrow' && arrowSource && arrowSource !== nodeId) {
      // second click of the two-click arrow tool
      createEdge({ from: arrowSource, to: nodeId, fromSide: null, toSide: nearSide(nd, p) });
      arrowSource = null;
      gesture = { type: 'none' };
      return;
    }
    var a = side ? portPoints(nd).filter(function (q) { return q.side === side; })[0] : { x: nd.x + nd.w / 2, y: nd.y + nd.h / 2 };
    gesture = { type: 'connect', from: nodeId, side: side, a: { x: a.x, y: a.y }, b: p, sx: e.clientX, sy: e.clientY, moved: false };
  }
  function startLine(e, p) {
    gesture = { type: 'line', a: { x: snapV(p.x), y: snapV(p.y) }, b: p, sx: e.clientX, sy: e.clientY, moved: false };
  }
  function doLink(p) {
    var g = gesture;
    g.b = p;
    var exclude = g.type === 'connect' ? g.from : null;
    if (g.type === 'end') {
      var ed = S.edge(g.edge);
      exclude = ed ? (g.which === 'from' ? ed.to : ed.from) : null;
    }
    var t = nodeAtPoint(p, exclude);
    if (t && t.role === 'panel' && g.type !== 'end') {
      var inner = nodeAtPoint(p, t.id);
      if (inner) t = inner;
    }
    g.target = g.type === 'line' ? null : (t ? t.id : null);
    if (g.type === 'end') {
      var target = g.target, q = { x: p.x, y: p.y };
      var changed = S.mutate('Move arrow end', function (d) {
        var m = findEdgeIn(d, g.edge);
        if (!m) return false;
        if (g.which === 'from') { m.from = null; m.fromPt = q; m.fromSide = null; } else { m.to = null; m.toPt = q; m.toSide = null; }
      }, { coalesce: g.key, source: 'canvas' });
      if (changed && !g.entry) g.entry = LMB.history.top(); // see doMove
      void target;
    }
    drawOverlay();
  }
  function endConnect(g, p) {
    if (!g.moved) {
      if (tool === 'arrow') { arrowSource = g.from; drawOverlay(); LMB.app.toast('Now click the box the arrow should point to.'); }
      return;
    }
    var t = g.target ? nodeById(g.target) : null;
    if (t) createEdge({ from: g.from, to: t.id, fromSide: g.side, toSide: nearSide(t, p) });
    else if (Math.hypot(p.x - g.a.x, p.y - g.a.y) > 12) createEdge({ from: g.from, to: null, fromSide: g.side, toPt: { x: snapV(p.x), y: snapV(p.y) } });
  }
  function endLine(g, p) {
    var a = g.a, b = g.moved ? { x: snapV(p.x), y: snapV(p.y) } : { x: a.x + 120, y: a.y };
    if (Math.hypot(b.x - a.x, b.y - a.y) < 8) b = { x: a.x + 120, y: a.y };
    createEdge({ from: null, fromPt: a, to: null, toPt: b });
  }
  function createEdge(o) {
    var id = U.uid('e');
    S.mutate('Add arrow', function (d) {
      d.diagram.edges.push({
        id: id, from: o.from || null, to: o.to || null, fromPt: o.fromPt || null, toPt: o.toPt || null,
        fromSide: o.fromSide || null, toSide: o.toSide || null, auto: false, route: 'straight', style: {}, label: '', hidden: false
      });
    }, { source: 'canvas' });
    S.select([id], 'canvas');
    if (tool === 'arrow') setTool('select');
  }
  function startEnd(e, edgeId, which, p) {
    gesture = { type: 'end', edge: edgeId, which: which, sx: e.clientX, sy: e.clientY, moved: false, key: 'gesture:' + U.uid() };
  }
  function endEnd(g, p) {
    if (!g.moved) return;
    var t = g.target ? nodeById(g.target) : null;
    S.mutate('Attach arrow', function (d) {
      var m = findEdgeIn(d, g.edge);
      if (!m) return false;
      if (t) {
        var side = nearSide(t, p);
        if (g.which === 'from') { m.from = t.id; m.fromPt = null; m.fromSide = side; } else { m.to = t.id; m.toPt = null; m.toSide = side; }
      } else {
        var q = { x: snapV(p.x), y: snapV(p.y) };
        if (g.which === 'from') m.fromPt = q; else m.toPt = q;
      }
    }, { coalesce: g.key, source: 'canvas' });
  }

  /* ---------------------------------------------------------------------------
     ADD, DELETE, CLIPBOARD, ORDER
     ------------------------------------------------------------------------ */
  /** Center of the visible canvas, in diagram units. */
  function viewCenter() { var r = rect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); }

  /**
   * Where a shape of size w × h added from the toolbar goes: the free spot
   * (clear of every box by 16 units) nearest the middle of the window, inside
   * the page and on screen. No such spot: 16 units below the lowest box, and
   * the view scrolls to it (see E.addShape). Returns its top-left corner.
   */
  function freeSpot(w, h) {
    var GAP = 16;
    var doc = S.doc, page = M.page(doc);
    var boxes = doc.diagram.nodes.filter(function (o) { return !o.hidden && R.hasGeom(o); });
    function clear(x, y) {
      return boxes.every(function (o) { return x + w + GAP <= o.x || o.x + o.w + GAP <= x || y + h + GAP <= o.y || o.y + o.h + GAP <= y; });
    }
    var r = rect(), v0 = toWorld(r.left, r.top), v1 = toWorld(r.right, r.bottom - coveredBottom());
    var x1 = v0.x + GAP, y1 = v0.y + GAP, x2 = v1.x - w - GAP, y2 = v1.y - h - GAP;
    if (doc.diagram.page !== 'none') { x1 = Math.max(x1, GAP); y1 = Math.max(y1, GAP); x2 = Math.min(x2, page.w - w - GAP); y2 = Math.min(y2, page.h - h - GAP); }
    var c = viewCenter(), best = null, bd = Infinity;
    for (var y = snapV(y1); y <= y2; y += GRID) {
      for (var x = snapV(x1); x <= x2; x += GRID) {
        var d = Math.hypot(x + w / 2 - c.x, y + h / 2 - c.y);
        if (d < bd && clear(x, y)) { bd = d; best = { x: x, y: y }; }
      }
    }
    if (best) return best;
    var b = R.bounds(doc);
    if (b.empty) return { x: snapV(c.x - w / 2), y: snapV(c.y - h / 2) };
    return { x: snapV(U.clamp(c.x - w / 2, b.x, b.x + Math.max(0, b.w - w))), y: snapV(b.y + b.h + GAP) };
  }

  E.addShape = function (shape, at) {
    var sz = NEW_SIZE[shape] || [150, 56];
    // Double-click: centered where it happened. Toolbar: in free space, so it
    // never lands on top of the student's boxes.
    var pos = at ? { x: snapV(at.x - sz[0] / 2), y: snapV(at.y - sz[1] / 2) } : freeSpot(sz[0], sz[1]);
    var id = U.uid('n');
    var nd = {
      id: id, kind: 'free', role: 'free', link: null, shape: shape,
      x: pos.x, y: pos.y, w: sz[0], h: sz[1],
      text: '', style: {}, fit: false, hidden: false
    };
    if (shape === 'bracket') { nd.dir = 'down'; nd.text = 'Label'; }
    // The add and the text typed into the new box are one undo step (same
    // coalesce key); see E.startEdit's `add`.
    var key = 'gesture:add-' + id;
    S.mutate('Add ' + (C.SHAPES.filter(function (s) { return s.id === shape; })[0] || { label: 'shape' }).label.toLowerCase(), function (d) {
      d.diagram.nodes.push(nd);
    }, { source: 'canvas', coalesce: key });
    S.select([id], 'canvas');
    if (!at) reveal(); // placed below everything: bring it into view
    // A text box is nothing without its text: if it is left empty it goes
    // away. Any other new shape goes away on Esc (the add is cancelled), but
    // stays as a blank shape if the student presses Enter or clicks away.
    if (shape !== 'bracket') E.startEdit(id, { entry: LMB.history.top(), key: key, dropIfEmpty: shape === 'text', dropOnCancel: true });
    else svg.focus({ preventScroll: true }); // so Enter edits the new label, Delete removes it
    return id;
  };
  E.addLine = function () {
    var c = viewCenter();
    createEdge({ fromPt: { x: snapV(c.x - 60), y: snapV(c.y) }, toPt: { x: snapV(c.x + 60), y: snapV(c.y) } });
    svg.focus({ preventScroll: true }); // arrow keys nudge the new line
  };

  function addSibling(nodeId) {
    var nd = nodeById(nodeId);
    if (!nd || nd.role !== 'item') return;
    var k = nd.link.section, after = nd.link.itemId;
    var it = M.item('');
    var key = 'gesture:add-' + it.id;
    LMB.layout.setPendingItem(it.id);
    S.mutate('Add item', function (d) {
      var list = d.content.sections[k].items;
      var i = list.findIndex(function (x) { return x.id === after; });
      list.splice(i + 1, 0, it);
    }, { source: 'canvas', coalesce: key });
    S.select(['itm-' + it.id], 'canvas');
    render();
    // Left empty (Esc, or clicking away), the new item disappears with its undo step.
    E.startEdit('itm-' + it.id, { entry: LMB.history.top(), key: key, dropIfEmpty: true });
  }

  var SHOW_FLAG = { title: 'title', theory: 'theory', problem: 'problem', context: 'context', assumptions: 'assumptions', bracket: 'brackets', world: 'brackets', structure: 'structureLabels', related: 'related' };
  var SHOW_NAME = { title: 'title', theory: 'program theory', problem: 'problem statement', context: 'external influences', assumptions: 'assumptions', brackets: 'Control / Influence brackets', structureLabels: 'structure labels', related: 'Related program logics box' };

  E.deleteSelection = function () {
    var ids = S.selected();
    if (!ids.length) return;
    var blocked = [], hidden = [];
    var nodes = ids.map(nodeById).filter(Boolean);
    var edges = ids.map(function (i) { return S.edge(i); }).filter(Boolean);
    nodes.forEach(function (nd) { if (nd.role === 'panel' || nd.role === 'header') blocked.push(nd); });
    var any = nodes.length - blocked.length + edges.length;
    var what = ids.length === 1 ? describe(ids[0]) : any + ' items';
    if (any) {
      S.mutate('Delete', function (d) {
        nodes.forEach(function (nd) {
          if (nd.role === 'item') {
            var list = d.content.sections[nd.link.section].items;
            var i = list.findIndex(function (x) { return x.id === nd.link.itemId; });
            if (i >= 0) list.splice(i, 1);
            if (!list.length) list.push(M.item(''));
          } else if (nd.role === 'free') {
            d.diagram.nodes = d.diagram.nodes.filter(function (m) { return m.id !== nd.id; });
            d.diagram.edges = d.diagram.edges.filter(function (e) { return e.from !== nd.id && e.to !== nd.id; });
          } else if (SHOW_FLAG[nd.role]) {
            if (d.diagram.show[SHOW_FLAG[nd.role]]) hidden.push(SHOW_FLAG[nd.role]);
            d.diagram.show[SHOW_FLAG[nd.role]] = false;
          }
        });
        edges.forEach(function (ed) {
          var m = findEdgeIn(d, ed.id);
          if (!m) return;
          if (m.auto) m.hidden = true;
          else d.diagram.edges = d.diagram.edges.filter(function (x) { return x.id !== ed.id; });
        });
      }, { source: 'canvas' });
      S.select([], 'canvas');
      if (!hidden.length) announce('Deleted ' + what + '.');
    }
    if (hidden.length) {
      LMB.app.toast('Hid the ' + hidden.filter(function (v, i, a) { return a.indexOf(v) === i; }).map(function (k) { return SHOW_NAME[k]; }).join(' and ') + '. Turn it back on under Diagram → Show.', { action: { label: 'Undo', fn: S.undo } });
    } else if (blocked.length && !any) {
      LMB.app.toast('Section headers and panels can’t be deleted. Hide them in the Diagram panel, or switch the section off in Write.');
    }
  };

  /** Copy: linked boxes become free boxes that look the same. */
  E.copy = function () {
    var nodes = selNodes();
    var edges = selEdges();
    if (!nodes.length && !edges.length) return false;
    var ids = {};
    nodes.forEach(function (nd) { ids[nd.id] = true; });
    var outNodes = nodes.map(function (nd) {
      if (nd.role === 'free') return U.clone(nd);
      var st = C.style(S.doc, nd);
      var style = {};
      ['fill', 'stroke', 'strokeWidth', 'dash', 'radius', 'textColor', 'fontSize', 'bold', 'italic', 'align', 'valign', 'opacity', 'accentBar'].forEach(function (k) { style[k] = st[k]; });
      var text = C.text(S.doc, nd);
      if (text == null) text = plainComposite(nd);
      return { id: nd.id, kind: 'free', role: 'free', link: null, shape: st.shape, x: nd.x, y: nd.y, w: nd.w, h: nd.h, text: text, style: style, fit: false, hidden: false, dir: st.shape === 'bracket' ? st.dir : undefined };
    });
    var byId = R.byId(S.doc);
    var outEdges = S.doc.diagram.edges.filter(function (ed) {
      return !ed.hidden && (edges.indexOf(ed) >= 0 || (ed.from && ed.to && ids[ed.from] && ids[ed.to] && !ed.auto));
    }).map(function (ed) {
      var c = U.clone(ed);
      // A selected arrow whose box is not copied with it gets a loose end
      // where that end is now, so the copy looks like the original.
      var g = R.edgeGeom(S.doc, ed, byId);
      var round = function (q) { return { x: Math.round(q.x * 2) / 2, y: Math.round(q.y * 2) / 2 }; };
      if (c.from && !ids[c.from]) { c.from = null; c.fromSide = null; c.fromPt = g ? round(g.pts[0]) : null; }
      if (c.to && !ids[c.to]) { c.to = null; c.toSide = null; c.toPt = g ? round(g.pts[g.pts.length - 1]) : null; }
      if (c.auto) { // keep the look of an automatic arrow
        var est = C.edgeStyle(S.doc, ed);
        c.style = { color: est.color, width: est.width, head: est.head, look: est.look, fill: est.fill };
        c.auto = false;
      }
      return c;
    });
    // Columns the copied items belong to (for the note after a cut; see E.paste).
    var sections = [];
    nodes.forEach(function (nd) { if (nd.role === 'item' && sections.indexOf(nd.link.section) < 0) sections.push(nd.link.section); });
    clipboard = { nodes: outNodes, edges: outEdges, sections: sections, cut: false };
    pasteCount = 0;
    return true;
  };
  function plainComposite(nd) {
    var c = S.doc.content;
    if (nd.role === 'problem') return 'Problem: ' + (c.problem || '');
    if (nd.role === 'assumptions') return c.sections.assumptions.label + '\n' + M.filled(S.doc, 'assumptions').map(function (i) { return '• ' + i.text; }).join('\n');
    if (nd.role === 'context') return C.LABELS.contextTitle + '\n' + M.CONTEXT.map(function (k) { return c.sections[k].label + ': ' + M.filled(S.doc, k).map(function (i) { return i.text; }).join('; '); }).join('\n');
    return '';
  }
  E.paste = function () {
    if (!clipboard) return;
    pasteCount++;
    var off = 16 * pasteCount;
    var map = {};
    var newNodes = clipboard.nodes.map(function (nd) {
      var c = U.clone(nd);
      c.id = U.uid('n');
      map[nd.id] = c.id;
      c.x += off; c.y += off;
      if (c.dir === undefined) delete c.dir;
      return c;
    });
    var newEdges = clipboard.edges.map(function (ed) {
      var c = U.clone(ed);
      c.id = U.uid('e');
      c.from = ed.from ? map[ed.from] || null : null;
      c.to = ed.to ? map[ed.to] || null : null;
      if (c.fromPt) c.fromPt = { x: c.fromPt.x + off, y: c.fromPt.y + off };
      if (c.toPt) c.toPt = { x: c.toPt.x + off, y: c.toPt.y + off };
      return c;
    }).filter(function (c) { return (c.from || c.fromPt) && (c.to || c.toPt); });
    // Scrolled away from where the copies would land? Paste them in the
    // middle of the visible canvas instead, so they are seen.
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    function grow(x, y) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
    newNodes.forEach(function (c) { grow(c.x, c.y); grow(c.x + c.w, c.y + c.h); });
    newEdges.forEach(function (c) { if (c.fromPt && !c.from) grow(c.fromPt.x, c.fromPt.y); if (c.toPt && !c.to) grow(c.toPt.x, c.toPt.y); });
    var r = rect(), v0 = toWorld(r.left, r.top), v1 = toWorld(r.right, r.bottom);
    if (isFinite(x1) && r.width && (x2 < v0.x || x1 > v1.x || y2 < v0.y || y1 > v1.y)) {
      var vc = viewCenter();
      var mx = snapV(vc.x - (x1 + x2) / 2), my = snapV(vc.y - (y1 + y2) / 2);
      newNodes.forEach(function (c) { c.x += mx; c.y += my; });
      newEdges.forEach(function (c) {
        if (c.fromPt) c.fromPt = { x: c.fromPt.x + mx, y: c.fromPt.y + my };
        if (c.toPt) c.toPt = { x: c.toPt.x + mx, y: c.toPt.y + my };
      });
    }
    S.mutate('Paste', function (d) {
      d.diagram.nodes = d.diagram.nodes.concat(newNodes);
      d.diagram.edges = d.diagram.edges.concat(newEdges);
    }, { source: 'canvas' });
    S.select(newNodes.map(function (x) { return x.id; }).concat(newEdges.map(function (x) { return x.id; })), 'canvas');
    // Cut items from a column come back as loose shapes that look the same,
    // but they are no longer in the Write form, the table or the text outline.
    // Say so, once, on the first paste after the cut.
    if (clipboard.cut && clipboard.sections.length) {
      var names = clipboard.sections.map(function (k) { return S.doc.content.sections[k].label; });
      var list = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + ' lists' : names[0] + ' list';
      LMB.app.toast('Pasted as ' + (newNodes.length > 1 ? 'separate shapes' : 'a separate shape') + '. ' + (newNodes.length > 1 ? 'They’re' : 'It’s') + ' no longer in the ' + list + ' in Write.');
      clipboard.cut = false;
    }
  };
  E.duplicate = function () { if (E.copy()) E.paste(); };
  E.cut = function () { if (E.copy()) { clipboard.cut = true; E.deleteSelection(); } };

  /**
   * Stacking order. dir 1 / -1: move each selected box just above (below) the
   * next box it overlaps, so every press makes a visible difference (stepping
   * past boxes elsewhere on the page would change nothing you can see).
   * 'front' / 'back': all the way.
   */
  var REORDER_LABEL = { front: 'Bring to front', back: 'Send to back', '1': 'Bring forward', '-1': 'Send backward' };
  E.reorder = function (dir) {
    var ids = S.selected();
    if (!ids.length) return;
    function overlaps(a, b) {
      return !b.hidden && R.hasGeom(b) && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }
    var changed = S.mutate(REORDER_LABEL[dir], function (d) {
      var list = d.diagram.nodes;
      var sel = {};
      ids.forEach(function (i) { sel[i] = true; });
      if (dir === 'front' || dir === 'back') {
        var picked = list.filter(function (x) { return sel[x.id]; }), rest = list.filter(function (x) { return !sel[x.id]; });
        d.diagram.nodes = dir === 'front' ? rest.concat(picked) : picked.concat(rest);
        return;
      }
      var i, j, nd;
      if (dir > 0) {
        // Top-most selected box first, so selected boxes keep their own order.
        for (i = list.length - 1; i >= 0; i--) {
          nd = list[i];
          if (!sel[nd.id] || !R.hasGeom(nd)) continue;
          for (j = i + 1; j < list.length; j++) if (!sel[list[j].id] && overlaps(nd, list[j])) break;
          if (j < list.length) { list.splice(i, 1); list.splice(j, 0, nd); } // lands just above list[j]
        }
      } else {
        for (i = 0; i < list.length; i++) {
          nd = list[i];
          if (!sel[nd.id] || !R.hasGeom(nd)) continue;
          for (j = i - 1; j >= 0; j--) if (!sel[list[j].id] && overlaps(nd, list[j])) break;
          if (j >= 0) { list.splice(i, 1); list.splice(j, 0, nd); } // lands just below list[j]
        }
      }
    }, { source: 'canvas' });
    // Nothing above (below) it to pass: say so, or the button seems broken.
    if (!changed && selNodes().length) {
      var up = dir === 'front' || dir > 0;
      LMB.app.toast(up ? 'Already in front of everything it overlaps.' : 'Already behind everything it overlaps.');
    }
  };

  function nudge(dx, dy) {
    var ids = moveSet(S.selected());
    var edgeIds = S.selected().filter(function (i) { return S.edge(i); });
    if (!ids.length && !edgeIds.length) return false;
    var turned = false;
    S.mutate('Nudge', function (d) {
      var nodes = [];
      ids.forEach(function (i) {
        var nd = findIn(d, i);
        if (!nd) return;
        nd.x += dx; nd.y += dy;
        if (nd.base) nd.base = { x: nd.base.x + dx, y: nd.base.y + dy, w: nd.base.w, h: nd.base.h };
        nodes.push(nd);
      });
      edgeIds.forEach(function (i) {
        var ed = findEdgeIn(d, i);
        if (ed.fromPt && !ed.from) ed.fromPt = { x: ed.fromPt.x + dx, y: ed.fromPt.y + dy };
        if (ed.toPt && !ed.to) ed.toPt = { x: ed.toPt.x + dx, y: ed.toPt.y + dy };
      });
      turned = manualOff(d, nodes);
    }, { coalesce: 'nudge', source: 'canvas' });
    if (turned) showNoticeToast();
    return true;
  }

  /* ---------------------------------------------------------------------------
     TEXT EDITING
     ------------------------------------------------------------------------ */
  /**
   * Start editing a box's text in place (composite boxes open a small form).
   *   add  set when the box was added a moment ago: {entry, key, dropIfEmpty}.
   *        entry/key are the add's undo step, so the typed text joins that
   *        step; with dropIfEmpty, leaving the box empty (Esc, Enter or
   *        clicking away) takes the add back as if it never happened; with
   *        dropOnCancel, Esc alone does.
   */
  E.startEdit = function (id, add) {
    if (editing) commitEdit();
    var nd = nodeById(id);
    if (!nd || nd.hidden || nd.role === 'panel') return;
    if (C.isComposite(nd)) { compositeEdit(nd); return; }
    var ta = h('textarea', { class: 'inline-editor', attrs: { 'aria-label': 'Edit ' + C.boxName(S.doc, nd), spellcheck: 'true' } });
    ta.value = C.text(S.doc, nd) || '';
    if (add) ta.placeholder = 'Type here';
    editing ={ id: id, el: ta, kind: 'inline', original: ta.value, add: add || null };
    wrap.appendChild(ta);
    render();
    positionEditor();
    ta.focus();
    ta.select();
    ta.addEventListener('keydown', function (e) {
      // Print / Save / Open: keep the typed text, then let the app's shortcut run.
      if (appShortcut(e)) { commitEdit(); svg.focus({ preventScroll: true }); return; }
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); svg.focus({ preventScroll: true }); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); svg.focus({ preventScroll: true }); }
    });
    ta.addEventListener('input', positionEditor);
    ta.addEventListener('blur', function () { setTimeout(function () { if (editing && editing.el === ta) commitEdit(); }, 0); });
  };
  function positionEditor() {
    if (!editing || editing.kind !== 'inline') return;
    var nd = nodeById(editing.id);
    if (!nd) { cancelEdit(); return; }
    var st = C.style(S.doc, nd);
    var ta = editing.el;
    var area = C.textArea(st.shape, nd.w, nd.h, st);
    var z = view.z;
    // Zoomed out (Fit on a laptop), the box's text can be 7 px on screen: too
    // small to edit. The editor then shows the text at 13 px instead, scaled up
    // as a whole (`k`): same width per letter, so the lines break exactly where
    // they will in the box. It covers the box and a little around it, on the
    // box's own fill so it stays readable.
    var MIN_PX = 13;
    var k = Math.max(1, MIN_PX / (st.fontSize * z));
    var fs = st.fontSize * z * k;
    ta.style.font = (st.italic ? 'italic ' : '') + (st.bold ? '700 ' : '400 ') + fs + 'px ' + C.stackFor(S.doc, nd);
    ta.style.lineHeight = String(T.LINE_HEIGHT);
    ta.style.textAlign = st.align;
    ta.style.color = st.textColor;
    var width = Math.max(40, area.w * z * k);
    ta.style.width = width + 'px';
    ta.style.height = 'auto';
    var contentH = Math.max(ta.scrollHeight, fs * T.LINE_HEIGHT);
    var left = view.x + (nd.x + area.x) * z;
    var top = nd.y + area.y;
    var areaH = area.h * z;
    if (k > 1) {
      // Centered on the box, kept inside the canvas.
      var r = wrap.getBoundingClientRect();
      left = U.clamp(left + area.w * z / 2 - width / 2, 8, Math.max(8, r.width - width - 8));
      top = U.clamp(view.y + (top + area.h / 2) * z - contentH / 2, 8, Math.max(8, r.height - contentH - 8));
      var bg = st.fill && st.fill !== 'none' && st.fill !== 'transparent' ? st.fill : (R.background(S.doc) || '#ffffff');
      ta.style.background = bg;
      ta.style.boxShadow = '0 0 0 6px ' + bg + ', 0 6px 20px 6px rgba(16, 42, 67, .28)';
      ta.style.outlineOffset = '6px';
    } else {
      if (st.valign === 'middle' || st.shape === 'bracket') top = view.y + top * z + Math.max(0, (areaH - contentH) / 2);
      else if (st.valign === 'bottom') top = view.y + top * z + Math.max(0, areaH - contentH);
      else top = view.y + top * z;
      ta.style.background = ta.style.boxShadow = ta.style.outlineOffset = '';
    }
    ta.classList.toggle('enlarged', k > 1);
    ta.style.left = left + 'px';
    ta.style.top = top + 'px';
    ta.style.height = contentH + 'px';
  }
  function cancelEdit() {
    if (!editing) return;
    var ed = editing;
    editing = null;
    ed.el.remove();
    // A new item or text box that was never typed into disappears again,
    // undo step and all (Undo then goes on to the change before it).
    if (ed.add && (ed.add.dropIfEmpty || ed.add.dropOnCancel) && S.discard(ed.add.entry)) { render(); return; }
    var pending = LMB.layout.getPendingItem();
    if (pending) {
      // Fallback (the add is no longer the newest undo step): drop the blank item.
      LMB.layout.setPendingItem(null);
      S.mutate('Add item', function (d) {
        M.CHAIN.forEach(function (k) {
          var list = d.content.sections[k].items;
          var i = list.findIndex(function (x) { return x.id === pending && U.isBlank(x.text); });
          if (i >= 0 && list.length > 1) list.splice(i, 1);
        });
      }, { source: 'canvas', history: false });
    }
    render();
  }
  function commitEdit() {
    if (!editing) return;
    var ed = editing;
    editing = null;
    if (ed.kind === 'composite') { ed.commit(); ed.el.remove(); render(); return; }
    var value = ed.el.value.replace(/\r/g, '');
    ed.el.remove();
    var nd = nodeById(ed.id);
    var pending = LMB.layout.getPendingItem();
    LMB.layout.setPendingItem(null);
    if (!nd) { render(); return; }
    var trimmed = value.trim();
    if (!trimmed && ed.add && ed.add.dropIfEmpty && S.discard(ed.add.entry)) { render(); return; } // as cancelEdit
    S.mutate('Edit text', function (d) {
      var c = d.content;
      switch (nd.role) {
        case 'item': {
          var list = c.sections[nd.link.section].items;
          var i = list.findIndex(function (x) { return x.id === nd.link.itemId; });
          if (i < 0) return false;
          if (!trimmed) { if (list.length > 1) list.splice(i, 1); else list[i].text = ''; }
          else list[i].text = value.trim();
          break;
        }
        case 'header': c.sections[nd.link.section].label = trimmed || M.SECTIONS[nd.link.section].label; break;
        case 'title': c.title = trimmed; break;
        case 'theory': c.theory = trimmed; break;
        case 'bracket': case 'structure': case 'world': case 'related': {
          var m = findIn(d, nd.id);
          if (trimmed && trimmed !== C.LABELS[nd.link.part]) m.text = trimmed; else delete m.text;
          break;
        }
        default: {
          var f = findIn(d, nd.id);
          if (!f) return false;
          if (!trimmed && R.isBareText(d, f)) {
            // An emptied text box would be invisible yet still widen the
            // exported drawing: remove it (and any arrows tied to it).
            d.diagram.nodes = d.diagram.nodes.filter(function (m) { return m.id !== f.id; });
            d.diagram.edges = d.diagram.edges.filter(function (e) { return e.from !== f.id && e.to !== f.id; });
            break;
          }
          f.text = value;
          var need = C.need(d, f, f.w);
          if (f.h < need) f.h = need;
        }
      }
    }, { source: 'canvas', coalesce: ed.add ? ed.add.key : null }); // a new box: one undo step with its add
    void pending;
    render();
  }

  /** Ctrl/⌘ + P, S or O: app-wide shortcuts (app.js) that text editors pass on. */
  function appShortcut(e) { return U.modKey(e) && !e.altKey && /^[psoPSO]$/.test(e.key); }

  /** Small form for boxes that hold lists (problem, context, assumptions). */
  function compositeEdit(nd) {
    var c = S.doc.content;
    var panel = h('div', { class: 'composite-editor', attrs: { role: 'dialog', 'aria-label': 'Edit ' + C.boxName(S.doc, nd) } });
    var areas = [];
    function area(label, value, hint) {
      var id = 'ce-' + U.uid();
      var ta = h('textarea', { id: id });
      ta.value = value;
      panel.appendChild(h('label', { attrs: { for: id } }, label));
      if (hint) panel.appendChild(h('p', { class: 'ce-hint' }, hint));
      panel.appendChild(ta);
      areas.push(ta);
      return ta;
    }
    var lines = function (k) { return c.sections[k].items.filter(function (i) { return !U.isBlank(i.text); }).map(function (i) { return i.text.replace(/\n/g, ' '); }).join('\n'); };
    if (nd.role === 'problem') area('Problem statement', c.problem, M.FIELDS.problem.hint);
    if (nd.role === 'context') { area(c.sections.antecedent.label, lines('antecedent'), 'One per line.'); area(c.sections.mediating.label, lines('mediating'), 'One per line.'); }
    if (nd.role === 'assumptions') area(c.sections.assumptions.label, lines('assumptions'), 'One per line.');
    var done = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Done');
    var cancel = h('button', { type: 'button', class: 'btn btn-sm' }, 'Cancel');
    panel.appendChild(h('div', { class: 'ce-actions' }, cancel, done));
    // One item per line. A line that is already an item is kept exactly as it
    // is (so "A) Schools stay open" survives Done); only new or changed lines
    // lose a pasted list marker ("- ", "• ", "1. ").
    function toItems(old, text) {
      var had = {};
      old.forEach(function (it) { had[it.text.replace(/\n/g, ' ').trim()] = it.text; });
      var ls = text.split(/\r?\n/).map(function (l) { l = l.trim(); return had[l] != null ? had[l] : LMB.cleanPastedLine(l); }).filter(function (t) { return !U.isBlank(t); });
      if (!ls.length) return [M.item('')];
      return ls.map(function (t, i) { return { id: old[i] ? old[i].id : U.uid('i'), text: t }; });
    }
    editing = {
      id: nd.id, el: panel, kind: 'composite',
      commit: function () {
        S.mutate('Edit text', function (d) {
          var cc = d.content;
          if (nd.role === 'problem') cc.problem = areas[0].value.trim();
          if (nd.role === 'context') {
            cc.sections.antecedent.items = toItems(cc.sections.antecedent.items, areas[0].value);
            cc.sections.mediating.items = toItems(cc.sections.mediating.items, areas[1].value);
          }
          if (nd.role === 'assumptions') cc.sections.assumptions.items = toItems(cc.sections.assumptions.items, areas[0].value);
        }, { source: 'canvas' });
      }
    };
    done.addEventListener('click', function () { commitEdit(); svg.focus(); });
    cancel.addEventListener('click', function () { var e2 = editing; editing = null; e2.el.remove(); svg.focus(); });
    panel.addEventListener('keydown', function (e) {
      if (appShortcut(e)) { commitEdit(); svg.focus({ preventScroll: true }); return; } // as Done, then Print / Save / Open
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); cancel.click(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); done.click(); }
    });
    wrap.appendChild(panel);
    // Place it beside the box, inside the canvas.
    var r = wrap.getBoundingClientRect();
    var sx = view.x + nd.x * view.z, sy = view.y + (nd.y + nd.h) * view.z + 8;
    var pw = Math.min(340, r.width - 16);
    panel.style.width = pw + 'px';
    panel.style.left = U.clamp(sx, 8, r.width - pw - 8) + 'px';
    var ph = panel.offsetHeight;
    if (sy + ph > r.height - 8) sy = Math.max(8, view.y + nd.y * view.z - ph - 8);
    panel.style.top = U.clamp(sy, 8, Math.max(8, r.height - ph - 8)) + 'px';
    areas[0].focus();
  }

  /* ---------------------------------------------------------------------------
     TOOLBAR, ZOOM CONTROLS, NOTICE
     ------------------------------------------------------------------------ */
  function setTool(t) {
    tool = t;
    arrowSource = null;
    svg.classList.toggle('tool-arrow', t === 'arrow');
    svg.classList.toggle('space-pan', t === 'hand');
    updateToolbar();
    drawOverlay();
  }
  E.setTool = setTool;

  var tbButtons = {};
  function tbBtn(key, icon, label, kbd, fn) {
    var b = h('button', { type: 'button', class: 'icon-btn', html: U.icon(icon, 19), attrs: { 'aria-label': label, title: label + (kbd ? ' (' + kbd + ')' : '') } });
    b.addEventListener('click', function (e) {
      fn(e);
      // Clicked with the mouse (detail > 0): hand the keyboard back to the
      // canvas, so Enter, the arrow keys and Space act on the drawing rather
      // than on this button. Pressed from the keyboard: focus stays here.
      if (e.detail > 0 && (document.activeElement === b || document.activeElement === document.body)) svg.focus({ preventScroll: true });
    });
    tbButtons[key] = b;
    return b;
  }
  function buildToolbar() {
    var g1 = h('div', { class: 'tb-group', attrs: { role: 'group', 'aria-label': 'Tools' } },
      tbBtn('select', 'pointer', 'Select', 'V; ] and [ step through the boxes', function () { setTool('select'); }),
      tbBtn('hand', 'hand', 'Pan', 'H or hold Space', function () { setTool('hand'); }),
      tbBtn('arrow', 'arrow', 'Draw an arrow between boxes', 'A', function () { setTool(tool === 'arrow' ? 'select' : 'arrow'); }));
    var g2 = h('div', { class: 'tb-group', attrs: { role: 'group', 'aria-label': 'Add an element' } }, h('span', { class: 'tb-label' }, 'Add'));
    C.SHAPES.forEach(function (s) {
      g2.appendChild(tbBtn('add-' + s.id, s.id === 'rect' ? 'rect' : s.id, 'Add ' + s.label.toLowerCase(), s.id === 'text' ? 'T' : null, function () { E.addShape(s.id); }));
    });
    g2.appendChild(tbBtn('add-line', 'line', 'Add a line / arrow', 'L', function () { E.addLine(); }));
    var g3 = h('div', { class: 'tb-group', attrs: { role: 'group', 'aria-label': 'Arrange' } },
      tbBtn('front', 'front', 'Bring forward', U.modLabel + ']', function () { E.reorder(1); }),
      tbBtn('back', 'back', 'Send backward', U.modLabel + '[', function () { E.reorder(-1); }),
      tbBtn('tofront', 'tofront', 'Bring to front', '⇧' + U.modLabel + ']', function () { E.reorder('front'); }),
      tbBtn('toback', 'toback', 'Send to back', '⇧' + U.modLabel + '[', function () { E.reorder('back'); }),
      tbBtn('delete', 'trash', 'Delete', 'Delete', function () { E.deleteSelection(); }));
    var snapBtn = tbBtn('snap', 'magnet', 'Snap to grid', null, function () { snap = !snap; U.storage.set('lmb.snap', snap); updateToolbar(); });
    // A toggle needs words: "Snap" shows beside the magnet on wide screens.
    snapBtn.classList.add('tb-text-btn');
    snapBtn.insertAdjacentHTML('beforeend', '<span class="tb-text" aria-hidden="true">Snap</span>');
    inspBtn = h('button', { type: 'button', class: 'btn btn-sm insp-toggle', html: U.icon('sliders', 16) + '<span>Properties</span>', attrs: { 'aria-controls': 'inspector', 'aria-expanded': 'false' } });
    inspBtn.addEventListener('click', function () {
      var el = document.getElementById('inspector');
      var open = !el.classList.contains('open');
      // Was the view still the fitted one? Then refit it into the space the
      // sheet leaves, so style changes stay in sight. A view the student
      // zoomed or panned is left alone.
      var untouched = lastFit && lastFit.z === view.z && lastFit.x === view.x && lastFit.y === view.y;
      el.classList.toggle('open', open);
      inspBtn.setAttribute('aria-expanded', String(open));
      placeInspBtn();
      if (untouched) E.fit();
    });
    // The sheet's height follows its content (up to 58% of the screen).
    if (window.ResizeObserver) new ResizeObserver(placeInspBtn).observe(document.getElementById('inspector'));
    toolbar.appendChild(g1);
    toolbar.appendChild(h('span', { class: 'tb-sep', attrs: { 'aria-hidden': 'true' } }));
    toolbar.appendChild(g2);
    toolbar.appendChild(h('span', { class: 'tb-sep', attrs: { 'aria-hidden': 'true' } }));
    toolbar.appendChild(g3);
    toolbar.appendChild(h('span', { class: 'tb-spacer' }));
    toolbar.appendChild(snapBtn);
    toolbar.appendChild(inspBtn);
    // The toolbar is one Tab stop ("roving tabindex"): Tab lands on the last
    // button used, and ← / → (Home / End) move between the buttons.
    toolbar.addEventListener('focusin', function (e) { if (e.target.tagName === 'BUTTON') setRoving(e.target); });
    toolbar.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
      var bs = U.$$('button', toolbar).filter(function (b) { return b.offsetParent && !b.disabled; });
      var i = bs.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var j = e.key === 'Home' ? 0 : e.key === 'End' ? bs.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : bs.length - 1)) % bs.length;
      bs[j].focus();
    });
    setRoving(tbButtons.select);
  }
  var roving = null;
  function setRoving(b) {
    roving = b;
    U.$$('button', toolbar).forEach(function (x) { x.tabIndex = x === b ? 0 : -1; });
  }
  function updateToolbar() {
    if (!tbButtons.select) return;
    ['select', 'hand', 'arrow'].forEach(function (k) { tbButtons[k].setAttribute('aria-pressed', String(tool === k)); });
    tbButtons.snap.setAttribute('aria-pressed', String(snap));
    var hasSel = S.selected().length > 0;
    ['front', 'back', 'tofront', 'toback'].forEach(function (k) { tbButtons[k].disabled = !selNodes().length; });
    tbButtons.delete.disabled = !hasSel;
    // The Tab stop must stay on a button that can take focus.
    if (roving && (roving.disabled || (visible() && !roving.offsetParent))) setRoving(tbButtons.select);
  }
  function buildZoom() {
    var out = h('button', { type: 'button', class: 'icon-btn', html: U.icon('minus', 16), attrs: { 'aria-label': 'Zoom out', title: 'Zoom out (' + U.modLabel + '−)' } });
    var inn = h('button', { type: 'button', class: 'icon-btn', html: U.icon('plus', 16), attrs: { 'aria-label': 'Zoom in', title: 'Zoom in (' + U.modLabel + '+)' } });
    zoomVal = h('button', { type: 'button', class: 'zoom-val', attrs: { title: 'Zoom to 100%', 'aria-label': '100%, reset zoom to 100%' } }, '100%');
    var fit = h('button', { type: 'button', class: 'icon-btn', html: U.icon('fit', 16), attrs: { 'aria-label': 'Fit to window', title: 'Fit to window (' + U.modLabel + '0)' } });
    out.addEventListener('click', function () { zoomBy(1 / 1.2); });
    inn.addEventListener('click', function () { zoomBy(1.2); });
    zoomVal.addEventListener('click', function () { var r = rect(); zoomAt(1, r.left + r.width / 2, r.top + r.height / 2); });
    fit.addEventListener('click', E.fit);
    zoomCtl.appendChild(out); zoomCtl.appendChild(zoomVal); zoomCtl.appendChild(inn); zoomCtl.appendChild(fit);
  }

  function updateNotice() {
    // Empty model: a one-line pointer back to Write instead.
    var empty = M.isEmpty(S.doc);
    if (!emptyNote) {
      var go = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Go to Write');
      go.addEventListener('click', function () { LMB.app.setStep('write', { focus: true }); });
      emptyNote = h('div', { class: 'canvas-notice canvas-empty', hidden: true },
        h('span', null, 'This model is empty. Start in Write, or load an example from the File menu.'), go);
      wrap.appendChild(emptyNote);
    }
    emptyNote.hidden = !empty;
    var off = !S.doc.diagram.autoLayout;
    if (!off || noticeDismissed || empty) {
      // Re-arrange or Dismiss pressed from the keyboard: focus stays in the canvas.
      if (!notice.hidden && notice.contains(document.activeElement)) svg.focus({ preventScroll: true });
      notice.hidden = true;
      return;
    }
    if (!notice.firstChild) {
      var b = h('button', { type: 'button', class: 'btn btn-primary btn-sm' }, 'Re-arrange');
      b.addEventListener('click', E.rearrange);
      var x = h('button', { type: 'button', class: 'icon-btn', html: U.icon('x', 15), attrs: { 'aria-label': 'Dismiss', title: 'Dismiss' } });
      x.style.width = '28px'; x.style.height = '28px';
      x.addEventListener('click', function () { noticeDismissed = true; updateNotice(); });
      notice.appendChild(h('span', null, ''));
      notice.appendChild(b);
      notice.appendChild(x);
    }
    if (notice.hidden) {
      // The notice is a status region: filling in its text as it appears
      // makes screen readers announce it.
      var msg = notice.firstChild;
      msg.textContent = '';
      setTimeout(function () { msg.textContent = 'Auto-arrange is off, so your layout stays put.'; }, 60);
    }
    notice.hidden = false;
  }
  function showNoticeToast() { noticeDismissed = false; updateNotice(); }

  /** Re-run the automatic layout (undoable). */
  E.rearrange = function () {
    var changed = S.mutate('Re-arrange', function (d) {
      d.diagram.autoLayout = true;
      d.diagram.nodes.forEach(function (nd) { if (nd.role !== 'free') nd.fit = true; });
    }, { relayout: true, source: 'canvas' });
    // Nothing moved: no Undo button (it would undo an older change instead).
    LMB.app.toast(changed ? 'Re-arranged. Your styles and added shapes were kept.' : 'Every box is already in place.', changed ? { action: { label: 'Undo', fn: S.undo } } : {});
  };

  /**
   * "Fit to page" (Write preview and Design panel): set the text size to the
   * largest one at which the diagram fits the page (LMB.layout.fitSize).
   * With auto-arrange off it first tries keeping the student's arrangement,
   * then re-arranges if that is the only way to fit. Undoable.
   */
  E.fitToPage = function () {
    var doc = S.doc, LY = LMB.layout;
    var size = LY.fitSize(doc), relayout = false;
    if (size == null && !doc.diagram.autoLayout) { size = LY.fitSize(doc, { relayout: true }); relayout = size != null; }
    if (size == null) {
      var legal = doc.diagram.page !== 'legal-landscape' && doc.diagram.template !== 'topdown';
      LMB.app.toast('Even at ' + LY.FIT_MIN + ' px text the diagram runs past the page. Try shorter boxes, ' +
        (legal ? 'a US Legal landscape page, ' : '') + 'or the Top-down layout on a portrait page.',
      legal ? { action: { label: 'Use Legal page', fn: function () {
        S.mutate('Change page size', function (d) { d.diagram.page = 'legal-landscape'; }, { source: 'inspector' });
        E.refit();
        E.fitToPage();
      } } } : {});
      return;
    }
    var was = doc.diagram.baseFontSize;
    if (size === was && !relayout) { LMB.app.toast('The diagram already fits the page at ' + size + ' px text.'); return; }
    S.mutate('Fit to page', function (d) {
      d.diagram.baseFontSize = size;
      if (relayout) { d.diagram.autoLayout = true; d.diagram.nodes.forEach(function (nd) { if (nd.role !== 'free') nd.fit = true; }); }
    }, { source: 'inspector', relayout: relayout });
    E.refit();
    LMB.app.toast('Text size ' + (size < was ? 'reduced' : 'increased') + ' to ' + size + ' px so the diagram fits the page' +
      (relayout ? ' (boxes re-arranged).' : '.'), { action: { label: 'Undo', fn: S.undo } });
  };

  /* ---------------------------------------------------------------------------
     KEYBOARD
     ------------------------------------------------------------------------ */
  /** Say something to screen-reader users (a hidden polite live region). */
  function announce(msg) {
    if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = msg; }, 30);
  }
  /** Spoken description of a box or arrow: "Activities item 2: Weekly mentoring". */
  function describe(id) {
    var nd = nodeById(id);
    if (nd) {
      var t = nd.role === 'header' ? null : C.text(S.doc, nd);
      t = t && t.replace(/\s+/g, ' ').trim();
      if (t && t.length > 90) t = t.slice(0, 88) + '…';
      return C.boxName(S.doc, nd) + (t ? ': ' + t : '');
    }
    var ed = S.edge(id);
    if (!ed) return '';
    var end = function (nid) { var m = nid && nodeById(nid); return m ? C.boxName(S.doc, m) : 'a point'; };
    return 'Arrow from ' + end(ed.from) + ' to ' + end(ed.to) + (ed.label && ed.label.trim() ? ', labeled ' + ed.label.trim() : '');
  }
  /**
   * What ] / [ step through: every visible box except the big column panels,
   * then every visible arrow (so arrows can be restyled or deleted too).
   */
  function keyList() {
    var byId = R.byId(S.doc);
    return S.doc.diagram.nodes.filter(function (x) { return R.hasGeom(x) && x.role !== 'panel'; }).map(function (x) { return x.id; })
      .concat(S.doc.diagram.edges.filter(function (ed) { return !ed.hidden && R.edgeGeom(S.doc, ed, byId); }).map(function (ed) { return ed.id; }));
  }
  /** Select the next (dir 1) or previous (dir -1) element; announce it and scroll it into view. */
  function cycle(dir) {
    var list = keyList();
    if (!list.length) return;
    var i = list.indexOf(S.selected()[0]);
    var j = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    S.select([list[j]], 'canvas');
    reveal();
    announce(describe(list[j]) + ', ' + (j + 1) + ' of ' + list.length + (tool === 'arrow' && nodeById(list[j]) ? '. Press Enter to ' + (arrowSource ? 'end' : 'start') + ' the arrow here.' : ''));
  }
  /** Pan just enough to bring the selection into view (zoomed in, it may be off screen). */
  function reveal() {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    var byId = R.byId(S.doc);
    selNodes().forEach(function (nd) { x1 = Math.min(x1, nd.x); y1 = Math.min(y1, nd.y); x2 = Math.max(x2, nd.x + nd.w); y2 = Math.max(y2, nd.y + nd.h); });
    selEdges().forEach(function (ed) {
      var g = R.edgeGeom(S.doc, ed, byId);
      if (g) g.pts.forEach(function (p) { x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y); });
    });
    if (!isFinite(x1)) return;
    var r = rect(), m = 32;
    // Per axis: if it fits, shift it just inside the edge it crosses; if not, show its start.
    function shift(a, b, size) {
      if (b - a > size - 2 * m || a < m) return m - a;
      if (b > size - m) return size - m - b;
      return 0;
    }
    var dx = shift(view.x + x1 * view.z, view.x + x2 * view.z, r.width);
    var dy = shift(view.y + y1 * view.z, view.y + y2 * view.z, r.height);
    if (dx || dy) { view.x += dx; view.y += dy; applyView(); }
  }

  function onKey(e) {
    if (!visible()) return;
    if (document.querySelector('.dialog-backdrop')) return;
    var t = e.target;
    if (LMB.app.isTyping(t)) return;
    var mod = U.modKey(e);
    var k = e.key;
    // After clicking an inspector button (a swatch, Bold, a shape…) focus
    // stays on it, but Delete and the arrow keys still act on the selection.
    // (Text and number boxes, sliders and menus keep their keys.)
    var inspNav = t.tagName === 'BUTTON' && t.closest('.inspector') && !mod && !e.altKey &&
      (k === 'Delete' || k === 'Backspace' || k.indexOf('Arrow') === 0);
    if (!inspNav && t.closest && (t.closest('.inspector') || t.closest('.topbar') || t.closest('.menu-list'))) {
      if (!(mod && /^[cvdxa\]\[]$/i.test(k))) return;
      if (t.closest('.inspector')) return;
    }
    // Buttons keep their own Space / Enter / arrow-key behavior.
    var onControl = !inspNav && t !== svg && t !== document.body && t.closest && t.closest('button, select, a, [role="toolbar"], .zoom-ctl, .canvas-notice');
    // Tab is never taken here: it moves focus on, out of the canvas (] / [ step through the boxes).
    if (onControl && (k === ' ' || k === 'Enter' || k.indexOf('Arrow') === 0)) return;
    if (k === ' ' && !mod) { if (!spaceDown) { spaceDown = true; svg.classList.add('space-pan'); } e.preventDefault(); return; }
    if ((k === 'Delete' || k === 'Backspace') && !mod) { e.preventDefault(); E.deleteSelection(); return; }
    if (k === 'Escape') {
      if (gesture && gesture.type !== 'pinch' && gesture.type !== 'none') { cancelGesture(); announce('Cancelled.'); return; }
      if (arrowSource) { arrowSource = null; drawOverlay(); announce('Arrow cancelled.'); return; }
      if (tool !== 'select') { setTool('select'); announce('Select tool.'); return; }
      if (S.selected().length) announce('Nothing selected. The panel shows Diagram settings.');
      S.select([], 'canvas'); return;
    }
    if (k.indexOf('Arrow') === 0 && !mod) {
      e.preventDefault();
      var step = e.shiftKey ? 10 : 1;
      var dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
      if (nudge(k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0, k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0)) {
        reveal();
        announce('Moved ' + dir + ' ' + step + '.');
      }
      return;
    }
    if (k === 'Enter' && !mod) {
      var s1 = selNodes(), e1 = selEdges();
      if (tool === 'arrow' && s1.length === 1) {
        // Arrow tool from the keyboard: Enter on the first box, then on the second.
        e.preventDefault();
        if (!arrowSource || arrowSource === s1[0].id) {
          arrowSource = s1[0].id;
          drawOverlay();
          announce('Arrow starts at ' + C.boxName(S.doc, s1[0]) + '. Press ] or [ to pick the box it points to, then Enter.');
        } else {
          var from = arrowSource;
          arrowSource = null;
          createEdge({ from: from, to: s1[0].id });
          announce('Added an arrow from ' + C.boxName(S.doc, nodeById(from)) + ' to ' + C.boxName(S.doc, s1[0]) + '.');
        }
        return;
      }
      if (s1.length === 1) { e.preventDefault(); E.startEdit(s1[0].id); }
      else if (!s1.length && e1.length === 1 && LMB.inspector) { e.preventDefault(); LMB.inspector.focus('label'); } // an arrow: its label
      return;
    }
    if ((k === ']' || k === '[') && !mod) { e.preventDefault(); cycle(k === ']' ? 1 : -1); return; }
    if (mod && (k === 'a' || k === 'A')) {
      // Everything: boxes and arrows (as a marquee around the whole diagram would).
      e.preventDefault();
      var all = keyList().concat(S.doc.diagram.nodes.filter(function (x) { return x.role === 'panel' && R.hasGeom(x); }).map(function (x) { return x.id; }));
      S.select(all, 'canvas');
      announce('Selected everything: ' + all.length + ' boxes and arrows.');
      return;
    }
    if (mod && (k === 'c' || k === 'C')) { if (E.copy()) e.preventDefault(); return; }
    if (mod && (k === 'x' || k === 'X')) { e.preventDefault(); E.cut(); return; }
    if (mod && (k === 'v' || k === 'V')) { if (clipboard) { e.preventDefault(); E.paste(); } return; }
    if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); E.duplicate(); return; }
    if (mod && k === ']') { e.preventDefault(); E.reorder(e.shiftKey ? 'front' : 1); return; }
    if (mod && k === '[') { e.preventDefault(); E.reorder(e.shiftKey ? 'back' : -1); return; }
    if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomBy(1.2); return; }
    if (mod && k === '-') { e.preventDefault(); zoomBy(1 / 1.2); return; }
    if (mod && k === '0') { e.preventDefault(); E.fit(); return; }
    if (mod || e.altKey) return;
    if (k === 'v' || k === 'V') setTool('select');
    else if (k === 'h' || k === 'H') setTool('hand');
    else if (k === 'a' || k === 'A') setTool('arrow');
    // preventDefault: the key must not also type a "t" into the new text box.
    else if (k === 't' || k === 'T') { e.preventDefault(); E.addShape('text'); }
    else if (k === 'l' || k === 'L') { e.preventDefault(); E.addLine(); }
  }
  function onKeyUp(e) {
    if (e.key === ' ') { spaceDown = false; svg.classList.toggle('space-pan', tool === 'hand'); }
  }

  /* ---------------------------------------------------------------------------
     INIT
     ------------------------------------------------------------------------ */
  E.init = function () {
    svg = document.getElementById('canvas');
    vp = document.getElementById('viewport');
    layerBg = document.getElementById('layer-bg');
    layerDia = document.getElementById('layer-diagram');
    layerOv = document.getElementById('layer-overlay');
    wrap = document.getElementById('canvas-wrap');
    notice = document.getElementById('canvas-notice');
    toolbar = document.getElementById('toolbar');
    zoomCtl = document.getElementById('zoom-ctl');
    var s = U.storage.get('lmb.snap');
    if (typeof s === 'boolean') snap = s;
    buildToolbar();
    buildZoom();
    live = h('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } }); // see announce()
    wrap.appendChild(live);

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('pointerleave', function () { if (!gesture && hoverId) { hoverId = null; drawOverlay(); } });
    svg.addEventListener('lostpointercapture', function () { svg.classList.remove('panning'); });
    svg.addEventListener('dblclick', function (e) {
      // Pointer capture retargets click events to the <svg>, so hit-test the point itself.
      var t = document.elementFromPoint(e.clientX, e.clientY) || e.target;
      if (!svg.contains(t)) return;
      var nodeEl = t.closest && t.closest('.lmb-node');
      if (nodeEl) { E.startEdit(nodeEl.getAttribute('data-id')); return; }
      var edgeEl = t.closest && t.closest('.lmb-edge');
      if (edgeEl) { S.select([edgeEl.getAttribute('data-edge')], 'canvas'); LMB.inspector && LMB.inspector.focus('label'); return; }
      if (!t.closest('[data-handle],[data-port],[data-end],[data-plus]')) {
        var p = toWorld(e.clientX, e.clientY);
        E.addShape('text', { x: p.x, y: p.y });
      }
    });
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
      if (e.ctrlKey || e.metaKey) zoomAt(view.z * Math.exp(U.clamp(-dy * 0.0025, -0.18, 0.18)), e.clientX, e.clientY);
      else { view.x -= dx; view.y -= dy; applyView(); }
    }, { passive: false });
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', function () { spaceDown = false; });
    window.addEventListener('resize', U.debounce(function () { if (visible()) { if (!fitted) E.fit(); else applyView(); } }, 120));

    S.on('change', function (ev) {
      // The doc changed under an open editor (undo, a new or opened model, an
      // edit in Write): its text is out of date, so close it without saving.
      if (editing && (ev.source === 'history' || ev.source === 'replace' || ev.source === 'form')) { var ed = editing; editing = null; ed.el.remove(); }
      queue();
    });
    // Leaving Design saves what is in an open editor (as clicking away does),
    // so it can't sit there with old text and overwrite later Write edits.
    S.on('step', function (ev) { if (ev.prev === 'design' && ev.step !== 'design' && editing) commitEdit(); });
    S.on('select', function () { if (visible()) { drawOverlay(); updateToolbar(); } });
  };

  /** Called when the Design step becomes visible. */
  E.show = function () {
    requestAnimationFrame(function () {
      if (!fitted) E.fit();
      render();
    });
  };
  E.view = function () { return { z: view.z, x: view.x, y: view.y }; };
  E.isEditing = function () { return !!editing; };
  E.commitEdit = commitEdit;
  E.refit = function () { fitted = false; if (visible()) E.fit(); };

  LMB.editor = E;
})();

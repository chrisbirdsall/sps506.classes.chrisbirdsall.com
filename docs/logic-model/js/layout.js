/* =============================================================================
   layout.js — keeps the diagram in step with the Write form ("sync").

   The Write form (doc.content) is the source of truth for words. The diagram
   (doc.diagram.nodes / edges) holds one LINKED node per piece of content:
     title, theory, problem, context, assumptions
     pnl-<section>   a panel (column/row background) per chain section
     hdr-<section>   the section header
     itm-<itemId>    one box per list item (hidden while the item is blank, so
                     retyping an item keeps its box's style, place and arrows)
     brk-control, brk-influence, world, str-program, str-outcome   decorations
     related         Figure 3.1's "Related program logics" box (Handbook)
   plus automatic arrows (edges with auto: true, ids starting "ae-").
   Everything else is a FREE element the student added (role "free"); sync
   never touches free elements or any style.

   sync(doc) runs after every change:
     1. create / remove linked nodes and auto arrows so they match the content
     2. if doc.diagram.autoLayout is on: re-run the template's layout
        otherwise: keep the student's arrangement, but grow boxes whose text
        grew, push later items in a section down if text growth makes them
        overlap, place new items under their section, re-fit section panels,
        and move what sits below the columns down if the columns grew into it.
        Dragging or resizing a box never pushes other boxes around.
     3. student-added boxes grow to fit their text (font or size changes).
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, M = LMB.model, C = LMB.content, TH = LMB.themes;

  var pendingItemId = null; // a blank item being edited on the canvas keeps its box

  /** Every linked part the current content calls for, with visibility. */
  function parts(doc) {
    var tpl = LMB.templates.of(doc);
    var sup = tpl.supports || {};
    var show = doc.diagram.show;
    var c = doc.content;
    var list = [];
    function add(id, role, link, visible) { list.push({ id: id, role: role, link: link, visible: !!visible }); }
    var chain = M.chainOn(doc);
    var prog = chain.filter(C.isProgram), outc = chain.filter(C.isOutcome);
    add('title', 'title', null, show.title && !U.isBlank(c.title));
    add('theory', 'theory', null, show.theory && !U.isBlank(c.theory));
    add('problem', 'problem', null, show.problem);
    M.CHAIN.forEach(function (k) {
      var on = c.sections[k].enabled !== false;
      add('pnl-' + k, 'panel', { section: k }, on);
      add('hdr-' + k, 'header', { section: k }, on && show.headers);
      c.sections[k].items.forEach(function (it) {
        // A blank item keeps its (hidden) box: clearing an item to retype it
        // must not lose the box's style, position or arrows.
        var blank = U.isBlank(it.text) && it.id !== pendingItemId;
        add('itm-' + it.id, 'item', { section: k, itemId: it.id }, on && !blank);
      });
    });
    add('context', 'context', null, show.context);
    add('assumptions', 'assumptions', null, show.assumptions);
    var brOn = show.brackets && sup.brackets;
    var infl = outc.length > 1 && outc.indexOf('longTerm') >= 0;
    add('brk-control', 'bracket', { part: 'control' }, brOn && prog.length);
    add('brk-influence', 'bracket', { part: 'influence' }, brOn && outc.length);
    add('world', 'world', { part: 'world' }, brOn && sup.world && infl);
    add('str-program', 'structure', { part: 'program' }, show.structureLabels && sup.structureLabels && prog.length);
    add('str-outcome', 'structure', { part: 'outcome' }, show.structureLabels && sup.structureLabels && outc.length);
    add('related', 'related', { part: 'related' }, show.related && sup.related && prog.length);
    return list;
  }

  /** Automatic arrows the current content and template call for. */
  function autoEdges(doc, visible) {
    var tpl = LMB.templates.of(doc);
    var sup = tpl.supports || {};
    var show = doc.diagram.show;
    var out = [];
    var chain = M.chainOn(doc);
    if (show.columnArrows) {
      for (var i = 0; i < chain.length - 1; i++) {
        out.push({ id: 'ae-' + chain[i] + '-' + chain[i + 1], from: 'pnl-' + chain[i], to: 'pnl-' + chain[i + 1] });
      }
      if (sup.problemArrow && visible.problem && chain.length) out.push({ id: 'ae-problem', from: 'problem', to: 'pnl-' + chain[0] });
    }
    if (sup.contextArrows && visible.context) {
      var prog = chain.filter(C.isProgram), outc = chain.filter(C.isOutcome);
      var mid = function (keys) { return keys[Math.floor((keys.length - 1) / 2)]; };
      if (prog.length) out.push({ id: 'ae-ctx-program', from: 'context', to: visible['str-program'] ? 'str-program' : 'pnl-' + mid(prog) });
      if (outc.length) out.push({ id: 'ae-ctx-outcome', from: 'context', to: visible['str-outcome'] ? 'str-outcome' : 'pnl-' + mid(outc) });
    }
    return out;
  }

  /**
   * Make nodes and auto-edges match the content. Returns the ids of new nodes
   * and of item boxes shown again (a blank item that got its text back).
   */
  function reconcile(doc) {
    var dg = doc.diagram;
    var want = parts(doc);
    var wantById = {};
    want.forEach(function (p) { wantById[p.id] = p; });
    var byId = {};
    dg.nodes.forEach(function (n) { byId[n.id] = n; });

    // Remove linked nodes whose content is gone (deleted items).
    var removed = {};
    dg.nodes = dg.nodes.filter(function (n) {
      if (n.role === 'free' || wantById[n.id]) return true;
      removed[n.id] = true;
      return false;
    });
    // Create / update wanted nodes.
    var created = [];
    var firstFree = function () { for (var i = 0; i < dg.nodes.length; i++) if (dg.nodes[i].role === 'free') return i; return dg.nodes.length; };
    var panelEnd = function () { var i = 0; while (i < dg.nodes.length && dg.nodes[i].role === 'panel') i++; return i; };
    want.forEach(function (p) {
      var n = byId[p.id];
      if (!n || removed[p.id]) {
        n = { id: p.id, kind: 'linked', role: p.role, link: p.link, shape: null, x: null, y: null, w: null, h: null, style: {}, fit: true, hidden: !p.visible };
        if (p.role === 'panel') dg.nodes.splice(panelEnd(), 0, n);
        else dg.nodes.splice(firstFree(), 0, n);
        created.push(n.id);
        byId[p.id] = n;
      } else {
        // A section switched back on (Intermediate outcomes): its column's old
        // spot is stale, so forget it and let incremental() fit it back in.
        if (p.role === 'panel' && n.hidden && p.visible) forgetSection(dg, p.link.section);
        if (p.role === 'item' && n.hidden && p.visible) created.push(n.id);
        n.role = p.role;
        n.link = p.link;
        n.hidden = !p.visible;
      }
    });

    // Auto edges.
    var visible = {};
    want.forEach(function (p) { if (p.visible) visible[p.id] = true; });
    var wantEdges = autoEdges(doc, visible);
    var wantE = {};
    wantEdges.forEach(function (e) { wantE[e.id] = e; });
    var nodeIds = {};
    dg.nodes.forEach(function (n) { nodeIds[n.id] = true; });
    var haveE = {};
    dg.edges = dg.edges.filter(function (e) {
      if (e.auto) {
        if (!wantE[e.id]) return false;
        e.from = wantE[e.id].from; e.to = wantE[e.id].to;
        haveE[e.id] = true;
        return true;
      }
      // Free arrows: drop if a node they were attached to is gone.
      if ((e.from && !nodeIds[e.from]) || (e.to && !nodeIds[e.to])) return false;
      return true;
    });
    wantEdges.forEach(function (w) {
      if (haveE[w.id]) return;
      dg.edges.unshift({ id: w.id, from: w.from, to: w.to, fromPt: null, toPt: null, fromSide: null, toSide: null, auto: true, route: 'straight', style: {}, label: '', hidden: false });
    });
    return created;
  }

  /** Clear the geometry of a section's panel, header and items. */
  function forgetSection(dg, k) {
    dg.nodes.forEach(function (n) {
      if (n.role !== 'panel' && n.role !== 'header' && n.role !== 'item') return;
      if (!n.link || n.link.section !== k) return;
      n.x = n.y = n.w = n.h = null;
      delete n.base;
    });
  }

  /** Helper API handed to template layout functions (see templates.js). */
  function api(doc) {
    var page = M.page(doc);
    var m = M.PAGE_MARGIN;
    var byId = {};
    doc.diagram.nodes.forEach(function (n) { byId[n.id] = n; });
    var L = {
      doc: doc,
      B: doc.diagram.baseFontSize,
      s: doc.diagram.baseFontSize / 11,
      page: page,
      X0: m, Y0: m, W: page.w - 2 * m, H: page.h - 2 * m,
      chain: M.chainOn(doc),
      node: function (id) { var n = byId[id]; return n && !n.hidden ? n : null; },
      items: function (k) {
        return doc.content.sections[k].items.map(function (it) { return L.node('itm-' + it.id); }).filter(Boolean);
      },
      need: function (n, w) { return C.need(doc, n, w); },
      /** Number of words that would have to be split to fit width w. */
      breaks: function (n, w) { return C.breaks(doc, n, w); },
      /** Lowest edge of everything put so far (templates compare trial layouts with it). */
      bottom: 0,
      put: function (n, x, y, w, h) {
        n.x = Math.round(x * 100) / 100; n.y = Math.round(y * 100) / 100;
        n.w = Math.round(w * 100) / 100; n.h = Math.round(h * 100) / 100;
        n.fit = true;
        if (n.role === 'panel') n.base = { x: n.x, y: n.y, w: n.w, h: n.h };
        L.bottom = Math.max(L.bottom, n.y + n.h);
      }
    };
    return L;
  }

  /** Run the template's automatic arrangement on every linked node. */
  function arrange(doc) {
    LMB.templates.of(doc).layout(api(doc));
  }

  function hasGeom(n) { return n.x != null && n.y != null && n.w != null && n.h != null; }
  function overlapX(a, b) { return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1; }

  /** Keep a hand-made arrangement tidy after content changes. */
  function incremental(doc, created) {
    var dg = doc.diagram;
    var s = dg.baseFontSize / 11;
    var ig = 6 * s;
    var byId = {};
    dg.nodes.forEach(function (n) { byId[n.id] = n; });
    var linked = dg.nodes.filter(function (n) { return n.role !== 'free' && !n.hidden; });
    var oldBottom = chainBottom(linked);
    var scratch = null; // a full automatic arrangement of a copy, made only if needed
    function fresh() {
      if (!scratch) {
        scratch = U.clone(doc);
        arrange(scratch);
        scratch.byId = {};
        scratch.diagram.nodes.forEach(function (x) { scratch.byId[x.id] = x; });
      }
      return scratch;
    }

    // Boxes that grew or are new this time. Only these push other boxes
    // (step 3): a box the student dragged or resized onto another never does.
    var grew = {};
    (created || []).forEach(function (id) { grew[id] = true; });

    // 1. Place nodes that have no position yet. A column that comes back
    //    (Intermediate outcomes switched on again) is fitted in first.
    M.CHAIN.forEach(function (k) {
      var pn = byId['pnl-' + k];
      if (pn && !pn.hidden && !hasGeom(pn)) placeSection(doc, k, byId, fresh(), grew);
    });
    var missing = linked.filter(function (n) { return !hasGeom(n); });
    missing.forEach(function (n) {
      grew[n.id] = true;
      if (n.role === 'item' && placeItem(doc, n, byId, ig)) return;
      var src = fresh().byId[n.id];
      if (src && hasGeom(src)) { n.x = src.x; n.y = src.y; n.w = src.w; n.h = src.h; n.dir = src.dir || n.dir; if (src.base) n.base = src.base; }
      else { n.x = 40; n.y = 40; n.w = 160; n.h = C.need(doc, n, 160); }
    });

    // 2. Heights follow the text (never smaller than the text needs).
    var exact = { item: 1, header: 1, title: 1, theory: 1, structure: 1, bracket: 0, world: 1, related: 1 };
    linked.forEach(function (n) {
      if (n.role === 'panel') return;
      if (n.role === 'bracket' && (n.dir === 'left' || n.dir === 'right')) return;
      var need = C.need(doc, n, n.w);
      if (need > n.h + 0.5) grew[n.id] = true;
      if (n.fit !== false && exact[n.role]) n.h = need;
      else if (n.h < need) n.h = need;
    });

    // 3. Within each section, a box that grew (or is new) pushes the boxes
    //    below it down if they now overlap; a pushed box pushes the next one.
    M.CHAIN.forEach(function (k) {
      var order = {};
      doc.content.sections[k].items.forEach(function (it, i) { order['itm-' + it.id] = i + 1; });
      var members = linked.filter(function (n) { return (n.role === 'item' || n.role === 'header') && n.link && n.link.section === k; });
      members.sort(function (a, b) { return (a.y - b.y) || ((order[a.id] || 0) - (order[b.id] || 0)); });
      for (var i = 1; i < members.length; i++) {
        for (var j = 0; j < i; j++) {
          var p = members[j], q = members[i];
          if (!grew[p.id]) continue;
          if (overlapX(p, q) && q.y < p.y + p.h + 2 && q.y + q.h > p.y) {
            q.y = Math.round((p.y + p.h + ig) * 100) / 100;
            grew[q.id] = true;
          }
        }
      }
    });

    // 4. Panels re-fit around their header and items (unless resized by hand).
    M.CHAIN.forEach(function (k) {
      var pn = byId['pnl-' + k];
      if (!pn || pn.hidden || pn.fit === false || !hasGeom(pn)) return;
      refitPanel(doc, pn, linked, s);
    });

    // 5. If text growth or new items made the columns taller, move what sits
    //    below them (brackets, labels, External influences, Assumptions) down
    //    so the columns don't run into it. Free shapes are never moved.
    if (Object.keys(grew).length) {
      var newBottom = chainBottom(linked);
      if (oldBottom != null && newBottom > oldBottom + 0.5) {
        var below = linked.filter(function (n) { return BELOW[n.role] && hasGeom(n) && n.y >= oldBottom - 1; });
        if (below.length) {
          var top = Math.min.apply(null, below.map(function (n) { return n.y; }));
          var shift = newBottom + Math.min(top - oldBottom, 24 * s) - top;
          if (shift > 0.5) below.forEach(function (n) { n.y = Math.round((n.y + shift) * 100) / 100; });
        }
      }
    }
  }

  // Linked parts that can sit below the columns (moved down by step 5).
  var BELOW = { bracket: 1, world: 1, structure: 1, related: 1, context: 1, assumptions: 1 };

  /** Lowest edge of the chain columns (panels, headers, items), or null. */
  function chainBottom(nodes) {
    var b = null;
    nodes.forEach(function (n) {
      if ((n.role === 'panel' || n.role === 'header' || n.role === 'item') && hasGeom(n)) b = b == null ? n.y + n.h : Math.max(b, n.y + n.h);
    });
    return b;
  }

  /**
   * Re-fit a panel around its header and items. Only boxes that touch the
   * panel (directly or through a chain of touching siblings) count, and not
   * a box sitting in another column, so dragging an item out of its column
   * leaves the panel where it was. A panel also never widens into the column
   * beside it, so a widened item can't make the column arrows flip.
   */
  function refitPanel(doc, pn, linked, s) {
    var k = pn.link.section;
    // The same padding the template's layout leaves inside its panels.
    var pad = (LMB.templates.of(doc).panelPad || 7) * s, near = 12 * s, gap = 4 * s;
    var base = pn.base || { x: pn.x, y: pn.y, w: pn.w, h: pn.h };
    var others = linked.filter(function (n) { return n.role === 'panel' && n !== pn && hasGeom(n); })
      .map(function (n) { return n.base || { x: n.x, y: n.y, w: n.w, h: n.h }; });
    function inOther(n) {
      var cx = n.x + n.w / 2, cy = n.y + n.h / 2;
      return others.some(function (b) { return cx > b.x && cx < b.x + b.w && cy > b.y && cy < b.y + b.h; });
    }
    var x1 = base.x, y1 = base.y, x2 = base.x + base.w, y2 = base.y + base.h;
    var rest = linked.filter(function (n) { return (n.role === 'item' || n.role === 'header') && n.link && n.link.section === k && hasGeom(n) && !inOther(n); });
    var added = true;
    while (added) {
      added = false;
      rest = rest.filter(function (n) {
        var touches = n.x < x2 + near && n.x + n.w > x1 - near && n.y < y2 + near && n.y + n.h > y1 - near;
        if (!touches) return true;
        x1 = Math.min(x1, n.x - pad); y1 = Math.min(y1, n.y - pad);
        x2 = Math.max(x2, n.x + n.w + pad); y2 = Math.max(y2, n.y + n.h + pad);
        added = true;
        return false;
      });
    }
    // Stay out of the columns to the left and right, using at most half the
    // gap between them (the other half keeps room for the column arrow).
    others.forEach(function (b) {
      if (b.y >= base.y + base.h || b.y + b.h <= base.y) return; // not side by side
      var r = base.x + base.w, l = b.x + b.w;
      if (b.x >= r) x2 = Math.max(r, Math.min(x2, b.x - Math.max(gap, (b.x - r) / 2)));
      else if (l <= base.x) x1 = Math.min(base.x, Math.max(x1, l + Math.max(gap, (base.x - l) / 2)));
    });
    pn.x = x1; pn.y = y1; pn.w = x2 - x1; pn.h = y2 - y1;
  }

  /**
   * A column coming back with auto layout off: put it just after the column
   * before it (as the automatic layout would space them), and slide the later
   * columns right if it needs the room. sc is a fresh automatic arrangement.
   */
  function placeSection(doc, k, byId, sc, grew) {
    var chain = M.chainOn(doc);
    var i = chain.indexOf(k);
    var sp = sc.byId['pnl-' + k];
    if (!sp || !hasGeom(sp)) return;
    var shown = function (key) { var n = byId['pnl-' + key]; return n && !n.hidden && hasGeom(n) ? n : null; };
    var prevKey = null, nextKey = null;
    for (var a = i - 1; a >= 0 && !prevKey; a--) if (shown(chain[a])) prevKey = chain[a];
    for (var b = i + 1; b < chain.length && !nextKey; b++) if (shown(chain[b])) nextKey = chain[b];
    // Offset from the automatic spot to the student's arrangement.
    var dx = 0, dy = 0;
    if (prevKey) {
      var pa = shown(prevKey), ps = sc.byId['pnl-' + prevKey];
      dx = pa.x + pa.w - (ps.x + ps.w); dy = pa.y - ps.y;
    } else if (nextKey) {
      var na0 = shown(nextKey), ns0 = sc.byId['pnl-' + nextKey];
      dx = na0.x - ns0.x; dy = na0.y - ns0.y;
    }
    var mine = doc.diagram.nodes.filter(function (n) { return n.link && n.link.section === k && (n.role === 'panel' || n.role === 'header' || n.role === 'item') && !n.hidden; });
    mine.forEach(function (n) {
      var src = sc.byId[n.id];
      if (!src || !hasGeom(src)) return;
      n.x = src.x + dx; n.y = src.y + dy; n.w = src.w; n.h = src.h;
      // As tall as the column before it; the re-fit grows it if its items need more.
      if (n.role === 'panel' && prevKey) n.h = shown(prevKey).h;
      if (n.role === 'panel') n.base = { x: n.x, y: n.y, w: n.w, h: n.h };
      grew[n.id] = true; // new here: may push things below it (steps 3 and 5)
    });
    if (!prevKey) return;
    // Room for it: slide the later columns right (if they are in the way), and
    // stretch the brackets and labels that span the gap.
    var shift = 0;
    if (nextKey) {
      var na = shown(nextKey), ns = sc.byId['pnl-' + nextKey];
      shift = Math.max(0, ns.x + dx - na.x); // ns.x + dx: where the next column should start
      if (shift < 0.5) shift = 0;
    }
    var cut = sp.x + dx; // everything from here rightward moves
    var later = {};
    chain.slice(i + 1).forEach(function (key) { later[key] = true; });
    doc.diagram.nodes.forEach(function (n) {
      if (n.hidden || !hasGeom(n) || n.role === 'free') return;
      if (n.link && later[n.link.section] && (n.role === 'panel' || n.role === 'header' || n.role === 'item')) {
        n.x += shift;
        if (n.base) n.base = { x: n.base.x + shift, y: n.base.y, w: n.base.w, h: n.base.h };
      } else if (BELOW[n.role] && n.role !== 'context' && n.role !== 'assumptions') {
        if (n.x >= cut - 1) n.x += shift;
        else if (n.x + n.w > cut - 1) n.w += shift;
        else {
          // ends at the column before; in the automatic layout it also spans this one
          var src = sc.byId[n.id];
          if (src && hasGeom(src) && Math.abs(src.x + src.w - (sp.x + sp.w)) < 2) n.w = sp.x + sp.w + dx - n.x;
        }
      }
    });
  }

  /** New item with auto layout off: under the item before it, or under its section. */
  function placeItem(doc, n, byId, ig) {
    var k = n.link.section;
    var items = doc.content.sections[k].items;
    var idx = -1;
    items.forEach(function (it, i) { if ('itm-' + it.id === n.id) idx = i; });
    var prev = null;
    for (var i = idx - 1; i >= 0; i--) {
      var c = byId['itm-' + items[i].id];
      if (c && !c.hidden && hasGeom(c)) { prev = c; break; }
    }
    var ref = prev;
    if (!ref) {
      // First in order: take the spot of the first placed sibling (others get pushed down).
      for (var j = idx + 1; j < items.length; j++) {
        var nx = byId['itm-' + items[j].id];
        if (nx && !nx.hidden && hasGeom(nx)) { n.x = nx.x; n.w = nx.w; n.y = nx.y; n.h = C.need(doc, n, n.w); return true; }
      }
      var hdr = byId['hdr-' + k];
      if (hdr && !hdr.hidden && hasGeom(hdr)) { n.x = hdr.x; n.w = hdr.w; n.y = hdr.y + hdr.h + ig; n.h = C.need(doc, n, n.w); return true; }
      var pn = byId['pnl-' + k];
      if (pn && hasGeom(pn)) { var p = (LMB.templates.of(doc).panelPad || 7) * (doc.diagram.baseFontSize / 11); n.x = pn.x + p; n.w = pn.w - 2 * p; n.y = pn.y + p; n.h = C.need(doc, n, n.w); return true; }
      return false;
    }
    n.x = ref.x; n.w = ref.w; n.y = ref.y + ref.h + ig; n.h = C.need(doc, n, n.w);
    return true;
  }

  /**
   * Bring the diagram in line with the content. Called after every change.
   * opts.relayout forces a fresh automatic arrangement.
   */
  function sync(doc, opts) {
    opts = opts || {};
    var created = reconcile(doc);
    if (doc.diagram.autoLayout || opts.relayout) {
      doc.diagram.autoLayout = true;
      arrange(doc);
      // Hidden boxes of blank items were left out, so their old spot is stale.
      doc.diagram.nodes.forEach(function (n) { if (n.role === 'item' && n.hidden) n.x = n.y = n.w = n.h = null; });
    } else {
      incremental(doc, created);
    }
    growFree(doc);
    return doc;
  }

  /**
   * Boxes the student added never end up smaller than their text, so a new
   * text size, bold, font or base size can't make the words spill out (or
   * get cut off in an export). Sideways brackets have no text height.
   */
  function growFree(doc) {
    doc.diagram.nodes.forEach(function (n) {
      if (n.role !== 'free' || n.hidden || !hasGeom(n) || U.isBlank(n.text)) return;
      var st = C.style(doc, n);
      if (st.shape === 'bracket' && (st.dir === 'left' || st.dir === 'right')) return;
      var need = C.needFor(doc, n, st, n.w);
      if (n.h < need) n.h = need;
    });
  }

  /**
   * Items of section k were reordered in Write with auto layout off: stack
   * their boxes in the new order in the space they already use (each box
   * keeps its own x, width and style; the gaps between slots are kept).
   * Called from the reorder's change function, before sync runs.
   */
  function restack(doc, k) {
    if (doc.diagram.autoLayout) return;
    var byId = {};
    doc.diagram.nodes.forEach(function (n) { byId[n.id] = n; });
    var boxes = doc.content.sections[k].items.map(function (it) { return byId['itm-' + it.id]; })
      .filter(function (n) { return n && !n.hidden && hasGeom(n); });
    if (boxes.length < 2) return;
    var slots = boxes.slice().sort(function (a, b) { return a.y - b.y; })
      .map(function (n) { return { y: n.y, h: n.h }; });
    var y = slots[0].y;
    boxes.forEach(function (n, i) {
      if (i > 0) y += Math.max(0, slots[i].y - (slots[i - 1].y + slots[i - 1].h));
      n.y = Math.round(y * 100) / 100;
      y += n.h;
    });
  }

  /* ---------------------------------------------------------------------------
     PAGE FIT — shared by the Write preview, the Design panel and Export.
     ------------------------------------------------------------------------ */

  /** True when something is drawn past the edge of the chosen page. */
  function overflows(doc) {
    if (doc.diagram.page === 'none') return false;
    var page = M.page(doc), b = LMB.render.bounds(doc);
    return !b.empty && (b.x < -1 || b.y < -1 || b.x + b.w > page.w + 1 || b.y + b.h > page.h + 1);
  }

  /** How many shown boxes have a word too long for them (split with a hyphen). */
  function brokenBoxes(doc) {
    var count = 0;
    doc.diagram.nodes.forEach(function (n) {
      if (n.hidden || n.role === 'panel' || !hasGeom(n)) return;
      if (C.breaks(doc, n, n.w)) count++;
    });
    return count;
  }

  /**
   * "Fit to page": the largest text size from 13 px down to 9 px (in half
   * steps) at which the whole diagram sits inside the page margins, best
   * with no word split. Each size is tried on a copy, the same way the real
   * change would be applied (re-arranged, or kept as arranged when
   * auto-arrange is off; opts.relayout forces a re-arrange). Returns null
   * when nothing fits, even at 9 px.
   */
  var FIT_MAX = 13, FIT_MIN = 9;
  function fitSize(doc, opts) {
    if (doc.diagram.page === 'none') return null;
    var page = M.page(doc), m = M.PAGE_MARGIN - 6; // a little give inside the 36-unit margin
    // Never ask for more margin on the top and left than the drawing has now.
    var b0 = LMB.render.bounds(doc);
    var left = Math.min(m, Math.max(0, b0.x)), top = Math.min(m, Math.max(0, b0.y));
    var firstFit = null;
    for (var size = FIT_MAX; size >= FIT_MIN; size -= 0.5) {
      var d = U.clone(doc);
      d.diagram.baseFontSize = size;
      sync(d, opts);
      var b = LMB.render.bounds(d);
      if (b.empty) return null;
      var ok = b.x >= left - 1 && b.y >= top - 1 && b.x + b.w <= page.w - m && b.y + b.h <= page.h - m;
      if (!ok) continue;
      if (!brokenBoxes(d)) return size;
      if (firstFit == null) firstFit = size; // fits, but splits a word: keep looking for one that doesn't
    }
    return firstFit;
  }

  LMB.layout = {
    overflows: overflows,
    brokenBoxes: brokenBoxes,
    fitSize: fitSize,
    FIT_MIN: FIT_MIN,
    sync: sync,
    arrange: arrange,
    parts: parts,
    restack: restack,
    setPendingItem: function (id) { pendingItemId = id; },
    getPendingItem: function () { return pendingItemId; }
  };
})();

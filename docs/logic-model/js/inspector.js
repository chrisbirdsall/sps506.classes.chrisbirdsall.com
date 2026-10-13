/* =============================================================================
   inspector.js — the Properties panel on the right of the Design step.

   Nothing selected   → Diagram settings: template, theme, font, text size,
                        page, background, which parts to show, Re-arrange,
                        Reset styles.
   Box(es) selected   → shape, fill, border, text, opacity, position/size,
                        layering, align/distribute (several boxes), Reset style.
   Arrow(s) selected  → color, width, line style, route, arrowheads, label.

   Every change goes through store.mutate() so it can be undone.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, S = LMB.store, C = LMB.content, M = LMB.model, TH = LMB.themes, TP = LMB.templates, T = LMB.text, R = LMB.render;
  var h = U.h;

  var root;
  var I = {};

  /* ---------- helpers ---------- */
  function selNodes() { return S.selected().map(S.node).filter(function (n) { return n && !n.hidden; }); }
  function selEdges() { return S.selected().map(S.edge).filter(Boolean); }
  function findIn(d, id) { for (var i = 0; i < d.diagram.nodes.length; i++) if (d.diagram.nodes[i].id === id) return d.diagram.nodes[i]; return null; }
  function findEdgeIn(d, id) { for (var i = 0; i < d.diagram.edges.length; i++) if (d.diagram.edges[i].id === id) return d.diagram.edges[i]; return null; }
  /** The shared value of fn over list, or null when they differ. */
  function common(list, fn) {
    if (!list.length) return null;
    var v = fn(list[0]);
    for (var i = 1; i < list.length; i++) if (!U.deepEqual(fn(list[i]), v)) return null;
    return v;
  }
  var uidN = 0;
  function fid(k) { return 'insp-' + k + '-' + (++uidN); }

  /**
   * Panel heading. The h2 can take focus (tabindex -1) so focus has somewhere
   * to land when the control that had it goes away. Box and arrow panels
   * also get a "Diagram settings" button that clears the selection, the
   * keyboard route to the Diagram panel (clicking empty canvas does the same).
   */
  function head(title, sub, back) {
    var hd = h('div', { class: 'insp-head' });
    if (back) {
      var b = h('button', { type: 'button', class: 'insp-back', dataset: { key: 'todiagram' }, html: '<span aria-hidden="true">←</span> Diagram settings' });
      b.addEventListener('click', I.showDiagram);
      hd.appendChild(b);
    }
    hd.appendChild(h('h2', { attrs: { tabindex: '-1' } }, title));
    hd.appendChild(h('span', { class: 'sub' }, sub || ''));
    return hd;
  }
  function sec(title, kids) { return h('div', { class: 'insp-sec' }, title ? h('h3', null, title) : null, kids); }
  function row(label, control, forId) {
    return h('div', { class: 'insp-row' }, forId ? h('label', { class: 'lbl', attrs: { for: forId } }, label) : h('span', { class: 'lbl' }, label), control);
  }
  /** Segmented control: options [{v, label, icon, title}] */
  function seg(groupLabel, options, value, onPick, key) {
    var g = h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': groupLabel } });
    options.forEach(function (o) {
      var b = h('button', {
        type: 'button', dataset: { key: key + ':' + o.v },
        attrs: { 'aria-pressed': String(value === o.v), title: o.title || o.label, 'aria-label': o.title || o.label },
        html: o.icon ? U.icon(o.icon, 16) : U.escHTML(o.label)
      });
      b.addEventListener('click', function () { onPick(o.v); });
      g.appendChild(b);
    });
    return g;
  }
  /** Color picker: theme swatches + custom color + optional "none". */
  function colorPicker(label, value, onPick, opts) {
    opts = opts || {};
    var wrapEl = h('div', { class: 'swatches', attrs: { role: 'group', 'aria-label': label } });
    var key = opts.key || label;
    if (opts.none) {
      var nb = h('button', { type: 'button', class: 'sw sw-none', dataset: { key: key + ':none' }, attrs: { 'aria-pressed': String(value === 'none'), title: 'None', 'aria-label': label + ': None' } });
      nb.addEventListener('click', function () { onPick('none'); });
      wrapEl.appendChild(nb);
    }
    TH.swatches(S.doc.diagram.theme).forEach(function (sw) {
      var c = sw.value;
      // Spoken as "Fill: Teal (program)"; the hex code shows on hover.
      var b = h('button', { type: 'button', class: 'sw', dataset: { key: key + ':' + c }, style: { background: c }, attrs: { 'aria-pressed': String(value && String(value).toLowerCase() === c.toLowerCase()), title: sw.name + ', ' + c, 'aria-label': label + ': ' + sw.name } });
      b.addEventListener('click', function () { onPick(c); });
      wrapEl.appendChild(b);
    });
    var custom = h('input', { type: 'color', dataset: { key: key + ':custom' }, attrs: { 'aria-label': label + ': custom color', title: 'Custom color' } });
    var hex = U.parseColor(value) ? U.toHex(U.parseColor(value)) : '#ffffff';
    custom.value = hex;
    custom.addEventListener('input', function () { onPick(custom.value, true); });
    custom.addEventListener('change', function () { LMB.history.seal(); });
    wrapEl.appendChild(h('span', { class: 'sw sw-custom', attrs: { title: 'Custom color' } }, custom));
    return wrapEl;
  }
  function numInput(label, value, onSet, o) {
    o = o || {};
    var id = fid('num');
    var el = h('input', { type: 'number', id: id, step: o.step || 1, min: o.min, max: o.max, dataset: { key: o.key || label } });
    el.value = value == null ? '' : String(Math.round(value * 10) / 10);
    if (value == null) el.placeholder = 'mixed';
    var apply = function () {
      var v = parseFloat(el.value);
      if (!isFinite(v)) return;
      if (o.min != null) v = Math.max(o.min, v);
      if (o.max != null) v = Math.min(o.max, v);
      onSet(v);
    };
    el.addEventListener('change', apply);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { apply(); } });
    return { el: el, id: id };
  }

  function setNodes(label, fn, coalesce) {
    var ids = selNodes().map(function (n) { return n.id; });
    S.mutate(label, function (d) {
      var any = false;
      ids.forEach(function (id) { var nd = findIn(d, id); if (nd) { if (fn(nd, d) !== false) any = true; } });
      return any ? undefined : false;
    }, { source: 'inspector', coalesce: coalesce });
  }
  function setStyle(key, value, label, coalesce) {
    setNodes(label || 'Change style', function (nd) { nd.style = nd.style || {}; nd.style[key] = value; }, coalesce);
  }
  function setEdges(label, fn, coalesce) {
    var ids = selEdges().map(function (e) { return e.id; });
    S.mutate(label, function (d) { ids.forEach(function (id) { var e = findEdgeIn(d, id); if (e) fn(e); }); }, { source: 'inspector', coalesce: coalesce });
  }
  /** Where each node is now, to tell later whether anything really moved. */
  function geomOf(nodes) {
    var out = {};
    nodes.forEach(function (n) { out[n.id] = [n.x, n.y, n.w, n.h].join(); });
    return out;
  }
  /** A hand edit of a linked box's geometry turns auto layout off (only if it moved). */
  function geomChanged(d, nodes, before) {
    var moved = nodes.filter(function (n) { return n.role !== 'free' && (!before || before[n.id] !== [n.x, n.y, n.w, n.h].join()); });
    if (d.diagram.autoLayout && moved.length) d.diagram.autoLayout = false;
  }
  /**
   * Move a node to (x, y). A column panel takes its header and items along,
   * as a drag on the canvas does, and its base moves too so the next re-fit
   * keeps it there. Boxes listed in skip are moved on their own.
   */
  function moveTo(d, nd, x, y, skip) {
    var dx = x - nd.x, dy = y - nd.y;
    if (!dx && !dy) return;
    nd.x = x; nd.y = y;
    if (nd.base) nd.base = { x: nd.base.x + dx, y: nd.base.y + dy, w: nd.base.w, h: nd.base.h };
    if (nd.role !== 'panel') return;
    d.diagram.nodes.forEach(function (m) {
      if ((m.role === 'item' || m.role === 'header') && m.link && m.link.section === nd.link.section && m.x != null && m.y != null && !(skip && skip[m.id])) {
        m.x = Math.round((m.x + dx) * 100) / 100; m.y = Math.round((m.y + dy) * 100) / 100;
      }
    });
  }
  function idSet(nodes) { var o = {}; nodes.forEach(function (n) { o[n.id] = true; }); return o; }

  /* ---------- template thumbnails ---------- */
  var THUMBS = {
    handbook: '<svg viewBox="0 0 54 40" class="tpl-thumb"><path d="M3 12h7l3 5-3 5H3z" fill="#e9eef0" stroke="#597287" stroke-width=".8"/><g fill="#fff" stroke="#176b87" stroke-width="1"><rect x="15" y="9" width="5.5" height="16"/><rect x="22" y="9" width="5.5" height="16"/><rect x="29" y="9" width="5.5" height="16"/></g><g fill="#fff8e8" stroke="#e5ad3d" stroke-width="1"><rect x="37" y="9" width="5" height="16"/><rect x="43.5" y="9" width="5" height="16"/></g><path d="M15 7V5.5h19.5V7" fill="none" stroke="#c24f3d" stroke-width="1.1"/><rect x="3" y="30" width="46" height="6" rx="1.5" fill="#102a43"/></svg>',
    columns: '<svg viewBox="0 0 54 40" class="tpl-thumb"><rect x="3" y="3" width="48" height="6" rx="1" fill="#eef1f4"/><g><rect x="3" y="12" width="7" height="3" rx=".8" fill="#2f7f8f"/><rect x="11.5" y="12" width="7" height="3" rx=".8" fill="#3d5a9e"/><rect x="20" y="12" width="7" height="3" rx=".8" fill="#6b4c9a"/><rect x="28.5" y="12" width="7" height="3" rx=".8" fill="#b8553f"/><rect x="37" y="12" width="7" height="3" rx=".8" fill="#c47f22"/><rect x="45.5" y="12" width="5.5" height="3" rx=".8" fill="#4f8a3c"/></g><g fill="#fff" stroke="#cfd8dc" stroke-width=".6"><rect x="3" y="17" width="7" height="4"/><rect x="11.5" y="17" width="7" height="4"/><rect x="20" y="17" width="7" height="4"/><rect x="28.5" y="17" width="7" height="4"/><rect x="37" y="17" width="7" height="4"/><rect x="45.5" y="17" width="5.5" height="4"/><rect x="3" y="22.5" width="7" height="4"/><rect x="20" y="22.5" width="7" height="4"/><rect x="37" y="22.5" width="7" height="4"/></g><rect x="3" y="31" width="23" height="6" rx="1" fill="#f6f6f2" stroke="#8a8f94" stroke-width=".5"/><rect x="28" y="31" width="23" height="6" rx="1" fill="#24323f"/></svg>',
    topdown: '<svg viewBox="0 0 54 40" class="tpl-thumb"><g transform="translate(14 0)"><rect x="0" y="2" width="26" height="4" rx="1" fill="#e9eef0"/><g fill="#fff" stroke="#176b87" stroke-width=".8"><rect x="0" y="8" width="26" height="5" rx="1"/><rect x="0" y="15" width="26" height="5" rx="1"/></g><g fill="#fff8e8" stroke="#e5ad3d" stroke-width=".8"><rect x="0" y="22" width="26" height="5" rx="1"/><rect x="0" y="29" width="26" height="5" rx="1"/></g><rect x="0" y="35.5" width="26" height="3" rx="1" fill="#102a43"/></g></svg>'
  };

  /* ---------- Diagram panel (nothing selected) ---------- */
  function diagramPanel() {
    var dg = S.doc.diagram;
    var tpl = TP.of(S.doc);
    var out = [];
    out.push(head('Diagram', 'Select a box to style it'));

    var tl = h('div', { class: 'tpl-list', attrs: { role: 'group', 'aria-label': 'Layout template' } });
    TP.ids().forEach(function (id) {
      var t = TP.get(id);
      var b = h('button', { type: 'button', class: 'tpl-opt', dataset: { key: 'tpl:' + id }, attrs: { 'aria-pressed': String(dg.template === id) }, html: THUMBS[id] + '<span><strong>' + U.escHTML(t.name) + '</strong><span>' + U.escHTML(t.blurb) + '</span></span>' });
      b.addEventListener('click', function () { I.setTemplate(id); });
      tl.appendChild(b);
    });
    out.push(sec('Layout', [tl]));

    var thl = h('div', { class: 'theme-list', attrs: { role: 'group', 'aria-label': 'Color theme' } });
    TH.ids().forEach(function (id) {
      var th = TH.get(id);
      var chips = TH.PROGRAM.concat(TH.OUTCOME).map(function (k) { return '<span style="background:' + TH.tokens(id, k).accent + '"></span>'; }).join('') + '<span style="background:' + th.context.fill + '"></span>';
      var b = h('button', { type: 'button', class: 'theme-opt', dataset: { key: 'theme:' + id }, attrs: { 'aria-pressed': String(dg.theme === id) }, html: '<span class="theme-chips" aria-hidden="true">' + chips + '</span><span>' + U.escHTML(th.name) + '</span>' });
      b.addEventListener('click', function () {
        S.mutate('Change theme', function (d) { if (d.diagram.theme === id) return false; d.diagram.theme = id; }, { source: 'inspector' });
      });
      thl.appendChild(b);
    });
    out.push(sec('Color theme', [thl]));

    var fontSel = h('select', { id: fid('font'), dataset: { key: 'font' } });
    Object.keys(T.FONTS).forEach(function (k) { fontSel.appendChild(h('option', { value: k, selected: dg.fontFamily === k }, T.FONTS[k].label)); });
    fontSel.addEventListener('change', function () { S.mutate('Change font', function (d) { d.diagram.fontFamily = fontSel.value; }, { source: 'inspector' }); });
    var size = numInput('Text size', dg.baseFontSize, function (v) { S.mutate('Change text size', function (d) { d.diagram.baseFontSize = v; }, { source: 'inspector', coalesce: 'basesize' }); }, { min: 7, max: 24, step: 0.5, key: 'basesize' });
    var pageSel = h('select', { id: fid('page'), dataset: { key: 'page' } });
    Object.keys(M.PAGES).forEach(function (k) { pageSel.appendChild(h('option', { value: k, selected: dg.page === k }, M.PAGES[k].label)); });
    pageSel.addEventListener('change', function () {
      S.mutate('Change page size', function (d) { d.diagram.page = pageSel.value; }, { source: 'inspector' });
      LMB.editor.refit();
    });
    out.push(sec('Text and page', [
      row('Font', fontSel, fontSel.id),
      row('Text size', h('div', { class: 'num-unit' }, size.el, h('span', { class: 'unit', attrs: { 'aria-hidden': 'true' } }, 'px')), size.id),
      row('Page', pageSel, pageSel.id),
      fitNote(),
      row('Background', seg('Page background', [{ v: 'white', label: 'White' }, { v: 'paper', label: 'Paper', title: 'Theme paper color' }, { v: 'transparent', label: 'None', title: 'Transparent' }], dg.background, function (v) {
        S.mutate('Change background', function (d) { d.diagram.background = v; }, { source: 'inspector' });
      }, 'bg'))
    ]));

    var sup = tpl.supports || {};
    var showDefs = [
      ['title', 'Title'], ['theory', 'Program theory'], ['problem', 'Problem'], ['headers', 'Column headers'],
      ['context', 'External influences'], ['assumptions', 'Assumptions'], ['brackets', 'Control / Influence', sup.brackets],
      ['structureLabels', 'Structure labels', sup.structureLabels], ['related', 'Related program logics', sup.related],
      ['columnArrows', 'Arrows between columns']
    ];
    var cl = h('div', { class: 'check-list' });
    showDefs.forEach(function (sd) {
      var id = fid('show');
      var supported = sd.length < 3 ? true : !!sd[2];
      var cb = h('input', { type: 'checkbox', id: id, checked: !!dg.show[sd[0]], disabled: !supported, dataset: { key: 'show:' + sd[0] } });
      cb.addEventListener('change', function () {
        S.mutate((cb.checked ? 'Show ' : 'Hide ') + sd[1].toLowerCase(), function (d) {
          d.diagram.show[sd[0]] = cb.checked;
          if (sd[0] === 'columnArrows' && cb.checked) d.diagram.edges.forEach(function (e) { if (e.auto) e.hidden = false; });
          if (sd[0] === 'context' && cb.checked) d.diagram.edges.forEach(function (e) { if (/^ae-ctx/.test(e.id)) e.hidden = false; });
        }, { source: 'inspector' });
      });
      cl.appendChild(h('label', { class: supported ? '' : 'disabled', attrs: { for: id, title: supported ? '' : 'Not used by the ' + tpl.name + ' layout' } }, cb, sd[1]));
    });
    out.push(sec('Show', [cl]));

    var rearr = h('button', { type: 'button', class: 'btn btn-sm', dataset: { key: 'rearrange' }, html: U.icon('layout', 16) + '<span>Re-arrange</span>' });
    rearr.addEventListener('click', function () { LMB.editor.rearrange(); });
    var reset = h('button', { type: 'button', class: 'btn btn-sm', dataset: { key: 'resetall' } }, 'Reset styles');
    reset.addEventListener('click', function () {
      var changed = S.mutate('Reset styles', function (d) {
        d.diagram.nodes.forEach(function (n) { n.style = {}; if (n.role !== 'free') n.shape = null; });
        d.diagram.edges.forEach(function (e) { e.style = {}; });
      }, { source: 'inspector' });
      // Offer Undo only when there was something to clear (else it would undo an older change).
      LMB.app.toast(changed ? 'Cleared every color and style change.' : 'There were no color or style changes to clear.', changed ? { action: { label: 'Undo', fn: S.undo } } : {});
    });
    var notes = [];
    notes.push(h('p', { class: 'insp-note' }, dg.autoLayout
      ? 'Auto-arrange is on: boxes rearrange as you edit. Moving a box turns it off.'
      : 'Auto-arrange is off: your arrangement is kept. Re-arrange puts every box back in place (your colors and added shapes stay).'));
    out.push(sec('Arrange', [h('div', { class: 'btn-row' }, rearr, reset)].concat(notes)));
    return out;
  }

  /**
   * Under Page: a red warning when the diagram runs past the page or a word
   * is too long for its box, and the "Fit to page" button. Rebuilt in place
   * after every change (see I.init), so it never goes stale.
   */
  function fitNote() {
    var box = h('div', { class: 'fit-note', dataset: { role: 'fit-note' } });
    fillFitNote(box);
    return box;
  }
  function fillFitNote(box) {
    var doc = S.doc, LY = LMB.layout;
    box.innerHTML = '';
    if (doc.diagram.page === 'none' || M.isEmpty(doc)) return;
    var over = LY.overflows(doc), broken = LY.brokenBoxes(doc);
    var msg = over ? 'The diagram runs past the page.' : '';
    if (broken) msg += (msg ? ' ' : '') + (broken === 1 ? 'One box has a word' : broken + ' boxes have words') + ' too long to fit, split with a hyphen.';
    if (msg) box.appendChild(h('p', { class: 'insp-note insp-warn' }, msg + ' Fit to page picks the largest text size that fits; a larger page also helps.'));
    var fit = h('button', { type: 'button', class: 'btn btn-sm' + (msg ? ' btn-primary' : ''), dataset: { key: 'fitpage' }, attrs: { title: 'Largest text size (9–13 px) at which the diagram fits the page' } }, 'Fit to page');
    fit.addEventListener('click', function () { LMB.editor.fitToPage(); });
    box.appendChild(h('div', { class: 'btn-row' }, fit));
  }

  I.setTemplate = function (id) {
    var t = TP.get(id);
    if (!t) return;
    S.mutate('Change layout', function (d) {
      if (d.diagram.template === id && d.diagram.autoLayout) return false;
      d.diagram.template = id;
      Object.keys(t.defaultShow || {}).forEach(function (k) { d.diagram.show[k] = t.defaultShow[k]; });
      if (d.diagram.page !== 'none' && d.diagram.page !== 'slide' && d.diagram.page !== 'legal-landscape') d.diagram.page = t.defaultPage;
      d.diagram.autoLayout = true;
      d.diagram.nodes.forEach(function (n) { if (n.role !== 'free') { n.fit = true; if (n.role === 'bracket' || n.role === 'structure') delete n.dir; } });
    }, { source: 'inspector', relayout: true });
    if (LMB.editor) LMB.editor.refit();
  };

  /* ---------- Box panel ---------- */
  var ROLE_NAME = C.ROLE_NAME;

  function nodePanel(nodes) {
    var doc = S.doc;
    var styles = nodes.map(function (n) { return C.style(doc, n); });
    var one = nodes.length === 1 ? nodes[0] : null;
    var out = [];
    var title = one ? ROLE_NAME[one.role] || 'Box' : nodes.length + ' boxes';
    var sub = one && one.link && one.link.section ? S.doc.content.sections[one.link.section].label : (one && one.role === 'free' ? (C.SHAPES.filter(function (s) { return s.id === styles[0].shape; })[0] || {}).label : '');
    out.push(head(title, sub, true));

    var cs = function (k) { return common(styles, function (s) { return s[k]; }); };
    var shape = cs('shape');

    if (one && one.role === 'item') {
      var colBtn = h('button', { type: 'button', class: 'btn btn-sm', dataset: { key: 'col' } }, 'Select whole column');
      colBtn.addEventListener('click', function () {
        var k = one.link.section;
        S.select(S.doc.diagram.nodes.filter(function (n) { return n.role === 'item' && n.link.section === k && !n.hidden; }).map(function (n) { return n.id; }), 'inspector');
      });
      var editBtn = h('button', { type: 'button', class: 'btn btn-sm', dataset: { key: 'edit' } }, 'Edit text');
      editBtn.addEventListener('click', function () { LMB.editor.startEdit(one.id); });
      out.push(sec(null, [h('div', { class: 'btn-row' }, editBtn, colBtn), h('p', { class: 'insp-note' }, 'This box is linked to the Write form; editing either one changes both.')]));
    } else if (one && one.role !== 'panel') {
      var eb = h('button', { type: 'button', class: 'btn btn-sm', dataset: { key: 'edit' } }, 'Edit text');
      eb.addEventListener('click', function () { LMB.editor.startEdit(one.id); });
      out.push(sec(null, [h('div', { class: 'btn-row' }, eb)]));
    }

    // Shape
    var sg = h('div', { class: 'shape-grid', attrs: { role: 'group', 'aria-label': 'Shape' } });
    C.SHAPES.forEach(function (s) {
      var b = h('button', { type: 'button', dataset: { key: 'shape:' + s.id }, attrs: { 'aria-pressed': String(shape === s.id), title: s.label, 'aria-label': s.label }, html: U.icon(s.id === 'rect' ? 'rect' : s.id, 18) });
      b.addEventListener('click', function () {
        setNodes('Change shape', function (nd) {
          nd.shape = s.id;
          if (s.id === 'bracket' && !nd.dir) nd.dir = 'down';
          var need = C.need(S.doc, nd, nd.w);
          if (nd.role === 'free' && nd.h < need) nd.h = need;
        });
      });
      sg.appendChild(b);
    });
    var shapeKids = [sg];
    if (shape === 'bracket') {
      var dir = cs('dir');
      shapeKids.push(row('Opens', h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
        seg('Bracket opens toward', [{ v: 'down', label: '↓', title: 'Opens down' }, { v: 'up', label: '↑', title: 'Opens up' }, { v: 'left', label: '←', title: 'Opens left' }, { v: 'right', label: '→', title: 'Opens right' }], dir, function (v) {
          setNodes('Rotate bracket', function (nd) { nd.dir = v; });
        }, 'dir'),
        (function () {
          var rb = h('button', { type: 'button', class: 'icon-btn', dataset: { key: 'rot' }, html: U.icon('rotate', 16), attrs: { 'aria-label': 'Rotate 90 degrees', title: 'Rotate 90°' } });
          rb.addEventListener('click', function () {
            var order = ['down', 'left', 'up', 'right'];
            setNodes('Rotate bracket', function (nd) { var st = C.style(S.doc, nd); nd.dir = order[(order.indexOf(st.dir) + 1) % 4]; });
          });
          return rb;
        })())));
    }
    out.push(sec('Shape', shapeKids));

    // Fill & border
    var fillKids = [];
    if (shape !== 'bracket') fillKids.push(row('Fill', colorPicker('Fill color', cs('fill'), function (v, live) { setStyle('fill', v, 'Change fill', live ? 'insp:fill' : null); }, { none: true, key: 'fill' })));
    fillKids.push(row(shape === 'bracket' ? 'Line' : 'Border', colorPicker('Border color', cs('stroke'), function (v, live) { setStyle('stroke', v, 'Change border', live ? 'insp:stroke' : null); }, { none: shape !== 'bracket', key: 'stroke' })));
    var bw = numInput('Border width', cs('strokeWidth'), function (v) { setStyle('strokeWidth', v, 'Change border width', 'insp:sw'); }, { min: 0, max: 12, step: 0.5, key: 'sw' });
    fillKids.push(row('Width', bw.el, bw.id));
    fillKids.push(row('Style', seg('Border style', [{ v: 'solid', label: 'Solid' }, { v: 'dashed', label: 'Dash' }, { v: 'dotted', label: 'Dot' }, { v: 'none', label: 'None' }], cs('dash'), function (v) { setStyle('dash', v, 'Change border style'); }, 'dash')));
    if (shape && /^(rect|rounded|chevron)$/.test(shape)) {
      var rad = numInput('Corner radius', cs('radius'), function (v) { setStyle('radius', v, 'Change corners', 'insp:rad'); }, { min: 0, max: 40, key: 'rad' });
      fillKids.push(row('Corners', rad.el, rad.id));
    }
    out.push(sec(shape === 'bracket' ? 'Line' : 'Fill and border', fillKids));

    // Text
    if (!(one && one.role === 'panel')) {
      var fs = numInput('Text size', cs('fontSize'), function (v) { setStyle('fontSize', v, 'Change text size', 'insp:fs'); }, { min: 6, max: 72, step: 0.5, key: 'fs' });
      var bold = cs('bold'), italic = cs('italic');
      var bi = h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': 'Text style' } });
      [['bold', 'Bold', bold], ['italic', 'Italic', italic]].forEach(function (x) {
        var b = h('button', { type: 'button', dataset: { key: 'ts:' + x[0] }, attrs: { 'aria-pressed': String(!!x[2]), 'aria-label': x[1], title: x[1] }, html: U.icon(x[0], 16) });
        b.addEventListener('click', function () { setStyle(x[0], !x[2], x[1]); });
        bi.appendChild(b);
      });
      out.push(sec('Text', [
        row('Color', colorPicker('Text color', cs('textColor'), function (v, live) { setStyle('textColor', v, 'Change text color', live ? 'insp:tc' : null); }, { key: 'tc' })),
        row('Size', h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, fs.el, h('span', { class: 'unit', attrs: { 'aria-hidden': 'true' } }, 'px'), bi), fs.id),
        row('Align', seg('Text alignment', [{ v: 'left', icon: 'textL', title: 'Align left' }, { v: 'center', icon: 'textC', title: 'Center' }, { v: 'right', icon: 'textR', title: 'Align right' }], cs('align'), function (v) { setStyle('align', v, 'Change alignment'); }, 'align'))
      ]));
    }

    // Opacity
    var op = cs('opacity');
    var opId = fid('op');
    var range = h('input', { type: 'range', id: opId, min: 0.1, max: 1, step: 0.05, dataset: { key: 'op' } });
    range.value = op == null ? 1 : op;
    range.addEventListener('input', function () { setStyle('opacity', parseFloat(range.value), 'Change opacity', 'insp:op'); });
    range.addEventListener('change', function () { LMB.history.seal(); });

    // Position & size
    var geo = h('div', { class: 'num-grid' });
    ['x', 'y', 'w', 'h'].forEach(function (k) {
      var v = common(nodes, function (n) { return Math.round(n[k] * 10) / 10; });
      var id = fid('geo');
      var inp = h('input', { type: 'number', id: id, step: 1, dataset: { key: 'geo:' + k } });
      inp.value = v == null ? '' : v;
      if (v == null) inp.placeholder = '–';
      if ((k === 'x' || k === 'y') && nodes.length > 1) inp.disabled = true;
      inp.addEventListener('change', function () {
        var val = parseFloat(inp.value);
        if (!isFinite(val)) return;
        S.mutate('Change ' + ({ x: 'position', y: 'position', w: 'width', h: 'height' })[k], function (d) {
          var list = nodes.map(function (n) { return findIn(d, n.id); }).filter(Boolean);
          var before = geomOf(list);
          list.forEach(function (nd) {
            if (k === 'w') nd.w = Math.max(24, val);
            else if (k === 'h') nd.h = Math.max(C.need(d, nd, nd.w), val);
            else moveTo(d, nd, k === 'x' ? val : nd.x, k === 'y' ? val : nd.y);
            if (k === 'w' || k === 'h') { nd.fit = false; if (nd.role === 'panel') nd.base = { x: nd.x, y: nd.y, w: nd.w, h: nd.h }; }
            if (nd.h < C.need(d, nd, nd.w) && nd.role !== 'panel') nd.h = C.need(d, nd, nd.w);
          });
          geomChanged(d, list, before);
        }, { source: 'inspector' });
      });
      geo.appendChild(h('label', { attrs: { for: id } }, k.toUpperCase(), inp));
    });

    var arrangeKids = [row('Opacity', range, opId), geo];
    var layer = h('div', { class: 'btn-row layer-row' }); // two by two: one step, then all the way
    [['front', 'Bring forward', 1], ['back', 'Send backward', -1], ['tofront', 'Bring to front', 'front'], ['toback', 'Send to back', 'back']].forEach(function (x) {
      var b = h('button', { type: 'button', class: 'btn btn-sm', dataset: { key: 'z:' + x[0] }, html: U.icon(x[0], 16) + '<span>' + x[1] + '</span>' });
      b.addEventListener('click', function () { LMB.editor.reorder(x[2]); });
      layer.appendChild(b);
    });
    arrangeKids.push(layer);

    if (nodes.length > 1) {
      var al = h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': 'Align' } });
      [['l', 'alignL', 'Align left edges'], ['c', 'alignC', 'Align centers'], ['r', 'alignR', 'Align right edges'], ['t', 'alignT', 'Align tops'], ['m', 'alignM', 'Align middles'], ['b', 'alignB', 'Align bottoms']].forEach(function (x) {
        var b = h('button', { type: 'button', dataset: { key: 'al:' + x[0] }, attrs: { 'aria-label': x[2], title: x[2], 'aria-pressed': 'false' }, html: U.icon(x[1], 16) });
        b.addEventListener('click', function () { align(x[0]); });
        al.appendChild(b);
      });
      var ds = h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': 'Distribute' } });
      [['h', 'distH', 'Distribute horizontally'], ['v', 'distV', 'Distribute vertically']].forEach(function (x) {
        var b = h('button', { type: 'button', dataset: { key: 'ds:' + x[0] }, attrs: { 'aria-label': x[2], title: x[2], 'aria-pressed': 'false', disabled: nodes.length < 3 }, html: U.icon(x[1], 16) });
        b.addEventListener('click', function () { distribute(x[0]); });
        ds.appendChild(b);
      });
      var mw = h('button', { type: 'button', class: 'btn btn-sm', dataset: { key: 'mw' } }, 'Match width');
      var mh = h('button', { type: 'button', class: 'btn btn-sm', dataset: { key: 'mh' } }, 'Match height');
      mw.addEventListener('click', function () { match('w'); });
      mh.addEventListener('click', function () { match('h'); });
      arrangeKids.push(row('Align', al), row('Distribute', ds), h('div', { class: 'btn-row' }, mw, mh));
    }
    out.push(sec('Arrange', arrangeKids));

    var hasOverride = nodes.some(function (n) { return Object.keys(n.style || {}).length || (n.role !== 'free' && n.shape); });
    var rs = h('button', { type: 'button', class: 'btn btn-sm', disabled: !hasOverride, dataset: { key: 'reset' } }, 'Reset style');
    rs.addEventListener('click', function () { setNodes('Reset style', function (nd) { nd.style = {}; if (nd.role !== 'free') nd.shape = null; }); });
    var del = h('button', { type: 'button', class: 'btn btn-sm btn-danger', dataset: { key: 'del' }, html: U.icon('trash', 16) + '<span>Delete</span>' });
    del.addEventListener('click', function () { LMB.editor.deleteSelection(); });
    out.push(sec(null, [h('div', { class: 'btn-row' }, rs, del)]));
    return out;
  }

  function align(how) {
    var nodes = selNodes();
    var x1 = Math.min.apply(null, nodes.map(function (n) { return n.x; })), x2 = Math.max.apply(null, nodes.map(function (n) { return n.x + n.w; }));
    var y1 = Math.min.apply(null, nodes.map(function (n) { return n.y; })), y2 = Math.max.apply(null, nodes.map(function (n) { return n.y + n.h; }));
    S.mutate('Align', function (d) {
      var list = nodes.map(function (n) { return findIn(d, n.id); });
      var before = geomOf(list), skip = idSet(list);
      list.forEach(function (nd) {
        var x = nd.x, y = nd.y;
        if (how === 'l') x = x1; if (how === 'r') x = x2 - nd.w; if (how === 'c') x = (x1 + x2) / 2 - nd.w / 2;
        if (how === 't') y = y1; if (how === 'b') y = y2 - nd.h; if (how === 'm') y = (y1 + y2) / 2 - nd.h / 2;
        moveTo(d, nd, x, y, skip);
      });
      geomChanged(d, list, before);
    }, { source: 'inspector' });
  }
  function distribute(axis) {
    var nodes = selNodes();
    if (nodes.length < 3) return;
    var P = axis === 'h' ? 'x' : 'y', D = axis === 'h' ? 'w' : 'h';
    var sorted = nodes.slice().sort(function (a, b) { return a[P] - b[P]; });
    var start = sorted[0][P], end = Math.max.apply(null, sorted.map(function (n) { return n[P] + n[D]; }));
    var total = sorted.reduce(function (s, n) { return s + n[D]; }, 0);
    var gap = (end - start - total) / (sorted.length - 1);
    S.mutate('Distribute', function (d) {
      var pos = start;
      var list = sorted.map(function (n) { return findIn(d, n.id); });
      var before = geomOf(list), skip = idSet(list);
      list.forEach(function (nd) {
        var v = Math.round(pos * 10) / 10;
        pos += nd[D] + gap;
        moveTo(d, nd, P === 'x' ? v : nd.x, P === 'y' ? v : nd.y, skip);
      });
      geomChanged(d, list, before);
    }, { source: 'inspector' });
  }
  function match(k) {
    var nodes = selNodes();
    var v = Math.max.apply(null, nodes.map(function (n) { return n[k]; }));
    S.mutate(k === 'w' ? 'Match width' : 'Match height', function (d) {
      var list = nodes.map(function (n) { return findIn(d, n.id); });
      var before = geomOf(list);
      list.forEach(function (nd) { nd[k] = v; nd.fit = false; if (k === 'w') nd.h = Math.max(nd.h, C.need(d, nd, nd.w)); });
      geomChanged(d, list, before);
    }, { source: 'inspector' });
  }

  /* ---------- Arrow panel ---------- */
  function edgePanel(edges) {
    var doc = S.doc;
    var styles = edges.map(function (e) { return C.edgeStyle(doc, e); });
    var cs = function (k) { return common(styles, function (s) { return s[k]; }); };
    var out = [];
    out.push(head(edges.length === 1 ? 'Arrow' : edges.length + ' arrows', edges.length === 1 && edges[0].auto ? 'Automatic arrow' : '', true));
    var w = numInput('Width', cs('width'), function (v) { setEdges('Change arrow width', function (e) { e.style.width = v; }, 'insp:ew'); }, { min: 0.5, max: 12, step: 0.5, key: 'ew' });
    out.push(sec('Line', [
      row('Color', colorPicker('Arrow color', cs('color'), function (v, live) { setEdges('Change arrow color', function (e) { e.style.color = v; e.style.fill = v; }, live ? 'insp:ec' : null); }, { key: 'ec' })),
      row('Width', w.el, w.id),
      row('Style', seg('Line style', [{ v: 'solid', label: 'Solid' }, { v: 'dashed', label: 'Dash' }, { v: 'dotted', label: 'Dot' }], cs('dash'), function (v) { setEdges('Change line style', function (e) { e.style.dash = v; }); }, 'edash')),
      row('Look', seg('Arrow look', [{ v: 'line', label: 'Line' }, { v: 'block', label: 'Block' }], cs('look'), function (v) { setEdges('Change arrow look', function (e) { e.style.look = v; }); }, 'elook'))
    ]));
    var route = common(edges, function (e) { return e.route || 'straight'; });
    out.push(sec('Shape', [
      row('Route', seg('Route', [{ v: 'straight', label: 'Straight' }, { v: 'elbow', label: 'Elbow' }, { v: 'curved', label: 'Curved' }], route, function (v) { setEdges('Change route', function (e) { e.route = v; }); }, 'route')),
      row('Heads', seg('Arrowheads', [{ v: 'end', label: '→', title: 'Arrowhead at the end' }, { v: 'start', label: '←', title: 'Arrowhead at the start' }, { v: 'both', label: '↔', title: 'Both ends' }, { v: 'none', label: '—', title: 'No arrowheads' }], cs('head'), function (v) { setEdges('Change arrowheads', function (e) { e.style.head = v; }); }, 'head'))
    ]));
    var lid = fid('label');
    var lab = h('input', { type: 'text', id: lid, dataset: { key: 'label' }, attrs: { placeholder: 'Optional', autocomplete: 'off' } });
    lab.value = common(edges, function (e) { return e.label || ''; }) || '';
    lab.addEventListener('input', function () { var v = lab.value; setEdges('Edit arrow label', function (e) { e.label = v; }, 'insp:label'); });
    out.push(sec('Label', [row('Text', lab, lid)]));
    var rs = h('button', { type: 'button', class: 'btn btn-sm', dataset: { key: 'ereset' } }, 'Reset style');
    rs.addEventListener('click', function () { setEdges('Reset arrow style', function (e) { e.style = {}; }); });
    var del = h('button', { type: 'button', class: 'btn btn-sm btn-danger', dataset: { key: 'edel' }, html: U.icon('trash', 16) + '<span>Delete</span>' });
    del.addEventListener('click', function () { LMB.editor.deleteSelection(); });
    out.push(sec(null, [h('div', { class: 'btn-row' }, rs, del)]));
    return out;
  }

  /* ---------- render ---------- */
  var focusHead = false; // set by showDiagram: focus the heading after the next render
  function render() {
    if (!root) return;
    var active = document.activeElement;
    var hadFocus = !!active && root.contains(active);
    var key = hadFocus && active.dataset ? active.dataset.key : null;
    var scroll = root.scrollTop;
    root.innerHTML = '';
    var nodes = selNodes(), edges = selEdges();
    var parts = nodes.length ? nodePanel(nodes) : edges.length ? edgePanel(edges) : diagramPanel();
    parts.forEach(function (p) { root.appendChild(p); });
    root.scrollTop = scroll;
    // Keep focus on the same control. If it is gone (Delete, Select whole
    // column, a different panel), move it to the panel heading, never <body>.
    var el = key && !focusHead ? root.querySelector('[data-key="' + key.replace(/"/g, '\\"') + '"]') : null;
    if (el) el.focus();
    else if (hadFocus || focusHead) root.querySelector('.insp-head h2').focus();
    focusHead = false;
  }
  var queued = false;
  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; if (S.ui.step === 'design') render(); });
  }

  /** Clear the selection so the Diagram panel shows, and focus its heading. */
  I.showDiagram = function () {
    focusHead = true;
    if (S.selected().length) S.select([], 'inspector'); else render();
  };

  I.init = function (el) {
    root = el;
    // Esc in the panel (outside a text box or menu) goes back to Diagram settings.
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || LMB.app.isTyping(e.target) || !S.selected().length) return;
      e.preventDefault();
      I.showDiagram();
    });
    S.on('select', queue);
    S.on('change', function (ev) {
      var a = document.activeElement;
      // Don't rebuild under a control the student is still typing in or
      // dragging (text and number boxes, sliders, color pickers, menus).
      // A checkbox is done once it changes, so the panel rebuilds as usual.
      var typing = a && root.contains(a) && (a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' ||
        (a.tagName === 'INPUT' && !/^(checkbox|radio|button|submit)$/.test(a.type)));
      if (ev.source === 'inspector' && typing) {
        // Still refresh the page-fit warning, so it never lags behind.
        var fn = root.querySelector('[data-role="fit-note"]');
        if (fn && S.ui.step === 'design') fillFitNote(fn);
        return;
      }
      queue();
    });
    S.on('step', function (ev) { if (ev.step === 'design') render(); });
  };
  I.focus = function (key) { render(); var el = root.querySelector('[data-key="' + key + '"]'); if (el) el.focus(); };
  I.render = render;

  LMB.inspector = I;
})();

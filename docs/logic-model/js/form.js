/* =============================================================================
   form.js — Step 1, "Write": the form students type into, plus the live
   preview beside it.

   Lists are fast to edit:
     Enter            new item below (splits the text at the cursor)
     Backspace        in an empty item deletes it
     Paste            several lines (bullets from Word, "1.", "-" …) become items
     Alt+↑ / Alt+↓    move the item; or focus the grip and use ↑ / ↓; or drag it
   Labels, hints and placeholders come from model.js (SECTIONS / FIELDS).
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, M = LMB.model, S = LMB.store, R = LMB.render, TH = LMB.themes;
  var h = U.h;

  var root, previewEl, previewNote, noteText, noteBtn, fitBtn, checks, starter;
  var lists = {};     // section key -> {wrap, ol, label, toggle}
  var fields = {};    // 'title' | 'problem' | 'theory' -> element

  /* ---------- content mutations ---------- */
  function sec(d, k) { return d.content.sections[k]; }
  function idx(d, k, id) { return sec(d, k).items.findIndex(function (it) { return it.id === id; }); }

  function setItemText(k, id, text) {
    S.mutate('Edit ' + S.doc.content.sections[k].label, function (d) {
      var i = idx(d, k, id);
      if (i < 0 || d.content.sections[k].items[i].text === text) return false;
      d.content.sections[k].items[i].text = text;
    }, { coalesce: 'item:' + id, source: 'form' });
  }

  /*
   * Strip a list marker that comes along when pasting from Word or Docs.
   * A marker only counts when a space or tab follows it, so numbers such as
   * "1.5 FTE", "-10% match" or "12.000 households" are kept as typed.
   *   • - – * ✓ ◆ …   bullets and dashes (also "-->" arrows and Word's
   *                   Symbol-font bullets, which paste as private-use characters)
   *   >               only when no number follows ("> 30%" is a comparison)
   *   o<space> §<tab> Word's second- and third-level bullets
   *   1. 2) (3)       numbers;  a. B) (c)  letters;  ii. iv)  roman numerals
   */
  var MARKER = new RegExp('^\\s*(?:' + [
    '(?:(?:[-–—=]+>|[-–—*•·▪◦‣○●■□➢➤►→⇒✓✔◆◇\\uF000-\\uF0FF])+[ \\t]+)+',
    '>+[ \\t]+(?=[^\\d\\s$.+-])',
    'o[ \\t]+',
    '§\\t+',
    '\\(?\\d{1,3}[.)][ \\t]+',
    '\\(?[ivxIVX]{1,4}[.)][ \\t]+',
    '\\(?[a-zA-Z][.)][ \\t]+'
  ].join('|') + ')');
  function cleanLine(s) {
    return s.replace(MARKER, '').replace(/\s+/g, ' ').trim();
  }
  LMB.cleanPastedLine = cleanLine;

  /* ---------- building the form ---------- */
  function field(key, multiline) {
    var f = M.FIELDS[key];
    var id = 'f-' + key;
    var el = multiline
      ? h('textarea', { id: id, rows: 2, placeholder: f.placeholder, attrs: { 'aria-describedby': 'h-' + key } })
      : h('input', { id: id, type: 'text', placeholder: f.placeholder, attrs: { 'aria-describedby': 'h-' + key, autocomplete: 'off' } });
    el.addEventListener('input', function () {
      var v = el.value;
      S.mutate(key === 'title' ? 'Edit program name' : key === 'problem' ? 'Edit problem statement' : 'Edit program theory', function (d) {
        if (d.content[key] === v) return false;
        d.content[key] = v;
      }, { coalesce: 'field:' + key, source: 'form' });
      if (multiline) grow(el);
    });
    fields[key] = el;
    return h('div', { class: 'field' },
      h('label', { attrs: { for: id }, class: 'field-label' }, f.label, key === 'theory' ? h('span', { class: 'opt' }, 'optional') : null),
      h('p', { class: 'hint', id: 'h-' + key }, key === 'theory' ? 'One sentence: “If … then …”' : f.hint),
      el);
  }

  /** Fit a textarea's height to its text. Skipped while the Write step is
   *  hidden (it would measure 0); setStep('write') calls regrowAll(). */
  function grow(el) {
    if (!el.offsetParent) return;
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 2) + 'px';
  }
  function regrowAll() { if (root) U.$$('textarea', root).forEach(grow); }

  function listSection(k) {
    var meta = M.SECTIONS[k];
    var tok = TH.tokens(S.doc.diagram, k);
    var label = h('input', {
      // Named after the built-in section name, which never changes, so each one is told apart.
      class: 'ls-label', type: 'text', value: '', attrs: { 'aria-label': meta.label + ' section name (you can rename it)', spellcheck: 'false', autocomplete: 'off' }
    });
    label.addEventListener('input', function () {
      var v = label.value;
      S.mutate('Rename section', function (d) { if (sec(d, k).label === v) return false; sec(d, k).label = v; }, { coalesce: 'label:' + k, source: 'form' });
      renderList(k); // the item and button names carry the section name
    });
    label.addEventListener('blur', function () {
      if (U.isBlank(label.value)) {
        S.mutate('Rename section', function (d) { sec(d, k).label = meta.label; }, { source: 'form-label' });
      }
    });
    // A visible way to rename (touch screens have no hover to hint at it).
    var rename = h('button', { type: 'button', class: 'ls-rename', html: U.icon('pencil', 16), attrs: { title: 'Rename section' } });
    rename.addEventListener('click', function () { label.focus(); label.select(); });
    var toggle = null;
    if (meta.optional) {
      var cb = h('input', { type: 'checkbox', id: 'en-' + k, attrs: { 'aria-label': 'Show ' + meta.label + ' in diagram' } });
      cb.addEventListener('change', function () {
        S.mutate(cb.checked ? 'Show intermediate outcomes' : 'Hide intermediate outcomes', function (d) { sec(d, k).enabled = cb.checked; }, { source: 'form-toggle' });
      });
      toggle = h('label', { class: 'switch', attrs: { for: 'en-' + k } }, cb, h('span', { class: 'track', attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'switch-text' }, 'In diagram'));
      toggle.cb = cb;
    }
    var ol = h('ol', { class: 'items', attrs: { 'aria-label': meta.label } });
    // Spoken names carry the section name (renderList keeps them current after a rename).
    var add = h('button', { type: 'button', class: 'add-item', html: U.icon('plus', 16) + '<span>Add item</span>', attrs: { 'aria-label': 'Add item to ' + meta.label } });
    add.addEventListener('click', function () { addItemAfter(k, null, '', true); });
    var group = CONTEXT_OR(k);
    var wrap = h('div', { class: 'list-section ls-' + group, dataset: { section: k } },
      h('div', { class: 'ls-head' }, h('span', { class: 'ls-dot', style: { background: tok.accent }, attrs: { 'aria-hidden': 'true' } }), label, rename, toggle),
      h('p', { class: 'hint', id: 'hint-' + k }, meta.hint),
      ol, add);
    lists[k] = { wrap: wrap, ol: ol, label: label, rename: rename, toggle: toggle, add: add, dot: wrap.querySelector('.ls-dot') };
    return wrap;
  }
  function CONTEXT_OR(k) { return M.CHAIN.indexOf(k) >= 0 ? (TH.PROGRAM.indexOf(k) >= 0 ? 'program' : 'outcome') : (k === 'assumptions' ? 'assumptions' : 'context'); }

  /* ---------- list items ---------- */
  function itemRow(k, it) {
    var ta = h('textarea', { rows: 1, attrs: { spellcheck: 'true', 'aria-describedby': 'hint-' + k } });
    var grip = h('button', { type: 'button', class: 'grip', html: U.icon('grip', 16), attrs: { title: 'Drag to reorder, or press ↑ / ↓' } });
    var del = h('button', { type: 'button', class: 'del', html: U.icon('x', 15) });
    var li = h('li', { class: 'item', dataset: { id: it.id } }, grip, ta, del);
    li.ta = ta;
    ta.value = it.text;

    ta.addEventListener('input', function () { setItemText(k, it.id, ta.value); grow(ta); });
    ta.addEventListener('keydown', function (e) { itemKeydown(e, k, it.id, ta); });
    ta.addEventListener('paste', function (e) { itemPaste(e, k, it.id, ta); });
    del.addEventListener('click', function () { removeItem(k, it.id, 'prev'); });
    grip.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); moveItem(k, it.id, e.key === 'ArrowUp' ? -1 : 1, 'grip'); }
    });
    grip.addEventListener('pointerdown', function (e) { startDrag(e, k, it.id, li); });
    return li;
  }

  function itemKeydown(e, k, id, ta) {
    if (e.isComposing) return;
    var items = S.doc.content.sections[k].items;
    var i = items.findIndex(function (x) { return x.id === id; });
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      var a = ta.selectionStart, b = ta.selectionEnd;
      var before = ta.value.slice(0, a), after = ta.value.slice(b);
      LMB.history.seal();
      S.mutate('Add item', function (d) {
        var list = sec(d, k).items;
        var j = idx(d, k, id);
        if (U.isBlank(before) && !U.isBlank(after)) {
          // Caret at the start: the new blank item goes above, and this item
          // keeps its text (and so its box's style, place and arrows).
          list[j].text = after.replace(/^\s+/, '');
          list.splice(j, 0, M.item(''));
          focusAfter = { id: id, pos: 0 };
          return;
        }
        list[j].text = before.replace(/\s+$/, '');
        list.splice(j + 1, 0, M.item(after.replace(/^\s+/, '')));
        focusAfter = { id: list[j + 1].id, pos: 0 };
      }, { source: 'form-struct' });
      return;
    }
    if (e.key === 'Backspace' && ta.value === '' && items.length > 1) {
      e.preventDefault();
      removeItem(k, id, 'prev');
      return;
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveItem(k, id, e.key === 'ArrowUp' ? -1 : 1, 'text');
      return;
    }
    if (e.key === 'ArrowUp' && ta.selectionStart === 0 && ta.selectionEnd === 0 && i > 0) {
      e.preventDefault(); focusItem(items[i - 1].id, 'end');
    } else if (e.key === 'ArrowDown' && ta.selectionStart === ta.value.length && i < items.length - 1) {
      e.preventDefault(); focusItem(items[i + 1].id, 0);
    }
  }

  /*
   * Paste into a list item.
   *   One plain line          the browser pastes it as usual.
   *   One line with a bullet  or a line break (copied from Word / Docs): the
   *                           cleaned line goes in at the caret.
   *   Several lines           each becomes its own item. They go into the
   *                           current item only if it is empty before the caret;
   *                           otherwise the item keeps its text and the pasted
   *                           lines follow it. Text after the caret becomes the
   *                           last item, as Enter would split it.
   */
  function itemPaste(e, k, id, ta) {
    var text = U.cleanText((e.clipboardData || window.clipboardData).getData('text/plain') || '', true).replace(/\r\n?/g, '\n');
    if (U.isBlank(text)) return;
    var lines = text.split('\n').map(cleanLine).filter(function (s) { return s; });
    var a = ta.selectionStart, b = ta.selectionEnd;
    var head = ta.value.slice(0, a), tail = ta.value.slice(b);
    var startsWithBreak = /^[ \t]*\n/.test(text);
    if (!lines.length) { e.preventDefault(); return; } // only bullets, nothing to add
    var several = lines.length > 1 || (startsWithBreak && !U.isBlank(head));
    if (!several) {
      // Plain single line (no marker, no line break): the browser's own paste is fine.
      if (!/\n/.test(text) && cleanLine(text) === text.replace(/\s+/g, ' ').trim()) return;
      e.preventDefault();
      var v = head + lines[0] + tail;
      ta.value = v;
      try { ta.setSelectionRange(head.length + lines[0].length, head.length + lines[0].length); } catch (err) { /* ignore */ }
      LMB.history.seal();
      setItemText(k, id, v);
      LMB.history.seal();
      grow(ta);
      return;
    }
    e.preventDefault();
    var intoThis = U.isBlank(head) && !startsWithBreak; // first line fills this (empty) item
    LMB.history.seal();
    S.mutate('Paste items', function (d) {
      var list = sec(d, k).items;
      var j = idx(d, k, id);
      list[j].text = intoThis ? lines[0] : head.replace(/\s+$/, '');
      var added = (intoThis ? lines.slice(1) : lines).map(function (t) { return M.item(t); });
      var lastPasted = added.length ? added[added.length - 1] : list[j];
      if (!U.isBlank(tail)) added.push(M.item(tail.replace(/^\s+/, '')));
      Array.prototype.splice.apply(list, [j + 1, 0].concat(added));
      focusAfter = { id: lastPasted.id, pos: 'end' };
    }, { source: 'form-struct' });
    LMB.app && LMB.app.toast('Pasted ' + lines.length + ' items.');
  }

  function addItemAfter(k, afterId, text, focus) {
    LMB.history.seal();
    S.mutate('Add item', function (d) {
      var list = sec(d, k).items;
      // Reuse a trailing empty item instead of stacking blanks.
      if (afterId == null && list.length && U.isBlank(list[list.length - 1].text) && !text) {
        focusAfter = { id: list[list.length - 1].id, pos: 0 };
        return false;
      }
      var j = afterId == null ? list.length - 1 : idx(d, k, afterId);
      var it = M.item(text || '');
      list.splice(j + 1, 0, it);
      focusAfter = { id: it.id, pos: 'end' };
    }, { source: 'form-struct' });
    if (focusAfter) applyFocus();
  }

  function removeItem(k, id, focusDir) {
    var list = S.doc.content.sections[k].items;
    var i = list.findIndex(function (x) { return x.id === id; });
    if (i < 0) return;
    LMB.history.seal();
    if (list.length === 1) {
      S.mutate('Clear item', function (d) { sec(d, k).items[0].text = ''; }, { source: 'form' });
      renderList(k);
      focusItem(id, 0);
      return;
    }
    var target = i > 0 ? list[i - 1].id : list[i + 1].id;
    S.mutate('Delete item', function (d) { sec(d, k).items.splice(idx(d, k, id), 1); }, { source: 'form-struct' });
    focusAfter = { id: target, pos: i > 0 ? 'end' : 0 };
    applyFocus();
  }

  function moveItem(k, id, delta, focusWhat) {
    var list = S.doc.content.sections[k].items;
    var i = list.findIndex(function (x) { return x.id === id; });
    var j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    LMB.history.seal();
    S.mutate('Reorder items', function (d) {
      var l = sec(d, k).items;
      var moved = l.splice(i, 1)[0];
      l.splice(j, 0, moved);
      LMB.layout.restack(d, k); // auto-arrange off: the boxes swap places too
    }, { source: 'form-struct' });
    var li = lists[k].ol.querySelector('[data-id="' + id + '"]');
    if (li) {
      if (focusWhat === 'grip') li.querySelector('.grip').focus();
      else { var ta = li.ta; ta.focus(); }
    }
    announce('Moved to position ' + (j + 1) + ' of ' + list.length);
  }

  /* Drag to reorder with the grip (pointer events: mouse, pen and touch). */
  function startDrag(e, k, id, li) {
    if (e.button !== 0) return;
    e.preventDefault();
    var ol = lists[k].ol;
    var rows = Array.prototype.slice.call(ol.children);
    var start = rows.indexOf(li);
    var rects = rows.map(function (r) { return r.getBoundingClientRect(); });
    var y0 = e.clientY, target = start;
    li.classList.add('dragging');
    li.setPointerCapture(e.pointerId);
    function move(ev) {
      var dy = ev.clientY - y0;
      li.style.transform = 'translateY(' + dy + 'px)';
      var cy = rects[start].top + rects[start].height / 2 + dy;
      // New index = how many other rows sit above the dragged row's center.
      target = 0;
      rects.forEach(function (r, i) { if (i !== start && cy > r.top + r.height / 2) target++; });
      rows.forEach(function (r, i) {
        if (i === start) return;
        var shift = 0;
        if (start < target && i > start && i <= target) shift = -rects[start].height - 6;
        if (start > target && i >= target && i < start) shift = rects[start].height + 6;
        r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
      });
    }
    function up() {
      li.removeEventListener('pointermove', move);
      li.removeEventListener('pointerup', up);
      li.removeEventListener('pointercancel', up);
      rows.forEach(function (r) { r.style.transform = ''; });
      li.classList.remove('dragging');
      if (target !== start) {
        LMB.history.seal();
        S.mutate('Reorder items', function (d) {
          var l = sec(d, k).items;
          var moved = l.splice(start, 1)[0];
          l.splice(target, 0, moved);
          LMB.layout.restack(d, k); // auto-arrange off: the boxes swap places too
        }, { source: 'form-struct' });
      }
    }
    li.addEventListener('pointermove', move);
    li.addEventListener('pointerup', up);
    li.addEventListener('pointercancel', up);
  }

  /* ---------- rendering from the store ---------- */
  var focusAfter = null;
  function applyFocus() {
    if (!focusAfter) return;
    var f = focusAfter;
    focusAfter = null;
    focusItem(f.id, f.pos);
  }
  function focusItem(id, pos) {
    var li = root.querySelector('li.item[data-id="' + id + '"]');
    if (!li) return;
    var ta = li.ta;
    ta.focus();
    var p = pos === 'end' ? ta.value.length : (pos || 0);
    try { ta.setSelectionRange(p, p); } catch (e) { /* ignore */ }
  }

  function renderList(k) {
    var L = lists[k];
    var s = S.doc.content.sections[k];
    var meta = M.SECTIONS[k];
    var existing = {};
    var oldRows = Array.prototype.slice.call(L.ol.children);
    oldRows.forEach(function (li) { existing[li.dataset.id] = li; });
    var keep = {};
    s.items.forEach(function (it) { keep[it.id] = true; });
    // An undo (or the canvas) can remove the row being typed in. Focus then
    // goes to the row above it (else below, else Add item), never <body>.
    var gone = oldRows.filter(function (li) { return !keep[li.dataset.id] && li.contains(document.activeElement); })[0];
    var refocus = null;
    if (gone) {
      var at = oldRows.indexOf(gone), q;
      for (q = at - 1; q >= 0 && !refocus; q--) if (keep[oldRows[q].dataset.id]) refocus = oldRows[q].ta;
      for (q = at + 1; q < oldRows.length && !refocus; q++) if (keep[oldRows[q].dataset.id]) refocus = oldRows[q].ta;
      refocus = refocus || L.add;
    }
    var name = s.label || meta.label;
    s.items.forEach(function (it, i) {
      var li = existing[it.id] || itemRow(k, it);
      if (L.ol.children[i] !== li) L.ol.insertBefore(li, L.ol.children[i] || null);
      if (li.ta.value !== it.text) setValue(li.ta, it.text);
      var n = i + 1;
      li.ta.setAttribute('aria-label', name + ', item ' + n + ' of ' + s.items.length);
      li.ta.placeholder = i === 0 ? meta.placeholder : '';
      li.querySelector('.grip').setAttribute('aria-label', 'Reorder ' + name + ' item ' + n + ' (use the up and down arrow keys)');
      li.querySelector('.del').setAttribute('aria-label', 'Delete ' + name + ' item ' + n);
      li.querySelector('.del').title = 'Delete item';
      requestAnimationFrame(function () { grow(li.ta); });
    });
    Object.keys(existing).forEach(function (id) { if (!keep[id]) existing[id].remove(); });
    if (refocus) {
      refocus.focus();
      if (refocus.tagName === 'TEXTAREA') try { refocus.setSelectionRange(refocus.value.length, refocus.value.length); } catch (e) { /* ignore */ }
    }
    L.ol.setAttribute('aria-label', name);
    L.add.setAttribute('aria-label', 'Add item to ' + name);
    L.rename.setAttribute('aria-label', 'Rename the ' + name + ' section');
    if (L.toggle) L.toggle.cb.setAttribute('aria-label', 'Show ' + name + ' in diagram');
    if (L.label.value !== s.label) setValue(L.label, s.label);
    if (L.toggle) {
      L.toggle.cb.checked = s.enabled !== false;
      L.wrap.classList.toggle('is-off', s.enabled === false);
    }
    if (L.dot) L.dot.style.background = TH.tokens(S.doc.diagram, k).accent;
  }

  /** Set an input's value without losing the caret when it has focus. */
  function setValue(el, v) {
    if (document.activeElement === el) {
      var a = el.selectionStart, b = el.selectionEnd;
      el.value = v;
      try { el.setSelectionRange(Math.min(a, v.length), Math.min(b, v.length)); } catch (e) { /* ignore */ }
    } else el.value = v;
  }

  function renderAll() {
    ['title', 'problem', 'theory'].forEach(function (k) {
      if (fields[k].value !== S.doc.content[k]) setValue(fields[k], S.doc.content[k]);
      if (fields[k].tagName === 'TEXTAREA') grow(fields[k]);
    });
    M.LISTS.forEach(renderList);
  }

  /* ---------- live preview ---------- */
  var previewQueued = null;
  function schedulePreview() {
    if (previewQueued) return;
    previewQueued = setTimeout(function () { previewQueued = null; renderPreview(); }, 60);
  }
  function renderPreview() {
    if (!previewEl || S.ui.step !== 'write') return;
    var doc = S.doc;
    var page = M.page(doc);
    var hasPage = doc.diagram.page !== 'none';
    var b = R.bounds(doc);
    var vb = hasPage ? { x: 0, y: 0, w: page.w, h: page.h } : { x: b.x - 18, y: b.y - 18, w: b.w + 36, h: b.h + 36 };
    var over = LMB.layout.overflows(doc);
    var broken = hasPage && !M.isEmpty(doc) ? LMB.layout.brokenBoxes(doc) : 0;
    if (over) {
      var x1 = Math.min(0, b.x - 12), y1 = Math.min(0, b.y - 12);
      vb = { x: x1, y: y1, w: Math.max(page.w, b.x + b.w + 12) - x1, h: Math.max(page.h, b.y + b.h + 12) - y1 };
    }
    var bg = R.background(doc) || '#ffffff';
    var sheet = hasPage
      ? '<rect class="pv-sheet" x="0" y="0" width="' + page.w + '" height="' + page.h + '" fill="' + bg + '"/>'
      : '<rect class="pv-sheet" x="' + U.n(vb.x) + '" y="' + U.n(vb.y) + '" width="' + U.n(vb.w) + '" height="' + U.n(vb.h) + '" fill="' + bg + '"/>';
    var outline = over ? '<rect x="0" y="0" width="' + page.w + '" height="' + page.h + '" fill="none" stroke="#c24f3d" stroke-width="2" stroke-dasharray="8 6"/>' : '';
    previewEl.innerHTML = '<svg class="pv-svg" viewBox="' + [vb.x, vb.y, vb.w, vb.h].map(U.n).join(' ') + '" role="img" aria-label="Preview of your logic model">' +
      sheet + R.body(doc, { mode: 'preview', labelBg: bg }) + outline + '</svg>';
    // With auto-arrange off, new and reordered boxes keep the student's layout,
    // so say so here too and offer the same Re-arrange as the Design notice.
    var off = !doc.diagram.autoLayout && !M.isEmpty(doc);
    var warn = over || broken;
    noteText.textContent = over
      ? 'The diagram runs past the edge of the page (dashed line). Fit to page makes the text just small enough, or try shorter boxes or a larger page in Design.'
      : broken ? 'Some words are too long for their boxes and are split with a hyphen. Fit to page picks a text size where they fit, or try a larger page in Design.'
        : off ? (hasPage ? M.page(doc).label + '. ' : '') + 'Auto-arrange is off, so your layout stays put.'
          : (hasPage ? M.page(doc).label + '. Rearrange and restyle it in Design.' : 'Rearrange and restyle it in Design.');
    // A button that hides under the keyboard focus hands it to "Design →" beside it.
    var lose = (noteBtn === document.activeElement && !off) || (fitBtn === document.activeElement && !warn);
    noteBtn.hidden = !off;
    fitBtn.hidden = !warn;
    if (lose) document.getElementById('btn-to-design').focus();
    previewNote.classList.toggle('warn', !!warn);
  }

  /*
   * Narrow screens (860 px and under) stack the preview below the whole form,
   * out of sight while typing. A "Preview" pill floats at the bottom of the
   * form and jumps to it; "Back to form" there returns to the field last
   * typed in. Both are hidden by CSS on wider screens, and the pill hides
   * itself once the preview is on screen.
   */
  function buildPreviewJump() {
    var view = root.parentNode, aside = view.querySelector('.write-preview');
    var head = aside.querySelector('.preview-head');
    var lastField = null;
    root.addEventListener('focusin', function (e) { if (/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) lastField = e.target; });
    var smooth = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    // Scroll the Write step itself (never with scrollIntoView, which would
    // also scroll the clipped page around it).
    function scrollTo(el, offset) {
      var top = el.getBoundingClientRect().top - view.getBoundingClientRect().top + view.scrollTop - offset;
      view.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
    }
    var jump = h('button', { type: 'button', class: 'btn btn-primary preview-jump', html: 'Preview <span aria-hidden="true">&darr;</span>' });
    var back = h('button', { type: 'button', class: 'link-btn back-to-form', html: '<span aria-hidden="true">&uarr;</span> Back to form' });
    jump.addEventListener('click', function () { scrollTo(aside, 0); back.focus({ preventScroll: true }); });
    back.addEventListener('click', function () {
      var el = lastField && root.contains(lastField) ? lastField : root;
      scrollTo(el, view.clientHeight / 3);
      if (el !== root) el.focus({ preventScroll: true });
    });
    view.insertBefore(h('div', { class: 'preview-jump-wrap' }, jump), aside);
    head.insertBefore(back, head.firstElementChild); // left of "Live preview"
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        jump.classList.toggle('is-off', es[es.length - 1].isIntersecting);
      }, { root: view }).observe(aside);
    }
  }

  var liveRegion;
  function announce(msg) { if (liveRegion) { liveRegion.textContent = ''; setTimeout(function () { liveRegion.textContent = msg; }, 30); } }

  /* ---------- init ---------- */
  function build(container, preview, note) {
    root = container;
    previewEl = preview;
    previewNote = note;
    noteText = h('span');
    noteBtn = h('button', { type: 'button', class: 'btn btn-sm', hidden: true }, 'Re-arrange');
    noteBtn.addEventListener('click', function () { LMB.editor.rearrange(); });
    fitBtn = h('button', { type: 'button', class: 'btn btn-sm', hidden: true }, 'Fit to page');
    fitBtn.addEventListener('click', function () { LMB.editor.fitToPage(); });
    previewNote.textContent = '';
    previewNote.appendChild(noteText);
    previewNote.appendChild(noteBtn);
    previewNote.appendChild(fitBtn);
    liveRegion = h('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
    var form = h('form', { class: 'lm-form', attrs: { novalidate: true, 'aria-label': 'Logic model content' } });
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    form.appendChild(h('div', { class: 'form-intro' },
      h('h1', null, 'Write your logic model'),
      h('p', null, 'Fill in each part. The diagram draws itself as you type. Press Enter for a new box, and paste a bulleted list to add several at once.')));
    // The worked examples, one quiet line that is always there. (It used to be
    // a box that vanished on the first keystroke, which made the field being
    // typed in jump up under the caret.) Loading one asks before replacing work.
    var exLinks = [];
    LMB.examples.forEach(function (ex, i) {
      // Short name (before any colon) keeps the line to one row on a laptop.
      var b = h('button', { type: 'button', class: 'link-btn', attrs: { 'aria-label': 'Load the example: ' + ex.name } }, ex.name.split(':')[0]);
      b.addEventListener('click', function () { LMB.app.loadExample(ex.id); });
      if (i) exLinks.push(h('span', { class: 'starter-sep', attrs: { 'aria-hidden': 'true' } }, '·'));
      exLinks.push(b);
    });
    starter = h('p', { class: 'starter' }, h('span', null, 'Examples:'), exLinks);
    form.appendChild(starter);

    form.appendChild(h('section', { class: 'fgroup', attrs: { 'aria-labelledby': 'g-start' } },
      h('h2', { id: 'g-start', class: 'fgroup-title' }, h('span', { class: 'step-chip' }, 'A'), 'Start with the problem'),
      field('title', false), field('problem', true), field('theory', true)));

    form.appendChild(h('section', { class: 'fgroup', attrs: { 'aria-labelledby': 'g-chain' } },
      h('h2', { id: 'g-chain', class: 'fgroup-title' }, h('span', { class: 'step-chip' }, 'B'), 'The chain'),
      h('p', { class: 'fgroup-sub' }, 'Resources → activities → outputs → outcomes. Keep each box to a short phrase.'),
      M.CHAIN.map(listSection)));

    form.appendChild(h('section', { class: 'fgroup', attrs: { 'aria-labelledby': 'g-ctx' } },
      h('h2', { id: 'g-ctx', class: 'fgroup-title' }, h('span', { class: 'step-chip' }, 'C'), 'Context'),
      h('p', { class: 'fgroup-sub' }, 'Causes your program doesn’t address, and conditions that change along the way. Drawn as the External influences bar.'),
      M.CONTEXT.map(listSection)));

    form.appendChild(h('section', { class: 'fgroup', attrs: { 'aria-labelledby': 'g-as' } },
      h('h2', { id: 'g-as', class: 'fgroup-title' }, h('span', { class: 'step-chip' }, 'D'), 'Assumptions'),
      listSection('assumptions')));

    checks = h('details', { class: 'checks', attrs: { id: 'check-your-model' } },
      h('summary', null, h('span', null, 'Check your model'), h('span', { class: 'checks-sub' }, 'Questions from class, before you hand it in')),
      h('ol', null, M.CHECKS.map(function (c) { return h('li', null, h('strong', null, c.q), ' ', c.d); })));
    form.appendChild(checks);
    form.appendChild(liveRegion);
    root.appendChild(form);

    renderAll();
    renderPreview();
    buildPreviewJump();

    S.on('change', function (ev) {
      if (ev.source !== 'form') renderAll();
      else M.LISTS.forEach(function (k) { if (lists[k].ol.children.length !== S.doc.content.sections[k].items.length) renderList(k); });
      if (focusAfter) applyFocus();
      schedulePreview();
    });
    // Narrower or wider window: text rewraps, so refit every box.
    window.addEventListener('resize', U.debounce(regrowAll, 150));
  }

  LMB.form = {
    build: build,
    renderPreview: renderPreview,
    regrowAll: regrowAll,
    refresh: function () { renderAll(); renderPreview(); },
    focusItem: focusItem,
    /** Open "Check your model" and bring it into view (Export links here). */
    openChecks: function () {
      if (!checks) return;
      checks.open = true;
      requestAnimationFrame(function () {
        checks.scrollIntoView({ block: 'start', behavior: 'smooth' });
        var sm = checks.querySelector('summary');
        if (sm) sm.focus({ preventScroll: true });
      });
    },
    focusField: function (k) { if (fields[k]) { fields[k].focus(); } }
  };
})();

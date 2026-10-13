/* =============================================================================
   app.js — starts everything: restores the autosaved model, builds the three
   steps, the top bar (step tabs, File menu, undo/redo, save status), dialogs,
   toasts, and app-wide keyboard shortcuts.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, M = LMB.model, S = LMB.store, T = LMB.text;
  var h = U.h, $ = U.$;

  var UI_KEY = 'lmb.ui.v1';
  var app = {};

  /* ---------- toasts (announced to screen readers) ---------- */
  /**
   * app.toast(msg, {action: {label, fn}, timeout})
   * A toast stays while the pointer is over it or it has keyboard focus. If it
   * closes while focused, focus goes back to where it was before.
   * An "Undo" toast (action.fn === S.undo) belongs to the change it reports:
   * its button only undoes that change, and the toast goes away as soon as
   * anything else is changed or undone (so it can never undo the wrong thing).
   * Its button shows the shortcut too, so keyboard users needn't reach it.
   */
  app.toast = function (msg, opts) {
    opts = opts || {};
    var wrap = $('#toasts');
    var before = document.activeElement;
    var el = h('div', { class: 'toast', attrs: { role: 'status' } }, h('span', null, msg));
    var undoOf = opts.action && opts.action.fn === S.undo ? LMB.history.top() : null;
    var off = null; // store listener to drop, for Undo toasts
    function remove() {
      if (!el.parentNode) return;
      var hadFocus = el.contains(document.activeElement);
      clearTimeout(timer);
      if (off) off();
      el.remove();
      if (hadFocus) app.rescueFocus(before);
    }
    if (opts.action) {
      var b = h('button', { type: 'button', class: 'toast-btn' }, opts.action.label);
      if (undoOf) b.appendChild(h('span', { class: 'kbd' }, U.modLabel + 'Z'));
      b.addEventListener('click', function () {
        if (undoOf) { if (LMB.history.top() === undoOf) S.undo(); }
        else opts.action.fn();
        remove();
      });
      el.appendChild(b);
    }
    if (undoOf) {
      off = S.on('change', function () { if (LMB.history.top() !== undoOf) remove(); });
    }
    while (wrap.children.length > 2) wrap.firstChild.dismiss();
    el.dismiss = remove;
    wrap.appendChild(el);
    // Close after a while, but not while hovered or focused.
    var wait = opts.timeout || (opts.action ? 7000 : 3200), timer = null, hold = 0;
    function arm(ms) { clearTimeout(timer); timer = setTimeout(remove, ms); }
    function pause() { hold++; clearTimeout(timer); }
    function resume() { hold = Math.max(0, hold - 1); if (!hold) arm(2500); }
    el.addEventListener('mouseenter', pause);
    el.addEventListener('mouseleave', resume);
    el.addEventListener('focusin', pause);
    el.addEventListener('focusout', function (e) { if (!el.contains(e.relatedTarget)) resume(); });
    arm(wait);
    return el;
  };

  /**
   * Focus went nowhere (a button that was hidden or removed under it): put
   * it on `pref` if that is still on screen, otherwise on the current step's
   * tab, so the next Tab starts from a known place.
   */
  function showing(el) { return el && el !== document.body && el.isConnected && (el.offsetParent !== null || el === document.activeElement && el.getClientRects().length > 0); }
  app.rescueFocus = function (pref) {
    var a = document.activeElement;
    if (a && a !== document.body && showing(a)) return; // focus is fine where it is
    // A panel that re-rendered: the same control in its new copy.
    if (pref && !pref.isConnected && pref.dataset && pref.dataset.key) pref = document.querySelector('[data-key="' + pref.dataset.key.replace(/"/g, '\\"') + '"]');
    if (pref && pref !== document.body && pref.isConnected && pref.offsetParent !== null && !pref.closest('[inert]')) { pref.focus(); return; }
    var tab = $('#tab-' + (S.ui.step || 'write'));
    if (tab) tab.focus();
  };

  /* ---------- dialogs ---------- */
  /**
   * app.dialog({title, body, actions: [{label, value, primary, danger, autofocus}]})
   * resolves with the chosen action's value (or null for Esc / backdrop).
   * Focus starts on the action marked autofocus (else the primary one). While
   * the dialog is open the rest of the page is inert, so clicks, Tab and the
   * app's shortcuts can't reach the work underneath it.
   */
  app.dialog = function (o) {
    return new Promise(function (resolve) {
      var root = $('#dialog-root');
      var prev = document.activeElement;
      var box = h('div', { class: 'dialog', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-title', 'aria-describedby': 'dlg-body' } },
        h('h2', { id: 'dlg-title' }, o.title),
        h('p', { id: 'dlg-body' }, o.body));
      var acts = h('div', { class: 'dialog-actions' });
      var first = null;
      var buttons = (o.actions || [{ label: 'OK', value: true, primary: true }]).map(function (a) {
        var b = h('button', { type: 'button', class: 'btn' + (a.primary ? ' btn-primary' : '') + (a.danger ? ' btn-danger' : '') }, a.label);
        b.addEventListener('click', function () { close(a.value); });
        acts.appendChild(b);
        if (a.autofocus && !first) first = b;
        return b;
      });
      box.appendChild(acts);
      var back = h('div', { class: 'dialog-backdrop' }, box);
      back.addEventListener('mousedown', function (e) { if (e.target === back) close(null); });
      back.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { e.preventDefault(); close(null); }
        if (e.key === 'Tab') { // keep focus inside
          var f = buttons, i = f.indexOf(document.activeElement);
          if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }
      });
      root.appendChild(back);
      $('#app').inert = true;
      $('#toasts').inert = true;
      first = first || buttons.filter(function (b) { return b.classList.contains('btn-primary'); })[0] || buttons[0];
      first.focus();
      function close(v) {
        back.remove();
        if (!root.querySelector('.dialog-backdrop')) { $('#app').inert = false; $('#toasts').inert = false; }
        // Back to where focus was; if that button has gone (a closed menu, a
        // hidden step), the File button or the step tab instead.
        app.rescueFocus(prev && prev.closest && prev.closest('.menu-list') ? $('#btn-file') : prev);
        resolve(v);
      }
    });
  };

  /** Ask before replacing work that has not been saved to a file. */
  function confirmReplace(what) {
    if (!S.hasUnsavedWork()) return Promise.resolve(true);
    // S.replace keeps the old model as a backup in this browser, unless storage is blocked.
    var keep = S.saveState === 'error'
      ? 'You can undo this until you close this tab. Save it as a file to keep a copy.'
      : 'You can undo this, or bring it back later with File → Restore previous model (in this browser only). Save it as a file to keep a copy.';
    return app.dialog({
      title: 'Replace your current logic model?',
      body: what + ' will replace the model you are working on. ' + keep,
      actions: [
        { label: 'Cancel', value: 'cancel', autofocus: true }, // an accidental Enter changes nothing
        { label: 'Save file first', value: 'save' },
        { label: 'Replace', value: 'replace', primary: true }
      ]
    }).then(function (v) {
      if (v === 'save') { app.saveFile(); return true; }
      return v === 'replace';
    });
  }

  /* ---------- file actions ---------- */
  app.fileBase = function () { return 'logic-model-' + U.slug(S.doc.content.title || 'untitled'); };

  app.newDoc = function () {
    return confirmReplace('A new, blank model').then(function (ok) {
      if (!ok) return;
      S.replace(M.newDoc(), 'New model');
      app.setStep('write');
      app.toast('Started a new logic model.');
      setTimeout(function () { LMB.form.focusField('title'); }, 50);
    });
  };

  app.loadExample = function (id) {
    var ex = LMB.examples.filter(function (e) { return e.id === id; })[0];
    if (!ex) return Promise.resolve();
    return confirmReplace('The example').then(function (ok) {
      if (!ok) return;
      S.replace(M.fromContent(ex.content), 'Load example');
      app.rescueFocus(); // in case the focused control was rebuilt by the replace
      app.toast('Loaded the example: ' + ex.name + '.', { action: { label: 'Undo', fn: S.undo } });
    });
  };

  /** File → Restore previous model: swap back the model the last New / Open / example replaced. */
  app.restorePrevious = function () {
    var prev = S.loadPrevious();
    if (!prev) { app.toast('There is no previous model in this browser.'); return Promise.resolve(); }
    return confirmReplace('The previous model').then(function (ok) {
      if (!ok) return;
      S.replace(prev, 'Restore previous model', false);
      app.toast('Restored the previous model.', { action: { label: 'Undo', fn: S.undo } });
    });
  };

  app.saveFile = function () {
    var data = JSON.stringify(S.doc, null, 2);
    U.download(app.fileBase() + '.json', new Blob([data], { type: 'application/json' }));
    S.markFileSaved();
    app.toast('Saved ' + app.fileBase() + '.json to your downloads.');
  };

  app.openFile = function () {
    var input = $('#file-input');
    input.value = '';
    input.click();
  };
  /** Read a project file (File object or text). Changes nothing if it is not valid. */
  app.openText = function (text, name) {
    var doc;
    try { doc = M.migrate(JSON.parse(text)); }
    catch (e) {
      var msg = e instanceof SyntaxError ? 'That file isn’t a Logic Model Builder project (it isn’t readable JSON).' : e.message;
      app.dialog({ title: 'Couldn’t open ' + (name || 'that file'), body: msg + ' Nothing was changed.', actions: [{ label: 'OK', value: true, primary: true }] });
      return Promise.resolve(false);
    }
    return confirmReplace('The opened project').then(function (ok) {
      if (!ok) return false;
      S.replace(doc, 'Open project');
      S.markFileSaved();
      app.toast('Opened ' + (name || 'project') + '.');
      return true;
    });
  };
  function onFileChosen(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () { app.openText(String(reader.result), f.name); };
    reader.onerror = function () { app.toast('Couldn’t read that file.'); };
    reader.readAsText(f);
  }

  /* ---------- steps ---------- */
  var STEPS = ['write', 'design', 'export'];
  app.setStep = function (step, opts) {
    opts = opts || {};
    if (STEPS.indexOf(step) < 0) step = 'write';
    var prevStep = S.ui.step;
    S.ui.step = step;
    STEPS.forEach(function (s) {
      var tab = $('#tab-' + s), view = $('#view-' + s);
      var on = s === step;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
      view.hidden = !on;
    });
    U.storage.set(UI_KEY, { step: step });
    if (step === 'write') { LMB.form.regrowAll(); LMB.form.renderPreview(); }
    if (step === 'design' && LMB.editor) LMB.editor.show();
    if (step === 'export' && LMB.exporter) LMB.exporter.show();
    if (opts.focus) $('#tab-' + step).focus();
    S.emit('step', { step: step, prev: prevStep });
  };

  function bindTabs() {
    STEPS.forEach(function (s, i) {
      var tab = $('#tab-' + s);
      tab.addEventListener('click', function () { app.setStep(s); });
      tab.addEventListener('keydown', function (e) {
        var j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % STEPS.length;
        if (e.key === 'ArrowLeft') j = (i + STEPS.length - 1) % STEPS.length;
        if (e.key === 'Home') j = 0;
        if (e.key === 'End') j = STEPS.length - 1;
        if (j != null) { e.preventDefault(); app.setStep(STEPS[j], { focus: true }); }
      });
    });
    // The button hides with the Write step, so focus moves to the Design tab.
    $('#btn-to-design').addEventListener('click', function () { app.setStep('design', { focus: true }); });
  }

  /* ---------- File menu ---------- */
  function buildFileMenu() {
    var wrap = $('#file-menu');
    var btn = h('button', { type: 'button', class: 'btn btn-ghost btn-sm', id: 'btn-file', attrs: { 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'file-menu-list' }, html: U.icon('file', 16) + '<span>File</span>' + U.icon('chevronDown', 14) });
    var list = h('div', { class: 'menu-list', id: 'file-menu-list', attrs: { role: 'menu', 'aria-label': 'File' } });
    list.hidden = true;
    function item(label, fn, kbd, id) {
      var b = h('button', { type: 'button', class: 'menu-item', id: id || null, attrs: { role: 'menuitem', tabindex: '-1' } }, h('span', null, label), kbd ? h('span', { class: 'kbd' }, kbd) : null);
      // Close first and put focus back on File, so focus never falls to the
      // page when the item hides (dialogs then return to File as well).
      b.addEventListener('click', function () { close(true); fn(); });
      list.appendChild(b);
      return b;
    }
    item('New', app.newDoc, null, 'mi-new');
    item('Open file…', app.openFile, U.modLabel + 'O', 'mi-open');
    item('Save file', app.saveFile, U.modLabel + 'S', 'mi-save');
    var restore = item('Restore previous model', app.restorePrevious, null, 'mi-restore');
    list.appendChild(h('div', { class: 'menu-sep', attrs: { role: 'separator' } }));
    list.appendChild(h('div', { class: 'menu-label', attrs: { 'aria-hidden': 'true' } }, 'Load example'));
    LMB.examples.forEach(function (ex) { item(ex.name, function () { app.loadExample(ex.id); }, null, 'mi-ex-' + ex.id); });
    list.appendChild(h('div', { class: 'menu-sep', attrs: { role: 'separator' } }));
    item('Export…', function () { app.setStep('export', { focus: true }); }, null, 'mi-export');
    wrap.appendChild(btn);
    wrap.appendChild(list);
    function items() { return U.$$('.menu-item', list).filter(function (b) { return !b.disabled; }); }
    function open(focusFirst) {
      restore.disabled = !S.loadPrevious(); // only when there is something to restore
      list.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      if (focusFirst) items()[0].focus();
    }
    function close(refocus) {
      if (list.hidden) return;
      list.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus();
    }
    btn.addEventListener('click', function () { if (list.hidden) open(true); else close(); });
    btn.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); open(true); } });
    list.addEventListener('keydown', function (e) {
      var its = items(), i = its.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); its[(i + 1) % its.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); its[(i - 1 + its.length) % its.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); its[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); its[its.length - 1].focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(true); }
    });
    document.addEventListener('pointerdown', function (e) { if (!wrap.contains(e.target)) close(); });
  }

  /* ---------- undo / redo / status ---------- */
  function bindHistory() {
    var u = $('#btn-undo'), r = $('#btn-redo');
    u.innerHTML = U.icon('undo', 18);
    r.innerHTML = U.icon('redo', 18);
    u.addEventListener('click', function () { S.undo(); });
    r.addEventListener('click', function () { S.redo(); });
    function refresh() {
      var H = LMB.history;
      u.disabled = !H.canUndo();
      r.disabled = !H.canRedo();
      u.title = H.canUndo() ? 'Undo ' + H.undoLabel().toLowerCase() + ' (' + U.modLabel + 'Z)' : 'Undo (' + U.modLabel + 'Z)';
      r.title = H.canRedo() ? 'Redo ' + H.redoLabel().toLowerCase() + ' (' + (U.isMac ? '⇧⌘Z' : 'Ctrl+Y') + ')' : 'Redo';
      u.setAttribute('aria-label', u.title);
      r.setAttribute('aria-label', r.title);
    }
    S.on('change', refresh);
    refresh();
  }
  function bindStatus() {
    var el = $('#save-status'), foot = $('.footer-privacy');
    function set(state) {
      foot.textContent = state === 'error' ? 'Nothing you type is uploaded.' : 'Saved in this browser only. Nothing you type is uploaded.';
      el.classList.toggle('is-saving', state === 'saving');
      el.classList.toggle('is-error', state === 'error' || state === 'stale');
      var text = state === 'error' ? 'Not saved: browser storage is blocked'
        : state === 'stale' ? 'Not saved: changed in another tab'
        : state === 'saving' ? 'Saving…' : 'Saved in this browser';
      el.innerHTML = '<span class="save-text">' + text + '</span>';
      el.title = state === 'error'
        ? 'This browser is not letting the page save. Use File → Save file to keep your work.'
        : state === 'stale' ? 'Another tab saved a newer version. Edit here to choose which version to keep.'
        : 'Your work is saved automatically in this browser on this computer. Nothing is uploaded.';
    }
    // The status line is not a live region (it would talk over the typing
    // after every pause), so the one state a student must hear about, saving
    // being blocked, is said once as a toast. "Changed in another tab" opens
    // its own dialog (bindStale).
    var told = false;
    function tell(state) {
      if (state !== 'error' || told) return;
      told = true;
      app.toast('Not saved: this browser is blocking storage. Use File → Save file to keep your work.', { timeout: 9000 });
    }
    S.on('saveState', function (state) { set(state); tell(state); });
    // Probe once at start. Going through the store keeps its state in step, so
    // later edits don't flash "Saving…" over the warning.
    var ok = U.storage.set('lmb.probe', 1);
    set(ok ? 'saved' : 'error');
    if (!ok) S.setSaveState('error');
  }

  /* ---------- another tab saved a newer version ---------- */
  function bindStale() {
    var asking = false;
    S.on('stale', function () {
      if (asking) return;
      asking = true;
      app.dialog({
        title: 'Changed in another tab',
        body: 'Your logic model was changed in another tab or window. This tab stopped saving so it won’t overwrite that work. Load the newer version here, or keep this version (it will replace the other tab’s changes in this browser).',
        actions: [
          { label: 'Keep this version', value: 'keep' },
          { label: 'Load newer version', value: 'load', primary: true }
        ]
      }).then(function (v) {
        asking = false;
        if (v === 'load') { S.loadNewer(); app.toast('Loaded the newer version.', { action: { label: 'Undo', fn: S.undo } }); }
        else if (v === 'keep') S.keepThisTab();
        // Esc: still paused; the next edit asks again.
      });
    });
  }
  function bindTitle() {
    var base = 'Logic Model Builder · SPS 506';
    function upd() { var t = (S.doc.content.title || '').trim(); document.title = t ? t + ' · ' + base : base; }
    S.on('change', U.debounce(upd, 300));
    upd();
  }

  /*
   * Phones (520 px and narrower): the footer gives its pinned row back to the
   * content. It moves to the end of the Write or Export step's scrolling page,
   * and stays out of the way in Design, where the canvas needs every pixel.
   * Wider screens keep it pinned at the bottom of the window.
   */
  function bindFooter() {
    var foot = $('.footer'), app0 = $('#app');
    var phone = window.matchMedia ? window.matchMedia('(max-width: 520px)') : null;
    function place() {
      var home = phone && phone.matches && S.ui.step !== 'design' ? $('#view-' + S.ui.step) : app0;
      if (foot.parentNode !== home) home.appendChild(foot);
      foot.classList.toggle('in-view', home !== app0);
    }
    S.on('step', place);
    if (phone) {
      if (phone.addEventListener) phone.addEventListener('change', place);
      else if (phone.addListener) phone.addListener(place);
    }
    place();
  }

  /* ---------- shortcuts ---------- */
  function isTyping(t) {
    return t && (t.tagName === 'INPUT' && !/^(checkbox|radio|range|color|button)$/.test(t.type) || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'SELECT');
  }
  app.isTyping = isTyping;
  function bindShortcuts() {
    document.addEventListener('keydown', function (e) {
      if (document.querySelector('.dialog-backdrop')) { // a dialog is open: nothing underneath may change
        if (U.modKey(e) && /^[zyspo]$/i.test(e.key)) e.preventDefault();
        return;
      }
      var mod = U.modKey(e);
      var t = e.target;
      var inEditor = t && t.closest && t.closest('.inline-editor, .composite-editor, .ex-outline');
      if (mod && !e.altKey && (e.key === 'z' || e.key === 'Z') && !inEditor) {
        e.preventDefault();
        if (e.shiftKey) S.redo(); else S.undo();
        return;
      }
      if (mod && !e.altKey && (e.key === 'y' || e.key === 'Y') && !inEditor) { e.preventDefault(); S.redo(); return; }
      if (mod && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); app.saveFile(); return; }
      if (mod && !e.altKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); app.openFile(); return; }
      if (mod && !e.altKey && (e.key === 'p' || e.key === 'P') && LMB.exporter) { e.preventDefault(); LMB.exporter.print(); return; }
    });
  }

  /*
   * Text cleaner for every text box in the app (form fields, list items,
   * section names, canvas editors, inspector labels). Text pasted from a PDF
   * or PowerPoint can carry invisible control characters that break the SVG
   * and PNG exports, so they are removed as they arrive (U.cleanText). This
   * listener runs in the capture phase, before each box's own input handler,
   * so only clean text ever reaches the model.
   */
  function bindTextCleaner() {
    document.addEventListener('input', function (e) {
      var t = e.target;
      if (!t || (t.tagName !== 'TEXTAREA' && !(t.tagName === 'INPUT' && /^(text|search)$/.test(t.type))) || t.readOnly) return;
      if (!U.hasBadChars(t.value)) return;
      var multiline = t.tagName === 'TEXTAREA';
      var caret = t.selectionEnd;
      var before = U.cleanText(t.value.slice(0, caret), multiline);
      t.value = before + U.cleanText(t.value.slice(caret), multiline);
      try { t.setSelectionRange(before.length, before.length); } catch (err) { /* ignore */ }
    }, true);
  }

  /* ---------- boot ---------- */
  function boot() {
    var saved = S.loadAutosave();
    var restored = !!saved && !M.isEmpty(saved.doc);
    S.init(saved ? saved.doc : M.newDoc(), saved ? saved.fileSaved : true);

    LMB.form.build($('#write-form'), $('#write-preview'), $('#preview-note'));
    if (LMB.editor) LMB.editor.init();
    if (LMB.inspector) LMB.inspector.init($('#inspector'));
    if (LMB.exporter) LMB.exporter.init($('#export-main'));

    buildFileMenu();
    bindTabs();
    bindHistory();
    bindStatus();
    bindStale();
    bindTitle();
    bindFooter();
    bindShortcuts();
    bindTextCleaner();
    $('#file-input').addEventListener('change', onFileChosen);

    var ui = U.storage.get(UI_KEY);
    app.setStep(ui && ui.step || 'write');

    // System fonts can finish loading after first paint; measure again once they settle.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        T.clearCache();
        LMB.layout.sync(S.doc);
        S.emit('change', { source: 'fonts' });
      });
    }
    if (restored) app.toast('Welcome back. Your logic model was restored from this browser.');
    document.documentElement.classList.add('ready');
    app.ready = true;
  }

  LMB.app = app;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

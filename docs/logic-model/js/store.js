/* =============================================================================
   store.js — the single source of truth while the app runs.

   store.doc        the logic model being edited (see model.js)
   store.ui         view state that is NOT saved in the file (step, selection…)
   store.mutate()   the ONLY way to change the doc: records undo, re-syncs the
                    diagram with the content, notifies the views, autosaves.

   Autosave writes to this browser's localStorage only. Nothing leaves the
   browser. If storage is blocked (private mode, school policy) the app still
   works; the status line says the work is not being saved.

   Before New / Open / Load example replace unsaved work, that model is copied
   to a one-level backup in this browser (File → Restore previous model).

   Two tabs: when another tab autosaves a different model, this tab goes
   "stale". It stops autosaving (so it can't overwrite the newer work) and
   emits 'stale' so the app can ask which version to keep.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, M = LMB.model, H = LMB.history;

  var KEY = 'lmb.autosave.v1';
  var PREV_KEY = 'lmb.autosave.prev'; // the model the last New / Open / example replaced
  var events = U.emitter();

  var S = {
    doc: null,
    ui: { step: 'write', selection: [], tool: 'select' },
    saveState: 'idle',   // 'saved' | 'saving' | 'error' | 'stale' (another tab saved) | 'idle'
    on: events.on,
    emit: events.emit
  };

  // Doc JSON at the last file save / open / new / example; null = never saved
  // to a file. "Unsaved work" means the doc differs from this.
  var fileHash = null;

  function json() { return JSON.stringify(S.doc); }

  /**
   * Start with a doc (from autosave, or a new one).
   *   fileSaved  false when the doc holds work that was never saved to a file.
   *              The autosave remembers this, so after a reload New / Open /
   *              example still ask before replacing the restored model.
   */
  S.init = function (doc, fileSaved) {
    S.doc = doc;
    LMB.layout.sync(S.doc);
    fileHash = fileSaved === false ? null : json();
    H.clear();
  };

  /**
   * Change the doc.
   *   label     what the undo step is called ("Edit title", "Move")
   *   fn(doc)   makes the change in place
   *   opts.coalesce  key that merges rapid repeats into one undo step
   *   opts.source    who made the change ('form', 'canvas', 'inspector', …)
   *   opts.relayout  re-run automatic layout
   *   opts.history   false to skip undo (rare)
   */
  S.mutate = function (label, fn, opts) {
    opts = opts || {};
    var before = json();
    var res = fn(S.doc);
    if (res === false) return false; // the change function decided nothing changed
    LMB.layout.sync(S.doc, { relayout: opts.relayout });
    var after = json();
    if (after === before) { emitChange(opts, label, false); return false; }
    if (opts.history !== false) H.record(before, label, opts.coalesce);
    emitChange(opts, label, true);
    return true;
  };

  function emitChange(opts, label, changed) {
    // Drop selections of things that no longer exist.
    var ids = {};
    S.doc.diagram.nodes.forEach(function (n) { if (!n.hidden) ids[n.id] = true; });
    S.doc.diagram.edges.forEach(function (e) { if (!e.hidden) ids[e.id] = true; });
    var sel = S.ui.selection.filter(function (id) { return ids[id]; });
    var selChanged = sel.length !== S.ui.selection.length;
    S.ui.selection = sel;
    if (changed) {
      events.emit('change', { label: label, source: opts.source || null });
      scheduleSave();
    }
    if (selChanged) events.emit('select', { source: 'sync' });
  }

  /**
   * Replace the whole doc (New, Open, Load example). Undoable. If the model
   * being replaced has unsaved work, it is also kept as the "previous model"
   * backup in this browser, so it survives closing the tab.
   *   fileSaved  false if the new doc is not a saved file (restoring a backup)
   */
  S.replace = function (doc, label, fileSaved) {
    var before = json();
    if (S.hasUnsavedWork()) U.storage.set(PREV_KEY, { savedAt: new Date().toISOString(), doc: S.doc });
    S.doc = doc;
    LMB.layout.setPendingItem(null);
    LMB.layout.sync(S.doc);
    H.record(before, label || 'Replace');
    H.seal();
    S.ui.selection = [];
    fileHash = fileSaved === false ? null : json();
    events.emit('change', { label: label, source: 'replace' });
    events.emit('select', { source: 'replace' });
    scheduleSave();
  };

  function restore(entry) {
    S.doc = JSON.parse(entry.json);
    LMB.layout.setPendingItem(null);
    LMB.layout.sync(S.doc);
    emitChange({ source: 'history' }, entry.label, true);
  }
  /**
   * Take back the newest undo step as if it never happened: the doc goes back
   * to how it was, and neither Undo nor Redo shows the step. Used when a box
   * added a moment ago is cancelled before it got any text, and when a drag
   * turns into a pinch-zoom. Does nothing (returns false) unless `entry`
   * (from LMB.history.top()) is still the newest step.
   */
  S.discard = function (entry) {
    if (!entry || H.top() !== entry) return false;
    H.drop();
    S.doc = JSON.parse(entry.json);
    LMB.layout.setPendingItem(null);
    LMB.layout.sync(S.doc);
    emitChange({ source: 'discard' }, entry.label, true);
    return true;
  };

  S.undo = function () { var e = H.undo(json()); if (e) restore(e); return !!e; };
  S.redo = function () { var e = H.redo(json()); if (e) restore(e); return !!e; };

  /* ---------- selection ---------- */
  S.select = function (ids, source) {
    ids = (ids || []).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
    if (U.deepEqual(ids, S.ui.selection)) return;
    S.ui.selection = ids;
    events.emit('select', { source: source || null });
  };
  S.selected = function () { return S.ui.selection.slice(); };
  S.node = function (id) {
    var list = S.doc.diagram.nodes;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };
  S.edge = function (id) {
    var list = S.doc.diagram.edges;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  };

  /* ---------- "unsaved work" (for New / Open / example prompts) ---------- */
  S.markFileSaved = function () { fileHash = json(); };
  S.hasUnsavedWork = function () { return !M.isEmpty(S.doc) && json() !== fileHash; };

  /* ---------- previous-model backup (one level) ---------- */
  /** The model the last New / Open / example replaced, or null. */
  S.loadPrevious = function () {
    var raw = U.storage.get(PREV_KEY);
    if (!raw || !raw.doc) return null;
    try { var d = M.migrate(raw.doc); return M.isEmpty(d) ? null : d; } catch (e) { return null; }
  };

  /* ---------- autosave ---------- */
  var saveTimer = null; // set while a save is waiting to happen
  var stale = false;    // another tab saved a newer model; don't overwrite it
  function scheduleSave() {
    if (stale) { events.emit('stale'); return; } // ask again which version to keep
    if (S.saveState !== 'error') setSaveState('saving');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(S.saveNow, 400);
  }
  S.saveNow = function () {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (stale) return false;
    // fileSaved: is this exactly what was last saved to (or opened from) a file?
    var ok = U.storage.set(KEY, { savedAt: new Date().toISOString(), doc: S.doc, fileSaved: json() === fileHash });
    setSaveState(ok ? 'saved' : 'error');
    return ok;
  };
  /** 'saved' | 'saving' | 'error' | 'stale' | 'idle'. The status line listens for 'saveState'. */
  function setSaveState(s) {
    if (S.saveState === s) return;
    S.saveState = s;
    events.emit('saveState', s);
  }
  S.setSaveState = setSaveState;
  /**
   * The autosave from last time as {doc, fileSaved}, or null. Autosaves made
   * before fileSaved was recorded count as not saved to a file, so the app asks.
   */
  S.loadAutosave = function () {
    var raw = U.storage.get(KEY);
    if (!raw || !raw.doc) return null;
    try { return { doc: M.migrate(raw.doc), fileSaved: raw.fileSaved === true }; } catch (e) { return null; }
  };

  /* ---------- another tab saved ---------- */
  S.isStale = function () { return stale; };
  /** Take the other tab's newer model (undoable in this tab). */
  S.loadNewer = function () {
    var saved = S.loadAutosave();
    stale = false;
    if (saved) S.replace(saved.doc, 'Load newer version', saved.fileSaved);
    else S.saveNow();
  };
  /** Keep this tab's model: it becomes the autosave again (the other tab then goes stale). */
  S.keepThisTab = function () {
    stale = false;
    S.saveNow();
  };
  // The browser fires 'storage' in every OTHER tab of this app when one tab writes.
  window.addEventListener('storage', function (e) {
    if (e.key !== KEY || e.newValue == null) return;
    var other;
    try { other = JSON.parse(e.newValue); } catch (err) { return; }
    if (!other || !other.doc || JSON.stringify(other.doc) === json()) return; // same model
    clearTimeout(saveTimer);
    saveTimer = null;
    if (stale) return; // already asking
    stale = true;
    setSaveState('stale');
    events.emit('stale');
  });

  // Flush a waiting save when the tab closes, but only if one is waiting (a tab
  // that merely changed something earlier must not overwrite newer work).
  window.addEventListener('pagehide', function () { if (saveTimer) S.saveNow(); });
  window.addEventListener('beforeunload', function (e) {
    if (saveTimer) S.saveNow();
    // Storage blocked: closing the tab loses work that is not in a file. Ask first.
    if (S.saveState === 'error' && S.hasUnsavedWork()) { e.preventDefault(); e.returnValue = ''; }
  });

  LMB.store = S;
})();

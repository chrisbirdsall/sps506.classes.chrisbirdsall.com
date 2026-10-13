/* =============================================================================
   history.js — undo / redo.

   Every change stores a snapshot (JSON text) of the doc as it was BEFORE the
   change. Docs are small, so snapshots are simple and reliable. Rapid edits to
   the same field (typing) share one undo step, until the typist pauses for
   WINDOW_MS or the burst grows longer than BURST_MS (so one undo never wipes
   out a whole paragraph typed in one go). A drag shares one step for the
   whole gesture (keys starting with "gesture:" never time out).
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var LIMIT = 200;
  var WINDOW_MS = 1500; // a pause this long starts a new undo step
  var BURST_MS = 3000;  // ...and so does typing non-stop for this long

  var past = [], future = [];
  var lastKey = null, lastTime = 0, burstStart = 0;

  LMB.history = {
    /** Record the state before a change. key groups rapid edits into one step. */
    record: function (json, label, key) {
      var now = Date.now();
      if (key && key === lastKey && (key.indexOf('gesture:') === 0 || (now - lastTime < WINDOW_MS && now - burstStart < BURST_MS))) {
        lastTime = now;
        return false;
      }
      past.push({ json: json, label: label || 'Change' });
      if (past.length > LIMIT) past.shift();
      future = [];
      lastKey = key || null;
      lastTime = burstStart = now;
      return true;
    },
    /** End the current typing burst so the next edit starts a new step. */
    seal: function () { lastKey = null; },
    undo: function (currentJson) {
      if (!past.length) return null;
      var e = past.pop();
      future.push({ json: currentJson, label: e.label });
      lastKey = null;
      return e;
    },
    redo: function (currentJson) {
      if (!future.length) return null;
      var e = future.pop();
      past.push({ json: currentJson, label: e.label });
      lastKey = null;
      return e;
    },
    canUndo: function () { return past.length > 0; },
    canRedo: function () { return future.length > 0; },
    undoLabel: function () { return past.length ? past[past.length - 1].label : ''; },
    redoLabel: function () { return future.length ? future[future.length - 1].label : ''; },
    /**
     * Forget the newest undo step without making a redo step (store.discard:
     * a new box cancelled before it got any text, a drag that became a pinch).
     */
    drop: function () { lastKey = null; return past.pop() || null; },
    /** The newest undo step itself (a toast's Undo button checks it is still the newest). */
    top: function () { return past.length ? past[past.length - 1] : null; },
    clear: function () { past = []; future = []; lastKey = null; }
  };
})();

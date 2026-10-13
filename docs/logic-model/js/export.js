/* =============================================================================
   export.js — Step 3, "Export".

   PNG    the export SVG drawn onto a <canvas> at 1×–4× (3× ≈ 300 dpi), with
          its dpi recorded in the file so Word inserts it at true size
   SVG    standalone vector file, width/height in inches
   PDF    the browser's print dialog; a print stylesheet prints only the diagram
   Copy image, Copy table (Figure 3.2-style table for Word / Google Docs),
   plain-text outline (doubles as alt text), and project files (.json).
   Nothing is uploaded anywhere; files are made in the browser.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util, S = LMB.store, R = LMB.render, M = LMB.model, T = LMB.text;
  var h = U.h;

  var X = {};
  var root, previewImg, stage, dimsEl, wordEl, areaNote, emptyCard, outlineEl, previewUrl = null;
  var needsContent = [];   // buttons that stay off while the model is empty
  var OPTS_KEY = 'lmb.export.v1';
  var opts = { scale: 3, background: 'diagram', area: 'drawing' };

  function svgOpts() {
    return { area: opts.area, background: opts.background === 'diagram' ? undefined : opts.background };
  }
  X.options = function () { return U.clone(opts); };
  X.setOptions = function (o) { Object.assign(opts, o || {}); U.storage.set(OPTS_KEY, opts); refresh(); };

  /* ---------- SVG ---------- */
  X.svgString = function (o) {
    var r = R.exportSVG(S.doc, o || svgOpts());
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + r.svg;
  };
  X.downloadSVG = function () {
    U.download(LMB.app.fileBase() + '.svg', new Blob([X.svgString()], { type: 'image/svg+xml' }));
    LMB.app.toast('Saved ' + LMB.app.fileBase() + '.svg.');
  };

  /* ---------- PNG ---------- */
  /** Render the diagram to a PNG Blob. Resolves {blob, width, height}. */
  X.pngBlob = function (o) {
    o = Object.assign({}, svgOpts(), { scale: opts.scale }, o || {});
    var r = R.exportSVG(S.doc, { area: o.area, background: o.background });
    var w = Math.round(r.size.w * o.scale), hgt = Math.round(r.size.h * o.scale);
    // Give the image an explicit pixel size so every browser rasterizes it crisply.
    var svg = r.svg.replace(/^<svg ([^>]*?)width="[^"]*" height="[^"]*"/, '<svg $1width="' + w + '" height="' + hgt + '"');
    var url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        try {
          var cv = document.createElement('canvas');
          cv.width = w; cv.height = hgt;
          var ctx = cv.getContext('2d');
          ctx.drawImage(img, 0, 0, w, hgt);
          URL.revokeObjectURL(url);
          cv.toBlob(function (blob) {
            if (!blob) { reject(new Error('PNG failed')); return; }
            withDpi(blob, 96 * o.scale).then(function (b2) { resolve({ blob: b2, width: w, height: hgt }); });
          }, 'image/png');
        } catch (err) { URL.revokeObjectURL(url); reject(err); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not draw the diagram.')); };
      img.src = url;
    });
  };

  /* Insert a pHYs chunk (pixels per meter) right after IHDR so Word and other
     programs know the image's physical size. */
  var CRC_TABLE = null;
  function crc32(bytes) {
    if (!CRC_TABLE) {
      CRC_TABLE = new Uint32Array(256);
      for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
    }
    var crc = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  function withDpi(blob, dpi) {
    if (!blob.arrayBuffer) return Promise.resolve(blob);
    return blob.arrayBuffer().then(function (buf) {
      var src = new Uint8Array(buf);
      var ihdrEnd = 8 + 4 + 4 + 13 + 4; // signature + IHDR(len, type, data, crc)
      var ppm = Math.round(dpi / 0.0254);
      var chunk = new Uint8Array(4 + 4 + 9 + 4);
      var dv = new DataView(chunk.buffer);
      dv.setUint32(0, 9);
      chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
      dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1;
      dv.setUint32(17, crc32(chunk.subarray(4, 17)));
      var out = new Uint8Array(src.length + chunk.length);
      out.set(src.subarray(0, ihdrEnd), 0);
      out.set(chunk, ihdrEnd);
      out.set(src.subarray(ihdrEnd), ihdrEnd + chunk.length);
      return new Blob([out], { type: 'image/png' });
    }).catch(function () { return blob; });
  }

  X.downloadPNG = function () {
    return X.pngBlob().then(function (r) {
      U.download(LMB.app.fileBase() + '.png', r.blob);
      LMB.app.toast('Saved ' + LMB.app.fileBase() + '.png (' + r.width + ' × ' + r.height + ' px).');
    }).catch(function (e) { LMB.app.toast('Sorry, the PNG could not be made: ' + e.message); });
  };
  X.canCopyImage = function () {
    return !!(window.ClipboardItem && navigator.clipboard && navigator.clipboard.write && window.isSecureContext);
  };
  X.copyImage = function () {
    // Keep the drawing error apart from a clipboard refusal so the message is right.
    var drawErr = null;
    var p = X.pngBlob().then(function (r) { return r.blob; }, function (e) { drawErr = e; throw e; });
    try {
      return navigator.clipboard.write([new window.ClipboardItem({ 'image/png': p })]).then(function () {
        LMB.app.toast('Copied the diagram. Paste it into Word or Google Docs.');
      }, function () {
        LMB.app.toast(drawErr ? 'Sorry, the image could not be made: ' + drawErr.message
          : 'Your browser blocked copying the image. Use Download PNG instead.');
      });
    } catch (e) {
      LMB.app.toast('Your browser can’t copy images. Use Download PNG instead.');
      return Promise.resolve();
    }
  };

  /* ---------- table (Handbook Figure 3.2 style) ---------- */
  X.tableHTML = function () {
    var doc = S.doc, c = doc.content;
    var chain = M.chainOn(doc);
    var n = chain.length;
    var font = T.stack(doc.diagram.fontFamily).replace(/"/g, '\'');
    var cell = 'border:1px solid #8a9aa6;padding:5pt 6pt;vertical-align:top;';
    var head = cell + 'background:#e9eef0;font-weight:bold;text-align:left;';
    var e = U.escHTML;
    var list = function (items) {
      if (!items.length) return '<span style="color:#597287">(none listed)</span>';
      return '<ul style="margin:0;padding-left:14pt">' + items.map(function (it) { return '<li style="margin:0 0 2pt">' + e(it.text.trim()) + '</li>'; }).join('') + '</ul>';
    };
    var rows = [];
    rows.push('<tr><th colspan="' + n + '" style="' + cell + 'background:#102a43;color:#ffffff;text-align:left;font-size:12pt">' + e(M.titleOf(doc)) + '</th></tr>');
    if (!U.isBlank(c.problem)) rows.push('<tr><td colspan="' + n + '" style="' + cell + '"><b>Problem:</b> ' + e(c.problem.trim()) + '</td></tr>');
    if (!U.isBlank(c.theory)) rows.push('<tr><td colspan="' + n + '" style="' + cell + '"><b>Program theory:</b> ' + e(c.theory.trim()) + '</td></tr>');
    rows.push('<tr>' + chain.map(function (k) { return '<th style="' + head + 'width:' + Math.floor(100 / n) + '%">' + e(c.sections[k].label) + '</th>'; }).join('') + '</tr>');
    rows.push('<tr>' + chain.map(function (k) { return '<td style="' + cell + '">' + list(M.filled(doc, k)) + '</td>'; }).join('') + '</tr>');
    M.CONTEXT.concat(['assumptions']).forEach(function (k) {
      var items = M.filled(doc, k);
      if (!items.length) return;
      rows.push('<tr><th style="' + head + '">' + e(c.sections[k].label) + '</th><td colspan="' + (n - 1) + '" style="' + cell + '">' + list(items) + '</td></tr>');
    });
    return '<table style="border-collapse:collapse;width:100%;font-family:' + font + ';font-size:10pt;color:#102a43">' + rows.join('') + '</table>';
  };
  X.copyTable = function () {
    var html = X.tableHTML();
    var text = M.outline(S.doc);
    var done = function () { LMB.app.toast('Copied the table. Paste it into Word or Google Docs.'); };
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write && window.isSecureContext) {
      try {
        return navigator.clipboard.write([new window.ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })]).then(done, function () { return legacyCopyHTML(html) ? done() : LMB.app.toast('Copying was blocked. Use Download table instead.'); });
      } catch (e) { /* fall through */ }
    }
    if (legacyCopyHTML(html)) done(); else LMB.app.toast('Copying was blocked. Use Download table instead.');
    return Promise.resolve();
  };
  function legacyCopyHTML(html) {
    var div = h('div', { attrs: { contenteditable: 'true' }, style: { position: 'fixed', left: '-9999px', top: '0' }, html: html });
    document.body.appendChild(div);
    var range = document.createRange();
    range.selectNodeContents(div);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    sel.removeAllRanges();
    div.remove();
    return ok;
  }
  X.downloadTable = function () {
    var title = M.titleOf(S.doc);
    var page = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>' + U.escHTML(title) + ' – logic model table</title></head><body style="margin:24px">' + X.tableHTML() + '</body></html>';
    U.download(LMB.app.fileBase() + '-table.html', new Blob([page], { type: 'text/html' }));
    LMB.app.toast('Saved the table. Open it, then copy and paste it into your document.');
  };

  /* ---------- text outline ---------- */
  function copyText(text) {
    var ok = function () { LMB.app.toast('Copied the outline.'); };
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(ok, function () { outlineEl.select(); try { document.execCommand('copy'); ok(); } catch (e) { /* ignore */ } });
    }
    outlineEl.focus(); outlineEl.select();
    try { document.execCommand('copy'); ok(); } catch (e) { LMB.app.toast('Select the text and copy it.'); }
    return Promise.resolve();
  }

  /* ---------- print / PDF ---------- */
  /*
   * Fill #print-area with the diagram and set the @page size. Runs before
   * every print: from the Print button, Ctrl/⌘+P, and the browser's own
   * File → Print menu (the 'beforeprint' listener just below).
   * The print stylesheet hides everything else, so without this the page
   * would print blank.
   */
  X.preparePrint = function () {
    if (LMB.editor && LMB.editor.commitEdit) LMB.editor.commitEdit(); // keep text typed in a box
    var area = document.getElementById('print-area');
    var r = R.exportSVG(S.doc, svgOpts());
    var page = M.page(S.doc);
    var size = page.css;
    var pw = page.inW, ph = page.inH;
    if (!size) { // "No page": pick the orientation that fits the drawing
      var land = r.box.w >= r.box.h;
      size = land ? 'letter landscape' : 'letter portrait';
      pw = land ? 11 : 8.5; ph = land ? 8.5 : 11;
    }
    var margin = 0.4;
    var style = document.getElementById('print-page-style');
    if (!style) { style = h('style', { id: 'print-page-style' }); document.head.appendChild(style); }
    style.textContent = '@page { size: ' + size + '; margin: ' + margin + 'in; }';
    var aw = pw - 2 * margin, ah = ph - 2 * margin - 0.05;
    area.innerHTML = r.svg.replace(/^<svg ([^>]*?)width="[^"]*" height="[^"]*"/, '<svg $1width="' + aw + 'in" height="' + ah + 'in" preserveAspectRatio="xMidYMid meet"');
  };
  X.print = function () {
    if (M.isEmpty(S.doc)) { LMB.app.toast('Nothing to print yet. Write your model first.'); return; }
    X.preparePrint();
    setTimeout(function () { window.print(); }, 30);
  };
  window.addEventListener('beforeprint', function () { if (LMB.app && LMB.app.ready) X.preparePrint(); });
  window.addEventListener('afterprint', function () {
    var area = document.getElementById('print-area');
    if (area) area.innerHTML = '';
  });

  /* ---------- the Export step UI ---------- */
  function segCtl(label, key, options) {
    var g = h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': label } });
    options.forEach(function (o) {
      var b = h('button', { type: 'button', dataset: { opt: key, v: String(o.v) }, attrs: { 'aria-pressed': String(opts[key] === o.v), title: o.title || o.label } }, o.label);
      b.addEventListener('click', function () {
        opts[key] = o.v;
        U.storage.set(OPTS_KEY, opts);
        U.$$('[data-opt="' + key + '"]', root).forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.v === String(o.v))); });
        refresh();
      });
      g.appendChild(b);
    });
    return g;
  }
  function btn(label, icon, fn, primary, id, needs) {
    var b = h('button', { type: 'button', id: id || null, class: 'btn' + (primary ? ' btn-primary' : ''), html: U.icon(icon, 17) + '<span>' + U.escHTML(label) + '</span>' });
    b.addEventListener('click', fn);
    if (needs) needsContent.push(b);
    return b;
  }

  /*
   * How big the body text will look once the picture is in a Word document.
   * Word shrinks a picture to fit the text area: 6.5 × 9 in on a portrait
   * Letter page with 1-inch margins, 9 × 6.5 in on a landscape one. Text size
   * in the app is in px; 1 px = 0.75 pt at full size.
   */
  var MIN_PT = 7;   // smaller than this is hard to read on paper
  function wordPt(r, colW, colH) {
    if (!r.inches) return null;
    var fit = Math.min(1, colW / r.inches.w, colH / r.inches.h);
    return Math.round(S.doc.diagram.baseFontSize * 0.75 * r.shrink * fit * 10) / 10;
  }
  /** How much a Whole page export shrinks the drawing to fit (1 = it fits). */
  function pageShrink() {
    if (S.doc.diagram.page === 'none') return 1;
    return R.exportSVG(S.doc, { area: 'page' }).shrink;
  }

  function build() {
    stage = h('div', { class: 'ex-stage' });
    previewImg = h('img', { alt: 'Preview of the exported logic model' });
    stage.appendChild(previewImg);
    dimsEl = h('p', { class: 'ex-dims', attrs: { 'aria-live': 'polite' } });
    wordEl = h('p', { class: 'ex-word' });
    // Empty state: shown instead of the preview until something is written.
    emptyCard = h('div', { class: 'ex-empty', hidden: true },
      h('p', { class: 'ex-empty-title' }, 'Nothing to export yet.'),
      h('p', null, 'Write your logic model first, or start from one of the examples.'),
      h('div', { class: 'ex-actions' },
        btn('Go to Write', 'chevronRight', function () { LMB.app.setStep('write'); }, true, 'ex-go-write'),
        LMB.examples.map(function (ex) { return btn(ex.name, 'file', function () { LMB.app.loadExample(ex.id); }, false, 'ex-ex-' + ex.id); })));
    var left = h('div', { class: 'ex-preview' }, emptyCard, stage, dimsEl, wordEl);

    var opt = h('div', { class: 'ex-card' },
      h('h2', null, 'Export your logic model'),
      h('p', null, 'For a Word document, Download PNG, then use Insert → Pictures. A wide diagram reads best on a landscape page (Layout → Orientation → Landscape).'),
      h('div', { class: 'ex-opts' },
        h('div', { class: 'ex-opt' }, h('span', null, 'Area'), segCtl('Export area', 'area', [{ v: 'drawing', label: 'Drawing', title: 'Just the diagram, trimmed' }, { v: 'page', label: 'Whole page', title: 'The whole page set in Design' }])),
        areaNote = h('p', { class: 'ex-note ex-warn', hidden: true }),
        h('div', { class: 'ex-opt' }, h('span', null, 'Background'), segCtl('Background', 'background', [{ v: 'diagram', label: 'As designed' }, { v: 'white', label: 'White' }, { v: 'transparent', label: 'None' }])),
        h('div', { class: 'ex-opt' }, h('span', null, 'PNG size'), segCtl('PNG scale', 'scale', [{ v: 1, label: '1×' }, { v: 2, label: '2×' }, { v: 3, label: '3×', title: 'About 300 dpi: sharp in print' }, { v: 4, label: '4×' }]))));

    var copyImg = btn('Copy image', 'copy', X.copyImage, false, 'ex-copy-image', true);
    if (!X.canCopyImage()) copyImg.hidden = true;
    // A pointer back to the class checklist at the bottom of the Write form.
    var chk = h('button', { type: 'button', class: 'link-btn', dataset: { key: 'ex-checks' } }, 'Check your model ↗');
    chk.addEventListener('click', function () { LMB.app.setStep('write'); LMB.form.openChecks(); });
    var img = h('div', { class: 'ex-card' }, h('h3', null, 'Image'),
      h('p', { class: 'ex-check' }, 'Before you hand it in: ', chk),
      h('div', { class: 'ex-actions' }, btn('Download PNG', 'download', X.downloadPNG, true, 'ex-png', true), copyImg, btn('Download SVG', 'image', X.downloadSVG, false, 'ex-svg', true), btn('Print / Save as PDF', 'print', X.print, false, 'ex-print', true)));

    var tbl = h('div', { class: 'ex-card' }, h('h3', null, 'Logic model table'),
      h('p', null, 'The same content as a table (like Handbook Figure 3.2) that pastes into Word or Google Docs as a real table.'),
      h('div', { class: 'ex-actions' }, btn('Copy table', 'table', X.copyTable, false, 'ex-copy-table', true), btn('Download table (.html)', 'download', X.downloadTable, false, 'ex-table', true)));

    outlineEl = h('textarea', { class: 'ex-outline', readOnly: true, attrs: { 'aria-label': 'Text outline of the logic model', id: 'ex-outline-text' } });
    var out = h('div', { class: 'ex-card' }, h('h3', null, 'Text outline'),
      h('p', null, 'A plain-text version of the model. Use it as alt text for the image.'),
      outlineEl,
      h('div', { class: 'ex-actions', style: { marginTop: '8px' } }, btn('Copy text', 'copy', function () { copyText(outlineEl.value); }, false, 'ex-copy-outline', true)));

    var proj = h('div', { class: 'ex-card' }, h('h3', null, 'Project file'),
      h('p', null, 'Save a .json file to keep working later or on another computer. It opens only in this tool.'),
      h('div', { class: 'ex-actions' }, btn('Save project (.json)', 'download', LMB.app.saveFile, false, 'ex-save'), btn('Open project…', 'upload', LMB.app.openFile, false, 'ex-open')));

    var right = h('div', { class: 'ex-panel' }, opt, img, tbl, out, proj);
    root.appendChild(left);
    root.appendChild(right);
  }

  var refreshQueued = false;
  function refresh() {
    if (!root || S.ui.step !== 'export') return;
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(function () {
      refreshQueued = false;
      // Empty model: show the empty-state card and switch the export buttons off.
      var empty = M.isEmpty(S.doc);
      emptyCard.hidden = !empty;
      stage.hidden = dimsEl.hidden = wordEl.hidden = empty;
      needsContent.forEach(function (b) { b.disabled = empty; });
      outlineEl.value = empty ? '' : M.outline(S.doc);
      outlineEl.placeholder = empty ? 'The outline appears here once you write your model.' : '';

      // Area buttons: "Whole page" needs a page (Design → Page). With "No page"
      // the drawing is exported, so show Drawing as the pressed one.
      var noPage = S.doc.diagram.page === 'none';
      var area = noPage ? 'drawing' : opts.area;
      var shrink = pageShrink();
      U.$$('[data-opt="area"]', root).forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.v === area));
        if (b.dataset.v !== 'page') return;
        b.disabled = noPage;
        b.title = noPage ? 'No page is set in Design' : shrink < 1 ? 'The diagram is bigger than the page, so it is shrunk to fit' : 'The whole page set in Design';
      });
      areaNote.hidden = empty || shrink >= 1;
      areaNote.textContent = 'The diagram runs past the page. Whole page (and printing) shrinks it to ' + Math.round(shrink * 100) +
        '% to fit. To keep full size, make it fit in Design (a larger page, smaller text, or shorter boxes).';
      if (empty) return;

      var r = R.exportSVG(S.doc, svgOpts());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      previewUrl = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml;charset=utf-8' }));
      previewImg.src = previewUrl;
      previewImg.style.width = Math.min(r.size.w, 1400) + 'px';
      stage.classList.toggle('checker', !r.background);
      var pw = Math.round(r.size.w * opts.scale), ph = Math.round(r.size.h * opts.scale);
      var inch = r.inches ? (Math.round(r.inches.w * 100) / 100) + ' × ' + (Math.round(r.inches.h * 100) / 100) + ' in' : '';
      dimsEl.textContent = 'PNG: ' + pw.toLocaleString() + ' × ' + ph.toLocaleString() + ' px' + (inch ? ' · ' + inch + ' at ' + (96 * opts.scale) + ' dpi' : '') +
        (r.overflow ? ' · shrunk to ' + Math.round(r.shrink * 100) + '% to fit the page' : '');

      // Text size once it is in Word (see wordPt above).
      var por = wordPt(r, 6.5, 9), land = wordPt(r, 9, 6.5);
      var warn = por != null && por < MIN_PT;
      wordEl.classList.toggle('ex-warn', warn);
      wordEl.textContent = por == null ? '' : 'In Word, body text will be about ' + por.toFixed(1) + ' pt on a portrait page and ' + land.toFixed(1) + ' pt on a landscape page.' +
        (!warn ? '' : land >= MIN_PT ? ' Use a landscape page (Layout → Orientation): text under ' + MIN_PT + ' pt is hard to read.'
          : ' Text under ' + MIN_PT + ' pt is hard to read: in Design, raise Text size if the page has room, or shorten the boxes.');
    });
  }

  X.init = function (el) {
    root = el;
    var saved = U.storage.get(OPTS_KEY);
    if (saved && typeof saved === 'object') {
      if ([1, 2, 3, 4].indexOf(saved.scale) >= 0) opts.scale = saved.scale;
      if (['diagram', 'white', 'transparent'].indexOf(saved.background) >= 0) opts.background = saved.background;
      if (['drawing', 'page'].indexOf(saved.area) >= 0) opts.area = saved.area;
    }
    build();
    S.on('change', refresh);
  };
  X.show = function () { refresh(); };

  LMB.exporter = X;
})();

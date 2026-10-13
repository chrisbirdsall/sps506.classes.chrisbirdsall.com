/* =============================================================================
   themes.js — COLOR THEMES for the diagram.

   To add or change a theme, edit THEMES below. Each theme gives:
     ink / muted          main and secondary text
     paper                the "theme paper" page background
     arrow, bracket       arrow color; Control/Influence bracket color
     program / outcome    colors for the two halves of the chain:
        accent  border + header color      wash  panel background
        tint    item box fill              line  item box border
     sections (optional)  per-column colors (overrides program/outcome)
     problem, context, assumptions, free, note   the other boxes

   The Custom theme (id 'custom') is built from six colors a student picks;
   see buildCustom below.

   Text colors are checked automatically: header text is darkened until it
   meets WCAG AA (4.5:1) against its box, and text on solid chips picks white
   or ink, whichever reads better (see tokens() at the bottom).
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util;

  var PROGRAM = ['inputs', 'activities', 'outputs'];
  var OUTCOME = ['shortTerm', 'intermediate', 'longTerm'];

  var THEMES = {
    sps506: {
      name: 'SPS 506',
      ink: '#102a43', muted: '#597287', paper: '#f7f4ed', arrow: '#102a43', bracket: '#c24f3d',
      program: { accent: '#176b87', wash: '#ffffff', tint: '#edf3f5', line: '#bfd5dd' },
      outcome: { accent: '#e5ad3d', wash: '#fff8e8', tint: '#ffffff', line: '#eed39c' },
      problem: { fill: '#e9eef0', stroke: '#597287', label: '#176b87' },
      context: { fill: '#102a43', text: '#f7f4ed', label: '#e5ad3d' },
      assumptions: { fill: '#f7f4ed', stroke: '#597287', label: '#102a43' },
      free: { fill: '#ffffff', stroke: '#102a43' },
      note: { fill: '#fff4d6', stroke: '#d9b45a' }
    },
    grayscale: {
      name: 'Grayscale',
      ink: '#1a1a1a', muted: '#555555', paper: '#f4f4f2', arrow: '#1a1a1a', bracket: '#3a3a3a',
      program: { accent: '#3d3d3d', wash: '#ffffff', tint: '#f0f0f0', line: '#b8b8b8' },
      outcome: { accent: '#7a7a7a', wash: '#f2f2f2', tint: '#ffffff', line: '#bdbdbd' },
      problem: { fill: '#e8e8e8', stroke: '#5c5c5c', label: '#1a1a1a' },
      context: { fill: '#2b2b2b', text: '#ffffff', label: '#e0e0e0' },
      assumptions: { fill: '#fafafa', stroke: '#6b6b6b', label: '#1a1a1a' },
      free: { fill: '#ffffff', stroke: '#1a1a1a' },
      note: { fill: '#f2f2f2', stroke: '#8a8a8a' }
    },
    colorblind: {
      name: 'Colorblind-safe',
      // Okabe & Ito (2008) palette: blue #0072B2, orange #E69F00, sky #56B4E9,
      // bluish green #009E73, vermillion #D55E00, yellow #F0E442.
      ink: '#1d2731', muted: '#4f5b66', paper: '#f6f7f4', arrow: '#1d2731', bracket: '#D55E00',
      program: { accent: '#0072B2', wash: '#ffffff', tint: '#e9f3fa', line: '#a9cce5' },
      outcome: { accent: '#E69F00', wash: '#fff7e6', tint: '#ffffff', line: '#f0cb7a' },
      problem: { fill: '#eaf5fb', stroke: '#56B4E9', label: '#005b8f' },
      context: { fill: '#1d2731', text: '#ffffff', label: '#F0E442' },
      assumptions: { fill: '#effaf6', stroke: '#009E73', label: '#1d2731' },
      free: { fill: '#ffffff', stroke: '#1d2731' },
      note: { fill: '#fdf9d8', stroke: '#c9bd3c' }
    },
    columns: {
      name: 'Column colors',
      ink: '#1f2a36', muted: '#56636f', paper: '#f7f6f2', arrow: '#3a4652', bracket: '#b03a2e',
      program: { accent: '#2f7f8f', wash: '#ffffff', tint: '#ffffff', line: '#cfd8dc' },
      outcome: { accent: '#c9822b', wash: '#ffffff', tint: '#ffffff', line: '#cfd8dc' },
      // One harmonious hue per column (teal → blue → violet → terracotta → amber → green).
      sections: {
        inputs: { accent: '#2f7f8f' },
        activities: { accent: '#3d5a9e' },
        outputs: { accent: '#6b4c9a' },
        shortTerm: { accent: '#b8553f' },
        intermediate: { accent: '#c47f22' },
        longTerm: { accent: '#4f8a3c' }
      },
      problem: { fill: '#eef1f4', stroke: '#7a8894', label: '#3d5a9e' },
      context: { fill: '#24323f', text: '#ffffff', label: '#f2c14e' },
      assumptions: { fill: '#f6f6f2', stroke: '#8a8f94', label: '#1f2a36' },
      free: { fill: '#ffffff', stroke: '#1f2a36' },
      note: { fill: '#fff4d6', stroke: '#d9b45a' }
    },
    boise: {
      name: 'Boise State',
      // Official Boise State colors (boisestate.edu/brand): Blue #0033A0 (PMS 286),
      // Orange #D64309 (PMS 172), accent navy #001F60, lightest gray #F6F7F9.
      ink: '#001f60', muted: '#4d5b7c', paper: '#f6f7f9', arrow: '#001f60', bracket: '#d64309',
      program: { accent: '#0033a0', wash: '#ffffff', tint: '#ebf0f9', line: '#b3c2e3' },
      outcome: { accent: '#d64309', wash: '#fdf1ec', tint: '#ffffff', line: '#f0b9a3' },
      problem: { fill: '#f6f7f9', stroke: '#0033a0', label: '#0033a0' },
      context: { fill: '#001f60', text: '#ffffff', label: '#ffb38f' },
      assumptions: { fill: '#f6f7f9', stroke: '#4d5b7c', label: '#001f60' },
      free: { fill: '#ffffff', stroke: '#001f60' },
      note: { fill: '#fdf1ec', stroke: '#e58a64' }
    },
    boiseBlue: {
      name: 'Boise State blue',
      // Blue throughout, with Boise State orange kept to small accents (brackets).
      ink: '#001f60', muted: '#4d5b7c', paper: '#f6f7f9', arrow: '#0033a0', bracket: '#d64309',
      program: { accent: '#0033a0', wash: '#ffffff', tint: '#ffffff', line: '#b3c2e3' },
      outcome: { accent: '#001f60', wash: '#eef1f8', tint: '#ffffff', line: '#a7b2cc' },
      problem: { fill: '#ebf0f9', stroke: '#0033a0', label: '#0033a0' },
      context: { fill: '#f6f7f9', text: '#001f60', label: '#d64309' },
      assumptions: { fill: '#ffffff', stroke: '#0033a0', label: '#001f60' },
      free: { fill: '#ffffff', stroke: '#001f60' },
      note: { fill: '#fdf1ec', stroke: '#e58a64' }
    },
    forest: {
      name: 'Forest',
      ink: '#1e2b22', muted: '#56645a', paper: '#f5f3ec', arrow: '#2d3b30', bracket: '#9c4a2f',
      program: { accent: '#2f6b4f', wash: '#ffffff', tint: '#ecf3ee', line: '#b7d0c1' },
      outcome: { accent: '#8a6d2b', wash: '#f8f3e6', tint: '#ffffff', line: '#dccb9e' },
      problem: { fill: '#e9efe9', stroke: '#56645a', label: '#2f6b4f' },
      context: { fill: '#24382c', text: '#f5f3ec', label: '#e2c77a' },
      assumptions: { fill: '#f5f3ec', stroke: '#56645a', label: '#1e2b22' },
      free: { fill: '#ffffff', stroke: '#1e2b22' },
      note: { fill: '#f8f0d8', stroke: '#c9ad62' }
    },
    plum: {
      name: 'Plum',
      ink: '#2a1f33', muted: '#62566e', paper: '#f7f4f6', arrow: '#2a1f33', bracket: '#b0476a',
      program: { accent: '#5b3c88', wash: '#ffffff', tint: '#f1edf7', line: '#cbbde0' },
      outcome: { accent: '#2f7d7a', wash: '#ecf6f5', tint: '#ffffff', line: '#a8d2cf' },
      problem: { fill: '#f1edf7', stroke: '#62566e', label: '#5b3c88' },
      context: { fill: '#2a1f33', text: '#ffffff', label: '#f0b6c9' },
      assumptions: { fill: '#f7f4f6', stroke: '#62566e', label: '#2a1f33' },
      free: { fill: '#ffffff', stroke: '#2a1f33' },
      note: { fill: '#fbeef2', stroke: '#d99ab0' }
    },
    contrast: {
      name: 'Bold / high contrast',
      ink: '#000000', muted: '#2b2b2b', paper: '#ffffff', arrow: '#000000', bracket: '#b3001b',
      strokeScale: 1.35,
      program: { accent: '#00457c', wash: '#ffffff', tint: '#ffffff', line: '#000000' },
      outcome: { accent: '#8a3b00', wash: '#fff5ec', tint: '#ffffff', line: '#000000' },
      problem: { fill: '#ffffff', stroke: '#000000', label: '#00457c' },
      context: { fill: '#000000', text: '#ffffff', label: '#ffd23f' },
      assumptions: { fill: '#ffffff', stroke: '#000000', label: '#000000' },
      free: { fill: '#ffffff', stroke: '#000000' },
      note: { fill: '#fff3b0', stroke: '#000000' }
    }
  };

  /* ---------------------------------------------------------------------------
     CUSTOM THEME. A student picks six colors (CUSTOM_KEYS); everything else
     (box fills, borders, washes) is mixed from them. They live in the project
     as doc.diagram.custom, so they save, undo and travel with the .json file.
     ------------------------------------------------------------------------ */
  var CUSTOM_KEYS = [
    ['program', 'Program'], ['outcome', 'Outcomes'], ['ink', 'Text and arrows'],
    ['bracket', 'Brackets'], ['context', 'Influences box'], ['paper', 'Page paper']
  ];
  /** The six key colors of a preset theme: where a custom theme starts. */
  function keyColors(id) {
    var th = THEMES[id] || THEMES.sps506;
    return { program: th.program.accent, outcome: th.outcome.accent, ink: th.ink, bracket: th.bracket, context: th.context.fill, paper: th.paper };
  }
  var DEFAULT_CUSTOM = keyColors('sps506');
  /** A clean set of custom colors (bad or missing values fall back to the defaults). */
  function cleanCustom(c) {
    var out = {};
    CUSTOM_KEYS.forEach(function (k) {
      var v = c && U.parseColor(c[k[0]]);
      out[k[0]] = v ? U.toHex(v) : DEFAULT_CUSTOM[k[0]];
    });
    return out;
  }
  /** Lighten a page color until `fg` reads on it (AA) and it is light enough to be a page. */
  function lightenFor(bg, fg) {
    for (var t = 0; t <= 1.001; t += 0.05) {
      var c = U.mix(bg, '#ffffff', t);
      if (U.contrast(fg, c) >= 4.5 && U.luminance(c) >= 0.8) return c;
    }
    return '#ffffff';
  }
  /** A solid box color and the text on it: white or ink, and the box darkened if neither reads. */
  function solidWithText(fill, ink) {
    if (U.contrast('#ffffff', fill) >= 4.5) return { fill: fill, text: '#ffffff' };
    if (U.contrast(ink, fill) >= 4.5) return { fill: fill, text: ink };
    for (var t = 0.05; t <= 1.001; t += 0.05) {
      var c = U.mix(fill, '#000000', t);
      if (U.contrast('#ffffff', c) >= 4.5) return { fill: c, text: '#ffffff' };
    }
    return { fill: '#000000', text: '#ffffff' };
  }
  function buildCustom(raw) {
    var c = cleanCustom(raw);
    var W = '#ffffff';
    var progTint = U.mix(c.program, W, 0.92), outWash = U.mix(c.outcome, W, 0.9);
    // Body text sits on white, tints and washes: keep it dark enough for AA.
    var ink = U.ensureContrast(c.ink, [W, progTint, outWash], 4.5);
    var paper = lightenFor(c.paper, ink);
    var muted = U.ensureContrast(U.mix(ink, W, 0.35), [W, paper], 4.5);
    var ctx = solidWithText(c.context, ink);
    return {
      name: 'Custom',
      ink: ink, muted: muted, paper: paper, arrow: ink, bracket: c.bracket,
      program: { accent: c.program, wash: W, tint: progTint, line: U.mix(c.program, W, 0.65) },
      outcome: { accent: c.outcome, wash: outWash, tint: W, line: U.mix(c.outcome, W, 0.6) },
      problem: { fill: U.mix(c.program, W, 0.88), stroke: U.mix(c.program, ink, 0.3), label: c.program },
      context: { fill: ctx.fill, text: ctx.text, label: c.outcome },
      assumptions: { fill: U.mix(paper, W, 0.5), stroke: muted, label: ink },
      free: { fill: W, stroke: ink },
      note: { fill: U.mix(c.outcome, W, 0.85), stroke: U.mix(c.outcome, W, 0.45) }
    };
  }

  /**
   * Every lookup takes either a theme id or a diagram (doc.diagram). Pass the
   * diagram wherever there is one: the Custom theme's colors live on it.
   */
  function resolve(x) {
    if (x && typeof x === 'object') {
      if (x.theme === 'custom') {
        var c = cleanCustom(x.custom);
        return { id: 'custom', key: 'custom:' + JSON.stringify(c), theme: buildCustom(c) };
      }
      x = x.theme;
    }
    if (x === 'custom') return { id: 'custom', key: 'custom:default', theme: buildCustom(null) };
    var id = THEMES[x] ? x : 'sps506';
    return { id: id, key: id, theme: THEMES[id] };
  }

  var SECTION_WORD = { inputs: 'inputs', activities: 'activities', outputs: 'outputs', shortTerm: 'short-term', intermediate: 'intermediate', longTerm: 'long-term' };

  /**
   * An everyday name for a hex color ("Teal", "Pale gold", "Dark blue",
   * "Off-white"), from its hue, saturation and lightness. Rough on purpose:
   * it is for the color pickers' spoken names, not for matching paint chips.
   */
  function colorName(hex) {
    var rgb = U.parseColor(hex);
    if (!rgb) return hex;
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    var s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (l > 0.985) return 'White';
    if (d < 0.04 || s < 0.1) return l > 0.9 ? 'Off-white' : l > 0.7 ? 'Light gray' : l > 0.35 ? 'Gray' : l > 0.12 ? 'Dark gray' : 'Black';
    if (l > 0.93 && d < 0.025) return 'Off-white';
    var hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue *= 60;
    var name = hue < 12 || hue >= 345 ? 'red' : hue < 40 ? 'orange' : hue < 52 ? 'gold' : hue < 68 ? 'yellow' : hue < 160 ? 'green' :
      hue < 200 ? 'teal' : hue < 250 ? 'blue' : hue < 290 ? 'violet' : 'pink';
    if (s < 0.3 && l < 0.7) name = 'slate';
    var prefix = l > 0.8 ? 'pale ' : l < 0.25 ? 'dark ' : '';
    if (name === 'blue' && l < 0.25) { name = 'navy'; prefix = ''; }
    if (prefix === 'pale ' && /orange|gold|yellow/.test(name)) { name = 'cream'; prefix = ''; }
    name = prefix + name;
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  var cache = {};
  var cacheSize = 0;
  /**
   * Resolved colors for one theme (+ optional section): the place every
   * diagram color is read from. `which` is a theme id or a diagram.
   */
  function tokens(which, sectionKey) {
    var r = resolve(which);
    var key = r.key + '|' + (sectionKey || '');
    if (cache[key]) return cache[key];
    // Dragging a custom color makes a new theme on every step: don't keep them all.
    if (++cacheSize > 400) { cache = {}; cacheSize = 1; }
    var th = r.theme;
    var group = OUTCOME.indexOf(sectionKey) >= 0 ? th.outcome : th.program;
    var own = (th.sections && th.sections[sectionKey]) || {};
    var accent = own.accent || group.accent;
    var hasOwn = !!own.accent;
    var wash = own.wash || (hasOwn ? U.mix(accent, '#ffffff', 0.93) : group.wash);
    var tint = own.tint || (hasOwn ? '#ffffff' : group.tint);
    var line = own.line || (hasOwn ? U.mix(accent, '#ffffff', 0.62) : group.line);
    var t = {
      theme: th,
      accent: accent,
      wash: wash,
      tint: tint,
      line: line,
      // Text in the accent color (headers): darkened until AA on wash + tint + white.
      // (Also on the theme paper: structure labels sit on the page.)
      text: U.ensureContrast(accent, [wash, tint, '#ffffff', th.paper], 4.5),
      chip: accent, // solid header chip (Columns template) …
      on: '#ffffff' // … and the text on it (fixed up below for AA)
    };
    if (U.contrast('#ffffff', accent) < 4.5) {
      if (U.contrast(th.ink, accent) >= 4.5) t.on = th.ink;
      else t.chip = U.ensureContrast(accent, '#ffffff', 4.5); // darken the chip so white text passes
    }
    cache[key] = t;
    return t;
  }

  LMB.themes = {
    THEMES: THEMES,
    PROGRAM: PROGRAM,
    OUTCOME: OUTCOME,
    CUSTOM_KEYS: CUSTOM_KEYS,
    /** Every theme a diagram can use: the presets, then Custom. */
    ids: function () { return Object.keys(THEMES).concat('custom'); },
    valid: function (id) { return !!THEMES[id] || id === 'custom'; },
    get: function (which) { return resolve(which).theme; },
    tokens: tokens,
    keyColors: keyColors,
    cleanCustom: cleanCustom,
    /**
     * Swatches offered in the color pickers for this theme, as
     * {value: '#176b87', name: 'Teal (program)'}. The name is what a screen
     * reader says for the swatch: a plain color word plus what the theme
     * uses that color for.
     */
    swatches: function (which) {
      var th = resolve(which).theme;
      var list = [['#ffffff', ''], [th.paper, 'page'], [th.ink, 'text'], [th.muted, 'light text'],
        [th.program.accent, 'program'], [th.program.tint, 'program boxes'], [th.outcome.accent, 'outcomes'],
        [th.outcome.wash, 'outcome panels'], [th.bracket, 'brackets'], [th.problem.fill, 'problem box']];
      if (th.sections) Object.keys(th.sections).forEach(function (k) { list.push([th.sections[k].accent, SECTION_WORD[k] + ' column']); });
      var seen = {};
      return list.filter(function (c) { var v = c[0].toLowerCase(); if (seen[v]) return false; seen[v] = 1; return true; })
        .map(function (c) { var nm = colorName(c[0]); return { value: c[0], name: c[1] ? nm + ' (' + c[1] + ')' : nm }; });
    },
    colorName: colorName
  };
})();

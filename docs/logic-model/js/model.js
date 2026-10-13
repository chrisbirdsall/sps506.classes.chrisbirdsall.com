/* =============================================================================
   model.js — the shape of a saved logic model ("doc"), section labels and
   HINTS, page sizes, and the migrate() hook that upgrades older saved files.

   A doc is plain JSON:
     doc.content  — what students type in Step 1 (Write)
     doc.diagram  — how it is drawn in Step 2 (Design): template, theme, the
                    position/size/style of every box (nodes) and arrow (edges)

   HINTS AND LABELS for every field are in SECTIONS and FIELDS below.
   ========================================================================== */
(function () {
  'use strict';
  var LMB = window.LMB;
  var U = LMB.util;

  var APP = 'sps506-logic-model-builder';
  var SCHEMA = 1;

  /** The six links of the chain, in order. */
  var CHAIN = ['inputs', 'activities', 'outputs', 'shortTerm', 'intermediate', 'longTerm'];
  var CONTEXT = ['antecedent', 'mediating'];
  var LISTS = CHAIN.concat(CONTEXT, ['assumptions']);

  /**
   * Section labels, one-line hints, and placeholder examples.
   * Outcome and context hints are the lecture's definitions, verbatim.
   */
  var SECTIONS = {
    inputs: {
      label: 'Resources (inputs)',
      hint: 'What the program uses: staff, money, partners, facilities, data.',
      placeholder: 'e.g., Two part-time outreach staff'
    },
    activities: {
      label: 'Activities',
      hint: 'What the program does with its resources. Start with a verb.',
      placeholder: 'e.g., Train volunteer tutors'
    },
    outputs: {
      label: 'Outputs',
      hint: 'Countable products of the activities: what was delivered, to whom, how many.',
      placeholder: 'e.g., Tutoring sessions held'
    },
    shortTerm: {
      label: 'Short-term outcomes',
      hint: 'Most immediate and measurable results.',
      placeholder: 'e.g., Students know how to ask for help'
    },
    intermediate: {
      label: 'Intermediate outcomes',
      hint: 'More distant, though anticipated, results.',
      placeholder: 'e.g., Students attend school more often',
      optional: true
    },
    longTerm: {
      label: 'Long-term outcomes',
      hint: 'Desired outcomes of long-term implementation, dependent on conditions beyond the scope of the program.',
      placeholder: 'e.g., More students graduate on time'
    },
    antecedent: {
      label: 'Antecedent factors',
      hint: 'What the program starts out with: client characteristics, geographical variables, economic factors.',
      placeholder: 'e.g., Most participants work evenings'
    },
    mediating: {
      label: 'Mediating factors',
      hint: 'Influences that emerge as the program unfolds: changes in staff, new policies, a downturn or uptick in the economy, new competing or complementary programs.',
      placeholder: 'e.g., A state policy change mid-year'
    },
    assumptions: {
      label: 'Assumptions',
      hint: 'What has to be true for the model to work that a reader would not infer from the boxes.',
      placeholder: 'e.g., Participants can get to the sessions'
    }
  };

  var FIELDS = {
    title: { label: 'Program name', hint: 'Becomes the title of the diagram.', placeholder: 'e.g., Eastside Youth Tutoring Program' },
    problem: {
      label: 'Problem statement',
      hint: 'What the problem is and who experiences it. Name the problem, not the missing solution.',
      placeholder: 'e.g., Many ninth graders at Eastside fall behind in math in their first semester, and few can get help outside school hours.'
    },
    theory: {
      label: 'Program theory',
      hint: 'Optional. One sentence: “If … then …”',
      placeholder: 'e.g., If struggling students get regular tutoring from trained volunteers, then they will catch up in math and stay on track to graduate.'
    }
  };

  /** "Check your model" questions (lecture: evaluation design questions). */
  var CHECKS = [
    { q: 'Is the program logic theoretically sound?', d: 'Do all the elements fit together logically? Are there other plausible pathways to achieving the program outcomes?' },
    { q: 'Have all the key external contextual factors been identified?', d: 'Are their potential influences described?' },
    { q: 'Does the program logic suggest the performance measures and major evaluation questions?', d: 'Could you name what you would measure for each box?' },
    { q: 'Does the problem statement name a problem, not a missing solution?', d: 'If the statement already contains the program, it can’t tell you whether the program is the right answer.' }
  ];

  /** Page sizes in diagram units (1 unit = 1 CSS px = 1/96 inch). */
  var PAGES = {
    'letter-landscape': { label: 'US Letter, landscape', w: 1056, h: 816, inW: 11, inH: 8.5, css: 'letter landscape' },
    'letter-portrait': { label: 'US Letter, portrait', w: 816, h: 1056, inW: 8.5, inH: 11, css: 'letter portrait' },
    'legal-landscape': { label: 'US Legal, landscape', w: 1344, h: 816, inW: 14, inH: 8.5, css: 'legal landscape' },
    'slide': { label: 'Slide, 16:9', w: 1280, h: 720, inW: 13.333, inH: 7.5, css: '13.333in 7.5in' },
    'none': { label: 'No page', w: 1056, h: 816, inW: null, inH: null, css: null }
  };
  /** Space kept clear around the edge of the page by auto layout. */
  var PAGE_MARGIN = 36;

  var SHOW_KEYS = ['title', 'theory', 'problem', 'headers', 'context', 'assumptions', 'brackets', 'structureLabels', 'columnArrows', 'related'];

  function item(text) { return { id: U.uid('i'), text: text || '' }; }

  function defaultDiagram() {
    return {
      template: 'handbook',
      theme: 'sps506',
      fontFamily: 'avenir',
      headingFont: 'same', // a font key, or 'same' to use fontFamily for headings too
      baseFontSize: 11,
      page: 'letter-landscape',
      background: 'white',
      show: {
        title: true, theory: true, problem: true, headers: true, context: true, assumptions: true,
        brackets: true, structureLabels: true, columnArrows: true,
        related: true // Figure 3.1's "Related program logics" box (Handbook only)
      },
      autoLayout: true,
      nodes: [],
      edges: []
    };
  }

  /** A blank logic model: every list starts with one empty item to type into. */
  function newDoc() {
    var sections = {};
    LISTS.forEach(function (k) {
      sections[k] = { label: SECTIONS[k].label, enabled: true, items: [item('')] };
    });
    return {
      app: APP,
      schema: SCHEMA,
      content: { title: '', problem: '', theory: '', sections: sections },
      diagram: defaultDiagram()
    };
  }

  /** Build a doc from a plain content object (used by the examples). */
  function fromContent(c) {
    var d = newDoc();
    d.content.title = c.title || '';
    d.content.problem = c.problem || '';
    d.content.theory = c.theory || '';
    LISTS.forEach(function (k) {
      var list = c[k] || [];
      d.content.sections[k].items = list.length ? list.map(function (t) { return item(t); }) : [item('')];
    });
    return d;
  }

  function str(v, fallback) { return typeof v === 'string' ? v : fallback; }
  /** A string from a file, with stray control characters removed (U.cleanText). */
  function txt(v, fallback, multiline) { return typeof v === 'string' ? U.cleanText(v, multiline) : fallback; }
  function num(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }
  function cleanStyle(s) {
    var out = {};
    if (s && typeof s === 'object') Object.keys(s).forEach(function (k) {
      var v = s[k];
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    });
    return out;
  }

  /**
   * Turn anything read from a file or from browser storage into a valid doc.
   * Throws an Error with a friendly message if it is not one of our projects.
   * Future schema changes: add `if (raw.schema < N) { ...upgrade... }` steps here.
   */
  function migrate(raw) {
    if (!raw || typeof raw !== 'object' || raw.app !== APP) {
      throw new Error('This file isn’t a Logic Model Builder project. Choose a .json file saved from this tool.');
    }
    if (typeof raw.schema !== 'number' || !isFinite(raw.schema)) {
      throw new Error('This file isn’t a valid Logic Model Builder project (it may be damaged). Choose a .json file saved from this tool.');
    }
    if (raw.schema > SCHEMA) {
      throw new Error('This project was saved by a newer version of the Logic Model Builder. Reload the page and try again.');
    }
    var d = newDoc();
    var c = raw.content || {};
    d.content.title = txt(c.title, '', false);
    d.content.problem = txt(c.problem, '', true);
    d.content.theory = txt(c.theory, '', true);
    var secs = c.sections || {};
    LISTS.forEach(function (k) {
      var s = secs[k];
      if (!s || typeof s !== 'object') return;
      var t = d.content.sections[k];
      t.label = txt(s.label, t.label, false);
      t.enabled = s.enabled !== false;
      if (Array.isArray(s.items)) {
        var seen = {};
        t.items = s.items.filter(function (it) { return it && typeof it === 'object'; }).map(function (it) {
          var id = typeof it.id === 'string' && it.id && !seen[it.id] ? it.id : U.uid('i');
          seen[id] = 1;
          return { id: id, text: txt(it.text, '', true) };
        });
      }
    });
    var g = raw.diagram || {};
    var dd = d.diagram;
    dd.template = LMB.templates && LMB.templates.get(g.template) ? g.template : dd.template;
    dd.theme = LMB.themes.valid(g.theme) ? g.theme : dd.theme;
    if (g.custom && typeof g.custom === 'object') dd.custom = LMB.themes.cleanCustom(g.custom);
    dd.fontFamily = LMB.text.FONTS[g.fontFamily] ? g.fontFamily : dd.fontFamily;
    dd.headingFont = LMB.text.FONTS[g.headingFont] ? g.headingFont : 'same';
    dd.baseFontSize = U.clamp(num(g.baseFontSize, dd.baseFontSize), 6, 32);
    dd.page = PAGES[g.page] ? g.page : dd.page;
    dd.background = ['white', 'transparent', 'paper'].indexOf(g.background) >= 0 ? g.background : dd.background;
    if (g.show && typeof g.show === 'object') SHOW_KEYS.forEach(function (k) { if (typeof g.show[k] === 'boolean') dd.show[k] = g.show[k]; });
    // Projects saved before the Related program logics box existed keep their look.
    if (g.show && typeof g.show === 'object' && typeof g.show.related !== 'boolean') dd.show.related = false;
    dd.autoLayout = g.autoLayout !== false;
    if (Array.isArray(g.nodes)) {
      dd.nodes = g.nodes.filter(function (n) { return n && typeof n.id === 'string' && typeof n.role === 'string'; }).map(function (n) {
        var o = {
          id: n.id, kind: n.role === 'free' ? 'free' : 'linked', role: n.role,
          link: n.link && typeof n.link === 'object' ? U.clone(n.link) : null,
          shape: typeof n.shape === 'string' ? n.shape : null,
          x: num(n.x, null), y: num(n.y, null), w: num(n.w, null), h: num(n.h, null),
          style: cleanStyle(n.style), fit: n.fit !== false, hidden: !!n.hidden
        };
        if (typeof n.text === 'string') o.text = U.cleanText(n.text, true);
        if (typeof n.dir === 'string') o.dir = n.dir;
        if (n.base && typeof n.base === 'object' && typeof n.base.x === 'number') {
          o.base = { x: n.base.x, y: num(n.base.y, 0), w: num(n.base.w, 0), h: num(n.base.h, 0) };
        }
        return o;
      });
    }
    if (Array.isArray(g.edges)) {
      dd.edges = g.edges.filter(function (e) { return e && typeof e.id === 'string'; }).map(function (e) {
        var pt = function (p) { return p && typeof p.x === 'number' && typeof p.y === 'number' ? { x: p.x, y: p.y } : null; };
        return {
          id: e.id, from: typeof e.from === 'string' ? e.from : null, to: typeof e.to === 'string' ? e.to : null,
          fromPt: pt(e.fromPt), toPt: pt(e.toPt), fromSide: str(e.fromSide, null), toSide: str(e.toSide, null),
          auto: !!e.auto, route: ['straight', 'elbow', 'curved'].indexOf(e.route) >= 0 ? e.route : 'straight',
          style: cleanStyle(e.style), label: txt(e.label, '', false), hidden: !!e.hidden
        };
      });
    }
    return d;
  }

  /** True when nothing has been typed or drawn yet. */
  function isEmpty(doc) {
    var c = doc.content;
    if (!U.isBlank(c.title) || !U.isBlank(c.problem) || !U.isBlank(c.theory)) return false;
    for (var i = 0; i < LISTS.length; i++) {
      if (c.sections[LISTS[i]].items.some(function (it) { return !U.isBlank(it.text); })) return false;
    }
    return !doc.diagram.nodes.some(function (n) { return n.role === 'free'; }) &&
      !doc.diagram.edges.some(function (e) { return !e.auto; });
  }

  function filled(doc, k) {
    return doc.content.sections[k].items.filter(function (it) { return !U.isBlank(it.text); });
  }
  /** Sections that appear in the diagram (intermediate can be switched off). */
  function chainOn(doc) {
    return CHAIN.filter(function (k) { return doc.content.sections[k].enabled !== false; });
  }

  /** The one name used everywhere for a model with no program name. */
  var UNTITLED = 'Untitled logic model';
  function titleOf(doc) { var t = doc.content.title; return U.isBlank(t) ? UNTITLED : t.trim(); }

  /** One line of text for a box (for the outline's list of arrows). */
  function oneLine(s) { return String(s || '').trim().replace(/\s*\n\s*/g, ' '); }
  function nodeName(doc, nd) {
    var C = LMB.content, t = C && C.text(doc, nd);
    if (t == null) { // boxes that hold a whole section
      var sec = nd.link && nd.link.section && doc.content.sections[nd.link.section];
      t = nd.role === 'problem' ? 'Problem' : nd.role === 'context' ? 'External influences'
        : nd.role === 'assumptions' ? doc.content.sections.assumptions.label : sec ? sec.label : '';
    }
    t = oneLine(t);
    return t.length > 60 ? t.slice(0, 57).trim() + '…' : t;
  }

  /** Plain-text outline of the model (Export → outline, SVG <desc>, alt text). */
  function outline(doc) {
    var c = doc.content, out = [];
    out.push(titleOf(doc));
    if (!U.isBlank(c.problem)) out.push('', 'Problem: ' + c.problem.trim());
    if (!U.isBlank(c.theory)) out.push('', 'Program theory: ' + c.theory.trim());
    chainOn(doc).forEach(function (k) {
      out.push('', c.sections[k].label);
      var items = filled(doc, k);
      if (!items.length) out.push('- (none listed)');
      items.forEach(function (it) { out.push('- ' + it.text.trim().replace(/\s*\n\s*/g, ' ')); });
    });
    var ctx = CONTEXT.filter(function (k) { return filled(doc, k).length; });
    if (ctx.length) {
      out.push('', 'External influences');
      ctx.forEach(function (k) {
        out.push(c.sections[k].label + ':');
        filled(doc, k).forEach(function (it) { out.push('- ' + it.text.trim().replace(/\s*\n\s*/g, ' ')); });
      });
    }
    if (filled(doc, 'assumptions').length) {
      out.push('', c.sections.assumptions.label);
      filled(doc, 'assumptions').forEach(function (it) { out.push('- ' + it.text.trim().replace(/\s*\n\s*/g, ' ')); });
    }
    // Whatever students added in Design: text boxes and notes (top to bottom),
    // then arrows they drew or labeled ("A → B: label").
    var dg = doc.diagram, byId = {};
    dg.nodes.forEach(function (nd) { byId[nd.id] = nd; });
    var extra = dg.nodes.filter(function (nd) { return nd.role === 'free' && !nd.hidden && !U.isBlank(nd.text); })
      .sort(function (a, b) { return (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0); })
      .map(function (nd) { return '- ' + oneLine(nd.text); });
    // Handbook's "Related program logics" box, once the student has written in it.
    var rel = byId.related;
    if (rel && !rel.hidden && !U.isBlank(rel.text)) extra.unshift('- ' + oneLine(rel.text));
    dg.edges.forEach(function (e) {
      if (e.hidden) return;
      var A = e.from && byId[e.from], B = e.to && byId[e.to];
      if ((A && A.hidden) || (B && B.hidden)) return;
      var label = oneLine(e.label);
      if (!label && (e.auto || !A || !B)) return; // unlabeled template arrows and loose lines say nothing
      var ends = A && B ? nodeName(doc, A) + ' → ' + nodeName(doc, B) : '';
      extra.push('- ' + (ends && label ? ends + ': ' + label : ends || 'Arrow: ' + label));
    });
    if (extra.length) out = out.concat(['', 'Other notes on the diagram'], extra);
    return U.cleanText(out.join('\n'), true);
  }

  LMB.model = {
    APP: APP, SCHEMA: SCHEMA, UNTITLED: UNTITLED, titleOf: titleOf, CHAIN: CHAIN, CONTEXT: CONTEXT, LISTS: LISTS,
    SECTIONS: SECTIONS, FIELDS: FIELDS, CHECKS: CHECKS, PAGES: PAGES, PAGE_MARGIN: PAGE_MARGIN, SHOW_KEYS: SHOW_KEYS,
    item: item, newDoc: newDoc, fromContent: fromContent, defaultDiagram: defaultDiagram,
    migrate: migrate, isEmpty: isEmpty, filled: filled, chainOn: chainOn, outline: outline,
    page: function (doc) { return PAGES[doc.diagram.page] || PAGES['letter-landscape']; }
  };
})();

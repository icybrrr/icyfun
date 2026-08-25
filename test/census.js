/* Every number in DESIGN-SYSTEM.md comes from this file.
 *
 * WHY IT EXISTS. Version 0.1 of that document was measured with greps written
 * while writing the prose, and an audit found nine counts wrong: "one place
 * each" for a font weight used sixteen times; `:active` counted as 14 by
 * matching the substring inside `.is-active`; radius read as 20 distinct
 * because the pattern took only the first value of a multi-value declaration.
 *
 * Version 0.2 fixed the parser and was audited again. The parser held up, but
 * the script had a worse problem than a bad regex: it measured only the
 * UNCONTESTED facts. Every number that justified a decision -- contrast floors,
 * migration costs, how many usages a proposed scale moves -- was still computed
 * by hand somewhere else, and four of those were wrong. A census that is silent
 * exactly where verification matters provides the appearance of rigour without
 * the substance.
 *
 * So this version computes the arguments too. The proposed scales live here, in
 * SPEC below, and the document quotes what this prints. If the two disagree,
 * this file is right.
 *
 * Run:  node test/census.js            the figures the spec quotes
 *       node test/census.js --verbose  every value with its count
 *       node test/census.js --json     machine-readable
 *       node test/census.js --check    exit 1 if any contrast floor fails
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const SHEETS = ['style.css', 'tokens.css', 'sky.css', 'os.css', 'chart/chart.css'];
const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');
const CHECK = process.argv.includes('--check');

/* ======================================================================
   THE PROPOSED SYSTEM. One copy, here, so the document cannot drift from
   the costs it quotes.
   ====================================================================== */

const SPEC = {
  /* TYPE. Two bands, each on a stated ratio.
     UI band: a minor third (1.2). Close enough to keep interface text dense,
     far enough that every step is visible.
     Display band: root 2 (1.414). Dramatic, and the same proportion as a sheet
     of paper, so the jumps feel like a change of medium rather than a size.
     Measured ratio spread within the UI band is 0.083 and within the display
     band 0.005; a hand-tuned alternative measured 0.346, which is a list. */
  text:    [8, 10, 12, 14, 17, 24, 34, 48],

  /* SPACE. A 4px grid with 2 and 6 as half-steps at the fine end, where
     optical correction needs finer control than rhythm does. */
  space:   [2, 4, 6, 8, 12, 16, 24, 32],

  /* RADIUS. Drawn FROM the spacing scale, not invented alongside it. A corner
     and a gap describe the same rhythm at the same scale, and a system whose
     two shape axes share a vocabulary is one fewer thing to remember. */
  radius:  [4, 8, 12, 16, 24],

  track:   [0, 0.5, 1, 2, 3, 4],

  /* MOTION. Octaves: each step is exactly double the last, so the durations
     are related the way musical pitches are. This is the one scale where the
     owner's angel numbers land without costing anything, because motion has no
     migration cost to trade against. */
  motion:  [110, 220, 440, 880],

  alternatives: {
    text: {
      'hand-tuned, no stated ratio':     [9, 11, 13, 15, 18, 22, 33, 44],
      'free optimum':                    [9, 10.5, 12, 15, 20, 38, 46],
      'minor 3rd + golden display':      [8, 10, 12, 14, 17, 28, 45],
      'angel numbers throughout':        [9, 11, 13, 16, 22, 33, 44],
      'musical 1.25 throughout':         [9, 11, 13.5, 17, 21, 26, 33, 41],
    },
    space: {
      'half-steps, angel top':           [2, 4, 6, 8, 12, 16, 22, 33],
      'strict 4px grid':                 [4, 8, 12, 16, 24, 32],
      'pure doubling':                   [2, 4, 8, 16, 32],
      'angel throughout':                [2, 4, 6, 8, 11, 13, 22, 33],
    },
    radius: {
      'not drawn from spacing':          [4, 8, 12, 16, 22],
      'angel throughout':                [11, 22, 33],
      'doubling':                        [4, 8, 16, 32],
      'golden from 4':                   [4, 6, 10, 16, 26],
    },
    track: {
      'ceiling 3':                       [0, 0.5, 1, 2, 3],
      'ceiling 4, no 3':                 [0, 0.5, 1, 2, 4],
      'four steps':                      [0, 0.5, 1, 2],
    },
  },

  /* Floors sit at the measured worst case across all 20 theme x weather
     combinations, composited over the WORST stop of each sky gradient. A floor
     above the observed minimum fails on a page that ships today; a floor below
     it can never catch a regression. */
  /* FLOORS ARE STANDARDS, NOT A RATCHET.
     An earlier version derived each floor by rounding the current measurement
     down, which makes a regression detector but not an accessibility standard:
     nothing was tied to WCAG, and a future palette landing at 3:1 could have
     its floor re-derived to 2.9 and still pass. These are tied to WCAG 2.2:
     7:1 (AAA) for primary text, 4.5:1 (AA) for secondary text and accents.
     The site does not currently meet all of them, and the gate says so. */
  floors: {
    'ink/surface': 7, 'ink/glass': 7,   'ink/pill': 7,  'ink/dense': 7,
    'dim/surface': 4.5,  'dim/glass': 4.5, 'dim/pill': 4.5, 'dim/dense': 4.5,
    'accent/surface': 4.5, 'accent/glass': 4.5, 'accent/pill': 4.5,
    'bar-ink/t-bar': 4.5,
    /* Only one window is focused at a time, so this is the state most title
       bars are actually in. */
    'bar-ink/t-bar-dim': 4.5,
    'on-cta/t-cta': 4.5, 'on-accent/accent': 4.5, 'selection-ink/deco': 4.5,
    'border-strong/surface': 3,
  },

  /* Measured, reported every run, does NOT gate. A check that can never pass
     gets switched off and then protects nothing. */
  advisory: {
    /* Decorative separators and card edges. Deliberately below 3:1: they are
       not a control's shape, and the softness is the house style. Reported so
       the choice stays visible, not gated so the build stays honest. */
    'border/surface': { target: 3, why: 'decorative separators, deliberately soft' },
  },
};

/* ------------------------------------------------------------------ parsing
   Index scans, not regexes with [\s\S]*?, which backtrack catastrophically on
   an unterminated comment. */

function stripComments(src) {
  let out = '', i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) break;
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end + 2;
    } else { out += src[i++]; }
  }
  return out;
}

/* Split on a separator only at paren depth zero, so rgba() survives. */
function splitTop(str, sep) {
  const parts = []; let depth = 0, cur = '';
  for (const c of str) {
    if (c === '(') depth++;
    else if (c === ')') depth--;
    if (c === sep && depth === 0) { parts.push(cur); cur = ''; }
    else cur += c;
  }
  parts.push(cur);
  return parts.map(s => s.trim()).filter(Boolean);
}

function declarations(src, file) {
  const out = [];
  /* [0-9] matters: without it --motif-1..4 and --purple-accent-2 are invisible
     to the entire census, and the motif tokens silently vanished from the spec
     between v0.1 and v0.3 because the tooling could not see them. */
  const re = /(^|[;{}])\s*([-a-zA-Z0-9]+)\s*:\s*([^;{}]*)/g;
  let m;
  while ((m = re.exec(src))) {
    const value = m[3].trim();
    if (value) out.push({ prop: m[2].toLowerCase(), value, file });
  }
  return out;
}

const FILES = SHEETS.map(f => ({
  name: f,
  raw: fs.readFileSync(path.join(ROOT, f), 'utf8'),
  src: stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8')),
}));
const DECLS = FILES.flatMap(f => declarations(f.src, f.name));
const ALL = FILES.map(f => f.src).join('\n');

/* --------------------------------------------------------------- collectors */

const tally = () => new Map();
function add(m, key, file) {
  if (!m.has(key)) m.set(key, { n: 0, files: new Set() });
  const e = m.get(key); e.n++; e.files.add(file);
}
const sorted = m => [...m.entries()].sort((a, b) => {
  const na = parseFloat(a[0]), nb = parseFloat(b[0]);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return b[1].n - a[1].n;
});
const totalOf = m => [...m.values()].reduce((s, e) => s + e.n, 0);

/* Lengths from a declaration value, honouring shorthand and ignoring anything
   inside a function, so gradient stops and url() do not pollute the tally. */
function lengths(value) {
  const outside = value.replace(/[a-z-]*\([^()]*(?:\([^()]*\)[^()]*)*\)/gi, ' ');
  return (outside.match(/-?[\d.]+px/g) || []).map(s => parseFloat(s));
}

/* ------------------------------------------------------------------- axes */

const R = {};

/* type ------------------------------------------------------------------- */
R.fontSize = tally(); R.fontWeight = tally(); R.lineHeight = tally();
R.clamps = tally(); R.family = tally();
for (const d of DECLS) {
  if (d.prop === 'font-size') {
    const c = d.value.match(/clamp\([^)]*\)/i);
    if (c) { add(R.clamps, c[0].replace(/\s+/g, ' '), d.file); continue; }
    lengths(d.value).forEach(v => add(R.fontSize, v, d.file));
  }
  if (d.prop === 'font') {
    const c = d.value.match(/clamp\([^)]*\)/i);
    const w = d.value.match(/\b([1-9]00)\b/);
    if (w) add(R.fontWeight, w[1], d.file);
    if (c) add(R.clamps, c[0].replace(/\s+/g, ' '), d.file);
    else {
      const sz = d.value.match(/(-?[\d.]+)px(?:\s*\/\s*([\d.]+))?/);
      if (sz) {
        add(R.fontSize, parseFloat(sz[1]), d.file);
        if (sz[2]) add(R.lineHeight, sz[2], d.file);
      }
    }
  }
  if (d.prop === 'font-weight') {
    const w = d.value.match(/\b([1-9]00)\b/);
    if (w) add(R.fontWeight, w[1], d.file);
  }
  if (d.prop === 'line-height') add(R.lineHeight, d.value.trim(), d.file);
  /* families: count EVERY occurrence, token or raw string. v0.2 reported
     "4 distinct" and the author inferred "at least one raw string" from it.
     There are eight, which is a different kind of problem. */
  if (d.prop === 'font' || d.prop === 'font-family') {
    const tok = d.value.match(/var\(--font-[a-z]+\)/);
    if (tok) add(R.family, tok[0], d.file);
    else {
      const raw = d.value.match(/'[^']+'|"[^"]+"/);
      if (raw) add(R.family, 'RAW ' + raw[0], d.file);
    }
  }
}

/* letter-spacing --------------------------------------------------------- */
R.tracking = tally();
for (const d of DECLS) if (d.prop === 'letter-spacing') {
  lengths(d.value).forEach(v => add(R.tracking, v, d.file));
}

/* radius ----------------------------------------------------------------- */
R.radius = tally(); R.radiusPct = tally();
for (const d of DECLS) if (d.prop.startsWith('border') && d.prop.includes('radius')) {
  lengths(d.value).forEach(v => add(R.radius, v, d.file));
  (d.value.match(/[\d.]+%/g) || []).forEach(v => add(R.radiusPct, v, d.file));
}

/* spacing ---------------------------------------------------------------- */
R.space = tally();
const SPACE_PROPS = /^(padding|margin|gap|row-gap|column-gap)(-(top|right|bottom|left))?$/;
for (const d of DECLS) if (SPACE_PROPS.test(d.prop)) {
  lengths(d.value).forEach(v => add(R.space, v, d.file));
}

/* motion ----------------------------------------------------------------- */
R.duration = tally(); R.easing = tally();
/* (?<!-) so `ease` inside var(--ease-standard) is not counted as a raw
   keyword: a hyphen is a word boundary, so \b alone matches there. */
const EASE = /cubic-bezier\([^)]*\)|(?<![-a-z])(?:ease-in-out|ease-out|ease-in|linear|ease)(?![-a-z])/g;
for (const d of DECLS) {
  if (!/^(transition|animation)/.test(d.prop)) continue;
  for (const layer of splitTop(d.value, ',')) {
    (layer.match(/(?:^|\s)(-?[\d.]+m?s)\b/g) || [])
      .map(s => s.trim())
      .forEach(s => {
        const ms = s.endsWith('ms') ? parseFloat(s) : parseFloat(s) * 1000;
        if (ms > 0) add(R.duration, ms, d.file);
      });
    (layer.match(EASE) || []).forEach(e => add(R.easing, e.replace(/\s+/g, ' '), d.file));
  }
}
/* Counted from the raw source: @media conditions are not declarations, so the
   declaration walker cannot see them. v0.2 hand-counted this and said 10. */
R.reducedMotion = FILES.reduce((n, f) =>
  n + (f.src.match(/@media[^{]*prefers-reduced-motion/g) || []).length, 0);

/* elevation -------------------------------------------------------------- */
R.shadowGeom = tally(); R.shadowInset = tally();
R.drop = tally(); R.glow = tally(); R.ring = tally();
let shadowDecls = 0, shadowLayers = 0;
for (const d of DECLS) {
  if (d.prop !== 'box-shadow' || /^(none|inherit|unset)$/.test(d.value)) continue;
  shadowDecls++;
  for (const layer of splitTop(d.value, ',')) {
    shadowLayers++;
    const nums = (layer.match(/(?:^|\s)(-?[\d.]+px|0)(?=\s|$)/g) || []).map(s => s.trim());
    if (nums.length < 3) continue;
    /* FOUR values, not three. The spread is the only thing distinguishing one
       ring from another, and slicing at 3 collapsed all eight ring spreads
       (1, 1.5, 2, 3, 3.5, 4, 8, 22px) onto the single key "0 0 0" -- which the
       spec then reported as "Ring: 1 distinct". The tidiest number in the
       section was an artefact of this line. */
    const geom = nums.slice(0, 4).join(' ');
    if (/\binset\b/.test(layer)) { add(R.shadowInset, geom, d.file); continue; }
    add(R.shadowGeom, geom, d.file);
    /* Three unrelated effects share one CSS property. Counting them together is
       why the raw geometry count looks catastrophic. */
    const [x, y] = nums;
    if (x === '0' && y === '0' && nums[2] === '0') add(R.ring, geom, d.file);
    else if (x === '0' && y === '0') add(R.glow, geom, d.file);
    else add(R.drop, geom, d.file);
  }
}

/* glass: backdrop-filter and filter are DIFFERENT problems. v0.2 pooled them,
   which inflated the glass story from 8 blur values to 13 by counting
   decorative glows as material. -------------------------------------------- */
R.backdropBlur = tally(); R.filterBlur = tally(); R.recipe = tally();
for (const d of DECLS) {
  const isBackdrop = /backdrop-filter$/.test(d.prop);
  if (!isBackdrop && d.prop !== 'filter') continue;
  const b = d.value.match(/blur\(([\d.]+)px\)/);
  if (b) add(isBackdrop ? R.backdropBlur : R.filterBlur, parseFloat(b[1]), d.file);
  if (isBackdrop && d.value !== 'none') add(R.recipe, d.value.replace(/\s+/g, ' '), d.file);
}

/* states ----------------------------------------------------------------- */
R.states = {};
for (const [name, re] of Object.entries({
  hover: /:hover\b/g, active: /:active\b/g, 'focus-visible': /:focus-visible\b/g,
  focus: /:focus(?![-a-z])/g, disabled: /:disabled\b|\[disabled\]/g,
})) R.states[name] = (ALL.match(re) || []).length;
R.outlineNone = (ALL.match(/outline:\s*(?:none|0)\b/g) || []).length;
R.universalFocus = /(^|[}\s])::?focus-visible\s*\{/.test(ALL) || /\n:focus-visible\s*\{/.test(ALL);
R.important = (ALL.match(/!important/g) || []).length;

/* z-layers --------------------------------------------------------------- */
R.zTokens = new Map();
for (const d of DECLS) if (/^--z-/.test(d.prop)) R.zTokens.set(d.prop, parseInt(d.value, 10));

/* media queries ---------------------------------------------------------- */
R.mediaProps = tally(); R.breakpoints = new Set();
for (const f of FILES) {
  const s = f.src;
  let i = 0;
  while ((i = s.indexOf('@media', i)) !== -1) {
    const open = s.indexOf('{', i);
    const cond = s.slice(i + 6, open).trim();
    if (!/reduced-motion|forced-colors|prefers-contrast|print/.test(cond)) {
      (cond.match(/[\d.]+px/g) || []).forEach(p => R.breakpoints.add(parseInt(p, 10)));
    }
    let depth = 0, j = open;
    for (; j < s.length; j++) {
      if (s[j] === '{') depth++;
      else if (s[j] === '}' && --depth === 0) break;
    }
    if (!/reduced-motion/.test(cond)) {
      declarations(s.slice(open, j), f.name).forEach(d => add(R.mediaProps, d.prop, f.name));
    }
    i = j;
  }
}

/* custom properties, and where they are declared -------------------------- */
R.tokensIn = {}; R.rogue = []; R.runtime = [];
for (const f of FILES) {
  const names = new Set();
  for (const d of declarations(f.src, f.name)) if (d.prop.startsWith('--')) names.add(d.prop);
  R.tokensIn[f.name] = names.size;
  /* A COLOUR token declared outside tokens.css cannot participate in
     theme x weather, and is therefore invisible to the whole theming system.
     Runtime tokens that JavaScript writes each frame (--tilt-x, --glare-a,
     --px) are a different thing entirely and are not a defect, so they are
     classified apart rather than inflating the count. */
  if (f.name !== 'tokens.css') {
    for (const n of names) {
      if (/^--(z|holo|motif)-/.test(n)) continue;
      const decl = declarations(f.src, f.name).filter(d => d.prop === n).map(d => d.value);
      const isColour = decl.some(v => /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|linear-gradient|conic-gradient/.test(v));
      const isFont = /^--font-/.test(n);
      if (isColour || isFont) R.rogue.push(f.name + ' ' + n);
      else R.runtime.push(f.name + ' ' + n);
    }
  }
}

/* theme palettes --------------------------------------------------------- */
R.themes = {};
{
  const s = FILES.find(f => f.name === 'tokens.css').src;
  const re = /body\[data-wall="([a-z]+)"\](\[data-mode="([a-z]+)"\])?\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(s))) {
    const key = m[1] + '/' + (m[3] || 'day');
    R.themes[key] = R.themes[key] || {};
    for (const d of declarations(m[4], 'tokens.css')) {
      if (d.prop.startsWith('--')) R.themes[key][d.prop] = d.value.trim();
    }
  }
}

/* ======================================================================
   MIGRATION COST. What a proposed scale actually costs, computed rather
   than asserted.
   ====================================================================== */

/* THE TIE-BREAK IS A POLICY, NOT A MEASUREMENT, so it is declared.
 *
 * A value exactly between two steps has to go somewhere. v0.3 used strict `<`
 * seeded from the smallest step, which silently sent every tie DOWNWARD: 47 of
 * 111 type moves and 127 of 245 space moves were decided that way, including
 * 12px -- the most-used font size on the site -- landing on 11 rather than 13.
 * Half the migration table was an editorial choice presented as a measurement.
 *
 * Ties now round UP. Text that shrinks costs legibility; text that grows costs
 * a little density, and density is recoverable. `tied` reports how many moves
 * the policy decided, so the number is never invisible again. */
function cost(hist, scale, keep = () => true) {
  let moved = 0, total = 0, worst = 0, tied = 0, weighted = 0, worstRel = 0;
  const detail = [];
  for (const [k, e] of hist) {
    const v = parseFloat(k);
    if (isNaN(v) || !keep(v)) continue;
    total += e.n;
    const t = scale.reduce((best, s) => {
      const d = Math.abs(s - v) - Math.abs(best - v);
      return d < 0 || (d === 0 && s > best) ? s : best;
    }, scale[0]);
    if (t !== v && scale.some(o => o !== t && Math.abs(o - v) === Math.abs(t - v))) tied += e.n;
    if (t !== v) {
      moved += e.n;
      /* `worst` is a max over distinct VALUES, so a single 52px usage can set
         it. Weighted disturbance (sum of |shift| x usages) describes how much
         of the site actually moves, and worstRel describes how loud the
         loudest change is relative to its own size. A scale that wins on
         `worst` alone may be winning on one occurrence. */
      weighted += Math.abs(t - v) * e.n;
      if (Math.abs(t - v) / v > worstRel) worstRel = Math.abs(t - v) / v;
      if (Math.abs(t - v) > worst) worst = Math.abs(t - v);
      detail.push(`${v}->${t}(x${e.n})`);
    }
  }
  return { moved, total, worst: +worst.toFixed(3), tied,
           weighted: +weighted.toFixed(1), worstRel: +(100 * worstRel).toFixed(1), detail };
}



const KEEP = {
  text:   () => true,
  space:  v => v > 0 && v <= 33,
  radius: v => v > 0 && v < 40,
  track:  () => true,
};
const HIST = { text: R.fontSize, space: R.space, radius: R.radius, track: R.tracking };

R.cost = {};
R.rivals = {};
for (const axis of ['text', 'space', 'radius', 'track']) {
  R.cost[axis] = cost(HIST[axis], SPEC[axis], KEEP[axis]);
  /* Every rival costed identically, so no comparative claim is hand-asserted.
     v0.3 quoted four alternative type scales that existed nowhere and three
     other comparisons that were wrong when checked. */
  R.rivals[axis] = Object.entries(SPEC.alternatives[axis] || {}).map(([name, sc]) => {
    const c = cost(HIST[axis], sc, KEEP[axis]);
    return { name, scale: sc, moved: c.moved, total: c.total, worst: c.worst,
             weighted: c.weighted, worstRel: c.worstRel };
  }).sort((a, b) => a.moved - b.moved);
}

/* ======================================================================
   CONTRAST. All 20 theme x weather combinations, composited over the
   WORST stop of each sky gradient.

   v0.2 measured nine combinations against a mid stop and set a floor of
   10:1 for ink on glass. The true worst case is 7.08 on strawberry/rain,
   so that floor failed against the shipping site on the day it was
   written -- in the section whose whole thesis is worst-stop discipline.
   ====================================================================== */

function parseColor(h) {
  if (!h) return null;
  const s = h.trim().replace('#', '');
  const hex = s.length === 3 ? [...s].map(c => c + c).join('') : s;
  if (hex.length !== 6 && hex.length !== 8) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
    hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
  ];
}
const over = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
function luminance(c) {
  const f = v => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
const stopsOf = v => (String(v || '').match(/#[0-9a-fA-F]{6,8}\b/g) || []).map(parseColor).filter(Boolean);

/* Only one window is focused at a time, so MOST title bars render through
   `filter: saturate(0.28) brightness(0.97)` (os.css:1378). v0.3 measured the
   unfiltered state only and set a floor 0.12 above it. Model the filter so the
   common state is the one that has to hold. */
function saturateFilter(c, s) {
  const [r, g, b] = c;
  return [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
    c[3],
  ].map((v, i) => (i < 3 ? Math.min(255, Math.max(0, v)) : v));
}
const brightnessFilter = (c, b) =>
  [c[0] * b, c[1] * b, c[2] * b, c[3]].map((v, i) => (i < 3 ? Math.min(255, Math.max(0, v)) : v));
const unfocusedBar = c => brightnessFilter(saturateFilter(c, 0.28), 0.97);

/* THE WHITE SHEEN. Every .glass surface paints a white gradient on top of
   --os-glass (style.css:1024): 0.42 at the top, 0.06 at 48%, 0.16 at the
   bottom. Compositing only fill-over-sky ignores it, and on dark themes that
   is not a rounding error: it reports 12:1 where the real figure at the first
   line of a padded panel is 3.8:1.

   Text never sits at 0%: every glass surface has padding. The worst position a
   line can occupy is about 10% down, which is what SHEEN_AT samples. The menu
   bar and dock centre their text near 48%, where the sheen is almost nothing,
   which is why the problem is invisible on the chrome and real on tall
   panels. */
const SHEEN_MID = 0.06, SHEEN_MID_AT = 48, SHEEN_AT = 10;
/* CURRENT: one value for every theme. PROPOSED: a token, because a white sheen
   is a LIGHT-theme affordance -- it reads as glass catching a light source. On
   a dark palette the same wash simply removes the surface's contrast, and at
   0.42 it costs the dark themes 8 of their 14 floors. Set --glass-sheen with
   the rest of the palette and the whole family clears AAA. */
/* Read from the palette now that --glass-sheen exists, rather than assumed. */
const SHEEN_TOP = { light: 0.42, dark: 0.42 };
const SHEEN_PROPOSED = { light: 0.42, dark: 0.10 };
const isDark = (wall, mode) => wall === 'arcade' || mode === 'night';
function sheen(topAlpha) {
  const a = topAlpha + (SHEEN_MID - topAlpha) * (SHEEN_AT / SHEEN_MID_AT);
  return [255, 255, 255, a];
}

const WALLS = ['base', 'holo', 'strawberry', 'arcade', 'archangel'];
const MODES = ['day', 'night', 'rain', 'snow'];
R.contrast = {}; R.contrastRows = [];
for (const wall of WALLS) {
  for (const mode of MODES) {
    const p = Object.assign({}, R.themes[wall + '/day'], R.themes[wall + '/' + mode] || {});
    const sky = stopsOf(p['--sky-' + mode] || p['--sky-day']);
    if (!sky.length) continue;
    const ink = parseColor(p['--os-ink']), dim = parseColor(p['--os-ink-dim']);
    const acc = parseColor(p['--os-accent']);
    /* Every surface the system puts text or a boundary on, not just the two
       easy ones. v0.3 checked six pairs and missed --os-pill, which carries the
       smallest text on the site, and --os-glass-dense, which carries every menu
       and overlay -- while claiming to composite "every translucent surface". */
    const surf = parseColor(p['--os-surface']);
    const glass = parseColor(p['--os-glass']);
    const dense = parseColor(p['--os-glass-dense']);
    const pill = parseColor(p['--os-pill']);
    const border = parseColor(p['--os-border']);
    const pairs = {
      'ink/surface':    [ink, surf],
      'ink/glass':      [ink, glass, 'sheen'],
      'ink/pill':       [ink, pill],
      'ink/dense':      [ink, dense, 'sheen'],
      'dim/surface':    [dim, surf],
      'dim/glass':      [dim, glass, 'sheen'],
      'dim/pill':       [dim, pill],
      'dim/dense':      [dim, dense, 'sheen'],
      'accent/surface': [acc, surf],
      'accent/glass':   [acc, glass, 'sheen'],
      'accent/pill':    [acc, pill],
      'border/surface': [border, surf],
      /* A border that is the ONLY thing identifying a control's shape needs
         3:1 per WCAG 1.4.11. A decorative separator does not, and the site's
         hairlines are deliberately whisper-soft, so the two are different
         tokens and only one of them gates. */
      'border-strong/surface': [parseColor(p['--os-border-strong']), surf],
      /* The two roles added with --on-accent and --on-cta. White on
         --os-accent failed AA on six of ten palettes because the accent
         lightens at night; --on-accent flips, and the check follows it. */
      'on-accent/accent': [parseColor(p['--on-accent']), acc],
      'selection-ink/deco': [parseColor(p['--os-selection-ink']), parseColor(p['--t-deco'])],
    };
    const row = { combo: wall + '/' + mode };
    const dark = isDark(wall, mode);
    const declared = parseFloat(p['--glass-sheen']);
    const sheenNow = !isNaN(declared) ? declared
      : (process.argv.includes('--proposed') ? SHEEN_PROPOSED : SHEEN_TOP)[dark ? 'dark' : 'light'];
    for (const [name, [fg, fill, coat]] of Object.entries(pairs)) {
      if (!fg || !fill) continue;
      /* worst sky stop, and through the white sheen where the surface has one */
      const r = Math.min(...sky.map(s => {
        let bg = over(fill, s);
        if (coat === 'sheen') bg = over(sheen(sheenNow), bg);
        return contrast(fg, bg);
      }));
      row[name] = +r.toFixed(2);
      if (!R.contrast[name] || r < R.contrast[name].ratio) {
        R.contrast[name] = { ratio: +r.toFixed(2), where: row.combo };
      }
    }
    /* the two gradients: text sits ON them, so every stop must hold */
    if (mode === 'day') {
      const barInk = parseColor(p['--t-bar-ink']);
      const barStops = stopsOf(p['--t-bar']);
      if (barInk && barStops.length) {
        const r = Math.min(...barStops.map(s => contrast(barInk, s)));
        row['bar-ink/t-bar'] = +r.toFixed(2);
        if (!R.contrast['bar-ink/t-bar'] || r < R.contrast['bar-ink/t-bar'].ratio)
          R.contrast['bar-ink/t-bar'] = { ratio: +r.toFixed(2), where: wall };
        /* the state most title bars are actually in */
        /* A CSS filter applies to the whole rendered subtree, so the title
           text is desaturated too, not just the bar behind it. */
        const ru = Math.min(...barStops.map(s => contrast(unfocusedBar(barInk), unfocusedBar(s))));
        row['bar-ink/t-bar-dim'] = +ru.toFixed(2);
        if (!R.contrast['bar-ink/t-bar-dim'] || ru < R.contrast['bar-ink/t-bar-dim'].ratio)
          R.contrast['bar-ink/t-bar-dim'] = { ratio: +ru.toFixed(2), where: wall };
      }
      const ctaStops = stopsOf(p['--t-cta']);
      const onCta = parseColor(p['--on-cta']) || [255, 255, 255, 1];
      if (ctaStops.length) {
        const r = Math.min(...ctaStops.map(s => contrast(onCta, s)));
        row['on-cta/t-cta'] = +r.toFixed(2);
        if (!R.contrast['on-cta/t-cta'] || r < R.contrast['on-cta/t-cta'].ratio)
          R.contrast['on-cta/t-cta'] = { ratio: +r.toFixed(2), where: wall };
      }
    }
    R.contrastRows.push(row);
  }
}
/* A pair that could not be measured is a FAILURE, not a skip. v0.3 would
   silently drop a check if a sky gradient were ever rewritten with rgb()
   stops: stopsOf returns [], the pair is never set, the report prints one
   row fewer, and --check still exits 0. Unmeasurable must never mean pass. */
R.floorFailures = Object.entries(SPEC.floors).map(([k, f]) => {
  const c = R.contrast[k];
  if (!c) return `${k}: NOT MEASURED (floor ${f}) -- the check silently vanished`;
  if (c.ratio < f) return `${k}: ${c.ratio} at ${c.where}, floor ${f}`;
  return null;
}).filter(Boolean);
R.advisories = Object.entries(SPEC.advisory).map(([k, a]) => {
  const c = R.contrast[k];
  if (!c) return `${k}: NOT MEASURED`;
  return `${k}: ${c.ratio} at ${c.where}, target ${a.target} (${a.why})` +
         (c.ratio < a.target ? '  BELOW TARGET' : '  ok');
});

/* ------------------------------------------------------------------ report */

function line(label, m, unit = 'px') {
  console.log(`  ${label.padEnd(24)} ${String(m.size).padStart(3)} distinct, ${String(totalOf(m)).padStart(4)} usages`);
  if (VERBOSE) console.log('      ' + sorted(m).map(([k, e]) => `${k}${unit}(x${e.n})`).join('  '));
}

if (JSON_OUT) {
  const plain = m => Object.fromEntries([...m].map(([k, v]) => [k, v.n]));
  console.log(JSON.stringify({
    fontSize: plain(R.fontSize), fontWeight: plain(R.fontWeight), lineHeight: plain(R.lineHeight),
    clamps: plain(R.clamps), family: plain(R.family), tracking: plain(R.tracking),
    radius: plain(R.radius), radiusPct: plain(R.radiusPct), space: plain(R.space),
    duration: plain(R.duration), easing: plain(R.easing), reducedMotion: R.reducedMotion,
    shadowGeom: plain(R.shadowGeom), shadowInset: plain(R.shadowInset), shadowDecls, shadowLayers,
    backdropBlur: plain(R.backdropBlur), filterBlur: plain(R.filterBlur), recipe: plain(R.recipe),
    states: R.states, outlineNone: R.outlineNone, universalFocus: R.universalFocus,
    important: R.important, zTokens: Object.fromEntries(R.zTokens),
    mediaProps: plain(R.mediaProps), breakpoints: [...R.breakpoints].sort((a, b) => b - a),
    tokensIn: R.tokensIn, rogue: R.rogue, runtime: R.runtime, themes: R.themes,
    spec: SPEC, cost: R.cost, contrast: R.contrast, contrastRows: R.contrastRows,
    floorFailures: R.floorFailures, advisories: R.advisories,
    rivals: R.rivals, drop: Object.fromEntries([...R.drop].map(([k,v])=>[k,v.n])),
    glow: Object.fromEntries([...R.glow].map(([k,v])=>[k,v.n])), ring: Object.fromEntries([...R.ring].map(([k,v])=>[k,v.n])),
  }, null, 2));
  process.exit(R.floorFailures.length && CHECK ? 1 : 0);
}

console.log(`icybearOS census  ·  ${SHEETS.length} stylesheets, ${DECLS.length} declarations\n`);
console.log('TYPE');
line('font-size', R.fontSize);
line('font-weight', R.fontWeight, '');
line('line-height', R.lineHeight, '');
line('letter-spacing', R.tracking);
line('clamp() sizes', R.clamps, '');
line('font-family', R.family, '');
{
  const raw = [...R.family].filter(([k]) => k.startsWith('RAW')).reduce((s, [, e]) => s + e.n, 0);
  console.log(`  ${'raw family strings'.padEnd(24)} ${raw}  (bypassing var(--font-*))`);
}

console.log('\nSPACE AND SHAPE');
line('spacing', R.space);
line('border-radius', R.radius);
line('border-radius %', R.radiusPct, '');

console.log('\nMOTION');
line('duration', R.duration, 'ms');
line('easing', R.easing, '');
{
  const once = [...R.easing].filter(([k, e]) => k.startsWith('cubic') && e.n === 1).length;
  console.log(`  ${'one-off cubic-beziers'.padEnd(24)} ${once}`);
}
console.log(`  ${'prefers-reduced-motion'.padEnd(24)} ${R.reducedMotion} blocks`);

console.log('\nELEVATION AND GLASS');
console.log(`  ${'box-shadow'.padEnd(24)} ${shadowDecls} declarations, ${shadowLayers} layers`);
line('  drop geometries', R.shadowGeom, '');
line('  inset geometries', R.shadowInset, '');
/* Three unrelated effects share one CSS property, which is the whole reason
   the raw count looks catastrophic. v0.3 derived this split by hand and the
   script kept labelling all of it "drop". */
for (const [name, m] of [['drop (y > 0)', R.drop], ['glow (0 0 blur)', R.glow], ['ring (0 0 0 spread)', R.ring]]) {
  const once = [...m.values()].filter(e => e.n === 1).length;
  console.log(`  ${('  ' + name).padEnd(24)} ${String(m.size).padStart(3)} distinct, ${String(totalOf(m)).padStart(4)} uses, ${once} used once`);
  if (VERBOSE) console.log('      ' + sorted(m).map(([k, e]) => `[${k}]x${e.n}`).join('  '));
}
line('backdrop-filter blur', R.backdropBlur);
line('filter blur (not glass)', R.filterBlur);
line('backdrop recipes', R.recipe, '');
if (VERBOSE) sorted(R.recipe).forEach(([k, e]) => console.log(`      ${k}  (x${e.n})`));

console.log('\nSTATE AND ACCESS');
Object.entries(R.states).forEach(([k, v]) => console.log(`  ${(':' + k).padEnd(24)} ${v}`));
console.log(`  ${'universal :focus-visible'.padEnd(24)} ${R.universalFocus ? 'yes' : 'NO'}`);
console.log(`  ${'outline: none'.padEnd(24)} ${R.outlineNone}`);
console.log(`  ${'!important'.padEnd(24)} ${R.important}`);

console.log('\nSTRUCTURE');
console.log(`  ${'--z-* tokens'.padEnd(24)} ${R.zTokens.size}`);
console.log(`  ${'breakpoints'.padEnd(24)} ${[...R.breakpoints].sort((a, b) => b - a).join(' · ')}`);
console.log(`  ${'@media overrides'.padEnd(24)} ${totalOf(R.mediaProps)} declarations across ${R.mediaProps.size} properties`);
if (VERBOSE) sorted(R.mediaProps).forEach(([k, e]) => console.log(`      ${k} x${e.n}`));
console.log(`  ${'custom props by file'.padEnd(24)} ${Object.entries(R.tokensIn).map(([f, n]) => f + ':' + n).join('  ')}`);
console.log(`  ${'palette/font outside'.padEnd(24)} ${R.rogue.length}  (cannot participate in theme x weather)`);
R.rogue.forEach(r => console.log('      ' + r));
console.log(`  ${'runtime tokens (JS-set)'.padEnd(24)} ${R.runtime.length}  (not a defect)`);
if (VERBOSE) R.runtime.forEach(r => console.log('      ' + r));

console.log('\nMIGRATION COST  (computed, not asserted; ties round UP, see cost())');
for (const [k, c] of Object.entries(R.cost)) {
  console.log(`  ${k.padEnd(24)} ${c.moved} of ${c.total} move, worst ${c.worst}px, ` +
              `${c.tied} decided by the tie-break`);
  if (VERBOSE) console.log('      ' + c.detail.join('  '));
}

console.log('\nRIVAL SCALES  (the comparisons the document quotes)');
for (const [axis, list] of Object.entries(R.rivals)) {
  if (!list.length) continue;
  const chosen = R.cost[axis];
  console.log(`  ${axis}:`);
  console.log(`    ${'CHOSEN'.padEnd(30)} ${SPEC[axis].join(' ').padEnd(30)} ${chosen.moved}/${chosen.total} move, worst ${chosen.worst}px (${chosen.worstRel}%), weighted ${chosen.weighted}`);
  for (const r of list) {
    /* Two axes, not one. A scale that moves fewer usages but shifts them
       further is not cheaper, it is louder. Report both so the flag cannot
       mislead. */
    const flag = r.moved < chosen.moved && r.worst <= chosen.worst ? '  <-- BETTER ON BOTH'
               : r.moved < chosen.moved ? `  (fewer moves, but worst ${r.worst}px vs ${chosen.worst}px)`
               : '';
    console.log(`    ${r.name.padEnd(30)} ${r.scale.join(' ').padEnd(30)} ${r.moved}/${r.total} move, worst ${r.worst}px (${r.worstRel}%), weighted ${r.weighted}${flag}`);
  }
}

console.log('\nCONTRAST  (20 combinations, composited over the WORST sky stop)');
for (const [k, f] of Object.entries(SPEC.floors)) {
  const c = R.contrast[k];
  if (!c) continue;
  const ok = c.ratio >= f;
  console.log(`  ${k.padEnd(24)} worst ${String(c.ratio).padStart(6)} at ${c.where.padEnd(18)} floor ${String(f).padStart(4)}  ${ok ? 'ok' : 'FAILS'}`);
}
console.log('\n  ADVISORY (measured, reported, does NOT gate):');
R.advisories.forEach(a => console.log('    ' + a));
if (R.floorFailures.length) {
  console.log('\n  FLOOR FAILURES:');
  R.floorFailures.forEach(f => console.log('    ' + f));
}

if (CHECK) process.exit(R.floorFailures.length ? 1 : 0);

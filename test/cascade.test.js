/* Two stylesheets, one page: catch the collisions where load order decides.
 *
 *   node test/cascade.test.js            fail on any contested selector
 *   node test/cascade.test.js --verbose  also list every shared class name
 *
 * WHAT THIS IS ABOUT. index.html loads style.css and os.css together, and 28
 * class names appear in both. Almost all of that is deliberate: the OS reuses
 * the classic site's primitives -- .button, .pill, .glass, .status-dot, .tag --
 * and restyles them through a scope, `.mood .contact-pill`, `.wbody
 * .experience-card`. Reuse through a scope is the system working.
 *
 * The failure mode is narrower and much harder to see: the SAME selector,
 * unscoped, in both files, setting the same property to two different values.
 * Then nothing in either file says who wins -- the answer is which <link> comes
 * second, and editing one sheet silently changes a page it never mentions.
 *
 * There were two. `.contact` was the classic landing page's centred footer band
 * in one sheet and the OS mood ring's row of social glyphs in the other; the OS
 * rule won `display` and `align-items` but not `flex-direction`, `text-align`
 * or `padding`, so the desktop rendered half of each and os.css carried a
 * four-declaration rule to undo it. `.skill-tree` was the same story on `gap`.
 * Both are fixed by scoping the classic block rules to `.classic`, which is
 * what the rest of those components already did -- only the block rules had
 * been missed.
 *
 * So this counts what matters and ignores what does not. An identical value in
 * both sheets is duplication rather than a conflict, and it is reported but not
 * failed on; a conflict inside an @media is only compared against the same
 * @media, because an unconditional rule and a 880px one are not competing.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
/* The order index.html loads them in. Later wins, which is exactly the problem. */
const SHEETS = ['style.css', 'tokens.css', 'sky.css', 'os.css'];

function stripComments(src) {
  let out = '', i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      out += ' ';
    } else out += src[i++];
  }
  return out;
}

/* Walk rules, carrying the enclosing at-rule prelude so a declaration inside a
   media query is never compared against an unconditional one. */
function walk(src, into, condition) {
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) return;
    const prelude = src.slice(i, open).trim();
    let depth = 1, j = open + 1;
    while (j < src.length && depth > 0) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') depth--;
      j++;
    }
    const body = src.slice(open + 1, j - 1);
    if (prelude.startsWith('@')) {
      if (/^@(media|supports|container|layer|scope)/.test(prelude)) {
        walk(body, into, (condition ? condition + ' && ' : '') + prelude.replace(/\s+/g, ' '));
      }
    } else {
      const props = new Map();
      body.replace(/(^|;)\s*([-a-zA-Z]+)\s*:([^;]*)/g,
        (m, _semi, prop, value) => { props.set(prop, value.trim().replace(/\s+/g, ' ')); return m; });
      prelude.split(',').forEach(one => {
        const sel = one.trim().replace(/\s+/g, ' ');
        if (sel) into.push({ sel: sel, cond: condition || '', props: props });
      });
    }
    i = j;
  }
}

const rulesBySheet = {};
for (const sheet of SHEETS) {
  const list = [];
  walk(stripComments(fs.readFileSync(path.join(ROOT, sheet), 'utf8')), list, '');
  rulesBySheet[sheet] = list;
}

/* (condition, selector) -> sheet -> property -> value */
const index = new Map();
for (const sheet of SHEETS) {
  for (const rule of rulesBySheet[sheet]) {
    const key = rule.cond + ' || ' + rule.sel;
    if (!index.has(key)) index.set(key, {});
    const slot = index.get(key);
    if (!slot[sheet]) slot[sheet] = new Map();
    rule.props.forEach((v, p) => slot[sheet].set(p, v));
  }
}

const conflicts = [];
const duplicates = [];
index.forEach((slot, key) => {
  const sheets = Object.keys(slot);
  if (sheets.length < 2) return;
  const first = slot[sheets[0]], last = slot[sheets[sheets.length - 1]];
  const shared = [...first.keys()].filter(p => last.has(p));
  if (!shared.length) return;
  const differing = shared.filter(p => first.get(p) !== last.get(p));
  const [cond, sel] = key.split(' || ');
  const entry = { sel, cond, sheets, shared, differing, first, last };
  (differing.length ? conflicts : duplicates).push(entry);
});

/* Shared class names, for the record: this is the number that looks alarming
   and mostly is not. */
function classesIn(sheet) {
  const set = new Set();
  for (const rule of rulesBySheet[sheet]) {
    (rule.sel.match(/\.([A-Za-z0-9_-]+)/g) || []).forEach(c => set.add(c.slice(1)));
  }
  return set;
}
const inStyle = classesIn('style.css'), inOs = classesIn('os.css');
const sharedNames = [...inStyle].filter(c => inOs.has(c)).sort();

console.log('cascade: ' + SHEETS.join(' -> ') + '\n');
console.log('  ' + sharedNames.length + ' class names appear in both style.css and os.css');
console.log('  ' + duplicates.length + ' selector(s) duplicated with the SAME value (harmless, just repetition)');
console.log('  ' + conflicts.length + ' selector(s) where two sheets set one property differently\n');

if (process.argv.includes('--verbose')) {
  console.log('  shared names: ' + sharedNames.join(' ') + '\n');
  duplicates.forEach(d => console.log('  dup  ' + d.sel + '  [' + d.shared.join(', ') + ']'));
  if (duplicates.length) console.log('');
}

if (conflicts.length) {
  conflicts.forEach(c => {
    console.log('  ' + c.sel + (c.cond ? '   @ ' + c.cond : ''));
    console.log('    ' + c.sheets.join(' then ') + ' -- later wins by load order alone:');
    c.differing.forEach(p => {
      console.log('      ' + p + ': ' + c.first.get(p) + '  ->  ' + c.last.get(p));
    });
  });
  console.log('\n  scope one of them, the way .classic already scopes the rest of its component');
  process.exit(1);
}
console.log('  no property is decided by load order alone');

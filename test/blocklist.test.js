/* The name filter. Three copies of it exist -- os.js, sign-guestbook, save --
   and every one of them decides whether a person is allowed to use their own
   name. This test is the reason the comments in all three are allowed to claim
   there is a guard.
 *
 * WHY IT IS SHAPED LIKE THIS. The previous version of this test asserted "no
 * false positives" against a list of about forty pleasant words I had chosen
 * myself. It passed, and the filter was at the same time rejecting Nigeria,
 * Nigerian, Shiite, Ashkenazi, Hitchcock, Babcock, Peacock, Dickens, Dickinson,
 * Vandyke, spice, grape, cocktail, cockpit, cockroach, torpedo, princely and
 * 714 other ordinary words. A test whose corpus is written by the same person
 * who wrote the filter tests that person's imagination, not the filter.
 *
 * So the corpus is now the system dictionary: about 232,000 words, none of them
 * chosen by anyone with an interest in the result. The ceiling below is a
 * measured number, not an aspiration, and lowering the ceiling requires
 * measuring again.
 *
 * Run: node test/blocklist.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* ------------------------------------------------------------------ loading
   Each implementation is lifted out of its own file and evaluated, rather than
   reimplemented here. A test that reimplements the thing it is testing only
   ever proves the test agrees with itself. */

function loadFromJs(file, from, to) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0) throw new Error(file + ': could not find the blocklist section');
  const body = src.slice(a, b).replace(/^ {2}/gm, '');
  const sandbox = {};
  new Function('exports', body + '\nexports.isBlocked = isBlocked; exports.BLOCK_RAW = BLOCK_RAW;')(sandbox);
  return sandbox;
}

function loadFromTs(file) {
  let src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf('const LEET');
  const b = src.indexOf('\n}\n', src.indexOf('function isBlocked')) + 3;
  if (a < 0 || b < 3) throw new Error(file + ': could not find the blocklist section');
  const body = src.slice(a, b)
    .replace(/: Record<string, string>/g, '')
    .replace(/\(s: string\)|\(word: string\)/g, m => m.replace(/: string/, ''))
    .replace(/: (string|boolean|RegExp)\b/g, '')
    .replace(/\bconst\b/g, 'var');
  const sandbox = {};
  new Function('exports', body + '\nexports.isBlocked = isBlocked; exports.BLOCK_RAW = BLOCK_RAW; exports.SEVERE = SEVERE;')(sandbox);
  return sandbox;
}

const impls = {
  'os.js': loadFromJs('os.js', '  var LEET = {', '  function stampDate'),
  'sign-guestbook': loadFromTs('supabase/functions/sign-guestbook/index.ts'),
  'save': loadFromTs('supabase/functions/save/index.ts'),
  /* Fourth copy. Added with the snake board: a leaderboard is a wall with
     numbers on it, so it gets the wall's filter, and this test is the only
     thing keeping four hand-copied word lists honest. */
  'snake-score': loadFromTs('supabase/functions/snake-score/index.ts'),
};

/* --------------------------------------------------------------- the corpus */

const DICT = '/usr/share/dict/words';
const haveDict = fs.existsSync(DICT);

/* Every one of these must be refused. Direct hits, leet, spacing, padding,
   punctuation-for-a-letter, and the compounds that a whole-word-only filter
   would let through. */
const MUST_BLOCK = [
  'nigger', 'NIGGER', 'n i g g e r', 'n1gg3r', 'niiigger', 'ni.gger', 'n.gger',
  'nigga', 'niggerlover', 'xxniggerxx',
  'faggot', 'f a g g o t', 'f.ggot', 'faggotry', 'ihatefaggots', 'fag', 'f4g', 'f a g',
  'retard', 'r3tard', 'kike', 'kikelover', 'spic', 'chink', 'tranny', 'dyke',
  'gook', 'beaner', 'wetback', 'raghead', 'towelhead',
  'rape', 'cunt', 'whore', 'slut', 'bitch', 'fuck', 'sh1t', 'shit',
  'dick', 'cock', 'pussy', 'nazi', 'hitler', 'kys', 'pedo', 'incel',
];

/* Every one of these must be allowed. Real given names, surnames, place names,
   identities and ordinary words that the old substring filter rejected. */
const MUST_ALLOW = [
  'Nigeria', 'Nigerian', 'Shiite', 'Ashkenazi', 'Cushite', 'Nazir',
  'Hitchcock', 'Babcock', 'Peacock', 'peacock', 'Woodcock', 'Cocker',
  'Dickens', 'Dickinson', 'Dickensian', 'Vandyke',
  'spice', 'spicy', 'allspice', 'auspice', 'grape', 'scrape', 'drape',
  'cocktail', 'cockatoo', 'cockpit', 'cockroach', 'cockney', 'cockle',
  'torpedo', 'princely', 'princeling', 'skyscape', 'skysail', 'pussycat',
  'therapeutic', 'gobbledygook', 'whittler', 'analyst', 'assassin',
  'mochi', 'luna', 'nova', 'bacon', 'knight', 'conny', 'coco', 'kiki',
  'snowball', 'cinnamon', 'marshmallow', 'biscuit', 'pancake', 'pickle',
];

/* Measured against the dictionary on 23 Aug 2026. Raising this number means
   the filter got broader; check what it started rejecting before you do. */
const FP_CEILING = 30;

/* ------------------------------------------------------------------- checks */

const bad = [];
const isBlocked = impls['os.js'].isBlocked;

MUST_BLOCK.forEach(w => { if (!isBlocked(w)) bad.push(`GETS THROUGH: ${JSON.stringify(w)}`); });
MUST_ALLOW.forEach(w => { if (isBlocked(w)) bad.push(`FALSE POSITIVE: ${JSON.stringify(w)} is refused`); });

/* every copy must agree, word for word and verdict for verdict */
const ref = impls['os.js'].BLOCK_RAW.slice().sort().join(',');
for (const [name, impl] of Object.entries(impls)) {
  if (name === 'os.js') continue;
  if (impl.BLOCK_RAW.slice().sort().join(',') !== ref) {
    const a = new Set(impls['os.js'].BLOCK_RAW), b = new Set(impl.BLOCK_RAW);
    bad.push(`DRIFT: ${name} word list differs -- ` +
      `only in os.js: [${[...a].filter(w => !b.has(w))}] ` +
      `only in ${name}: [${[...b].filter(w => !a.has(w))}]`);
  }
  const probes = MUST_BLOCK.concat(MUST_ALLOW);
  const differ = probes.filter(w => impl.isBlocked(w) !== isBlocked(w));
  if (differ.length) bad.push(`DRIFT: ${name} disagrees with os.js on: ${differ.slice(0, 6).join(', ')}`);
}

let fpCount = null, sample = [];
if (haveDict) {
  const slurs = new Set(impls['os.js'].BLOCK_RAW);
  const words = fs.readFileSync(DICT, 'latin1').split('\n')
    .map(w => w.trim())
    .filter(w => w.length >= 3 && w.length <= 16 && /^[A-Za-z]+$/.test(w));
  const fp = words.filter(w => !slurs.has(w.toLowerCase()) && isBlocked(w));
  fpCount = fp.length;
  sample = fp.slice(0, 12);
  if (fpCount > FP_CEILING) {
    bad.push(`FALSE POSITIVES: ${fpCount} dictionary words refused, ceiling is ${FP_CEILING}. ` +
             `e.g. ${sample.join(', ')}`);
  }
}

/* ------------------------------------------------------------------ report */

console.log(`${impls['os.js'].BLOCK_RAW.length} blocked words across 3 implementations`);
console.log(`  ${MUST_BLOCK.length} evasions, ${MUST_ALLOW.length} names that must be allowed`);
if (haveDict) console.log(`  ${fpCount} false positives against ${DICT} (ceiling ${FP_CEILING})` +
                          (sample.length ? `: ${sample.join(', ')}` : ''));
else console.log(`  no ${DICT} on this machine, dictionary sweep skipped`);

if (bad.length) { console.log(`FAIL (${bad.length}):`); bad.forEach(b => console.log('  ' + b)); }
else console.log('  every evasion refused, every name allowed, all four copies agree');
process.exit(bad.length ? 1 : 0);

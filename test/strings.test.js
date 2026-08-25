// Every S.<path> that os.js reads must resolve, and every value must be shaped
// the way the code expects. The resolution half would have caught a leaf-name
// removal eating the wrong key. The integrity half would have caught the copy
// round-trip baking "**icy:**" markdown prefixes into credits.roles and leaving
// the pre-edit row alive underneath it -- a script wrote structure into a data
// file and the output was never re-read.
const ROOT = require('path').join(__dirname, '..');
global.window = {};
require(ROOT + '/os-strings.js');
const S = global.window.OS_STRINGS;
const code = require('fs').readFileSync(ROOT + '/os.js', 'utf8');

// ---- 1. every static path resolves ----
const paths = [...new Set((code.match(/\bS\.[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g) || []))];
const get = p => p.split('.').slice(1).reduce((a, k) => (a === undefined ? a : a[k]), S);
const missing = paths.filter(p => get(p) === undefined);

// ---- 2. every leaf value is well-formed copy ----
const bad = [];
const leaves = [];
(function walk(node, path) {
  if (typeof node === 'string') {
    leaves.push(path);
    if (node.includes('**')) bad.push(path + ': markdown prefix -- ' + JSON.stringify(node));
    if (node.includes('—')) bad.push(path + ': em dash -- ' + JSON.stringify(node));
    if (node.includes('undefined')) bad.push(path + ': literal "undefined"');
    if (!node.trim() && !['term.prompt', 'ach.progress'].includes(path)) bad.push(path + ': empty');
    const o = (node.match(/{/g) || []).length, c = (node.match(/}/g) || []).length;
    if (o !== c) bad.push(path + ': unbalanced braces');
    return;
  }
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, path + '[' + i + ']'));
  if (node && typeof node === 'object') return Object.keys(node).forEach(k => walk(node[k], path ? path + '.' + k : k));
})(S, '');

// ---- 3. tables the renderers index positionally ----
const shapes = [
  ['credits.roles', S.credits.roles, 2, r => r.every(v => typeof v === 'string')],
  ['ach.defs', S.ach.defs, 4, r => r.every(v => typeof v === 'string')],
];
shapes.forEach(([name, table, arity, ok]) => {
  if (!Array.isArray(table)) return bad.push(name + ': not an array');
  table.forEach((row, i) => {
    if (!Array.isArray(row) || row.length !== arity || !ok(row)) {
      bad.push(name + '[' + i + ']: expected ' + arity + ' strings, got ' + JSON.stringify(row));
    }
  });
  const seen = new Set(), dupes = [];
  table.forEach(r => { const k = JSON.stringify(r); if (seen.has(k)) dupes.push(k); seen.add(k); });
  dupes.forEach(d => bad.push(name + ': duplicate row ' + d));
});

/* Third check: every data-fill in the markup must be claimed by the FILLS
   table in os.js. A data-fill with no entry renders as an empty element and
   reports nothing, which is exactly how the faq intro line shipped blank --
   the string existed, the markup existed, the wire between them did not.
   Slots (data-slot) are written imperatively and are not part of this. */
const html = require('fs').readFileSync(ROOT + '/index.html', 'utf8');
const declared = new Set();
const start = code.indexOf('\n  var FILL = {');
const fillTable = code.slice(start, code.indexOf('\n  };', start));
for (const m of fillTable.matchAll(/(?:'([a-z0-9-]+)'|^\s{4}([a-z0-9]+))\s*:/gm)) declared.add(m[1] || m[2]);
const used = new Set([...html.matchAll(/data-fill="([^"]+)"/g)].map(m => m[1]));
/* Five targets are written imperatively rather than from the table: the icy
   status pill, the phone notification, the bear's line, the capture note.
   Those are claimed by os.js naming the selector, which is just as much a
   wire as a table entry. What must never pass is a data-fill that NOTHING
   anywhere writes to. */
for (const m of code.matchAll(/data-fill="([a-z0-9-]+)"/g)) declared.add(m[1]);
const orphans = [...used].filter(k => !declared.has(k));
if (!declared.size) bad.push('FILL table not found in os.js, the data-fill check did not run');

console.log(paths.length + ' string paths read by os.js, ' + leaves.length + ' leaf values');
console.log(used.size + ' data-fill targets in the markup, ' + declared.size + ' declared in FILL');
if (orphans.length) { console.log('UNCLAIMED data-fill (' + orphans.length + '):'); orphans.forEach(o => console.log('  ' + o)); bad.push('unclaimed data-fill: ' + orphans.join(', ')); }
else console.log('  every data-fill in the markup is wired');
if (missing.length) { console.log('UNRESOLVED (' + missing.length + '):'); missing.forEach(m => console.log('  ' + m)); }
else console.log('  all paths resolve');
if (bad.length) { console.log('MALFORMED (' + bad.length + '):'); bad.forEach(b => console.log('  ' + b)); }
else console.log('  all values well-formed, all positional tables correctly shaped');
process.exit(missing.length + bad.length ? 1 : 0);

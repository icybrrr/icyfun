/* Multi-user claims check.
 *
 * The guestbook shipped as a wall of one for its whole life. Every gate in this
 * project runs inside ONE browser context -- the jsdom suites, containment,
 * strings-check, the contrast maths -- and none of them can express "this
 * feature needs state to cross between two people". So nothing failed, and five
 * strings kept promising a social feature that could not exist.
 *
 * This asserts that any user-facing copy implying other people is backed by
 * real shared state. Adding such a string without a backend fails the build.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

global.window = {};
new Function(fs.readFileSync(path.join(ROOT, 'os-strings.js'), 'utf8'))
  .call({ window: global.window });
const S = global.window.OS_STRINGS;
const os = fs.readFileSync(path.join(ROOT, 'os.js'), 'utf8');

/* Does the codebase actually talk to a shared store? */
const HAS_BACKEND = /fetch\(\s*GB\.url/.test(os) && /rest\/v1\/guestbook/.test(os);

/* No trailing \b: `visitor #{n}` is followed by `{`, which is not a word
   character, so a closing boundary could never match and whoami slipped the
   net on the first run of this very test. */
const IMPLIES_OTHERS =
  /(nobody has signed|be the reason|welcome to the wall|per visitor|\bothers\b|\beveryone\b|visitor #)/i;

const flagged = [];
(function walk(node, p) {
  if (typeof node === 'string') {
    if (IMPLIES_OTHERS.test(node)) flagged.push([p, node]);
    return;
  }
  if (Array.isArray(node)) return node.forEach((v, i) => walk(v, p + '[' + i + ']'));
  if (node && typeof node === 'object')
    return Object.keys(node).forEach(k => walk(node[k], p ? p + '.' + k : k));
})(S, '');

let fail = 0;
console.log('strings implying other people: ' + flagged.length);
for (const [p, v] of flagged) {
  /* whoami is the known second offender: it prints an invented base of 1246
     plus THIS browser's refresh count, presented as a real visitor number. */
  const invented = /visitor #/.test(v) && /1246 \+ visits\.count/.test(os);
  const ok = HAS_BACKEND && !invented;
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + p + ' :: ' + v);
}

console.log(fail
  ? '\n' + fail + ' claim(s) not backed by shared state'
  : '\nevery multi-user claim is backed by the table');
process.exit(fail ? 1 : 0);

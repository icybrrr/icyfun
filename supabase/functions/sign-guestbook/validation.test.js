/* Guestbook name validation — security gate. Run: node validation.test.js
 *
 * These names arrive from strangers and land on a portfolio site, so every rule
 * is tested against hostile input rather than assumed. Two things in particular:
 *
 *  - Every injection payload here is UNDER the 14-grapheme cap, so the length
 *    check cannot mask a hole in the character allowlist. An earlier run "passed"
 *    only because the payloads were long, which proved nothing.
 *  - The client keeps its own copy of the pattern (no build step, so it is
 *    duplicated deliberately). The last assertion is that the two copies are
 *    byte-identical, because this whole feature exists thanks to a client-side
 *    assumption that never matched the server.
 */
const fs = require('fs');
const path = require('path');
const HERE = __dirname;

// pull the real logic out of the Edge Function rather than restating it
let src = fs.readFileSync(path.join(HERE, 'index.ts'), 'utf8');
src = src.slice(0, src.indexOf('function cors('))
  .replace(/\)\s*:\s*[A-Za-z<>\[\]|,\s]+?\s*\{/g, ') {')
  .replace(/:\s*Record<[^>]*>\s*=/g, ' =')
  .replace(/const (\w+):\s*[A-Za-z<>\[\]|,\s]+?\s*=/g, 'const $1 =')
  .replace(/\((\w+)\s*:\s*[A-Za-z\[\]| ]+\)/g, '($1)')
  .replace('// @ts-ignore -- available in Deno', '');
const V = {};
new Function('exports', src + '\nObject.assign(exports,' +
  '{NAME_RE,HAS_ALNUM,RESERVED,foldConfusables,isBlocked,graphemes});')(V);

function check(raw) {
  const n = String(raw).normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!n) return 'empty';
  if (V.graphemes(n) > 16) return 'too_long';
  if (!V.NAME_RE.test(n)) return 'charset';
  if (!V.HAS_ALNUM.test(n)) return 'charset';
  if (V.RESERVED.includes(V.foldConfusables(n))) return 'reserved';
  if (V.isBlocked(n)) return 'rejected';
  return 'ACCEPT';
}

const CASES = [
  // injection — all short, so `charset` must be the thing that stops them
  ['<b>x', 'charset'], ['"onx=1', 'charset'], ['<svg/', 'charset'],
  ['a<b', 'charset'], ['a>b', 'charset'], ['a&b', 'charset'],
  ["a'b", 'charset'], ['a"b', 'charset'], ['a/b', 'charset'],
  ['a\\b', 'charset'], ['a`b', 'charset'], ['a(b', 'charset'],
  ['a;b', 'charset'], ['a=b', 'charset'], ['j&#97;v', 'charset'],
  // invisible-character tricks the blocklist alone cannot see
  ['n​igger', 'charset'], ['n‍igger', 'charset'],
  ['‮icy', 'charset'], ['á́́́́', 'charset'],
  ['🐻 bear', 'charset'],
  // slurs, through every evasion the normaliser was built for
  ['ｆｕｃｋ', 'rejected'], ['n1gg3r', 'rejected'],
  ['n.gger', 'rejected'], ['n i g g e r', 'rejected'],
  ['nnnigger', 'rejected'], ['f4gg0t', 'rejected'],
  // impersonation
  ['icy', 'reserved'], ['ICY', 'reserved'], ['іcy', 'reserved'],
  ['icygobrrr', 'reserved'], ['@icygobrrr', 'reserved'],
  ['admin', 'reserved'], ['icybear', 'reserved'],
  // shape
  ['...', 'charset'], ['@@@', 'charset'], ['   ', 'empty'], ['', 'empty'],
  ['abcdefghijklmnopq', 'too_long'],
  // real people must get through
  ['icybearfan', 'ACCEPT'], ['bear_fan', 'ACCEPT'], ['icy.stan', 'ACCEPT'],
  ['José', 'ACCEPT'], ['Müller', 'ACCEPT'], ['Łukasz', 'ACCEPT'],
  ['日本語', 'ACCEPT'], ['Маша', 'ACCEPT'],
  ['bear 2026', 'ACCEPT'], ['a', 'ACCEPT'], ['abcdefghijklmnop', 'ACCEPT'],
];

let fail = 0;
for (const [input, want] of CASES) {
  const got = check(input);
  if (got !== want) {
    fail++;
    console.log('FAIL ' + JSON.stringify(input) + ' -> ' + got + ' (want ' + want + ')');
  }
}

/* the client's copy must not drift from the server's */
const client = fs.readFileSync(path.join(HERE, '..', '..', '..', 'os.js'), 'utf8');
const serverPattern = String(V.NAME_RE);
if (!client.includes(serverPattern)) {
  fail++;
  console.log('FAIL client os.js does not carry the identical NAME_RE: ' + serverPattern);
}

console.log(fail
  ? '\n' + fail + ' FAILURES'
  : CASES.length + ' vectors correct, client pattern in sync');
process.exit(fail ? 1 : 0);

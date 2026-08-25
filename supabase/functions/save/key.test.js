/* Product key parsing -- run: node key.test.js
 *
 * The checksum is the whole reason a mistyped key never reaches the server, so
 * it gets tested against real transcription mistakes rather than happy paths.
 */
const fs = require('fs'), path = require('path');
let src = fs.readFileSync(path.join(__dirname, 'index.ts'), 'utf8');
src = src.slice(0, src.indexOf('// ---- what a save is allowed to contain'))
  .replace(/\)\s*:\s*[A-Za-z<>\[\]|,\s]+?\s*\{/g, ') {')
  .replace(/const (\w+)\s*:\s*[A-Za-z<>\[\]|,\s]+?\s*=/g, 'const $1 =')
  .replace(/\((\w+)\s*:\s*[A-Za-z\[\]| ]+\)/g, '($1)')
  .replace(/^const ALLOWED_ORIGINS[\s\S]*?\]\);$/m, '');
const V = {};
new Function('exports', src + '\nObject.assign(exports,{A32,PREFIX,BODY_LEN,checkChar,canonical,fold,parseKey});')(V);

function mint(seed) {
  let body = '';
  for (let i = 0; i < V.BODY_LEN; i++) body += V.A32[(seed * (i + 7) * 31 + i) % 32];
  return V.PREFIX + body + V.checkChar(body);
}
const key = mint(11);
const pretty = key.slice(0, 5) + '-' + key.slice(5, 10) + '-' + key.slice(10, 15) +
               '-' + key.slice(15, 20) + '-' + key.slice(20);

let fail = 0;
const t = (label, got, want) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + ' ' + label.padEnd(34) + ' ' + got);
};

console.log('minted: ' + pretty);
console.log('\nMUST PARSE');
t('the key itself', V.parseKey(key) !== null, true);
t('with hyphens', V.parseKey(pretty) !== null, true);
t('lowercase', V.parseKey(pretty.toLowerCase()) !== null, true);
t('with stray spaces', V.parseKey(' ' + pretty + ' ') !== null, true);
/* Crockford folds these, so a key copied off paper survives the classic slips */
t('O typed for 0', V.parseKey(pretty.replace(/0/g, 'O')) !== null, true);
t('I typed for 1', V.parseKey(pretty.replace(/1/g, 'I')) !== null, true);
t('l typed for 1', V.parseKey(pretty.replace(/1/g, 'l')) !== null, true);

console.log('\nMUST REJECT');
const swap = (s, i) => s.slice(0, i) + (s[i] === 'A' ? 'B' : 'A') + s.slice(i + 1);
t('one character mistyped', V.parseKey(swap(key, 8)), null);
t('two characters swapped', V.parseKey(key.slice(0,7) + key[8] + key[7] + key.slice(9)), null);
t('checksum wrong', V.parseKey(key.slice(0, -1) + (key.slice(-1) === 'Z' ? 'Y' : 'Z')), null);
t('too short', V.parseKey(key.slice(0, -1)), null);
t('too long', V.parseKey(key + 'A'), null);
t('wrong prefix', V.parseKey('XXXXX' + key.slice(5)), null);
t('empty', V.parseKey(''), null);
t('junk', V.parseKey('hello world'), null);
t('sql-ish', V.parseKey("' or 1=1--"), null);

/* every single-character mistype in the body must be caught, not just one */
let missed = 0;
for (let i = V.PREFIX.length; i < key.length - 1; i++) {
  for (const c of V.A32) {
    if (c === key[i]) continue;
    const bad = key.slice(0, i) + c + key.slice(i + 1);
    if (V.fold(V.canonical(bad)) === V.fold(V.canonical(key))) continue;  // folded equivalent
    if (V.parseKey(bad) !== null) missed++;
  }
}
/* and every transposition of two adjacent characters */
let tmissed = 0, ttotal = 0;
for (let i = V.PREFIX.length; i < key.length - 2; i++) {
  if (key[i] === key[i + 1]) continue;
  const bad = key.slice(0, i) + key[i + 1] + key[i] + key.slice(i + 2);
  if (V.fold(V.canonical(bad)) === V.fold(V.canonical(key))) continue;
  ttotal++;
  if (V.parseKey(bad) !== null) tmissed++;
}
console.log('\nEXHAUSTIVE');
t('every single-char typo caught', missed, 0);
console.log('  --   adjacent transpositions caught  ' +
            (ttotal - tmissed) + '/' + ttotal + '  (known partial, see comment)');

/* The client and server implementations must agree, and grepping for symbol
 * names does not prove that. Extract the client's real functions and run every
 * key through both: a key minted by one must parse in the other, and their
 * checksums must be identical for the same input. */
const os = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'os.js'), 'utf8');
const grab = (name) => {
  const at = os.indexOf('function ' + name + '(');
  if (at === -1) throw new Error('client is missing ' + name);
  let d = 0, i = os.indexOf('{', at);
  for (let j = i; j < os.length; j++) {
    if (os[j] === '{') d++;
    else if (os[j] === '}' && --d === 0) return os.slice(at, j + 1);
  }
  throw new Error('unbalanced ' + name);
};
const C = {};
new Function('exports',
  "var A32='" + V.A32 + "';var KEY_PREFIX='" + V.PREFIX + "';var KEY_BODY=" + V.BODY_LEN + ";" +
  grab('checkChar') + grab('foldKey') + grab('canonKey') + grab('parseKey') +
  '\nObject.assign(exports,{checkChar,parseKey});')(C);

let drift = 0;
for (let n = 0; n < 500; n++) {
  let body = '';
  for (let i = 0; i < V.BODY_LEN; i++) body += V.A32[(n * 7 + i * 13 + i * i) % 32];
  if (V.checkChar(body) !== C.checkChar(body)) drift++;            // same checksum
  const k = V.PREFIX + body + V.checkChar(body);
  if ((V.parseKey(k) === null) !== (C.parseKey(k) === null)) drift++;  // same verdict
  const bad = k.slice(0, 9) + (k[9] === 'A' ? 'B' : 'A') + k.slice(10);
  if ((V.parseKey(bad) === null) !== (C.parseKey(bad) === null)) drift++;
}
t('client/server agree on 500 keys', drift, 0);

console.log(fail ? '\n' + fail + ' FAILURES' : '\nkey handling correct');
process.exit(fail ? 1 : 0);

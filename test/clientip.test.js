/* clientIp() decides whose rate-limit bucket a request lands in, and getting it
 * wrong in one direction is an outage: if every visitor resolves to the same
 * address, gb_sign closes the guestbook for everybody after four signatures.
 *
 * So the arithmetic gets tested rather than reasoned about, at every hop count,
 * against a forger who prepends an arbitrary number of invented entries. Both
 * copies of the function are lifted from the real files and must agree.
 *
 * Run: node test/clientip.test.js
 */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const FILES = ['supabase/functions/sign-guestbook/index.ts',
               'supabase/functions/save/index.ts'];
const bad = [];

/* Lift the real source, strip the TypeScript, and let the test choose
   TRUSTED_HOPS so every hop count can be exercised. */
function load(file, hops) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const a = src.indexOf('const TRUSTED_HOPS');
  const b = src.indexOf('\n}', src.indexOf('function clientIp')) + 2;
  if (a < 0 || b < 2) throw new Error(file + ': clientIp not found');
  const body = src.slice(a, b)
    .replace(/const TRUSTED_HOPS: number \| null = null;/, 'const TRUSTED_HOPS = ' + hops + ';')
    .replace(/\(req: Request\)/, '(req)').replace(/: string\b/g, '');
  const e = {};
  new Function('exports', body + '\nexports.clientIp = clientIp;')(e);
  return e.clientIp;
}
const mk = xff => ({ headers: { get: () => xff } });

const CLIENT = '203.0.113.7';
for (const file of FILES) {
  /* hops = how many proxies append. An honest request therefore arrives with
     exactly `hops` entries and the visitor leftmost. */
  for (let hops = 1; hops <= 4; hops++) {
    const clientIp = load(file, hops);
    const chain = Array.from({ length: hops - 1 }, (_, i) => '10.0.0.' + (i + 1));
    const honest = [CLIENT, ...chain].join(', ');
    if (clientIp(mk(honest)) !== CLIENT) {
      bad.push(`${file} hops=${hops}: honest request resolved to ` +
               `${clientIp(mk(honest))}, expected ${CLIENT}`);
    }
    /* the whole point: no number of invented entries moves the answer */
    for (const fakes of [1, 3, 12]) {
      const forged = [...Array.from({ length: fakes }, (_, i) => '1.2.3.' + i),
                      CLIENT, ...chain].join(', ');
      if (clientIp(mk(forged)) !== CLIENT) {
        bad.push(`${file} hops=${hops}: ${fakes} forged entries moved the bucket to ` +
                 `${clientIp(mk(forged))}`);
      }
    }
  }
  /* null means "not measured yet" and must be exactly the old behaviour, so
     that deploying this change on its own alters nothing. */
  const asShipped = load(file, null);
  if (asShipped(mk('1.2.3.4, 5.6.7.8')) !== '1.2.3.4') {
    bad.push(`${file}: with TRUSTED_HOPS unset the result changed; it must stay leftmost`);
  }
  if (asShipped(mk('')) !== 'unknown') bad.push(`${file}: empty header must give "unknown"`);
  if (asShipped(mk('  ,  , ')) !== 'unknown') bad.push(`${file}: junk header must give "unknown"`);
}

/* the two copies must be the same code, not merely both correct today */
const norm = f => {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const a = s.indexOf('const TRUSTED_HOPS');
  return s.slice(a, s.indexOf('\n}', s.indexOf('function clientIp')) + 2);
};
if (norm(FILES[0]) !== norm(FILES[1])) bad.push('DRIFT: the two clientIp copies differ');

console.log('clientIp: 4 hop counts x {honest, 1/3/12 forged entries} x 2 implementations');
if (bad.length) { console.log(`FAIL (${bad.length}):`); bad.forEach(b => console.log('  ' + b)); }
else console.log('  the visitor resolves correctly at every hop count, no forgery moves the bucket,\n' +
                 '  the unmeasured default is byte-for-byte the old behaviour, both copies agree');
process.exit(bad.length ? 1 : 0);

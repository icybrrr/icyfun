/* Two things a Content-Security-Policy gets silently wrong.
 *
 * 1. 404.html allows its one inline script by HASH. Edit that script by a
 *    single character and the browser refuses to run it, with no error anyone
 *    sees except in a console nobody has open on an error page.
 * 2. A policy drifts behind the code. Add a fetch to a new host, or an <img>
 *    pointing somewhere new, and the request is blocked at runtime rather than
 *    failing here.
 *
 * Run: node test/csp.test.js
 */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const bad = [];

const PAGES = ['index.html', 'chart/index.html', 'classic/index.html', '404.html'];
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ---- 1. every page carries a policy, and it starts from deny ---- */
const policies = {};
for (const p of PAGES) {
  const m = read(p).match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  if (!m) { bad.push(`${p}: no Content-Security-Policy`); continue; }
  policies[p] = m[1];
  if (!/default-src 'none'/.test(m[1])) bad.push(`${p}: policy does not start from default-src 'none'`);
  if (/unsafe-eval|unsafe-inline[^;]*script/.test(m[1])) bad.push(`${p}: script rule is not strict`);
}

/* ---- 2. the 404 hash still matches the script it is vouching for ---- */
{
  const s = read('404.html');
  const inline = [...s.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter(m => !/src=/.test(m[1]));
  if (inline.length !== 1) bad.push(`404.html: expected exactly 1 inline script, found ${inline.length}`);
  else {
    const want = 'sha256-' + crypto.createHash('sha256').update(inline[0][2], 'utf8').digest('base64');
    if (!(policies['404.html'] || '').includes(want)) {
      bad.push(`404.html: the inline script changed but the CSP hash did not.\n` +
               `      put this in the policy: '${want}'`);
    }
  }
}

/* ---- 3. every host the code actually contacts is allowed ---- */
const CODE = ['os.js', 'chart/chart.js', 'info.js', 'script.js', 'sfx.js', 'sky.js', 'wordmark.js'];
const hosts = new Set();
for (const f of CODE) {
  for (const m of read(f).matchAll(/https:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) hosts.add(m[1].toLowerCase());
}
/* hosts that are navigated to rather than fetched: window.open and <a href>
   are not gated by any fetch directive, so they need no entry in the policy. */
const NAVIGATED = new Set(['x.com', 't.me', 'discord.com', 'icybear.fun', 'www.w3.org']);
const allowed = new Set();
for (const pol of Object.values(policies)) {
  for (const m of pol.matchAll(/https:\/\/([a-z0-9.-]+)/gi)) allowed.add(m[1].toLowerCase());
}
for (const h of hosts) {
  if (NAVIGATED.has(h) || allowed.has(h)) continue;
  bad.push(`host ${h} appears in the code but no page allows it`);
}

/* ---- report ---- */
console.log(`${PAGES.length} pages carry a policy`);
console.log(`  ${hosts.size} https hosts in the code, ${allowed.size} allowed by policy, ` +
            `${[...hosts].filter(h => NAVIGATED.has(h)).length} navigated not fetched`);
if (bad.length) { console.log(`FAIL (${bad.length}):`); bad.forEach(b => console.log('  ' + b)); }
else console.log('  policies start from deny, the 404 hash matches, every fetched host is allowed');
process.exit(bad.length ? 1 : 0);

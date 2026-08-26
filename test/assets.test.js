/* Every local css/js reference must carry the ?v= stamp.
 *
 * WHY THIS TEST EXISTS. The references were bare filenames, so a returning
 * visitor could be handed fresh markup and a script their browser still had
 * from a previous deploy. The failure that produced is silent and specific:
 * data-fill looks its key up, finds nothing in the stale strings file, and
 * leaves the element empty -- so a window renders its furniture and none of
 * its words, with no error anywhere. It looks like a styling bug and it is a
 * caching one, which is the worst possible combination to debug.
 *
 * The stamp is manual, which means it can be forgotten, which means the one
 * asset that gets forgotten is the one that breaks. Hence a test.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PAGES = ['index.html', 'chart/index.html', 'classic/index.html', '404.html'];

let refs = 0, bad = [], versions = new Set();
for (const page of PAGES) {
  const file = path.join(ROOT, page);
  if (!fs.existsSync(file)) continue;
  const src = fs.readFileSync(file, 'utf8');
  const re = /(?:href|src)="([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const url = m[1];
    if (/^(https?:|\/\/|data:|#|mailto:)/.test(url)) continue;
    if (!/\.(css|js)(\?|$)/.test(url)) continue;
    refs += 1;
    const v = url.match(/\?v=([\w.]+)$/);
    if (!v) bad.push(page + ' -> ' + url);
    else versions.add(v[1]);
  }
}

console.log(refs + ' local css/js references across ' + PAGES.length + ' pages');
if (bad.length) {
  console.log('\nUNVERSIONED (' + bad.length + '):');
  bad.forEach((b) => console.log('  ' + b));
  process.exit(1);
}
if (versions.size > 1) {
  /* One stamp per deploy. Two means half the site was bumped and half was not,
     which is the same stale pairing this test exists to prevent. */
  console.log('\nMIXED VERSIONS: ' + [...versions].join(', '));
  process.exit(1);
}
console.log('  every one carries ?v=' + [...versions][0]);

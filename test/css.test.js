/* A single stray '}' in chart.css silently discarded every rule after line 94
   -- the whole menu bar, the sky, the result controls. Nothing failed; things
   just quietly stopped being styled, and it took a screenshot to notice.
   Brace balance is cheap to check and catches the whole class. */
const ROOT = require('path').join(__dirname, '..');
const fs = require('fs');
const FILES = ['fonts.css', 'style.css', 'tokens.css', 'sky.css', 'os.css', 'chart/chart.css'];
const bad = [];

function strip(src) {
  let out = '', i = 0;
  while (i < src.length) {
    if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) { out += '\n/* UNTERMINATED */'; break; }
      /* keep the newlines so line numbers survive */
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end + 2;
    } else { out += src[i]; i++; }
  }
  return out;
}

for (const f of FILES) {
  const s = fs.readFileSync(ROOT + '/' + f, 'utf8');
  let depth = 0, line = 1, first = null, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\n') line++;
    else if (c === '/' && s[i + 1] === '*') {
      /* indexOf returns -1 on a comment that is never closed, and `i = j + 1`
         then set i to 0 and restarted the scan from the top, forever. The test
         hung instead of failing on exactly the corruption it is here to find. */
      const j = s.indexOf('*/', i + 2);
      if (j < 0) { bad.push(`${f}: a /* comment is never closed`); break; }
      line += (s.slice(i, j).match(/\n/g) || []).length; i = j + 1;
    }
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth < 0 && first === null) first = line; }
    i++;
  }
  if (depth !== 0) bad.push(`${f}: brace depth ends at ${depth}${first ? `, first stray } on line ${first}` : ''}`);
  else console.log(`  ${f.padEnd(16)} balanced`);
}
/* Brace balance cannot see a file that has been duplicated into itself: every
   block still closes, the totals still match, and the sheet still parses. It
   happened on 23 Aug 2026 -- a bad splice grafted os.css onto its own middle and
   grew it from 3.7k lines to 9k, three copies of every rule, and this test
   passed clean.

   Counting repeated selectors does not work as a signal: a stylesheet
   re-declares selectors on purpose all the time, and os.css legitimately has 15.
   What never happens on purpose is a long RUN of selectors repeating in the same
   order. That is the actual signature of a file spliced into itself, and it
   needs no threshold to tune. */
const RUN = 20;
for (const f of FILES) {
  /* Index scan, not a regex. /\/\*[\s\S]*?\*\//g backtracks catastrophically on a
     file whose last comment is never closed, and an unterminated comment is
     precisely the corruption this test exists to catch: it hung for minutes
     instead of failing. */
  const s = strip(fs.readFileSync(ROOT + '/' + f, 'utf8'));
  const sels = [];
  let depth = 0;
  for (const line of s.split('\n')) {
    const opens = (line.match(/{/g) || []).length, closes = (line.match(/}/g) || []).length;
    if (depth === 0 && opens > 0) {
      const sel = line.slice(0, line.indexOf('{')).trim();
      if (sel && !sel.startsWith('@')) sels.push(sel);
    }
    depth += opens - closes;
  }
  const seen = new Map();
  for (let i = 0; i + RUN <= sels.length; i++) {
    const key = sels.slice(i, i + RUN).join('\u0000');
    if (seen.has(key)) {
      bad.push(`${f}: ${RUN} selectors repeat verbatim at index ${seen.get(key)} and ${i} ` +
               `(starting "${sels[i]}"). The file looks spliced onto itself.`);
      break;
    }
    seen.set(key, i);
  }
}

if (bad.length) { console.log('FAIL:'); bad.forEach(b => console.log('  ' + b)); }
else console.log('  every stylesheet closes every block it opens, none is spliced onto itself');
process.exit(bad.length ? 1 : 0);

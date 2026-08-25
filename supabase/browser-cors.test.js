/* Can a real browser actually call the Edge Functions?
 *
 * Every other test in this project uses curl, node or jsdom -- and none of them
 * enforce CORS. So both functions shipped with an Access-Control-Allow-Headers
 * that omitted `apikey` and `authorization`: the preflight returned 200 while
 * withholding the very headers Supabase requires, browsers refused to send the
 * request, and the whole suite stayed green while the guestbook could not be
 * signed by anyone at all.
 *
 * This drives a real browser and sends a DELIBERATELY INVALID payload. A 400
 * proves the request reached the function, which is the only thing in question.
 * Nothing is written, so it is safe to run any number of times.
 *
 * Run: node supabase/browser-cors.test.js     (needs the dev server on :8000)
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

const os = fs.readFileSync(path.join(ROOT, 'os.js'), 'utf8');
const url = (os.match(/url:\s*'(https:\/\/[^']+)'/) || [])[1];
const key = (os.match(/key:\s*'(sb_[^']+)'/) || [])[1];
if (!url || !key) { console.log('no backend configured in os.js; skipping'); process.exit(0); }

const page = `<!doctype html><meta charset=utf-8><body><pre id=out>running</pre><script>
const U=${JSON.stringify(url)}, K=${JSON.stringify(key)};
async function probe(fn, body){
  try{
    const r = await fetch(U+'/functions/v1/'+fn, {method:'POST',
      headers:{'Content-Type':'application/json', apikey:K, Authorization:'Bearer '+K},
      body: JSON.stringify(body)});
    return fn+': reached (HTTP '+r.status+')';
  }catch(e){ return fn+': BLOCKED -- '+e.message; }
}
Promise.all([
  probe('save', {op:'create', key:'not-a-valid-key'}),
  probe('sign-guestbook', {name:'<invalid>', stamp:999}),
]).then(r=>{ document.getElementById('out').textContent = r.join('\\n'); });
</script></body>`;

const tmp = path.join(ROOT, '_cors_probe.html');
fs.writeFileSync(tmp, page);
try {
  const dom = execFileSync(BRAVE, ['--headless', '--disable-gpu', '--hide-scrollbars',
    '--dump-dom', '--virtual-time-budget=9000',
    'http://localhost:8000/_cors_probe.html'], { encoding: 'utf8', stdio: ['ignore','pipe','ignore'] });
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  const text = (m ? m[1] : 'probe did not report')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  console.log(text.split('\n').map(l => '  ' + l).join('\n'));
  const blocked = /BLOCKED/.test(text) || /did not report/.test(text);
  console.log(blocked ? '\nCORS FAILURE: a browser cannot call these'
                      : '\nboth functions are callable from a real browser');
  process.exit(blocked ? 1 : 0);
} finally {
  fs.unlinkSync(tmp);
}

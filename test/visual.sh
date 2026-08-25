#!/bin/zsh
# Deterministic screenshots of every theme x weather combination.
#
#   test/visual.sh before      capture the 20-combo set into test/.shots/before
#   test/visual.sh after       ... into test/.shots/after
#   test/visual-diff.py        compare them
#
# WHY IT HAS TO BE DETERMINISTIC. The sky seeds sprite pools from Math.random,
# the standee picks a pose from the same sequence, and the clock moves. Without
# pinning all three, every diff is drowned in noise and the one pixel that
# matters is invisible. With them pinned, two runs of identical code produce a
# 0px diff, which is what makes a diff meaningful at all.
#
# Three things are pinned and each was learned the hard way:
#
#   1. Math.random is seeded. Otherwise stars, motifs and rain move every run.
#   2. Animations are pinned by a stylesheet injected into <head>, BEFORE any of
#      them start. Pausing later via getAnimations() misses anything created on
#      first paint (2336px of noise), and injecting the stylesheet late is worse
#      because elements jump to the new delay and the capture catches the jump
#      (8640px). In <head> they simply never move: 0px.
#   3. The standee pose and both clocks are set explicitly. Seeding is not
#      enough on its own: the pose is drawn from the SAME sequence as the sky
#      sprites, so any change that adds or removes one random call downstream
#      shifts the pose and lights up 110k pixels that have nothing to do with
#      the change under test.
#
# The page's own CSP forbids inline script, which is the mechanism this uses,
# so the policy is stripped from the throwaway copy only. The real pages keep
# it; test/csp.test.js is what checks the policy itself.

set -e
LABEL="${1:-before}"
ROOT="${0:A:h}/.."
OUT="$ROOT/test/.shots/$LABEL"
BRAVE="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
WALLS=(base holo strawberry arcade archangel)
MODES=(day night rain snow)
W="${W:-1440}"
H="${H:-900}"

cd "$ROOT"
mkdir -p "$OUT"
setopt NULL_GLOB
rm -f "$OUT"/*.png
unsetopt NULL_GLOB

lsof -ti:8000 >/dev/null 2>&1 || { python3 -m http.server 8000 >/dev/null 2>&1 & sleep 1; }

# Two frames per combination. The bare desktop misses everything inside a
# window, which is where most of the site's text lives: 16 font-weight changes
# once produced a 0px diff purely because .wbody was not on screen. The second
# frame opens read_me, which is the tabbed window carrying most of the prose.
for wall in $WALLS; do
  for mode in $MODES; do
   for view in desk win; do
    python3 - "$wall" "$mode" "$view" <<'PYEOF'
import io, re, sys
wall, mode, view = sys.argv[1], sys.argv[2], sys.argv[3]
h = io.open('index.html', encoding='utf-8').read()
h = re.sub(r'[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n', '', h)
seed = """<style>
*, *::before, *::after {
  animation-delay: -1s !important;
  animation-play-state: paused !important;
  transition: none !important;
}
/* script.js runs a requestAnimationFrame loop writing --holo-x / --holo-y to
   documentElement, and CSS cannot pause JavaScript. It shifts the wordmark's
   foil gradient between runs. !important in a stylesheet beats a normal inline
   declaration, which is what that loop writes. */
:root { --holo-x: 50% !important; --holo-y: 50% !important; }
/* The bear walks. Its position is written by JavaScript on a timer, not by a
   CSS animation, so pausing animations does not stop it: two runs of identical
   code put it in different places and produced a 6977px diff in one frame. */
#bear-desk { left: 38vw !important; }
#bear-phone { left: 14px !important; }
/* perspective() at 0deg is an identity transform, but it still forces a
   compositing path whose sub-pixel rasterisation varies between runs: one
   antialiased column on the standee's edge flipped by 10-15 per channel,
   40px per frame, intermittently. */
#standee img { transform: none !important; }
</style>
<script>
(function(){ var s = 1234567; Math.random = function(){
  s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }());
try{ localStorage.setItem('icybear.v1.bearName','"mochi"');
     localStorage.setItem('icybear.v1.bearNamedAt','1');
     localStorage.setItem('icybear.v1.ach', JSON.stringify(['name','konami','crash']));
     localStorage.setItem('icybear.v1.visits', JSON.stringify({count:7,last:'2026-08-23'}));
}catch(e){}
</script>"""
drive = """<script>setTimeout(function(){
 document.getElementById('unlock').dispatchEvent(new MouseEvent('click',{bubbles:true}));
 setTimeout(function(){
   var b=document.body; b.dataset.wall='WALL'; b.dataset.mode='MODE';
   /* data-icy follows ICY'S clock, not the visitor's, so it is whatever Vienna
      says when the capture runs. Pinning the sprite without pinning this told
      the page she was seated while showing a standing pose, and the seated
      height cap then sized the standing art: the same code captured before and
      after midnight in Vienna produced two different sizes. */
   b.dataset.icy='standing';
   var si=document.getElementById('standee-img'); if(si) si.src='images/os/icy-stand-1.webp';
   var pi=document.getElementById('peek-img');    if(pi) pi.src='images/os/icy-stand-1.webp';
   ['clock','ptime'].forEach(function(id){ var n=document.getElementById(id); if(n) n.textContent='4:04'; });
   document.querySelectorAll('[data-fill="icytime"],#icytime').forEach(function(n){
     n.textContent='icy time: 4:04 AM CET'; });
   /* The mood ring's CET clock is a [data-slot], not a <time>: os.js:620.
      Missing it left a 7x8px minutes digit ticking between runs, which is 40px
      of noise in every one of the 20 combinations. */
   document.querySelectorAll('[data-slot="cet"]').forEach(function(n){
     n.textContent='4:04 PM'; });
   OPEN
 },600);},4300);</script>"""
OPEN = ("" if view == 'desk' else
        "var b2=document.querySelector('.icon[data-app=\"readme\"]');"
        "if(b2) b2.dispatchEvent(new MouseEvent('click',{bubbles:true}));")
drive = drive.replace('OPEN', OPEN)
h = h.replace('</head>', seed + '</head>', 1)
h = h.replace('</body>', drive.replace('WALL', wall).replace('MODE', mode) + '</body>', 1)
io.open('_shot.html', 'w', encoding='utf-8').write(h)
PYEOF
    "$BRAVE" --headless --disable-gpu --hide-scrollbars \
      --screenshot="$OUT/${wall}-${mode}-${view}.png" --window-size=$W,$H \
      --virtual-time-budget=13000 "http://localhost:8000/_shot.html" 2>/dev/null
    printf '.'
   done
  done
done
rm -f _shot.html
echo ""
echo "  $(ls "$OUT" | wc -l | tr -d ' ') captures in test/.shots/$LABEL"

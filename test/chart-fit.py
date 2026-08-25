#!/usr/bin/env python3
"""Measure the chart's layout at real viewport sizes, in a real browser.

    test/chart-fit.py           the whole matrix
    test/chart-fit.py --quick   two viewports

Needs a server on :8000 and Brave. Checks four things that all failed at once
and that reading the stylesheet cannot catch:

  1. nothing overflows horizontally
  2. the result canvas never comes out wider than the column it sits in
  3. no option label is laid out on more than one line
  4. the quiz is roughly centred in the viewport rather than pinned to the top
  5. nothing in the top bar overlaps anything else in it, and the for-hire
     chip is actually centred on the bar

WHY IT RENDERS IN AN IFRAME. Headless Chrome will not give you a window narrower
than about 500 CSS pixels, and --force-device-scale-factor does NOT divide the
CSS viewport -- it only changes rendering resolution. Every phone measurement I
took by shrinking the window was therefore a measurement of something else: at
one point I read 670px-wide elements inside a "390px" viewport and wrote up a
horizontal-overflow bug that did not exist. An iframe of a fixed width
establishes a genuine layout viewport at any size, so the numbers are real.

WHY IT COUNTS LINE BOXES INSTEAD OF HEIGHTS. The obvious test for "did this
label wrap" is to compare the element's height against its line-height, and it
is wrong often enough to be useless: padding, min-height and flex centring all
move that number. A Range over the text node returns one client rect per line
box, so counting distinct rect tops counts lines exactly. The loose version of
this check reported all 45 options as wrapping, including `never`.

The defects it was written against, all measured:
  `sometimes` wrapped to two lines in 9 of 10 questions at EVERY width, from
  54px pills at 360 up to 98px pills at 1280. At 360, `always` wrapped too.
  The result canvas came out 650px wide inside a 608px column at 1280x1050 and
  692 inside 608 at 1440x1150, clipping the name, the diagnosis line and the
  hydration tag at the same x -- because it was sized against 78vw while
  actually living inside a 640px column. Under a viewport height of about 950 it
  happened not to bind, which is why it looked fine on a laptop.
  The quiz card sat with 254-321px of empty viewport underneath it.
"""
import io, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__)) + '/..'
BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
BASE = 'http://localhost:8000'

# width, height, and whether to answer the quiz through to the result card
MATRIX = [
    (360, 780, False), (390, 844, False), (414, 896, False),
    (620, 900, False), (768, 1024, False), (1280, 860, False),
    (390, 844, True), (1024, 1366, True), (1280, 1050, True),
    (1440, 1150, True), (1920, 1200, True),
]
QUICK = [(390, 844, False), (1440, 1150, True)]

PROBE = r"""
  var out = {};
  function lines(el) {
    var r = d.createRange(); r.selectNodeContents(el);
    var rects = r.getClientRects(), tops = {}, n = 0;
    for (var i = 0; i < rects.length; i++) {
      var k = Math.round(rects[i].top);
      if (!tops[k]) { tops[k] = 1; n++; }
    }
    return n;
  }
  out.vw = W.innerWidth; out.vh = W.innerHeight;
  out.scrollWidth = d.documentElement.scrollWidth;
  var wrapped = [];
  d.querySelectorAll('.chart-slide').forEach(function (s, i) {
    s.querySelectorAll('.chart-scale__option').forEach(function (b) {
      if (lines(b) > 1) {
        wrapped.push('q' + i + ' "' + b.textContent + '" at '
                     + Math.round(b.getBoundingClientRect().width) + 'px');
      }
    });
  });
  out.wrapped = wrapped;
  var cv = d.querySelector('#chart-canvas');
  if (cv && cv.getBoundingClientRect().width > 1) {
    var cr = cv.getBoundingClientRect(), pr = cv.parentElement.getBoundingClientRect();
    out.canvas = [Math.round(cr.width), Math.round(cr.height)];
    out.parent = [Math.round(pr.width), Math.round(pr.height)];
    out.ratio = Math.round((cr.width / cr.height) * 1000) / 1000;
  }
  var bar = [];
  var kids = [];
  d.querySelectorAll('.cbar > *').forEach(function (e) {
    var r = e.getBoundingClientRect();
    if (r.width > 0 && getComputedStyle(e).display !== 'none') kids.push([e.className || e.id, r]);
  });
  for (var a = 0; a < kids.length; a++) {
    for (var b = a + 1; b < kids.length; b++) {
      var A = kids[a][1], B = kids[b][1];
      if (A.left < B.right - 1 && B.left < A.right - 1) {
        bar.push(kids[a][0] + ' over ' + kids[b][0]);
      }
    }
  }
  out.barOverlap = bar;
  var chip = d.querySelector('.cbar__hire'), bar0 = d.querySelector('.cbar');
  if (chip && bar0) {
    var cr = chip.getBoundingClientRect(), br = bar0.getBoundingClientRect();
    out.chipOffCentre = Math.round(Math.abs((cr.left + cr.right) / 2 - (br.left + br.right) / 2));
  }
  var q = d.querySelector('.chart-screen--quiz');
  if (q && q.getBoundingClientRect().height > 1) {
    var qr = q.getBoundingClientRect();
    out.above = Math.round(qr.top);
    out.below = Math.round(W.innerHeight - qr.bottom);
  }
  document.title = 'CF' + JSON.stringify(out);
"""


def probe(w, h, answer):
    answering = ("var i=0;var t=setInterval(function(){"
                 "var s=d.querySelector('.chart-slide.is-active');"
                 "if(s){var b=s.querySelector('.chart-scale__option');"
                 "if(b)b.dispatchEvent(new W.MouseEvent('click',{bubbles:true}));}"
                 "if(++i>11)clearInterval(t);},380);") if answer else ""
    page = """<!doctype html><meta charset=utf-8>
<style>html,body{margin:0}iframe{border:0;display:block;width:%dpx;height:%dpx}</style>
<iframe id=f src="/chart/index.html"></iframe><script>
var f=document.getElementById('f');
f.onload=function(){var d=f.contentDocument,W=f.contentWindow;
  function c(s){var e=d.querySelector(s);if(e)e.dispatchEvent(new W.MouseEvent('click',{bubbles:true}));}
  W.document.fonts.ready.then(function(){setTimeout(function(){
    c('#chart-start'); %s
    setTimeout(function(){%s}, %d);
  },500);});};
</script>""" % (w, h, answering, PROBE, 11000 if answer else 2600)
    io.open(ROOT + '/chart/_fit.html', 'w', encoding='utf-8').write(page)
    dom = subprocess.run(
        [BRAVE, '--headless', '--disable-gpu', '--hide-scrollbars',
         '--window-size=%d,%d' % (max(w + 60, 1000), max(h + 60, 900)),
         '--virtual-time-budget=30000', '--dump-dom',
         BASE + '/chart/_fit.html'], capture_output=True, text=True).stdout
    m = re.search(r'<title>CF(\{.*?\})</title>', dom, re.S)
    return json.loads(m.group(1)) if m else None


def main():
    if not os.path.exists(BRAVE):
        print('  needs Brave to measure; skipped')
        return 0
    matrix = QUICK if '--quick' in sys.argv else MATRIX
    fails = []
    print('chart layout, measured in a real layout viewport\n')
    for w, h, answer in matrix:
        r = probe(w, h, answer)
        tag = '%dx%-5d %s' % (w, h, 'result' if answer else 'quiz  ')
        if not r:
            fails.append((tag, 'no readout'))
            print('  FAIL %s  no readout' % tag)
            continue
        bad = []
        if r['scrollWidth'] > r['vw']:
            bad.append('scrolls sideways by %d' % (r['scrollWidth'] - r['vw']))
        if r.get('chipOffCentre', 0) > 6:
            bad.append('for-hire chip %dpx off centre' % r['chipOffCentre'])
        if r.get('barOverlap'):
            bad.append('top bar overlaps: %s' % '; '.join(r['barOverlap'][:2]))
        if r['wrapped']:
            bad.append('%d label(s) on two lines: %s'
                       % (len(r['wrapped']), '; '.join(r['wrapped'][:3])))
        if 'canvas' in r:
            if r['canvas'][0] > r['parent'][0] + 1:
                bad.append('card overflows its column by %d'
                           % (r['canvas'][0] - r['parent'][0]))
            if abs(r['ratio'] - 0.8) > 0.01:
                bad.append('card ratio %.3f, not 0.800' % r['ratio'])
        if 'below' in r and r['below'] > r['above'] + 140:
            bad.append('quiz sits high: %dpx above, %dpx below' % (r['above'], r['below']))
        note = ''
        if 'canvas' in r:
            note = 'card %dx%d in a %d column' % (r['canvas'][0], r['canvas'][1], r['parent'][0])
        elif 'below' in r:
            note = '%dpx above / %dpx below' % (r['above'], r['below'])
        print('  %s %s  %s' % ('FAIL' if bad else '  ok', tag, note))
        for b in bad:
            print('         %s' % b)
            fails.append((tag, b))
    try:
        os.remove(ROOT + '/chart/_fit.html')
    except OSError:
        pass
    print('')
    if fails:
        print('  %d problem(s) across %d viewports' % (len(fails), len(matrix)))
        return 1
    print('  %d viewports: nothing overflows, no label wraps, the card keeps 1080:1350'
          % len(matrix))
    return 0


if __name__ == '__main__':
    sys.exit(main())

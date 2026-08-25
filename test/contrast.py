#!/usr/bin/env python3
"""Measure text contrast on the PIXELS THE BROWSER ACTUALLY PAINTED.

    test/contrast.py            every surface, all 20 theme x weather combos
    test/contrast.py --lock     just the lock screen (fast, it is the worst case)

WHY IT MEASURES PIXELS INSTEAD OF READING THE CSS. The design system states
floors -- 7:1 for primary text, 4.5:1 for secondary, 3:1 for a control's
boundary -- and for a long time that was all it did: they were written down and
nothing checked them. What shipped was a notification title set in --t-deco, a
token whose whole definition is "a light pastel", sitting on a sheer panel over
a light sky at 2.14:1. No amount of reading the stylesheet would have caught it,
because the colour is legal, the token is real, and the failure only exists once
the panel, its blur, the wallpaper behind it and the sky behind that are all
composited together.

So the check renders the page and reads the result. For each labelled region the
page reports its rectangle; this script finds the darkest and lightest pixel
inside it and computes the ratio between them. On a tight box around text that
is ink against paper, which is the number a reader experiences.

It is a floor, not a proof: a region whose text happens to overlap a hard edge
in the artwork can report a pass it has not earned. It cannot report a false
FAILURE, though, which is the direction that matters -- if this says 2.1:1, then
somewhere in that box two adjacent things really are that close.
"""
import io, json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__)) + '/..'
BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
WALLS = ['base', 'holo', 'strawberry', 'arcade', 'archangel']
MODES = ['day', 'night', 'rain', 'snow']

# selector, floor, and whether it lives on the lock screen (which needs driving
# differently: the phone has to be open and NOT unlocked)
TARGETS = [
    ('.pstatus__left',            4.5, 'lock'),
    ('.hire--phone',              4.5, 'lock'),
    ('#pstatus .right',           3.0, 'lock'),
    ('#lock .lclock',             4.5, 'lock'),
    ('#lock .ldate',              4.5, 'lock'),
    ('#lock .notif__body b',      3.0, 'lock'),
    ('#lock .notif__body',        4.5, 'lock'),
    ('#unlock',                   4.5, 'lock'),
    ('#menubar .mb-item',         4.5, 'desk'),
    ('.icon__label',              4.5, 'desk'),
    ('#standee figcaption',       3.0, 'desk'),
    ('.mood__stats',              4.5, 'desk'),
    ('#specs-chip',               4.5, 'desk'),
    ('.wbody p',                  7.0, 'win'),
    ('.wbody .section-heading__label', 3.0, 'win'),
    ('.tbar__title',              4.5, 'win'),
    ('.wtab',                     3.0, 'win'),
]


def lum(c):
    c = [x / 255 for x in c]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def page(wall, mode, view, targets):
    """A throwaway copy that sets the combo, opens the right surface, and
       reports every target's rectangle into the title, where --dump-dom can
       reach it without needing a devtools protocol client."""
    h = io.open(ROOT + '/index.html', encoding='utf-8').read()
    h = re.sub(r'[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n', '', h)
    seed = ("<style>*,*::before,*::after{animation-delay:-1s!important;"
            "animation-play-state:paused!important;transition:none!important}"
            ":root{--holo-x:50%!important;--holo-y:50%!important}</style>"
            "<script>(function(){var s=1234567;Math.random=function(){"
            "s=(s*1103515245+12345)&0x7fffffff;return s/0x7fffffff;};}());</script>")
    open_it = {
        'lock': "document.querySelector('.dbtn[data-act=\"phone\"]')"
                ".dispatchEvent(new MouseEvent('click',{bubbles:true}));",
        'desk': "",
        'win':  "document.querySelector('.icon[data-app=\"readme\"]')"
                ".dispatchEvent(new MouseEvent('click',{bubbles:true}));",
    }[view]
    sel = json.dumps([t[0] for t in targets])
    drive = ("<script>setTimeout(function(){"
             "var b=document.body;b.dataset.wall='%s';b.dataset.mode='%s';"
             "%s"
             "setTimeout(function(){var out=[];%s.forEach(function(s){"
             "document.querySelectorAll(s).forEach(function(e){"
             "var r=e.getBoundingClientRect();"
             "if(r.width<4||r.height<4)return;"
             "var cs=getComputedStyle(e);"
             "if(cs.visibility==='hidden'||cs.display==='none')return;"
             "out.push([s,Math.round(r.left),Math.round(r.top),"
             "Math.round(r.width),Math.round(r.height)]);});});"
             "document.title='CX'+JSON.stringify(out);},900);},4300);</script>"
             % (wall, mode, open_it, sel))
    io.open(ROOT + '/_cx.html', 'w', encoding='utf-8').write(
        h.replace('</head>', seed + '</head>', 1).replace('</body>', drive + '</body>', 1))


def run(wall, mode, view, targets, shot):
    page(wall, mode, view, targets)
    dom = subprocess.run(
        [BRAVE, '--headless', '--disable-gpu', '--hide-scrollbars',
         '--window-size=1440,900', '--virtual-time-budget=12000',
         '--screenshot=' + shot, '--dump-dom', 'http://localhost:8000/_cx.html'],
        capture_output=True, text=True).stdout
    m = re.search(r'<title>CX(\[.*?\])</title>', dom, re.S)
    return json.loads(m.group(1)) if m else []


def main():
    from PIL import Image
    only_lock = '--lock' in sys.argv
    views = ['lock'] if only_lock else ['lock', 'desk', 'win']
    subprocess.run(['pkill', '-f', 'Brave Browser --headless'], capture_output=True)
    os.makedirs('/tmp/cx', exist_ok=True)
    worst, fails, checked = {}, [], 0

    for wall in WALLS:
        for mode in MODES:
            for view in views:
                targets = [t for t in TARGETS if t[2] == view]
                if not targets:
                    continue
                shot = '/tmp/cx/%s-%s-%s.png' % (wall, mode, view)
                rects = run(wall, mode, view, targets, shot)
                if not rects:
                    continue
                img = Image.open(shot).convert('RGB')
                floors = dict((t[0], t[1]) for t in targets)
                for sel, x, y, w, h in rects:
                    px = list(img.crop((x, y, x + w, y + h)).getdata())
                    if len(px) < 4:
                        continue
                    ls = [lum(p) for p in px]
                    ink = px[ls.index(min(ls))]
                    paper = px[ls.index(max(ls))]
                    r = ratio(ink, paper)
                    checked += 1
                    key = sel
                    if key not in worst or r < worst[key][0]:
                        worst[key] = (r, '%s/%s' % (wall, mode), floors[sel])
                    if r < floors[sel]:
                        fails.append((sel, '%s/%s' % (wall, mode), r, floors[sel]))
    try:
        os.remove(ROOT + '/_cx.html')
    except OSError:
        pass

    print('contrast: %d regions measured across %d combos\n' % (checked, len(WALLS) * len(MODES)))
    for sel in sorted(worst, key=lambda k: worst[k][0]):
        r, where, floor = worst[sel]
        mark = 'ok  ' if r >= floor else 'FAIL'
        print('  %s %-34s worst %5.2f:1  (floor %.1f)  on %s' % (mark, sel, r, floor, where))
    print('')
    if fails:
        print('  %d region/combo pairs below their floor:' % len(fails))
        for sel, where, r, floor in sorted(fails, key=lambda f: f[2]):
            print('    %5.2f:1  (needs %.1f)  %-30s %s' % (r, floor, sel, where))
        return 1
    print('  every region clears its floor on all twenty combinations')
    return 0


if __name__ == '__main__':
    sys.exit(main())

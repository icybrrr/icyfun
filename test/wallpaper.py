#!/usr/bin/env python3
"""Render the wallpaper drop FROM THE SITE ITSELF.

    test/wallpaper.py             every theme, both modes, both sizes
    test/wallpaper.py holo        one theme
    test/wallpaper.py --thumbs    only re-cut the previews from existing renders

WHY IT RENDERS THE PAGE INSTEAD OF DRAWING WALLPAPERS. The five themes are not
pictures, they are places: three composited layers each (atmosphere, drifting
motifs, finish) plus sun or moon, stars, clouds and weather, all defined in
sky.css and built by sky.js. Any wallpaper drawn separately would be a drawing
OF the theme and would drift from it the moment a gradient changed. So this
loads index.html at wallpaper size, hides every piece of UI chrome, freezes the
animation at a chosen offset, and photographs what is left. Retheme the site and
the drop follows, which is the same rule the OG card follows.

WHAT IS AND IS NOT IN EACH SIZE. The phone renders carry icy, because that is
what her phone's own lock screen does and because a lock screen wants a subject.
The desktop renders are clean sky, because a desktop is a surface you put things
ON: icons, windows, a dock. Same theme, two honest uses.

THE POSE IS NOT THE STANDEE. The desktop standee is laid out by the OS -- it has
a caption, a contact shadow and a position that belongs to the desktop grid. The
wallpaper places its own copy of the artwork so the composition can be chosen
for the frame: bottom-anchored, sized to clear the clock, centred on the phone's
optical middle rather than its geometric one.

FREEZING. Everything is paused at a NEGATIVE delay, which is how you scrub a CSS
animation to a chosen time without running it. Each theme gets its own offset,
picked so the atmosphere is somewhere interesting rather than at the start of its
loop, and the motif sprites are pinned individually because they are placed by
sky.js with random durations and would otherwise all sit wherever the freeze
happened to catch them.
"""
import io, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__)) + '/..'
BRAVE = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
OUT = ROOT + '/images/wall'

WALLS = ['base', 'holo', 'strawberry', 'arcade', 'archangel']
MODES = ['day', 'night']

# (css width, css height, device scale) -> the file is css * scale.
#
# THE CSS SIZE IS THE DESIGN SIZE, NOT THE PANEL SIZE. Every layer of the sky is
# positioned in percentages of the viewport, so rendering straight at 2560 wide
# does not give a sharper version of the desktop -- it gives a DIFFERENT
# composition, with every gradient stretched to a shape nobody designed. So the
# viewport stays at the size the theme was drawn for and the device scale carries
# the resolution. Headless honours the two independently: the window size is CSS
# pixels and the screenshot comes out at window x scale.
SIZES = {
    'phone': (393, 852, 3),    # the phone the OS shell is drawn for -> 1179x2556
    'desk':  (1280, 720, 2),   # 16:9 at the desktop design width -> 2560x1440
}

# per-theme scrub offset (seconds) so no two renders catch the same moment
OFFSET = {'base': 21, 'holo': 34, 'strawberry': 13, 'arcade': 8, 'archangel': 27}

# which pose fronts each theme's phone wall, and how tall it sits (% of frame)
#
# The percentage is of the TRIMMED artwork, which is the only stable thing to
# size against. Every pose file is framed for the desktop standee, so each one
# carries a different amount of empty alpha above and beside her -- the sitting
# poses are barely a third ink. Sizing the file rather than the figure makes the
# same number mean a different height in every wallpaper, and pushes her off
# centre by however much padding happens to be on one side.
POSE = {
    ('base', 'day'):        ('icy-stand-1.webp', 52),
    ('base', 'night'):      ('icy-sit-sleep.webp', 34),
    ('holo', 'day'):        ('icy-stand-4.webp', 52),
    ('holo', 'night'):      ('icy-stand-7.webp', 50),
    ('strawberry', 'day'):  ('icy-stand-2.webp', 52),
    ('strawberry', 'night'): ('icy-sit-3.webp', 34),
    ('arcade', 'day'):      ('icy-stand-9.webp', 51),
    ('arcade', 'night'):    ('icy-stand-11.webp', 51),
    ('archangel', 'day'):   ('icy-stand-3.webp', 52),
    ('archangel', 'night'): ('icy-stand-12.webp', 52),
}


def trim(name):
    """Write a tightly cropped copy of one pose next to the throwaway page.

    Returns the URL to use, or the original if there is nothing to trim.
    """
    from PIL import Image
    src = Image.open(ROOT + '/images/os/' + name)
    if src.mode != 'RGBA':
        return 'images/os/' + name
    box = src.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if not box:
        return 'images/os/' + name
    src.crop(box).save(ROOT + '/_wp-pose.webp', 'WEBP', quality=95, method=4)
    return '_wp-pose.webp'  


def build(wall, mode, kind):
    """A throwaway copy of the real page, stripped to its sky."""
    html = io.open(ROOT + '/index.html', encoding='utf-8').read()
    html = re.sub(r'[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n', '', html)

    pose = ''
    if kind == 'phone':
        art, pct = POSE[(wall, mode)]
        art = trim(art)
        # 51% across, not 50: the poses are drawn with weight to one side, and
        # the optical centre of the silhouette is a hair right of the frame's.
        pose = ('<img id="wp-pose" src="%s" alt="" '
                'style="position:fixed;left:51%%;bottom:0;transform:translateX(-50%%);'
                'height:%d%%;width:auto;z-index:2;'
                'filter:drop-shadow(0 -2px 26px rgba(40,16,72,.30))">' % (art, pct))

    off = OFFSET[wall]
    strip = """
<style id="wp">
  html, body { overflow: hidden !important; }
  /* Keep the scene and nothing else. Listing what SURVIVES rather than what
     goes means a new UI element added to index.html cannot leak into a
     wallpaper by having been forgotten here. */
  body > *:not(#sky):not(#weather):not(.grid-overlay):not(#decor):not(#covenant):not(#wp-pose) {
    display: none !important;
  }
  /* Scrubbed, not stopped: a negative delay seeks into the loop. */
  *, *::before, *::after {
    animation-delay: -%(off)ss !important;
    animation-play-state: paused !important;
    transition: none !important;
  }
  /* The motifs drift on their own durations, so one shared offset would stack
     them. Nudging each by its index spreads the sprites back out. */
  %(motifs)s
  /* No menu bar and no dock up there, so the sprite mask can open up. */
  #motifs {
    -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 9%%, #000 88%%, transparent 99%%) !important;
    mask-image: linear-gradient(to bottom, transparent 0, #000 9%%, #000 88%%, transparent 99%%) !important;
  }
  :root { --holo-x: 46%%; --holo-y: 38%%; }
</style>
<script>
  (function () {            /* one seed, so a re-render is the same wallpaper */
    var s = 20260824;
    Math.random = function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }());
  addEventListener('DOMContentLoaded', function () {
    document.body.dataset.wall = '%(wall)s';
    document.body.dataset.mode = '%(mode)s';
  });
</script>
""" % {'off': off, 'wall': wall, 'mode': mode,
       'motifs': '\n  '.join(
           '#motifs .motif:nth-child(%d) { animation-delay: -%ds !important; }' % (i, off + i * 7)
           for i in range(1, 25))}

    html = html.replace('</head>', strip + '</head>', 1)
    if pose:
        html = html.replace('</body>', pose + '</body>', 1)
    io.open(ROOT + '/_wp.html', 'w', encoding='utf-8').write(html)


def shoot(wall, mode, kind):
    cw, ch, scale = SIZES[kind]
    build(wall, mode, kind)
    png = '/tmp/wp-%s-%s-%s.png' % (wall, mode, kind)
    if os.path.exists(png):
        os.remove(png)
    subprocess.run(
        [BRAVE, '--headless', '--disable-gpu', '--hide-scrollbars',
         '--window-size=%d,%d' % (cw, ch),
         '--force-device-scale-factor=%d' % scale,
         '--virtual-time-budget=9000',
         '--screenshot=' + png, 'http://localhost:8000/_wp.html'],
        capture_output=True, timeout=180)
    return png if os.path.exists(png) else None


def main():
    from PIL import Image
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    walls = only or WALLS
    os.makedirs(OUT, exist_ok=True)
    subprocess.run(['pkill', '-f', 'Brave Browser --headless'], capture_output=True)
    total = 0

    for wall in walls:
        for mode in MODES:
            for kind in SIZES:
                png = shoot(wall, mode, kind)
                if not png:
                    print('  FAILED  %s/%s/%s' % (wall, mode, kind))
                    continue
                im = Image.open(png).convert('RGB')
                cw, ch, scale = SIZES[kind]
                w, h = cw * scale, ch * scale
                if im.size != (w, h):
                    # a headless window has a floor; crop or letterbox never
                    # silently -- say it, because a wrong size is a wrong file
                    print('  size mismatch %s -> %s, cropping' % (im.size, (w, h)))
                    im = im.crop((0, 0, w, h))
                name = '%s-%s-%s' % (wall, mode, kind)
                im.save('%s/%s.webp' % (OUT, name), 'WEBP', quality=86, method=6)
                total += 1
                kb = os.path.getsize('%s/%s.webp' % (OUT, name)) / 1024
                print('  %-28s %5d x %-5d %6.0f KB' % (name, w, h, kb))

                # one preview per design, cut from the desktop render
                if kind == 'desk':
                    t = im.resize((480, 270), Image.LANCZOS)
                    t.save('%s/%s-%s-t.webp' % (OUT, wall, mode), 'WEBP',
                           quality=72, method=6)

    for junk in ('/_wp.html', '/_wp-pose.webp'):
        try:
            os.remove(ROOT + junk)
        except OSError:
            pass
    print('\n  %d wallpapers + %d previews in images/wall' % (total, total // 2))


if __name__ == '__main__':
    main()

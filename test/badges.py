#!/usr/bin/env python3
"""The thirteen badges, drawn as embroidered patches.

    test/badges.py              write images/os/badges/*.svg
    test/badges.py --audit      render them and measure ink and thread widths

WHAT WAS THERE BEFORE. One glyph for all thirteen: a filled sparkle if you had
it, a hollow one if you did not, on a gradient tile. Thirteen achievements that
all looked identical is a collection you cannot look at, and the tile-plus-glyph
shape is a STAMP -- a mark pressed onto a surface -- which is the opposite of
what an achievement should feel like. You do not get stamped for staying up for
a snowman. You get a patch.

WHY PATCHES AND NOT MORE ICONS. The app icons are objects: a floppy, a book, a
crystal ball. An achievement is not an object, it is a thing that happened, and
the whole visual history of that idea is embroidered -- merit badges, squadron
patches, tour jackets. It also solves the shape problem for free: patches are
round, they are supposed to sit in a grid together, and they are supposed to
share an edge treatment while differing inside it. That is exactly the brief.

HOW THE EMBROIDERY IS FAKED, in four moves and no textures:

  the merrowed edge   the thick overlocked band that wraps a real patch, here a
                      deeper tone of the badge's own hue
  the stitch ticks    ONE dashed circle stroked across that band. A dash pattern
                      on a circle is radial by construction, which is what a
                      merrow edge is, and the dash length is solved so a whole
                      number of stitches fits the circumference -- otherwise the
                      pattern closes on a half stitch and the seam is visible
  the field           the patch itself, a soft two-stop ramp so it is not flat
  the inner ring      a finer dashed circle, the topstitch just inside the edge

Everything else is thread: white satin at the icon set's own stroke ladder.

THE COLOUR IS BY FAMILY, NOT BY BADGE. Thirteen distinct hues is a rainbow --
the icon set already learned that and grouped into families. These group by WHAT
YOU DID, which means the sheet answers a question at a glance that the copy
never states: rose is the bear, mint is the machine, violet is time, and gold is
the covenant. Within a family every badge is the same three colours, so a family
reads as a family and a hue means something.
"""
import importlib.util, io, math, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('icons', HERE + '/icons.py')
ic = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ic)          # one colour engine, one set of primitives

OUT = os.path.abspath(HERE + '/../images/os/badges')
q, n = ic.q, ic.n
circle, ellipse, capsule, rect = ic.circle, ic.ellipse, ic.capsule, ic.rect
star, rpoly = ic.star, ic.rpoly

# ------------------------------------------------------------- geometry ----
CX = CY = 16.0
R_CUT   = 15.00     # the white die-cut, the same language as the app icons
R_EDGE  = 13.90     # outer edge of the merrowed band
R_TICK  = 12.75     # centreline of the stitch ticks
W_TICK  = 2.30      # how wide the band of ticks is
R_FIELD = 11.55     # the patch field
R_RING  = 10.25     # the topstitch just inside the field
SAFE    =  9.00     # nothing in a motif reaches past this

THREAD  = 1.80      # satin stitch, the icon set's DETAIL weight
THICK   = 2.60      # a heavier run for a silhouette's spine


def dashes(r, count, duty=0.46):
    """Solve a dash pattern that closes exactly on a circle of radius r.

    A stitch pattern picked by eye almost never divides the circumference, and
    the remainder all lands in one place: the last dash runs into the first and
    the seam sits there forever, on every badge, in the same spot. Solving for a
    whole number of stitches costs one division and removes the seam."""
    unit = 2 * math.pi * r / count
    return '%s %s' % (q(unit * duty), q(unit * (1 - duty)))


# --------------------------------------------------------------- colour ----
# EVERY BADGE IS THE SAME FOIL, SEEN FROM A DIFFERENT ANGLE.
#
# The first version of this sheet grouped the thirteen into four hue families --
# rose for the bear, mint for the machine, violet for time, gold for the hour --
# which encoded something true and looked like four different sets of badges.
# The iridescent treatment the chrome icons already wear is the better answer to
# the same problem: it is ONE material, so the sheet is obviously one collection,
# and no two pieces of it catch the light the same way.
#
# So the palette is the chrome's own HOLO ramp, unchanged, and what varies per
# badge is how that ramp is laid across the disc:
#
#   the angle   the gradient vector is rotated around the circle, a different
#               bearing for each badge
#   the phase   the five stops are ROTATED IN ORDER, not shifted in hue. Cycling
#               [340,300,252,208,172] to [300,252,208,172,340] reorders the same
#               five hues along the sweep and cannot introduce a sixth. Shifting
#               the hue numbers instead would walk the warm end out of the arc
#               this palette occupies, and there is no yellow in icybearOS.
#   the cross   the merrowed edge takes the same foil at a right angle to the
#               field's, which is what real holographic film does: two sweeps
#               crossing is the thing the eye reads as diffraction rather than
#               as a coloured haze. The wallpaper's holo theme is built the same
#               way, for the same reason.
HOLO = ic.HOLO                        # (offset, hue, lightness) x 5
FOIL_C = 0.62                         # chroma fraction, one for the whole sheet

# The merrowed edge and the topstitch are the two constants: every patch in a
# real set is finished the same way, and it is the finishing that says they
# belong together.
#
# The edge is the field's ramp DARKENED BY A CONSTANT, not flattened to a
# constant. Pinning all five stops to one lightness looked like the obvious way
# to say "this band is darker" and it desaturates the ramp unevenly: the cool
# stops at 208 and 172 have far less reachable chroma down there than the
# magenta at 340 does, so three fifths of the band went grey-green while the
# rest stayed pink. Subtracting the same amount from each keeps every stop at
# its own level and the band reads as the same foil in shadow. Chroma goes UP at
# the same time, because a darker stop can hold more of it.
#
# The delta is small on purpose. At -0.145 the band was properly dark and the
# mint stop landed on sage: green is the hue that dies first on the way down,
# and one murky fifth is enough to make a whole ring look dusty. -0.09 is the
# deepest this ramp goes with all five stops still saturated, and the field is
# pale enough that the band still reads as an edge without it.
EDGE_DL, EDGE_C = -0.090, 0.88
RING_L = 0.700

# Order fixes each badge's bearing and phase, so a badge always looks the same.
ORDER = ['name', 'feel', 'konami', 'crash', 'feed5', 'mute', 'snowman',
         'gn', 'cert', 'reg', 'seasons', 'every', 'angel', 'all']


def ramp(phase, dL=0.0, C=FOIL_C):
    """The five HOLO stops, rotated by `phase` places and re-spaced evenly."""
    hues = [h for _, h, _ in HOLO]
    lums = [l for _, _, l in HOLO]
    k = len(hues)
    out = []
    for i in range(k):
        j = (i + phase) % k
        out.append("<stop offset='%s' stop-color='%s'/>"
                   % (q(i / float(k - 1)), ic.oklch(lums[j] + dL, C, hues[j])))
    return ''.join(out)


def vector(deg, r):
    """A gradient vector of length 2r across the disc at this bearing."""
    a = math.radians(deg)
    dx, dy = r * math.cos(a), r * math.sin(a)
    return (q(16 - dx), q(16 - dy), q(16 + dx), q(16 + dy))


# ------------------------------------------------------------- template ----
TPL = """<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs>\
<linearGradient id='{k}f' gradientUnits='userSpaceOnUse' x1='{fx1}' y1='{fy1}' x2='{fx2}' y2='{fy2}'>\
{stops}</linearGradient>\
<linearGradient id='{k}e' gradientUnits='userSpaceOnUse' x1='{ex1}' y1='{ey1}' x2='{ex2}' y2='{ey2}'>\
{estops}</linearGradient>\
<radialGradient id='{k}h' cx='.34' cy='.28' r='.72'>\
<stop offset='0' stop-color='#fff' stop-opacity='.5'/>\
<stop offset='.62' stop-color='#fff' stop-opacity='.14'/>\
<stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient></defs>\
<g stroke-linejoin='round' stroke-linecap='round'>\
<circle cx='16' cy='16' r='{rcut}' fill='#fff'/>\
<circle cx='16' cy='16' r='{redge}' fill='{edge}'/>\
<circle cx='16' cy='16' r='{rtick}' fill='none' stroke='{tick}' stroke-width='{wtick}' \
stroke-dasharray='{dtick}' stroke-linecap='butt' opacity='.5'/>\
<circle cx='16' cy='16' r='{rfield}' fill='url(#{k}f)'/>\
<circle cx='16' cy='16' r='{rring}' fill='none' stroke='{ring}' stroke-width='.55' \
stroke-dasharray='{dring}' opacity='.65'/>\
{motif}{sheen}\
</g></svg>"""

SHEEN = "<circle cx='16' cy='16' r='%s' fill='url(#{k}h)'/>" % q(R_FIELD)


def build(key, sheen=True):
    """sheen=False is for the audit only. The raised highlight is white at half
       opacity across the top left of the field, which lifts a pale field over
       any absolute "this is thread" threshold -- so measured with it on, the
       empty slot reported 4% thread it does not have."""
    sh = SHEEN.format(k=key) if sheen else ''
    common = dict(k=key, sheen=sh, tick='#fdfbff',
                  rcut=q(R_CUT), redge=q(R_EDGE), rtick=q(R_TICK), wtick=q(W_TICK),
                  rfield=q(R_FIELD), rring=q(R_RING),
                  dtick=dashes(R_TICK, 40, 0.44), dring=dashes(R_RING, 30, 0.5))
    if key == 'slot':
        fv, ev = vector(38, R_FIELD), vector(128, R_EDGE)
        return TPL.format(
            stops="<stop offset='0' stop-color='#efeaf7'/>"
                  "<stop offset='1' stop-color='#e2dbee'/>",
            estops="<stop offset='0' stop-color='#cfc6e0'/>"
                   "<stop offset='1' stop-color='#c3b9d8'/>",
            edge='url(#slote)', ring='#b9aed0', motif='',
            fx1=fv[0], fy1=fv[1], fx2=fv[2], fy2=fv[3],
            ex1=ev[0], ey1=ev[1], ex2=ev[2], ey2=ev[3], **common)

    i = ORDER.index(key)
    bearing = i * (360.0 / len(ORDER))     # a different angle on the same foil
    phase = i % len(HOLO)                  # and a different stop rotation
    fv = vector(bearing, R_FIELD)
    ev = vector(bearing + 90, R_EDGE)      # the crossing sweep
    p = '#fdfbff'                          # white satin thread
    d = '#3b3167'
    motif = dict(MOTIFS)[key](p, d, '#5c4f93')
    return TPL.format(
        stops=ramp(phase),
        estops=ramp(phase + 2, dL=EDGE_DL, C=EDGE_C),
        edge='url(#%se)' % key, ring=ic.oklch(RING_L, FOIL_C, 252),
        motif=motif,
        fx1=fv[0], fy1=fv[1], fx2=fv[2], fy2=fv[3],
        ex1=ev[0], ey1=ev[1], ex2=ev[2], ey2=ev[3], **common)


# ---------------------------------------------------------------- thread ----
def satin(d, w=THREAD, fill='#fdfbff', op='1'):
    return ("<path d='%s' fill='none' stroke='%s' stroke-width='%s' opacity='%s'/>"
            % (d, fill, q(w), op))


def fill(shape, c, op='1'):
    return ic.mark(shape, c, op)


# ---------------------------------------------------------------- motifs ----
# Every one of these is thread on a field: white satin, with the family's dark
# tone for the two or three places something has to read as a hole or an eye.
# Nothing reaches past SAFE, so the topstitch ring is never crossed.

def m_name(p, d, e):
    """A luggage tag with one written line. You gave the bear a name, and a name
       is a thing you write down and tie on."""
    # The taper and the hole go on the SAME end, and it is the LEFT one: a tag
    # hangs from its point, and with the point on the right this read as a
    # receipt with a hole punched in the corner.
    return (fill(rpoly([(13.0, 10.4), (22.0, 10.4), (22.0, 21.6), (13.0, 21.6),
                        (9.2, 16.0)], [1.7, 1.7, 1.7, 1.7, 1.3]), p) +
            fill(circle(12.3, 16.0, 1.25), e) +
            satin('M15.4 14.1h4.6M15.4 17.9h3.0', THREAD, e, '.6'))


def m_feel(p, d, e):
    """A heart with a keyhole. .feelings is a file the terminal will not list
       twice, so the heart is the one that has something locked inside it."""
    return (ic.heart(16, 15.4, 14.4, p, '1') +
            fill(circle(16, 14.4, 1.85), e) +
            fill(rpoly([(14.9, 14.9), (17.1, 14.9), (17.7, 19.7), (14.3, 19.7)], 0.75), e))


def m_konami(p, d, e):
    """A d-pad. The code is thumbs, and this is what thumbs press."""
    a, b = 2.35, 6.6
    return (fill(rpoly([(16 - a, 16 - b), (16 + a, 16 - b), (16 + a, 16 - a),
                        (16 + b, 16 - a), (16 + b, 16 + a), (16 + a, 16 + a),
                        (16 + a, 16 + b), (16 - a, 16 + b), (16 - a, 16 + a),
                        (16 - b, 16 + a), (16 - b, 16 - a), (16 - a, 16 - a)], 1.1), p) +
            fill(circle(16, 16, 1.5), e))


def m_crash(p, d, e):
    """A plaster. The riddle says some commands should not be typed and the copy
       says the OS forgave you, so the badge is the apology, not the wound."""
    return (fill(capsule(12.0, 20.0, 20.0, 12.0, 3.30), p) +
            fill(circle(14.3, 17.7, 0.85), e) + fill(circle(17.7, 14.3, 0.85), e) +
            fill(circle(16.9, 17.7, 0.85), e) + fill(circle(15.1, 14.3, 0.85), e))


def m_feed5(p, d, e):
    """A bowl with five berries over it. The number is the badge."""
    berries = ''.join(fill(circle(x, y, r), p) for x, y, r in
                      [(12.1, 12.9, 1.5), (16.0, 11.4, 1.7), (19.9, 12.9, 1.5),
                       (13.8, 15.6, 1.35), (18.2, 15.6, 1.35)])
    # narrower than the spread of berries above it, so the pile reads as
    # overflowing the bowl rather than sitting in a saucer
    bowl = "<path d='M10.4 17.8h11.2a5.6 5.6 0 0 1-11.2 0Z'/>"
    return berries + fill(bowl, p) + satin('M10.4 17.8h11.2', 1.15, e, '.55')


def m_mute(p, d, e):
    """A speaker with the sound taken off it. Betrayal, drawn."""
    return (fill(rpoly([(9.6, 13.6), (12.4, 13.6), (16.2, 10.2),
                        (16.2, 21.8), (12.4, 18.4), (9.6, 18.4)], 1.0), p) +
            satin('M18.8 13.6l4.4 4.8M23.2 13.6l-4.4 4.8', THICK, p))


def m_snowman(p, d, e):
    """Two spheres, a brim and a scarf. You stayed for the whole thing."""
    # The hat has to be a HAT. A 2.2-tall crown on a 0.9 brim read as an
    # antenna, and two circles under an antenna is a robot.
    return (fill(circle(16, 19.6, 4.3), p) + fill(circle(16, 13.4, 3.3), p) +
            fill(rect(12.7, 10.0, 6.6, 1.4, 0.6), p) +
            fill(rect(14.0, 7.4, 4.0, 2.9, 0.7), p) +
            fill(circle(14.8, 12.9, 0.64), e) + fill(circle(17.2, 12.9, 0.64), e) +
            fill(rpoly([(16.0, 13.8), (17.0, 14.9), (15.0, 14.9)], 0.35), e) +
            satin('M12.8 16.3h6.4', 1.4, e, '.5') +
            fill(circle(16, 19.1, 0.8), e) + fill(circle(16, 21.5, 0.8), e))


def m_gn(p, d, e):
    """A crescent and one z. Said goodnight, meant it."""
    return (fill(ic.crescent(14.6, 16.4, 6.4, 4.9, 3.0), p) +
            satin('M19.4 11.0h3.4l-3.4 4.0h3.4', THREAD, p))


def m_cert(p, d, e):
    """A sheet with a tick on it. The machine already knew; this is it saying so
       in writing."""
    return (fill(rpoly([(10.6, 9.4), (21.4, 9.4), (21.4, 22.6), (10.6, 22.6)], 1.5), p) +
            satin('M13.2 12.6h5.6M13.2 15.2h3.4', 1.2, e, '.55') +
            satin('M12.9 18.6l2.5 2.6 4.8-5.4', THICK, e))


def m_reg(p, d, e):
    """Five tallies, the fifth struck through. Counting visits is what the badge
       does, so the badge is a count."""
    return (satin('M11.4 11.6v8.8M14.0 11.6v8.8M16.6 11.6v8.8M19.2 11.6v8.8', THREAD, p) +
            satin('M10.0 20.2l10.6-8.4', THREAD, p))


def m_seasons(p, d, e):
    """One sky holding all four moods: a sun behind a cloud, with a drop and a
       flake under it.

    THIS WAS A TWO BY TWO and the two by two was the wrong idea. Four marks in
    four quadrants of an 18-unit field are each about five units across, which is
    too small for a raindrop to be a raindrop, and the four of them together
    read as a pattern rather than as a sky. One scene uses the whole field, and
    weather is a scene anyway.

    (Worth keeping from that version: the limit on a quadrant layout is the
    AXIS, not the diagonal. A mark reaching r along one axis from a centre 3.7
    off the middle sits at hypot(3.7, 3.7 + r) from the badge's centre, which is
    why the sun's little top ray was crossing the safe circle while the
    snowflake's much longer-looking diagonal arms were nowhere near it.)"""
    sun = fill(circle(12.4, 11.4, 3.3), p)
    cloud = (fill(capsule(13.2, 14.9, 19.4, 14.9, 2.5), p) +
             fill(circle(15.6, 12.9, 2.9), p) + fill(circle(18.8, 13.6, 2.2), p))
    drop = (fill(rpoly([(13.2, 18.4), (15.3, 21.3), (11.1, 21.3)], 1.1), p))
    flake = satin('M19.2 17.8v4.6M16.9 20.1h4.6M17.6 18.5l3.2 3.2M20.8 18.5l-3.2 3.2',
                  1.25, p)
    # the cloud is drawn over the sun, so the sun has to go down first
    return sun + cloud + drop + flake


def m_every(p, d, e):
    """Eight lamps around a ring, all lit. Opening every app is a circuit you
       complete, and a completed circuit is the oldest way to draw one."""
    out = ''
    for i in range(8):
        a = math.radians(-90 + i * 45)
        out += fill(circle(16 + 6.5 * math.cos(a), 16 + 6.5 * math.sin(a), 1.85), p)
    return out + fill(circle(16, 16, 2.5), p) + fill(circle(16, 16, 1.05), e)


def m_angel(p, d, e):
    """A halo, and nothing under it. One minute a day, and the badge does not
       show you what kept the hour."""
    return ("<ellipse cx='16' cy='16.6' rx='7.4' ry='3.0' fill='none' stroke='%s' "
            "stroke-width='%s'/>" % (p, q(THICK)) +
            star(16, 9.6, 4.4, p, '.92'))


def m_all(p, d, e):
    """The thirteenth of thirteen. A crown, on the foil the chrome already uses,
       because this one is not a member of any family."""
    return (fill(rpoly([(9.4, 20.6), (9.4, 11.2), (12.7, 14.6), (16.0, 10.2),
                        (19.3, 14.6), (22.6, 11.2), (22.6, 20.6)], 1.2), p) +
            fill(circle(16, 17.0, 1.35), e) +
            fill(circle(12.2, 18.0, 0.95), e) + fill(circle(19.8, 18.0, 0.95), e))


def m_slot(p, d, e):
    """The empty pocket. A locked badge shows a patch-shaped hole, never a
       greyed-out version of the real one -- the art IS the reward, and a
       desaturated preview of it hands the surprise away for nothing."""
    return ''


MOTIFS = [
    ('name', m_name), ('feel', m_feel), ('konami', m_konami), ('crash', m_crash),
    ('feed5', m_feed5), ('mute', m_mute), ('snowman', m_snowman), ('gn', m_gn),
    ('cert', m_cert), ('reg', m_reg), ('seasons', m_seasons), ('every', m_every),
    ('angel', m_angel), ('all', m_all), ('slot', m_slot),
]


# ---------------------------------------------------------------- audit ----
def audit():
    """Render them and measure, the way icons.py does.

    Two numbers matter. Ink coverage says whether one badge is shouting: they
    all share an edge and a field, so the only variable is the motif, and a
    motif that covers twice what its neighbour does will read as the important
    one whether or not it is. And the closest approach says whether any thread
    has crossed the topstitch ring, which is the one line a patch cannot have
    something running over."""
    from PIL import Image
    brave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    if not os.path.exists(brave):
        print('  audit needs Brave to rasterise; skipped')
        return 0
    keys = [k for k, _ in MOTIFS]
    cell, tmp = 180, '/tmp/badge-audit'
    os.makedirs(tmp, exist_ok=True)
    io.open(tmp + '/sheet.html', 'w', encoding='utf-8').write(
        "<style>html,body{margin:0;background:#000}body{display:flex;width:%dpx}"
        "i{width:%dpx;height:%dpx}svg{width:100%%;height:100%%;display:block}</style>%s"
        % (cell * len(keys), cell, cell,
           ''.join('<i>%s</i>' % build(k, sheen=False) for k in keys)))
    subprocess.run([brave, '--headless', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1',
                    '--window-size=%d,%d' % (cell * len(keys), cell),
                    '--screenshot=' + tmp + '/sheet.png',
                    'file://' + tmp + '/sheet.html'], capture_output=True)
    img = Image.open(tmp + '/sheet.png').convert('RGB')
    rows, fails = [], 0
    # MEASURE INSIDE THE FIELD ONLY. The first version of this counted every
    # near-white pixel in the tile, which meant the white die-cut ring -- a
    # constant, present on all fifteen, and entirely outside the safe circle --
    # was being read as thread. Every badge duly reported half its "thread"
    # escaping. The number to measure is thread against the FIELD it is sewn on.
    s = cell / 32.0
    rf2 = ((R_FIELD - 0.6) * s) ** 2      # inside the seam, not on it
    rs2 = (SAFE * s) ** 2
    for i, k in enumerate(keys):
        px = img.crop((i * cell, 0, (i + 1) * cell, cell)).load()
        thread = inside = out = 0
        for y in range(cell):
            for x in range(cell):
                r2 = (x - cell / 2.0) ** 2 + (y - cell / 2.0) ** 2
                if r2 > rf2:
                    continue
                inside += 1
                if min(px[x, y]) > 240:
                    thread += 1
                    if r2 > rs2:
                        out += 1
        rows.append((k, 100.0 * thread / inside, 100.0 * out / max(1, thread)))
    print('\n  white thread as a share of the FIELD, and how much of it sits'
          '\n  outside the safe circle (should be a rounding error)\n')
    for k, cov, esc in sorted(rows, key=lambda r: -r[1]):
        lo, hi = (0.0, 0.5) if k == 'slot' else (17.0, 34.0)
        bad = not (lo <= cov <= hi) or esc > 1.0
        fails += bad
        print('  %s %-9s %5.1f%%   escapes %4.1f%%' % ('FAIL' if bad else '  ok', k, cov, esc))
    real = [r[1] for r in rows if r[0] != 'slot']
    print('\n  spread %.1f points (%.1f to %.1f) across the thirteen and the crown'
          % (max(real) - min(real), min(real), max(real)))
    return 1 if fails else 0


def main():
    write = '--audit' not in sys.argv and '--check' not in sys.argv
    if write:
        os.makedirs(OUT, exist_ok=True)
    for key, _ in MOTIFS:
        out = build(key)
        if write:
            io.open(os.path.join(OUT, key + '.svg'), 'w', encoding='utf-8').write(out)
        tag = 'empty' if key == 'slot' else 'foil %3d deg' % (
            ORDER.index(key) * (360.0 / len(ORDER)))
        print('  %-9s %-12s %5.1f KB' % (key, tag, len(out) / 1024.0))
    print('\n  %d patches, %s' % (len(MOTIFS), 'written' if write else 'not written'))
    return audit() if '--audit' in sys.argv else 0


if __name__ == '__main__':
    sys.exit(main())

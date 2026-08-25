#!/usr/bin/env python3
"""Draw the app icons from one system, so the system cannot drift.

    test/icons.py            write the 13 app tiles
    test/icons.py --check    build them without writing
    test/icons.py --audit    render and measure them, and write nothing
    test/icons.py --spectrum build with the one-hue-per-app palette instead

WHY A GENERATOR. The old set was 26 hand-authored files that shared a
construction but not its numbers: 15 distinct stroke widths, 22 corner radii,
and an ink coverage running 40.6% to 66.1% of the tile. That is why a set with
a consistent recipe still looked assorted -- not because any one icon was
wrong, but because numbers drift when they live in 26 places. Here they live in
one, every icon is built from the same template, and --audit renders the result
and measures it rather than trusting that it came out right.

THE SYSTEM

  grid      32 x 32. POSITIONS snap to 0.5. Radii, stroke widths and curve
            control points do not -- the weight ladder is 1.8/3.6/5.4/7.2 and
            none of it survives a 0.5 snap, so snapping them would silently
            delete the ladder this file exists to enforce.

  keyline   four silhouettes -- square 22, circle 19, portrait 17.5x23,
            landscape 23x17.5 -- sized for equal RENDERED INK rather than equal
            bounding boxes. A filled square reads far heavier than a circle of
            the same width, so matching boxes is what makes a hand-drawn set
            look assorted. The thirteen now measure 49% to 59% of the tile
            against the old 40.6% to 66.1%.

  stroke    two widths and no more: 1.8 for detail, 3.6 for the die-cut.

  radius    corners come from 1.8 / 3.6 / 7.2. Round ends do NOT: a pill's
            radius is half its width, which is arithmetic, not a choice. A
            ruled line is 1.8 tall everywhere; a dot is r 1.2 everywhere.

  angle     orthogonal, except the plaster, which is on the 45. It is the only
            tilted object in the set, which reads as a decision. Two tilts at
            different angles would have read as an accident.

  light     one source, upper left. The body gradient runs (3,3) to (29,29) and
            every specular sits upper-left. This is why the silhouettes are
            built from paths rather than rotated rects: the gradient lives in
            user space, so a transform on a shape turns its gradient with it,
            and that icon ends up lit from a different direction than the other
            twelve.

  die-cut   the 3.6 white outline every icon wears. It is not decoration, it is
            the edge of a vinyl sticker, and naming it is what makes it a rule
            rather than a habit. Geometry stays 3.3 from the tile edge so the
            die-cut itself clears 1.5.

  body      filled primitives only -- no strokes, no transforms. That one
            restriction is what lets a single template give all thirteen the
            same die-cut, the same mask, the same vignette and one light.
"""
import io, math, os, subprocess, sys

W = 32.0
DETAIL, STROKE, HEAVY = 1.8, 3.6, 5.4
BAR, DOT = 1.8, 1.2      # a ruled line's height; a dot's radius
R1, R2, R3, R4 = 1.8, 3.6, 5.4, 7.2
MARGIN = 1.5

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'images', 'os', 'icons')


# ---------------------------------------------------------------- colour ----
# WHY OKLCH AND NOT HSL. The first pass held saturation and lightness fixed and
# walked the hue, which is the obvious thing to do and produces a set nobody
# would call a set: HSL lightness is not lightness. At L=0.52 a blue is a
# perfectly good mid pastel, a yellow is mustard and a green is olive. Three of
# the thirteen came out muddy for that reason alone, and no amount of choosing
# better hues fixes it, because the fault is in the coordinate system.
#
# OKLCH is perceptual, so one L really is one perceived lightness across the
# whole wheel. Fixing L and C and varying only H gives thirteen colours that
# differ in hue and in NOTHING ELSE, which is exactly what makes a family read
# as a family. Chroma is then clipped per hue to whatever sRGB can actually
# show, because the reachable chroma at L=0.635 is much larger for magenta than
# for yellow and asking for the same number everywhere would silently clip the
# yellows to something greyer than intended.
LIGHT = (0.885, 0.100)      # the gradient's top stop
MID   = (0.665, 0.165)      # its bottom stop
PAPER = (0.980, 0.015)      # marks drawn on the body
INK   = (0.320, 0.050)      # the two or three places something must go dark

# ...and the lightness above is a BASE, pulled by hue toward where that hue can
# actually be itself.
#
# Holding L flat is the textbook answer and it is wrong here for a measurable
# reason: a hue's reachable chroma collapses as it moves away from its own
# natural lightness, so a colour forced to a lightness it does not like has
# nowhere left to be colourful and lands on the gamut edge instead. Two rounds
# of this file got that wrong in opposite directions. Flat L put the yellows on
# olive. A single cosine peaked at orange fixed the yellows and then did the
# same thing to the cyans, because it treats cyan as a dark colour when cyan is
# one of the LIGHTEST -- four icons in the machine family came out as the same
# dark teal, all four pinned to the edge of what sRGB can show.
#
# So the curve is not modelled, it is measured. For each hue, find the lightness
# where sRGB gives that hue the most chroma, and move a fraction of the way
# there from the family's base. Pinks barely move; cyans rise a long way, which
# is correct -- cyan cannot be as chromatic as magenta at ANY lightness (pure
# #0ff is C 0.126 against magenta's 0.31), so uniform chroma across the wheel is
# not merely hard, it is unavailable. What stays uniform is chroma relative to
# each hue's own ceiling, which is the only invariant sRGB actually offers.
PULL = 0.36


def _peak_L(H, _memo={}):
    """The lightness at which this hue can hold the most chroma."""
    if H not in _memo:
        best = (0.0, 0.66)
        lo = 0.42
        while lo < 0.95:
            c = cmax(lo, H)
            if c > best[0]:
                best = (c, lo)
            lo += 0.005
        _memo[H] = best[1]
    return _memo[H]


def tilt(base, H):
    return base + PULL * (_peak_L(H) - base)


# HOW MANY HUES. The first instinct is thirteen, one per app, and it does not
# survive arithmetic: thirteen hues on a 360-degree wheel leaves 27.7 degrees
# between neighbours at absolute best, so "give every app its own colour"
# forces an even spread, and an even spread of thirteen IS a rainbow. That is
# the set we already had and the reason it never looked deliberate.
#
# So the hues are grouped, along a seam that was already there: the desktop
# order runs pitch, then toys, then machine. Inside a family the hues sit close
# on purpose -- a family is meant to look like a family, and shape is already
# carrying the work of telling a folder from a scroll -- and the seams between
# families open up to sixty degrees or more.
FAMILIES = {
    'readme':   (352, 'rose'),          # the pitch. Five pinks, and they are
    'folio':    (8, 'strawberry'),    # meant to be five pinks: this is the
    'quest':    (340, 'bubblegum'),     # widest the warm end goes before it
    'resume':   (318, 'orchid'),        # turns coral, which is ruled out.
    'quote':    (347, 'cotton candy'),
    'diag':     (265, 'periwinkle'),        # the toys
    'guest':    (296, 'violet'),
    'stick':    (250, 'azure'),
    'ach':      (281, 'iris'),
    'patch':    (222, 'sky'),           # the machine. The cool half needs wider
    'v95':      (204, 'aqua'),          # hue steps than the warm half to look
    'specs':    (186, 'seafoam'),       # equally far apart: sRGB gives cyan a
    'terminal': (168, 'mint'),          # third of magenta's chroma to work in.
}

# COTTON CANDY IS NOT A HUE, IT IS A TINT. Held at the set's own lightness and
# chroma, hue 347 is just another rose eight degrees from read_me's -- and no
# hue exists that is both cotton candy and far from the rest of this family,
# because the family is already as wide as pink gets. What makes candy floss
# look like candy floss is that it is paler and less saturated than the fruit,
# so that is the axis it gets: one documented per-icon lift in lightness and cut
# in chroma. It is the only icon that varies on anything but hue, and it varies
# because it is named after something pale.
TINT = {
    'quote': (0.052, 0.66),     # cotton candy: paler and softer than the fruit
    'berry': (-0.045, 1.0),     # a raspberry is a DEEPER berry than a strawberry,
}                               # which is most of what tells the two apart

SPECTRUM = {
    'readme':   (352, 'rose'),
    'folio':    (271, 'periwinkle'),
    'quest':    (100, 'butter'),
    'resume':   (298, 'violet'),
    'quote':    (73,  'gold'),
    'diag':     (325, 'orchid'),
    'guest':    (217, 'sky'),
    'stick':    (46,  'caramel'),
    'ach':      (191, 'teal'),
    'patch':    (19,  'coral'),
    'terminal': (164, 'mint'),
    'v95':      (244, 'azure'),
    'specs':    (137, 'fern'),
}

HUES = FAMILIES

# THE CHROME IS NOT AN APP. Nine of these are system controls -- sound, themes,
# lock, settings, help, the phone, the bag -- and giving each one an identity
# hue said they were thirteen more apps. They are one thing, so they get one
# treatment, and the treatment is iridescent: a hue sweep across the whole
# palette instead of a position in it. That is the one thing an app tile can
# never be, which is exactly why it reads as chrome at a glance, and the foil
# already exists in this design system on the view card and the chart card.
#
# Three of them are not chrome and keep a hue. The camera and the flower are
# dock actions, and the flower sits between the badge and the camera because
# that is where it sits in the dock. The three bear verbs -- feed, pet, play --
# act on her mascot rather than on the machine, so they take her own pinks.
HOLO = [(0.00, 340, 0.865), (0.30, 300, 0.785), (0.55, 252, 0.720),
        (0.80, 208, 0.740), (1.00, 172, 0.780)]
HOLO_PAPER, HOLO_INK = '#fdfbff', '#2c2440'

CHROME = {
    'cog':       'holo', 'swatch':    'holo', 'moon':  'holo',
    'sound-on':  'holo', 'sound-off': 'holo', 'faq':   'holo',
    'phone':     'holo', 'bags':      'holo', 'wall':      'holo',
    'camera': (346, 'rose'),        # dock
    'stick-bear': (250, 'azure'),   # matches the app it lives inside
    'flower': (314, 'lilac'),       # between badges.sav and the camera
    'berry':  (344, 'raspberry'),   # the bear verbs
    'heart':  (358, 'rose'),
    'spark':  (326, 'orchid'),
}
for _k, _v in CHROME.items():
    if _v != 'holo':
        HUES[_k] = _v


def _srgb(x):
    x = x / 12.92 if x <= 0.0031308 * 12.92 else x
    return 12.92 * x if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055


def _lin(L, C, H):
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    return (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def cmax(L, H):
    """Most chroma sRGB can show at this lightness and hue."""
    lo, hi = 0.0, 0.42
    for _ in range(26):
        mid = (lo + hi) / 2
        if all(-1e-4 <= v <= 1.0001 for v in _lin(L, mid, H)):
            lo = mid
        else:
            hi = mid
    return lo


def oklch(L, C, H, headroom=0.60):
    """Hex for one OKLCH colour.

    Two things are going on. Chroma is clipped to what sRGB can reach, by
    reducing C rather than by clipping the CHANNELS -- the usual shortcut --
    because clipping channels shifts the hue, which is the one thing this whole
    exercise is trying to hold constant.

    Then chroma is held to a fraction of that maximum, and that is the rule that
    makes the set work. Holding chroma ABSOLUTE looks right until you check it
    against the gamut: 0.165 is 60% of what rose can reach and 96% of what azure
    can, so the pinks come out pastel and the blues come out electric even though
    the number is identical. At this headroom every icon sits at the same
    fraction of its own ceiling, which is the thing the eye reads as "the same
    amount of colour". A hue's reachable chroma collapses as it moves away from
    its own natural lightness: magenta at L=0.64 still has plenty, yellow has
    almost none, and asking for the same 0.16 everywhere pins the yellows and
    greens to their own gamut edge -- which is to say it turns them into olive
    and moss, the two colours this palette is trying not to contain. Backing
    every hue off its edge by the same proportion keeps the warm end soft
    instead of muddy, at the cost of a little punch in the pinks. That trade is
    the right way round for a pastel set."""
    C = min(C, headroom * cmax(L, H))
    lo, hi = 0.0, C
    for _ in range(24):
        mid = (lo + hi) / 2
        if all(-1e-4 <= v <= 1.0001 for v in _lin(L, mid, H)):
            lo = mid
        else:
            hi = mid
    return '#%02x%02x%02x' % tuple(
        max(0, min(255, round(_srgb(max(0.0, min(1.0, v))) * 255)))
        for v in _lin(L, lo, H))


def ramp(key):
    """The two gradient stops for one icon."""
    h = HUES[key][0]
    dl, mc = TINT.get(key, (0.0, 1.0))
    return (oklch(min(0.95, tilt(LIGHT[0], h) + dl), LIGHT[1] * mc, h),
            oklch(tilt(MID[0], h) + dl, MID[1] * mc, h))


def inks(key):
    """Every mark inside an icon is that icon's own hue, near white or near
       black. Nothing uses a literal grey, so nothing reads as foreign -- except
       on the chrome, which has no single hue to be tinted by."""
    if CHROME.get(key) == 'holo':
        return HOLO_PAPER, HOLO_INK
    h = HUES[key][0]
    return oklch(PAPER[0], PAPER[1], h), oklch(INK[0], INK[1], h)


# ------------------------------------------------------------- template ----
TPL = """<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs>\
<linearGradient id='{k}g' gradientUnits='userSpaceOnUse' x1='3' y1='3' x2='29' y2='29'>\
{stops}</linearGradient>\
<linearGradient id='{k}v' gradientUnits='userSpaceOnUse' x1='0' y1='14' x2='0' y2='30'>\
<stop offset='0' stop-color='{mid}' stop-opacity='0'/>\
<stop offset='1' stop-color='{mid}' stop-opacity='.28'/></linearGradient>\
<radialGradient id='{k}s'><stop offset='0' stop-color='#fff' stop-opacity='.55'/>\
<stop offset='.6' stop-color='#fff' stop-opacity='.24'/>\
<stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient>\
<mask id='{k}m'><g fill='#fff' stroke='#fff' stroke-width='0' stroke-linejoin='round' \
stroke-linecap='round'>{body}</g></mask></defs>\
<g stroke-linejoin='round' stroke-linecap='round'>\
<g fill='#fff' stroke='#fff' stroke-width='{halo}'>{body}</g>\
<g fill='url(#{k}g)'>{body}</g>\
<g mask='url(#{k}m)'><rect x='0' y='14' width='32' height='18' fill='url(#{k}v)'/>\
<ellipse cx='{sx}' cy='{sy}' rx='7.2' ry='4.6' fill='url(#{k}s)' \
transform='rotate(-32 {sx} {sy})'/></g>{detail}</g></svg>"""


def stops(key):
    """The gradient stops for one icon: two for an app, five for the chrome."""
    if CHROME.get(key) == 'holo':
        return ''.join("<stop offset='%s' stop-color='%s'/>"
                       % (q(o), oklch(L, MID[1], h)) for o, h, L in HOLO), oklch(0.74, MID[1], 252)
    light, mid = ramp(key)
    return ("<stop offset='0' stop-color='%s'/><stop offset='1' stop-color='%s'/>"
            % (light, mid)), mid


def svg(key, body, detail='', sx=11.5, sy=10.5, halo=STROKE):
    st, mid = stops(key)
    return TPL.format(k=key, stops=st, mid=mid, body=body,
                      detail=detail.replace('url(#g)', 'url(#%sg)' % key),
                      sx=sx, sy=sy, halo=halo)


# ------------------------------------------------------------- keylines ----
# Four silhouettes, sized so a SOLID one lands at roughly the same ink as an
# open one. Equal bounding boxes would not do that: a filled square reads far
# heavier than a circle of the same width, which is the single biggest reason a
# hand-drawn set looks assorted. These are the extents of the geometry; the
# 1.8-wide half of the die-cut then grows every silhouette by the same amount,
# so the margin stays uniform too.
SQ = 22.0                    # square: v95, specs, stick
CD = 19.0                    # circle: diag orb, ach medal
PW, PH = 17.5, 23.0          # portrait: readme, resume, quest
LW, LH = 23.0, 17.5          # landscape: folio, guest, terminal

# Geometry has to stay this far inside the tile so the die-cut clears MARGIN.
SAFE = MARGIN + STROKE / 2   # 3.3


def q(v):
    """Computed geometry: three places, no exponent, no trailing zeros."""
    return ('%.3f' % v).rstrip('0').rstrip('.') or '0'


def n(v):
    """POSITIONS snap to the 0.5 grid. Radii, stroke widths and curve control
       points do not, and the distinction is load-bearing: the weight ladder is
       1.8 / 3.6 / 5.4 / 7.2, none of which survives a 0.5 snap. Rounding them
       silently turned every 1.8 into 2 and every 3.6 into 3.5, which is to say
       it quietly deleted the ladder this whole file exists to enforce."""
    return ('%g' % (round(v * 2) / 2.0))


# ----------------------------------------------------------- primitives ----
def rect(x, y, w, h, r=0):
    return "<rect x='%s' y='%s' width='%s' height='%s' rx='%s'/>" % (
        n(x), n(y), n(w), n(h), q(r))


def circle(cx, cy, r):
    return "<circle cx='%s' cy='%s' r='%s'/>" % (n(cx), n(cy), q(r))


def ellipse(cx, cy, rx, ry):
    return "<ellipse cx='%s' cy='%s' rx='%s' ry='%s'/>" % (
        n(cx), n(cy), q(rx), q(ry))


def capsule(x1, y1, x2, y2, r):
    """A pill between two points, as a PATH rather than a rotated rect.

    Rotating a rect would be shorter to write and wrong to ship: the body
    gradient is in user space, so a transform on the shape turns the gradient
    with it and that icon ends up lit from a different direction than the other
    twelve. Paths keep every silhouette in one coordinate system, so one light
    source really is one light source."""
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    px, py = -uy * r, ux * r
    return ("<path d='M%s %sA%s %s 0 0 1 %s %sL%s %sA%s %s 0 0 1 %s %sZ'/>" % (
        q(x1 + px), q(y1 + py), q(r), q(r), q(x1 - px), q(y1 - py),
        q(x2 - px), q(y2 - py), q(r), q(r), q(x2 + px), q(y2 + py)))


def rpoly(pts, r):
    """Rounded polygon. r is one radius or one per vertex.

    Every straight-edged silhouette in the set is one of these, so a corner is
    never rounded by eye: it is rounded by a number from the ladder.

    THE TANGENT LENGTH IS NOT THE RADIUS. It happens to equal it at 90 degrees,
    which is why the naive version -- step back r along both edges, arc between
    with radius r -- looks correct on a rectangle and is wrong everywhere else.
    At 135 degrees the two tangent points end up 6.7 apart while the arc is told
    to have radius 3.6, so instead of a fillet tucked into the corner you get a
    near-semicircle bulging out past it. That is what pushed the tag over the
    margin, and it had been quietly rounding the resume's fold, the floppy's
    clip and the folder's pocket wrong the whole time. For an interior angle t
    the tangent length is r / tan(t/2); clamp THAT to half the shorter edge and
    recover the radius from it."""
    if not isinstance(r, (list, tuple)):
        r = [r] * len(pts)
    d, N = [], len(pts)
    for i, (x, y) in enumerate(pts):
        ax, ay = pts[i - 1]
        bx, by = pts[(i + 1) % N]
        v1 = (ax - x, ay - y)
        v2 = (bx - x, by - y)
        l1 = math.hypot(*v1) or 1
        l2 = math.hypot(*v2) or 1
        u1 = (v1[0] / l1, v1[1] / l1)
        u2 = (v2[0] / l2, v2[1] / l2)
        half = math.acos(max(-1.0, min(1.0, u1[0] * u2[0] + u1[1] * u2[1]))) / 2.0
        k = math.tan(half)
        # A tangent longer than half an edge would overrun its neighbour and
        # self-intersect, so clamp it and take whatever radius that leaves.
        t = min(r[i] / k, l1 / 2, l2 / 2) if k > 1e-6 else 0.0
        rr = t * k
        p1 = (x + u1[0] * t, y + u1[1] * t)
        p2 = (x + u2[0] * t, y + u2[1] * t)
        cross = v1[0] * v2[1] - v1[1] * v2[0]
        sweep = 0 if cross > 0 else 1
        d.append(('M%s %s' if i == 0 else 'L%s %s') % (q(p1[0]), q(p1[1])))
        if rr > 0.001:
            d.append('A%s %s 0 0 %d %s %s' % (q(rr), q(rr), sweep, q(p2[0]), q(p2[1])))
    return "<path d='%sZ'/>" % ''.join(d)


def rot(pts, a, cx=16.0, cy=16.0):
    """Rotate points about a centre, in degrees. Used to place geometry, never
       as an SVG transform, for the reason capsule() gives."""
    t = math.radians(a)
    c, s = math.cos(t), math.sin(t)
    return [(cx + (x - cx) * c - (y - cy) * s,
             cy + (x - cx) * s + (y - cy) * c) for x, y in pts]


def box(x, y, w, h):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def arcband(cx, cy, r, w, a0, a1):
    """A filled arc, so a speaker wave or a bag handle can be part of the
       silhouette instead of a stroke on top of it. The body has to be fills for
       the die-cut to work, and an arc is the one shape that genuinely wants to
       be a stroke -- so it gets drawn as the region between two radii."""
    ro, ri = r + w / 2.0, r - w / 2.0
    P = lambda rad, a: (cx + rad * math.cos(math.radians(a)),
                        cy + rad * math.sin(math.radians(a)))
    big = 1 if abs(a1 - a0) > 180 else 0
    o0, o1, i1, i0 = P(ro, a0), P(ro, a1), P(ri, a1), P(ri, a0)
    return ("<path d='M%s %sA%s %s 0 %d 1 %s %sL%s %sA%s %s 0 %d 0 %s %sZ'/>" % (
        q(o0[0]), q(o0[1]), q(ro), q(ro), big, q(o1[0]), q(o1[1]),
        q(i1[0]), q(i1[1]), q(ri), q(ri), big, q(i0[0]), q(i0[1])))


def crescent(cx, cy, r, dx, dy):
    """A moon: the part of one disc the other does not cover, as a single path
       of two same-radius arcs. Same radius for both is what keeps the horns
       symmetrical -- an offset circle subtracted from a bigger one gives a
       lopsided crescent."""
    d = math.hypot(dx, dy)
    a = math.atan2(dy, dx)
    t = math.acos(max(-1.0, min(1.0, d / (2 * r))))
    p1 = (cx + dx / 2 + r * math.cos(a + t) - dx / 2, cy + dy / 2 + r * math.sin(a + t) - dy / 2)
    P = lambda ang: (cx + r * math.cos(ang), cy + r * math.sin(ang))
    A, B = P(a + t), P(a - t)
    return ("<path d='M%s %sA%s %s 0 1 1 %s %sA%s %s 0 0 0 %s %sZ'/>"
            % (q(A[0]), q(A[1]), q(r), q(r), q(B[0]), q(B[1]),
               q(r), q(r), q(A[0]), q(A[1])))


def heart(cx, cy, w, fill='#fff', op='.95'):
    """Her heart, rebuilt as geometry rather than traced.

    Measured off images/os/icons/heart.png: aspect 1.505, the cleft sits 0.181
    of the way down, the lobes peak at 0.224 and 0.776 across, it is widest at
    0.337, and the tip is 0.183 of the width across five percent above the base.
    Those five numbers are the shape; everything here is derived from them so it
    can be drawn at any size without redrawing it."""
    h = w / 1.505
    x0, y0 = cx - w / 2, cy - h / 2
    P = lambda px, py: '%s %s' % (q(x0 + px * w), q(y0 + py * h))
    d = ('M' + P(0.5, 0.181) +
         'C' + P(0.46, 0.06) + ' ' + P(0.33, -0.02) + ' ' + P(0.224, 0.0) +
         'C' + P(0.075, 0.02) + ' ' + P(0.0, 0.17) + ' ' + P(0.0, 0.337) +
         'C' + P(0.0, 0.58) + ' ' + P(0.30, 0.80) + ' ' + P(0.5, 1.0) +
         'C' + P(0.70, 0.80) + ' ' + P(1.0, 0.58) + ' ' + P(1.0, 0.337) +
         'C' + P(1.0, 0.17) + ' ' + P(0.925, 0.02) + ' ' + P(0.776, 0.0) +
         'C' + P(0.67, -0.02) + ' ' + P(0.54, 0.06) + ' ' + P(0.5, 0.181) + 'Z')
    return "<path d='%s'/>" % d if fill is None else "<path d='%s'%s/>" % (d, paint(fill, op))


def star(cx, cy, s, fill='#fff', op='1', waist=0.19):
    """The four-point sparkle, with the same concave curve every time.

    Its arms are on the 45s of the grid and its waist is a quadratic through a
    control point at a fraction of the arm, which is what makes it a soft
    sparkle rather than a spiky asterisk. The default is the one the app tiles
    use; the chrome's own sparkle opens it up, because at 22px in a nav bar a
    thin sparkle disappears."""
    a, k = s / 2.0, s / 2.0 * waist
    P = lambda x, y: '%s %s' % (q(cx + x), q(cy + y))
    d = ('M' + P(0, -a) + 'Q' + P(k, -k) + ' ' + P(a, 0) +
         'Q' + P(k, k) + ' ' + P(0, a) + 'Q' + P(-k, k) + ' ' + P(-a, 0) +
         'Q' + P(-k, -k) + ' ' + P(0, -a) + 'Z')
    return "<path d='%s'/>" % d if fill is None else "<path d='%s'%s/>" % (d, paint(fill, op))


def stroke(d, w=DETAIL, fill='#fff', op='1'):
    return ("<path d='%s' fill='none' stroke='%s' stroke-width='%s' opacity='%s'/>"
            % (d, fill, q(w), op))


def paint(fill, op):
    return " fill='%s'%s" % (fill, '' if op in ('1', 1) else " opacity='%s'" % op)


def mark(shape, fill, op='1'):
    """A body primitive reused as a detail: give it a flat fill."""
    return shape[:-2] + paint(fill, op) + '/>'


# --------------------------------------------------------------- shapes ----
# Each returns (body, detail, shine). BODY IS FILLED PRIMITIVES ONLY -- no
# strokes, no transforms. That single restriction is what lets one template
# give all thirteen the same die-cut, the same mask, the same vignette and one
# light direction, and it is why the shapes above are paths rather than rotated
# rects.

def i_readme(p, d):
    """A page, and her heart at the bottom of it."""
    body = rect(7.25, 4.5, PW, PH, R2)
    det = (mark(rect(10.25, 9.2, 11.5, BAR, BAR / 2), p, '.94') +
           mark(rect(10.25, 12.8, 11.5, BAR, BAR / 2), p, '.94') +
           mark(rect(10.25, 16.4, 7, BAR, BAR / 2), p, '.94') +
           heart(16, 22.6, 9.4, p, '.96'))
    return body, det, (11.5, 9.5)


def i_folio(p, d):
    """A folder with a front pocket.

    The old one was two blank cards, which is a picture of paper rather than of
    a body of work. A case with a clasp was the next try and came out reading as
    a briefcase, which says "job" and not "work I made". A tabbed folder says
    portfolio and nothing else, and the step in its top edge keeps it from
    becoming the set's third plain landscape rectangle."""
    body = (rpoly([(4.5, 6.5), (12.4, 6.5), (14.6, 9.4), (27.5, 9.4),
                   (27.5, 26.5), (4.5, 26.5)], [R2, R1, R1, R2, R2, R2]) +
            rpoly([(5.7, 13), (26.3, 13), (24.5, 26.5), (7.5, 26.5)],
                  [R1, R1, R2, R2]))
    det = (mark(rpoly([(7.3, 14.9), (24.7, 14.9), (23.4, 23.7), (8.6, 23.7)],
                      [R1, R1, R1, R1]), p, '.34') +
           star(16, 19.3, 8, p, '.94'))
    return body, det, (10.4, 12.4)


def i_quest(p, d):
    """A scroll: sheet between two rollers, one entry ticked off."""
    body = (rect(8.25, 6.5, 15.5, 19) +
            capsule(7.5, 6.5, 24.5, 6.5, 2.4) +
            capsule(7.5, 25.5, 24.5, 25.5, 2.4))
    det = (mark(circle(7.5, 6.5, DOT), p, '.5') + mark(circle(24.5, 6.5, DOT), p, '.5') +
           mark(circle(7.5, 25.5, DOT), p, '.5') + mark(circle(24.5, 25.5, DOT), p, '.5') +
           mark(rect(10.6, 11.4, 10.8, BAR, BAR / 2), p, '.94') +
           mark(rect(10.6, 15, 7, BAR, BAR / 2), p, '.94') +
           stroke('M10.7 20.4 12.8 22.5 16.6 18.7', DETAIL, p, '.94'))
    return body, det, (11, 9.2)


def i_resume(p, d):
    """A document with the corner turned down. The fold is the whole reason
       this reads as a CV and not as the read_me page."""
    fold = HEAVY
    body = rpoly([(7.25, 4.5), (24.75 - fold, 4.5), (24.75, 4.5 + fold),
                  (24.75, 27.5), (7.25, 27.5)], [R2, R1, R1, R2, R2])
    det = (mark(rpoly([(24.75 - fold, 4.5), (24.75, 4.5 + fold),
                       (24.75 - fold, 4.5 + fold)], [R1, R1, R1]), p, '.55') +
           mark(rect(10.4, 13.6, 11.2, BAR, BAR / 2), p, '.94') +
           mark(rect(10.4, 17.2, 11.2, BAR, BAR / 2), p, '.94') +
           mark(rect(10.4, 20.8, 7, BAR, BAR / 2), p, '.94'))
    return body, det, (11, 9.2)


def i_quote(p, d):
    """A price tag, the shape it was before I touched it.

    Three wrong answers first, and they are worth recording because they were
    all the same mistake. Tilted at -30 it could not carry its share of ink --
    the rotation spends four corners of the tile on nothing, and no size that
    fixes that still clears the margin. Stood upright on a rectangular body it
    became a pentagon, which is a house, upside down. Turned on its side it
    became a luggage label.

    What makes a tag a tag is not where the point is -- the pentagon had its
    point in the right place. It is that the BODY sits on the diagonal, so the
    two edges running into the point are 45s and the whole thing hangs. An
    upright body with a point on it is a house no matter how sharp the point.
    So the body is a diagonal, and the hole and the two rules sit on the 45 with
    it. The hole is punched in the die-cut white, which makes the thing that
    reads as a hole the sticker's own edge."""
    body = rpoly([(15.2, 3.8), (28.4, 3.8), (28.4, 15.4), (16, 27.8), (3.6, 15.4)],
                 [R2, R2, R2, R1, R2])
    det = (mark(circle(21.6, 10.4, 2.5), '#fff', '1') +
           stroke('M10.8 17.4 14.6 21.2', DETAIL, p, '.58') +
           stroke('M13.6 14.6 17.4 18.4', DETAIL, p, '.58'))
    return body, det, (12.2, 10.2)


def i_diag(p, d):
    """The crystal ball on its stand."""
    body = circle(16, 13.6, CD / 2 + 0.6) + capsule(10.6, 25.4, 21.4, 25.4, 2.6)
    det = (star(20.9, 9.1, 5.4, p, '.9') +
           stroke('M13.9 15a2.15 2.15 0 1 1 2.35 2.05v1.25', DETAIL, p, '.94') +
           mark(circle(16.25, 20.55, DOT), p, '.94'))
    return body, det, (11.6, 10.4)


def i_guest(p, d):
    """An open book with a name written in it.

    The old one was a postage stamp holding a heart, which is a picture of mail.
    A guestbook is a book you sign, so it is a book, and the signature is the
    only mark in the set drawn freehand -- deliberately, because handwriting is
    the point."""
    body = rect(4.5, 7.25, LW, LH, R2)
    det = (mark(rect(6.3, 9.4, 8.6, 13.2, R1), p, '.96') +
           mark(rect(17.1, 9.4, 8.6, 13.2, R1), p, '.96') +
           mark(rect(8.1, 12.4, 5, BAR, BAR / 2), 'url(#g)', '.5') +
           mark(rect(8.1, 15.4, 5, BAR, BAR / 2), 'url(#g)', '.5') +
           mark(rect(8.1, 18.4, 3.4, BAR, BAR / 2), 'url(#g)', '.5') +
           stroke('M18.9 15.8c.9-2.9 1.9-3 2.4-1s1.4 1.5 2.6-1.6', DETAIL, 'url(#g)', '.72') +
           mark(rect(18.9, 18.4, 5, BAR, BAR / 2), 'url(#g)', '.4'))
    return body, det, (10.2, 11.2)


def i_stick(p, d):
    """Her bear. Given a muzzle this time: eyes and a smile on a bare circle
       read as a smiley, and the muzzle is what makes it an animal."""
    body = (circle(8, 9.2, 4.3) + circle(24, 9.2, 4.3) +
            circle(16, 17.6, SQ / 2 - 1.2))
    det = (mark(circle(8, 9.2, 1.9), p, '.62') +
           mark(circle(24, 9.2, 1.9), p, '.62') +
           mark(ellipse(16, 20.6, 6.1, 4.3), p, '.95') +
           mark(circle(12, 16.1, 1.7), d, '1') +
           mark(circle(20, 16.1, 1.7), d, '1') +
           mark(ellipse(16, 18.5, 1.9, 1.4), d, '1') +
           stroke('M16 19.9v1.1M16 21a1.7 1.7 0 0 1-1.8 0M16 21a1.7 1.7 0 0 0 1.8 0',
                  DETAIL, d, '1'))
    return body, det, (11.4, 12.6)


def i_ach(p, d):
    """A rosette. The old one was a disc with two sticks under it; the scallops
       are what make an award ribbon look like an award ribbon."""
    ring = ''.join(circle(16 + 8.0 * math.cos(math.radians(a)),
                          13.6 + 8.0 * math.sin(math.radians(a)), 2.1)
                   for a in range(0, 360, 30))
    body = (capsule(13.6, 20.6, 11.7, 25.6, 2.6) +
            capsule(18.4, 20.6, 20.3, 25.6, 2.6) +
            ring + circle(16, 13.6, CD / 2 - 1.1))
    det = (mark(circle(16, 13.6, 5.7), p, '.42') + star(16, 13.6, 8.6, p, '1'))
    return body, det, (11.4, 9.8)


def i_patch(p, d):
    """A plaster, on the 45."""
    a = math.radians(-45)
    u = (math.cos(a), math.sin(a))
    v = (-u[1], u[0])
    P = lambda du, dv: (16 + u[0] * du + v[0] * dv, 16 + u[1] * du + v[1] * dv)
    body = capsule(*(P(-9.2, 0) + P(9.2, 0)), r=6.2)
    dots = ''.join(mark(circle(*P(su * 7.2, sv * 2.7), r=DOT), p, '.85')
                   for su in (-1, 1) for sv in (-1, 0, 1))
    det = mark(rpoly(rot(box(10.6, 10.6, 10.8, 10.8), -45), R2), p, '.9') + dots
    return body, det, (11.8, 13.4)


def i_terminal(p, d):
    """A screen with a prompt in it."""
    body = (rect(5, 5, 22, 16, R2) + rect(14.2, 20.5, 3.6, 3.6) +
            capsule(10.8, 25.4, 21.2, 25.4, 1.8))
    det = (stroke('M9.6 10.4 13.1 13.2 9.6 16', DETAIL, p, '.96') +
           mark(rect(15.6, 14.4, 6.8, BAR, BAR / 2), p, '.9'))
    return body, det, (10.4, 8.6)


def i_v95(p, d):
    """A floppy. It was already a floppy drawn inside a square; a floppy has a
       clipped corner, so now it has one."""
    body = rpoly([(5.5, 5.5), (26.5 - HEAVY, 5.5), (26.5, 5.5 + HEAVY),
                  (26.5, 26.5), (5.5, 26.5)], [R2, R1, R1, R2, R2])
    det = (mark(rect(11.6, 5.8, 8.8, 7.4, R1), p, '.96') +
           mark(rect(17.4, 6.8, 2.2, 5.4, 1.1), 'url(#g)', '1') +
           mark(rect(8.6, 16.6, 14.8, 9.4, R1), p, '.96') +
           mark(rect(10.8, 19.2, 10.4, BAR, BAR / 2), 'url(#g)', '.55') +
           mark(rect(10.8, 21.8, 6.8, BAR, BAR / 2), 'url(#g)', '.55'))
    return body, det, (8.6, 9.2)


def i_specs(p, d):
    """A chip, two legs a side."""
    pins = ''.join(capsule(*e, r=1.1) for e in (
        (12.2, 4.6, 12.2, 7.6), (19.8, 4.6, 19.8, 7.6),
        (12.2, 24.4, 12.2, 27.4), (19.8, 24.4, 19.8, 27.4),
        (4.6, 12.2, 7.6, 12.2), (4.6, 19.8, 7.6, 19.8),
        (24.4, 12.2, 27.4, 12.2), (24.4, 19.8, 27.4, 19.8)))
    body = pins + rect(7.25, 7.25, PW, PW, R2)
    det = (mark(rect(11, 11, 10, 10, R1), p, '.45') +
           ''.join(mark(circle(x, y, DOT), p, '1')
                   for x in (13.4, 18.6) for y in (13.4, 18.6)))
    return body, det, (11, 11)


def i_stick_peel(p, d):
    """The other reading of stickers.exe: a die-cut sticker lifting at the
       corner. The whole set already wears a 3.6 white sticker edge, so this is
       the one icon where the system's own rule becomes the subject."""
    body = (rpoly([(5.5, 5.5), (26.5, 5.5), (26.5, 18.6), (18.6, 26.5), (5.5, 26.5)],
                  [R2, R2, R1, R1, R2]) +
            "<path d='M26.4 18.6Q28 26.4 18.6 26.6Q24.2 24.4 26.4 18.6Z'/>")
    det = (mark("<path d='M26.4 18.6Q28 26.4 18.6 26.6Q24.2 24.4 26.4 18.6Z'/>", p, '.88') +
           heart(15.4, 15, 12.4, p, '.96'))
    return body, det, (11, 10.6)


SHAPES = [
    ('readme', i_readme), ('folio', i_folio), ('quest', i_quest),
    ('resume', i_resume), ('quote', i_quote), ('diag', i_diag),
    ('guest', i_guest), ('stick', i_stick_peel), ('ach', i_ach),
    ('patch', i_patch), ('terminal', i_terminal), ('v95', i_v95),
    ('specs', i_specs),
]





# ------------------------------------------------------- chrome glyphs ----
# The nine system controls, two dock actions and three bear verbs. Same grid,
# same ladder, same die-cut, same one light. What separates them from the app
# tiles is the palette, not the construction -- see CHROME above.

def c_cog(p, d):
    """A gear: hub, eight teeth on the 45s, and a hole punched in the die-cut
       white so the thing that reads as a hole is the sticker's own edge."""
    teeth = ''.join(rpoly(rot(box(13.5, 3.8, 5.0, 5.6), a), R1) for a in range(0, 360, 45))
    return teeth + circle(16, 16, 8.2), mark(circle(16, 16, 3.4), '#fff', '1'), (11.4, 11.4)


# The one traced silhouette in the set, kept on purpose. Everything else here is
# built from primitives so its numbers cannot drift, and the palette I built that
# way -- a disc with a hole and some dots -- was a worse palette: a circle with
# more circles in it. This blob is the shape that reads as a palette, so it stays
# as drawn. A generator exists to stop numbers drifting, not to overrule a shape
# that already works.
PALETTE = ("<path d='M15.4 4.8C21.9 4.8 27.4 9 27.4 14.4C27.4 18.1 24.9 20 22.4 21"
           "C20.4 21.8 19.4 22.9 19.2 24.2C18.9 26.3 16.9 27.5 14.6 27.2"
           "C8.8 26.5 3.6 21.4 3.6 15.4C3.6 9.3 8.9 4.8 15.4 4.8Z'/>")


def c_swatch(p, d):
    """A painter's palette. The wells are all one white now: on a body that is
       already sweeping through every hue in the palette, four coloured dots
       were arguing with the thing they sat on."""
    # Three wells and one thumb hole, none of them touching. The traced original
    # had four wells, and the fourth overlapped the hole -- which is what turns a
    # hole into a dent.
    det = (mark(circle(20.2, 16.8, 3.0), d, '.46') +
           mark(circle(9.8, 11.0, 3.0), p, '.96') +
           mark(circle(17.6, 9.6, 3.0), p, '.96') +
           mark(circle(8.4, 19.2, 3.0), p, '.96'))
    return PALETTE, det, (10.6, 11.4)


def c_wall(p, d):
    """A framed picture of the sky.

    The landscape keyline IS a picture frame, so this icon is the one place in
    the set where the keyline does double duty as the object. What is inside it
    matters more than the frame: the universal image glyph is a mountain and a
    sun, and there are no mountains in icybearOS. Every wall in the drop has the
    same two things in it -- a light in the sky and a cloud under it -- so that
    is what the frame holds. The sun sits high left and the cloud low right,
    which is the diagonal the rest of the set reads on."""
    body = rect(4.5, 7.25, LW, LH, R2)
    inner = (6.3, 9.05, 19.4, 13.9)
    det = (mark(rect(inner[0], inner[1], inner[2], inner[3], R1), p, '.96') +
           mark(circle(11.0, 13.4, 2.6), 'url(#g)', '.84') +
           # a cloud is a capsule with two lumps on it; three circles alone
           # read as a paw print
           mark(capsule(14.6, 19.6, 20.6, 19.6, 2.3), 'url(#g)', '.56') +
           mark(circle(16.9, 17.5, 2.7), 'url(#g)', '.56') +
           mark(circle(19.9, 18.1, 2.0), 'url(#g)', '.56') +
           star(22.4, 12.4, 3.2, 'url(#g)', '.7'))
    return body, det, (10.2, 11.2)


def c_moon(p, d):
    """A crescent, a star and a dot -- all three in the BODY, not on top of it.

    Two things went wrong here. Both arcs share a radius, which is what keeps
    the horns even; subtracting a smaller disc from a bigger one gives a
    lopsided moon, and that is the usual way this shape goes wrong. And the
    offset runs the opposite way to intuition: moving the two discs closer
    together makes the crescent THINNER, not fatter, because a crescent is what
    one disc has that the other does not.

    The star and the dot belong to the silhouette because they sit outside the
    crescent. Drawn as details they would carry no die-cut, which is invisible
    against a dark wallpaper and worse against a light one."""
    body = (crescent(16, 16, 12.4, 8.2, -8.2) +
            star(23.4, 8.4, 7.2, None, waist=0.28) + circle(26.6, 14.8, DOT))
    return body, '', (9.6, 12.6)


def _speaker():
    return (rect(3.4, 11.6, 7.0, 8.8, R1) +
            rpoly([(9.8, 11.6), (16.4, 4.6), (16.4, 27.4), (9.8, 20.4)],
                  [R1, R1, R1, R1]))


def c_sound_on(p, d):
    """Speaker and two waves. The waves are filled arcs, not strokes: the body
       has to be fills for the die-cut to work, and an arc is the one shape that
       genuinely wants to be a stroke, so it gets drawn as the band between two
       radii instead."""
    body = (_speaker() + arcband(16.4, 16, 6.6, 2.6, -56, 56) +
            arcband(16.4, 16, 10.4, 2.6, -56, 56))
    return body, '', (9.4, 12.4)


def c_sound_off(p, d):
    """Speaker and a cross."""
    body = (_speaker() + capsule(20.8, 12.0, 26.4, 17.6, 2.2) +
            capsule(26.4, 12.0, 20.8, 17.6, 2.2))
    return body, '', (9.4, 12.4)


def c_faq(p, d):
    """A speech bubble with the question inside it."""
    body = (rect(4.4, 4.2, 23.2, 17.2, R3) +
            rpoly([(10.4, 19.2), (17.6, 19.2), (9.6, 27.6)], [R1, R1, R1]))
    det = (stroke('M12.9 11a3.2 3.2 0 1 1 3.4 3.1v1.7', DETAIL, p, '.96') +
           mark(circle(16.3, 17.6, DOT), p, '.96'))
    return body, det, (10.4, 9.4)


def c_phone(p, d):
    """A handset. The old one was 20.6 wide on a 24.8 body, which is a tablet."""
    body = rect(8.5, 3.5, 15, 25, R2)
    det = (mark(rect(10.6, 6.8, 10.8, 17, R1), p, '.94') +
           mark(rect(13.6, 5.0, 4.8, 1.2, 0.6), p, '.7') +
           mark(rect(13.0, 25.2, 6, 1.4, 0.7), p, '.7'))
    return body, det, (11.6, 9.4)


def c_camera(p, d):
    """Body, viewfinder hump, lens."""
    body = (rpoly([(11.8, 5.8), (20.2, 5.8), (20.2, 9.6), (11.8, 9.6)], [R1, R1, 0, 0]) +
            rect(4.0, 9.0, 24, 16.8, R2))
    det = (mark(circle(16, 17.4, 6.0), p, '.34') +
           mark(circle(16, 17.4, 3.9), p, '.96') +
           mark(circle(24.4, 12.6, DOT), p, '.85'))
    return body, det, (9.8, 12.6)


def c_bags(p, d):
    """A bin, and committed to being one.

    Two earlier passes fought this: it kept coming out as a bin when I was
    aiming at a tote, and I kept correcting toward the tote. The joke lands
    better as a bin -- the app is called bags, so a bin says the bags are
    rubbish, which is the gag -- so it now has the three things a tote does not:
    a lid wider than the body, a handle sitting on the lid, and ribs."""
    body = (arcband(16, 8.8, 4.0, 2.2, 180, 360) +
            rect(4.4, 8.8, 23.2, 4.0, R1) +
            rpoly([(6.2, 12.4), (25.8, 12.4), (23.7, 28.0), (8.3, 28.0)],
                  [R1, R1, R2, R2]))
    det = ''.join(mark(rect(x, 15.4, BAR, 9.0, BAR / 2), p, '.4')
                  for x in (11.3, 15.1, 18.9))
    return body, det, (10.4, 15.4)


def c_flower(p, d):
    """Six petals, not five. Five means 72 degrees, which is not a number this
       system contains; six is 60, which is, and a six-petal bloom is a blossom
       rather than a worse daisy."""
    body = (''.join(circle(16 + 7.6 * math.cos(math.radians(a)),
                           16 + 7.6 * math.sin(math.radians(a)), 4.6)
                    for a in range(0, 360, 60)) + circle(16, 16, 5.4))
    det = (mark(circle(16, 16, 3.2), p, '.9') +
           ''.join(mark(circle(16 + 1.5 * math.cos(math.radians(a)),
                               16 + 1.5 * math.sin(math.radians(a)), 0.8), 'url(#g)', '.5')
                   for a in range(30, 360, 120)))
    return body, det, (11.4, 11.4)


def c_berry(p, d):
    """Three berries and a leaf."""
    body = (circle(9.9, 13.8, 6.4) + circle(22.1, 13.0, 6.4) + circle(16, 22.0, 6.4) +
            rpoly([(16, 3.6), (20.0, 6.6), (16, 8.8), (12.0, 6.6)], [R1, R1, R1, R1]))
    det = (''.join(mark(circle(x, y, 0.95), 'url(#g)', '.42') for x, y in
                   ((8.4, 12.4), (11.4, 15.2), (8.6, 16.4), (12.0, 11.6),
                    (20.6, 11.6), (23.6, 14.4), (20.8, 15.6), (24.0, 11.0),
                    (14.4, 20.6), (17.6, 23.4), (14.6, 24.0), (18.0, 19.8))) +
           mark(circle(7.6, 10.8, 1.8), p, '.4') + mark(circle(19.8, 10.0, 1.6), p, '.34'))
    return body, det, (10.0, 11.4)


def c_heart(p, d):
    """Her heart, and nothing else. Same five measured numbers as read_me's."""
    return heart(16, 16.6, 25.0, None), '', (11.2, 12.4)


def c_spark(p, d):
    """Three sparkles, weighted so the tile carries its share of ink -- one
       four-point star alone is thin enough to read as a different set."""
    body = (star(14.9, 14.9, 22.6, None, waist=0.30) +
            star(23.8, 23.4, 9.0, None, waist=0.30) +
            star(7.2, 24.6, 6.4, None, waist=0.30))
    return body, '', (10.0, 10.2)


ALT_SHAPES = [('stick-bear', i_stick)]   # the icybera pack seal


CHROME_SHAPES = [
    ('cog', c_cog), ('swatch', c_swatch), ('moon', c_moon),
    ('sound-on', c_sound_on), ('sound-off', c_sound_off), ('faq', c_faq),
    ('phone', c_phone), ('bags', c_bags), ('wall', c_wall),
    ('camera', c_camera), ('flower', c_flower),
    ('berry', c_berry), ('heart', c_heart), ('spark', c_spark),
]


# ---------------------------------------------------------------- audit ----
def audit():
    """Measure the rendered result rather than trust the source.

    Ink coverage is the number the eye actually responds to, and it cannot be
    read off the geometry: a silhouette's area is not its area plus a 1.8-wide
    die-cut minus wherever that die-cut overlaps itself. So the icons are
    rendered and counted. The old hand-drawn set ran 40.6% to 66.1% of the tile,
    a 26-point spread, which is why it looked assorted even though every icon
    was individually fine."""
    from PIL import Image
    brave = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    if not os.path.exists(brave):
        print('  audit needs Brave to rasterise; skipped')
        return 0
    keys = [k for k, _ in SHAPES + CHROME_SHAPES + ALT_SHAPES]
    cell, tmp = 200, '/tmp/icon-audit'
    os.makedirs(tmp, exist_ok=True)
    # ids are namespaced per icon, but thirteen icons in ONE document still
    # need salting or every gradient after the first would resolve to a
    # different icon's.
    def salt(i, t):
        return t.replace("id='", "id='a%d" % i).replace('url(#', 'url(#a%d' % i)
    io.open(tmp + '/sheet.html', 'w', encoding='utf-8').write(
        "<style>html,body{margin:0;background:#000}body{display:flex;width:%dpx}"
        "i{width:%dpx;height:%dpx}svg{width:100%%;height:100%%;display:block}</style>%s"
        % (cell * len(keys), cell, cell,
           ''.join('<i>%s</i>' % salt(i, build(k)) for i, k in enumerate(keys))))
    subprocess.run([brave, '--headless', '--disable-gpu', '--hide-scrollbars',
                    '--force-device-scale-factor=1',
                    '--window-size=%d,%d' % (cell * len(keys), cell),
                    '--screenshot=' + tmp + '/sheet.png',
                    'file://' + tmp + '/sheet.html'], capture_output=True)
    img = Image.open(tmp + '/sheet.png').convert('RGB')
    rows, fails = [], 0
    for i, k in enumerate(keys):
        px = img.crop((i * cell, 0, (i + 1) * cell, cell)).load()
        ink, clear = 0, cell
        for y in range(cell):
            for x in range(cell):
                if sum(px[x, y]) > 24:
                    ink += 1
                    clear = min(clear, x, y, cell - 1 - x, cell - 1 - y)
        rows.append((k, 100.0 * ink / (cell * cell), clear / float(cell) * W))
    print('\n  rendered ink coverage, and how close the die-cut comes to the edge\n')
    chrome = set(k for k, _ in CHROME_SHAPES + ALT_SHAPES)
    for k, cov, clr in sorted(rows, key=lambda r: -r[1]):
        lo, hi = (40, 58) if k in chrome else (49, 60)
        bad = not (lo <= cov <= hi) or clr < MARGIN - 0.15
        fails += bad
        print('  %s %-9s %5.1f%%   clears %4.2f' % ('FAIL' if bad else '  ok', k, cov, clr))
    lo = min(r[1] for r in rows)
    hi = max(r[1] for r in rows)
    print('\n  spread %.1f points (%.1f to %.1f), margin floor %.1f' % (hi - lo, lo, hi, MARGIN))
    return 1 if fails else 0


def main():
    global HUES
    if '--spectrum' in sys.argv:
        HUES = SPECTRUM
    write = '--check' not in sys.argv and '--audit' not in sys.argv
    for key, _ in SHAPES + CHROME_SHAPES + ALT_SHAPES:
        out = build(key)
        if write:
            io.open(os.path.join(OUT, key + '.svg'), 'w', encoding='utf-8').write(out)
        tag = 'holo' if CHROME.get(key) == 'holo' else HUES[key][1]
        print('  %-10s %-12s %5.1f KB' % (key, tag, len(out) / 1024.0))
    print('\n  %d tiles + %d glyphs, %s'
          % (len(SHAPES), len(CHROME_SHAPES), 'written' if write else 'not written'))
    return audit() if '--audit' in sys.argv else 0






def build(key):
    p, d = inks(key)
    body, det, (sx, sy) = dict(SHAPES + CHROME_SHAPES + ALT_SHAPES)[key](p, d)
    return svg(key, body, det, sx, sy)


if __name__ == '__main__':
    sys.exit(main())

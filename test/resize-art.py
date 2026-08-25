#!/usr/bin/env python3
"""Downscale character art without the fringing Photoshop produces.

    test/resize-art.py --height 1660 out/ in1.png in2.png ...
    test/resize-art.py --match-scale --stand-height 1660 out/ stand.png sit.png

TWO THINGS EVERY NAIVE RESIZE GETS WRONG ON ART WITH SOFT ALPHA EDGES.

1. Fully transparent pixels still carry RGB, usually white or black, and a
   normal resample averages that garbage into every neighbouring edge pixel.
   The result is a light or dark fringe around hair, lace and any feathered
   edge. The fix is to premultiply RGB by alpha before resampling and divide it
   back out afterwards, so transparent pixels contribute nothing.

2. sRGB is gamma-encoded, so averaging two sRGB values is not averaging two
   quantities of light. Downscaling in sRGB darkens soft edges and dulls
   gradients. Linearise, resample, re-encode.

Photoshop exposes neither as a setting. Bicubic Sharper additionally adds a
sharpening pass that turns the fringe into a visible halo, which is usually the
thing people notice when a big export "looks like shit" small.

--match-scale exists because a sitting and a standing pose have to share a body
scale: the same head must be the same number of pixels in both, or the character
changes size when the pose changes. It measures each figure's opaque bounding
box, scales BOTH by the single factor that puts the standing figure at
--stand-height, and lets the sitting one land wherever that scale puts it. It
does NOT resize each to a target height, which is what breaks the proportions.

--group takes a scale and the files it applies to, and repeats. Poses rendered
at different output resolutions, or with the camera at different distances, need
different factors to arrive at one body scale, and the canvas below has to be
solved across all of them at once, so they cannot be separate runs.

--canvas is the other half of the problem, and it is a CSS problem more than an
image one. Matched body scale in the files survives only if the page sizes them
by a constant factor. Anything of the fit-to-box family -- max-height, height,
object-fit -- sizes by the BOUNDING BOX, so a pose with a lifted leg is taller
per unit of body and gets shrunk to fit, and a seated pose is wider than it is
tall and gets shrunk far more. Every pose then renders at a different scale no
matter how carefully the files were cut.

The fix is to make every pose the same bounding box. --canvas pastes all of them
onto one transparent canvas, ground on the bottom edge and heads on a shared
vertical line, so bounding box and body scale become the same measurement and
one CSS height governs every pose. Transparent padding is nearly free in WebP:
uniform alpha is what the format compresses best.
"""
import os, sys, argparse

import numpy as np

try:
    from PIL import Image
except ImportError:
    sys.exit('needs Pillow:  pip3 install pillow')


SRGB_A = 0.055


def srgb_to_linear(x):
    """x in 0..1 float."""
    return np.where(x <= 0.04045, x / 12.92, ((x + SRGB_A) / (1 + SRGB_A)) ** 2.4)


def linear_to_srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, x * 12.92, (1 + SRGB_A) * x ** (1 / 2.4) - SRGB_A)


def resize_art(img, size):
    """Premultiplied, linear-light Lanczos.

    Order matters and each step is load-bearing:
      sRGB -> linear      so averaging averages light, not gamma-encoded numbers
      premultiply         so transparent pixels contribute nothing to an edge
      resample            colour and alpha with the SAME filter
      un-premultiply      back to straight alpha, which is what WebP stores
      linear -> sRGB
    """
    a = np.asarray(img.convert('RGBA'), dtype=np.float64) / 255.0
    rgb, alpha = a[..., :3], a[..., 3:4]
    lin = srgb_to_linear(rgb) * alpha                      # premultiplied, linear

    def band(arr):
        # float32, not float64. PIL's 'F' mode IS float32, and handing it a
        # float64 buffer makes it read two pixels' bytes as one, which produces
        # dense saturated noise rather than an error.
        return Image.fromarray(np.ascontiguousarray(arr, dtype=np.float32)).resize(size, Image.LANCZOS)

    pm = np.stack([np.asarray(band(lin[..., i])) for i in range(3)], axis=-1)
    a2 = np.clip(np.asarray(band(alpha[..., 0])), 0.0, 1.0)[..., None]

    safe = np.where(a2 > 1e-6, a2, 1.0)
    straight = np.where(a2 > 1e-6, pm / safe, 0.0)         # un-premultiply
    out = linear_to_srgb(straight)

    rgba = np.concatenate([out, np.clip(a2, 0, 1)], axis=-1)
    return Image.fromarray(np.round(rgba * 255).astype(np.uint8))


def figure_box(img):
    """Bounding box of everything meaningfully opaque, ignoring stray dust."""
    a = img.convert('RGBA').split()[3]
    return a.point(lambda v: 255 if v > 8 else 0).getbbox()


def head_x(img, at=0.055):
    """Horizontal centre of the head, in pixels, on an already-trimmed figure.

    A centroid of the whole top band gets dragged sideways by asymmetric hair
    and by anything a raised hand puts up there. Walking down a little from the
    topmost opaque pixel and taking the contiguous run that pixel belongs to
    follows the head instead, on a lying pose as well as a standing one."""
    a = np.asarray(img.convert('RGBA').split()[3]) > 8
    h, w = a.shape
    top = int(np.argmax(a.any(1)))
    crown = int(np.flatnonzero(a[top]).mean())
    row = a[min(h - 1, top + int(h * at))]
    if not row[crown]:                      # crown column already empty: nearest run
        on = np.flatnonzero(row)
        if len(on):
            crown = int(on[np.argmin(abs(on - crown))])
    l = r = crown
    while l > 0 and row[l - 1]:
        l -= 1
    while r < w - 1 and row[r + 1]:
        r += 1
    return (l + r) / 2.0


def solve_canvas(sizes_and_heads):
    """Smallest canvas, and the head line inside it, that holds every figure.

    Placing a figure puts its head on the shared line, so the canvas has to
    reach head_x to the left of that line and (width - head_x) to the right.
    The line that minimises the total is wherever those two demands balance, so
    just scan for it: seventeen figures is not a search worth being clever
    about."""
    best = None
    for i in range(150, 851):
        f = i / 1000.0
        w = max(max(hx / f, (wd - hx) / (1 - f)) for wd, _, hx in sizes_and_heads)
        if best is None or w < best[0]:
            best = (w, f)
    width, f = best
    return int(round(width)), max(h for _, h, _ in sizes_and_heads), f


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--height', type=int, help='target height of the trimmed figure')
    ap.add_argument('--match-scale', action='store_true',
                    help='scale every input by ONE factor so body proportions match')
    ap.add_argument('--stand-height', type=int, default=1660,
                    help='with --match-scale: target height of the TALLEST figure')
    ap.add_argument('--scale', type=float,
                    help='explicit factor applied to the trimmed figure. Use this when '
                         'inputs come from different render resolutions or camera '
                         'distances: body scale is a property of the CAMERA, not of the '
                         'figure, so matching bounding-box heights is wrong. A pose '
                         'leaning forward is genuinely shorter and must stay shorter.')
    ap.add_argument('--group', action='append', nargs='+', metavar=('SCALE', 'FILE'),
                    default=[], help='a scale and the files it applies to. Repeatable.')
    ap.add_argument('--canvas', action='store_true',
                    help='paste every result onto one shared canvas, ground on the '
                         'bottom edge and heads on a shared line, so the page can size '
                         'them all with a single CSS height')
    ap.add_argument('--quality', type=int, default=92)
    ap.add_argument('out')
    ap.add_argument('files', nargs='*')
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    jobs = [(f, args.scale) for f in args.files]
    for g in args.group:
        if len(g) < 2:
            sys.exit('--group takes a scale then at least one file')
        jobs += [(f, float(g[0])) for f in g[1:]]
    if not jobs:
        sys.exit('nothing to do: pass files, or --group SCALE FILE...')

    loaded = []
    for f, sc in jobs:
        im = Image.open(f).convert('RGBA')
        box = figure_box(im)
        if not box:
            print('  %-30s no opaque pixels, skipped' % os.path.basename(f)); continue
        loaded.append([f, im.crop(box), sc])

    if args.match_scale:
        tallest = max(im.size[1] for _, im, _ in loaded)
        one = args.stand_height / tallest
        print('  one scale for all %d files: %.4f  (tallest figure %dpx -> %dpx)'
              % (len(loaded), one, tallest, args.stand_height))
        for job in loaded:
            job[2] = one

    # Resize first, then solve the canvas, because the head line has to be
    # measured at the size the file will actually ship at.
    done = []
    for f, im, sc in loaded:
        w, h = im.size
        if sc:
            nw, nh = max(1, round(w * sc)), max(1, round(h * sc))
        elif args.height:
            nh, nw = args.height, max(1, round(w * args.height / h))
        else:
            sys.exit('%s has no scale: pass --scale, --match-scale, --height or --group'
                     % os.path.basename(f))
        done.append((f, resize_art(im, (nw, nh)), (w, h)))

    place = None
    if args.canvas:
        heads = [(im.size[0], im.size[1], head_x(im)) for _, im, _ in done]
        cw, ch, f = solve_canvas(heads)
        place = (cw, ch, f)
        print('  canvas %dx%d, heads at %.1f%% of the width' % (cw, ch, f * 100))

    for f, im, src in done:
        out, (w, h) = im, im.size
        if place:
            cw, ch, frac = place
            out = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
            out.paste(im, (int(round(frac * cw - head_x(im))), ch - h), im)
        name = os.path.splitext(os.path.basename(f))[0]
        dst = os.path.join(args.out, name + '.webp')
        out.save(dst, 'WEBP', quality=args.quality, method=6)
        print('  %-22s %5dx%-5d -> %4dx%-4d figure%s  %6.1f KB' %
              (os.path.basename(f), src[0], src[1], w, h,
               ' on canvas' if place else '', os.path.getsize(dst) / 1024))


if __name__ == '__main__':
    main()

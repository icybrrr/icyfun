#!/usr/bin/env python3
"""Strip a baked ground shadow out of a character render.

    test/deshadow.py out.png in.png

The renders arrive with the floor shadow drawn into the alpha channel: on
icy-stand-12.png it is 361,000 semi-transparent grey pixels in a band under and
to the left of her feet. On the desktop it reads as a smudge; on the OG card,
which composites her over a sky with no floor in it, it reads as damage. The OS
draws her contact shadow in CSS instead, so the baked one is not wanted anywhere.

The hard part is not finding the shadow, it is not eating her outline with it.
A shadow pixel and an antialiased edge pixel look identical one at a time --
both are semi-transparent and both can be desaturated. What separates them is
where they are: an edge pixel touches the solid figure, a shadow pixel does not.
So the solid body is found first (alpha above 240), grown by a few pixels, and
only greyish semi-transparent pixels OUTSIDE that halo are removed.

Deliberately conservative. It will leave shadow that laps under her shoes,
because the alternative is chewing the shoes.
"""
import sys
import numpy as np

try:
    from PIL import Image
except ImportError:
    sys.exit('needs Pillow:  pip3 install pillow')

GROW = 7          # px of protection around the solid figure
SAT_MAX = 34      # a shadow is close to neutral
VAL_MIN, VAL_MAX = 40, 205


def grow(mask, r):
    """Dilate by r, as r single-pixel steps in four directions."""
    out = mask.copy()
    for _ in range(r):
        out[1:, :] |= out[:-1, :]
        out[:-1, :] |= out[1:, :]
        out[:, 1:] |= out[:, :-1]
        out[:, :-1] |= out[:, 1:]
    return out


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    dst, src = sys.argv[1], sys.argv[2]
    im = Image.open(src).convert('RGBA')
    a = np.asarray(im).copy()
    alpha = a[..., 3].astype(np.int16)
    rgb = a[..., :3].astype(np.int16)
    sat = rgb.max(2) - rgb.min(2)
    val = rgb.max(2)

    protected = grow(alpha > 240, GROW)
    shadow = (alpha > 0) & ~protected & (sat < SAT_MAX) & (val > VAL_MIN) & (val < VAL_MAX)

    before = int((alpha > 8).sum())
    a[..., 3] = np.where(shadow, 0, a[..., 3])
    removed = int(shadow.sum())
    Image.fromarray(a).save(dst)
    print('  %s' % src)
    print('  removed %d shadow pixels (%.2f%% of what was visible)'
          % (removed, 100.0 * removed / max(1, before)))
    print('  -> %s' % dst)


if __name__ == '__main__':
    main()

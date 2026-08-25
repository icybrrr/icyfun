#!/usr/bin/env python3
"""Compare two 20-combo capture sets.

    test/visual.sh before
    ... make a change ...
    test/visual.sh after
    test/visual-diff.py                 summary
    test/visual-diff.py --write         also write per-combo diff maps

Exit code is non-zero if any combo differs, so a migration step can gate on it.

A DIFF IS NOT A VERDICT. The harness is deterministic to 0px, so any number
above zero is a real rendered difference; whether it is the intended one is a
judgement. The point of the tool is that an unexpected number is impossible to
miss, not that a number is automatically bad. The right move on a surprise is to
look at the map, not to raise the threshold.
"""
import os, sys, struct, zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SHOTS = os.path.join(ROOT, 'test', '.shots')
WRITE = '--write' in sys.argv
THRESHOLD = 18          # sum of per-channel deltas; below this is encoder noise

# RENDERER NOISE FLOOR, per frame.
#
# Four sources of non-determinism were found and fixed: the seeded PRNG, CSS
# animations, JS-driven positions (the bear walks on a timer, the holo driver
# runs on requestAnimationFrame), and perspective() forcing a compositing path
# whose sub-pixel rasterisation varies. What remains is a timing race that moves
# around: 39 to 60 pixels in one frame out of forty, in a different place each
# run, always a single antialiased edge.
#
# So there is a floor, and it is stated rather than hidden. Every frame's number
# is printed either way; frames below the floor are reported as noise instead of
# as changes. The margin is wide: the smallest REAL change measured through this
# harness was ~2,000px per frame and the largest ~20,000, so 120 sits about 16x
# below anything that has ever mattered and 2x above anything that has ever been
# noise. A change that lands between the two would be missed, and the honest
# thing to do with a suspicious number just over the floor is to look at the map.
NOISE = 120


def read_png(path):
    """Minimal PNG reader: no dependencies, so the harness runs anywhere."""
    d = open(path, 'rb').read()
    assert d[:8] == b'\x89PNG\r\n\x1a\n', path + ' is not a PNG'
    i, idat, w, h, bitdepth, ctype = 8, b'', 0, 0, 0, 0
    while i < len(d):
        ln = struct.unpack('>I', d[i:i + 4])[0]
        typ = d[i + 4:i + 8]
        body = d[i + 8:i + 8 + ln]
        if typ == b'IHDR':
            w, h, bitdepth, ctype = struct.unpack('>IIBB', body[:10])
        elif typ == b'IDAT':
            idat += body
        elif typ == b'IEND':
            break
        i += 12 + ln
    assert bitdepth == 8, 'expected 8-bit, got %d' % bitdepth
    nch = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    raw = zlib.decompress(idat)
    stride = w * nch
    out = bytearray(h * stride)
    prev = bytearray(stride)
    pos = 0
    for y in range(h):
        f = raw[pos]; pos += 1
        line = bytearray(raw[pos:pos + stride]); pos += stride
        if f == 1:
            for x in range(nch, stride):
                line[x] = (line[x] + line[x - nch]) & 0xff
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xff
        elif f == 3:
            for x in range(stride):
                a = line[x - nch] if x >= nch else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 0xff
        elif f == 4:
            for x in range(stride):
                a = line[x - nch] if x >= nch else 0
                c = prev[x - nch] if x >= nch else 0
                b = prev[x]
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 0xff
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, nch, bytes(out)


def write_png(path, w, h, rgb):
    raw = b''.join(b'\x00' + rgb[y * w * 3:(y + 1) * w * 3] for y in range(h))
    def chunk(t, b):
        c = struct.pack('>I', len(b)) + t + b
        return c + struct.pack('>I', zlib.crc32(t + b) & 0xffffffff)
    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 6))
        + chunk(b'IEND', b''))


try:
    from PIL import Image, ImageChops
    HAVE_PIL = True
except ImportError:
    HAVE_PIL = False


def compare_pil(a_path, b_path, out_path=None):
    """Same result as compare(), ~200x faster. The pure-python decoder below is
       the fallback, so the harness still runs with no packages installed."""
    a = Image.open(a_path).convert('RGB')
    b = Image.open(b_path).convert('RGB')
    if a.size != b.size:
        return None, 'size changed: %dx%d -> %dx%d' % (a.size + b.size)
    d = ImageChops.difference(a, b).convert('L').point(
        lambda v: 255 if v * 3 > THRESHOLD else 0)
    box = d.getbbox()
    diff = sum(d.point(lambda v: 1 if v else 0).getdata())
    if out_path and diff:
        vis = a.convert('L').point(lambda v: min(255, v // 2 + 100)).convert('RGB')
        vis.paste(Image.new('RGB', a.size, (255, 0, 128)), (0, 0), d.convert('L'))
        vis.save(out_path)
    where = '' if not diff else '  bbox %d,%d %dx%d' % (
        box[0], box[1], box[2] - box[0], box[3] - box[1])
    return diff, where


def compare(a_path, b_path, out_path=None):
    if HAVE_PIL:
        return compare_pil(a_path, b_path, out_path)
    return compare_slow(a_path, b_path, out_path)


def compare_slow(a_path, b_path, out_path=None):
    w1, h1, n1, a = read_png(a_path)
    w2, h2, n2, b = read_png(b_path)
    if (w1, h1) != (w2, h2):
        return None, 'size changed: %dx%d -> %dx%d' % (w1, h1, w2, h2)
    diff = 0
    box = [w1, h1, -1, -1]
    vis = bytearray(w1 * h1 * 3) if out_path else None
    for y in range(h1):
        ra, rb = y * w1 * n1, y * w1 * n2
        for x in range(w1):
            pa, pb = ra + x * n1, rb + x * n2
            d = abs(a[pa] - b[pb]) + abs(a[pa + 1] - b[pb + 1]) + abs(a[pa + 2] - b[pb + 2])
            if d > THRESHOLD:
                diff += 1
                if x < box[0]: box[0] = x
                if y < box[1]: box[1] = y
                if x > box[2]: box[2] = x
                if y > box[3]: box[3] = y
                if vis:
                    o = (y * w1 + x) * 3
                    vis[o] = 255; vis[o + 1] = 0; vis[o + 2] = 128
            elif vis:
                o = (y * w1 + x) * 3
                g = (a[pa] + a[pa + 1] + a[pa + 2]) // 6 + 100
                vis[o] = vis[o + 1] = vis[o + 2] = min(255, g)
    if vis and diff:
        write_png(out_path, w1, h1, bytes(vis))
    where = '' if diff == 0 else '  bbox %d,%d %dx%d' % (
        box[0], box[1], box[2] - box[0] + 1, box[3] - box[1] + 1)
    return diff, where


def main():
    before, after = os.path.join(SHOTS, 'before'), os.path.join(SHOTS, 'after')
    if not (os.path.isdir(before) and os.path.isdir(after)):
        print('  need both test/.shots/before and test/.shots/after'); return 2
    names = sorted(set(os.listdir(before)) & set(os.listdir(after)))
    names = [n for n in names if n.endswith('.png')]
    if not names:
        print('  no matching captures'); return 2
    if WRITE:
        os.makedirs(os.path.join(SHOTS, 'diff'), exist_ok=True)
    total, changed, noise = 0, [], []
    for n in names:
        out = os.path.join(SHOTS, 'diff', n) if WRITE else None
        d, where = compare(os.path.join(before, n), os.path.join(after, n), out)
        if d is None:
            print('  %-24s %s' % (n[:-4], where)); changed.append(n); continue
        total += d
        if d >= NOISE:
            changed.append(n)
            print('  %-26s %8d px%s' % (n[:-4], d, where))
        elif d:
            noise.append(n)
            print('  %-26s %8d px   within the %dpx renderer noise floor' % (n[:-4], d, NOISE))
    only_b = sorted(set(os.listdir(before)) - set(os.listdir(after)))
    only_a = sorted(set(os.listdir(after)) - set(os.listdir(before)))
    for n in only_b: print('  %-24s missing from after' % n[:-4])
    for n in only_a: print('  %-24s missing from before' % n[:-4])
    print('')
    print('  %d of %d frames changed, %d within noise, %d pixels total'
          % (len(changed), len(names), len(noise), total))
    if WRITE and changed:
        print('  maps in test/.shots/diff/ (pink = changed)')
    return 1 if changed or only_a or only_b else 0


if __name__ == '__main__':
    sys.exit(main())

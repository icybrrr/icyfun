#!/bin/zsh
# Rebuild every standee pose from the source renders.
#
#   test/poses.sh "/path/to/vtuber/assets/poses"
#
# The sources are 3800-6000px renders that live outside the repo. This script is
# the record of how they became the files in images/os: run it again and the
# shipped art is reproduced exactly.
#
# THREE SCALES, ONE BODY. The poses come from two render resolutions (3840 and
# 6144 square) and the older sitting pair was shot with the camera much closer.
# Body scale is a property of the camera, not of the figure, so the factor per
# group is what makes one head the same number of pixels everywhere; matching
# the figures' heights instead would be wrong, because a pose leaning forward is
# genuinely shorter and has to stay shorter.
#
#   3840 renders   x1.6      to normalise the render size against the 6144 set
#   6144 renders   x1
#   the old sits   x0.4774   measured head width, 791px against 1657px
#
# Then one global 0.281356 puts a standing figure at 1660px, which is 2x the
# 830px the desktop standee is capped at, so she is sharp on a retina display.
#
# --canvas is what keeps that scale once CSS gets hold of it: see the header of
# resize-art.py. Every pose lands on one 1492x1702 canvas, ground on the bottom
# edge and heads on a shared vertical line, so a single max-height governs all
# seventeen and clicking through poses never changes her size or her position.
set -e
SRC="${1:?usage: test/poses.sh <source dir>}"
ROOT="${0:A:h}/.."
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

python3 "$ROOT/test/resize-art.py" "$TMP" --canvas \
  --group 0.450169 \
    "$SRC/icy-stand-1.png" "$SRC/icy-stand-2.png" "$SRC/icy-stand-3.png" \
    "$SRC/icy-stand-3-1.png" "$SRC/icy-stand-4.png" "$SRC/icy-stand-5.png" \
    "$SRC/icy-stand-6.png" \
  --group 0.281356 \
    "$SRC/icy-stand-7.png" "$SRC/icy-stand-8.png" "$SRC/icy-stand-9.png" \
    "$SRC/icy-stand-10.png" "$SRC/icy-stand-11.png" \
    "$SRC/icy-sit-1.png" "$SRC/icy-sit-2.png" "$SRC/icy-sit-3.png" \
  --group 0.134319 \
    "$SRC/cute sit 1.png" "$SRC/cute sit 2.png"

# Shipped names are a flat sequence because os.js cycles them as one list, so
# the source names are mapped here rather than in the player. The sitting order
# is eyes open first and eyes closed last, which is the order POSES.down walks:
# she settles, rather than dozing off and waking up again.
typeset -a MAP=(
  icy-stand-1:icy-stand-1      icy-stand-2:icy-stand-2   icy-stand-3:icy-stand-3
  icy-stand-3-1:icy-stand-4    icy-stand-4:icy-stand-5   icy-stand-5:icy-stand-6
  icy-stand-6:icy-stand-7      icy-stand-7:icy-stand-8   icy-stand-8:icy-stand-9
  icy-stand-9:icy-stand-10     icy-stand-10:icy-stand-11 icy-stand-11:icy-stand-12
  "cute sit 2:icy-sit-1"       icy-sit-2:icy-sit-2       icy-sit-3:icy-sit-3
  "cute sit 1:icy-sit-4"       icy-sit-1:icy-sit-5
)
# via a second directory, because the mapping shifts names into each other and
# renaming in place would clobber a file that has not been read yet
OUT="$(mktemp -d)"
trap 'rm -rf "$TMP" "$OUT"' EXIT
for pair in $MAP; do
  mv "$TMP/${pair%%:*}.webp" "$OUT/${pair##*:}.webp"
done

rm -f "$ROOT"/images/os/icy-stand-*.webp "$ROOT"/images/os/icy-sit*.webp
mv "$OUT"/*.webp "$ROOT/images/os/"
echo ""
echo "  $(ls "$ROOT"/images/os/icy-stand-*.webp "$ROOT"/images/os/icy-sit-*.webp | wc -l | tr -d ' ') poses, $(du -ch "$ROOT"/images/os/icy-stand-*.webp "$ROOT"/images/os/icy-sit-*.webp | tail -1 | cut -f1)"

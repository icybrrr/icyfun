#!/bin/sh
# Render the Open Graph card from test/og-image.html to images/og-image.png.
#
#   python3 -m http.server 8000 &   # it needs a server: the card loads
#   test/og-image.sh                # fonts.css, the icon set and a pose
#
# Rendered at 2x and downsampled, so the type and the icon die-cuts hold up on
# a retina timeline. Every page's og:image points at this one file.
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
BRAVE="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
OUT="$ROOT/images/og-image.png"
"$BRAVE" --headless --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=2 --window-size=1200,630 \
  --virtual-time-budget=15000 \
  --screenshot=/tmp/og2x.png http://localhost:8000/test/og-image.html
python3 - "$OUT" <<'PY'
import sys
from PIL import Image
Image.open('/tmp/og2x.png').convert('RGB').resize((1200, 630), Image.LANCZOS).save(sys.argv[1], optimize=True)
PY
printf '  og-image.png  %s\n' "$(du -h "$OUT" | cut -f1)"

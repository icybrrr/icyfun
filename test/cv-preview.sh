#!/bin/zsh
# Re-render the resume tab's page preview from the PDF.
#
#   test/cv-preview.sh
#
# The tab shows page one of icybear-cv.pdf as an image so a reader can judge the
# document before spending a download. That image is a COPY, which means it can
# go stale and quietly misrepresent the CV, so regenerating it is one command and
# is on the pre-launch list. Run it whenever the PDF changes.
#
# qlmanage is macOS's own Quick Look renderer, so this needs nothing installed.
# It is rendered at 2x the size the card displays (380px tall) and saved as WebP,
# which is what keeps a full page of small type legible on a retina screen
# without shipping most of a megabyte.
set -e
ROOT="${0:A:h}/.."
cd "$ROOT"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

qlmanage -t -s 1600 -o "$TMP" icybear-cv.pdf >/dev/null 2>&1
python3 - "$TMP" <<'PY'
import sys, glob, os
from PIL import Image
src = glob.glob(os.path.join(sys.argv[1], '*.png'))
if not src:
    sys.exit('qlmanage produced nothing; is icybear-cv.pdf readable?')
im = Image.open(src[0]).convert('RGB')
h = 1075                                   # 2x the 380px the card renders at
im = im.resize((round(im.width * h / im.height), h), Image.LANCZOS)
im.save('images/os/cv-page1.webp', 'WEBP', quality=88, method=6)
print('  images/os/cv-page1.webp  %dx%d  %.1f KB'
      % (im.width, im.height, os.path.getsize('images/os/cv-page1.webp') / 1024))
PY

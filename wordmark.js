/* ==========================================================================
   THE WORDMARK — drawn onto a canvas card, wherever a card is drawn.

   Lifted out of os.js because the alignment chart was setting the url in Bagel
   Fat One with a three-stop gradient of its own, while the proof-of-visit card
   next door drew the logo ARTWORK with foil, glints and three shadow passes.
   Two cards, one brand, two different footers. os.js's own comment already
   said it: a wordmark is a wordmark and should be the same object on every
   card. So it is one object now.

   drawWordmark(ctx, cx, y, size, art) -- `art` is a loaded <img> of the white
   silhouette (images/os/icybearfun.png). Falls back to type if it has not
   loaded, so a card can never render an empty footer.
   ========================================================================== */
(function (global) {
  'use strict';

  var DISP = '"Bagel Fat One", cursive';

  /* rgba() with the SAME rgb at zero alpha. Canvas interpolates a bare
     'transparent' toward transparent BLACK, which is what put a grey smear
     under the sun. Every fade here ends on its own colour. */
  function fade(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',';
  }

  function spark(c, r, col) {
    c.beginPath();
    c.moveTo(0, -r);
    c.quadraticCurveTo(r * 0.16, -r * 0.16, r, 0);
    c.quadraticCurveTo(r * 0.16, r * 0.16, 0, r);
    c.quadraticCurveTo(-r * 0.16, r * 0.16, -r, 0);
    c.quadraticCurveTo(-r * 0.16, -r * 0.16, 0, -r);
    c.closePath();
    c.fillStyle = col; c.fill();
  }

  var GLYPH = { spark: spark };

  /* ---- the wordmark: foil, per the holo surfaces on the classic page ---- */

  /* The classic page's hero logo, verbatim: the same four pastel stops at
     160deg, a violet drop shadow, one low-opacity holo shine and a few glints.
     No outline — the saturated rainbow-with-an-outline version read as Lisa
     Frank rather than as the brand.

     Deliberately NOT read off --t-art. Per-theme was the wrong instinct twice
     over: a wordmark is a wordmark and should be the same object on every card,
     and some themes' art ramps end dark (archangel finishes on #8b5cd0), which
     turned a run of pastels into a bright-to-dark fade. */
  var MARK = ['#fff8fc', '#f8bfe6', '#b48ee9', '#8fc2f4'];

  /* Draws the wordmark ARTWORK rather than setting it in Bagel Fat One, with
     the treatment unchanged: same gradient, same two shadow passes. The
     silhouette is white on transparent, so it is tinted by compositing the
     gradient through it with 'source-in' on an offscreen canvas -- the canvas
     equivalent of the mask the DOM logomark uses. Falls back to type if the
     asset has not loaded, so the card can never render an empty footer. */
  function wordmarkArt(c, art, cx, y, size) {
    /* cap-height matched to the old type so nothing else on the card moves */
    var h = size * 1.16;
    var w = h * (art.naturalWidth / art.naturalHeight);
    var x = cx - w / 2;
    var top = y - h * 0.82;

    var off = document.createElement('canvas');
    off.width = Math.max(1, Math.ceil(w));
    off.height = Math.max(1, Math.ceil(h));
    var oc = off.getContext('2d');
    if (!oc) return;
    oc.drawImage(art, 0, 0, off.width, off.height);
    var g = oc.createLinearGradient(off.width * 0.16, 0, off.width * 0.84, off.height);
    MARK.forEach(function (col, i) { g.addColorStop(i / Math.max(1, MARK.length - 1), col); });
    oc.globalCompositeOperation = 'source-in';       /* tint the silhouette */
    oc.fillStyle = g;
    oc.fillRect(0, 0, off.width, off.height);

    c.save();
    c.shadowColor = 'rgba(76, 46, 130, 0.55)';       /* tight pass: the edge */
    c.shadowBlur = size * 0.10;
    c.shadowOffsetY = size * 0.03;
    c.drawImage(off, x, top, w, h);
    c.shadowColor = 'rgba(120, 80, 190, 0.40)';      /* soft pass: the lift */
    c.shadowBlur = size * 0.42;
    c.shadowOffsetY = size * 0.10;
    c.drawImage(off, x, top, w, h);
    c.restore();
  }

  function wordmark(c, text, cx, y, size, art) {
    if (art && art.complete && art.naturalWidth) {
      return wordmarkArt(c, art, cx, y, size);
    }
    c.font = size + 'px ' + DISP;
    c.textAlign = 'center';
    var w = c.measureText(text).width;
    var stops = MARK;

    /* 160deg over the wordmark's own box */
    var g = c.createLinearGradient(cx - w * 0.34, y - size * 0.92, cx + w * 0.34, y + size * 0.16);
    stops.forEach(function (col, i) { g.addColorStop(i / Math.max(1, stops.length - 1), col); });

    /* Two shadow passes. The classic logo sits on a white card, so one soft
       violet drop is enough there; here it sits straight on the sky, and on a
       pale one the light end of the gradient dissolves into it. The tight pass
       is the letterform edge, the soft pass is the lift. Same idea as
       .hero__portrait-logo's halo, in the other direction. */
    c.save();
    c.fillStyle = g;
    /* A third, tight pass: on the light snow drift the pale end of the foil was
       dissolving into the snow, and the url is the one thing on this card that
       has to survive every background it can land on. */
    c.shadowColor = 'rgba(104, 64, 172, 0.85)';
    c.shadowBlur = 4;
    c.shadowOffsetY = 1;
    c.fillText(text, cx, y);
    c.shadowColor = 'rgba(116, 74, 186, 0.8)';
    c.shadowBlur = 9;
    c.shadowOffsetY = 2;
    c.fillText(text, cx, y);
    c.shadowColor = 'rgba(150, 110, 210, 0.5)';
    c.shadowBlur = 28;
    c.shadowOffsetY = 12;
    c.fillText(text, cx, y);
    c.restore();

    /* .hero__logo-shine: a 115deg pastel band, overlay, subtle. Painting it
       with fillText is what keeps it on the letters and nowhere else. */
    c.save();
    c.globalCompositeOperation = 'overlay';
    var s = c.createLinearGradient(cx - w * 0.5, y - size, cx + w * 0.5, y + size * 0.2);
    s.addColorStop(0.1, fade('#ffc8f0') + '0)');
    s.addColorStop(0.28, fade('#ffc8f0') + '0.5)');
    s.addColorStop(0.48, fade('#c8dcff') + '0.5)');
    s.addColorStop(0.68, fade('#ffebbe') + '0.5)');
    s.addColorStop(0.88, fade('#ffebbe') + '0)');
    c.fillStyle = s;
    c.fillText(text, cx, y);
    c.restore();

    /* .hero__logo-sparkle: a handful of glints, placed not scattered — and
       placed CLEAR of the letterforms. One of them was landing on the n. */
    [[-0.46, -0.72, 8], [-0.08, -0.98, 6], [0.30, -0.92, 9], [0.51, -0.54, 7]]
      .forEach(function (p) {
        c.save();
        c.translate(cx + p[0] * w, y + p[1] * size);
        c.globalAlpha = 0.9;
        GLYPH.spark(c, p[2], '#ffffff');
        c.restore();
      });
  }

  /* Where the footer sits. Both cards pinned it already, but to two different
     literals (H-98 and H-74), so the same wordmark sat 18px higher on one card
     than the other and neither was anchored to anything you could point at.

     The rule now: the ARTWORK's bottom edge clears the card's inner edge by
     this much, whatever else is on the card. Callers pass their own inset,
     because the two cards inset by different amounts (34 and 28) and it is
     the visible gap that has to match, not the raw coordinate. */
  var FOOT_CLEARANCE = 22;

  global.wordmarkBaseline = function (canvasH, cardInset, size) {
    var h = (size || 74) * 1.16;
    return canvasH - cardInset - FOOT_CLEARANCE - h * 0.18;
  };

  global.drawWordmark = function (c, cx, y, size, art) {
    wordmark(c, '\u2726 icybear.fun \u2726', cx, y, size, art);
  };
}(window));

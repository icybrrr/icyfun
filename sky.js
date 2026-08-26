/* ==========================================================================
   THE SKY — markup and sprite pools, for every page that wants the scene.

   Lived inside os.js as three IIFEs writing into markup hardcoded in
   index.html. The alignment chart needs the same scene, and a second copy of
   either half would be a second thing to forget, so both halves moved here.

   Call buildSky() once, as early as possible. It injects the layers at the top
   of <body> and fills them; CSS in sky.css decides which of them a given
   data-wall / data-mode actually shows.
   ========================================================================== */
(function (global) {
  'use strict';

  function el(tag, cls, css) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (css) n.style.cssText = css;
    return n;
  }
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  function buildSky(opts) {
    opts = opts || {};
    if (document.getElementById('sky')) return;      /* already standing */

    var sky = el('div');
    sky.id = 'sky';
    sky.setAttribute('aria-hidden', 'true');
    ['sun', 'moon', 'stars', 'motifs'].forEach(function (id) {
      var n = el('div'); n.id = id; sky.appendChild(n);
    });
    /* three clouds at fixed heights and wildly different speeds, so they never
       line up into a repeating pattern */
    [[130, 36, '26%', 88, 0], [92, 26, '46%', 124, -44], [110, 30, '64%', 104, -70]]
      .forEach(function (c) {
        sky.appendChild(el('div', 'cloud',
          'width:' + c[0] + 'px;height:' + c[1] + 'px;top:' + c[2] +
          ';animation-duration:' + c[3] + 's;animation-delay:' + c[4] + 's'));
      });

    var weather = el('div'); weather.id = 'weather'; weather.setAttribute('aria-hidden', 'true');
    var grid = el('div', 'grid-overlay'); grid.setAttribute('aria-hidden', 'true');
    var decor = el('div'); decor.id = 'decor'; decor.setAttribute('aria-hidden', 'true');
    [[16, 44, 0], [10, 66, 0.6], [50, 60, 1.2], [70, 10, 0.3], [34, 28, 1.7]].forEach(function (s) {
      decor.appendChild(el('span', 'sparkle',
        'top:' + s[0] + '%;left:' + s[1] + '%;animation-delay:' + s[2] + 's'));
    });

    var first = document.body.firstChild;
    [sky, weather, grid, decor].forEach(function (n) { document.body.insertBefore(n, first); });

    fillMotifs(document.getElementById('motifs'));
    fillStars(document.getElementById('stars'));
    fillWeather(weather, opts.weather !== false);
  }

  /* one sprite pool; each theme decides what they are and how they move.
     Sizes and paths are randomised once so nothing marches in step. */
  function fillMotifs(host) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 18; i++) {
      var m = el('span', 'motif motif--' + (1 + (i % 4)));
      var size = rnd(16, 42);
      m.style.left = rnd(0, 96).toFixed(2) + '%';
      m.style.top = rnd(0, 100).toFixed(2) + '%';
      m.style.width = size.toFixed(0) + 'px';
      m.style.height = size.toFixed(0) + 'px';
      m.style.setProperty('--drift', rnd(-7, 7).toFixed(1) + 'vw');
      m.style.setProperty('--spin', rnd(-90, 170).toFixed(0) + 'deg');
      m.style.animationDuration = rnd(26, 60).toFixed(1) + 's';
      m.style.animationDelay = (-rnd(0, 60)).toFixed(1) + 's';
      frag.appendChild(m);
    }
    host.appendChild(frag);
  }

  /* The class matters: without it these are 84 unstyled spans, which is to say
     84 nothing-at-alls. They shipped that way from the day the sky moved into
     its own file until 23 Aug 2026, so the night sky has never had stars.

     star--big is chosen from the size already drawn rather than from a fresh
     random call, so the brightest stars are always the largest ones and the
     sprite pool still consumes exactly one sequence per star. */
  function fillStars(host) {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 84; i++) {
      var size = rnd(1, 2.6);
      var s = el('span', size > 2.15 ? 'star star--big' : 'star');
      s.style.left = rnd(0, 100).toFixed(2) + '%';
      s.style.top = rnd(0, 100).toFixed(2) + '%';
      var d = size.toFixed(2) + 'px';
      s.style.width = d; s.style.height = d;
      s.style.animationDelay = (-rnd(0, 3.4)).toFixed(2) + 's';
      s.style.animationDuration = rnd(2.6, 5.6).toFixed(2) + 's';
      frag.appendChild(s);
    }
    host.appendChild(frag);
  }

  /* Built once and parked; CSS shows the right set by data-mode. Three depth
     bands so the fall has some air in it rather than being one flat plane. */
  function fillWeather(host, full) {
    var frag = document.createDocumentFragment();
    var bands = ['far', 'mid', 'near'];
    var drops = full ? 54 : 30, flakes = full ? 36 : 20;

    for (var i = 0; i < drops; i++) {
      var d = el('span', 'drop drop--' + bands[i % 3]);
      d.style.left = rnd(-3, 103).toFixed(2) + 'vw';
      d.style.height = rnd(16, 52).toFixed(0) + 'px';
      d.style.animationDuration = rnd(0.55, 1.1).toFixed(2) + 's';
      d.style.animationDelay = (-rnd(0, 1.4)).toFixed(2) + 's';
      frag.appendChild(d);
    }
    for (var k = 0; k < flakes; k++) {
      var f = el('span', 'flake flake--' + bands[k % 3]);
      var core = document.createElement('i');
      var size = rnd(3, 10).toFixed(1) + 'px';
      f.style.left = rnd(-2, 102).toFixed(2) + 'vw';
      f.style.animationDuration = rnd(13, 28).toFixed(1) + 's';
      f.style.animationDelay = (-rnd(0, 28)).toFixed(1) + 's';
      core.style.width = size; core.style.height = size;
      core.style.animationDuration = rnd(3, 7).toFixed(1) + 's';
      core.style.animationDelay = (-rnd(0, 4)).toFixed(1) + 's';
      f.appendChild(core);
      frag.appendChild(f);
    }
    host.appendChild(frag);
  }

  global.buildSky = buildSky;
}(window));

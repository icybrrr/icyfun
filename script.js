(function () {
  var root = document.documentElement;
  var card = document.querySelector('.hero__portrait');

  var pointerX = window.innerWidth / 2;
  var pointerY = window.innerHeight / 2;
  var lastMoveTime = 0;
  var hasPointer = false;

  window.addEventListener('pointermove', function (e) {
    pointerX = e.clientX;
    pointerY = e.clientY;
    lastMoveTime = performance.now();
    hasPointer = true;
  });

  /* Three gates before any work happens.

     This loop writes --holo-x/--holo-y to documentElement, which invalidates
     style resolution for the WHOLE document on every frame it runs. On the
     classic page that drives one card; on the OS those properties are read by
     the focused titlebar's foil and by every .holo-surface, so it was
     repainting them at 60fps permanently, including while someone sat reading
     the resume. It is the largest continuous cost on a mid-range phone.

     Nothing is lost by gating it: the foil sweeps and the sparkle drift are CSS
     animations that run on their own. The pointer only ever added a nudge. */
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  var lastDrift = 0;

  function frame(now) {
    /* a hidden tab does not need a foil */
    if (document.hidden) { requestAnimationFrame(frame); return; }

    var idleFor = now - lastMoveTime;
    var settled = hasPointer && idleFor < 900;

    var px, py, tiltX, tiltY;

    if (settled) {
      px = (pointerX / window.innerWidth) * 100;
      py = (pointerY / window.innerHeight) * 100;
      tiltX = 0;
      tiltY = 0;

      if (card) {
        var rect = card.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var cy = rect.top + rect.height / 2;
        var dx = (pointerX - cx) / (window.innerWidth / 2);
        var dy = (pointerY - cy) / (window.innerHeight / 2);
        tiltY = Math.max(-8, Math.min(8, dx * 8));
        tiltX = Math.max(-8, Math.min(8, -dy * 8));
      }
    } else {
      /* Idle drift: ~12fps is indistinguishable at this speed and costs a fifth
         of the style invalidations. Under reduced-motion it does not run at
         all — a CSS blanket cannot stop a loop writing inline properties. */
      if (reduced && reduced.matches) { requestAnimationFrame(frame); return; }
      if (now - lastDrift < 80) { requestAnimationFrame(frame); return; }
      lastDrift = now;
      var t = now / 1000;
      px = 50 + Math.sin(t * 0.35) * 26 + Math.sin(t * 0.17 + 1.3) * 10;
      py = 50 + Math.cos(t * 0.27) * 20 + Math.sin(t * 0.21 + 0.6) * 8;
      tiltY = Math.sin(t * 0.4) * 2.2;
      tiltX = Math.cos(t * 0.33) * 1.6;
    }

    root.style.setProperty('--holo-x', px.toFixed(2) + '%');
    root.style.setProperty('--holo-y', py.toFixed(2) + '%');

    if (card) {
      card.style.transform =
        'rotate(-1.5deg) perspective(1000px) rotateX(' + tiltX.toFixed(2) + 'deg) rotateY(' + tiltY.toFixed(2) + 'deg)';
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();

// Scroll reveal: each element fades/animates into place once, direction
// depending on which way the page was scrolling when it arrived — rises up
// on the way down, lowers into place on the way up. Once revealed, an
// element stays revealed; nothing re-hides on exit.
(function () {
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if (!revealEls.length || !('IntersectionObserver' in window)) return;

  var lastScrollY = window.scrollY;
  var scrollDir = 'down';
  var pending = revealEls.slice();

  function applyPendingDirection() {
    pending.forEach(function (el) {
      el.classList.toggle('reveal--from-above', scrollDir === 'up');
    });
  }

  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if (y === lastScrollY) return;
    var newDir = y > lastScrollY ? 'down' : 'up';
    lastScrollY = y;
    if (newDir !== scrollDir) {
      scrollDir = newDir;
      applyPendingDirection();
    }
  }, { passive: true });

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      var el = entry.target;
      el.classList.add('reveal--visible');
      observer.unobserve(el);
      var idx = pending.indexOf(el);
      if (idx !== -1) pending.splice(idx, 1);
    });
  }, { threshold: 0.12 });

  revealEls.forEach(function (el) { observer.observe(el); });
})();

// Lightbox — click a work sample to see it uncropped.
(function () {
  var lightbox = document.getElementById('lightbox');
  if (!lightbox) return;

  var lightboxImage = document.getElementById('lightbox-image');
  var lightboxCaption = document.getElementById('lightbox-caption');
  var lastFocused = null;

  function open(frame) {
    var img = frame.querySelector('img');
    if (!img) return;
    lastFocused = document.activeElement;
    lightboxImage.src = img.src;
    lightboxImage.alt = img.alt;
    lightboxCaption.textContent = frame.getAttribute('data-caption') || '';
    lightbox.classList.add('is-open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    lightbox.classList.remove('is-open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('.work-item__frame').forEach(function (frame) {
    frame.addEventListener('click', function () { open(frame); });
  });

  lightbox.querySelectorAll('[data-lightbox-close]').forEach(function (el) {
    el.addEventListener('click', close);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && lightbox.classList.contains('is-open')) close();
  });
})();

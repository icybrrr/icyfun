/* ==========================================================================
   THE INFO WINDOW — read_me / quest_log / portfolio / resume.

   Four tabs holding the only content on this site that says who icy is and
   what she has shipped, so the alignment chart wanted them too rather than
   sending people back to the desktop to go and find them.

   The markup is NOT copied. mountInfo() fetches index.html and lifts the real
   window body out of it, so there is exactly one copy of that content on the
   whole site and the two pages cannot end up saying different things about
   her work. The renderers below used to live in os.js; the desktop calls
   these same ones now, so a change to the spec sheet or the contact row lands
   in both places or in neither.

   Needs window.OS_STRINGS. Uses window.sfx if the page has one.
   ========================================================================== */
(function (global) {
  'use strict';

  var S = global.OS_STRINGS;
  function el(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function sfx(n) { if (typeof global.sfx === 'function') global.sfx(n); }

  var SKILLS = S.skills;

  /* The paper plane's ink sits at 12.55,13.45 in its own 24-unit box, not at
     12,12 -- it was drawn low and slightly right. The container centres the
     BOX, so the mark still read a pixel low next to x and discord, both of
     which are honestly centred. Measured, not eyeballed. */
  var GLYPHS = {
    tg: '<svg viewBox="0 0 24 24"><path transform="translate(-.55 -1.45)" d="M21.5 4.5 2.7 11.9c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.5 0 .7-.2 1-.5l2.4-2.3 4.9 3.6c.9.5 1.5.2 1.8-.8l3.2-15.2c.3-1.2-.4-1.7-1.4-1.4zM8.8 14.5l9.4-6c.4-.2.8 0 .5.3l-7.6 6.9-.3 3.4-1.5-3.9z"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M18.9 2H22l-7.5 8.6L23 22h-6.8l-5.3-6.9L4.8 22H2l8-9.1L1.5 2h7l4.8 6.3L18.9 2zm-1.2 18h1.9L7.4 4H5.4l12.3 16z"/></svg>',
    dc: '<svg viewBox="0 0 24 24"><path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 2.9a13 13 0 0 0-.6 1.3 18.3 18.3 0 0 0-5.5 0A12.6 12.6 0 0 0 8.7 2.9 19.7 19.7 0 0 0 3.7 4.4C.5 9 -.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3 14.1 14.1 0 0 0 1.2-2 13.1 13.1 0 0 1-1.9-.9 10.2 10.2 0 0 0 .4-.3 14 14 0 0 0 12 0c.1.1.3.2.4.3a12.3 12.3 0 0 1-1.9.9c.4.7.8 1.4 1.2 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.5-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4S9.2 15.3 8 15.3zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>'
  };

  var LINKS = [['tg', 'telegram'], ['x', 'x'], ['dc', 'discord']];

  function renderSpecs() {
    var html = S.specs.rows.map(function (r) {
      return '<div style="--pillar:' + r[2] + '">' +
        '<dt>' + r[0] + '</dt><span class="dots"></span><dd>' + r[1] + '</dd></div>';
    }).join('');
    all('[data-specs]').forEach(function (m) { m.innerHTML = html; });
  }

  function renderSkillTree() {
    var host = document.querySelector('[data-skill-tree]');
    if (!host) return;
    host.innerHTML = S.specs.rows.map(function (r) {
      var tags = (SKILLS[r[1]] || []).map(function (t) {
        return '<span class="tag">' + t + '</span>';
      }).join('');
      return '<div class="branch" style="--pillar:' + r[2] + '">' +
        '<p class="branch__name">' + r[1] + '</p>' +
        '<div class="tag-row">' + tags + '</div></div>';
    }).join('');
  }

  /* ==========================================================================
     CONTACT — same handle everywhere. Telegram is marked because it is the one
     that gets read. Discord has no username URL, so it uses the numeric id.
     ========================================================================== */

  
  function renderContact() {
    var c = S.contact;
    var urls = { tg: c.telegram, x: c.x, dc: c.discord };

    /* the classic site's contact pill: three glyphs, one handle, one shape */
    var compact = '<span class="contact-pill glass glass--chip">' + LINKS.map(function (l) {
      return '<a class="contact-pill__link" href="' + urls[l[0]] + '" target="_blank" ' +
        'rel="noopener" aria-label="' + l[1] + '">' + GLYPHS[l[0]] + '</a>';
    }).join('') + '<span class="contact-pill__handle">' + c.handle + '</span></span>';

    /* read_me has room to name them, and to say which one actually gets read */
    /* Glyphs only, equal weight: a recruiter knows these marks on sight, and
       naming them made three competing rows. The sentence below does the
       ranking that the `fastest` tag used to do on the telegram pill, so that
       signal survives the cleanup. */
    var full = '<div class="contact__row">' + LINKS.map(function (l) {
      return '<a class="contact__glyph" href="' + urls[l[0]] + '" target="_blank" ' +
        'rel="noopener" aria-label="' + l[1] + '">' + GLYPHS[l[0]] + '</a>';
    }).join('') +
      /* the handle rides WITH the glyphs rather than under them: they are one
         statement, "here is where, and here is who" */
      '<span class="contact__handle">' + c.handle + '</span></div>' +
      '<p class="contact__note">' + c.note + '</p>';

    all('[data-contact]').forEach(function (m) {
      m.innerHTML = m.dataset.contact === 'compact' ? compact : full;
    });

    /* quote.exe's two other doors. Same marks, same urls, same source of
       truth -- they were the words "telegram" and "x" set as links, which made
       the pair read as a footnote next to the button rather than as two things
       you could click. A mount rather than markup so the urls live in exactly
       one place, and so a fourth door is a line in LINKS. */
    /* Two shapes from one mount. Bare `data-social` builds the row of doors;
       `data-social="tg"` drops that one mark in on its own, for a button that
       already carries its own label and link. Same table either way, so a mark
       cannot end up drawn twice from two sources. */
    all('[data-social]').forEach(function (m) {
      var one = m.dataset.social;
      if (one && GLYPHS[one]) { m.innerHTML = GLYPHS[one]; return; }
      m.innerHTML = LINKS.filter(function (l) { return l[0] !== 'dc'; })
        .map(function (l) {
          return '<a class="door" href="' + urls[l[0]] + '" target="_blank" ' +
            'rel="noopener" aria-label="' + l[1] + '">' + GLYPHS[l[0]] + '</a>';
        }).join('');
    });
  }

  /* ==========================================================================
     PORTFOLIO FILTER — quest_log deep-links straight into it, so a role and its
     work are one click apart instead of two apps apart.
     ========================================================================== */

  var PROJECTS = S.projects;

  function renderFolioFilter() {
    var host = el('folio-filter');
    host.innerHTML = '<button class="pill pill--compact is-on" data-folio="all">' + S.app.folioAll + '</button>' +
      PROJECTS.map(function (p) {
        return '<button class="pill pill--compact" data-folio="' + p[0] + '">' + p[1] + '</button>';
      }).join('');
  }

  function filterFolio(key) {
    all('#folio-filter .pill').forEach(function (b) {
      b.classList.toggle('is-on', b.dataset.folio === key);
    });
    all('.wpanel[data-panel="folio"] .work-item').forEach(function (item) {
      item.hidden = key !== 'all' && item.dataset.project !== key;
    });
  }

  /* delegated from document rather than bound to #folio-filter: on the chart
     the window is mounted long after this file runs, so a direct listener
     would be attaching to an element that does not exist yet. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('#folio-filter [data-folio]');
    if (!b) return;
    filterFolio(b.dataset.folio);
    sfx('tap');
  });

  /* ---------------------------------------------------------------------
     MOUNTING — the chart's path. The desktop already has this markup inline
     and only needs the renderers above.
     --------------------------------------------------------------------- */

  /* index.html says images/... ; a page one level down needs ../images/... */
  function rebase(root, prefix) {
    all('img[src]', root).forEach(function (img) {
      var src = img.getAttribute('src');
      if (src && !/^(https?:|data:|\/)/.test(src)) img.setAttribute('src', prefix + src);
    });
    all('a[href]', root).forEach(function (a) {
      var href = a.getAttribute('href');
      if (href && !/^(https?:|mailto:|#|\/)/.test(href)) a.setAttribute('href', prefix + href);
    });
  }

  /* os.js's FILL table only exists on the desktop, so the two data-fill
     targets inside this window would render as empty elements here. Only
     these two are in the lifted markup; test/strings.test.js fails if a third
     ever appears without a home. */
  var FILLS = { 'info-cta': S.app.infoCta, 'see-work': S.app.seeWork };

  function fillText(root) {
    all('[data-fill]', root).forEach(function (n) {
      var v = FILLS[n.dataset.fill];
      if (v != null) n.textContent = v;
    });
  }

  /* data-app is a window opener, and there are no windows on a page that is
     not the desktop. Turn those buttons into links that open the desktop with
     that window already up, which is what #quote / #portfolio already do. */
  var HASH_FOR = { readme: 'readme', quest: 'questlog', resume: 'resume', diag: 'diagnosis',
                   folio: 'portfolio', stick: 'stickers', guest: 'guestbook', quote: 'quote',
                   patch: 'patches', v95: 'classic', terminal: 'terminal', ach: 'achievements',
                   specs: 'specs' };

  function relink(root, prefix) {
    all('[data-app]', root).forEach(function (b) {
      var a = document.createElement('a');
      a.className = b.className;
      /* HASHES in os.js keys off friendly names, not the internal app keys
         data-app carries, so translate rather than emitting a dead #quote. */
      a.href = prefix + '#' + (HASH_FOR[b.dataset.app] || b.dataset.app);
      a.innerHTML = b.innerHTML;
      b.parentNode.replaceChild(a, b);
    });
  }

  function renderAll() {
    renderSpecs();
    renderSkillTree();
    renderContact();
    renderFolioFilter();
  }

  function mountInfo(host, prefix) {
    prefix = prefix || '';
    return fetch(prefix + 'index.html').then(function (r) {
      if (!r.ok) throw new Error('index.html ' + r.status);
      return r.text();
    }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var win = doc.getElementById('w-readme');
      if (!win) throw new Error('no #w-readme in index.html');
      /* the tab strip, the panels and the CTA. Not the title bar or the
         resize grip, which belong to a window you can drag. */
      ['.wtabs', '.wbody'].forEach(function (sel) {
        var n = win.querySelector(sel);
        if (n) host.appendChild(document.importNode(n, true));
      });
      rebase(host, prefix);
      fillText(host);
      relink(host, prefix);
      renderAll();
      host.addEventListener('click', function (e) {
        var b = e.target.closest('.wtab');
        if (!b) return;
        showTab(host, b.dataset.tab);
        sfx('tap');
      });
      return host;
    });
  }

  /* the desktop's tab behaviour minus everything that belongs to a window:
     no dock entry, no phone borrowing, no achievement counting. */
  function showTab(host, tab) {
    all('.wtab', host).forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    all('.wpanel', host).forEach(function (p) { p.hidden = p.dataset.panel !== tab; });
  }

  global.renderSpecs = renderSpecs;
  global.renderSkillTree = renderSkillTree;
  global.renderContact = renderContact;
  global.renderFolioFilter = renderFolioFilter;
  global.filterFolio = filterFolio;
  global.mountInfo = mountInfo;
  global.showInfoTab = showTab;
}(window));

/* ==========================================================================
   icybearOS — shell + engine.
   Loaded by index.html only. All copy lives in os-strings.js.
   The shared holo driver (--holo-x / --holo-y) comes from script.js; this file
   never duplicates it.
   ========================================================================== */

(function () {
  'use strict';

  var S = window.OS_STRINGS;
  var body = document.body;

  /* First, before anything reaches for an id: sky.js injects #sky, #weather,
     .grid-overlay and #decor at the top of <body> and fills the sprite pools.
     The chart page calls the same function, so neither owns a copy of the
     scene and a change to it cannot land on one page only. */
  buildSky();

  /* ---------- tiny helpers ---------- */
  function el(id) { return document.getElementById(id); }
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  /* app content moves between shells; slot names are unique, so never scope a
     slot lookup to its window or it breaks the moment the phone borrows it */
  function slot(name) { return document.querySelector('[data-slot="' + name + '"]'); }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function fmt(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, function (m, k) { return vars[k]; }); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  /* every icon is a swappable file at a clean path; nothing here draws artwork */
  function iconImg(name) { return '<img src="images/os/icons/' + name + '.svg" alt="">'; }

  /* ==========================================================================
     STORAGE — versioned, migrating, never wiping.
     The bear's name is the emotional contract. A release that wipes it is a
     brand incident, so every version bump ships its migration.
     ========================================================================== */

  var VERSION = 1;
  var NS = 'icybear.v' + VERSION + '.';
  /* Every key that must survive a VERSION bump. `saveKey` was missing, which is
     the one omission that mattered: the product key exists precisely so a
     visitor survives losing local storage, and a version bump is exactly the
     event it was built for. It would have been dropped on the first bump, and
     with it every badge on a Safari that had swept the rest. `fed` was missing
     because it did not exist yet -- see below. */
  var KEYS = ['bearName', 'bearNamedAt', 'visits', 'diag', 'ach', 'wall', 'mode',
              'stickyNote', 'guestStamp', 'sound', 'uptimeShown', 'handle', 'konami',
              'opened', 'seen', 'saveKey', 'fed', 'serial', 'snakeBest'];
  var amnesia = false;

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(NS + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { amnesia = true; return fallback; }
  }

  /* Shared by the guestbook and the product key. Both values are publishable
     by design -- they ship in this file, which anyone can read -- and are
     bounded entirely by row level security. The service_role key must never
     appear here. */
  var GB = {
    url: 'https://ipvpovvdjwbaizbucrjc.supabase.co',
    key: 'sb_publishable_q3gOsrzRtRpTVCgSoDoaiQ_l4Jmu5QF'
  };

  /* Writes to these mean the save is stale. Everything else is local-only. */
  var SYNCED = { ach: 1, bearName: 1, wall: 1, visits: 1, serial: 1 };
  var syncTimer = null;

  function write(key, value) {
    try { localStorage.setItem(NS + key, JSON.stringify(value)); }
    catch (e) { amnesia = true; }
    /* One hook, because every piece of state already funnels through here.
       Debounced: badges arrive in bursts, and 13/13 should be one request. */
    if (SYNCED[key] && read('saveKey', null)) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(pushSave, 1500);
    }
  }

  /* ==========================================================================
     THE PRODUCT KEY

     Safari caps script-writable storage at seven days without a visit, so
     localStorage alone loses every badge for anyone who comes back monthly --
     `reg` unlocks at five visits and is unwinnable there. The key is the only
     thing that survives, because it is the one piece the visitor holds.

     The key never leaves this browser except to be checked. The server stores
     sha256(key + secret salt), so a key can be verified but never retrieved --
     not by an attacker, not by Supabase, not by the operator. The cost is
     there is no recovery, which is exactly why the key must never gate anything
     of value.
     ========================================================================== */

  var A32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';   /* Crockford: no I L O U */
  var KEY_PREFIX = 'ICYBR';
  var KEY_BODY = 15;                              /* 75 bits */

  /* Byte-identical to the Edge Function's copy; key.test.js asserts it.
     Odd weights (2i+1) are load-bearing: with i+1 the even weights share a
     factor with 32 and 17 single-character typos slipped through silently. */
  function checkChar(body) {
    var sum = 0;
    for (var i = 0; i < body.length; i++) sum += (2 * i + 1) * A32.indexOf(body.charAt(i));
    return A32.charAt(sum % 32);
  }

  function foldKey(s) { return s.replace(/O/g, '0').replace(/[IL]/g, '1'); }
  function canonKey(raw) {
    return String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  }

  /* the 15-char body, or null. Fold prefix and body SEPARATELY -- folding the
     whole string rewrites the I in ICYBR to a 1 and nothing ever matches. */
  function parseKey(raw) {
    var flat = canonKey(raw);
    if (flat.length !== KEY_PREFIX.length + KEY_BODY + 1) return null;
    if (foldKey(flat.slice(0, KEY_PREFIX.length)) !== foldKey(KEY_PREFIX)) return null;
    var rest = foldKey(flat.slice(KEY_PREFIX.length));
    var body = rest.slice(0, KEY_BODY);
    for (var i = 0; i < body.length; i++) if (A32.indexOf(body.charAt(i)) === -1) return null;
    if (rest.charAt(KEY_BODY) !== checkChar(body)) return null;
    return body;
  }

  function mintKey() {
    var out = '', buf = new Uint8Array(32), i = 0;
    crypto.getRandomValues(buf);
    while (out.length < KEY_BODY) {
      if (i >= buf.length) { crypto.getRandomValues(buf); i = 0; }
      out += A32.charAt(buf[i++] & 31);     /* 256 %% 32 === 0, so no modulo bias */
    }
    return KEY_PREFIX + out + checkChar(out);
  }

  function prettyKey(k) {
    var f = canonKey(k);
    return [f.slice(0, 5), f.slice(5, 10), f.slice(10, 15), f.slice(15, 20), f.slice(20)]
      .join('-');
  }

  /* The single check before anything touches the network. An engine without
     fetch must degrade to a local-only site, never to a blank screen. */
  function backendUp() {
    return !!(GB.url && GB.key && typeof fetch === 'function');
  }

  function saveCall(body) {
    if (!backendUp()) return Promise.reject(new Error('unavailable'));
    return fetch(GB.url + '/functions/v1/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 apikey: GB.key, Authorization: 'Bearer ' + GB.key },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok && j.ok, body: j }; },
                           function () { return { ok: false, body: {} }; });
    });
  }

  function savePayload() {
    return { ach: read('ach', []), bear: read('bearName', null),
             theme: read('wall', null), visits: (read('visits', {}) || {}).count || 0 };
  }

  /* Never blocks and never surfaces an error: a failed sync means the local
     state is simply still the newer one, and the next write tries again. */
  function pushSave() {
    try {
      var key = read('saveKey', null);
      if (!key) return;
      var p = savePayload();
      p.op = 'sync'; p.key = key;
      saveCall(p).catch(function () {});
    } catch (e) { /* a backup must never be able to break the thing it backs up */ }
  }

  /* Carries every known key forward from the newest older namespace that has
     it. Old keys are left in place — migration never deletes. */
  function migrate() {
    try {
      for (var v = VERSION - 1; v >= 1; v--) {
        var old = 'icybear.v' + v + '.';
        KEYS.forEach(function (key) {
          if (localStorage.getItem(NS + key) !== null) return;
          var carried = localStorage.getItem(old + key);
          if (carried !== null) localStorage.setItem(NS + key, carried);
        });
      }
    } catch (e) { amnesia = true; }
  }

  migrate();

  /* read() hands back whatever JSON.parse produced, and the next three lines do
     arithmetic on it. A missing or wrong-shaped value used to reach them: null
     threw straight out of boot and left a blank page, a primitive made the
     += 1 a silent no-op, and a non-number turned every visit count on the site
     into NaN -- the terminal's whoami, the reg badge, and the card's receipt. */
  function readCount(key) {
    var v = read(key, null);
    var n = v && typeof v === 'object' ? v.count : NaN;
    return {
      count: typeof n === 'number' && isFinite(n) && n >= 0 ? Math.floor(n) : 0,
      last: v && typeof v === 'object' && typeof v.last === 'string' ? v.last : null
    };
  }

  /* A VISIT IS NOT A PAGE LOAD. This used to be an unconditional += 1 on every
     script run, so a refresh was a visit: `reg` unlocked by holding F5, the
     terminal's whoami counted reloads, and the proof-of-visit card's receipt
     said VISIT 12 to someone who had been here twice.

     A visit is a session. sessionStorage marks the tab, which covers refresh
     and back-navigation exactly and clears itself when the tab closes. The
     thirty-minute gap is the backstop for the browsers where sessionStorage
     throws (private mode, storage disabled) and for a tab left open overnight;
     it is the standard analytics session window and it is the same number
     whether or not the marker worked. */
  var VISIT_GAP_MS = 30 * 60 * 1000;
  var visits = readCount('visits');
  var returning = visits.count > 0;

  function sameSession() {
    try { return sessionStorage.getItem(NS + 'seenSession') === '1'; }
    catch (e) { return false; }
  }
  function markSession() {
    try { sessionStorage.setItem(NS + 'seenSession', '1'); } catch (e) { /* fine */ }
  }

  var sinceLast = visits.last ? Date.now() - Date.parse(visits.last) : Infinity;
  if (!sameSession() && !(sinceLast >= 0 && sinceLast < VISIT_GAP_MS)) {
    visits.count += 1;
    visits.last = new Date().toISOString();
    write('visits', visits);
  }
  markSession();

  /* ==========================================================================
     SOUND — the engine, the voice table and the mute preference all live in
     sfx.js, which the chart page loads too so one mute means muted everywhere.
     What stays here is the part that is about this OS: the badge for turning
     it off, and the chime that follows the current theme.
     ========================================================================== */

  var soundEverOn = soundIsOn();

  function setSound(on) {
    if (on) soundEverOn = true;
    else if (soundEverOn) earn('mute');
    setSoundPref(on);
  }

  /* ==========================================================================
     TRANSIENT MESSAGES (bug log #3)
     Desktop: toast + speech bubble. Phone: one notification banner, always.
     ========================================================================== */

  function onPhone() {
    return body.hasAttribute('data-preview') || window.matchMedia('(max-width: 700px)').matches;
  }

  /* THE THIRD SHAPE. Not a third shell -- a portrait tablet gets the desktop,
     with its composition rotated: apps across the top, icy at the bottom right,
     windows opening UNDER the apps instead of beside them. os.css section 16
     owns the layout; this exists because two things that place elements from
     JavaScript have to agree with it.

     The query is duplicated rather than derived, because there is nothing to
     derive it from -- a media query is not readable back out of a stylesheet.
     If one of the two moves the other has to move with it. */
  function onTablet() {
    return !onPhone() &&
      window.matchMedia('(max-width: 1200px) and (orientation: portrait)').matches;
  }

  var toastTimer = null;
  var notifTimer = null;

  function dismiss(node, timer) {
    node.removeAttribute('data-show');
    clearTimeout(timer);
  }

  /* A queue, not a single slot. Two toasts fired in the same tick used to mean
     the second replaced the first within a frame — which silently destroyed the
     snowman badge announcement, seventy seconds of patience gone in the next
     line of code. Capped at three so a burst cannot hold the bar hostage. */
  var toastQueue = [];

  /* Set while the badge panel is on screen. Declared up here because
     desktopToast is the thing that has to respect it and it runs first. */
  var achBusy = false;

  function desktopToast(text) { showToast(text); }

  /* The queue carries the ACTION and the TITLE too, not just the words. It used
     to hold bare strings, so a nudge that had to wait came back as plain text
     with nothing to click -- the one toast on this site that is worth waiting
     for, arriving stripped of the only reason to wait for it. */
  function queueToast(text, action, title) {
    if (toastQueue.length >= 3) return;
    for (var i = 0; i < toastQueue.length; i++) {
      if (toastQueue[i][0] === text) return;      /* already waiting to be said */
    }
    toastQueue.push([text, action, title]);
  }

  function nextToast() {
    /* Guarded, not just skipped at the far end. Without this a toast timing out
       while the panel is up would shift itself off the queue and hand straight
       back to showToast, which re-queues it at the BACK -- so a waiting message
       could lose its place, or be dropped outright against the cap of three. */
    if (achBusy || !toastQueue.length) return;
    var q = toastQueue.shift();
    showToast(q[0], q[1], q[2]);
  }

  /* HOLDING NEW TOASTS BACK WAS ONLY HALF THE RULE. A toast already on screen
     when a badge lands used to stay there, and #achpop is fixed to the same
     top:44px / left:50% anchor at the same z-index -- so it did not land beside
     the toast, it landed ON it.

     Naming the bear is the case that made this the FIRST badge most people
     ever earn: `<name> has joined icybearOS` fires, earn() runs on the very
     next line, and the panel drops straight over a message that is still 2.4
     seconds from timing out.

     So the panel does not merely block the queue, it clears the spot. Whatever
     is showing comes down and goes to the FRONT of the queue -- with its action
     and its title, because the capture nudge is the one toast worth waiting for
     and it arrives stripped of its reason to exist if those are dropped -- and
     is said again when the panel hands the spot back. */
  function yieldToast() {
    var t = el('toast');
    if (!t.hasAttribute('data-show')) return;
    var held = [t.textContent, toastAction, t.getAttribute('title') || ''];
    dismiss(t, toastTimer);
    t.removeAttribute('data-action');
    t.removeAttribute('title');
    toastAction = null;
    toastQueue.unshift(held);
    if (toastQueue.length > 3) toastQueue.length = 3;
  }

  /* A toast can carry one action. Only the capture nudge uses it, and it is a
     convenience rather than the affordance -- the dock button is the
     affordance, and it rings at the same moment. A toast nobody clicks still
     did its job. */
  var toastAction = null;

  /* HOW LONG A MESSAGE STAYS IS A FUNCTION OF WHAT IT ASKS FOR. 2.4 seconds is
     right for a fact you can glance at -- "theme: prismagical" -- and far too
     short for anything you have to decide about. The capture nudge is an
     invitation with a clickable action on it, and 2.4s is not enough time to
     read it, understand that it is offering something, and reach the pointer
     over. An actionable toast gets 6. */
  var TOAST_MS = 2400, TOAST_ACTION_MS = 6000;

  function showToast(text, action, title) {
    var t = el('toast');

    /* THE GATE LIVES HERE, and the first version of it did not.
       It was in desktopToast, which is only one of the two ways in: nudgeCapture
       calls showToast DIRECTLY, and nudgeCapture is fired by earn() at three
       badges -- so the single toast most likely to collide with a badge panel
       was the one route that walked straight past the check. Every caller comes
       through this function, so this is the only place the rule can actually
       hold. */
    if (achBusy || t.hasAttribute('data-show')) {
      queueToast(text, action, title);
      return;
    }
    t.textContent = text;
    toastAction = action || null;
    if (action) { t.setAttribute('data-action', ''); t.title = title || ''; }
    else { t.removeAttribute('data-action'); t.removeAttribute('title'); }
    t.setAttribute('data-show', '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.removeAttribute('data-show');
      t.removeAttribute('data-action');
      toastAction = null;
      if (toastQueue.length) setTimeout(nextToast, 260);
    }, action ? TOAST_ACTION_MS : TOAST_MS);
  }

  el('toast').addEventListener('click', function () {
    var fn = toastAction;
    if (!fn) return;
    toastAction = null;
    fn();
  });

  el('toast').addEventListener('click', function () {
    dismiss(el('toast'), toastTimer);
    if (toastQueue.length) setTimeout(nextToast, 260);
  });
  /* Same door as the desktop panel, on the shell that has no panel. The phone
     announces a badge as a notification carrying the patch itself, so tapping
     it opens badges.sav; every other banner just dismisses. */
  el('pnotif').addEventListener('click', function () {
    var wasBadge = notifIsBadge;
    dismiss(el('pnotif'), notifTimer);
    notifIsBadge = false;
    nextNotif();
    if (wasBadge) openWin('ach');
  });

  var ICON_NAMES = ['readme', 'quest', 'resume', 'diag', 'folio', 'stick', 'guest', 'quote',
                    'patch', 'v95', 'terminal', 'ach', 'specs', 'bags', 'sound-on', 'sound-off',
                    'camera', 'phone', 'moon', 'flower'];

  /* the phone gets the same queue as the desktop. It used to be a single slot,
     which mattered more than it looked: naming the bear fires a toast and then
     earns a badge in the next line, and the phone is now the shell where naming
     is most likely to happen. */
  var notifQueue = [];

  /* whether the banner currently on screen is an earned badge, which is the
     only one that is a door rather than a message */
  var notifIsBadge = false;

  function phoneToast(icon, text, ambient) {
    if (el('pnotif').hasAttribute('data-show')) {
      /* decoration gets one chance and is then dropped. Idle chatter arriving
         four seconds late reads as a glitch, and it must never be the reason a
         badge announcement waits. Anything the visitor actually did queues. */
      if (ambient) return;
      var dupe = notifQueue.some(function (q) { return q[1] === text; });
      if (notifQueue.length < 3 && !dupe) notifQueue.push([icon, text]);
      return;
    }
    phoneNotif(icon, text);
  }

  function nextNotif() {
    if (!notifQueue.length) return;
    setTimeout(function () {
      var q = notifQueue.shift();
      phoneNotif(q[0], q[1]);
    }, 260);
  }

  function phoneNotif(icon, text) {
    var n = el('pnotif');
    var badge = n.querySelector('[data-fill="pnotif-icon"]');
    /* when icy speaks it should be her face, not an app glyph -- the readme
       icon made every idle line look like a file had opened */
    badge.classList.toggle('notif__icon--icy', icon === 'icy');
    badge.classList.toggle('notif__icon--bear', icon === 'bear');
    /* An earned badge announces itself AS the badge. The patch is the reward,
       so the one notification that exists to hand it over should show it rather
       than the badges.sav app glyph, which is a filing cabinet for them. Only
       ids from DEFS ever reach here. */
    icon = String(icon || '✦');
    var patch = icon.indexOf('badge:') === 0;
    notifIsBadge = patch;
    badge.classList.toggle('notif__icon--patch', patch);
    if (patch) badge.innerHTML = '<img src="images/os/badges/' + icon.slice(6) + '.svg" alt="">';
    else if (icon === 'icy') badge.innerHTML = '<img src="images/os/icy-avatar2.webp" alt="">';
    else if (icon === 'bear') badge.innerHTML = '<img src="images/os/bear-pfp.webp" alt="">';
    else if (ICON_NAMES.indexOf(icon) !== -1) badge.innerHTML = iconImg(icon);
    else badge.textContent = icon;
    n.querySelector('[data-fill="pnotif-body"]').textContent = text;
    n.setAttribute('data-show', '');
    clearTimeout(notifTimer);
    notifTimer = setTimeout(function () {
      n.removeAttribute('data-show');
      notifIsBadge = false;
      nextNotif();
    }, 2800);
  }

  function toast(text, icon) {
    if (onPhone()) phoneToast(icon || '✦', text);
    else desktopToast(text);
  }

  /* One anchor strategy only: right edge at --bx, bottom edge at --by.
     Text is set before showing; width is max-content. Never re-anchors. */
  var bubbleTimer = null;

  /* WHERE HER HEAD IS INSIDE THE CANVAS.
     Every pose ships on one 1492x1702 canvas with the ground on the bottom edge
     and the head on a shared vertical line, which is what lets one CSS height
     size all of them. The cost is that the element's box is no longer her
     outline: the bubble used to anchor to standee.top because a tight crop put
     her head there, and on a seated pose that is now 900 canvas pixels of
     transparency above her, which is where the bubble went.

     Horizontal is a constant because the canvas made it one: 47.4% for every
     pose, standing or seated. Vertical is not, because a seated body is shorter
     and sits at the bottom of the same canvas, so it gets one number per state.
     Both are properties of the artwork; test/poses.sh is what would change
     them.

     The vertical numbers are the HIGHEST point either set reaches, measured off
     the shipped files: standing runs 0.000 to 0.044 and seated 0.528 to 0.581.
     Anchoring to the highest rather than the average means the bubble floats a
     little on the shorter poses and never lands on her face, which is the right
     way round for the trade. */
  var HEAD_X = 0.474;
  var HEAD_TOP = { standing: 0.0, seated: 0.528 };

  /* `ambient` marks decoration: idle chatter, pose lines, weather asides. Those
     go into the bubble with the live region switched OFF, because a screen
     reader interrupted every fifteen seconds by "*soft judging*" is being
     harmed by the atmosphere, not given it. Anything the visitor actually did
     still announces. */
  function icySay(text, ambient) {
    if (onPhone()) { phoneToast('icy', text, ambient); return; }
    var stage = el('standee');
    var bubble = el('icy-bubble');
    /* textContent wipes the answer buttons, but data-ask carried pointer-events
       and stayed behind: an invisible, permanent click-blocker over the corner
       of the desktop. Any line she says now stands the bubble back down. */
    bubble.removeAttribute('data-ask');
    bubble.setAttribute('aria-live', ambient ? 'off' : 'polite');
    bubble.textContent = text;
    var r = stage.getBoundingClientRect();
    var visible = r.width > 0;
    var head = r.top + r.height * (HEAD_TOP[body.dataset.icy] || HEAD_TOP.standing);
    /* a little past her head, so the bubble's corner points back at her */
    bubble.style.setProperty('--bx', (visible ? r.left + r.width * (HEAD_X + 0.06) : window.innerWidth - 24) + 'px');
    bubble.style.setProperty('--by', (visible ? head - 6 : 110) + 'px');
    bubble.setAttribute('data-show', '');
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(function () { bubble.removeAttribute('data-show'); }, 3400);
  }

  /* ==========================================================================
     MODES — day / night / rain / snow, or auto (follows your clock).
     Persisted since 2026-08-20: a visitor who picks a sky keeps it.
     ========================================================================== */

  var MODES = ['auto', 'day', 'night', 'rain', 'snow'];
  var mode = read('mode', 'auto');
  if (MODES.indexOf(mode) === -1) mode = 'auto';

  /* Themes are earned. The achievement system lands in M3; this reads the same
     `ach` key it will write, so the gate is already the real one. */
  var THEMES = [
    { id: 'base', unlock: 0 },
    { id: 'holo', unlock: 3 },
    { id: 'strawberry', unlock: 6 },
    { id: 'arcade', unlock: 9 },
    { id: 'archangel', unlock: 13 }
  ];

  /* BUILD FLAG — every theme was open while we were designing them. Off now:
     the ladder is the reason to collect badges at all, and with this true there
     was no ladder to feel. Turning it on again also silences every
     theme-unlocked moment, because `badges` starts at Infinity and nothing can
     cross a rung it is already past. */
  var DEV_UNLOCK_THEMES = false;

  /* A SEPARATE FLAG, because the two are separate things and were tangled. The
     test hooks below (ceremony, covenant hour, capLayout) hung off
     DEV_UNLOCK_THEMES, so closing the theme gate also deleted the only way to
     trigger the ceremony on demand -- one switch quietly doing two jobs. Both
     go before launch; they just go independently. */
  var DEV_HOOKS = true;
  var badges = DEV_UNLOCK_THEMES ? Infinity : readList('ach').length;

  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  }

  /* one list, rendered into every mount: the view menu and the phone sheet */
  function renderThemeMenu() {
    all('[data-theme-list]').forEach(function (host) {
      host.innerHTML = '';
      THEMES.forEach(function (t) {
        var open = badges >= t.unlock;
        var b = document.createElement('button');
        b.className = 'swatch';
        b.dataset.wallSet = t.id;
        b.dataset.swatch = t.id;
        /* no menu role: these buttons have no menu ancestor and no arrow-key
           navigation, and a menuitem role promises both. aria-pressed on a
           plain button is valid anywhere and says the same thing. */
        b.setAttribute('aria-pressed', String(body.dataset.wall === t.id));
        if (!open) b.setAttribute('data-locked', '');
        b.innerHTML =
          '<span class="swatch__chip"></span>' +
          '<span class="swatch__text">' +
            '<span class="swatch__name"></span>' +
            '<span class="swatch__meta"></span>' +
          '</span>';
        b.querySelector('.swatch__name').textContent = S.themes[t.id];
        b.querySelector('.swatch__meta').textContent = !open
          ? fmt(S.themes.lockedMeta, { n: t.unlock })
          : t.unlock >= 13 ? S.themes.final
          : t.unlock ? S.themes.earned
          : S.themes.standard;
        host.appendChild(b);
      });
    });
  }

  /* ==========================================================================
     WALLPAPERS.EXE — the drop.

     Ten skies: every theme, day and night, in the two shapes people actually
     have. The files are renders of THIS page (test/wallpaper.py), so a theme
     that changes takes its wallpaper with it and nothing here has to know.

     The grid is built rather than written out because it is THEMES x two modes
     and it has to read the lock state. A locked theme shows what unlocks it and
     carries no link at all -- not a disabled one, not a hidden one -- because a
     download URL in the markup is a download, whatever the CSS says about it.
     ========================================================================== */
  /* ONE WALLPAPER PER THEME, not one per theme per time of day. The day/night
     split existed because the old art was the sky recoloured, so the sky's two
     states were the only thing that varied. These are compositions -- each
     theme's own glyphs, its own structural layer, the wordmark set in its own
     palette -- and a theme has one of those, not two.

     Desktop and phone sit side by side at the SAME HEIGHT, because that is the
     honest comparison: they are the same design cut for two screens, and a row
     that shows a wide one over a tall one makes the tall one look like an
     afterthought. The phone keeps its 9:19.5, the desktop its 16:10, and the
     row's height is what they share. */
  var WALL_KINDS = ['desk', 'phone'];
  var WALL_PX = { desk: '2560 \u00d7 1600', phone: '1284 \u00d7 2782' };

  function renderWallGrid() {
    var host = el('wall-grid');
    if (!host) return;
    host.innerHTML = '';
    THEMES.forEach(function (t) {
      var open = badges >= t.unlock;
      var tile = document.createElement('figure');
      tile.className = 'wtile';

      var pair = document.createElement('div');
      pair.className = 'wtile__pair';
      WALL_KINDS.forEach(function (k) {
        var art = document.createElement('div');
        art.className = 'wtile__art wtile__art--' + k;
        if (open) {
          var img = document.createElement('img');
          /* Previews only. The full png is 1-2MB and is fetched when somebody
             actually asks for it, not when the window opens. */
          img.loading = 'lazy';
          img.decoding = 'async';
          img.src = 'images/wall/' + t.id + '-' + k + '-t.webp';
          img.alt = S.themes[t.id] + ', ' + S.wall[k];
          art.appendChild(img);
        } else {
          /* Still no <img> and still no src: a locked tile has nothing to peel
             back in devtools. What it has now is a voice -- the two lines say
             what is behind the door and what it costs, where the old sparkle
             just looked like a failed load. */
          art.setAttribute('data-locked', '');
          var q = document.createElement('b');
          q.className = 'wtile__q';
          q.textContent = S.wall.lockedQ;
          var free = document.createElement('i');
          free.className = 'wtile__free';
          free.textContent = S.wall.lockedFree;
          art.appendChild(q);
          art.appendChild(free);
        }
        pair.appendChild(art);
      });
      tile.appendChild(pair);

      var cap = document.createElement('figcaption');
      cap.className = 'wtile__cap';
      var name = document.createElement('b');
      name.textContent = S.themes[t.id];
      cap.appendChild(name);
      tile.appendChild(cap);

      var row = document.createElement('p');
      row.className = 'wtile__get';
      if (open) {
        WALL_KINDS.forEach(function (k) {
          var a = document.createElement('a');
          a.className = 'wtile__dl';
          a.href = 'images/wall/' + t.id + '-' + k + '.png';
          /* named for what it is, not for how the repo stores it */
          a.download = 'icybearOS-' + t.id + '-' + k + '.png';
          a.innerHTML = '<b></b><i></i>';
          a.querySelector('b').textContent = S.wall[k];
          a.querySelector('i').textContent = WALL_PX[k];
          row.appendChild(a);
        });
      } else {
        var lock = document.createElement('span');
        lock.className = 'wtile__lock';
        lock.textContent = fmt(S.wall.locked, { n: t.unlock });
        row.appendChild(lock);
      }
      tile.appendChild(row);
      host.appendChild(tile);
    });
  }

  function effMode() {
    if (mode !== 'auto') return mode;
    var h = new Date().getHours();
    return (h >= 21 || h < 7) ? 'night' : 'day';
  }

  function deluluLevel(m) {
    if (m === 'snow') return 5;
    return (m === 'night' || m === 'rain') ? 4 : 3;
  }

  var lastApplied = null;

  function applyMode() {
    /* tick() calls this every 15 seconds, and it fans out to setPose(),
       renderMood() (which builds two Dates and parses a locale string),
       noteWeather() and restBear(). None of that needs doing when the sky has
       not moved, which is almost always. */
    /* renderMood stays ABOVE the gate: tick() has no other route to it, so
       memoising it would quietly freeze the mood ring's clock and uptime. The
       gate is for the fan-out that genuinely only matters when the sky moves. */
    renderMood();
    var eff = effMode() + '|' + mode;
    if (eff === lastApplied) return;
    lastApplied = eff;
    var m = effMode();
    body.dataset.mode = m;
    el('mode-chip').textContent = S.sys.modeNames[mode] + (mode === 'auto' ? ' (' + m + ')' : '');
    all('[data-mode-set]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.modeSet === mode));
    });
    setPose();
    /* Both are function DECLARATIONS in this same IIFE, so both are hoisted
       before applyMode can run and neither typeof guard could ever be false.
       They implied a load-order hazard that does not exist. */
    noteWeather(m);
    if (Date.now() >= bearBusy) restBear();
  }

  function setMode(next) {
    var was = effMode();
    mode = next;
    write('mode', next);
    applyMode();
    toast(mode === 'auto' ? S.sys.modeAutoToast : fmt(S.sys.modeToast, { mode: effMode() }), '☁');
    sfx('mode');
    weatherOpinion(was, effMode());
  }

  /* The bear sulks in the rain and icy does not, and that disagreement is the
     point: two characters who react to the same sky differently is cheaper
     characterisation than any amount of copy about either of them. The sad
     face was reading as a bug because nothing acknowledged it. */
  function weatherOpinion(was, now) {
    if (was === now) return;
    var set = S.weather[now];
    if (!set) return;
    var pair = pick(set);            /* one exchange, never two halves of two */
    setTimeout(function () { icySay(pair[0]); }, 900);
    setTimeout(function () { bearSay(pair[1]); }, 2600);
  }

  function setTheme(id) {
    var t = themeById(id);
    if (badges < t.unlock) {
      toast(fmt(S.themes.locked, { n: t.unlock }), '✧');
      sfx('deny');
      return;
    }
    body.dataset.wall = id;
    write('wall', id);
    renderThemeMenu();
    /* NOT renderWallGrid: the grid depends on the badge count, never on which
       theme is current, and rebuilding it here would throw away every preview
       that had lazily loaded and ask for them all again on the next open. */
    if (id === 'archangel') { ceremony(); return; }
    toast(fmt(S.themes.applied, { name: S.themes[id] }), 'flower');
    sfx('theme');
  }

  /* ==========================================================================
     THE CEREMONY — the thirteenth arrives once, and it should feel like it.

     Fires on switching to archangel while we are still designing the theme.
     Before launch this moves to the unlock itself: call ceremony() from
     unlock('all') and drop the call in setTheme (icybearos-spec.md, section 9).
     ========================================================================== */

  var ceremonyTimer = null;

  function ceremony() {
    var c = el('ceremony');
    if (c.hasAttribute('data-open')) return;
    c.removeAttribute('data-closing');
    c.setAttribute('data-open', '');
    c.setAttribute('aria-hidden', 'false');
    chime();
    setTimeout(function () { beep(1318.5, 0.5, 'sine', 0.05); }, 900);
    clearTimeout(ceremonyTimer);
    ceremonyTimer = setTimeout(endCeremony, 6400);
    /* after it has finished, not over the top of it */
    setTimeout(function () { nudgeCapture('ceremony'); }, 7600);
  }

  function endCeremony() {
    var c = el('ceremony');
    if (!c.hasAttribute('data-open')) return;
    clearTimeout(ceremonyTimer);
    c.setAttribute('data-closing', '');
    setTimeout(function () {
      c.removeAttribute('data-open');
      c.removeAttribute('data-closing');
      c.setAttribute('aria-hidden', 'true');
    }, 700);
  }

  el('ceremony').addEventListener('click', endCeremony);

  /* DEV HOOKS — for testing the moments without waiting for them or earning
     them. Delete this block before the site goes live (spec section 9). */
  /* eslint-disable-next-line no-undef */
  if (DEV_HOOKS) {
    window.icyDev = {
      capLayout: function () { return capLayout; },
      ceremony: ceremony,
      covenantHour: function (on) {
        body.toggleAttribute('data-covenant-hour', on !== false);
        if (on !== false) { toast(fmt(S.covenant.hour, { t: '1:33' }), '✝'); chime(); }
      }
    };
  }

  /* ==========================================================================
     CLOCK — your time on the chrome, icy's time (CET) in the mood ring.
     ========================================================================== */

  var BOOT_AT = Date.now();
  var REAL_TITLE = document.title;

  function localTime() {
    return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  function cetNow() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Vienna' }));
  }

  /* Whether icy is up, on HER clock. Read by the mood-ring status chip and by
     which pose set the standee is showing, so the two can never disagree. */
  function icyAwake() {
    var h = cetNow().getHours();
    return h >= 8 && h < 23;
  }

  var lastCovenantHour = -1;

  function tick() {
    var now = new Date();
    var t = localTime();
    el('clock').textContent = t;
    el('ptime').textContent = t;
    el('lclock').textContent = t;
    el('ldate').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }).toLowerCase();

    /* 13:33 is 1333. 1:33am is only 133, so it does not count. Once a day. */
    var hour = now.getHours() === 13 && now.getMinutes() === 33;
    var isArchangel = body.dataset.wall === 'archangel';
    body.toggleAttribute('data-covenant-hour', hour && isArchangel);
    if (hour) earn('angel');
    if (hour && isArchangel && lastCovenantHour !== now.getHours()) {
      lastCovenantHour = now.getHours();
      toast(fmt(S.covenant.hour, { t: t }), '✝');
      chime();
    }
    if (!hour) lastCovenantHour = -1;

    var awake = icyAwake();
    el('icy-state').toggleAttribute('data-asleep', !awake);
    el('icy-state').querySelector('[data-fill="icy-state"]').textContent = awake ? S.sys.online : S.sys.sleeping;
    setPose();          /* she sits down at 23:00 Vienna without a reload */

    applyMode();
  }

  /* ==========================================================================
     MOOD RING — one component, rendered into both shells.
     ========================================================================== */

  var moodMounts = [el('mood-desktop'), el('mood-phone')].filter(Boolean);

  /* Mounted once so the conic stone keeps spinning; only the slots update. */
  var MOOD_HTML = '' +
    '<p class="os-mono mood__title">' + S.mood.title +
      ' <span class="glyph" aria-hidden="true"></span></p>' +
    '<div class="mood__row">' +
      '<span class="stone"><img src="images/os/icy-avatar.webp" alt="icy"></span>' +
      '<span class="mood__id">' +
        '<span class="mood__who">icy <span class="glyph" aria-hidden="true"></span> ' +
          '<b>' + S.mood.who + '</b></span>' +
        '<span data-contact="compact"></span>' +
      '</span>' +
    '</div>' +
    '<div class="mood__stats">' +
      '<span>' + S.mood.delulu + ' <button class="mood__gauge" data-act="mood"></button></span>' +
      '<span>' + S.mood.icyTime + ' <b data-slot="cet">--:--</b> CET</span>' +
      '<span data-slot="you" hidden></span>' +
      '<span class="mood__patch">' + S.mood.patchTeaser + '</span>' +
    '</div>';

  moodMounts.forEach(function (mount) { mount.innerHTML = MOOD_HTML; });

  function renderMood() {
    var m = effMode();
    var lvl = deluluLevel(m);
    var gauge = repeat('\u2726', lvl) + repeat('\u2727', 5 - lvl);
    var cet = cetNow().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    moodMounts.forEach(function (mount) {
      var g = mount.querySelector('.mood__gauge');
      g.textContent = gauge;
      g.title = m === 'snow' ? S.mood.gaugeTipSnow : S.mood.gaugeTip;
      mount.querySelector('[data-slot="cet"]').textContent = cet;
      var you = mount.querySelector('[data-slot="you"]');
      you.hidden = !uptimeShown;
      if (uptimeShown) {
        you.textContent = fmt(S.mood.you, { n: Math.max(1, Math.round((Date.now() - BOOT_AT) / 60000)) });
      }
    });
  }

  function repeat(ch, n) { return new Array(n + 1).join(ch); }

  /* ==========================================================================
     STANDEE — she stands on the desktop, sits and sleeps at night.
     ========================================================================== */

  /* Two pose sets, and which one is showing is decided by ICY'S clock, not the
     visitor's. Night mode follows whoever is looking; she is in Vienna. Reading
     "sleeping, come back later" off the visitor's midnight told a Californian
     she was asleep at 5pm her time, which was simply false.

     The caption never states her state, because the pose already does. That is
     also the only version of this that cannot contradict itself. */

  /* Every pose ships on one shared canvas, so the list is only a count: see
     test/poses.sh for how they are cut and os.css for why the canvas exists.
     Sitting runs eyes open to eyes closed, so cycling reads as settling. */
  function poses(prefix, n) {
    var a = [];
    for (var i = 1; i <= n; i++) a.push('images/os/' + prefix + i + '.webp');
    return a;
  }
  var POSES = { up: poses('icy-stand-', 12), down: poses('icy-sit-', 5) };
  var pose = { up: Math.floor(Math.random() * POSES.up.length), down: 0 };

  function icySet() { return icyAwake() ? 'up' : 'down'; }

  function setPose() {
    var set = icySet();
    var src = POSES[set][pose[set] % POSES[set].length];
    body.dataset.icy = set === 'down' ? 'seated' : 'standing';
    [el('standee-img'), el('peek-img')].forEach(function (img) {
      if (!img.src.endsWith(src)) img.src = src;
    });
    el('standee').querySelector('figcaption').textContent = S.icy.poseCap;
  }

  function nextPose() {
    var set = icySet();
    pose[set] = (pose[set] + 1) % POSES[set].length;
    setPose();
    sfx('theme');
    if (Math.random() < 0.55) {
      icySay(set === 'down'
        ? fmt(pick(S.icy.sitLines), { t: cetNow().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) })
        : pick(S.icy.poseLines));
    }
  }

  el('standee').addEventListener('click', nextPose);
  el('standee').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); nextPose(); }
  });
  el('peek').addEventListener('click', nextPose);

  /* subtle pointer parallax; CSS owns the smoothing */
  window.addEventListener('pointermove', function (e) {
    var t = clamp((e.clientX / window.innerWidth - 0.75) * 10, -4, 4);
    el('standee-img').style.setProperty('--standee-tilt', t.toFixed(2) + 'deg');
  });

  /* ==========================================================================
     WINDOW ENGINE — open / close / focus / drag / resize, z 10-39.
     Focus order is the source of truth; z-indexes are reassigned from it, so
     the stack can never climb over the dock.
     ========================================================================== */

  var Z_BASE = 10;
  var stack = [];

  /* read_me, quest_log and resume are three registers of ONE subject: summary,
     detail, formal. They share a window with three tabs, so nothing stacks two
     panels saying the same thing, and it behaves identically on the phone where
     stacked windows are impossible. All three keep their own icon and their own
     app id, so `every` still requires all fourteen. */
  var TABBED = { readme: 1, quest: 1, folio: 1, resume: 1 };
  var TAB_HOST = 'readme';

  function winKey(app) { return TABBED[app] ? TAB_HOST : app; }
  function win(app) { return el('w-' + winKey(app)); }

  function showTab(tab) {
    if (!TABBED[tab]) return;
    /* NOT scoped to the window: on a phone these very nodes have been moved
       into #appbody, so a #w-readme selector matches nothing and the panel
       silently stops switching while the title still changes. There is only one
       set of them in the document either way. */
    all('.wtab').forEach(function (b) {
      var on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', String(on));
      b.classList.toggle('is-on', on);
    });
    all('.wpanel').forEach(function (pnl) {
      pnl.hidden = pnl.dataset.panel !== tab;
    });
    var t = slot('info-title');
    if (t) t.textContent = S.apps[tab].label;
    if (onPhone() && openApp.current && TABBED[openApp.current]) {
      el('apptitle').textContent = S.apps[tab].label;
      openApp.current = tab;
    }
    /* the tab IS the thing you either saw or did not, however you got here */
    noteApp(tab);
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('.wtab');
    if (!b) return;
    showTab(b.dataset.tab);
    sfx('tap');
  });

  function restack() {
    stack.forEach(function (app, i) { win(app).style.zIndex = Z_BASE + i; });
  }

  function focusWin(app) {
    var key = winKey(app);
    var i = stack.indexOf(key);
    if (i !== -1) stack.splice(i, 1);
    stack.push(key);
    all('.win[data-focus]').forEach(function (w) { w.removeAttribute('data-focus'); });
    win(app).setAttribute('data-focus', '');
    restack();
  }

  /* Every window used to carry a hand-picked top/left in the markup, and each
     of those was chosen for a window sitting on its own. Opened in sequence
     they landed on top of each other: four opens and two were completely
     buried, title bar and all, with no way to reach them but the dock.

     Cascade instead, the way a window manager does, so whatever is underneath
     always shows its title bar. Wraps rather than clamps when it runs out of
     room, since clamping would pile every later window on one pixel, which is
     the bug this replaces. A window the visitor has dragged is never moved. */
  var CASCADE_STEP = 28;

  /* THE APP GRID IS NOT A CONSTANT. On a portrait tablet it sits between the
     menu bar and the first window, and it is two rows on a 1024 slab, three on
     an 820 and four on a 744. The stylesheet needs that number to cap a window
     to the desk it actually has, and a media query cannot count icons -- so the
     grid measures itself and section 16 reads it back. Worst-casing it in CSS
     instead would cost every wider slab 184px of window for rows it does not
     have. Harmless off the tablet: nothing outside that section reads it. */
  function measureDesk() {
    var g = el('icons');
    if (!g) return;
    document.documentElement.style.setProperty('--icons-b',
      Math.round(g.getBoundingClientRect().bottom) + 'px');
  }

  /* A TABLET ROTATES, and the cascade is computed once -- when the window
     opens, from furniture that has since moved. Turn an iPad with read_me open
     and the window keeps a top measured against a three-row app grid, on a
     screen that now has no app grid above it at all and 360px less height to
     fall through. Windows the visitor has dragged are left exactly where they
     were put; they are not in the cascade any more by their own choice.

     Slots are cleared before any of them is re-placed, or the first window to
     move would see its own stale slot on the second one and step around a
     position nothing is going to be in. */
  function replaceWins() {
    var loose = all('.win[data-open]').filter(function (w) {
      return !w.hasAttribute('data-moved');
    });
    loose.forEach(function (w) { w.removeAttribute('data-slot'); });
    loose.forEach(function (w) { placeWin(w); });
  }

  function remeasure() {
    measureDesk();
    replaceWins();
  }

  measureDesk();
  window.addEventListener('resize', remeasure);
  /* rotation on iOS fires resize before the new viewport has settled */
  window.addEventListener('orientationchange', function () { setTimeout(remeasure, 120); });

  function placeWin(w) {
    if (w.hasAttribute('data-moved')) return;

    /* Anchored to the furniture rather than to a percentage of the viewport.
       The icon grid is the left wall and the menu bar is the ceiling, and both
       move between breakpoints; a percentage does not. 13% of 1440 put the
       first window at x=187 with the icons ending at x=316, so it opened on top
       of them. */
    var grid = el('icons').getBoundingClientRect();
    var roof = el('menubar').getBoundingClientRect().bottom;
    var floor = (el('dock') || document.body).getBoundingClientRect().top;
    var baseX = Math.round(grid.right) + 28;
    var baseY = Math.round(roof) + 26;

    /* On a portrait tablet the icons are a block across the TOP, so `beside the
       icons` is no longer a place -- it is a strip 270px wide against the mood
       ring, and the clamp below would have dragged every window back left and
       dropped it on the grid it was supposed to clear. The wall the windows
       come off is the same furniture either way; on a slab it is the floor of
       the app grid rather than its right edge. */
    if (onTablet()) {
      baseX = Math.round(grid.left);
      baseY = Math.round(grid.bottom) + 26;
    }

    /* Wrap before the cascade walks under the dock, rather than clamping there:
       clamping would pile every later window on one pixel, which is the bug
       this whole function replaces. Leave room for a title bar plus some body. */
    var room = Math.max(1, Math.floor((floor - baseY - 170) / CASCADE_STEP));

    /* THE SLOT IS CLAIMED, NOT COUNTED. This used to be `number of other open
       windows`, which is a population, not a position, and the two only agree
       while windows open in order and none of them ever closes. Open two, close
       the first, open a third: the count says one is ahead, so the third takes
       slot 1 -- which the second window is already sitting on, title bar exactly
       on title bar. Every window landing on top of another traces back to that
       one line.

       So each window records the slot it took, and a new one walks up from zero
       to the first slot nobody open is using. Windows the visitor has dragged
       are not in the running: they gave up their slot when they moved. */
    var used = {};
    all('.win[data-open]').forEach(function (o) {
      if (o === w || o.hasAttribute('data-moved')) return;
      var taken = parseInt(o.dataset.slot, 10);
      if (taken >= 0) used[taken] = 1;
    });
    var n = 0;
    while (used[n] && n < room) n += 1;
    n = n % room;                       /* full house: start the pile again */
    w.dataset.slot = n;
    /* The horizontal clamp had no twin, and on a slab that showed. `room` keeps
       the CASCADE from walking under the dock but it reserves a title bar plus
       some body, not a whole window -- so a tall window in a late slot still
       ended up with its last hundred pixels behind the dock. Same rule as the
       line below it: take the slot unless the slot puts you off the desk, and
       then take the last position that is still on it. Falling back to baseY
       rather than going higher, because above baseY is the app grid. */
    w.style.top = Math.min(baseY + n * CASCADE_STEP,
                           Math.max(baseY, Math.round(floor) - w.offsetHeight - 16)) + 'px';
    w.style.left = Math.min(baseX + n * CASCADE_STEP,
                            Math.max(8, window.innerWidth - w.offsetWidth - 24)) + 'px';
    w.style.right = 'auto';
    w.style.transform = 'none';
  }

  function openWin(app) {
    var w = win(app);
    if (!w) return;
    if (onPhone()) { openApp(app); return; }

    /* ALREADY OPEN MEANS BRING IT FORWARD. Asking for a window that is on
       screen is not a request for a second one, and re-running placeWin on it
       physically moved a window the visitor was looking at -- read_me's quote
       button did exactly that, sliding quote.exe out from under itself and onto
       read_me's own title bar. Raise it, switch to the right tab, and stop. */
    var already = w.hasAttribute('data-open') && !w.hasAttribute('data-closing');
    w.removeAttribute('data-closing');      /* cancels any in-flight close */
    w.setAttribute('data-open', '');
    if (!already) placeWin(w);              /* after data-open: offsetWidth is 0 while display:none */
    /* a tabbed app notes its TAB, not the window it happens to share */
    if (TABBED[app]) showTab(app); else noteApp(app);
    focusWin(app);
    renderDock();
    if (already) { sfx('tap'); return; }
    /* OPEN FROM WHERE IT WAS CLICKED. win-pop scaled from the window's own
       centre, which is the same gesture wherever you clicked -- so the icon and
       the window it produced had no relationship on screen. Anchoring the
       transform-origin to the clicked icon's centre is what makes it read as
       the icon opening rather than a card appearing. Falls back to the plain
       centre pop when there is no icon (the dock, a menu, a deep link). */
    var from = openWin.from;
    openWin.from = null;
    if (from) {
      var wr = w.getBoundingClientRect();
      w.style.transformOrigin =
        (from.x - wr.left) + 'px ' + (from.y - wr.top) + 'px';
    } else {
      w.style.transformOrigin = '';
    }
    sfx('open');
    if (app === 'terminal') termIn.focus();
    bearReact(app);
    if (S.icy.reacts[app]) icySay(S.icy.reacts[app]);
  }

  function closeWin(app) {
    var w = win(app);
    if (!w || !w.hasAttribute('data-open')) return;
    if (app === 'terminal' && snakeStop) snakeStop();
    w.setAttribute('data-closing', '');
    sfx('close');
    setTimeout(function () {
      /* reopened inside the 160ms? then this timeout belongs to a window that
         no longer exists. Without the guard it stripped data-open off a window
         that had just been opened, leaving an app the dock says is open and the
         screen does not show. */
      if (!w.hasAttribute('data-closing')) return;
      w.removeAttribute('data-open');
      w.removeAttribute('data-closing');
      w.removeAttribute('data-focus');
      delete w.dataset.slot;              /* the slot is free again */
      var i = stack.indexOf(winKey(app));
      if (i !== -1) stack.splice(i, 1);
      if (stack.length) focusWin(stack[stack.length - 1]);
      renderDock();
    }, 160);
  }

  function renderDock() {
    var host = el('dock-open');
    host.innerHTML = '';
    stack.forEach(function (app) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.innerHTML = iconImg(S.apps[app].icon);
      b.setAttribute('aria-label', S.apps[app].label);
      b.addEventListener('click', function () { focusWin(app); });
      host.appendChild(b);
    });
  }

  /* drag by titlebar, resize by the corner grip, both clamped to the desktop */
  function drag(handle, onMove) {
    handle.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('button')) return;
      e.preventDefault();
      var start = onMove.start(e);
      function move(ev) { onMove.move(ev, start); }
      /* pointercancel, not just pointerup. On touch the browser fires cancel
         when it takes the gesture over for scrolling or a second finger lands,
         and without this the pointermove listener stayed bound to window for
         the rest of the session — one more leaked every cancelled drag. */
      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (onMove.end) onMove.end();
      }
      window.addEventListener('pointercancel', up);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
  }

  /* MAXIMISE. Measured off the furniture, not off the viewport: the menu bar's
     bottom and the dock's top both move between breakpoints, and placeWin()
     already learned this lesson the hard way when 13% of 1440 opened the first
     window on top of the icon grid.

     Geometry goes on the element rather than in a class because dragging and
     resizing write inline left/top/width/height, and a class would have to beat
     them with !important -- at which point restoring means guessing what they
     were. The previous rect is kept on the node and put back verbatim.

     Opt-in and never automatic. A maximised window covers the standee and the
     bear, which are most of the reason to be here. */
  function toggleZoom(w) {
    var btn = w.querySelector('.tlight--zoom');
    if (w.hasAttribute('data-zoom')) {
      var p = w.__prevRect || {};
      ['left', 'top', 'width', 'height', 'right', 'transform'].forEach(function (k) {
        w.style[k] = p[k] || '';
      });
      w.removeAttribute('data-zoom');
      if (btn) {
        btn.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-label', S.win.zoom);
      }
      sfx('tap');
      return;
    }
    w.__prevRect = {
      left: w.style.left, top: w.style.top, width: w.style.width,
      height: w.style.height, right: w.style.right, transform: w.style.transform
    };
    var roof = el('menubar').getBoundingClientRect().bottom;
    var floor = (el('dock') || document.body).getBoundingClientRect().top;
    var pad = 18;
    w.removeAttribute('data-shaded');
    var shade = w.querySelector('.tlight--shade');
    if (shade) shade.setAttribute('aria-pressed', 'false');
    w.style.left = pad + 'px';
    w.style.top = Math.round(roof + pad) + 'px';
    w.style.right = 'auto';
    w.style.transform = 'none';
    w.style.width = Math.round(window.innerWidth - pad * 2) + 'px';
    w.style.height = Math.round(floor - roof - pad * 2) + 'px';
    w.setAttribute('data-moved', '');    /* placeWin must not re-cascade it */
    delete w.dataset.slot;               /* and it no longer holds one */
    w.setAttribute('data-zoom', '');
    if (btn) {
      btn.setAttribute('aria-pressed', 'true');
      btn.setAttribute('aria-label', S.win.unzoom);
    }
    sfx('tap');
  }

  all('.win').forEach(function (w) {
    var app = w.id.slice(2);

    w.addEventListener('pointerdown', function () { if (w.hasAttribute('data-open')) focusWin(app); });

    /* ---- the three lights --------------------------------------------------
       Each is a real verb. The pointerdown stop matters as much as the click
       handler: drag() is bound to the whole .tbar, so without it every press on
       a light also starts dragging the window out from under the cursor. */
    function light(sel, fn) {
      var b = w.querySelector(sel);
      if (!b) return;
      b.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      b.addEventListener('click', function (e) { e.stopPropagation(); fn(b); });
    }
    light('.tlight--close', function () { closeWin(app); });
    light('.tlight--shade', function (b) {
      if (w.hasAttribute('data-zoom')) return;          /* nothing to collapse */
      var on = !w.hasAttribute('data-shaded');
      w.toggleAttribute('data-shaded', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', on ? S.win.expand : S.win.collapse);
      sfx('tap');
    });
    light('.tlight--zoom', function () { toggleZoom(w); });

    /* The title bar itself is the other way in, which is where people already
       double-click. Ignore double-clicks that land on a light: those are two
       fast clicks on a button, and they already did their job twice. */
    w.querySelector('.tbar').addEventListener('dblclick', function (e) {
      if (e.target.closest('.tlight')) return;
      toggleZoom(w);
    });

    drag(w.querySelector('.tbar'), {
      start: function (e) {
        var r = w.getBoundingClientRect();
        w.style.left = r.left + 'px';
        w.style.top = r.top + 'px';
        w.style.right = 'auto';
        w.style.transform = 'none';
        w.setAttribute('data-moved', '');   /* placeWin must not overrule this */
        delete w.dataset.slot;
        return { ox: e.clientX - r.left, oy: e.clientY - r.top, w: r.width };
      },
      move: function (ev, s) {
        w.style.left = clamp(ev.clientX - s.ox, -s.w + 90, window.innerWidth - 90) + 'px';
        w.style.top = clamp(ev.clientY - s.oy, 34, window.innerHeight - 90) + 'px';
      }
    });

    var grip = w.querySelector('.resize');
    if (grip) drag(grip, {
      start: function (e) {
        var r = w.getBoundingClientRect();
        w.style.left = r.left + 'px';
        w.style.top = r.top + 'px';
        w.style.transform = 'none';
        w.style.height = r.height + 'px';
        w.setAttribute('data-resized', '');
        return { x: e.clientX, y: e.clientY, w: r.width, h: r.height, top: r.top };
      },
      move: function (ev, s) {
        w.style.width = clamp(s.w + ev.clientX - s.x, 280, window.innerWidth - 24) + 'px';
        w.style.height = clamp(s.h + ev.clientY - s.y, 160, window.innerHeight - s.top - 24) + 'px';
      }
    });
  });

  /* ==========================================================================
     DESKTOP ICONS — click to open, drag to REORDER. Dragging inserts the icon
     at a new place in the list rather than dropping it at a free coordinate, so
     an icon can only ever sit in a real grid slot. Order is per session by
     design: a reload puts the desk back the way icy left it.
     ========================================================================== */

  var iconHost = el('icons');

  all('#icons .icon').forEach(function (icon) {
    var moved = false;

    icon.addEventListener('pointerdown', function (e) {
      if (e.button !== 0) return;
      moved = false;
      var r = icon.getBoundingClientRect();
      var ox = e.clientX - r.left;
      var oy = e.clientY - r.top;
      var ghost = null;

      function lift() {
        ghost = document.createElement('div');
        ghost.className = 'icon icon--ghost';
        ghost.style.width = r.width + 'px';
        ghost.style.height = r.height + 'px';
        iconHost.insertBefore(ghost, icon);
        icon.style.width = r.width + 'px';
        icon.setAttribute('data-dragged', '');
        iconHost.setAttribute('data-dragging', '');
      }

      /* move the ghost to whichever slot the pointer is closest to */
      function reslot(x, y) {
        var best = null;
        var bestDist = Infinity;
        all('#icons .icon').forEach(function (other) {
          if (other === icon || other === ghost) return;
          var b = other.getBoundingClientRect();
          var d = Math.hypot(x - (b.left + b.width / 2), y - (b.top + b.height / 2));
          if (d < bestDist) { bestDist = d; best = { node: other, rect: b }; }
        });
        if (!best || bestDist > 140) return;
        /* Which half of the neighbour you are on depends on which way the list
           runs. Down the left wall it is the top or bottom half; across the top
           of a slab it is the left or right half, and asking about `y` there
           makes every drop land on the same side of whatever you hovered. */
        var acrossTop = getComputedStyle(iconHost).flexDirection === 'row';
        var after = acrossTop ? x > best.rect.left + best.rect.width / 2
                              : y > best.rect.top + best.rect.height / 2;
        iconHost.insertBefore(ghost, after ? best.node.nextSibling : best.node);
      }

      function move(ev) {
        if (!moved && Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 8) return;
        if (!moved) { moved = true; lift(); }
        icon.style.left = (ev.clientX - ox) + 'px';
        icon.style.top = (ev.clientY - oy) + 'px';
        reslot(ev.clientX, ev.clientY);
      }

      function up() {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        iconHost.removeAttribute('data-dragging');
        if (!moved) return;
        iconHost.insertBefore(icon, ghost);
        ghost.remove();
        icon.removeAttribute('data-dragged');
        icon.style.cssText = '';
        sfx('pick');
      }

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    });

    icon.addEventListener('click', function (e) { if (moved) e.stopImmediatePropagation(); });
  });

  /* ==========================================================================
     JIGGLE — the home grid rearranged the way phones do it. Press and hold,
     everything wobbles, drag one somewhere else, tap done.

     The one structural decision worth writing down: the wobble owns `transform`
     and the reflow owns `left`/`top`. A running CSS animation outranks inline
     style, so a FLIP written with transform would be silently eaten by the
     wobble on every icon it tried to move. Splitting the properties means the
     two never argue. The icon being dragged has its animation switched off, so
     it gets `transform` back for the finger-follow and the lift.
     ========================================================================== */

  var hgrid = el('hgrid');
  var jiggling = false;

  function gridIcons() { return all('#hgrid .icon'); }

  function setJiggle(on) {
    if (jiggling === on) return;
    jiggling = on;
    hgrid.classList.toggle('is-jiggling', on);
    el('jiggle-done').hidden = !on;
    if (on) { haptic(14); sfx('pick'); }
  }

  if (hgrid) (function () {
    var HOLD = 420;                    /* long enough not to fire on a tap */
    var SLOP = 9;                      /* past this it was a scroll, not a hold */
    var drag = null;
    var timer = null;
    var swallowClick = false;

    /* animate everyone except the dragged icon from where they WERE to where
       the reorder just put them */
    function reflow(mutate) {
      var kids = gridIcons();
      var was = kids.map(function (k) { return k.getBoundingClientRect(); });
      mutate();
      kids.forEach(function (k, i) {
        if (drag && k === drag.icon) return;
        var now = k.getBoundingClientRect();
        var dx = was[i].left - now.left, dy = was[i].top - now.top;
        if (!dx && !dy) return;
        k.style.transition = 'none';
        k.style.left = dx + 'px';
        k.style.top = dy + 'px';
        /* two frames: one to commit the jump, one to animate out of it */
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            k.style.transition = '';
            k.style.left = '';
            k.style.top = '';
          });
        });
      });
    }

    function begin(icon, x, y) {
      var r = icon.getBoundingClientRect();
      drag = { icon: icon, ox: x - r.left, oy: y - r.top, x: x, y: y };
      icon.setAttribute('data-lift', '');
      follow(x, y);
    }

    function follow(x, y) {
      var r = drag.icon.getBoundingClientRect();
      /* measured against the icon's own slot, not the last frame, so the
         offset cannot accumulate drift over a long drag */
      var slotX = r.left - (parseFloat(drag.icon.style.getPropertyValue('--jx')) || 0);
      var slotY = r.top - (parseFloat(drag.icon.style.getPropertyValue('--jy')) || 0);
      var dx = x - drag.ox - slotX, dy = y - drag.oy - slotY;
      drag.icon.style.setProperty('--jx', dx + 'px');
      drag.icon.style.setProperty('--jy', dy + 'px');
    }

    function maybeSwap(x, y) {
      var best = null, bestDist = Infinity;
      gridIcons().forEach(function (other) {
        if (other === drag.icon) return;
        var b = other.getBoundingClientRect();
        var d = Math.hypot(x - (b.left + b.width / 2), y - (b.top + b.height / 2));
        if (d < bestDist) { bestDist = d; best = other; }
      });
      if (!best) return;
      var b = best.getBoundingClientRect();
      if (bestDist > b.width * 0.62) return;      /* not committed to a slot yet */
      var kids = gridIcons();
      var after = kids.indexOf(best) > kids.indexOf(drag.icon);
      reflow(function () {
        hgrid.insertBefore(drag.icon, after ? best.nextSibling : best);
      });
      haptic(6);
    }

    function end() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      clearTimeout(timer);
      if (!drag) return;
      drag.icon.removeAttribute('data-lift');
      drag.icon.style.removeProperty('--jx');
      drag.icon.style.removeProperty('--jy');
      drag = null;
      sfx('pick');
    }

    function onMove(e) {
      if (drag) { e.preventDefault(); follow(e.clientX, e.clientY); maybeSwap(e.clientX, e.clientY); return; }
      if (timer && Math.hypot(e.clientX - start.x, e.clientY - start.y) > SLOP) {
        clearTimeout(timer); timer = null;     /* they meant to scroll */
      }
    }

    function onUp() { if (drag) swallowClick = true; end(); }

    var start = { x: 0, y: 0 };

    hgrid.addEventListener('pointerdown', function (e) {
      var icon = e.target.closest('.icon');
      if (!icon || (e.pointerType === 'mouse' && e.button !== 0)) return;
      start.x = e.clientX; start.y = e.clientY;
      swallowClick = false;
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      if (jiggling) { begin(icon, e.clientX, e.clientY); return; }
      timer = setTimeout(function () {
        timer = null;
        setJiggle(true);
        begin(icon, start.x, start.y);
      }, HOLD);
    });

    /* the hold gesture is the browser's text-selection / callout gesture too */
    hgrid.addEventListener('contextmenu', function (e) {
      if (jiggling || timer) e.preventDefault();
    });

    /* capture, so an icon click never reaches the router while rearranging */
    hgrid.addEventListener('click', function (e) {
      if (jiggling || swallowClick) { e.stopImmediatePropagation(); e.preventDefault(); }
      swallowClick = false;
    }, true);

    /* leaving: the pill, or the wallpaper, the two places a thumb lands */
    el('jiggle-done').addEventListener('click', function () { setJiggle(false); });
    el('screen').addEventListener('click', function (e) {
      if (jiggling && !e.target.closest('#hgrid, #jiggle-done')) setJiggle(false);
    });
  }());

  /* ==========================================================================
     PHONE SHELL — apps MOVE the real window body, never a clone, so every app
     stays fully interactive on mobile.
     ========================================================================== */

  var borrowed = null;

  function returnBorrowed() {
    if (!borrowed) return;
    /* put them back in the order they were taken, so the tab strip lands above
       the body again rather than under it */
    borrowed.forEach(function (b) { b.parent.insertBefore(b.node, b.next); });
    borrowed = null;
  }

  /* The phone shell MOVES the real window body rather than cloning it, which is
     the right call — but nothing was watching the boundary it borrows across.
     Rotate a tablet, un-zoom, or drag a window past 700px with an app open and
     the desktop came back with that window empty, its body still parked in a
     now-hidden #appview. Hand it back the moment the shell changes, and reopen
     on the other side so the app follows you across instead of vanishing. */
  var phoneQuery = window.matchMedia('(max-width: 700px)');
  var onShellChange = function () {
    if (!borrowed) return;
    var app = openApp.current;
    closeApp();
    if (app && !onPhone()) openWin(app);
  };
  if (phoneQuery.addEventListener) phoneQuery.addEventListener('change', onShellChange);
  else if (phoneQuery.addListener) phoneQuery.addListener(onShellChange);

  function openApp(app) {
    returnBorrowed();
    var w = win(app);
    /* The phone MOVES the real nodes rather than cloning them. For the tabbed
       window that has to include the tab strip, or the phone shows one panel
       with no way to reach the other two. */
    var parts = [];
    var tabs = w.querySelector('.wtabs');
    if (tabs) parts.push(tabs);
    parts.push(w.querySelector('.wbody'));
    borrowed = parts.map(function (node) {
      return { node: node, parent: w, next: node.nextSibling };
    });
    el('apptitle').textContent = S.apps[app].label;
    parts.forEach(function (node) { el('appbody').appendChild(node); });
    el('appview').setAttribute('data-on', '');
    openApp.current = app;                  /* so a shell change can reopen it */
    if (TABBED[app]) showTab(app); else noteApp(app);
    sfx('open');
    bearReact(app);
    if (S.icy.reacts[app]) phoneToast('icy', S.icy.reacts[app]);
  }

  function closeApp() {
    returnBorrowed();
    el('appview').removeAttribute('data-on');
  }

  el('appback').addEventListener('click', closeApp);
  el('unlock').addEventListener('click', function () {
    el('lock').setAttribute('data-unlocked', '');
    el('home').setAttribute('data-on', '');
    sfx('pet');
  });
  el('phone-close').addEventListener('click', function () {
    closeApp();
    body.removeAttribute('data-preview');
  });

  /* ==========================================================================
     STICKY NOTES — file > new delusion. Click to edit; your notes come back.
     ========================================================================== */

  var notes = read('stickyNote', []);

  function saveNotes() {
    write('stickyNote', all('.sticky').map(function (n) {
      return { text: n.querySelector('.txt').textContent, x: n.style.left, y: n.style.top, tilt: n.style.getPropertyValue('--tilt') };
    }));
  }

  function spawnNote(note) {
    var n = document.createElement('div');
    n.className = 'sticky';
    n.style.left = note.x;
    n.style.top = note.y;
    n.style.setProperty('--tilt', note.tilt);
    n.innerHTML = '<button aria-label="throw it away">✕</button>✿ <span class="txt" contenteditable="true" spellcheck="false"></span>';
    n.querySelector('.txt').textContent = note.text;
    n.querySelector('.txt').addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    n.querySelector('.txt').addEventListener('blur', saveNotes);
    n.querySelector('button').addEventListener('click', function () { n.remove(); saveNotes(); });

    drag(n, {
      start: function (e) {
        var r = n.getBoundingClientRect();
        return { ox: e.clientX - r.left, oy: e.clientY - r.top };
      },
      move: function (ev, s) {
        n.style.left = clamp(ev.clientX - s.ox, 0, window.innerWidth - 160) + 'px';
        n.style.top = clamp(ev.clientY - s.oy, 40, window.innerHeight - 80) + 'px';
      },
      end: saveNotes
    });

    body.appendChild(n);
    return n;
  }

  notes.forEach(spawnNote);

  function newDelusion() {
    spawnNote({
      text: pick(S.delusions),
      x: (20 + Math.random() * 40) + 'vw',
      y: (16 + Math.random() * 40) + 'vh',
      tilt: (Math.random() * 8 - 4).toFixed(1) + 'deg'
    });
    saveNotes();
    sfx('note');
  }

  /* ==========================================================================
     ACHIEVEMENTS — the wall, the riddles and the toasts land in M3. This records
     progress in the meantime so nothing earned now is lost later. It writes the
     same `ach` key the theme gate already reads.

     The placeholder recorder that used to live here was dead for a thousand
     lines — nothing called earn() at module-eval time before the real one was
     assigned, so it never ran once, and it wrote a subtly different shape.
     ========================================================================== */


  /* ==========================================================================
     DIAGNOSIS — /chart writes its latest result here on every completion.
     Never faked: if there is nothing on file, the app just invites you to take it.
     ========================================================================== */

  function renderDiagnosis() {
    var d = read('diag', null);
    var box = el('diag-result');
    if (!d || !d.name) { box.hidden = true; return; }
    box.hidden = false;
    slot('diag-name').textContent = d.name;
    slot('diag-line').textContent = d.line || '';
    slot('diag-when').textContent =
      fmt(S.app.diagWhen, { d: new Date(d.at).toLocaleDateString([], { month: 'short', day: 'numeric' }) });
    slot('diag-orb').hidden = true;
    slot('diag-cta').textContent = S.app.diagAgain;
  }

  /* ==========================================================================
     GUESTBOOK — stamps only, so there is nothing to moderate.

     This header used to say the wall was seeded and the stamp local "until the
     one free-tier table exists". It exists: loadWall() fetches it and gb_sign
     writes it. The real description is the second banner further down.
     ========================================================================== */

  /* An index, not the character. The server maps 0-26 against its own copy of
     the list, so this field cannot carry arbitrary text at all. */
  var stampIndex = 0;
  var stamped = false;

  /* ==========================================================================
     REQUEST QUOTE — copies a brief and opens the dms. Email is the fallback
     because email is the serious-money path.
     ========================================================================== */

  all('.pills.pick').forEach(function (group) {
    /* #folio-filter carries `pills pick` for the styling, but info.js owns its
       behaviour -- it has to, because the chart mounts that window long after
       this loop has run. Both handlers were firing on the desktop: the same
       is-on toggle twice, and two tap sounds on every click. */
    if (group.id === 'folio-filter') return;
    group.addEventListener('click', function (e) {
      var p = e.target.closest('.pill');
      if (!p) return;
      all('.pill', group).forEach(function (x) { x.classList.remove('is-on'); });
      p.classList.add('is-on');
      sfx('tap');
    });
  });

  /* ==========================================================================
     BSOD + CREDITS
     ========================================================================== */

  var creditsTimer = [];

  function rollCredits() {
    var name = read('bearName', null) || 'the bear';
    /* the wordmark is artwork, not type: the same masked treatment the desktop
       logomark uses, so the credits and the chrome cannot drift apart */
    el('credits-roll').innerHTML =
      '<span class="logomark credits__mark" role="img" aria-label="icybearOS">' +
        '<span class="logomark__art" aria-hidden="true"></span>' +
      '</span><br>' + S.credits.roles.map(function (r) {
      return '<i>' + r[0] + '</i>' + fmt(r[1], { bear: name });
    }).join('<br>') + '<br><br>✦';
    var c = el('credits');
    c.removeAttribute('data-fade');
    c.setAttribute('data-open', '');
    chime();
    /* The roll is a 24s animation with `forwards`, so it used to park on its
       last frame and sit there until someone remembered to click. It ends
       itself now: fade at the bottom of the scroll, gone a second later. */
    creditsTimer.forEach(clearTimeout);
    creditsTimer = [
      setTimeout(function () { c.setAttribute('data-fade', ''); }, 24200),
      setTimeout(closeOverlays, 25300)
    ];
  }

  el('bsod').addEventListener('click', closeOverlays);
  el('credits').addEventListener('click', closeOverlays);

  /* ==========================================================================
     THE SIX PILLARS — one taxonomy, three surfaces: the desktop spec sheet,
     the skill tree, and read_me. Change S.specs.rows and all three follow.

     The renderers themselves, and the contact glyph table, live in info.js,
     which the chart loads to mount this same window. One copy of each, so the
     two pages cannot end up describing her work differently.
     ========================================================================== */

  /* ==========================================================================
     GUESTBOOK — a real wall, backed by one table.

     It was a wall of one for its entire life: `guests` started empty on every
     load and only ever received this browser's own stamp out of localStorage,
     so nobody ever saw anybody else's. Five strings promised a social feature
     that could not exist, and a 24-per-page pager never rendered a second page.

     The anon key below is publishable by design. It is bounded entirely by row
     level security, which grants SELECT on four columns of non-hidden rows and
     nothing else; every write goes through the Edge Function, which is the only
     thing holding service_role. Assume the network fails: the app still opens.
     ========================================================================== */

  var PAGE = 50;
  var guests = [];
  var guestTotal = 0;
  var wallState = 'loading';          /* loading | ok | offline */

  /* Byte-identical to the Edge Function's copy. Duplicated on purpose -- there
     is no build step -- and validation.test.js fails if the two ever drift.
     This whole feature exists because a client-side assumption never matched
     the server, so that assertion is the point. */
  var NAME_RE = /^[\p{L}\p{N} _.@-]+$/u;
  var NAME_ALNUM = /[\p{L}\p{N}]/u;
  var NAME_MAX = 16;

  function graphemeLen(str) {
    /* .length counts UTF-16 code units, which miscounts CJK and decomposed
       accents. Segmenter counts what a person would call a character. */
    try {
      return Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' })
        .segment(str)).length;
    } catch (e) { return Array.from(str).length; }
  }

  function tidyName(raw) {
    return String(raw || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  }

  /* The same order the server uses. Normalise first or every later check can be
     walked past. Returns a fault key, or null when the name is fine. */
  function nameFault(raw) {
    var n = tidyName(raw);
    if (!n) return 'empty';
    if (graphemeLen(n) > NAME_MAX) return 'long';
    if (!NAME_RE.test(n) || !NAME_ALNUM.test(n)) return 'charset';
    if (isBlocked(n)) return 'rejected';
    return null;
  }

  /* Someone will try. Three passes, and the ORDER of normalisation in each is
     the whole design.

     WHY IT CHANGED. The first version matched every blocked word as a SUBSTRING
     of a fully normalised string, and normalising collapses adjacent repeats --
     so `nigger` became `niger`, and `niger` is inside `nigeria`. Measured
     against a 232,000 word dictionary, that build rejected 731 ordinary words
     as names, including Nigeria, Nigerian, Shiite, Ashkenazi, Hitchcock,
     Babcock, Peacock, Dickens, Dickinson, Vandyke, spice, grape, cocktail,
     cockpit, cockroach, torpedo, princely and pussycat. A bear name is what
     os.js calls the emotional contract, and a guestbook handle is how someone
     signs their name; telling a Nigerian visitor their name is "rejected" is a
     worse failure than letting a compound slur through to a wall that has a
     one-click hide and a Telegram ping on every signature.

     THE THREE PASSES.
       1. WHOLE-STRING and PER-WORD equality against the collapsed form. This is
          what catches the direct hit and every padding, leet and spacing trick:
          `n i g g e r`, `n1gg3r` and `niiigger` all collapse to `niger`, which
          equals the collapsed blocklist entry. Equality, not substring, is why
          `nigeria` and `spice` now survive -- they are not equal to anything.
       2. SUBSTRING, but only for SEVERE entries and only against the UNcollapsed
          form. Runs are kept here on purpose: `niggerlover` contains `nigger`,
          while `nigerian` does not. That one difference is what makes the
          compound catchable without taking Nigeria down with it.
       3. The LOOSE regex below, unchanged, for punctuation standing in for a
          letter (`n.gger`), which no amount of stripping can see.

     Same 232k dictionary after: 24 false positives, all of them either archaic
     (`niggardly`, `snigger`) or genuinely slur-adjacent, and zero misses across
     the evasion set. test/blocklist.test.js holds both numbers.

     Known and accepted: `niger` the country collapses to the same form as the
     slur and is rejected; `Nigeria` and `Nigerian` are fine. `fvck` is missed
     because `v` is a real letter and mapping it would break real names.

     This runs client-side as a courtesy. The identical logic runs in the edge
     function, and test/blocklist.test.js fails if the three copies drift. */
  var LEET = { '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '0': 'o',
               '5': 's', '$': 's', '7': 't', '+': 't', '8': 'b', '9': 'g', '(': 'c' };

  var BLOCK_RAW = ['nigger', 'nigga', 'faggot', 'fag', 'retard', 'kike', 'spic', 'chink',
                   'tranny', 'dyke', 'gook', 'beaner', 'wetback', 'raghead', 'towelhead',
                   'rape', 'cunt', 'whore', 'slut', 'bitch', 'fuck', 'shit',
                   'dick', 'cock', 'pussy', 'nazi', 'hitler', 'kys', 'pedo', 'incel'];

  /* Pass 2's list. An entry earns a place here when an embedded match is worth a
     rare false positive: racial and homophobic slurs, where "iamanigger" must
     not pass. Deliberately NOT `fuck`, `shit`, `dick` and friends -- those are
     four letters, they appear inside hundreds of ordinary words, and a wall
     that lets "fuckyou" through to be hidden by hand is the better trade. */
  var SEVERE = ['nigger', 'nigga', 'faggot', 'kike', 'tranny',
                'wetback', 'raghead', 'towelhead', 'beaner'];

  /* letters only, accents folded, leet folded. NFKC first, matching the edge
     function: it folds fullwidth characters to ASCII, so the fullwidth spelling
     of a slur cannot walk past a list written in ASCII. */
  function flatten(s) {
    var t = (s || '').toLowerCase();
    try { t = t.normalize('NFKC').toLowerCase(); } catch (e) { /* older engine */ }
    try { t = t.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (e) { /* older engine */ }
    t = t.split('').map(function (c) { return LEET[c] || c; }).join('');
    return t.replace(/[^a-z]/g, '');
  }

  /* flatten, then collapse runs. Kept as its own name because pass 2 needs the
     uncollapsed form and mixing the two up is exactly how this broke. */
  function normalize(s) { return flatten(s).replace(/(.)\1+/g, '$1'); }

  var BLOCK = BLOCK_RAW.map(normalize);

  /* Third pass, for the trick normalising cannot see: a punctuation mark
     standing in for a letter. `n.gger` survives pass one because stripping the
     dot leaves `ngger`, which is not `niger`. So each blocked word also becomes
     a regex where separators are allowed anywhere and a vowel may be replaced
     outright by punctuation. */
  var UNLEET = { a: 'a4@', e: 'e3', i: 'i1!|', o: 'o0', u: 'u',
                 s: 's5$', t: 't7+', b: 'b8', g: 'g9', c: 'c(' };

  function looseRe(word) {
    var sep = '[^a-z0-9]*';
    var pattern = word.split('').map(function (ch) {
      var cls = (UNLEET[ch] || ch).replace(/[$()|]/g, '\\$&');
      return 'aeiou'.indexOf(ch) !== -1 ? '(?:[' + cls + ']|[^a-z0-9])' : '[' + cls + ']';
    }).join(sep);
    return new RegExp(pattern);
  }

  /* SEVERE only, for the same reason pass 2 is: this regex is an unanchored
     substring match with separators allowed between every letter, so building
     it from the full list put `cock` back inside `peacock` and `spic` back
     inside `spice` -- undoing the entire fix one pass later. Restricted here it
     still catches `n.gger`, which is the trick it exists for. */
  var LOOSE = SEVERE.map(looseRe);

  /* Check the ORIGINAL input. Sanitising first was the bug: the url stripper ate
     `.gger` out of `n.gger`, and the character allowlist threw away the very
     accents and symbols that were the evasion. Check first, sanitise second. */
  function isBlocked(s) {
    var whole = normalize(s);
    if (BLOCK.indexOf(whole) !== -1) return true;

    var words = String(s || '').split(/[^0-9A-Za-z@$!|+(]+/);
    for (var i = 0; i < words.length; i++) {
      if (words[i] && BLOCK.indexOf(normalize(words[i])) !== -1) return true;
    }

    var run = flatten(s);                 /* runs kept: nigerian is not nigger */
    for (var k = 0; k < SEVERE.length; k++) {
      if (run.indexOf(SEVERE[k]) !== -1) return true;
    }

    var low = String(s || '').toLowerCase();
    return LOOSE.some(function (re) { return re.test(low); });
  }

  function stampDate(iso) {
    var d = new Date(iso);
    var now = new Date();
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }).toLowerCase() +
      (d.getFullYear() === now.getFullYear() ? '' : ', ' + d.getFullYear());
  }

  function loadWall(more) {
    if (!backendUp()) { wallState = 'offline'; renderWall(); return; }
    var from = more ? guests.length : 0;
    fetch(GB.url + '/rest/v1/guestbook?select=id,name,stamp,created_at' +
          '&order=created_at.desc&offset=' + from + '&limit=' + PAGE, {
      headers: { apikey: GB.key, Authorization: 'Bearer ' + GB.key,
                 Prefer: 'count=exact' }
    }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      /* PostgREST returns the true total in Content-Range: 0-49/312 */
      var total = (r.headers.get('content-range') || '').split('/')[1];
      if (total && total !== '*') guestTotal = +total;
      return r.json();
    }).then(function (rows) {
      guests = more ? guests.concat(rows) : rows;
      wallState = 'ok';
      renderWall();
    }, function () {
      wallState = 'offline';
      renderWall();
    });
  }

  function renderWall() {
    var wall = el('wall');
    var count = slot('wall-count');

    if (wallState === 'loading') {
      wall.innerHTML = '<p class="wall-empty"></p>';
      wall.firstChild.textContent = S.app.wallLoading;
      count.textContent = '';
      el('wall-pager').innerHTML = '';
      return;
    }

    /* Degraded, not broken. If the table is unreachable the app still opens and
       still shows your own stamp; the guestbook must never block the OS. */
    if (wallState === 'offline') {
      var own = read('guestStamp', null);
      guests = own ? [own] : [];
      count.textContent = '';
    } else {
      count.textContent = guestTotal
        ? fmt(S.app.guestCount, { n: guestTotal, s: guestTotal === 1 ? '' : 's' })
        : '';
    }

    if (!guests.length) {
      wall.innerHTML = '<p class="wall-empty"></p>';
      wall.firstChild.textContent =
        wallState === 'offline' ? S.app.wallOffline : S.app.guestEmpty;
      el('wall-pager').innerHTML = '';
      return;
    }

    wall.innerHTML = guests.map(function (g) {
      return '<div class="gstamp' + (g.fresh ? ' gstamp--fresh' : '') + '">' +
        '<div class="gstamp__e"></div><div class="gstamp__n"></div>' +
        '<div class="gstamp__d"></div></div>';
    }).join('');

    /* Every field goes in as text, never as markup. These names come from
       strangers now, so textContent is the difference between a safe wall and
       a stored payload running in every visitor's browser. */
    all('#wall .gstamp').forEach(function (node, i) {
      var g = guests[i];
      node.querySelector('.gstamp__e').textContent = g.stamp || g.e || '';
      node.querySelector('.gstamp__n').textContent = g.name || g.n || '';
      node.querySelector('.gstamp__d').textContent = stampDate(g.created_at || g.at);
    });

    /* one button, not a pager: it reads right at five entries or five hundred */
    el('wall-pager').innerHTML = '';
    if (wallState === 'ok' && guests.length < guestTotal) {
      var b = document.createElement('button');
      b.setAttribute('data-more', '');
      b.textContent = S.app.wallMore;
      el('wall-pager').appendChild(b);
    }
  }

  el('wall-pager').addEventListener('click', function (e) {
    if (!e.target.closest('[data-more]')) return;
    sfx('pick');
    loadWall(true);
  });

  (function buildStampPicker() {
    var picker = el('stamp-picker');
    picker.innerHTML = S.app.stamps.map(function (e, i) {
      return '<button class="stk-pick' + (i === 0 ? ' is-on' : '') +
        '" data-i="' + i + '" aria-label="stamp ' + e + '">' + e + '</button>';
    }).join('');
    picker.addEventListener('click', function (ev) {
      var b = ev.target.closest('.stk-pick');
      if (!b) return;
      all('.stk-pick').forEach(function (x) { x.classList.remove('is-on'); });
      b.classList.add('is-on');
      stampIndex = +b.dataset.i;
      sfx('tap');
    });
  })();

  /* localStorage only records THAT you signed, for the double-submit guard.
     The wall itself is the table's, which is the entire point. */
  /* the lock screen invites you to take the quiz; once taken the invitation is
     stale, and a notification that never clears is just nagging */
  (function () {
    var d = slot('lock-diag');
    if (d && read('diag', null)) d.hidden = true;
  })();

  if (read('guestStamp', null)) stamped = true;
  loadWall();

  /* tell them while they type, not after they have composed a name */
  el('guest-name').addEventListener('input', function () {
    var hint = slot('guest-hint');
    if (!hint) return;
    var fault = this.value ? nameFault(this.value) : null;
    hint.textContent = (fault && fault !== 'empty') ? (S.app.guestErr[fault] || '') : '';
  });

  /* ==========================================================================
     THE CRASH — the desktop comes apart, the tube snaps on, the machine tries
     to recover and gives up. Dismissing collapses it to a line, then a dot.
     ========================================================================== */

  var recoverTimers = [];

  function bsod() {
    var b = el('bsod');
    b.removeAttribute('data-closing');
    slot('bsod-trace').textContent = S.bsod.trace.join('\n');
    b.querySelector('.bsod__t1').setAttribute('data-text', S.bsod.line1);
    var out = slot('bsod-recover');
    out.textContent = fmt(S.bsod.recover, { n: 13 });

    body.setAttribute('data-glitch', '');
    sfx('crash');

    setTimeout(function () {
      body.removeAttribute('data-glitch');
      b.setAttribute('data-open', '');
      b.setAttribute('aria-hidden', 'false');
      sfx('bsod');
      recoverTimers = [
        setTimeout(function () { out.textContent = fmt(S.bsod.recover, { n: 33 }); }, 1500),
        setTimeout(function () { out.textContent = S.bsod.gaveUp; }, 3100)
      ];
    }, 700);
  }

  function closeOverlays() {
    var b = el('bsod');
    creditsTimer.forEach(clearTimeout);
    creditsTimer = [];
    el('credits').removeAttribute('data-open');
    el('credits').removeAttribute('data-fade');
    recoverTimers.forEach(clearTimeout);
    recoverTimers = [];
    if (!b.hasAttribute('data-open') || b.hasAttribute('data-closing')) return;
    b.setAttribute('data-closing', '');
    setTimeout(function () {
      b.removeAttribute('data-open');
      b.removeAttribute('data-closing');
      b.setAttribute('aria-hidden', 'true');
    }, 430);
  }

  /* ==========================================================================
     TERMINAL — history, a verb+target parser so nothing on `ls` is inert,
     and a help that lies slightly.
     ========================================================================== */

  var term = el('term');
  var termIn = el('term-in');
  var cmdHistory = [];   /* NOT `history`: that shadowed window.history for the
     entire IIFE, so any future pushState would have operated on a list of
     terminal commands. */
  var histAt = -1;
  var uptimeShown = read('uptimeShown', false);

  function say(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    term.appendChild(d);
    term.scrollTop = term.scrollHeight;
    return d;
  }

  say(S.term.greet);

  /* folders answer to cd, files answer to cat, and each knows what it is */
  var FS = {
    'bags': { kind: 'dir', cd: S.term.bags, ls: S.term.bagsLs },
    'secrets': { kind: 'dir', cd: S.term.secrets, ls: S.term.secrets },
    'grass': { kind: 'dir', cd: S.term.grass, ls: 'empty. as expected.' },
    'icy.txt': { kind: 'file', cat: S.term.icytxt },
    'delusions.txt': { kind: 'file', cat: S.term.delusions },
    '.feelings': { kind: 'file', cat: S.term.feelings, cd: S.term.feelingsCd, earn: 'feel' }
  };

  function own(obj, key) { return Object.prototype.hasOwnProperty.call(obj, key); }

  function runFs(verb, target) {
    var name = target.replace(/\/+$/, '');
    if (!own(FS, name)) return false;
    var node = FS[name];
    if (verb === 'cd') {
      say(node.kind === 'file' ? (node.cd || fmt(S.term.isFile, { t: target })) : node.cd);
    } else if (verb === 'cat') {
      if (node.kind === 'dir') say(fmt(S.term.isFolder, { t: target }));
      else { say(node.cat); if (node.earn) earn(node.earn); }
    } else if (verb === 'ls') {
      say(node.kind === 'dir' ? node.ls : fmt(S.term.isFile, { t: target }));
    } else {
      say(node.kind === 'dir' ? fmt(S.term.isFolder, { t: target }) : fmt(S.term.isFile, { t: target }));
    }
    return true;
  }

  function halos(n, glyph) {
    for (var i = 0; i < n; i++) {
      var h = document.createElement('div');
      h.className = 'halo';
      h.textContent = glyph;
      h.style.left = (Math.random() * 100) + 'vw';
      h.style.animationDuration = (1.6 + Math.random() * 2.4) + 's';
      h.style.animationDelay = (Math.random() * 1.2) + 's';
      body.appendChild(h);
      setTimeout(function (node) { return function () { node.remove(); }; }(h), 5200);
    }
  }

  /* The score the board would take, and whether it has already taken it. Held
     in memory on purpose: a score you did not just play is not yours to sign,
     and reloading the page should not hand you a second chance at the same
     number. */
  var lastScore = 0;
  var scoreSigned = false;

  /* One block, not ten lines, so it reads as a cabinet's high-score table
     instead of ten things the terminal happened to print. The leader row is
     the only decorated one: an arcade board has exactly one champion. */
  function drawBoard(rows) {
    if (!rows.length) { say(S.term.scoresEmpty); return; }
    var mine = read('snakeBest', 0);
    var html = '<div class="hiscore"><b class="hiscore__head">' +
               S.term.scoresHead + '</b><ol class="hiscore__list">';
    rows.slice(0, 10).forEach(function (r, i) {
      html += '<li' + (i === 0 ? ' class="is-top"' : '') + '>' +
              '<i>' + (i + 1) + '</i>' +
              '<span>' + escapeHtml(r.name) + '</span>' +
              '<em>' + (typeof r.score === 'number' ? r.score : 0) + '</em></li>';
    });
    var node = say(html + '</ol>' +
        (mine ? '<b class="hiscore__you">your best ' + mine + '</b>' : '') +
        '</div>');
    /* Ten rows are taller than the terminal, and say() has just scrolled to the
       bottom -- which puts the heading off the top of a board you asked to see.
       Anchor on the board instead, and let the reader scroll DOWN through the
       ranking the way a board is read. */
    term.scrollTop += node.getBoundingClientRect().top -
                      term.getBoundingClientRect().top - 6;
  }

  function loadBoard() {
    if (!backendUp()) { say(S.term.scoresOffline); return; }
    fetch(GB.url + '/rest/v1/snake_score?select=name,score,created_at' +
          '&order=score.desc,created_at.asc&limit=10',
          { headers: { apikey: GB.key, Authorization: 'Bearer ' + GB.key } })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
      .then(drawBoard, function () { say(S.term.scoresOffline); });
  }

  function signBoard(rawName) {
    if (!lastScore) { say(S.term.snakeNoScore); return; }
    if (scoreSigned) { say(S.term.snakeAlready); return; }
    if (!backendUp()) { say(S.term.scoresOffline); return; }
    var fault = nameFault(rawName);
    if (fault) { say('<span class="term__err">' +
      (S.term.scoreErr[fault] || S.term.scoreErr.rejected) + '</span>'); return; }

    scoreSigned = true;                    /* optimistic, released on failure */
    say(S.term.snakeSigning);
    fetch(GB.url + '/functions/v1/snake-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 apikey: GB.key, Authorization: 'Bearer ' + GB.key },
      body: JSON.stringify({ name: tidyName(rawName), score: lastScore })
    }).then(function (r) {
      return r.json().then(function (j) { return { ok: r.ok, body: j }; },
                           function () { return { ok: false, body: {} }; });
    }).then(function (res) {
      if (!res.ok || !res.body.ok) {
        scoreSigned = false;
        say('<span class="term__err">' +
            (S.term.scoreErr[res.body.error] || S.term.scoreErr.rejected) + '</span>');
        return;
      }
      sfx('unlock');
      say(res.body.rank === 1 ? S.term.snakeSignedTop
                              : fmt(S.term.snakeSigned, { r: res.body.rank }));
      loadBoard();
    }, function () {
      scoreSigned = false;
      say(S.term.scoresOffline);
    });
  }

  var COMMANDS = {
    'scores': function () { loadBoard(); },
    'sign': function () { say(S.term.snakeNoScore); },
    'gm': function () {
      var h = new Date().getHours();
      say(h < 5 ? fmt(S.term.gmLate, { h: h === 0 ? 12 : h }) : S.term.gm);
    },
    'gn': function () {
      var h = new Date().getHours();
      if (h >= 21 || h < 7) {
        say(S.term.gn);
        earn('gn');
        setTimeout(function () { el('gn').setAttribute('data-open', ''); }, 700);
      } else say(S.term.gnDay);
    },
    /* was `1246 + visits.count`: an invented base plus THIS browser's refresh
       count, printed as though it were a real visitor number. */
    'whoami': function () { say(fmt(S.term.whoami, { n: visits.count })); },
    'ls': function () { say(S.term.ls); },
    'ls -a': function () { say(S.term.lsa); },
    'help': function () {
      say(S.term.help);
      say(S.term.help2);
      say('<span class="term__hint">' + S.term.helpMore + '</span>');
    },
    'clear': function () { term.innerHTML = ''; say(S.term.clear); },
    'diagnose': function () { say(pick(S.term.diagnose)); },
    'sudo hire icybear': function () {
      say(S.term.hire);
      /* opened on the gesture, not after a beat. Safari drops user activation
         across a timer, so the 600ms pause silently blocked the tab -- and it
         never bought the pause it was for, since a new tab steals focus the
         moment it opens. */
      window.open(S.contact.x, '_blank', 'noopener');
    },
    'rm -rf bags': function () { say(S.term.rmBags); },
    'format bags': function () { say(S.term.formatBags); },
    'matrix': function () { say(S.term.matrix); halos(20, '✦'); },
    'crash': function () { say(S.term.crash); earn('crash'); setTimeout(bsod, 400); },
    'credits': rollCredits,
    'snake': function () { startSnake(); },
    'iddqd': function () { say(S.term.iddqd); },
    'bells': function () { say(S.term.bells); },
    /* `hey` and `game` are things people type on a whim, which is the point:
       the best easter egg is the one you fall into rather than hunt for. */
    'hey': function () { say(S.term.hey); },
    'game': function () { say(S.term.game); },
    'coffee': function () { say(S.term.coffee); },
    'water': function () { hydrationCheck(true); say(S.icy.water.ask); },
    'wumpa': function () { say(S.term.wumpa); },

    /* the only cheat that does something to the machine rather than to the
       transcript. the shake is on <body>, so the whole OS moves at once. */
    'fus ro dah': function () {
      say('<b>' + S.term.shout + '</b>');
      sfx('shout');
      body.classList.add('shout');
      setTimeout(function () { body.classList.remove('shout'); }, 620);
      setTimeout(function () { say(S.term.shoutAfter); }, 700);
    },
    'xyzzy': function () { say(S.term.xyzzy); },
    'hesoyam': function () { say(S.term.hesoyam); },
    'uptime': function () {
      var m = Math.max(1, Math.round((Date.now() - BOOT_AT) / 60000));
      say(fmt(S.term.uptime, { n: m, s: m > 1 ? 's' : '' }));
      if (!uptimeShown) {
        uptimeShown = true;
        write('uptimeShown', true);
        renderMood();
        toast(S.term.uptimeUnlocked, '✦');
      }
    },
    'birthday': function () {
      var name = read('bearName', null);
      say(name ? fmt(S.term.birthday, { name: name }) : S.term.birthdayNone);
    },
    'pet': function () {
      var name = read('bearName', null);
      say(name ? fmt(S.term.petNamed, { name: name }) : S.term.petNameless);
    }
  };

  function runCommand(raw) {
    var c = raw.trim().toLowerCase();
    if (!c) return;

    /* `sign` is the one command whose argument is a person's name, so it reads
       the RAW input. Everything else is lowercased for matching, which would
       otherwise put Mochi on a public board as mochi. */
    var rawParts = raw.trim().split(/\s+/);
    if (rawParts[0].toLowerCase() === 'sign' && rawParts.length > 1) {
      signBoard(rawParts.slice(1).join(' '));
      return;
    }
    /* hasOwnProperty, not truthiness: typing `__proto__` returns
       Object.prototype, which is truthy and not callable, and `constructor`
       returns a function that IS callable and should not be. Same reason the
       filesystem lookup below is guarded. */
    if (own(COMMANDS, c)) { COMMANDS[c](); return; }

    var parts = c.split(/\s+/);
    var verb = parts[0];
    var target = parts.slice(1).join(' ');

    if (verb === 'pet' && target) { COMMANDS.pet(); return; }
    if (verb === 'cd' && (target === '..' || target === '~' || target === '')) { say(S.term.home); return; }
    if (target && runFs(verb, target)) return;
    if (runFs('', c)) return;
    say('<span class="term__err">' + S.term.unknown + '</span>');
  }

  termIn.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!cmdHistory.length) return;
      histAt = Math.max(0, (histAt < 0 ? cmdHistory.length : histAt) - 1);
      termIn.value = cmdHistory[histAt];
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histAt < 0) return;
      histAt += 1;
      if (histAt >= cmdHistory.length) { histAt = -1; termIn.value = ''; }
      else termIn.value = cmdHistory[histAt];
      return;
    }
    if (e.key !== 'Enter') return;
    var raw = termIn.value;
    termIn.value = '';
    if (raw.trim()) cmdHistory.push(raw.trim());
    histAt = -1;
    say(S.term.prompt + escapeHtml(raw));
    sfx('key');
    runCommand(raw);
  });

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ==========================================================================
     SNAKE — while it is running it owns the keyboard: the input goes readonly
     and blurs, so nothing you type to steer echoes into the terminal.
     ========================================================================== */

  var snakeOn = false;
  var snakeStop = null;      /* set while a game is live; see closeWin */

  function startSnake() {
    if (snakeOn) return;
    snakeOn = true;
    say(S.term.snakeStart);

    var cv = document.createElement('canvas');
    cv.id = 'snake';
    cv.width = 240;
    cv.height = 160;
    term.appendChild(cv);
    term.scrollTop = term.scrollHeight;

    termIn.readOnly = true;
    termIn.blur();

    var ctx = cv.getContext('2d');
    if (!ctx) {           /* no canvas here. give the keyboard straight back. */
      cv.remove();
      snakeOn = false;
      termIn.readOnly = false;
      say(S.term.unknown);
      return;
    }

    var snake = [[6, 5], [5, 5], [4, 5]];
    var dir = [1, 0];
    var berry = [12, 5];
    var score = 0;

    function place() { berry = [1 + Math.floor(Math.random() * 28), 1 + Math.floor(Math.random() * 18)]; }
    /* read once per game, from the live palette: the board used to be painted
       in base-theme colours whichever of the five you were wearing */
    var skin = {
      board: cssVar('--os-ink') || '#150f2e',
      berry: cssVar('--os-accent') || '#e07bb8',
      body: cssVar('--t-deco') || '#b99df0'
    };
    function draw() {
      ctx.fillStyle = skin.board;
      ctx.fillRect(0, 0, 240, 160);
      ctx.fillStyle = skin.berry;
      ctx.fillRect(berry[0] * 8, berry[1] * 8, 8, 8);
      snake.forEach(function (s, i) {
        ctx.fillStyle = i ? skin.body : '#fff';
        ctx.fillRect(s[0] * 8, s[1] * 8, 8, 8);
      });
    }

    var ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    function onKey(e) {
      var d = ARROWS[e.key];
      if (!d) return;
      e.preventDefault();
      /* only a REAL turn makes a sound. Holding a key repeats the event and
         pressing back into your own neck is refused above, and neither of those
         is a turn -- ticking on them would make the sound meaningless. */
      if (d[0] !== -dir[0] || d[1] !== -dir[1]) {
        if (d[0] !== dir[0] || d[1] !== dir[1]) sfx('turn');
        dir = d;
      }
    }
    window.addEventListener('keydown', onKey, true);

    var tickId;
    /* one teardown, so closing the window mid-game gives the keyboard back and
       leaves the latch down. Without it the game kept ticking against a hidden
       canvas and no later snake could ever start. */
    snakeStop = function () {
      clearInterval(tickId);
      window.removeEventListener('keydown', onKey, true);
      snakeOn = false;
      snakeStop = null;
      termIn.readOnly = false;
      cv.remove();
    };

    tickId = setInterval(function () {
      var head = [snake[0][0] + dir[0], snake[0][1] + dir[1]];
      var dead = head[0] < 0 || head[0] > 29 || head[1] < 0 || head[1] > 19 ||
        snake.some(function (s) { return s[0] === head[0] && s[1] === head[1]; });

      if (dead) {
        clearInterval(tickId);
        window.removeEventListener('keydown', onKey, true);
        snakeOn = false;
        snakeStop = null;
        termIn.readOnly = false;
        sfx('bonk');
        say(fmt(S.term.snakeOver, {
          n: score,
          verdict: score >= 10 ? S.term.snakeGood : score >= 5 ? S.term.snakeOk : S.term.snakeBad
        }));
        /* THE LAST FIVE PERCENT. Snake had no high score, no persistence and no
           board -- a finished toy with the ending missing. The personal best is
           local and always works; the wall needs the backend and says so by
           simply not offering when it is not there. */
        if (score > 0) {
          var best = read('snakeBest', 0);
          if (typeof best !== 'number' || !isFinite(best) || best < 0) best = 0;
          if (score > best) { write('snakeBest', score); say(S.term.snakeNewBest); }
          else say(fmt(S.term.snakeBest, { n: best }));
          lastScore = score;
          scoreSigned = false;
          if (backendUp()) say('<span class="term__hint">' + S.term.snakeSign + '</span>');
        }
        setTimeout(function () { cv.remove(); }, 2400);
        return;
      }

      snake.unshift(head);
      if (head[0] === berry[0] && head[1] === berry[1]) {
        score += 1;
        sfx('nom', Math.min(12, score - 1));   /* a semitone a berry, one octave */
        place();
      }
      else snake.pop();
      draw();
    }, 140);

    draw();
  }

  /* ==========================================================================
     THE BEAR

     Positive-only memory, per decision 6d: it is never sad because you left, it
     never guilt-trips, it never counts a streak. It is pleased to see you.

     State lives on <body>, so both shells' bears are always doing the same
     thing without either one owning the other. Only position differs.
     ========================================================================== */

  var bearName = read('bearName', null);
  var bearState = 'idle';
  var bearBusy = 0;          /* timestamp until which a set state is protected */
  /* Persisted, not in memory. Four feeds and a refresh used to reset it
     silently, so feed5 was only winnable by someone who fed the bear five times
     without ever reloading. `seasons` and `every` were fixed for the same
     reason; this one was missed because the counter never left this scope. */
  var fedCount = read('fed', 0);
  if (typeof fedCount !== 'number' || !isFinite(fedCount) || fedCount < 0) fedCount = 0;
  var petIndex = 0;
  var playIndex = 0;
  var feedIndex = 0;

  function bearSay(text, ambient) {
    all('[data-slot^="bear-say"]').forEach(function (node) {
      node.setAttribute('aria-live', ambient ? 'off' : 'polite');
      node.textContent = text;
      node.setAttribute('data-show', '');
    });
    clearTimeout(bearSay.t);
    bearSay.t = setTimeout(function () {
      all('[data-slot^="bear-say"]').forEach(function (n) { n.removeAttribute('data-show'); });
    }, 2900);
    chirp();
  }

  /* the Navi rule: it only makes a sound when a bubble actually opens */
  function chirp() {
    sfx('chirp');
  }

  function setBear(state, holdMs) {
    bearState = state;
    body.dataset.bear = state;
    if (holdMs) {
      bearBusy = Date.now() + holdMs;
      setTimeout(function () { if (Date.now() >= bearBusy) restBear(); }, holdMs);
    }
  }

  /* what the bear does when nothing else is happening depends on the weather */
  function restBear() {
    var m = effMode();
    if (m === 'night') return setBear('sleep');
    if (m === 'rain') return setBear('sad');
    if (m === 'snow') return setBear('happy');
    setBear('idle');
  }

  function bearIsFree() { return Date.now() >= bearBusy && effMode() !== 'night'; }

  function setBearName(name) {
    bearName = name;
    write('bearName', name);
    if (!read('bearNamedAt', null)) write('bearNamedAt', new Date().toISOString());
    all('[data-slot^="bear-plate"]').forEach(function (n) { n.textContent = name || S.bear.plate; });
    /* Sender and message are separate: the name belongs in the FROM line, not
       inside the text. It used to show "the bear" as the sender and then
       "{name}: sup twin" as the body, so a named bear announced itself twice. */
    var who = slot('bear-notif-who');
    if (who) who.textContent = name || S.icy.lockWho;
    var notif = document.querySelector('[data-fill="bear-notif"]');
    if (notif) notif.textContent = name ? S.icy.lockNotif : S.icy.lockNotifAnon;
  }

  setBearName(bearName);
  restBear();

  /* ---- wandering: CSS moves it, so there is no rAF loop running all day ---- */

  var deskBear = el('bear-desk');
  var bearX = window.innerWidth * 0.38;
  var bearJob = false;       /* on a task, and not to be wandered off it */
  var SPEED = 0.055;         /* px per ms */

  /* WHERE THE FLOOR IS. The bear wanders a band of desk and the snowman gets
     built in the same band. On the desktop that band is a fraction of the
     viewport, 24% to 60%, and the fraction works because it describes the
     desktop's composition: it starts past the icon column on the left and stops
     short of icy on the right.

     A portrait tablet has neither of those walls where the fraction thinks they
     are. Icy stands at the bottom right of a narrow screen, so 24-60% of it IS
     her -- the bear walked out across her shins and stayed there, and on a
     snowy day it built an entire snowman inside her.

     So on a slab the band is measured off her real left edge rather than
     guessed at. It has to be measured: her width is a function of the pose, the
     viewport height and the theme, and a percentage knows about none of them. */
  function floorBand() {
    if (!onTablet()) {
      return { lo: window.innerWidth * 0.24, hi: window.innerWidth * 0.60 };
    }
    var st = el('standee');
    var wall = st ? st.getBoundingClientRect().left : 0;
    /* Before the pose has decoded she is as wide as her caption and no wider,
       which would hand the bear most of the desk and then take it back a second
       later. Anything implausible falls back to the fraction. */
    if (!wall || wall > window.innerWidth * 0.86) wall = window.innerWidth * 0.62;
    var lo = 24;
    return { lo: lo, hi: Math.max(lo + 40, wall - (deskBear.offsetWidth || 80) - 24) };
  }

  /* The stylesheet starts the bear at 38vw, which is the desktop's number and a
     slab's shin. Put it inside the band before anything has looked at it. */
  if (onTablet()) {
    (function () {
      var b = floorBand();
      bearX = Math.round(b.lo + (b.hi - b.lo) * 0.4);
      deskBear.style.left = bearX + 'px';
    }());
  }

  /* Extracted so the snowman can send the bear somewhere specific. Refusing to
     wander during a build was only half the fix: the bear still built from
     wherever it happened to be standing when the snow started, which is how
     you end up watching a pile of snow assemble itself across the room from
     the animal supposedly assembling it. */
  function walkTo(target) {
    var dist = Math.abs(target - bearX);
    if (dist < 2) return 0;
    var ms = dist / SPEED;
    deskBear.style.transitionDuration = ms + 'ms';
    deskBear.style.left = target + 'px';
    bearX = target;
    setBear('walk', ms);
    if (effMode() === 'snow') footprints(ms, dist);
    return ms;
  }

  function wander() {
    if (!bearIsFree() || onPhone() || bearJob) return;
    var band = floorBand();
    var target = band.lo + Math.random() * (band.hi - band.lo);
    /* "not worth the trip" is a wandering rule, not a walking one. As a guard
       inside walkTo it also swallowed the snowman's request, so the bear could
       arrive up to 30px short and end up standing inside its own snowman. */
    if (Math.abs(target - bearX) < 40) return;
    walkTo(target);
  }

  function footprints(ms, dist) {
    var steps = Math.min(14, Math.round(dist / 46));
    for (var i = 1; i <= steps; i++) {
      (function (n) {
        setTimeout(function () {
          var r = deskBear.getBoundingClientRect();
          var s = document.createElement('div');
          s.className = 'step';
          s.style.left = (r.left + r.width * 0.5 + (n % 2 ? -7 : 7)) + 'px';
          s.style.top = (r.bottom - 12) + 'px';
          body.appendChild(s);
          setTimeout(function () { s.remove(); }, 3600);
        }, (ms / steps) * n);
      })(i);
    }
  }

  /* Ambient timers do nothing while the tab is hidden. They are all here to be
     LOOKED at — a bear blinking, wandering, or saying something to an empty
     room is pure cost, and icySay() additionally measures the standee with
     getBoundingClientRect to place a bubble no one will see.

     The clock tick and the snowman are deliberately NOT wrapped: one keeps time
     and the other is a thing you are meant to be able to leave running. */
  function ambient(fn, ms) {
    return setInterval(function () { if (!document.hidden) fn(); }, ms);
  }

  ambient(wander, 7000);

  /* A slab rotates, and the band rotates with it. A bear left standing where
     the old band ended is standing on icy in the new one, so it walks back --
     visibly, because a pet that teleports on resize is a bug and one that walks
     is the same pet. Never mid-job: the snowman moved too, and snowmanTick is
     what puts the bear back at it. */
  window.addEventListener('resize', function () {
    if (onPhone() || bearJob) return;
    var b = floorBand();
    if (bearX >= b.lo && bearX <= b.hi) return;
    walkTo(Math.min(Math.max(bearX, b.lo), b.hi));
  });

  /* ---- blinking: a quick dip out of whatever it is doing ---- */
  ambient(function () {
    if (bearState !== 'idle' || !bearIsFree()) return;
    setBear('blink');
    setTimeout(function () { if (bearState === 'blink') setBear('idle'); }, 220);
  }, 4200);

  /* ---- and every so often it just starts dancing ----
     Rare on purpose. A pet that dances on a timer is a loop; one that does it
     roughly once every couple of minutes is a thing you caught it doing. It
     only happens when the bear is genuinely idle, so it can never interrupt a
     verb, a walk, or the snowman. */
  ambient(function () {
    if (bearState !== 'idle' || !bearIsFree() || bearJob) return;
    if (Math.random() > 0.22) return;
    var beats = 3 + Math.floor(Math.random() * 3);      /* three to five bars */
    setBear('dance', beats * 1100);
    if (Math.random() < 0.5) bearSay(pick(S.bear.dance));
  }, 21000);

  /* ---- idle chatter ---- */
  ambient(function () {
    if (bearIsFree() && Math.random() < 0.4) bearSay(pick(S.bear.idle), true);
  }, 15000);

  /* ---- it notices when you come back ---- */
  var leftAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { leftAt = Date.now(); document.title = S.icy.tabAway; return; }
    document.title = REAL_TITLE;
    if (leftAt && Date.now() - leftAt > 10000) {
      setBear('happy', 2000);
      bearSay(S.bear.returned);
    }
    icySay(S.icy.noticed);
  });

  /* ---- verbs live on the bear, not in a panel ---- */

  function floaty(sym, host) {
    var r = host.getBoundingClientRect();
    var f = document.createElement('div');
    f.className = 'floaty';
    f.textContent = sym;
    f.style.left = (r.left + r.width * 0.5 + (Math.random() * 22 - 11)) + 'px';
    f.style.top = (r.top - 4) + 'px';
    body.appendChild(f);
    setTimeout(function () { f.remove(); }, 1400);
  }

  /* ---- the hydration check --------------------------------------------
     She asks once a visit, seven minutes in, and the answer matters: say no
     and the site genuinely waits for you. It is the only place here where the
     machine wants something from the visitor rather than the reverse, and it
     is the one thing CT actually knows her for. */

  var asked = false;

  function icyAsk(text, options) {
    if (onPhone()) { phoneToast('icy', text); return; }
    icySay(text);
    var bubble = el('icy-bubble');
    clearTimeout(bubbleTimer);                 /* it waits for an answer */
    bubble.setAttribute('data-ask', '');        /* takes clicks back */
    var row = document.createElement('span');
    row.className = 'bubble__ask';
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = o[0];
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        bubble.removeAttribute('data-ask');
        row.remove();
        o[1]();
      });
      row.appendChild(b);
    });
    bubble.appendChild(row);
  }

  function hydrationCheck(force) {
    if (asked && !force) return;
    if (!force && (onPhone() || document.hidden)) return;
    asked = true;
    icyAsk(S.icy.water.ask, [
      [S.icy.water.yes, function () { icySay(S.icy.water.confirmed); }],
      [S.icy.water.no, function () {
        icySay(S.icy.water.wait);
        var bubble = el('icy-bubble');
        bubble.setAttribute('data-waiting', '');
        clearTimeout(bubbleTimer);
        setTimeout(function () {
          bubble.removeAttribute('data-waiting');
          icySay(S.icy.water.back);
        }, 20000);
      }]
    ]);
    setTimeout(function () { bearSay(S.icy.water.bear); }, 2400);
  }

  setTimeout(hydrationCheck, 7 * 60 * 1000);

  /* She talks back to the bear. Two characters who acknowledge each other cost
     nothing and make both of them realer, and it is the only reply on the site
     aimed at someone other than the visitor. */
  function icyAgrees() {
    if (Math.random() > 0.3) return;
    setTimeout(function () { icySay(pick(S.icy.agrees)); }, 1900);
  }

  var VERBS = {
    feed: function (host) {
      setBear('eat', 1600);
      bearSay(S.bear.feed[feedIndex++ % S.bear.feed.length]);
      floaty('🫐', host);
      icyAgrees();
      sfx('feed');
      fedCount += 1;
      write('fed', fedCount);
      /* >= rather than ===: earn() is idempotent, and a visitor who arrives here
         with a count already past five (a restored save, a future migration)
         should still be given the badge rather than skipped forever. */
      if (fedCount >= 5) { earn('feed5'); bearSay(S.bear.fed5); }
    },
    pet: function (host) {
      setBear('happy', 1800);
      bearSay(S.bear.pet[Math.min(petIndex++, S.bear.pet.length - 1)]);
      floaty('♡', host); floaty('♡', host);
      icyAgrees();
      sfx('pet');
    },
    play: function (host) {
      setBear(Math.random() < 0.45 ? 'dance' : 'happy', 2200);
      bearSay(S.bear.play[playIndex++ % S.bear.play.length]);
      floaty('✦', host); floaty('✦', host);
      icyAgrees();
      sfx('play');
      wander();
    }
  };

  /* escalation resets so the lines stay fresh across a long visit */
  setInterval(function () { petIndex = 0; }, 60000);

  all('.bear').forEach(function (host) {
    /* Enter and Space open the verbs, exactly as #standee already does. Without
       this the three verb buttons were real buttons trapped inside a
       display:none wrapper, so feed/pet/play — and the overfeeder badge, and
       therefore 13/13 — could not be reached by keyboard at all. */
    host.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.target.closest('[data-verb]')) return;      /* let the button act */
      e.preventDefault();
      host.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    host.addEventListener('click', function (e) {
      if (e.target.closest('.bear__name')) return;
      if (e.target.closest('[data-slot^="bear-plate"]')) return;
      var verb = e.target.closest('[data-verb]');
      if (verb) {
        host.querySelector('.bear__verbs').removeAttribute('data-open');
        VERBS[verb.dataset.verb](host);
        return;
      }
      /* three variants now, not one: the copy sheet turned this into a list */
      if (effMode() === 'night') { bearSay(pick(S.bear.sleeping)); return; }
      host.querySelector('.bear__verbs').toggleAttribute('data-open');
      sfx('tap');
    });
  });

  /* ---- the naming event: once, on the first visit ---- */

  /* The naming prompt MOVES to whichever bear is on screen rather than being
     duplicated into both shells. Same rule the phone uses for window bodies,
     and the only way one input keeps one id.

     It lived in #bear-desk only, and #desktop is display:none at <=700px — so
     on a phone the prompt could never appear, the bear could never be named,
     and badge #1 was unreachable. Which makes 13/13 and archangel unwinnable
     on mobile, the exact failure the roster was rebuilt to avoid. */
  /* The bubble does both jobs. It MOVES between shells rather than being
     duplicated, so the phone and the desktop cannot disagree about it. */
  function openNameBubble(rename) {
    var box = slot('name-bubble');
    var host = el(onPhone() ? 'bear-phone' : 'bear-desk');
    if (box.parentNode !== host) host.insertBefore(box, host.querySelector('.bear__sprite'));
    document.querySelector('[data-fill="bear-name-title"]').innerHTML =
      rename ? S.bear.renameTitle : S.bear.nameTitle;
    document.querySelector('[data-fill="bear-name-go"]').textContent =
      rename ? S.bear.renameGo : S.bear.nameGo;
    var input = el('bear-name-input');
    input.value = rename ? (bearName || '') : '';
    box.hidden = false;
    input.focus();
    input.select();
  }

  function askName() {
    if (bearName) return;
    openNameBubble(false);
  }

  /* Renaming is free, always. Currency -- if it ever exists -- gates additions,
     never corrections: charging someone to fix a typo is punitive. */
  function renameBear() {
    if (!bearName) return;
    openNameBubble(true);
  }

  all('[data-slot^="bear-plate"]').forEach(function (plate) {
    plate.addEventListener('click', function (e) {
      if (!bearName) return;
      e.stopPropagation();          /* not the feed/pet/play menu */
      renameBear();
      sfx('tap');
    });
  });

  el('bear-name-input').addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') ACTIONS['name-bear']();
  });

  /* ==========================================================================
     THE SNOWMAN — the bear builds it while it snows, one stage at a time.
     Staying for the whole thing is the point, so it is deliberately unhurried.
     ========================================================================== */

  var snowStage = 0;
  var snowTimer = null;

  var SNOW_X = 0.52;        /* fraction of the viewport the snowman stands at */

  /* 52% of a slab is icy, and the bear is sent to stand at whatever this
     returns -- so a snowman placed on her also walks the bear onto her, which
     is how one fraction put both of them there. Same band the bear wanders,
     towards its far end so the build still reads as happening out on the desk
     rather than tucked against the left edge. */
  function snowmanX() {
    if (!onTablet()) return window.innerWidth * SNOW_X;
    var b = floorBand();
    return b.lo + (b.hi - b.lo) * 0.62;
  }

  function snowmanTick() {
    if (effMode() !== 'snow') return meltSnowman();
    if (snowStage >= 5) return;
    snowStage += 1;
    var s = el('snowman');
    s.removeAttribute('data-poof');
    s.dataset.stage = snowStage;
    var sx = snowmanX();
    s.style.left = (sx + (snowStage % 2 ? 0 : 6)) + 'px';

    /* the bear works at the snowman, not near it */
    if (!onPhone()) {
      bearJob = true;
      var ms = walkTo(sx - 84);
      setTimeout(function () {
        if (bearJob && snowStage < 5) setBear('happy', 1600);
      }, ms + 40);
    }

    if (snowStage === 1) bearSay(S.snow.begun);
    if (snowStage === 5) {
      bearSay(S.snow.done);
      setBear('happy', 2600);
      sfx('yay');
      /* earn() already announces the badge; this second toast used to land in
         the same tick and overwrite it */
      earn('snowman');
      setTimeout(function () { nudgeCapture('snowman'); }, 3000);
      /* it stands and admires the finished thing before it gets bored */
      setTimeout(function () { bearJob = false; }, 12000);
    }
  }

  function meltSnowman() {
    var s = el('snowman');
    bearJob = false;
    if (!snowStage) return;      /* nothing built, nothing to mourn */
    sfx('poof');
    snowStage = 0;
    s.setAttribute('data-poof', '');
    setTimeout(function () {
      s.removeAttribute('data-stage');
      s.removeAttribute('data-poof');
    }, 640);
  }

  setInterval(snowmanTick, 14000);

  function bearReact(app) {
    var line = S.bear.reacts[app];
    if (line) bearSay(line);
  }

  /* ==========================================================================
     ACHIEVEMENTS

     Existence is advertised, discovery is preserved: the app says how many
     exist and reveals what you have, and every locked tile carries a
     hand-written riddle instead of a blank. The hints are the content.

     Nothing here is device-exclusive. localStorage is per device, so a
     desktop-only or mobile-only badge would make 13/13 unreachable and
     archangel unwinnable for everyone.
     ========================================================================== */

  var DEFS = S.ach.defs;
  var got = {};
  readList('ach').forEach(function (id) { got[id] = true; });
  /* the halo is earned once and kept. earn() adds this class at 13/13, but that
     is the only place that did, so it did not survive a reload. */
  if (got.all) body.classList.add('angel');

  function gotCount() {
    return DEFS.filter(function (d) { return got[d[0]]; }).length;
  }

  /* ==========================================================================
     THE BADGE MOMENT.

     A toast is for things that happened: theme changed, stamp left, brief sent.
     A badge is something you EARNED, thirteen times in a whole visit, and the
     old announcement was a line of text carrying the badges.sav app glyph --
     which is the filing cabinet, not the thing filed.

     Built like a console achievement popup because that is what it is quoting:
     the art on the left, the label above the name, the count on the right where
     a gamerscore goes. The count is real information rather than decoration --
     11/13 tells you how close you are at the exact moment you would care.

     One at a time. 13/13 fires `all` immediately after the thirteenth badge, so
     without a queue the two would overwrite each other and the last one anybody
     ever earns would be the one they never see.
     ========================================================================== */
  /* Thirteen times in a whole visit. 4.2 seconds was the toast's timing with a
     bit added, and it ran out while the sparkles were still in the air. Long
     enough to read the name, see the count, and watch the burst finish. */
  var ACH_MS = 6400;
  var achQueue = [], achTimer = null;
  /* a click and the timeout can both ask for the close; the second one must not
     run the hand-back twice and shift two things off the queue */
  var achClosing = false;

  /* One panel, two moments. A theme unlocking is the same shape of event as a
     badge -- something you earned, announced once, with the thing itself in the
     frame -- so it borrows the queue, the burst, the sound and the rule that
     holds ordinary toasts back. What changes is what sits on the plate: a patch
     for a badge, and for a theme the sky it just opened, wearing that theme's
     own drifting glyph. */
  function achPop(opts) {
    if (achBusy) { achQueue.push(opts); return; }
    var p = el('achpop');
    if (!p) { toast(opts.name, opts.badge ? 'badge:' + opts.badge : 'ach'); return; }
    achBusy = true;
    achClosing = false;
    var theme = !!opts.theme;
    /* The panel names a badge at the exact moment you most want to see the rest
       of them, and it used to be six seconds of glass you could not touch. It
       is a door now: clicking it opens badges.sav and takes the panel down.
       Only the badge variant. The theme panel is announcing a sky, and sending
       that to a cabinet of patches answers a question nobody asked. */
    p.toggleAttribute('data-open', !theme);
    p.title = theme ? '' : S.app.achOpen;
    p.toggleAttribute('data-theme-pop', theme);
    if (theme) p.querySelector('.achpop__sky').dataset.motif = opts.theme;
    p.querySelector('.achpop__art').hidden = theme;
    if (!theme) p.querySelector('.achpop__art').src = 'images/os/badges/' + opts.badge + '.svg';
    p.querySelector('.achpop__eyebrow').textContent = opts.eyebrow;
    p.querySelector('.achpop__name').textContent = opts.name;
    var score = p.querySelector('.achpop__score');
    score.textContent = opts.meta || '';
    score.hidden = !opts.meta;
    p.hidden = false;
    /* the spot has to be EMPTY, not merely reserved -- see yieldToast */
    yieldToast();
    /* two frames, not one: hidden was removed this tick, and a transition from
       a box that did not exist a moment ago does not run */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { p.setAttribute('data-show', ''); });
    });
    sfx('achieve');
    clearTimeout(achTimer);
    achTimer = setTimeout(closeAchPop, ACH_MS);
  }

  function closeAchPop() {
    if (!achBusy || achClosing) return;
    achClosing = true;
    clearTimeout(achTimer);
    var p = el('achpop');
    p.removeAttribute('data-show');
    setTimeout(function () {
      p.hidden = true;
      p.removeAttribute('data-open');
      p.removeAttribute('title');
      achBusy = false;
      achClosing = false;
      if (achQueue.length) { achPop(achQueue.shift()); return; }
      /* the spot is free: anything that arrived while the panel was up gets
         its turn now rather than being lost behind it */
      nextToast();
    }, 460);
  }

  el('achpop').addEventListener('click', function () {
    if (!el('achpop').hasAttribute('data-open')) return;
    closeAchPop();
    openWin('ach');
  });

  /* replaces the placeholder recorder the earlier milestones wrote against */
  var earn = function (id) {
    if (got[id]) return;
    got[id] = true;
    write('ach', Object.keys(got));
    var def = DEFS.filter(function (d) { return d[0] === id; })[0];
    if (def) {
      /* The phone's notification already carries the patch and belongs inside
         the bezel; a fixed popup would float outside the phone entirely. So the
         phone keeps its notification and the desktop gets the panel, and both
         get the fanfare. */
      if (onPhone()) { toast(fmt(S.ach.unlocked, { name: def[1] }), 'badge:' + id); sfx('achieve'); }
      else achPop({ badge: id, eyebrow: S.app.achPop, name: def[1],
                    meta: fmt(S.app.achScore, { n: gotCount(), t: DEFS.length }) });
    }
    renderAch();
    var wasOpen = badges;
    badges = DEV_UNLOCK_THEMES ? Infinity : gotCount();
    renderThemeMenu();
    renderWallGrid();
    /* A THEME OPENING WAS SILENT. The ladder is the reason to collect badges at
       all, and crossing a rung changed a swatch in a menu nobody had open. It
       is announced now, after the badge that caused it, on the same panel --
       queued behind it rather than racing it. */
    THEMES.forEach(function (t) {
      if (t.unlock && wasOpen < t.unlock && badges >= t.unlock) {
        var pop = { theme: t.id, eyebrow: S.app.themePop, name: S.themes[t.id],
                    meta: t.unlock >= 13 ? S.themes.final : '' };
        if (onPhone()) toast(fmt(S.themes.opened, { name: S.themes[t.id] }), 'theme');
        else achPop(pop);
      }
    });
    /* three is the point where a visitor has clearly decided to play */
    if (gotCount() === 3) setTimeout(function () { nudgeCapture('badge'); }, 2600);
    try { mintSaveIfEarned(); } catch (e) { /* never block an achievement */ }

    if (id !== 'all' && gotCount() >= DEFS.length && !got.all) {
      setTimeout(function () {
        got.all = true;
        write('ach', Object.keys(got));
        body.classList.add('angel');
        renderAch();
        toast(S.ach.complete, 'ach');
        ceremony();                    /* the thirteenth arrives */
      }, 1800);
    }
  };

  function renderAch() {
    var host = slot('ach-grid');
    if (!host) return;
    /* NOT `all`: that shadowed the all() DOM helper for the whole function,
       so the next line added here that wants to query the DOM would have got
       "all is not a function". */
    var tiles = DEFS.slice();
    if (got.all) tiles.push(['all', S.ach.completeName, '', S.ach.completeHow]);

    slot('ach-count').textContent = fmt(S.ach.count, { n: gotCount(), t: DEFS.length });
    /* THE ART IS THE REWARD, so a locked tile shows an empty patch pocket
       rather than a greyed-out copy of the real one. A desaturated preview
       hands the surprise away for nothing, and there are only thirteen. */
    host.innerHTML = tiles.map(function (d) {
      var mine = !!got[d[0]];
      return '<button class="ach' + (d[0] === 'all' ? ' ach--all' : '') + '"' +
        (mine ? ' data-got' : '') + ' data-ach="' + d[0] + '">' +
        '<img class="ach__mark" alt="" loading="lazy" decoding="async" ' +
          'src="images/os/badges/' + (mine ? d[0] : 'slot') + '.svg">' +
        '<span class="ach__name">' + (mine ? d[1] : S.ach.locked) + '</span>' +
        '<span class="ach__hint"></span></button>';
    }).join('');
  }

  /* earned tile tells you how; locked tile gives up its riddle. Both reward
     the click, which is the point of showing locked slots at all. */
  document.addEventListener('click', function (e) {
    var tile = e.target.closest('.ach');
    if (!tile) return;
    var d = DEFS.concat([['all', S.ach.completeName, '', S.ach.completeHow]])
      .filter(function (x) { return x[0] === tile.dataset.ach; })[0];
    if (!d) return;
    var out = tile.querySelector('.ach__hint');
    out.textContent = out.textContent ? ''
      : (got[d[0]] ? d[3] : d[2] + progressOf(d[0]));
    sfx('tap');
  });

  renderAch();
  /* Existing visitors already hold their badges, so no further earn() will
     fire and mint them a key. Offer one on boot to anyone who qualifies. */
  try { mintSaveIfEarned(); } catch (e) { /* never block boot */ }

  /* ---- the ones that watch rather than wait for a click ---- */

  if (visits.count >= 5) earn('reg');
  if (read('diag', null)) earn('cert');

  /* Came back from /chart/ with a result still warm. The chart writes `diag`
     with a timestamp on every completion, so a recent one means the visitor
     walked back through the door holding something -- which is the moment to
     mention the card. Three minutes is long enough to cover a slow read of the
     result page and short enough that reopening the desktop tomorrow is not
     mistaken for finishing a quiz. */
  (function () {
    var d = read('diag', null);
    if (!d || !d.at) return;
    var age = Date.now() - Date.parse(d.at);
    if (age >= 0 && age < 3 * 60 * 1000) {
      setTimeout(function () { nudgeCapture('diag'); }, 3400);
    }
  }());

  /* Progress toward the two survey badges PERSISTS. It used to live only in
     memory, so `four seasons` and `the long way round` silently reset on every
     refresh and had to be completed in a single sitting — which is not what
     "there is nothing here you have not opened" means, and gave no sign that
     anything had been lost. */
  var WEATHERS = ['day', 'night', 'rain', 'snow'];   /* NOT MODES: that name is
     already taken at the top of the file by the five the dock cycles through,
     and redeclaring it there broke the cycle's way back to auto. */
  var seenWeather = {};
  var openedApps = {};
  /* read() hands back whatever JSON.parse produced, so a corrupted value of the
     wrong shape used to throw straight out of boot and leave a blank page. */
  function readList(key) {
    var v = read(key, []);
    return Array.isArray(v) ? v : [];
  }
  readList('seen').forEach(function (m) { seenWeather[m] = true; });
  readList('opened').forEach(function (a) { openedApps[a] = true; });

  /* Windows that are chrome, not apps. They live in S.apps for their label
     and dock icon, but 13/13 must not move because one got added: the
     achievement is "you opened everything on the desktop", and none of these
     are on the desktop. Settings was already exempt by never calling noteApp;
     this is the same rule with somewhere to write it down. */
  /* Not apps for the purposes of the 14/14 tour. faq lives under help and
     wallpapers lives inside the theme menu and decora.exe -- neither has a
     desktop icon, so neither is somewhere you could be expected to find on a
     walk around the desktop. Adding either to the count would also silently
     un-earn `every` for anyone who already has it. */
  var CHROME = { faq: 1, wall: 1 };

  function appKeys() {
    return Object.keys(S.apps).filter(function (k) { return !CHROME[k]; });
  }
  function openedCount() {
    return appKeys().filter(function (k) { return openedApps[k]; }).length;
  }
  function seenCount() {
    return WEATHERS.filter(function (k) { return seenWeather[k]; }).length;
  }

  function checkSurveys() {
    if (seenCount() === WEATHERS.length) earn('seasons');
    if (openedCount() === appKeys().length) earn('every');
  }

  function noteWeather(m) {
    if (!seenWeather[m]) {
      seenWeather[m] = true;
      write('seen', WEATHERS.filter(function (k) { return seenWeather[k]; }));
    }
    checkSurveys();
  }

  /* One attribute drives the signpost tag, and it walks a short tour: read_me
     first, then diagnosis, then the guestbook. Each leg is dismissed only by
     opening the icon it points at -- open something else and the tag stays
     put, because a label that names one door must not be taken down by a
     different one.

     Each leg is also skipped outright if that app has already been opened by
     the time its turn comes. Someone who found diagnosis on their own does not
     need to be sent there afterwards, and a tag pointing at a door you have
     already been through says nothing. So the tag sits on the FIRST unvisited
     stop, and when there are none left it goes away for good. */
  var GUIDE = ['readme', 'diag', 'guest'];

  function markGuide() {
    var next = '';
    for (var i = 0; i < GUIDE.length; i++) {
      if (!openedApps[GUIDE[i]]) { next = GUIDE[i]; break; }
    }
    if (next) body.setAttribute('data-guide', next);
    else body.removeAttribute('data-guide');
  }

  function noteApp(app) {
    if (!openedApps[app]) {
      openedApps[app] = true;
      write('opened', appKeys().filter(function (k) { return openedApps[k]; }));
    }
    markGuide();
    checkSurveys();
  }

  markGuide();

  /* a previous session may already have finished one of them */
  checkSurveys();

  /* A locked tile that can only ever say the same sentence is a dead end when
     you are one item short. These two say how far along you are, without
     saying which one is missing. */
  /* Progress on everything that can be counted, not just two of them. `feed5`
     and `reg` were always countable and always silent, which is the difference
     between a riddle and a wall: "it is always hungry, test that" tells you
     nothing about whether you are three feeds in or none. `snowman` counts only
     while one is actually being built, because a 0/5 on a clear day is a
     progress bar for something you cannot start. */
  function progressOf(id) {
    if (got[id]) return '';
    if (id === 'every') return fmt(S.ach.progress, { n: openedCount(), t: appKeys().length });
    if (id === 'seasons') return fmt(S.ach.progress, { n: seenCount(), t: WEATHERS.length });
    if (id === 'feed5') return fmt(S.ach.progress, { n: Math.min(fedCount, 5), t: 5 });
    if (id === 'reg') return fmt(S.ach.progress, { n: Math.min(visits.count, 5), t: 5 });
    if (id === 'snowman' && snowStage > 0) return fmt(S.ach.progress, { n: snowStage, t: 5 });
    return '';
  }

  /* ---- THE BEAR KNOWS ----------------------------------------------------
     Thirteen riddles with no feedback is a completion rate near zero, and the
     theme ladder is gated on badges, so the whole reward economy never paid out
     for anyone. One hint, once per session, after four minutes, and only to
     someone still under five badges -- a hint that arrives early deletes the
     discovery it was meant to rescue.

     It prefers a badge that is winnable RIGHT NOW: no telling someone to wait
     for snow on a clear day, or to say goodnight at two in the afternoon. If
     nothing is currently winnable it falls back to anything unearned, because a
     hint you cannot act on yet is still better than a wall.

     `angel` is never hinted. 13:33 stays pure. */
  var HINT_AFTER_MS = 4 * 60 * 1000;
  var HINT_UNDER = 5;

  function hintWinnableNow(id) {
    var m = effMode();
    if (id === 'snowman') return m === 'snow';
    if (id === 'gn') return icyAwake ? !icyAwake() : m === 'night';
    if (id === 'seasons') return true;
    return true;
  }

  function maybeHint() {
    if (gotCount() >= HINT_UNDER) return;
    try {
      if (sessionStorage.getItem(NS + 'hinted') === '1') return;
      sessionStorage.setItem(NS + 'hinted', '1');
    } catch (e) {
      if (maybeHint.done) return;
      maybeHint.done = true;
    }
    var open = DEFS.map(function (d) { return d[0]; })
      .filter(function (id) { return id !== 'angel' && !got[id] && S.hints[id]; });
    if (!open.length) return;
    var now = open.filter(hintWinnableNow);
    var pool = now.length ? now : open;
    var pick = pool[Math.floor(Math.random() * pool.length)];
    bearSay(S.hints[pick]);
  }

  setTimeout(maybeHint, HINT_AFTER_MS);

  /* ---- the old code: a keyboard on the desktop, seven taps on a phone.
          Both routes grant it, because only one of them existing is what made
          this badge device-locked in the first place. ---- */

  var KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  var kIndex = 0;

  /* Konami mode is a mode in the weather sense: it layers over whichever of the
     twenty theme-and-sky combinations you are already in rather than replacing
     one. It persists like the others do, and the 1UP chip in the bar is both
     the proof it is on and the way out, so nobody is stuck in a CRT because
     they cannot remember the code a second time. */
  /* The row is not in the menu until the code has been found: putting it there
     up front hands over the one thing the easter egg is made of. Once earned it
     stays, because a mode you can only reach by remembering ten keystrokes is a
     mode you will use once. Same shape as a theme swatch — it appears when you
     have paid for it. */
  function renderKonamiRow() {
    var on = body.hasAttribute('data-konami');
    all('.k-row').forEach(function (n) { n.hidden = !got.konami; });
    all('[data-act="konami-toggle"]').forEach(function (n) {
      n.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function konamiMode(on) {
    earn('konami');
    var next = on === undefined ? !body.hasAttribute('data-konami') : !!on;
    body.toggleAttribute('data-konami', next);
    write('konami', next);
    el('kchip').hidden = !next;
    chime();
    renderKonamiRow();
    icySay(next ? S.icy.konamiOn : S.icy.konamiOff);
    if (!next) return;
    setTimeout(function () { bearSay(S.bear.konami); }, 1700);
    for (var i = 0; i < 26; i++) {
      var h = document.createElement('div');
      /* two thirds the theme's own motif, one third the arcade heart, so the
         shower belongs to the theme it fell on */
      h.className = 'halo' + (Math.random() < 0.34 ? ' halo--pix' : '');
      h.style.left = (Math.random() * 100) + 'vw';
      h.style.animationDuration = (2.4 + Math.random() * 3) + 's';
      h.style.animationDelay = (Math.random() * 1.4) + 's';
      body.appendChild(h);
      setTimeout(function (n) { return function () { n.remove(); }; }(h), 7000);
    }
  }

  window.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    kIndex = (e.key === KONAMI[kIndex]) ? kIndex + 1 : (e.key === KONAMI[0] ? 1 : 0);
    if (kIndex === KONAMI.length) { kIndex = 0; konamiMode(); }
  });

  var taps = 0;
  var tapTimer = null;
  el('ptime').addEventListener('click', function () {
    taps += 1;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function () { taps = 0; }, 2500);
    if (taps >= 7) { taps = 0; konamiMode(); }
  });

  /* ==========================================================================
     PROOF OF VISIT

     A collectible, not a screenshot. One render at the share resolution
     (1080x1350) displayed at >=360px, built as a trading card: rim, portrait
     plate, verdict, collection row, theme plate, wordmark. The trading-card
     frame is what earns the space — a centred column of text on a gradient is
     a screenshot, and nobody stops scrolling for a screenshot.

     Every colour is read from the live theme tokens, so all five themes across
     all four weathers are already WCAG-correct here and stay correct if a
     palette is ever retuned. Nothing about the palette is duplicated below.

     The theme is named on the card on purpose: a locked theme someone has not
     earned is the most persuasive thing the card can show a stranger.
     ========================================================================== */

  var CAP = { eyebrow: 30, serial: 22, title: 112, titleMin: 60, sub: 42, subMin: 24, chip: 31, stamp: 30, foot: 74 };
  var CHIP_H = 54, CHIP_GAP = 20;   /* the chips were touching each other */
  var MONO = '"Space Mono", monospace';
  var DISP = '"Bagel Fat One", cursive';

  function cssVar(name) {
    return getComputedStyle(body).getPropertyValue(name).trim();
  }

  /* rgba() with the SAME rgb at zero alpha. Canvas interpolates a bare
     'transparent' toward transparent BLACK, which is what put a grey smear
     under the sun. Every fade in this file ends on its own colour. */
  function fade(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',';
  }

  /* is this sky dark? decides which way every piece of the art contrasts,
     instead of hard-coding a list of dark themes that would go stale */
  function isDark(hex) {
    var h = hex.replace('#', '');
    var n = parseInt(h.length === 3 ? h[0]+h[0]+h[1]+h[1]+h[2]+h[2] : h.slice(0, 6), 16);
    return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) < 140;
  }

  /* ---- Motif glyphs. Each one paints itself rather than handing back a path
          for someone else to flat-fill: a strawberry needs its calyx and a
          prism needs to actually be iridescent, and neither survives being
          reduced to a single colour. Called already translated to 0,0. ---- */

  var GLYPH = {
    spark: function (c, r, col) {
      c.beginPath();
      c.moveTo(0, -r);
      c.quadraticCurveTo(r * 0.16, -r * 0.16, r, 0);
      c.quadraticCurveTo(r * 0.16, r * 0.16, 0, r);
      c.quadraticCurveTo(-r * 0.16, r * 0.16, -r, 0);
      c.quadraticCurveTo(-r * 0.16, -r * 0.16, 0, -r);
      c.closePath();
      c.fillStyle = col; c.fill();
    },
    heart: function (c, r, col) {
      c.beginPath();
      c.moveTo(0, r * 0.92);
      c.bezierCurveTo(-r * 1.45, -r * 0.24, -r * 0.58, -r * 1.2, 0, -r * 0.42);
      c.bezierCurveTo(r * 0.58, -r * 1.2, r * 1.45, -r * 0.24, 0, r * 0.92);
      c.closePath();
      c.fillStyle = col; c.fill();
    },
    /* the holo theme's whole argument is that light splits on it */
    prism: function (c, r) {
      c.beginPath();
      c.moveTo(0, -r * 1.25);
      c.lineTo(r * 0.72, -r * 0.3);
      c.lineTo(0, r * 1.25);
      c.lineTo(-r * 0.72, -r * 0.3);
      c.closePath();
      var g = c.createLinearGradient(-r * 0.72, -r * 1.25, r * 0.72, r * 1.25);
      HOLO.forEach(function (col, i) { g.addColorStop(i / (HOLO.length - 1), col); });
      c.fillStyle = g; c.fill();
      c.strokeStyle = fade('#ffffff') + '0.75)'; c.lineWidth = r * 0.1;
      c.beginPath(); c.moveTo(0, -r * 1.25); c.lineTo(0, r * 1.25); c.stroke();
    },
    ring: function (c, r, col) {
      c.beginPath();
      c.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2);
      c.strokeStyle = col; c.lineWidth = Math.max(3, r * 0.2); c.stroke();
    },
    /* a red blob is a petal. the calyx and the seeds are the strawberry. */
    berry: function (c, r, col) {
      c.beginPath();
      c.moveTo(0, r * 1.15);
      c.bezierCurveTo(-r * 1.05, r * 0.15, -r * 0.95, -r * 0.62, 0, -r * 0.62);
      c.bezierCurveTo(r * 0.95, -r * 0.62, r * 1.05, r * 0.15, 0, r * 1.15);
      c.closePath();
      c.fillStyle = col; c.fill();
      c.fillStyle = fade('#7fc98a') + '0.95)';
      c.beginPath();
      c.moveTo(0, -r * 0.34);
      [-1, -0.45, 0.45, 1].forEach(function (k) {
        c.lineTo(k * r * 0.92, -r * 0.86);
        c.lineTo(k * r * 0.3, -r * 0.44);
      });
      c.closePath(); c.fill();
      c.fillRect(-r * 0.1, -r * 1.2, r * 0.2, r * 0.4);
      c.fillStyle = fade('#fff3c4') + '0.9)';
      [[-0.42, 0.1], [0.4, 0.26], [0, 0.55], [-0.3, 0.72], [0.32, 0.72]].forEach(function (p) {
        c.beginPath();
        c.ellipse(p[0] * r, p[1] * r, r * 0.09, r * 0.14, 0, 0, Math.PI * 2);
        c.fill();
      });
    },
    drop: function (c, r, col) {
      c.beginPath();
      c.moveTo(0, -r * 1.2);
      c.bezierCurveTo(r * 0.86, -r * 0.1, r * 0.78, r * 1.1, 0, r * 1.1);
      c.bezierCurveTo(-r * 0.78, r * 1.1, -r * 0.86, -r * 0.1, 0, -r * 1.2);
      c.closePath();
      c.fillStyle = col; c.fill();
    },
    wing: function (c, r, col) {
      c.beginPath();
      c.moveTo(r * 0.72, -r * 1.15);
      c.bezierCurveTo(-r * 0.5, -r * 0.72, -r * 1.05, r * 0.2, -r * 0.72, r * 1.15);
      c.bezierCurveTo(-r * 0.16, r * 0.12, r * 0.34, -r * 0.4, r * 0.72, -r * 1.15);
      c.closePath();
      c.fillStyle = col; c.fill();
    },
    cross: function (c, r, col) {
      var w = r * 0.3;
      c.beginPath();
      c.moveTo(-w, -r); c.lineTo(w, -r); c.lineTo(w, -w * 1.3); c.lineTo(r, -w * 1.3);
      c.lineTo(r, w * 0.7); c.lineTo(w, w * 0.7); c.lineTo(w, r); c.lineTo(-w, r);
      c.lineTo(-w, w * 0.7); c.lineTo(-r, w * 0.7); c.lineTo(-r, -w * 1.3);
      c.lineTo(-w, -w * 1.3);
      c.closePath();
      c.fillStyle = col; c.fill();
    },
    /* arcade motifs stay on their own pixel grid, and are never rotated —
       a rotated sprite is just a jaggy blob */
    pixHeart: function (c, r, col) {
      pixRun(c, r / 6, [[1,1,4,1],[7,1,4,1],[0,2,12,3],[1,5,10,2],[2,7,8,1],
                        [3,8,6,1],[4,9,4,1],[5,10,2,1]], 12, 12);
      c.fillStyle = col; c.fill();
    },
    pixStar: function (c, r, col) {
      pixRun(c, r / 6, [[5,0,2,4],[4,2,4,2],[2,4,8,1],[0,5,12,2],[2,7,8,1],
                        [4,8,4,2],[5,10,2,2]], 12, 12);
      c.fillStyle = col; c.fill();
    },
    pixGhost: function (c, r, col) {
      pixRun(c, r / 6, [[3,0,6,1],[2,1,8,1],[1,2,10,7],[1,9,2,2],[5,9,2,2],
                        [9,9,2,2]], 12, 12);
      c.fillStyle = col; c.fill();
      c.fillStyle = fade('#ffffff') + '0.9)';
      pixRun(c, r / 6, [[3,4,2,2],[7,4,2,2]], 12, 12);
      c.fill();
    }
  };

  var FLAT = { pixHeart: 1, pixStar: 1, pixGhost: 1 };

  /* one sprite frame at a whole-number scale — anything else and the pixel
     art stops being pixel art */
  var BEAR_PX = 40;          /* the bear sheet's frame size */
  var SNOW_PX = 32;          /* the snowman's, which did not change */

  function sprite(c, id, col, row, x, y, size, px) {
    var img = el(id);
    if (!img || !img.complete || !img.naturalWidth) return;
    px = px || BEAR_PX;
    c.imageSmoothingEnabled = false;
    c.drawImage(img, col * px, row * px, px, px, x, y, size, size);
    c.imageSmoothingEnabled = true;
  }

  /* The bear on the card is in the mood the weather put it in — asleep at
     night, sorry for itself in the rain, delighted by snow. Rows here match
     the order the sheet is built in, and the mapping is restBear()'s, so the
     card shows a deliberate pose rather than whichever walk frame it happened
     to be on when the shutter went. */
  var BEAR_ROW = { idle: 0, happy: 3, sleep: 5, sad: 6 };

  function capBearRow(m) {
    return BEAR_ROW[m === 'night' ? 'sleep' : m === 'rain' ? 'sad'
      : m === 'snow' ? 'happy' : 'idle'];
  }

  function pixRun(c, u, rects, w, h) {
    c.beginPath();
    rects.forEach(function (r) {
      c.rect((r[0] - w / 2) * u, (r[1] - h / 2) * u, r[2] * u, r[3] * u);
    });
  }

  /* ---- per-theme card dressing. Colours come from tokens; this table only
          says which glyphs belong to which theme and how the rim is built. ---- */

  var CARD = {
    base:       { glyphs: ['spark', 'heart'], rim: 'plain' },
    holo:       { glyphs: ['prism', 'spark', 'ring'], rim: 'holo' },
    strawberry: { glyphs: ['berry', 'heart', 'drop'], rim: 'double' },
    arcade:     { glyphs: ['pixHeart', 'pixStar', 'pixGhost'], rim: 'neon' },
    archangel:  { glyphs: ['wing', 'ring', 'spark', 'cross'], rim: 'plat' }
  };

  var HOLO = ['#ff5fd2', '#7fc8ff', '#ffe470', '#7dffbe', '#b98bff', '#ff5fd2'];

  /* Platinum rather than gold for archangel and for 13/13. Warm gold is a
     foreign object in a palette this cool, and the system already reserves
     gold for the covenant hour itself (--pulse goes warm only at 13:33).
     Silver with violet in it reads rarer here and stays inside the palette. */
  var PLAT = [[0, '#f7f3ff'], [0.16, '#c5b4e4'], [0.34, '#ffffff'], [0.52, '#b9a6dc'],
              [0.7, '#f1ebfc'], [0.86, '#cbbaea'], [1, '#f7f3ff']];
  var PLAT_GLOW = 'rgba(186,150,238,0.85)';
  var PLAT_INK = '#3a2c5e';

  function platinum(c, x0, y0, x1, y1) {
    var g = c.createLinearGradient(x0, y0, x1, y1);
    PLAT.forEach(function (s) { g.addColorStop(s[0], s[1]); });
    return g;
  }

  /* a fixed shuffle: the card must look the same every time it is drawn */
  function rng(seed) {
    var s = seed;
    return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  /* ---- the visitor on their own card ------------------------------------

     The card said something about icybear. A handle makes it say something
     about the person posting it, which is the difference between a nice
     graphic and a thing people post about themselves. It is also what makes
     the card self-attributing once it gets reposted.

     Stored, so it is asked once and never again. Everything below degrades:
     no handle draws exactly the card that shipped before this existed, and a
     handle whose pfp will not load still gets its name on the card. */

  var capPfp = null;

  function cleanHandle(raw) {
    var v = String(raw || '').trim().replace(/^@+/, '');
    if (isBlocked(v)) return '';
    return v.replace(/[^A-Za-z0-9_]/g, '').slice(0, 15);
  }

  /* unavatar, exactly as chart.js learned to call it: /x/ and NOT /twitter/,
     because /twitter/ 301s and the redirect response carries no
     Access-Control-Allow-Origin, so crossOrigin='anonymous' fails silently
     every time. Getting this wrong taints the canvas, and a tainted canvas
     kills copy, save and post outright. */
  function loadPfp(handle, done) {
    if (!handle) { capPfp = null; return done(true); }
    var img = new Image();
    var settled = false;
    img.crossOrigin = 'anonymous';
    function finish(ok) {
      if (settled) return;
      settled = true;
      capPfp = ok ? img : null;
      done(ok);
    }
    img.onload = function () { finish(true); };
    img.onerror = function () { finish(false); };
    setTimeout(function () { finish(false); }, 6000);
    /* unavatar.io is a third party, and it necessarily learns the handle and the
       IP. It does not also need the page: no-referrer stops the URL going with
       the request. Independent of crossOrigin, which is about reading the
       pixels back out of the canvas. */
    img.referrerPolicy = 'no-referrer';
    img.src = 'https://unavatar.io/x/' + encodeURIComponent(handle);
  }

  function drawPfp(c, img, cx, cy, r, rimIn, rimOut) {
    c.save();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.clip();
    var s = Math.max((r * 2) / img.width, (r * 2) / img.height);   /* cover */
    c.drawImage(img, cx - (img.width * s) / 2, cy - (img.height * s) / 2,
                img.width * s, img.height * s);
    c.restore();
    c.beginPath();
    c.arc(cx, cy, r, 0, Math.PI * 2);
    c.lineWidth = 7;
    c.strokeStyle = rimOut;
    c.stroke();
    c.lineWidth = 2.5;
    c.strokeStyle = rimIn;
    c.beginPath();
    c.arc(cx, cy, r - 5, 0, Math.PI * 2);
    c.stroke();
  }

  /* "The most recent badge" meant DEFS order, which is roster order, not earn
     order — so earning #13 first and #1 second put #1 on the card. The stored
     `ach` array is already in earn order (Object.keys preserves insertion), so
     the answer was sitting in localStorage the whole time. */
  function latestBadge() {
    var order = read('ach', []);
    for (var i = order.length - 1; i >= 0; i--) {
      var d = DEFS.filter(function (x) { return x[0] === order[i]; })[0];
      if (d) return d;                 /* skips 'all', which is not in DEFS */
    }
    return null;
  }

  function capHero() {
    var d = read('diag', null);
    /* No sub for a diagnosis: the full line is the chart card's job, and
       printing it here made two cards say the same paragraph. The other two
       heroes keep theirs, because nothing else states them. */
    if (d && d.name) return { label: S.cap.labelDiag, title: d.name, sub: '' };
    var last = latestBadge();
    if (last) return { label: S.cap.labelAch, title: last[1], sub: last[3] };
    var name = read('bearName', null) || S.bear.plate;
    return { label: S.cap.labelVerdict, title: fmt(S.cap.verdict, { name: name }), sub: S.cap.sub };
  }

  /* Shrink until the text wraps into at most `maxLines` AND every one of those
     lines measures inside maxW. The old version checked the line COUNT only, so
     a single long word still ran past the frame -- and the subtitle was drawn
     with no fitting at all, which is what pushed "opened every app. nothing
     left unclicked." out through both borders. */
  function fitLines(ctx, text, maxW, start, min, font, maxLines) {
    var size = start;
    while (size >= min) {
      ctx.font = font(size);
      var lines = [], line = '';
      text.split(' ').forEach(function (w) {
        var t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; }
        else line = t;
      });
      lines.push(line);
      var fits = lines.length <= maxLines && lines.every(function (l) {
        return ctx.measureText(l).width <= maxW;
      });
      if (fits) return { size: size, lines: lines };
      size -= 2;
    }
    ctx.font = font(min);
    var out = [], ln = '';
    text.split(' ').forEach(function (w) {
      var t = ln ? ln + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && ln) { out.push(ln); ln = w; }
      else ln = t;
    });
    out.push(ln);
    return { size: min, lines: out };
  }

  /* one line, shrunk until it fits. For the slots that can never wrap. */
  function fitOne(ctx, text, maxW, start, min, font) {
    var size = start;
    while (size > min) {
      ctx.font = font(size);
      if (ctx.measureText(text).width <= maxW) break;
      size -= 1;
    }
    return size;
  }

  function dispF(s) { return s + 'px ' + DISP; }
  function monoF(s) { return '700 ' + s + 'px ' + MONO; }

  /* tracked() adds `sp` between every pair, so its width is not measureText's */
  function fitTracked(ctx, text, maxW, start, min, font, sp) {
    var size = start;
    while (size > min) {
      ctx.font = font(size);
      if (ctx.measureText(text).width + sp * (text.length - 1) <= maxW) break;
      size -= 1;
    }
    return size;
  }

  /* ---- the layout engine: blocks declare a height, a minimum gap and a
          growth weight, and whatever is left over is shared out by weight. The
          card fills its frame whether the verdict is one word or two lines,
          which is what the fixed y-coordinates could not do. ---- */

  var MIN_GAP = 10;

  function column(blocks, top, bottom) {
    var h = 0, gaps = 0, grow = 0;
    blocks.forEach(function (b, i) {
      h += b.h;
      if (i) { gaps += b.gap || 0; grow += b.grow || 0; }
    });
    var free = (bottom - top) - h - gaps;
    /* An overflow used to be shared out as NEGATIVE advances, which drew each
       block progressively further on top of the one above it -- at two lines of
       verdict the wordmark landed 17px inside the receipt. Overflow now comes
       out of the gaps, proportionally, and never below MIN_GAP. Blocks can
       never overlap, whatever the content. */
    var squeeze = 0;
    if (free < 0) {
      var slack = gaps - (blocks.length - 1) * MIN_GAP;
      squeeze = slack > 0 ? Math.min(1, -free / slack) : 1;
      free = 0;
    }
    var y = top;
    blocks.forEach(function (b, i) {
      if (i) {
        var g = b.gap || 0;
        if (squeeze) g = Math.max(MIN_GAP, g - (g - MIN_GAP) * squeeze);
        y += g + free * ((b.grow || 0) / (grow || 1));
      }
      b.draw(y);
      y += b.h;
    });
  }

  /* ---- weather scenes. Each one is a small painting, not a garnish: the
          weather is half of what makes two cards look different. ---- */

  var LOBES = [[0, 0, 0.5], [-0.34, 0.1, 0.36], [0.34, 0.09, 0.38],
               [-0.16, -0.14, 0.4], [0.17, -0.12, 0.36]];

  /* Stroking a cluster of circles draws every seam between them, which is what
     turned the first rain clouds into a diagram of themselves. The rim is a
     second, slightly fatter fill behind the first instead. */
  function puffCloud(c, x, y, w, tone, edge) {
    function path(grow) {
      c.beginPath();
      LOBES.forEach(function (l) {
        var r = l[2] * w + grow;
        c.moveTo(x + l[0] * w + r, y + l[1] * w);
        c.arc(x + l[0] * w, y + l[1] * w, r, 0, Math.PI * 2);
      });
    }
    if (edge) { path(5); c.fillStyle = edge; c.fill(); }
    path(0); c.fillStyle = tone; c.fill();
  }

  /* A crescent traced as its own boundary: the far arc of one disc, then the
     near arc of the other, back to the start. Cutting one disc out of another
     depends on fill winding, and two engines disagreed about which way a full
     circle is wound — evenodd XORs and leaves both lunes (two moons touching),
     nonzero needs a direction the renderer has to honour. This needs neither.
     Thickness at the widest point is exactly `d`, the offset distance. */
  function crescent(c, cx, cy, r, dx, dy, col) {
    var d = Math.sqrt(dx * dx + dy * dy);
    if (!d || d >= 2 * r) return;
    var h = Math.sqrt(r * r - (d * d) / 4);
    var phi = Math.atan2(h, d / 2);          /* own centre to the crossing point */
    var psi = Math.atan2(h, -d / 2);         /* other centre to the same point */
    c.save();
    c.translate(cx, cy);
    c.rotate(Math.atan2(dy, dx));            /* work with the offset along +x */
    c.beginPath();
    c.arc(0, 0, r, phi, 2 * Math.PI - phi, false);
    c.arc(d, 0, r, -psi, psi, true);
    c.closePath();
    c.fillStyle = col;
    c.fill();
    c.restore();
  }

  function scene(c, W, H, m, ink, deco, dark) {
    var r = rng(9001);
    if (m === 'day') {
      var cx = W - 214, cy = 214;
      var g = c.createRadialGradient(cx, cy, 12, cx, cy, 250);
      g.addColorStop(0, fade('#fff6cf') + '0.95)');
      g.addColorStop(0.34, fade('#ffe9a3') + '0.42)');
      g.addColorStop(1, fade('#ffe9a3') + '0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, 250, 0, Math.PI * 2); c.fill();
      c.fillStyle = fade('#fffadf') + '0.92)';
      c.beginPath(); c.arc(cx, cy, 52, 0, Math.PI * 2); c.fill();
      puffCloud(c, 214, 268, 132, fade('#ffffff') + '0.5)');
      puffCloud(c, W - 268, 486, 96, fade('#ffffff') + '0.34)');
      puffCloud(c, 190, H - 216, 158, fade('#ffffff') + '0.3)');
    } else if (m === 'night') {
      var mx = W - 214, my = 206;
      var mg = c.createRadialGradient(mx, my, 20, mx, my, 220);
      mg.addColorStop(0, fade('#f6ecc4') + '0.4)');
      mg.addColorStop(1, fade('#f6ecc4') + '0)');
      c.fillStyle = mg;
      c.beginPath(); c.arc(mx, my, 220, 0, Math.PI * 2); c.fill();
      crescent(c, mx, my, 64, 34, -22, '#f8f0d2');
      for (var i = 0; i < 46; i++) {
        var sx = r() * W, sy = r() * H, sr = 3 + r() * 9;
        c.save();
        c.translate(sx, sy);
        c.globalAlpha = 0.35 + r() * 0.6;
        c.fillStyle = '#ffffff';
        if (sr > 7) { GLYPH.spark(c, sr * 1.5); c.fill(); }
        else { c.beginPath(); c.arc(0, 0, sr * 0.34, 0, Math.PI * 2); c.fill(); }
        c.restore();
      }
    } else if (m === 'rain') {
      /* clouds that actually produce the rain, and rain that falls in
         gusts rather than in a lattice */
      /* weather worth looking at: a squall gathering at the top, three clouds
         actually producing the rain, and streaks with real contrast */
      var gl = c.createLinearGradient(0, 0, 0, H * 0.72);
      gl.addColorStop(0, fade(dark ? '#05070f' : '#4a5480') + '0.3)');
      gl.addColorStop(1, fade(dark ? '#05070f' : '#4a5480') + '0)');
      c.fillStyle = gl;
      c.fillRect(0, 0, W, H);
      var mass = dark ? fade('#2b3157') + '0.8)' : fade('#eef1fb') + '0.82)';
      var lip = dark ? fade('#4b5480') + '0.75)' : fade('#ffffff') + '0.6)';
      [[218, 252, 150], [W - 244, 338, 122], [W - 152, 172, 92]]
        .forEach(function (p) { puffCloud(c, p[0], p[1], p[2], mass, lip); });
      c.lineCap = 'round';
      c.strokeStyle = dark ? fade('#c9d6ff') + '1)' : fade('#5f6c9e') + '1)';
      for (var j = 0; j < 96; j++) {
        var rx = r() * W, ry = 130 + r() * (H - 190), len = 34 + r() * 62;
        /* rain thins out over the reading column: weather is atmosphere, and
           atmosphere does not get to sit on top of the words */
        c.globalAlpha = (0.2 + r() * 0.45) *
          (rx > 120 && rx < W - 120 && ry > H * 0.4 && ry < H * 0.94 ? 0.3 : 1);
        c.lineWidth = 3 + r() * 3.5;
        c.beginPath();
        c.moveTo(rx, ry); c.lineTo(rx - len * 0.26, ry + len);
        c.stroke();
      }
      /* it has to land somewhere */
      c.strokeStyle = dark ? fade('#c9d6ff') + '1)' : fade('#ffffff') + '1)';
      for (var k = 0; k < 9; k++) {
        var qx = 90 + r() * (W - 180), qy = H - 190 + r() * 140;
        c.globalAlpha = 0.34;
        c.lineWidth = 3;
        c.beginPath(); c.ellipse(qx, qy, 32 + r() * 40, 9 + r() * 7, 0, 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = 1;
    } else if (m === 'snow') {
      /* A landscape, not a pale rectangle: drifts high enough to read, the
         snowman the bear spent the whole storm building standing on them, and
         flakes at two depths so the fall has some air in it. */
      /* Moonlit, not blank white. A pure-white drift under a night sky is both
         wrong and unreadable: the footer's ink is light on the dark themes, so
         it was disappearing into the snow it was printed on. */
      var back = dark ? fade('#5d7099') + '0.85)' : fade('#d6e5fa') + '0.92)';
      var front = dark ? fade('#8ba2c9') + '0.9)' : fade('#ffffff') + '0.95)';
      c.fillStyle = back;
      c.beginPath();
      c.moveTo(0, H); c.lineTo(0, H - 268);
      c.bezierCurveTo(W * 0.12, H - 340, W * 0.32, H - 244, W * 0.54, H - 214);
      c.bezierCurveTo(W * 0.76, H - 184, W * 0.88, H - 286, W, H - 226);
      c.lineTo(W, H); c.closePath(); c.fill();
      c.fillStyle = front;
      c.beginPath();
      c.moveTo(0, H); c.lineTo(0, H - 158);
      c.bezierCurveTo(W * 0.18, H - 196, W * 0.44, H - 96, W * 0.66, H - 122);
      c.bezierCurveTo(W * 0.84, H - 142, W * 0.93, H - 74, W, H - 112);
      c.lineTo(W, H); c.closePath(); c.fill();
      /* the snowman the bear spent the whole storm building, standing on the
         drift where the type is not */
      sprite(c, 'snowman-img', 4, 0, 92, H - 300, SNOW_PX * 5, SNOW_PX);
      /* out-of-focus flakes in front, so the fall has depth rather than being
         one flat layer of asterisks */
      for (var b = 0; b < 16; b++) {
        var bx = r() * W, by = r() * H, br = 14 + r() * 22;
        var bg = c.createRadialGradient(bx, by, 0, bx, by, br);
        bg.addColorStop(0, fade('#ffffff') + '0.62)');
        bg.addColorStop(1, fade('#ffffff') + '0)');
        c.fillStyle = bg;
        c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
      }
      for (var n = 0; n < 62; n++) {
        var fx = r() * W, fy = r() * (H - 90), fr = 5 + r() * 14;
        c.save();
        c.translate(fx, fy);
        c.rotate(r() * Math.PI);
        c.globalAlpha = 0.35 + r() * 0.5;
        c.strokeStyle = '#ffffff';
        c.lineWidth = Math.max(2, fr * 0.2);
        c.lineCap = 'round';
        c.beginPath();
        for (var a = 0; a < 3; a++) {
          var th = (Math.PI / 3) * a;
          c.moveTo(-Math.cos(th) * fr, -Math.sin(th) * fr);
          c.lineTo(Math.cos(th) * fr, Math.sin(th) * fr);
        }
        c.stroke();
        c.restore();
      }
      c.globalAlpha = 1;
    }
  }

  /* ---- theme wallpaper glyphs, kept off the reading band ---- */

  function wallpaper(c, W, H, wall, deco, accent, dark) {
    var set = (CARD[wall] || CARD.base).glyphs;
    var r = rng(4242);
    for (var i = 0; i < 26; i++) {
      var x = r() * W, y = 90 + r() * (H - 200), sz = 15 + r() * 26;
      var key = set[i % set.length];
      /* motifs step back over the reading column rather than being kept out
         of it: an empty margin is what made the first card feel bare */
      var mid = x > 116 && x < W - 116 && y > H * 0.3 && y < H * 0.95;
      c.save();
      c.translate(x, y);
      if (!FLAT[key]) c.rotate((r() - 0.5) * 0.9);
      c.globalAlpha = (0.2 + r() * 0.2) * (mid ? 0.42 : 1);
      /* on a dark sky a decorative tint disappears into it, so the second
         colour becomes white instead */
      GLYPH[key](c, sz, i % 3 === 0 ? accent : (dark ? '#ffffff' : deco));
      c.restore();
    }
    c.globalAlpha = 1;
  }

  /* ---- the rim. Five themes, five different pieces of jewellery. ---- */

  function rim(c, W, H, wall, deco, accent) {
    var style = (CARD[wall] || CARD.base).rim;
    var m = 34, rad = 54;
    function box(inset, radius) {
      c.beginPath();
      c.roundRect(m + inset, m + inset, W - (m + inset) * 2, H - (m + inset) * 2, radius);
    }
    if (style === 'holo') {
      var g = c.createLinearGradient(m, m, W - m, H - m);
      HOLO.forEach(function (col, i) { g.addColorStop(i / (HOLO.length - 1), col); });
      c.strokeStyle = g; c.lineWidth = 7; box(0, rad); c.stroke();
      c.strokeStyle = fade('#ffffff') + '0.7)'; c.lineWidth = 2; box(11, rad - 10); c.stroke();
    } else if (style === 'double') {
      c.strokeStyle = deco; c.lineWidth = 6; box(0, rad); c.stroke();
      c.strokeStyle = fade('#fffaf2') + '0.85)'; c.lineWidth = 2.5; box(12, rad - 11); c.stroke();
    } else if (style === 'neon') {
      c.save();
      c.shadowColor = accent; c.shadowBlur = 26;
      c.strokeStyle = accent; c.lineWidth = 5; box(0, rad); c.stroke();
      c.shadowColor = deco; c.shadowBlur = 20;
      c.strokeStyle = deco; c.lineWidth = 3; box(13, rad - 12); c.stroke();
      c.restore();
    } else if (style === 'plat') {
      c.save();
      c.shadowColor = PLAT_GLOW; c.shadowBlur = 30;
      c.strokeStyle = platinum(c, m, m, W - m, H - m);
      c.lineWidth = 7; box(0, rad); c.stroke();
      c.restore();
      c.strokeStyle = fade('#e6dcf8') + '0.6)'; c.lineWidth = 2; box(13, rad - 12); c.stroke();
      /* four corner marks: the covenant does not do plain borders */
      [[m + 46, m + 46], [W - m - 46, m + 46], [m + 46, H - m - 46], [W - m - 46, H - m - 46]]
        .forEach(function (p) {
          c.save(); c.translate(p[0], p[1]);
          GLYPH.spark(c, 17, '#f2ecff'); c.restore();
        });
    } else {
      c.strokeStyle = deco; c.lineWidth = 5; box(0, rad); c.stroke();
      c.strokeStyle = fade('#ffffff') + '0.55)'; c.lineWidth = 2; box(11, rad - 10); c.stroke();
    }
  }

  /* ---- the wordmark ----
     Drawn by wordmark.js, which the chart's result card uses too. A wordmark
     is a wordmark and should be the same object on every card; keeping two
     copies is how the chart ended up setting the url in type while this card
     drew the artwork. */
  function wordmark(c, text, cx, y, size) {
    drawWordmark(c, cx, y, size, el('mark-img'));
  }

  /* The scene paints under the type -- a white snow drift reaches y 1154, and
     rain streaks cross everywhere -- so the small print can land on a tone its
     own theme never anticipated. A halo in the opposite tone fixes it for every
     scene at once: `dark` already tells us which way ink is pointing, so the
     two can never both be light or both be dark. */
  function halo(c, dark, fn) {
    c.save();
    c.shadowColor = dark ? fade('#0a0620') + '0.82)' : fade('#ffffff') + '0.9)';
    c.shadowBlur = 14;
    fn();
    c.shadowBlur = 8;
    fn();
    c.shadowBlur = 4;
    fn();
    c.restore();
  }

  function tracked(c, text, cx, y, spacing) {
    /* letter-spacing without relying on ctx.letterSpacing, which Safari only
       learned recently and this card cannot afford to render differently on */
    var chars = text.split('');
    var w = chars.reduce(function (a, ch) { return a + c.measureText(ch).width + spacing; }, -spacing);
    var x = cx - w / 2;
    c.textAlign = 'left';
    chars.forEach(function (ch) {
      c.fillText(ch, x, y);
      x += c.measureText(ch).width + spacing;
    });
    c.textAlign = 'center';
    return w;
  }

  function ruledLabel(c, text, cx, y, W, ink, accent) {
    c.font = '700 26px ' + MONO;
    c.fillStyle = accent;
    var w = tracked(c, text, cx, y, 5);
    c.strokeStyle = fade(ink) + '0.28)';
    c.lineWidth = 2;
    [[cx - w / 2 - 34, cx - W / 2 + 40], [cx + w / 2 + 34, cx + W / 2 - 40]].forEach(function (r) {
      c.beginPath(); c.moveTo(r[0], y - 9); c.lineTo(r[1], y - 9); c.stroke();
    });
  }

  function pill(c, text, cx, y, h, font, fill, ink, edge) {
    c.font = font;
    var w = c.measureText(text).width + h * 1.35;
    c.fillStyle = typeof fill === 'function' ? fill(cx - w / 2, y, w, h) : fill;
    c.beginPath();
    c.roundRect(cx - w / 2, y, w, h, h / 2);
    c.fill();
    if (edge) { c.strokeStyle = edge; c.lineWidth = 2.5; c.stroke(); }
    c.fillStyle = ink;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, cx, y + h / 2 + 1);
    c.textBaseline = 'alphabetic';
    return w;
  }

  var capLayout = null;          /* last layout, for the dev hook only */

  function drawCapture() {
    var cv = el('capture-cv');
    var c = cv.getContext('2d');
    if (!c) return;
    var W = cv.width, H = cv.height, CX = W / 2;
    var m = effMode();
    var wall = body.dataset.wall || 'base';

    var ink = cssVar('--os-ink') || '#3d2a63';
    var dim = cssVar('--os-ink-dim') || ink;
    var accent = cssVar('--os-accent') || '#a8348c';
    var deco = cssVar('--t-deco') || accent;
    var pillBg = cssVar('--os-pill') || '#ffffffe6';
    var grid = cssVar('--grid-line') || fade(ink) + '0.1)';

    c.clearRect(0, 0, W, H);
    c.textAlign = 'center';

    /* The per-weather sky token is read directly rather than through --os-sky,
       which is only ever `var(--sky-<mode>)`. Reading the literal keeps this
       independent of how far a given engine resolves custom-property chains,
       and it covers all twenty palettes for free. */
    var stops = (cssVar('--sky-' + m).match(/#[0-9a-f]{6}/gi) || ['#e8d5f7', '#c0d8f8']);
    var dark = isDark(stops[0]);
    var sg = c.createLinearGradient(0, 0, W, H);
    stops.forEach(function (col, i) { sg.addColorStop(i / Math.max(1, stops.length - 1), col); });
    c.fillStyle = sg;
    c.fillRect(0, 0, W, H);

    /* graph paper: a fine rule with a heavier one every fifth line */
    for (var pass = 0; pass < 2; pass++) {
      var step = pass ? 216 : 43.2;
      c.strokeStyle = grid;
      c.lineWidth = pass ? 2.5 : 1.4;
      c.globalAlpha = pass ? 1 : 0.62;
      for (var x = step; x < W; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke(); }
      for (var y = step; y < H; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
    }
    c.globalAlpha = 1;

    /* Everything painterly is clipped to the rim, so the card has a matte and
       the sun stops running off the corner. The graph paper deliberately is
       not clipped: it reads as the surface the card is printed on. */
    c.save();
    c.beginPath();
    c.roundRect(34, 34, W - 68, H - 68, 54);
    c.clip();
    scene(c, W, H, m, ink, deco, dark);
    wallpaper(c, W, H, wall, deco, accent, dark);
    c.restore();

    /* corner vignette: stops the art floating and gives the rim something
       to sit against */
    var vg = c.createRadialGradient(CX, H * 0.44, H * 0.3, CX, H * 0.44, H * 0.86);
    vg.addColorStop(0, fade(ink) + '0)');
    vg.addColorStop(1, fade(ink) + '0.14)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);

    rim(c, W, H, wall, deco, accent);

    /* ------------------------------------------------------------------ */

    var hero = capHero();
    var name = read('bearName', null) || S.bear.plate;
    var n = gotCount(), total = DEFS.length;
    var handle = read('handle', '');
    var pair = !!(handle && capPfp);

    /* With a pfp the portrait plate becomes a two-shot rather than gaining a
       second identity block beside it: the two of them were here, in one
       frame. Ownership then reads down the middle — the visitor's @ first, the
       bear's line under it — instead of competing for the same eye level. */
    /* Paired, the two of them are the same height and share a centre line. The
       bear's ink fills 31 of its 32 rows, so a 192px frame stands 186 tall and
       the pfp is drawn at 186 across to match exactly. 192 is 6x32: the sprite
       is only ever scaled by whole numbers. */
    var PORT = pair ? 468 : 300, PORTH = pair ? 272 : 300;
    /* The sheet frame is 40 but the animal only fills 32 of those rows, so the
       box is scaled up by 40/32 to keep the drawn bear the size the layout was
       built around. */
    var BEAR = (pair ? 192 : 264) * 1.25;
    var FACE = 186, OFF = 114;

    /* Badges accumulate across every visit on this device, so the row is a
       collection rather than a session log. Two rows is the display budget;
       whatever will not fit is counted rather than dropped, and the count is
       laid out first so the overflow chip can never be the one cut. */
    var chips = DEFS.filter(function (d) { return got[d[0]]; }).map(function (d) { return '✦ ' + d[1]; });
    /* Someone on their first visit has nothing, and an empty band under a
       label reads as a rendering failure. One pill saying so reads as a start. */
    if (!chips.length) chips = [S.cap.badgesNone];
    c.font = '700 ' + CAP.chip + 'px ' + MONO;

    /* ONE SOURCE OF TRUTH FOR A CHIP'S WIDTH, because there used to be two and
       they disagreed twice over.

       A chip was laid out here with `measureText(t) + 70` and then drawn by
       pill(), which measures the SAME text again and adds `h * 1.35` = 72.9.
       Two different paddings is a 3px drift per chip -- survivable. The font is
       what broke it: this ran with whatever c.font the previous slot happened
       to leave behind (the hallmark's 20px, or a fit() call's, depending on
       which pass of the fitting loop you were in) while the chips draw at 31px.
       Measuring 31px type at 20px underestimates every chip by a third, so the
       row was laid out to a width the pills then overflowed, and they printed
       through each other.

       So: the font is stated, not inherited, and the padding is the same
       expression pill() uses rather than a number that looks like it. */
    var CHIP_FONT = '700 ' + CAP.chip + 'px ' + MONO;
    function chipW(t) {
      c.font = CHIP_FONT;
      return c.measureText(t).width + CHIP_H * 1.35;
    }

    function fitRows(list) {
      var w = list.map(chipW);
      var out = [[]], run = 0;
      list.forEach(function (t, i) {
        if (run + w[i] > W - 200 && out[out.length - 1].length) { out.push([]); run = 0; }
        out[out.length - 1].push(i);
        run += w[i] + CHIP_GAP;
      });
      return { rows: out, w: w };
    }

    /* CENTRED ON ONE FIXED GAP, NOT JUSTIFIED. Justification was tried and
       binned: stretching the gaps to make both rows reach the same two
       verticals meant the space between "godparent" and "emotionally curious"
       was a different size from the space on the row below it, and the eye
       reads that as three badges of unequal importance rather than as a tidy
       block. These are tags, not a paragraph -- the thing worth keeping even is
       the rhythm between them, and a ragged right edge is the price.

       The overlap that started all this was never the gap. It was the
       measurement above. */

    var earned = chips.slice();
    var rows, cw, chipH;

    function layoutChips(maxRows) {
      var list = earned.slice(), shown = list.length;
      var laid = fitRows(list);
      while (laid.rows.length > maxRows && shown > 1) {
        shown -= 1;
        list = earned.slice(0, shown).concat([fmt(S.cap.more, { n: earned.length - shown })]);
        laid = fitRows(list);
      }
      return { chips: list, rows: laid.rows.slice(0, maxRows), cw: laid.w,
               h: Math.min(laid.rows.length, maxRows) * (CHIP_H + CHIP_GAP) };
    }

    /* Every text slot is fitted to this, so nothing can reach the frame. */
    var INNER = W - 200;
    var serial = cardSerial();
    var tier = serialTier(serial.no);

    /* ---- the hallmark ----
       A HALLMARK IS STRUCK INTO A CORNER, and a corner is defined by two edges.
       This used to be right-aligned to INNER and vertically centred on the
       title's baseline, which meant its two gaps were set by two unrelated
       things -- the text column's margin on one side and the height of a line
       of type on the other -- and came out 54 and 48. Close enough to look like
       a mistake rather than a decision.

       Both gaps are now the same number measured from the same thing: the
       rim's inner hairline, which sits 12 inside the 34px rim. */
    var RIM_IN = 46, MARK_PAD = 26;

    var hallmark = (function () {
      var cut = serial.no.indexOf('-');
      var run = cut < 0 ? serial.no : serial.no.slice(0, cut);
      var digits = cut < 0 ? '' : serial.no.slice(cut);
      /* No gap: the hyphen IS the join, and air in front of it turned
         ICYB-2530 into "ICYB minus 2530". */
      c.font = monoF(CAP.serial);
      var wRun = c.measureText(run).width;
      c.font = monoF(CAP.serial - 2);
      var wNum = c.measureText(digits).width;
      var padX = 17;
      return { run: run, digits: digits, wRun: wRun, padX: padX, h: 40,
               w: wRun + 1 + wNum + padX * 2 };
    }());

    function drawHallmark() {
      var right = W - RIM_IN - MARK_PAD;
      var top = RIM_IN + MARK_PAD;
      c.save();
      var hx = right - hallmark.w, hy = top, hw = hallmark.w, hh = hallmark.h;
      c.beginPath();
      c.roundRect(hx, hy, hw, hh, hh / 2);
      /* BAKED FOIL, AND ONLY ON THE HALLMARK. The site view already wears an
         animated holo over the whole card and it deliberately does not export;
         this is the part that has to survive the png, so it is drawn rather than
         styled. A specular band across it is what makes a still frame read as
         foil -- a real foil card photographs as one sweep too. */
      if (tier >= 1) {
        var fg = c.createLinearGradient(hx, hy, hx + hw, hy + hh);
        fg.addColorStop(0.00, '#ffd9f2'); fg.addColorStop(0.22, '#c9b6ff');
        fg.addColorStop(0.44, '#9fe8ff'); fg.addColorStop(0.63, '#c8ffe0');
        fg.addColorStop(0.82, '#ffe6ad'); fg.addColorStop(1.00, '#ffb3e4');
        c.fillStyle = fg;
        c.fill();
        c.save();
        c.clip();
        var sp = c.createLinearGradient(hx, hy, hx + hw * 0.9, hy + hh);
        sp.addColorStop(0.32, 'rgba(255,255,255,0)');
        sp.addColorStop(0.46, 'rgba(255,255,255,0.88)');
        sp.addColorStop(0.60, 'rgba(255,255,255,0)');
        c.fillStyle = sp; c.fillRect(hx, hy, hw, hh);
        c.restore();
        c.strokeStyle = 'rgba(255,255,255,0.95)';
      } else {
        c.fillStyle = fade('#ffffff') + (dark ? '0.14)' : '0.30)');
        c.fill();
        /* the rim is the accent at a third, not a grey: on a card where every
           colour comes from the live theme, a neutral hairline is the one stroke
           that would look imported */
        c.strokeStyle = fade(accent) + '0.34)';
      }
      c.lineWidth = 2;
      c.stroke();

      c.textAlign = 'left';
      c.textBaseline = 'middle';
      var tx = right - hallmark.w + hallmark.padX;
      var mid = top + hallmark.h / 2 + 1;
      /* Two weights, both coloured. The digits are the event and the run code
         labels them, so the run steps BACK in tone rather than out of the
         palette into grey -- one family, one hierarchy. */
      c.font = monoF(CAP.serial);
      c.fillStyle = tier >= 1 ? 'rgba(74,42,110,0.62)' : fade(accent) + '0.52)';
      c.fillText(hallmark.run, tx, mid);
      c.font = monoF(CAP.serial - 2);
      /* dark on foil regardless of theme: the accent is light on arcade and
         archangel and would vanish into the gradient it is sitting on */
      c.fillStyle = tier >= 1 ? '#4a2a6e' : accent;
      c.fillText(hallmark.digits, tx + hallmark.wRun + 1, mid);
      c.restore();
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
    }

    var fit, heroH, subFit, subH, blocks;

    function makeBlocks() { return [
      { h: 34, grow: 0.6, draw: function (y) {          /* the title, alone */
        /* The edition number is no longer in this block. It is a mark struck
           into the card's corner, so it is positioned off the RIM and drawn at
           card level; a number that belongs to the object should not be riding
           in the text column and moving whenever the text column does.

           The title is still fitted around it, because the two share a band
           about sixteen pixels tall and a long run code could otherwise reach
           the mark. */
        var label = serial.misprint ? S.cap.misprintEyebrow : S.cap.eyebrow;
        var room = INNER - 2 * (hallmark.w + 30);
        c.font = monoF(fitTracked(c, label, room, CAP.eyebrow, 16, monoF, 7));
        c.fillStyle = accent;
        tracked(c, label, CX, y + 28, 7);
      } },
      { h: PORTH, gap: 26, grow: 0.9, draw: function (y) { /* portrait plate */
        /* ONE OF ONE. Rays and a halo, drawn into the canvas BEFORE the plate so
           they sit behind the bear rather than over it -- and baked, because the
           card leaves here as a flat png and anything that only exists in CSS is
           not on the thing people actually see.
           They read at rest because they are a fixed-origin fan, not a motion
           effect: the same reason the ceremony's rays work as a still frame. */
        if (tier === 2) {
          var mx = CX, my = y + PORTH / 2, R = PORTH * 1.55;
          c.save();
          c.beginPath(); c.arc(mx, my, R, 0, Math.PI * 2); c.clip();
          for (var i = 0; i < 72; i++) {
            var a0 = (i / 72) * Math.PI * 2, a1 = a0 + 0.026;
            c.beginPath(); c.moveTo(mx, my);
            c.lineTo(mx + Math.cos(a0) * R, my + Math.sin(a0) * R);
            c.lineTo(mx + Math.cos(a1) * R, my + Math.sin(a1) * R);
            c.closePath();
            c.fillStyle = i % 2 ? fade('#ffffff') + '0.30)' : fade(accent) + '0.16)';
            c.fill();
          }
          /* the fan has a hard edge at the clip, so a halo fades it out */
          var hg = c.createRadialGradient(mx, my, PORTH * 0.30, mx, my, R);
          hg.addColorStop(0, fade('#ffffff') + '0.42)');
          hg.addColorStop(0.52, fade('#ffffff') + '0.10)');
          hg.addColorStop(1, fade('#ffffff') + '0)');
          c.fillStyle = hg; c.fillRect(mx - R, my - R, R * 2, R * 2);
          c.restore();
        }
        c.fillStyle = fade('#ffffff') + (dark ? '0.1)' : '0.34)');
        c.beginPath(); c.roundRect(CX - PORT / 2, y, PORT, PORTH, 44); c.fill();
        c.strokeStyle = fade('#ffffff') + '0.5)'; c.lineWidth = 2.5; c.stroke();
        var mid = y + PORTH / 2;
        var bx = pair ? CX + OFF : CX;                /* bear right when paired */
        var by = pair ? mid - BEAR / 2 : y + (PORTH - BEAR) / 2 - 6;
        /* The animal fills rows 3..34 of its 40-row frame, so its feet are at
           7/8 of the box, not the bottom of it. Anchoring the shadow to the
           frame instead left it floating a good 24px below the bear. */
        c.fillStyle = fade(ink) + '0.14)';
        c.beginPath();
        c.ellipse(bx, by + BEAR * 0.875, pair ? 74 : 88, pair ? 13 : 16,
          0, 0, Math.PI * 2);
        c.fill();
        sprite(c, 'bear-img', 0, capBearRow(m), bx - BEAR / 2, by, BEAR);
        if (pair) {
          /* light rim, not the accent: a saturated purple ring around a
             photograph read as a sticker border stuck onto the plate, where a
             white one belongs to the same glass the plate is made of */
          drawPfp(c, capPfp, CX - OFF, mid, FACE / 2,
            fade('#ffffff') + '0.6)', fade('#ffffff') + '0.92)');
        }
      } },
      { h: handle ? 40 : 0, gap: handle ? 22 : 0, grow: 0.45, draw: function (y) {
        if (!handle) return;
        c.font = monoF(fitOne(c, '@' + handle, INNER, 38, 18, monoF));
        c.fillStyle = accent;
        c.fillText('@' + handle, CX, y + 33);
      } },
      { h: 32, gap: handle ? 10 : 22, grow: 0.45, draw: function (y) {
        var bl = fmt(S.cap.bearLine, { name: name });
        c.font = monoF(fitOne(c, bl, INNER, handle ? 26 : 30, 14, monoF));
        c.fillStyle = dim;
        halo(c, dark, function () { c.fillText(bl, CX, y + 26); });
      } },
      { h: 30, gap: 30, grow: 0.9, draw: function (y) {   /* ruled label */
        ruledLabel(c, hero.label, CX, y + 26, W - 130, ink, accent);
      } },
      { h: heroH, gap: 18, grow: 0.3, draw: function (y) {
        c.fillStyle = ink;
        c.font = dispF(fit.size);
        fit.lines.forEach(function (ln, i) { c.fillText(ln, CX, y + fit.size + i * (fit.size + 12)); });
      } },
      { h: subH, gap: subH ? 16 : 0, grow: 0.3, draw: function (y) {
        if (!subFit) return;
        c.fillStyle = dim;
        c.font = monoF(subFit.size);
        halo(c, dark, function () {
          subFit.lines.forEach(function (ln, i) {
            c.fillText(ln, CX, y + subFit.size + i * (subFit.size + 8) - 4);
          });
        });
      } },
      { h: 26, gap: 26, grow: 0.5, draw: function (y) {  /* the collection's label */
        c.font = monoF(fitTracked(c, S.cap.badgesLabel, INNER, 26, 14, monoF, 4));
        c.fillStyle = dim;
        halo(c, dark, function () { tracked(c, S.cap.badgesLabel, CX, y + 22, 4); });
      } },
      { h: chipH, gap: 14, grow: 0.9, draw: function (y) { /* the collection */
        c.font = CHIP_FONT;
        rows.forEach(function (row, ri) {
          var tot = row.reduce(function (s, i) { return s + cw[i] + CHIP_GAP; }, 0) - CHIP_GAP;
          var x0 = CX - tot / 2;
          row.forEach(function (i) {
            pill(c, chips[i], x0 + cw[i] / 2, y + ri * (CHIP_H + CHIP_GAP), CHIP_H,
              CHIP_FONT, pillBg, accent, fade('#ffffff') + '0.7)');
            x0 += cw[i] + CHIP_GAP;
          });
        });
      } },
      { h: 62, gap: 30, grow: 1.15, draw: function (y) {   /* the theme plate */
        var top = wall === 'archangel';
        pill(c, '✦ ' + (S.themes[wall] || wall).toUpperCase() + ' ✦', CX, y, 62,
          '700 34px ' + MONO,
          top ? function (px, py, pw, ph) { return platinum(c, px, py, px + pw, py + ph); } : pillBg,
          top ? PLAT_INK : ink,
          top ? fade('#ffffff') + '0.85)' : deco);
      } },
      { h: 28, gap: 16, grow: 0.4, draw: function (y) { /* the aspiration */
        /* `tier` is the serial's grade, computed once above beside the
           hallmark's foil -- so the word and the foil can never disagree about
           whether a card is special. */
        var asp = fmt(S.cap.tier, {
          tier: S.cap.tiers[TIER_WORD[tier]] || S.cap.tiers.standard, n: n, t: total
        });
        c.font = monoF(fitOne(c, asp, INNER, 27, 14, monoF));
        c.fillStyle = dim;
        halo(c, dark, function () { c.fillText(asp, CX, y + 23); });
      } },
      { h: 26, gap: 34, grow: 1.4, draw: function (y) { /* the receipt */
        var d = new Date();
        var rec = d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
          .toUpperCase() + ' · ' + fmt(S.cap.visit, { n: visits.count }).toUpperCase();
        /* the eyebrow gave its line to the stamp, so the number moves here */
        if (serial.misprint) rec += ' · No. ' + serial.no;
        c.font = monoF(fitTracked(c, rec, INNER, CAP.stamp, 14, monoF, 3));
        c.fillStyle = fade(dim) + '0.95)';
        halo(c, dark, function () { tracked(c, rec, CX, y + 22, 3); });
      } }
    ]; }

    /* The verdict is the elastic block. Shrink it until the whole column fits
       the frame: a two-line title used to overflow by 250px, which column()
       then shared out as negative advances and drew the wordmark on top of the
       receipt. Fitting first means the footer always lands where it belongs. */
    /* The wordmark is a footer, not a flow block: it is pinned to one baseline
       so it lands on the same line whether the card is full or nearly empty,
       and the column simply ends above it. */
    var FOOT_BASE = wordmarkBaseline(H, 34, CAP.foot);   /* rim inset is 34 here */
    var TOP = 88, BOT = FOOT_BASE - Math.round(CAP.foot * 0.72) - 28;
    var AVAIL = BOT - TOP;

    function need() {
      var t = 0;
      blocks.forEach(function (b, i) { t += b.h + (i ? (b.gap || 0) : 0); });
      return t;
    }

    /* Two levers, tried in order of what costs the card least: shrink the
       verdict, then give up the second badge row (the roster already collapses
       into a "+N more" chip, so nothing is lost). Only if both are exhausted
       does column() squeeze the gaps -- and it can no longer overlap. */
    var fitted = false;
    [2, 1].forEach(function (maxRows) {
      if (fitted) return;
      var ch = layoutChips(maxRows);
      chips = ch.chips; rows = ch.rows; cw = ch.cw; chipH = ch.h;
      var titleSize = CAP.title;
      for (var tries = 0; tries < 40; tries++) {
        fit = fitLines(c, hero.title, INNER, titleSize, CAP.titleMin, dispF, 2);
        heroH = fit.lines.length * (fit.size + 12);
        /* the subtitle is one sentence, so try to keep it on one line and let
           it shrink; only wrap once one line would drop below readable. Two
           lines cost ~50px, which is most of a badge row. */
        subFit = null;
        if (hero.sub) {
          subFit = fitLines(c, hero.sub, INNER, CAP.sub, 30, monoF, 1);
          if (subFit.lines.length > 1) {
            subFit = fitLines(c, hero.sub, INNER, CAP.sub, CAP.subMin, monoF, 2);
          }
        }
        subH = subFit ? subFit.lines.length * (subFit.size + 8) : 0;
        blocks = makeBlocks();
        if (need() <= AVAIL) { fitted = true; return; }
        if (fit.size <= CAP.titleMin) return;
        titleSize = Math.max(CAP.titleMin, fit.size - 4);
      }
    });

    /* 4:5 is the shape, but the content lives inside the 1:1 centre crop of it
       (y 135..1215 of 1350). X shows portrait images uncropped in the timeline
       today, and 4:5 is well inside what it allows — but crop rules change,
       every surface has its own, and the one thing that can never be cut is the
       wordmark, because the url lives in the pixels. So the art bleeds to 4:5
       and the type stays square-safe. Costs a little air, buys immunity. */
    var used = 0;
    blocks.forEach(function (b, i) { used += b.h + (i ? (b.gap || 0) : 0); });
    var gapTotal = 0;
    blocks.forEach(function (b, i) { if (i) gapTotal += b.gap || 0; });
    var slack = gapTotal - (blocks.length - 1) * MIN_GAP;
    var sq = used > AVAIL ? (slack > 0 ? Math.min(1, (used - AVAIL) / slack) : 1) : 0;
    var minGap = Infinity;
    blocks.forEach(function (b, i) {
      if (!i || !b.h) return;          /* optional blocks collapse to h:0, gap:0 */
      var g = b.gap || 0;
      minGap = Math.min(minGap, sq ? Math.max(MIN_GAP, g - (g - MIN_GAP) * sq) : g);
    });
    capLayout = {
      inner: INNER, top: TOP, bottom: BOT, avail: BOT - TOP, used: used,
      overflow: Math.max(0, used - (BOT - TOP)),
      squeeze: +sq.toFixed(3), minGap: Math.round(minGap), chipRows: rows.length,
      title: { size: fit.size, lines: fit.lines.slice() },
      sub: subFit ? { size: subFit.size, lines: subFit.lines.slice() } : null,
      widths: (function () {
        var out = [];
        c.font = dispF(fit.size);
        fit.lines.forEach(function (l) { out.push(['title', Math.round(c.measureText(l).width)]); });
        if (subFit) {
          c.font = monoF(subFit.size);
          subFit.lines.forEach(function (l) { out.push(['sub', Math.round(c.measureText(l).width)]); });
        }
        return out;
      })()
    };

    column(blocks, TOP, BOT);
    drawHallmark();
    wordmark(c, 'icybear.fun', CX, FOOT_BASE, CAP.foot);

    if (got.all && wall !== 'archangel') {
      c.save();
      c.shadowColor = PLAT_GLOW; c.shadowBlur = 24;
      c.strokeStyle = platinum(c, 14, 14, W - 14, H - 14);
      c.lineWidth = 10;
      c.beginPath(); c.roundRect(14, 14, W - 28, H - 28, 42); c.stroke();
      c.restore();
    }

    /* THE MISPRINT, drawn last so it sits on top of everything the way a real
       one would -- the error happens at the press, after the art is already on
       the paper.

       Two marks, both borrowed from actual printing faults. A misregistered rim
       is the plates being a few thousandths out of line, so the same frame is
       stroked twice more in cyan and magenta at plus and minus three pixels,
       screened so it tints rather than covers. Then the stamp: rotated, hollow,
       low-contrast, the way a rejected sheet gets marked before it is pulled.

       Nothing here is an upgrade. No gold, no extra badge, no brighter
       anything. A misprint is a factory error and the joke only lands if it
       reads as one. */
    if (serial.misprint) {
      c.save();
      c.globalCompositeOperation = 'screen';
      c.lineWidth = 5;
      c.strokeStyle = 'rgba(0,220,255,0.5)';
      c.beginPath(); c.roundRect(34 - 3, 34 + 3, W - 68, H - 68, 54); c.stroke();
      c.strokeStyle = 'rgba(255,0,190,0.5)';
      c.beginPath(); c.roundRect(34 + 3, 34 - 3, W - 68, H - 68, 54); c.stroke();
      c.restore();

      /* Corner, not centre. Centred it sat straight across the headline and the
         badge row, which makes the card unpostable -- and an unpostable card is
         a punishment, not a rarity. A reject stamp goes in a corner anyway, at
         an angle, half off the sheet. */
      c.save();
      c.translate(W * 0.70, H * 0.845);
      c.rotate(-0.30);
      var stampW = W * 0.52, stampH = 104;
      c.lineWidth = 6;
      c.strokeStyle = fade('#ff2f6d') + '0.42)';
      c.beginPath(); c.roundRect(-stampW / 2, -stampH / 2, stampW, stampH, 12); c.stroke();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = monoF(46);
      c.fillStyle = fade('#ff2f6d') + '0.42)';
      tracked(c, S.cap.misprintStamp, 0, -12, 8);
      c.font = monoF(17);
      tracked(c, 'DO NOT DISTRIBUTE', 0, 26, 5);
      c.restore();
      c.textBaseline = 'alphabetic';
    }

    /* warmed on every redraw, so 'cap-post' has nothing left to await. Opening
       the X intent from inside a promise chain is what Safari blocked, and a
       blob cached once at open time would go stale when the theme redraws. */
    captureBlob().then(function (b) { capBlob = b; });
  }

  /* <details> because the browser already knows how to open and close a
     disclosure, remembers which ones are open while the window lives, and
     gives every question keyboard and screen-reader behaviour for free. The
     answers carry inline markup on purpose: they are authored in the copy
     sheet, not typed by visitors. */
  function renderFaq() {
    var host = el('faq-list');
    if (!host) return;
    host.innerHTML = S.faq.groups.map(function (group) {
      return '<div class="section-heading"><h3 class="section-heading__label">' + group[0] +
             '</h3><div class="section-heading__line" aria-hidden="true"></div></div>' +
             group[1].map(function (qa) {
               return '<details class="faq"><summary class="faq__q">' + qa[0] +
                      '</summary><p class="faq__a">' + qa[1] + '</p></details>';
             }).join('');
    }).join('');
  }

  function shareText() {
    var d = read('diag', null);
    if (d && d.name) return fmt(S.cap.shareDiag, { d: d.name + (d.line ? ' ✦ ' + d.line : '') });
    var last = latestBadge();
    if (last) return fmt(S.cap.shareAch, { a: last[1] });
    return fmt(S.cap.sharePlain, { name: read('bearName', null) || 'the bear' });
  }

  /* ---- the card is held, not displayed ----------------------------------
     Tilt tracks the pointer across the card's own box; the foil sweep and the
     sparkle drift are CSS and run on their own, so the card is alive before
     anyone touches it. Pointer events cover mouse, pen and drag on a phone
     from one handler. Nothing here touches the canvas, so the exported PNG is
     unchanged: the foil is the moment, the flat card is the artefact. */

  var MAX_TILT = 11;

  function tiltFrom(e) {
    var card = el('capcard');
    var r = card.getBoundingClientRect();
    var px = clamp((e.clientX - r.left) / r.width, 0, 1);
    var py = clamp((e.clientY - r.top) / r.height, 0, 1);
    card.setAttribute('data-live', '');
    card.style.setProperty('--tilt-y', ((px - 0.5) * 2 * MAX_TILT).toFixed(2) + 'deg');
    card.style.setProperty('--tilt-x', ((0.5 - py) * 2 * MAX_TILT).toFixed(2) + 'deg');
    card.style.setProperty('--glare-x', (px * 100).toFixed(1) + '%');
    card.style.setProperty('--glare-y', (py * 100).toFixed(1) + '%');
    card.style.setProperty('--glare-a', '1');
  }

  function restCard() {
    var card = el('capcard');
    card.removeAttribute('data-live');     /* hand it back to the easing */
    card.style.setProperty('--tilt-x', '0deg');
    card.style.setProperty('--tilt-y', '0deg');
    card.style.setProperty('--glare-a', '0');
  }

  /* a saved handle warms its pfp at boot, so the first card open already has
     it rather than popping in a second later */
  if (read('handle', '')) loadPfp(read('handle', ''), function () {});

  el('cap-handle').addEventListener('keydown', function (e) {
    e.stopPropagation();
    if (e.key === 'Enter') ACTIONS['cap-id']();
  });

  el('capcard').addEventListener('pointermove', tiltFrom);
  el('capcard').addEventListener('pointerleave', restCard);
  el('capcard').addEventListener('pointercancel', restCard);

  /* Three badges in is the moment a visitor has something worth keeping, and
     the moment the offer stops feeling like a signup wall. Before that there is
     nothing to lose and asking would only be friction. */
  var saveFault = null;      /* why the last mint failed, for the panel to say */

  function mintSaveIfEarned() {
    if (read('saveKey', null) || gotCount() < 3) return;
    var key;
    try { key = mintKey(); } catch (e) { return; }   /* no crypto: skip, silently */
    var p = savePayload();
    p.op = 'create'; p.key = key;
    saveCall(p).then(function (res) {
      if (res.ok) {
        saveFault = null;
        write('saveKey', key);
        toast(S.app.pkeyMade, 'v95');
        return;
      }
      /* 'retry' means the hash already exists: that key would open somebody
         else's save. Mint a different one rather than collide. */
      if (res.body.error === 'retry') { setTimeout(mintSaveIfEarned, 200); return; }
      saveFault = res.body.error || 'backend';
    }, function () { saveFault = 'backend'; });
  }

  /* ---- product key panel rendering ---- */
  var pkeyMode = 'view';        /* view | restore */
  var pkeyShown = false;        /* revealed only while the button is held */

  function maskedKey(k) {
    return prettyKey(k).replace(/[^-]/g, '\u2022').replace(/^.{5}/, KEY_PREFIX);
  }

  function renderPkey() {
    var k = read('saveKey', null);
    var line = slot('pkey-code');
    if (pkeyMode === 'restore') {
      line.innerHTML = '';
      var inp = document.createElement('input');
      inp.className = 'field';
      inp.id = 'pkey-in';
      inp.placeholder = S.app.pkeyAsk;
      inp.autocomplete = 'off';
      inp.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') doRestore(inp.value);
      });
      line.appendChild(inp);
      inp.focus();
    } else {
      line.textContent = k ? (pkeyShown ? prettyKey(k) : maskedKey(k)) : '—';
    }
    slot('pkey-say').textContent = '';
  }

  function doRestore(raw) {
    if (!parseKey(raw)) {                    /* checksum: caught here, no round trip */
      slot('pkey-say').textContent = S.app.pkeyBadFormat;
      return;
    }
    if (!window.confirm(S.app.pkeyReplaceWarn)) return;
    slot('pkey-say').textContent = '…';
    saveCall({ op: 'redeem', key: raw }).then(function (res) {
      if (!res.ok) {
        slot('pkey-say').textContent =
          res.body.error === 'rate' ? S.app.pkeyOffline : S.app.pkeyUnknown;
        return;
      }
      applySave(res.body, canonKey(raw));
      pkeyMode = 'view'; pkeyShown = false;
      renderPkey();
      slot('pkey-say').textContent = S.app.pkeyRestored;
      chime();
    }, function () { slot('pkey-say').textContent = S.app.pkeyOffline; });
  }

  /* Badges UNION so a restore can only ever add. Scalars come from the save,
     because restoring is an explicit "this is my profile" act -- which is why
     it warns first. Visits take the higher of the two. */
  function applySave(data, key) {
    var mine = read('ach', []);
    var merged = mine.slice();
    (data.ach || []).forEach(function (id) {
      if (merged.indexOf(id) === -1) merged.push(id);
    });
    write('saveKey', key);
    write('ach', merged);
    if (data.bear) write('bearName', data.bear);
    if (data.theme) write('wall', data.theme);
    var v = read('visits', { count: 0 });
    v.count = Math.max(v.count || 0, data.visits || 0);
    write('visits', v);
    setTimeout(function () { location.reload(); }, 900);
  }

  /* hold to reveal: pointerup anywhere re-masks, so it cannot be left showing */
  (function () {
    var peek = document.querySelector('[data-act="pkey-peek"]');
    if (!peek) return;
    var show = function (on) {
      if (pkeyMode !== 'view' || !read('saveKey', null)) return;
      pkeyShown = on;
      slot('pkey-code').textContent = on
        ? prettyKey(read('saveKey', null)) : maskedKey(read('saveKey', null));
      if (on) slot('pkey-say').textContent = S.app.pkeyStream;
    };
    peek.addEventListener('pointerdown', function (e) { e.preventDefault(); show(true); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      peek.addEventListener(ev, function () { show(false); });
    });
    window.addEventListener('blur', function () { show(false); });
  })();

  el('pkey').addEventListener('click', function (e) {
    if (e.target === el('pkey')) closePkey();
  });

  el('settings').addEventListener('click', function (e) {
    if (e.target === el('settings')) closeSettings();
  });

  function closeSettings() {
    el('settings').removeAttribute('data-open');
    el('settings').setAttribute('aria-hidden', 'true');
  }

  function closePkey() {
    pkeyShown = false;
    pkeyMode = 'view';
    el('pkey').removeAttribute('data-open');
    el('pkey').setAttribute('aria-hidden', 'true');
  }

  /* THE CARD HAD NO INVITATION. openCapture() had exactly one caller: a dock
     button whose tooltip says PRINT SCREEN, which is a description of the
     mechanism rather than of the thing anyone wants. Sharing peaks in the ten
     seconds after something good happens, and the site was silent in exactly
     that window.

     So four moments now ask: the third badge, coming back from the chart with a
     fresh diagnosis, finishing the snowman, and 13/13. Once per session, ever,
     across all four -- a second one is nagging. Nothing opens by itself; the
     toast says what happened and the dock camera rings for four seconds. */
  function nudgeCapture(reason) {
    if (onPhone()) return;             /* the phone dock has no camera tooltip */
    try {
      if (sessionStorage.getItem(NS + 'nudged') === '1') return;
      sessionStorage.setItem(NS + 'nudged', '1');
    } catch (e) {
      /* storage refused: nudge once per page instead of never */
      if (nudgeCapture.done) return;
      nudgeCapture.done = true;
    }
    var cam = document.querySelector('#dock .dbtn[data-act="capture"]');
    if (cam) {
      cam.setAttribute('data-nudge', '');
      setTimeout(function () { cam.removeAttribute('data-nudge'); }, 4600);
    }
    showToast(S.nudge[reason] || S.nudge.badge, openCapture, S.nudge.tip);
  }

  /* THE EDITION NUMBER.

     Minted once, on the first card ever opened, and never again -- the number
     is the visitor's, not the screenshot's, so re-opening the card cannot
     reroll it and a misprint stays a misprint forever. Kept in `serial` and
     synced with the save row, so the product key carries it across a device.

     WHY IT IS NOT A COUNTER. The obvious version is a server sequence and it
     is written and ready in supabase/migrations/0005_card_serial.sql -- but a
     public counter is a public census, and a card that says No. 0012 tells
     everyone who sees it that twelve people have been here. So the run starts
     at 888 and the four digits are drawn rather than counted: it reads as an
     edition code, which is what it is, instead of as a visitor tally, which is
     what nobody wants it to be. When the sequence ships, new cards take their
     number from it and existing ones keep the one they already have.

     ONE IN FORTY IS A MISPRINT. Its own run prefix, a misregistered rim and a
     stamp across the corner. Weird, not better: the misprint has no extra
     badge, no gold, nothing a collector would rather own -- it is a factory
     error, and the joke only works if it reads as one. */
  var MISPRINT_ODDS = 40;

  /* ---- WHICH NUMBERS ARE WORTH SOMETHING ---------------------------------
     Two reserved, and everything else is luck. 0001 and 8888 are pre-inserted
     rows in the table, so the draw can never return them and they are handed
     out by claim code instead -- which is also what keeps the proprietor out of
     the queue for 0001.

     Rare is deliberately thin: about 35 numbers in 9999, so roughly 35 of these
     will ever exist. Because the server draws rather than counts, rarity is a
     lottery rather than a function of arrival order, and nothing on the card
     leaks how many people have been here.

     A rare number can still misprint. They stack: the holo lives on the
     hallmark and the misregistration lives on the rim, so the two do not fight,
     and MP-1111 is the rarest object the site can produce. */
  /* The reserved run: never drawn, only handed out by one-time claim code, so
     these are the three that exist outside the lottery entirely. Keep this in
     step with the rows in migration 0006 -- a number that is SUPER here but not
     reserved there can be dealt to a stranger. */
  var SUPER = { '0001': 1, '8888': 1, '0621': 1 };

  var RARE = (function () {
    var r = {};
    function add(n) { r[n] = 1; }
    /* repdigits, three and four long */
    for (var d = 1; d <= 9; d++) {
      add('0' + d + d + d);
      add('' + d + d + d + d);
    }
    /* the clock family, the ones people actually mean by "angel number" */
    ['1010', '1212', '1313', '1414', '1515', '1616', '1717', '1818', '1919'].forEach(add);
    /* named: covenant hour, the CT origin year, the launch year, leet, the 404
       this site already has a joke about, two of Icy's own, and the sequence */
    ['1333', '2021', '2026', '1337', '0404', '0420', '0069', '0007', '1234'].forEach(add);
    /* Icy's own additions. THIS FILE SHIPS TO EVERY VISITOR, so the numbers are
       public the moment they are here -- which is fine, they are a costume, and
       the draw is server-side. What must NOT go here is what any of them mean:
       a list of numbers is nothing, and a list of numbers annotated with whose
       birthday each one is, is somebody else's personal data published in a
       public repo. 1212 is deliberately absent -- the clock family above
       already carries it. */
    ['0626', '0103', '0221', '0337', '0915'].forEach(add);
    return r;
  }());

  /* The word the card prints for each tier. Same index as serialTier's return,
     so the two cannot drift. */
  var TIER_WORD = ['standard', 'special', 'one'];

  /* 0 ordinary, 1 rare, 2 one-of-one. Reads the digits off either run code. */
  function serialTier(no) {
    var cut = String(no || '').indexOf('-');
    var digits = cut < 0 ? '' : String(no).slice(cut + 1);
    if (SUPER[digits]) return 2;
    if (RARE[digits]) return 1;
    return 0;
  }


  function rand4() {
    try {
      var a = new Uint16Array(1);
      crypto.getRandomValues(a);
      return (a[0] % 9999) + 1;
    } catch (e) { return Math.floor(Math.random() * 9999) + 1; }
  }

  function pad4(n) { return ('000' + n).slice(-4); }

  function heldSerial() {
    var v = read('serial', null);
    return (v && typeof v === 'object' && typeof v.no === 'string') ? v : null;
  }

  /* The offline path, and the only place a number is invented locally. */
  function mintLocal() {
    var miss = rand4() % MISPRINT_ODDS === 0;
    /* THE PREFIX IS A SERIES, NOT A COUNT. It used to be 888, and a number in
       front of a number reads as a quantity: 888-0417 invites "417 of 888",
       which is exactly the census the serial exists to avoid. Letters cannot be
       mistaken for a total. ICYB is the standard run, MP the misprint run,
       numbered separately the way a real reject sheet is. */
    var v = { no: (miss ? 'MP-' : 'ICYB-') + pad4(rand4()), misprint: miss };
    write('serial', v);
    return v;
  }

  function cardSerial() { return heldSerial() || mintLocal(); }

  /* ASK THE SERVER, ONCE, AND ONLY IF THERE IS NOTHING TO KEEP.
     The number is permanent: a card somebody has already posted must keep the
     number it was posted with, so a serial that exists is never re-asked and
     never overwritten. That is also why this runs before the first draw rather
     than after -- upgrading a number the visitor has already seen would be the
     same thing as rerolling it.

     The server draw is what makes numbers unique; the local mint is what makes
     the card work on a plane. The misprint stays a client-side coin flip either
     way: it is a costume, and the server has no opinion about it. */
  function withSerial(done) {
    if (heldSerial() || !backendUp()) { done(); return; }
    var settled = false;
    function finish() { if (!settled) { settled = true; done(); } }
    /* never let a slow backend hold the card shut */
    var bail = setTimeout(function () { mintLocal(); finish(); }, 2500);
    fetch(GB.url + '/functions/v1/card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 apikey: GB.key, Authorization: 'Bearer ' + GB.key },
      body: JSON.stringify({ op: 'mint' })
    }).then(function (r) { return r.json(); }).then(function (j) {
      clearTimeout(bail);
      if (j && j.ok && typeof j.no === 'string') {
        write('serial', { no: j.no, misprint: rand4() % MISPRINT_ODDS === 0 });
      } else { mintLocal(); }
      finish();
    }, function () { clearTimeout(bail); mintLocal(); finish(); });
  }

  /* ONE-TIME CODES, for the two numbers the draw can never return.
     icybear.fun/?k=<code> -- the claim OVERWRITES, unlike every other path
     here, because that is the entire point of it: it is how a device that has
     already been testing gets the number it was always meant to have. */
  (function claimFromUrl() {
    var m = /[?&]k=([a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5})/.exec(location.search);
    if (!m) return;
    /* out of the address bar immediately: a claim code in a URL is a code in
       someone's history, their screenshot and their paste buffer */
    try {
      history.replaceState(null, '', location.pathname + location.hash);
    } catch (e) { /* file:// and the like */ }
    if (!backendUp()) { toast(S.cap.claimOffline, 'camera'); return; }
    fetch(GB.url + '/functions/v1/card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
                 apikey: GB.key, Authorization: 'Bearer ' + GB.key },
      body: JSON.stringify({ op: 'claim', code: m[1] })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.ok && typeof j.no === 'string') {
        write('serial', { no: j.no, misprint: false });
        toast(fmt(S.cap.claimed, { no: j.no }), 'camera');
        sfx('unlock');
      } else {
        toast(S.cap.claimSpent, 'camera');
      }
    }, function () { toast(S.cap.claimOffline, 'camera'); });
  }());

  function openCapture() {
    /* The number has to exist before the first stroke: drawCapture() reads it
       synchronously, and a card drawn with a local mint and then corrected a
       moment later is a card whose number changed while somebody watched. */
    if (!heldSerial()) { withSerial(openCapture); return; }
    /* the note is a different promise on a phone, where post opens the share
       sheet rather than filling the clipboard */
    var note = document.querySelector('[data-fill="cap-note"]');
    if (note) note.textContent = onPhone() ? S.cap.notePhone : S.cap.note;
    el('cap-handle').placeholder = S.cap.idPh;
    el('cap-handle').value = read('handle', '');
    var run = function () {
      drawCapture();
      el('capture').setAttribute('data-open', '');
      el('capture').setAttribute('aria-hidden', 'false');
      sfx('shutter');
    };
    /* the spec is explicit: load the exact weights, then wait, then draw once */
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load('110px "Bagel Fat One"'),
        document.fonts.load('700 44px "Space Mono"')
      ]).then(function () { return document.fonts.ready; }).then(run, run);
    } else run();
  }

  var capBlob = null;

  function captureBlob() {
    return new Promise(function (resolve) {
      var cv = el('capture-cv');
      if (cv.toBlob) cv.toBlob(resolve, 'image/png');
      else resolve(null);
    });
  }

  /* Copies the frame already warmed by drawCapture(). Separate from
     copyCapture() because that one re-exports the canvas first, and that
     async hop is exactly what costs us document focus when a tab is about to
     open. Callers that are not racing a window.open() should use the other. */
  function copyWarmCapture() {
    if (!capBlob || !navigator.clipboard || !window.ClipboardItem) {
      return toast(S.cap.noCopy, 'camera');
    }
    navigator.clipboard.write([new window.ClipboardItem({ 'image/png': capBlob })])
      .then(function () { toast(S.cap.copied, 'camera'); },
            function () { toast(S.cap.noCopy, 'camera'); });
  }

  function copyCapture() {
    return captureBlob().then(function (blob) {
      if (!blob || !navigator.clipboard || !window.ClipboardItem) throw new Error('no clipboard');
      return navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
    }).then(function () {
      toast(S.cap.copied, 'camera');
      return true;
    }, function () {
      toast(S.cap.noCopy, 'camera');
      return false;
    });
  }

  /* ==========================================================================
     MENU BAR + delegated actions.
     Every click target in the OS is declared in markup, so re-rendered
     components (the mood ring) keep working without rebinding.
     ========================================================================== */

  function closeMenus() {
    all('.mdrop[data-open]').forEach(function (d) {
      d.removeAttribute('data-open');
      document.querySelector('[data-menu="' + d.id + '"]').setAttribute('aria-expanded', 'false');
    });
  }

  var ACTIONS = {
    sound: function () { setSound(!soundIsOn()); },

    'mode-cycle': function () { setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]); },

    mood: function () { icySay(S.mood.lines[effMode()]); },

    delulu: function () { toast(pick(S.affirmations), 'flower'); sfx('delulu'); },

    'save-nothing': function () { toast(S.sys.saveNothing, 'v95'); },

    exit: function () { toast(S.sys.exit, '✦'); },

    delusion: newDelusion,

    /* On a phone the moon is the lock button, not shutdown: "gn" pulling a
       full-screen curtain over a phone is a desktop gesture, and the phone
       already has a lock screen that means exactly this. */
    gn: function () {
      if (onPhone()) {
        el('lock').removeAttribute('data-unlocked');
        el('home').removeAttribute('data-on');
        closeApp();
        sfx('close');
        return;
      }
      el('gn').setAttribute('data-open', '');
      sfx('gn');
    },

    /* The dock button that called this was a testing affordance and is gone.
       The action stays: #phone-close still clears data-preview, onPhone() still
       reads it, and the preview is one line away in a console if it is ever
       wanted again. Deleting it would strand that close handler. */
    phone: function () { body.setAttribute('data-preview', ''); },

    themes: function () { el('theme-sheet').toggleAttribute('data-open'); sfx('mode'); },

    'themes-close': function () { el('theme-sheet').removeAttribute('data-open'); },

    capture: openCapture,

    'cap-close': function () {
      el('capture').removeAttribute('data-open');
      el('capture').setAttribute('aria-hidden', 'true');
    },

    'konami-off': function () { konamiMode(false); },
    'konami-toggle': function () { konamiMode(); },

    'cap-id': function () {
      var typed = cleanHandle(el('cap-handle').value);
      write('handle', typed);
      el('cap-handle').value = typed;
      if (!typed) {
        capPfp = null;
        drawCapture();
        return toast(S.cap.idCleared, 'camera');
      }
      loadPfp(typed, function (ok) {
        drawCapture();
        toast(ok ? S.cap.idSet : S.cap.idNoPfp, 'camera');
      });
    },

    'cap-copy': copyCapture,

    'cap-save': function () {
      captureBlob().then(function (blob) {
        if (!blob) throw new Error('no blob');
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = S.cap.filename;
        a.click();
        /* the object URL outlives the click, so let it go on the next tick */
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        toast(S.cap.saved, 'camera');
      }).catch(function () { toast(S.cap.noCopy, 'camera'); });
    },

    'cap-post': function () {
      var text = shareText();
      var intent = 'https://x.com/intent/post?text=' + encodeURIComponent(text);

      /* `navigator.share` existing is NOT a phone signal. Desktop Chrome and
         Safari both expose it, and canShare({files}) passes there, so this
         handler used to open the macOS share sheet -- AirDrop, Messages,
         Notes -- instead of x, on the one machine the site gets demoed from.
         A coarse pointer is the honest check. Same gate chart.js uses. */
      var coarse = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      var file = null;
      if (capBlob && window.File) {
        try { file = new File([capBlob], S.cap.filename, { type: 'image/png' }); }
        catch (e) { file = null; }         /* some browsers throw on the ctor */
      }
      if (coarse && navigator.share && file &&
          navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], text: text })
          .catch(function () { /* the visitor dismissed the sheet. fine. */ });
        return;
      }

      /* The clipboard write has to be ISSUED before window.open(): it needs
         the document focused, and the new tab takes focus away. This ran
         after, behind captureBlob()'s async hop, so on desktop the copy
         always lost the race -- "couldn't copy" toast, empty clipboard, every
         time. Both calls stay inside the gesture, so neither is blocked. */
      copyWarmCapture();
      window.open(intent, '_blank', 'noopener');
    },

    'open-readme': function () { openWin('readme'); },

    /* reachable from two places, and each has to get out of its own way:
       the help menu on desktop, the settings sheet on the phone. */
    faq: function () { closeMenus(); closeSettings(); openWin('faq'); },

    /* Settings is chrome, not an app: it never calls noteApp, so it cannot
       become a fourteenth entry and change what 13/13 requires. */
    'settings': function () {
      slot('set-say').textContent = '';
      el('settings').setAttribute('data-open', '');
      el('settings').setAttribute('aria-hidden', 'false');
      closeMenus();
      sfx('open');
    },

    'about': function () { slot('set-say').textContent = S.app.setAboutSay; },

    /* A real "clear my data" affordance -- useful on a shared device, and the
       thing a privacy note can point at. It also teaches what the key is for:
       this wipes the device, and the key brings it all back. */
    'forget-me': function () {
      if (!window.confirm(S.app.setForgetWarn)) return;
      try {
        /* EVERY namespace, not just the current one. migrate() copies keys
           forward from older versions and deliberately never deletes the
           originals, so clearing only icybear.v{VERSION}. leaves the old copies
           sitting there -- and the reload at the end of this handler runs
           migrate(), which would carry them straight back in. Harmless while
           VERSION is 1 and the migrate loop never executes; silently
           un-forgetting someone the moment it becomes 2. Fixed now, while it
           costs one loop. */
        for (var v = VERSION; v >= 1; v--) {
          var ns = 'icybear.v' + v + '.';
          KEYS.forEach(function (k) { localStorage.removeItem(ns + k); });
          /* belt and braces: saveKey is in KEYS now, but forgetting a device
             must not quietly stop working if someone ever edits that array. */
          localStorage.removeItem(ns + 'saveKey');
        }
      } catch (e) { /* private mode: nothing to clear */ }
      slot('set-say').textContent = S.app.setForgetDone;
      setTimeout(function () { location.reload(); }, 900);
    },

    /* ---- the product key ------------------------------------------------
       Opens MASKED. Copy and download both work without ever revealing it, so
       the ordinary path never puts the key on screen at all. Revealing needs
       the button held down, because the real risk here is not a stray
       screenshot -- drawCapture paints from data and cannot leak it -- it is
       that icy screen-shares and streams. The danger is while you are
       deliberately looking at it, which auto-dismiss does nothing about. */
    'product-key': function () {
      var k = read('saveKey', null);
      pkeyMode = 'view';
      pkeyShown = false;
      renderPkey();
      /* Distinguish "you have not earned one" from "we tried and could not".
         Saying "earn a few badges first" to someone holding nine badges is
         simply wrong, and it hides a real failure. */
      if (!k) {
        slot('pkey-say').textContent = saveFault
          ? (S.app.guestErr[saveFault] || S.app.pkeyOffline)
          : (gotCount() >= 3 ? S.app.pkeyOffline : S.app.pkeyNone);
      }
      el('pkey').setAttribute('data-open', '');
      el('pkey').setAttribute('aria-hidden', 'false');
      sfx('open');
    },

    'pkey-copy': function () {
      var k = read('saveKey', null);
      if (!k) { slot('pkey-say').textContent = S.app.pkeyNone; return; }
      var done = function (msg) { slot('pkey-say').textContent = msg; };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(prettyKey(k)).then(
          function () { done(S.app.pkeyCopied); }, function () { done(S.app.pkeyOffline); });
      } else { done(S.app.pkeyOffline); }
      sfx('tap');
    },

    'pkey-save': function () {
      var k = read('saveKey', null);
      if (!k) { slot('pkey-say').textContent = S.app.pkeyNone; return; }
      /* a file beats "write it down": localStorage is what Safari deletes */
      var body = 'icybearOS product key\n\n' + prettyKey(k) +
                 '\n\n' + S.app.pkeyNote + '\n';
      var url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
      var a = document.createElement('a');
      a.href = url; a.download = 'icybearos-product-key.txt';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      slot('pkey-say').textContent = S.app.pkeySaved;
      sfx('print');
    },

    'pkey-restore': function () {
      pkeyMode = pkeyMode === 'restore' ? 'view' : 'restore';
      pkeyShown = false;
      renderPkey();
    },

    'pkey-rotate': function () {
      var k = read('saveKey', null);
      if (!k) { slot('pkey-say').textContent = S.app.pkeyNone; return; }
      if (!window.confirm(S.app.pkeyRotateWarn)) return;
      var fresh = mintKey();
      slot('pkey-say').textContent = '…';
      saveCall({ op: 'rotate', key: k, newKey: fresh }).then(function (res) {
        if (!res.ok) { slot('pkey-say').textContent = S.app.pkeyOffline; return; }
        write('saveKey', fresh);
        pkeyShown = false;
        renderPkey();
        slot('pkey-say').textContent = S.app.pkeyRotated;
      }, function () { slot('pkey-say').textContent = S.app.pkeyOffline; });
    },

    'name-bear': function () {
      var renaming = !!bearName;
      var v = tidyName(el('bear-name-input').value);
      var fault = nameFault(v);
      if (fault) {
        bearSay(fault === 'charset' ? S.app.guestErr.charset
              : fault === 'long' ? S.app.guestErr.long
              : S.bear.nameWaiting);
        return;
      }
      setBearName(v);
      slot('name-bubble').hidden = true;
      setBear('happy', 2200);
      if (renaming) {
        /* no toast, no chime, no badge: godparent is earned once and renaming
           is a correction, not an achievement */
        bearSay(fmt(S.bear.renamed, { name: v }));
        sfx('tap');
        return;
      }
      bearSay(fmt(S.bear.named, { name: v }));
      /* the ternary that used to guard this checked a key that never existed, so
       it was permanently false */
    icySay(S.bear.icyOnName);
      toast(fmt(S.bear.namedToast, { name: v }), 'bear');
      chime();
      earn('name');
    },

    stamp: function () {
      if (stamped) { icySay(S.app.stampTwice); return; }
      var raw = el('guest-name').value;
      var fault = nameFault(raw);
      if (fault) { icySay(S.app.guestErr[fault] || S.app.guestErr.rejected); return; }
      if (!backendUp()) { icySay(S.app.wallOffline); return; }

      stamped = true;                       /* optimistic, released on failure */
      fetch(GB.url + '/functions/v1/sign-guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json',
                   apikey: GB.key, Authorization: 'Bearer ' + GB.key },
        body: JSON.stringify({ name: tidyName(raw), stamp: stampIndex })
      }).then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, body: j }; },
                             function () { return { ok: false, body: {} }; });
      }).then(function (res) {
        if (!res.ok || !res.body.ok) {
          stamped = false;
          icySay(S.app.guestErr[res.body.error] || S.app.guestErr.rejected);
          return;
        }
        /* keep only what the double-submit guard and the degraded wall need */
        write('guestStamp', { name: res.body.name, stamp: res.body.stamp,
                              created_at: new Date().toISOString(), fresh: true });
        sfx('stamp'); sfx('thud');
        icySay(S.app.stampDone);
        loadWall();
      }, function () {
        stamped = false;
        icySay(S.app.wallOffline);
      });
    },

    specs: function () {
      var p = el('specs-panel');
      p.hidden = !p.hidden;
      sfx('mode');
      /* The right-rail panel IS the specs app on the desktop — there is no
         icon for it, only this chip. Without counting it here, `every` needed
         a window that a desktop visitor has no way to open, so the achievement
         was unwinnable on desktop and nobody could tell why. */
      if (!p.hidden) noteApp('specs');
    },

    /* THE CONVERSION EVENT OF THE WHOLE SITE, and until now it recorded
       nothing. It opened a Telegram tab and put the brief on the clipboard; if
       the clipboard refused, the copy said "clipboard said no, tell me
       yourself" and the brief the visitor had just written was gone. Somebody
       without Telegram left no trace, and Icy never learned they existed.

       It posts to the inbox now and prints a receipt. The old behaviour is the
       FALLBACK rather than the feature: if the desk cannot be reached the brief
       still goes to the clipboard and the dm still opens, so the worst case is
       exactly what the best case used to be. A brief is never lost. */
    bags: function (btn) {
      var kind = btn ? btn.dataset.bags : '';
      var line = slot('bags-line');
      /* THE THREE BUTTONS SOUND DIFFERENT, because they mean different things
         and one buzzer for all three said they did not. retry is the machine
         refusing again, so it gets the hard error. cope is the joke landing, so
         it gets something soft and resolved rather than a rejection -- the copy
         says "cope complete ♡" and a buzzer under that is the wrong face. */
      if (kind === 'cope') { line.innerHTML = S.app.bagsCope; sfx('gn'); return; }
      if (kind === 'retry') { line.innerHTML = S.app.bagsRetry; sfx('error'); return; }
      sfx('deny');
      if (onPhone()) closeApp();
      else closeWin('bags');
    }
  };

  /* ANYTHING THAT LEAVES WITH YOU MAKES A PAPER SOUND. One listener rather
     than a handler per link: the resume page, the resume button and the ten
     wallpaper links are all just anchors with `download` on them, and a future
     one will be too. */
  document.addEventListener('click', function (e) {
    if (e.target.closest('a[download]')) sfx('paper');
  });

  document.addEventListener('click', function (e) {
    var menuBtn = e.target.closest('[data-menu]');
    /* a whitelist, not any [data-app]: only these kinds of thing are app
       launchers, so a future element carrying the attribute for some other
       reason cannot accidentally open a window */
    var appBtn = e.target.closest('.icon[data-app], .dbtn[data-app], .applink[data-app], .hire[data-app], .wcta [data-app], .stk[data-app], .mwall[data-app]');
    var actBtn = e.target.closest('[data-act]');
    var modeBtn = e.target.closest('[data-mode-set]');
    var wallBtn = e.target.closest('[data-wall-set]');

    if (menuBtn) {
      e.stopPropagation();
      var drop = el(menuBtn.dataset.menu);
      var wasOpen = drop.hasAttribute('data-open');
      closeMenus();
      if (!wasOpen) {
        drop.setAttribute('data-open', '');
        menuBtn.setAttribute('aria-expanded', 'true');
      }
      sfx('menu');
      return;
    }

    if (appBtn) {
      closeMenus();
      /* The phone's theme sheet is not an .mdrop, so closeMenus does not reach
         it -- and the wallpapers row lives inside it. Picking a THEME there
         deliberately leaves the sheet up so you can see the change and try
         another; opening a window has to take it down or the window opens
         underneath it. */
      el('theme-sheet').removeAttribute('data-open');
      /* Where the window should appear to come from. Only a DESKTOP icon counts:
         a dock button or a menu row is chrome, and a window flying out of the
         dock reads as a minimise played backwards. Read here rather than in
         openWin because this is the only place that knows what was clicked. */
      var art = appBtn.closest('#icons .icon');
      if (art) {
        var ar = art.getBoundingClientRect();
        openWin.from = { x: ar.left + ar.width / 2, y: ar.top + ar.height / 2 };
      }
      openWin(appBtn.dataset.app);
      if (appBtn.dataset.folio) filterFolio(appBtn.dataset.folio);
      return;
    }
    if (modeBtn) { closeMenus(); setMode(modeBtn.dataset.modeSet); return; }
    if (wallBtn) { closeMenus(); setTheme(wallBtn.dataset.wallSet); return; }
    if (actBtn && ACTIONS[actBtn.dataset.act]) {
      e.stopPropagation();
      closeMenus();
      ACTIONS[actBtn.dataset.act](actBtn);
      return;
    }

    closeMenus();
    el('theme-sheet').removeAttribute('data-open');
  });

  el('gn').addEventListener('click', function () { el('gn').removeAttribute('data-open'); });

  window.addEventListener('keydown', function () {
    if (el('bsod').hasAttribute('data-open')) closeOverlays();
  }, true);

  /* ESCAPE, in layers, topmost first.

     Nothing but the lightbox handled it before, and #gn was the worst of it: a
     full-screen opaque curtain reachable from a menu item — so entirely
     reachable by keyboard — with no way back out except reloading the page.
     That is a trap, not an easter egg.

     Order matters: the thing most recently put in front of you is the thing
     Escape should take away, so a visitor never has to guess which layer they
     are dismissing. */
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (el('pkey').hasAttribute('data-open')) { closePkey(); return; }
    if (jiggling) { setJiggle(false); return; }
    if (el('settings').hasAttribute('data-open')) { closeSettings(); return; }

    var gn = el('gn');
    if (gn.hasAttribute('data-open')) { gn.removeAttribute('data-open'); return; }
    if (el('ceremony').hasAttribute('data-open')) { endCeremony(); return; }
    if (el('capture').hasAttribute('data-open')) { ACTIONS['cap-close'](); return; }
    if (el('bsod').hasAttribute('data-open') || el('credits').hasAttribute('data-open')) {
      closeOverlays(); return;
    }

    var sheet = el('theme-sheet');
    if (sheet.hasAttribute('data-open')) { sheet.removeAttribute('data-open'); return; }
    if (document.querySelector('.mdrop[data-open]')) { closeMenus(); return; }
    if (!el('specs-panel').hidden) { el('specs-panel').hidden = true; return; }

    if (el('appview').hasAttribute('data-on')) { closeApp(); return; }

    /* and finally the window on top of the stack */
    if (stack.length) closeWin(stack[stack.length - 1]);
  });

  /* ==========================================================================
     DEEP LINKS — icybear.fun/#diagnosis opens that window.
     ========================================================================== */

  var HASHES = {
    readme: 'readme', questlog: 'quest', resume: 'resume', diagnosis: 'diag',
    portfolio: 'folio', decora: 'stick', guestbook: 'guest', quote: 'quote',
    /* the app is decora.exe now, but /#stickers is a URL that has been handed
       out and a word people will still type. A dead deep link is a worse thing
       to own than a spare one, so the old name keeps working. */
    stickers: 'stick',
    patches: 'patch', classic: 'v95', terminal: 'terminal', achievements: 'ach',
    specs: 'specs', bags: 'bags'
  };

  function openFromHash() {
    var app = HASHES[location.hash.replace('#', '')];
    if (app) openWin(app);
  }

  window.addEventListener('hashchange', openFromHash);

  /* ==========================================================================
     BOOT — rotating flex lines, honest cover for the first load.
     ========================================================================== */

  var FILL = {
    tagline: S.sys.subtitle,
    ver: S.sys.ver,
    hire: S.sys.hire,
    'standee-cap': S.icy.poseCap,
    'view-title': S.sys.viewTitle,
    'set-eyebrow': S.app.setEyebrow,
    'set-key': S.app.setKey,
    'set-key-sub': S.app.setKeySub,
    'set-about': S.app.setAbout,
    'set-about-sub': S.app.setAboutSub,
    'set-forget': S.app.setForget,
    'set-forget-sub': S.app.setForgetSub,
    'info-cta': S.app.infoCta,
    'jiggle-done': S.sys.jiggleDone,
    'set-faq': S.app.setFaq,
    'set-faq-sub': S.app.setFaqSub,
    'dm-title': S.app.dmTitle,
    'dm-line1': S.app.dmLine1,
    'dm-line2': S.app.dmLine2,
    'dm-tg': S.app.dmTg,
    'dm-note': S.app.dmNote,
    'ach-pop': S.app.achPop,
    'wall-intro': S.wall.intro,
    'wall-free': S.wall.free,
    'wall-fine': S.wall.fine,
    'wall-open': S.wall.open,
    'faq-intro': S.faq.intro,
    'faq-foot': S.faq.foot,
    'pkey-eyebrow': S.app.pkeyEyebrow,
    'pkey-note': S.app.pkeyNote,
    'pkey-copy': S.app.pkeyCopy,
    'pkey-save': S.app.pkeySave,
    'pkey-peek': S.app.pkeyPeek,
    'pkey-restore': S.app.pkeyRestore,
    'pkey-rotate': S.app.pkeyRotate,
    'cer-eyebrow': S.covenant.eyebrow,
    'cer-title': S.covenant.title,
    'cer-line': S.covenant.line,
    'cer-foot': S.covenant.foot,
    'cer-hint': S.covenant.hint,
    'ach-note': S.ach.note,
    'kchip': S.icy.kchip,
    'k-row': S.icy.kRow,
    'bear-name-ph': S.bear.namePlaceholder,
    'ach-hint-back': S.ach.hintBack,
    'cap-id': S.cap.idGo,
    'cap-copy': S.cap.copy,
    'cap-post': S.cap.post,
    'cap-save': S.cap.save,
    'cap-close': S.cap.close,
    'bear-name-title': S.bear.nameTitle,
    'bear-name-go': S.bear.nameGo,
    'bsod-1': S.bsod.line1,
    'bsod-2': S.bsod.line2,
    'bsod-3': S.bsod.line3,
    'specs-chip': S.specs.chip,
    'specs-title': S.specs.title,
    'see-work': S.app.seeWork,
    'dock-dm': S.contact.dm,
    'boot-press': S.boot.press,
    'gn-line': S.sys.gnLine,
    'gn-hint': S.sys.gnHint
    /* NOT in this map: setBearName() runs after the fill loop, so a default
       here would be written first and then overwritten every boot. It owns both
       the named and the unnamed branch; let it. (Line numbers used to be cited
       here and were 500 and 800 out.) */
  };

  /* placeholders are copy too. `bear.namePlaceholder` existed in the strings
     file with nothing reading it, so the name field was an empty box with no
     prompt in it. */
  all('[data-fill-ph]').forEach(function (node) {
    var v = FILL[node.dataset.fillPh];
    if (v) node.placeholder = v;
  });

  all('[data-fill]').forEach(function (node) {
    var v = FILL[node.dataset.fill];
    /* SAY SOMETHING. A missing key used to leave the element silently empty,
       which is how a stale cached strings file renders a window with all its
       furniture and none of its words and no error anywhere -- a caching bug
       wearing a styling bug's clothes. */
    if (!v) { try { console.warn('data-fill has no string:', node.dataset.fill); } catch (e) {} return; }
    node.textContent = v;
    /* a ::after that restates the text for a second background-clip pass needs
       it as an attribute too, and the string still lives in one place */
    if (node.hasAttribute('data-ver')) node.setAttribute('data-ver', v);
    if (node.dataset.fill === 'hire') el('hire').setAttribute('data-tip', S.sys.hireTip);
  });
  /* this one carries markup, so it cannot go through the textContent loop */
  slot('bags-line').innerHTML = S.app.bagsError;
  document.querySelector('[data-fill="bear-name-title"]').innerHTML = S.bear.nameTitle;

  var flexIndex = 0;
  var flexTimer = setInterval(function () {
    flexIndex = (flexIndex + 1) % S.boot.flex.length;
    el('boot-flex').textContent = S.boot.flex[flexIndex];
  }, 700);
  el('boot-flex').textContent = S.boot.flex[0];

  body.setAttribute('data-booting', '');

  function endBoot() {
    var boot = el('boot');
    if (boot.hasAttribute('data-done')) return;
    clearInterval(flexTimer);
    /* released BEFORE the fade, so the desktop is standing behind the boot
       screen as it clears rather than appearing after it */
    body.removeAttribute('data-booting');
    boot.setAttribute('data-done', '');
    setTimeout(function () {
      boot.remove();
      icySay(amnesia ? S.sys.amnesia : (returning ? S.boot.welcomeBack : S.boot.welcome));
      chime();
      openFromHash();
      setTimeout(askName, 3200);
    }, 500);
  }

  el('boot').addEventListener('click', endBoot);
  /* 3s was long enough to see the mark and not long enough to read the bar, so
     the load line finished off-screen and the whole beat read as a flash. A
     click still skips it, which is what makes a longer hold safe. */
  setTimeout(endBoot, 4200);

  /* ---------- start ---------- */
  body.dataset.wall = themeById(read('wall', 'base')).id;
  if (badges < themeById(body.dataset.wall).unlock) body.dataset.wall = 'base';
  /* konami mode persists like the weather does, so it comes back with the chip
     already showing rather than silently */
  if (read('konami', false)) {
    body.toggleAttribute('data-konami', true);
    el('kchip').hidden = false;
  }
  renderKonamiRow();
  renderThemeMenu();
  renderWallGrid();
  paintSound();          /* the icon reflects the stored preference at boot */
  setPose();
  renderDiagnosis();
  renderSpecs();
  renderSkillTree();
  renderContact();
  renderFaq();
  renderFolioFilter();
  tick();
  setInterval(tick, 15000);
  /* ==========================================================================
     READ_ME VITALS - the uptime counter and the connection readout.
     ========================================================================== */

  /* The day she started in web3. This is the only number in that panel that is a
     claim about the world rather than about the machine, so it is a constant
     with a comment on it and not something derived from a quest date that might
     quietly change meaning later. The lede two paragraphs up says "nearly 5
     years"; this is what makes that sentence checkable instead of rhetorical. */
  var WEB3_SINCE = new Date('2021-11-01T00:00:00Z');

  function uptimeText(now) {
    var y = now.getUTCFullYear() - WEB3_SINCE.getUTCFullYear();
    var m = now.getUTCMonth() - WEB3_SINCE.getUTCMonth();
    var d = now.getUTCDate() - WEB3_SINCE.getUTCDate();
    if (d < 0) { m -= 1; d += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate(); }
    if (m < 0) { y -= 1; m += 12; }
    /* The hours have to be measured from the day boundary this count is on, not
       read off the viewer's clock. getHours() there was showing whoever is
       looking their own local time, which is a different number that happens to
       tick, sitting inside a duration and claiming to be part of it. */
    var mark = Date.UTC(WEB3_SINCE.getUTCFullYear() + y, WEB3_SINCE.getUTCMonth() + m,
                        WEB3_SINCE.getUTCDate() + d, 0, 0, 0);
    var rest = Math.max(0, now.getTime() - mark) / 1000;
    function pad(n) { return (n < 10 ? '0' : '') + n; }
    return y + 'y ' + m + 'm ' + d + 'd  ' +
      pad(Math.floor(rest / 3600) % 24) + ':' +
      pad(Math.floor(rest / 60) % 60) + ':' + pad(Math.floor(rest) % 60);
  }

  /* Ticks only while read_me is the tab on screen. A counter nobody is looking
     at is a timer running for no reason, and ambient() already stops when the
     document is hidden. */
  var upEl = el('uptime'), pingEl = el('ping'), readoutEl = document.querySelector('.readout');
  /* Asks whether the panel is ON SCREEN, not whether a particular window is
     open. The old test was `#w-readme has data-open`, and on a phone that is
     false for the entire session: openApp MOVES .wbody out of the window and
     into #appbody, so the window it came from never opens. The uptime therefore
     never ticked on mobile -- it sat on the em dash the markup ships with, for
     the whole visit, which is the one number in that panel that is true.
     offsetParent is null for anything display:none, hidden, or detached, so it
     answers the question in both hosts without either of them being named. */
  function vitalsVisible() {
    var p = document.querySelector('[data-panel="readme"]');
    return !!(p && !p.hidden && p.offsetParent !== null);
  }
  function vitalsTick() {
    if (!vitalsVisible()) return;
    upEl.textContent = uptimeText(new Date());
  }
  vitalsTick();
  ambient(vitalsTick, 1000);

  /* The ping drifts because a real one does. It is decorative and says so in the
     markup (aria-hidden), so the only thing it owes anyone is not to look fake:
     a number pinned at 12 reads as a picture of a number. */
  /* Poke it and it pings. An instrument that reads the same however hard you
     prod it is a picture of an instrument; this one re-rolls and flashes. The
     row is aria-hidden and stays that way -- it is decoration, so it is not
     keyboard-reachable and nothing depends on the number. */
  if (readoutEl) {
    readoutEl.addEventListener('click', function () {
      readoutEl.removeAttribute('data-pinged');
      void readoutEl.offsetWidth;          /* let the animation restart */
      readoutEl.setAttribute('data-pinged', '');
      pingEl.textContent = (9 + Math.floor(Math.random() * 7)) + 'ms';
      if (window.sfx) window.sfx('tap');
    });
  }

  ambient(function () {
    if (!vitalsVisible()) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    pingEl.textContent = (10 + Math.floor(Math.random() * 5)) + 'ms';
  }, 2600);

  /* idle chatter holds off while a question is on screen, so the hydration
     check cannot be talked over before it has been answered */
  ambient(function () {
    if (el('icy-bubble').hasAttribute('data-ask')) return;
    if (Math.random() < 0.35) icySay(pick(S.icy.idle), true);
  }, 20000);

})();

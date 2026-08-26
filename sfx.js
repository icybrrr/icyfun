/* ==========================================================================
   SOUND — one synth voice, one mute preference, every page.

   Lived in os.js. The alignment chart wanted sound too, and the wrong way to
   do that is a second oscillator with a second mute button: someone who turns
   the sound off on the desktop has said what they want, and walking into the
   chart should not undo it. So the engine and the preference both live here,
   read from the same storage key the desktop already writes.

   Off by default. Nothing here autoplays; every voice is a response to a
   click, which is also what keeps browsers from blocking the AudioContext.
   ========================================================================== */
(function (global) {
  'use strict';

  var KEY = 'icybear.v1.sound';
  var actx = null;
  var on = false;
  try { on = JSON.parse(localStorage.getItem(KEY)) === true; } catch (e) { on = false; }

  function beep(freq, dur, type, gain) {
    if (!on) return;
    try {
      actx = actx || new (global.AudioContext || global.webkitAudioContext)();
      var osc = actx.createOscillator();
      var vol = actx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      vol.gain.value = gain || 0.06;
      osc.connect(vol);
      vol.connect(actx.destination);
      osc.start();
      vol.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (dur || 0.12));
      osc.stop(actx.currentTime + (dur || 0.12));
    } catch (e) { /* no audio here. fine. */ }
  }

  /* default is a major triad; archangel is an open fifth to the octave, which
     rings hollower and reads as sacred rather than cheerful */
  var CHIMES = { archangel: [523.25, 783.99, 1046.5] };

  /* Named voices instead of frequencies scattered through the file. Phase 2
     swaps these for real y2k-timbre samples by changing this table only. */
  var SFX = {
    open:    [[660, 0.09]],
    /* a thu'um: three descending detuned hits, the last one long */
    shout:   [[150, 0.16, 'sawtooth', 0.07], [104, 0.2, 'sawtooth', 0.07, 90],
              [58, 0.75, 'sawtooth', 0.085, 190], [40, 0.9, 'sine', 0.06, 200]],
    close:   [[330, 0.07]],
    tap:     [[820, 0.05]],
    menu:    [[700, 0.05]],
    pick:    [[760, 0.05]],
    mode:    [[700, 0.06]],
    theme:   [[740, 0.07]],
    deny:    [[240, 0.14, 'triangle', 0.05]],
    stamp:   [[1046, 0.1]],
    feed:    [[600, 0.08]],
    pet:     [[880, 0.1]],
    play:    [[980, 0.08]],
    unlock:  [[1046, 0.09], [1318, 0.12, null, null, 100]],
    /* THE ONE SOUND THAT ONLY HAPPENS THIRTEEN TIMES. Every other voice here is
       one or two notes because every other voice is feedback -- it confirms a
       click and gets out of the way. This one is the moment, so it is built
       like a cue rather than a beep: a low E under the whole thing for body, a
       triangle-wave arpeggio up an E major triad, and two long sine partials
       left ringing on top after the arpeggio has finished. The tail is what
       makes it feel like an award instead of a notification, and it is the only
       voice in the table that outlasts its own animation. */
    /* ---- eight moments that had no voice ----
       All of them are built from the same one-oscillator engine, so none of
       them can be a sample; what separates them is envelope and direction.
       Deliberately eight and not fifteen: sound is off by default, so these
       only reach people who opted in, and for them a site where everything
       makes a noise stops feeling designed. */
    /* the snowman is finished. Up a major triad with a short bell on top --
       smaller than `achieve` on purpose, because it is a delight, not an
       award, and the badge fanfare has to stay the biggest thing here. */
    yay:     [[523.25, 0.09, 'triangle', 0.05], [659.25, 0.09, 'triangle', 0.05, 80],
              [783.99, 0.10, 'triangle', 0.055, 160], [1046.5, 0.34, 'sine', 0.04, 240]],
    /* and it melted. A fall, not a buzz: the pitch slides down through three
       steps and the last one is soft and long, which is what makes it read as
       something going rather than something failing. */
    poof:    [[392, 0.09, 'sine', 0.05], [294, 0.10, 'sine', 0.045, 70],
              [196, 0.30, 'sine', 0.038, 140], [147, 0.42, 'triangle', 0.022, 200]],
    /* a brief left the building. The conversion event of the whole site, so it
       gets a real two-note lift and a tail, over the print click. */
    sent:    [[880, 0.07, 'triangle', 0.05], [1318.51, 0.36, 'sine', 0.05, 90],
              [1760, 0.30, 'sine', 0.018, 150]],
    /* snake turns. Fires several times a second, so it is nearly subliminal by
       design: any louder and a good run becomes torture. */
    turn:    [[300, 0.025, 'square', 0.016]],
    /* snake eats. Two blips up; the caller raises the pitch with the score, so
       a long run audibly climbs. */
    nom:     [[720, 0.045, 'triangle', 0.042], [980, 0.055, 'triangle', 0.042, 45]],
    /* snake dies. NOT `crash` -- that voice is for breaking the OS, and a
       snake ending is a small disappointment, not a system fault. */
    bonk:    [[330, 0.09, 'square', 0.045], [196, 0.16, 'square', 0.04, 80]],
    /* a stamp is a physical act. `stamp` on its own was a chime, which is the
       sound of a bell, not of rubber hitting paper. The low hit under it is
       what makes it land. */
    thud:    [[130, 0.11, 'triangle', 0.05], [92, 0.13, 'sine', 0.035, 30]],
    /* a file left with you: the pdf, a wallpaper. The one paper sound in the
       set -- a short high tick over a low body, which is about as close to a
       sheet moving as a single oscillator gets. */
    paper:   [[1500, 0.035, 'square', 0.018], [520, 0.07, 'triangle', 0.036, 25],
              [300, 0.12, 'sine', 0.028, 60]],
    achieve: [[164.81, 0.55, 'sine', 0.034],
              [659.25, 0.10, 'triangle', 0.055],
              [987.77, 0.10, 'triangle', 0.055, 90],
              [1318.51, 0.13, 'triangle', 0.060, 180],
              [1567.98, 0.10, 'sine', 0.050, 280],
              [1975.53, 0.60, 'sine', 0.044, 340],
              [2637.02, 0.66, 'sine', 0.020, 400]],
    shutter: [[1200, 0.08]],
    gn:      [[392, 0.3]],
    crash:   [[90, 0.5, 'sawtooth', 0.06]],
    error:   [[196, 0.15, 'sawtooth', 0.04]],
    chirp:   [[1100, 0.05, 'sine', 0.045], [1400, 0.06, 'sine', 0.045, 70]],
    note:    [[760, 0.07]],
    key:     [[880, 0.05]],
    delulu:  [[880, 0.08]],
    print:   [[740, 0.08]],
    bsod:    [[150, 0.35, 'square', 0.05]],
    /* the chart's own three: one per answer, one climbing pair for the reveal */
    answer:  [[700, 0.045]],
    reveal:  [[660, 0.1], [880, 0.1, null, null, 110], [1174, 0.22, null, null, 220]]
  };

  function haptic(ms) {
    try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  }

  /* `bend` transposes the whole voice by that many semitones, which is how one
     entry in the table above can climb. Snake's berry uses it: a semitone per
     point, so a long run audibly rises instead of repeating one blip forty
     times. Equal temperament, so the ratio is 2^(n/12) -- transposing by a
     fixed number of HERTZ would shift a 300Hz note by a fifth and a 3000Hz note
     by nothing, which is not a transposition at all. */
  function sfx(name, bend) {
    /* rides along with every sound the OS already makes, so a tap feels like
       something on a phone even with the sound off */
    haptic(name === 'open' || name === 'close' ? 12 : 8);
    var voice = SFX[name];
    if (!voice) return;
    var k = bend ? Math.pow(2, bend / 12) : 1;
    voice.forEach(function (n) {
      var play = function () { beep(n[0] * k, n[1], n[2] || undefined, n[3] || undefined); };
      if (n[4]) setTimeout(play, n[4]); else play();
    });
  }

  function chime() {
    var notes = CHIMES[document.body.dataset.wall] || [523.25, 659.25, 783.99];
    notes.forEach(function (f, i) {
      setTimeout(function () { beep(f, i === notes.length - 1 ? 0.34 : 0.16); }, i * 130);
    });
  }

  /* The icon is the state, everywhere it appears. Any page can put a
     [data-act="sound"] button in its chrome and get the right glyph. */
  function paint(prefix) {
    var src = (prefix || '') + 'images/os/icons/sound-' + (on ? 'on' : 'off') + '.svg';
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="sound"]'), function (b) {
      b.innerHTML = '<img src="' + src + '" alt="">';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function setSound(next, prefix) {
    on = !!next;
    try { localStorage.setItem(KEY, JSON.stringify(on)); } catch (e) { /* private mode */ }
    paint(prefix);
    if (on) chime();
  }

  global.beep = beep;
  global.sfx = sfx;
  global.chime = chime;
  global.haptic = haptic;
  global.paintSound = paint;
  global.setSoundPref = setSound;
  global.soundIsOn = function () { return on; };

}(window));

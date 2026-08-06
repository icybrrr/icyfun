/* icybear alignment chart — quiz state machine, scoring, canvas render, share.
   Reuses ../style.css tokens/components and ../script.js's holo driver.
   No framework, no build step, no reloads. */

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Tuning constants (open decisions, flagged in quiz-page-spec.md §15 —
  // no playtest data exists yet, these are reasonable starting points).
  // ---------------------------------------------------------------------
  var STRETCH_POWER = 0.65;   // nonlinear axis stretch, spec §6. <1 pushes committed answers outward.
  var VAR_THRESHOLD = 2.0;    // clearpill gate, spec §6. Population variance across 8 core raw answers (1-5 scale).
  var EXTREME_K = 4;          // clearpill gate, spec §6. Locked by spec, do not tune.
  var CLEARPILL_GATE = 0.2;   // |raw worldview| below this is gate-eligible.
  var PERSONA_VARIANT_BAND = 0.2; // clearpill persona-variant thresholds, spec §15 assumption.

  // ---------------------------------------------------------------------
  // Copy data — verbatim from quiz-copy-final.md. Do not rewrite strings.
  // ---------------------------------------------------------------------

  var SCALE_LABELS = ['never', 'rarely', 'sometimes', 'often', 'always'];

  var CORNER_CHOICES = [
    { label: 'trenches', value: 'trench' },
    { label: 'perps', value: 'perps' },
    { label: 'nft communities', value: 'nft' },
    { label: 'farming airdrops', value: 'farmer' },
    { label: 'the tl', value: 'poster' }
  ];

  // Corner word as it functions when it's the trailing/head noun of a
  // title (clearpill and delulu results, which both lead with a modifier
  // that isn't a noun) vs. its default leading/modifier form used by every
  // other archetype. Some corners aren't people on their own — "perps" and
  // "nft" are things, not a person — so the trailing slot needs a
  // personified form instead of the raw word.
  var CORNER_TRAILING_FORM = {
    trench: 'trencher',
    perps: 'perps maxi',
    nft: 'jpeg maxi',
    farmer: 'farmer',
    poster: 'poster'
  };

  // Question order is a build-time call (spec: "data, not layout," no order
  // mandated). Worldview/persona interleaved for pacing, hydration as a
  // mid-quiz breather, crypto-corner last as the fun closer that decides
  // the name fusion right before the result.
  var QUESTIONS = [
    { id: 'wv1', axis: 'worldview', reverse: false, garnishKey: null,
      text: "i still think we're early" },
    { id: 'p1', axis: 'persona', reverse: true, garnishKey: null,
      text: 'i say gm and i actually mean it' },
    { id: 'wv2', axis: 'worldview', reverse: false, garnishKey: null,
      text: 'every green candle is a trap being set for me personally' },
    { id: 'p2', axis: 'persona', reverse: false, garnishKey: null,
      text: 'my posts would concern my offline friends' },
    { id: 'gar_hydration', axis: 'garnish', reverse: false, garnishKey: 'hydration',
      text: "i've had water today" },
    { id: 'wv3', axis: 'worldview', reverse: true, garnishKey: null,
      text: "i've been rugged and logged back on the same day" },
    { id: 'p3', axis: 'persona', reverse: false, garnishKey: null,
      text: "i keep it wholesome even when i'm unwell" },
    { id: 'wv4', axis: 'worldview', reverse: false, garnishKey: null,
      text: "secretly i think we're all exit liquidity, me included" },
    { id: 'p4', axis: 'persona', reverse: false, garnishKey: null,
      text: 'given the chance i will post through the bad decision in real time' },
    { id: 'gar_corner', axis: 'garnish', reverse: false, garnishKey: 'corner',
      text: 'where do you actually live', type: 'choice', choices: CORNER_CHOICES }
  ];

  // index lookups into QUESTIONS/answers for scoring
  var WORLDVIEW_IDX = [0, 2, 5, 7];
  var PERSONA_IDX = [1, 3, 6, 8];
  var HYDRATION_IDX = 4;
  var CORNER_IDX = 9;

  var ARCHETYPES = {
    missionary: {
      key: 'missionary',
      name: 'the missionary',
      lines: {
        inner: "you still say gm every day. it's a little unc of you but we allow it. pure of heart.",
        mid: "you'd whitepill a stranger at 3am for free. you reply guy your mutuals like it's a calling.",
        edge: 'you will be fondly remembered years from now when everyone has either made it or ended up in prison.'
      },
      share: [
        'icybear diagnosed me as the missionary. i whitepill strangers for free. would also do it for pay tho.',
        "i'm the missionary. gm is my gospel and the tl is my congregation.",
        'icybear diagnosis: the missionary. dangerously hopeful. hopefully profitable.'
      ]
    },
    softDoomer: {
      key: 'softDoomer',
      name: 'the soft doomer',
      lines: {
        inner: "you say gm. you don't believe in it. but you say it.",
        mid: "you tuck everyone in at night while gently explaining we're all cooked. soft doomer.",
        edge: 'the kindest voice in the room and it\'s telling you it\'s over. you doompost in a gentle font.'
      },
      share: [
        "diagnosed as a soft doomer by icybear. i'll tuck you in AND tell you it's so over.",
        "icybear diagnosis: i'm a soft doomer. gm. nothing matters.",
        "icybear diagnosed me as the soft doomer. the kindest voice telling you we're cooked."
      ]
    },
    delulu: {
      key: 'delulu',
      name: 'the delulu',
      lines: {
        inner: 'a little delulu. down bad, still convinced it turns around today.',
        mid: "no chart could ever humble you. you've simply decided we're going up. certified delulu.",
        edge: "you'd ape your rent into a coin named after a raccoon with a birth defect and call it conviction. peak delulu, zero notes."
      },
      share: [
        "icybear called me delulu. don't care + didn't ask + we're still going up.",
        "icybear diagnosis: fully delulu. no chart can humble me. won't stop til i've made it.",
        "i'm the delulu. down bad, unbothered, up only."
      ]
    },
    goblin: {
      key: 'goblin',
      name: 'the goblin',
      lines: {
        inner: 'goblin tendencies. would shill a shitter in the gc then dump for a 2x. funny memes tho.',
        mid: 'the trenches know your name. can neither confirm nor deny FSHing a chart. certified goblin.',
        edge: 'you are what the trenches warn each other about. blood soaked hands, and you giggle about it. touch grass does not apply to you.'
      },
      share: [
        'diagnosed as a goblin by icybear. much to think about. jk i knew that shit.',
        "i'm what the gc warns each other about. your chart is not safe around me.",
        'the goblin. touch grass does not apply to me. would bundle dump on you with zero remorse.'
      ]
    }
  };

  var CLEARPILL = {
    key: 'clearpill',
    name: 'clearpill',
    personaLines: {
      angel: 'unbothered saint that still says gm. you made peace with all of it and you\'re being nice about it. clearpilled angel. rare drop.',
      core: 'hope and doom both made their pitch. you looked at the whole casino and stopped flinching. clearpilled. rare drop.',
      goblin: 'you saw through the veil and chose violence anyway. nothing matters so you might as well. clearpilled goblin. rare drop.'
    },
    share: [
      'got clearpilled on the icybear alignment chart. rare drop. ascension achieved.',
      'icybear diagnosis: clearpilled. hope and doom both tried to recruit me. i declined.',
      "icybear diagnosed me as clearpilled and i've never felt more perceived."
    ]
  };

  var FLAVOR = {
    hydration: {
      low: 'hydration: dehydrated. drink water. i Will be checking.',
      mid: 'hydration: not bad. also not good. reflect.',
      high: "hydration: hydrated. i'm proud of you. keep it up."
    },
    aura: [
      'aura: under investigation',
      'aura: niche but spicy',
      'aura: effortless mog',
      "aura: we've alerted the authorities"
    ]
  };

  var LANDING_COPY = "icybear's official clinical assessment. answer honestly! or not. we see how you post. we know the truth.";

  var LOADING_LINES = ['diagnosing you', 'reading the signs', 'consulting the trenches', 'calculating your vibes'];

  // ---------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------
  var answers = new Array(QUESTIONS.length).fill(null);
  var activeIndex = 0;
  var advancing = false;
  var currentScreen = 'intro';
  var currentResult = null;
  var pfpImage = null;
  var pfpTimeoutId = null;
  var fontsReady = false;

  var prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------
  var screenIntro = document.getElementById('screen-intro');
  var screenQuiz = document.getElementById('screen-quiz');
  var screenLoading = document.getElementById('screen-loading');
  var screenResult = document.getElementById('screen-result');
  var track = document.getElementById('chart-track');
  var backBtn = document.getElementById('chart-back');
  var trackViewport = document.querySelector('.chart-track-viewport');
  var progressReadout = document.getElementById('chart-progress-readout');
  var progressFill = document.getElementById('chart-progress-fill');
  var startBtn = document.getElementById('chart-start');
  var canvas = document.getElementById('chart-canvas');
  var ctx = canvas ? canvas.getContext('2d') : null;
  var pfpFileInput = document.getElementById('pfp-file');
  var pfpHandleInput = document.getElementById('pfp-handle');
  var pfpHandleGoBtn = document.getElementById('pfp-handle-go');
  var pfpClearBtn = document.getElementById('pfp-clear');
  var btnCopy = document.getElementById('btn-copy');
  var btnShareX = document.getElementById('btn-share-x');
  var btnRediagnose = document.getElementById('btn-rediagnose');
  var btnDownload = document.getElementById('btn-download');
  var shareHint = document.getElementById('chart-share-hint');
  var loadingLineEl = document.getElementById('chart-loading-line');
  var dotGlowEl = document.getElementById('chart-dot-glow');
  var burstEl = document.getElementById('chart-burst');

  // Canvas export cache, refreshed at the end of every render(). Having
  // this ready ahead of time (instead of generating it on-demand inside a
  // click handler) is what makes the clipboard-write timing fix below
  // possible — see shareToX().
  var cachedBlob = null;

  // ---------------------------------------------------------------------
  // Slide building
  // ---------------------------------------------------------------------
  function buildSlides() {
    if (!track) return;
    QUESTIONS.forEach(function (q, i) {
      var slide = document.createElement('div');
      slide.className = 'chart-slide';
      slide.setAttribute('data-index', String(i));

      var statement = document.createElement('p');
      statement.className = 'chart-slide__statement';
      statement.textContent = q.text;
      slide.appendChild(statement);

      var isChoice = q.type === 'choice';
      var optionCount = isChoice ? q.choices.length : SCALE_LABELS.length;

      // Range indicator — a gradient track with a notch above each option,
      // reinforcing "this is an intensity scale" beyond just the word
      // labels. Only makes sense for the never->always scale, not the
      // categorical crypto-corner choice question.
      if (!isChoice) {
        var range = document.createElement('div');
        range.className = 'chart-range';
        range.setAttribute('aria-hidden', 'true');
        var rangeTrack = document.createElement('div');
        rangeTrack.className = 'chart-range__track';
        range.appendChild(rangeTrack);
        var notches = document.createElement('div');
        notches.className = 'chart-range__notches';
        notches.style.gridTemplateColumns = 'repeat(' + optionCount + ', 1fr)';
        for (var n = 0; n < optionCount; n++) {
          var notch = document.createElement('span');
          notches.appendChild(notch);
        }
        range.appendChild(notches);
        slide.appendChild(range);
      }

      var scale = document.createElement('div');
      scale.className = 'chart-scale' + (isChoice ? ' chart-scale--choice' : '');
      if (!isChoice) scale.style.gridTemplateColumns = 'repeat(' + optionCount + ', 1fr)';
      scale.setAttribute('role', 'group');
      scale.setAttribute('aria-label', q.text);

      var options = isChoice ? q.choices : SCALE_LABELS.map(function (label, idx) {
        return { label: label, value: idx + 1 };
      });

      options.forEach(function (opt, idx) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pill holo-surface holo-surface--pill chart-scale__option';
        btn.textContent = opt.label;
        btn.setAttribute('data-question-index', String(i));
        btn.setAttribute('data-value', String(opt.value));
        btn.addEventListener('click', function () {
          answerQuestion(i, opt.value);
        });
        scale.appendChild(btn);
      });

      slide.appendChild(scale);
      track.appendChild(slide);
    });
  }

  function scaleValueToButton(questionIndex) {
    var slide = track.querySelector('.chart-slide[data-index="' + questionIndex + '"]');
    if (!slide) return null;
    return slide.querySelectorAll('.chart-scale__option');
  }

  function refreshSelectedState(questionIndex) {
    var buttons = scaleValueToButton(questionIndex);
    if (!buttons) return;
    var val = answers[questionIndex];
    buttons.forEach(function (btn) {
      var btnVal = btn.getAttribute('data-value');
      var match = QUESTIONS[questionIndex].type === 'choice' ? btnVal === val : Number(btnVal) === val;
      btn.classList.toggle('is-selected', match && val !== null);
    });
  }

  // ---------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------
  function updateTrackPosition() {
    if (!track) return;
    var reduce = prefersReducedMotion;
    track.style.transition = reduce ? 'none' : '';
    track.style.transform = 'translateX(calc(' + activeIndex + ' * -100%))';
    track.querySelectorAll('.chart-slide').forEach(function (slide) {
      var idx = Number(slide.getAttribute('data-index'));
      slide.classList.toggle('is-active', idx === activeIndex);
    });
  }

  function updateProgress() {
    if (progressReadout) {
      var current = String(activeIndex + 1).padStart(2, '0');
      progressReadout.textContent = current + ' / ' + QUESTIONS.length;
    }
    if (progressFill) {
      var pct = ((activeIndex + 1) / QUESTIONS.length) * 100;
      progressFill.style.width = pct + '%';
    }
    if (backBtn) {
      backBtn.hidden = activeIndex === 0;
    }
  }

  function goToQuestion(index) {
    activeIndex = Math.max(0, Math.min(QUESTIONS.length - 1, index));
    updateTrackPosition();
    updateProgress();
    refreshSelectedState(activeIndex);
  }

  function answerQuestion(index, value) {
    if (advancing) return;
    answers[index] = value;
    refreshSelectedState(index);
    // Tiny tactile confirmation on devices that actually support it —
    // vibrate() silently no-ops everywhere else (desktop, iOS Safari), so
    // this is a free win with no branching needed.
    if (navigator.vibrate) navigator.vibrate(10);

    if (index === QUESTIONS.length - 1) {
      advancing = true;
      window.setTimeout(function () {
        advancing = false;
        showResult();
      }, prefersReducedMotion ? 0 : 250);
      return;
    }

    advancing = true;
    window.setTimeout(function () {
      advancing = false;
      goToQuestion(index + 1);
    }, prefersReducedMotion ? 0 : 250);
  }

  function goBack() {
    if (advancing || activeIndex === 0) return;
    goToQuestion(activeIndex - 1);
  }

  function goForward() {
    if (advancing) return;
    if (answers[activeIndex] === null) return; // can't skip ahead unanswered
    if (activeIndex === QUESTIONS.length - 1) {
      showResult();
      return;
    }
    goToQuestion(activeIndex + 1);
  }

  // ---------------------------------------------------------------------
  // Screen switching
  // ---------------------------------------------------------------------
  function showScreen(name) {
    currentScreen = name;
    [screenIntro, screenQuiz, screenLoading, screenResult].forEach(function (el) {
      if (!el) return;
      var isActive = el.getAttribute('data-screen') === name;
      el.hidden = !isActive;
      window.requestAnimationFrame(function () {
        el.classList.toggle('chart-screen--active', isActive);
      });
    });
  }

  function startQuiz() {
    answers = new Array(QUESTIONS.length).fill(null);
    activeIndex = 0;
    updateTrackPosition();
    updateProgress();
    showScreen('quiz');
  }

  function resetToIntro() {
    answers = new Array(QUESTIONS.length).fill(null);
    activeIndex = 0;
    pfpImage = null;
    currentResult = null;
    if (pfpHandleInput) pfpHandleInput.value = '';
    if (pfpFileInput) pfpFileInput.value = '';
    if (pfpClearBtn) pfpClearBtn.hidden = true;
    if (shareHint) shareHint.textContent = '';
    if (dotGlowEl) dotGlowEl.classList.remove('is-ready');
    if (burstEl) burstEl.innerHTML = '';
    cachedBlob = null;
    showScreen('intro');
  }

  // ---------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------
  function seedFromAnswers(list) {
    var seed = 0;
    list.forEach(function (a, i) {
      var n = typeof a === 'number' ? a : (CORNER_CHOICES.findIndex(function (c) { return c.value === a; }) + 1);
      seed += (n || 0) * (i + 3) * 7;
    });
    return Math.abs(seed);
  }

  function axisRawScore(values, reverses) {
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      var v = reverses[i] ? (6 - values[i]) : values[i];
      sum += v;
    }
    var mean = sum / values.length;
    return (mean - 3) / 2;
  }

  function stretch(v) {
    var sign = v < 0 ? -1 : 1;
    return sign * Math.pow(Math.abs(v), STRETCH_POWER);
  }

  function populationVariance(values) {
    var mean = values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    var sqDiffs = values.map(function (v) { return (v - mean) * (v - mean); });
    return sqDiffs.reduce(function (a, b) { return a + b; }, 0) / values.length;
  }

  function computeResult() {
    var worldviewValues = WORLDVIEW_IDX.map(function (i) { return answers[i]; });
    var worldviewReverses = WORLDVIEW_IDX.map(function (i) { return QUESTIONS[i].reverse; });
    var personaValues = PERSONA_IDX.map(function (i) { return answers[i]; });
    var personaReverses = PERSONA_IDX.map(function (i) { return QUESTIONS[i].reverse; });

    var worldviewRaw = axisRawScore(worldviewValues, worldviewReverses);
    var personaRaw = axisRawScore(personaValues, personaReverses);

    var sx = stretch(worldviewRaw);
    var sy = stretch(personaRaw);

    var coreRaw = worldviewValues.concat(personaValues); // raw 1-5 as clicked, not reverse-flipped
    var variance = populationVariance(coreRaw);
    var extremeCount = coreRaw.filter(function (v) { return v === 1 || v === 5; }).length;

    var isClearpilled = Math.abs(worldviewRaw) < CLEARPILL_GATE &&
      (variance > VAR_THRESHOLD || extremeCount >= EXTREME_K);

    var r = Math.sqrt(sx * sx + sy * sy);
    var tier = r > 0.6 ? 'edge' : (r >= 0.3 ? 'mid' : 'inner');

    var cornerValue = answers[CORNER_IDX];
    var cornerChoice = CORNER_CHOICES.filter(function (c) { return c.value === cornerValue; })[0] || CORNER_CHOICES[4];
    var cornerWord = cornerChoice.value;

    var seed = seedFromAnswers(answers);
    var auraIndex = seed % FLAVOR.aura.length;
    var shareIndex = Math.floor(seed / FLAVOR.aura.length) % 3;

    var hydrationAnswer = answers[HYDRATION_IDX];
    var hydrationText = FLAVOR.hydration.mid;
    if (hydrationAnswer !== null) {
      if (hydrationAnswer <= 2) hydrationText = FLAVOR.hydration.low;
      else if (hydrationAnswer >= 4) hydrationText = FLAVOR.hydration.high;
    }

    var result = {
      worldviewRaw: worldviewRaw,
      personaRaw: personaRaw,
      x: sx,
      y: sy,
      r: r,
      tier: tier,
      isClearpilled: isClearpilled,
      cornerWord: cornerWord,
      hydrationText: hydrationText,
      auraText: FLAVOR.aura[auraIndex]
    };

    if (isClearpilled) {
      var personaVariant = sy < -PERSONA_VARIANT_BAND ? 'angel' : (sy > PERSONA_VARIANT_BAND ? 'goblin' : 'core');
      result.archetypeKey = 'clearpill';
      // "clearpill" isn't a noun on its own (it's used as a modifier
      // everywhere else in the copy — "clearpilled angel," etc.), so it
      // leads the title with the corner word's personified trailing form.
      result.displayName = 'clearpill ' + (CORNER_TRAILING_FORM[cornerWord] || cornerWord);
      result.diagnosisLine = CLEARPILL.personaLines[personaVariant];
      result.shareText = CLEARPILL.share[shareIndex];
      result.plotX = 0;
      result.plotY = sy;
    } else {
      var archetypeKey;
      if (sy < 0 && sx < 0) archetypeKey = 'missionary';
      else if (sy < 0 && sx >= 0) archetypeKey = 'softDoomer';
      else if (sy >= 0 && sx < 0) archetypeKey = 'delulu';
      else archetypeKey = 'goblin';

      var archetype = ARCHETYPES[archetypeKey];
      result.archetypeKey = archetypeKey;
      if (archetypeKey === 'delulu') {
        // "delulu" is an adjective, not a noun — same fix as clearpill:
        // it leads, and the corner word behind it needs its trailing form.
        result.displayName = 'delulu ' + (CORNER_TRAILING_FORM[cornerWord] || cornerWord);
      } else {
        result.displayName = cornerWord + ' ' + archetype.name.replace(/^the /, '');
      }
      result.diagnosisLine = archetype.lines[tier];
      result.shareText = archetype.share[shareIndex];
      result.plotX = sx;
      result.plotY = sy;
    }

    return result;
  }

  // ---------------------------------------------------------------------
  // Fonts
  // ---------------------------------------------------------------------
  function ensureFonts() {
    if (fontsReady) return Promise.resolve();
    var loads = [
      document.fonts.load('400 90px "Bagel Fat One"'),
      document.fonts.load('500 24px "Montserrat"'),
      document.fonts.load('700 24px "Montserrat"'),
      document.fonts.load('800 24px "Montserrat"'),
      document.fonts.load('400 24px "Space Mono"'),
      document.fonts.load('700 24px "Space Mono"')
    ];
    return Promise.all(loads).then(function () {
      return document.fonts.ready;
    }).then(function () {
      fontsReady = true;
    });
  }

  // ---------------------------------------------------------------------
  // Canvas render
  // ---------------------------------------------------------------------
  var CARD_W = 1080;
  var CARD_H = 1350;

  var PALETTE = {
    purpleDark: '#5a3f8f',
    purpleMid: '#7d64b8',
    purpleText: '#5a4390',
    purpleAccent: '#8b6cc9',
    purpleAccent2: '#9a7fd1',
    pink: '#c45cae',
    pinkSoft: '#e07bb8',
    lilac: '#b99df0'
  };

  function wrapText(context, text, x, y, maxWidth, lineHeight, align) {
    var words = text.split(' ');
    var line = '';
    var lines = [];
    for (var n = 0; n < words.length; n++) {
      var testLine = line + words[n] + ' ';
      var metrics = context.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        lines.push(line.trim());
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());
    lines.forEach(function (l, i) {
      context.textAlign = align || 'left';
      context.fillText(l, x, y + i * lineHeight);
    });
    return lines.length * lineHeight;
  }

  function fitTextToWidth(context, text, maxWidth, startSize, minSize, fontBuilder) {
    var size = startSize;
    while (size > minSize) {
      context.font = fontBuilder(size);
      if (context.measureText(text).width <= maxWidth) break;
      size -= 2;
    }
    return size;
  }

  function drawGridTexture(context, x, y, w, h) {
    context.save();
    context.beginPath();
    context.rect(x, y, w, h);
    context.clip();
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 1;
    var step = 46;
    for (var gx = x; gx < x + w; gx += step) {
      context.beginPath();
      context.moveTo(gx, y);
      context.lineTo(gx, y + h);
      context.stroke();
    }
    for (var gy = y; gy < y + h; gy += step) {
      context.beginPath();
      context.moveTo(x, gy);
      context.lineTo(x + w, gy);
      context.stroke();
    }
    context.restore();
  }

  function drawPfp(context, img, cx, cy, radius) {
    // Gradient ring frame, matching the homepage portrait card's border
    // treatment exactly — same 4-stop gradient — rather than a flat white
    // ring, so the pfp reads as a proper trading-card slot.
    context.save();
    context.shadowColor = 'rgba(140,100,200,0.35)';
    context.shadowBlur = 18;
    context.shadowOffsetY = 6;
    var frameGrad = context.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    frameGrad.addColorStop(0, '#ffffff');
    frameGrad.addColorStop(0.3, '#f6b8e4');
    frameGrad.addColorStop(0.65, '#a98ee8');
    frameGrad.addColorStop(1, '#8fc2f4');
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = frameGrad;
    context.fill();
    context.restore();

    var innerRadius = radius - 7;
    context.save();
    context.beginPath();
    context.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    context.closePath();
    context.clip();
    if (img) {
      var iw = img.naturalWidth || img.width;
      var ih = img.naturalHeight || img.height;
      var scale = Math.max((innerRadius * 2) / iw, (innerRadius * 2) / ih);
      var dw = iw * scale;
      var dh = ih * scale;
      context.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
    } else {
      var grad = context.createLinearGradient(cx - innerRadius, cy - innerRadius, cx + innerRadius, cy + innerRadius);
      grad.addColorStop(0, '#fff8fc');
      grad.addColorStop(0.5, '#f8bfe6');
      grad.addColorStop(1, '#b48ee9');
      context.fillStyle = grad;
      context.fillRect(cx - innerRadius, cy - innerRadius, innerRadius * 2, innerRadius * 2);
      context.fillStyle = 'rgba(90,63,143,0.55)';
      context.font = '700 ' + Math.round(innerRadius * 1.1) + 'px "Space Mono"';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('✦', cx, cy + 2);
    }
    context.restore();
    context.beginPath();
    context.arc(cx, cy, innerRadius, 0, Math.PI * 2);
    context.lineWidth = 2;
    context.strokeStyle = 'rgba(255,255,255,0.9)';
    context.stroke();
  }

  // Draws word-wrapped text vertically centered around centerY (rather
  // than top-anchored), so a 1- or 2-line name's visual block lines up
  // with the pfp circle's center regardless of how many lines it wraps to.
  function wrapTextVCentered(context, text, x, centerY, maxWidth, lineHeight, align) {
    var words = text.split(' ');
    var line = '';
    var lines = [];
    for (var n = 0; n < words.length; n++) {
      var testLine = line + words[n] + ' ';
      if (context.measureText(testLine).width > maxWidth && n > 0) {
        lines.push(line.trim());
        line = words[n] + ' ';
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());
    var totalSpan = (lines.length - 1) * lineHeight;
    var firstMidY = centerY - totalSpan / 2;
    context.textAlign = align || 'left';
    context.textBaseline = 'middle';
    lines.forEach(function (l, i) {
      context.fillText(l, x, firstMidY + i * lineHeight);
    });
    context.textBaseline = 'alphabetic';
    return lines.length * lineHeight;
  }

  function drawBadge(context, text, cx, y, align, accentColor) {
    context.font = '700 19px "Space Mono"';
    var w = context.measureText(text).width + 36;
    var h = 42;
    var boxX = align === 'right' ? cx - w : cx;
    context.fillStyle = 'rgba(255,255,255,0.88)';
    roundRect(context, boxX, y, w, h, h / 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1.5;
    roundRect(context, boxX, y, w, h, h / 2);
    context.stroke();
    context.fillStyle = accentColor;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, boxX + w / 2, y + h / 2 + 1);
    context.textBaseline = 'alphabetic';
  }

  function render() {
    if (!ctx || !currentResult) return;
    var result = currentResult;

    ctx.clearRect(0, 0, CARD_W, CARD_H);

    // Card background — same gradient family as the site's card/frame chrome.
    var bg = ctx.createLinearGradient(0, 0, CARD_W, CARD_H);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.35, '#f6b8e4');
    bg.addColorStop(0.7, '#a98ee8');
    bg.addColorStop(1, '#8fc2f4');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // Inner card panel
    var pad = 28;
    var panelGrad = ctx.createLinearGradient(0, 0, 0, CARD_H);
    panelGrad.addColorStop(0, '#fdf7ff');
    panelGrad.addColorStop(1, '#f3e9ff');
    ctx.fillStyle = panelGrad;
    roundRect(ctx, pad, pad, CARD_W - pad * 2, CARD_H - pad * 2, 36);
    ctx.fill();

    drawGridTexture(ctx, pad, pad, CARD_W - pad * 2, CARD_H - pad * 2);

    // Badge row — echoes the homepage portrait card's "PLAYER 01" / "★ HIRE
    // ME" corner badges, and doubles as a rarity readout for this result.
    var rarityLabel = result.isClearpilled ? '★ RARE DROP' : '★ ' + result.tier.toUpperCase();
    drawBadge(ctx, 'DIAGNOSIS', pad + 24, 50, 'left', PALETTE.purpleAccent);
    drawBadge(ctx, rarityLabel, CARD_W - pad - 24, 50, 'right', PALETTE.pink);

    // Title
    ctx.fillStyle = PALETTE.purpleAccent;
    ctx.font = '700 28px "Space Mono"';
    ctx.textAlign = 'center';
    ctx.fillText('✦ THE ICYBEAR ALIGNMENT CHART ✦', CARD_W / 2, 118);

    drawFadeLine(ctx, pad + 40, 142, CARD_W - pad - 40, 142);

    // Header: pfp + name, vertically centered against each other
    var pfpRadius = 60;
    var pfpCx = pad + 92;
    var headerCenterY = 232;
    drawPfp(ctx, pfpImage, pfpCx, headerCenterY, pfpRadius);

    var nameMaxWidth = CARD_W - (pfpCx + pfpRadius + 36) - pad - 20;
    var nameSize = fitTextToWidth(ctx, result.displayName, nameMaxWidth, 82, 42, function (s) {
      return '400 ' + s + 'px "Bagel Fat One"';
    });
    ctx.font = '400 ' + nameSize + 'px "Bagel Fat One"';
    // Solid deep color, not a pale gradient-clip — same fix as the intro
    // title: light pastel gradients on Bagel Fat One don't hold contrast
    // against this card's equally light background at body-copy sizes.
    ctx.fillStyle = PALETTE.purpleDark;
    ctx.shadowColor = 'rgba(255,255,255,0.85)';
    ctx.shadowOffsetY = 2;
    ctx.shadowBlur = 0;
    var nameX = pfpCx + pfpRadius + 32;
    var nameLineHeight = nameSize * 1.08;
    wrapTextVCentered(ctx, result.displayName, nameX, headerCenterY, nameMaxWidth, nameLineHeight, 'left');
    ctx.shadowColor = 'transparent';
    ctx.shadowOffsetY = 0;

    // Diagnosis line
    ctx.fillStyle = PALETTE.purpleText;
    ctx.font = '500 31px "Montserrat"';
    ctx.textAlign = 'left';
    var diagY = headerCenterY + pfpRadius + 32;
    var diagHeight = wrapText(ctx, result.diagnosisLine, pad + 40, diagY, CARD_W - pad * 2 - 80, 42, 'left');

    drawFadeLine(ctx, pad + 40, diagY + diagHeight - 6, CARD_W - pad - 40, diagY + diagHeight - 6);

    // Compass — sized dynamically to actually fill the space available
    // between the header and a reserved bottom block (tags + footer +
    // even padding), rather than a fixed guess. Short results (fewer
    // diagnosis lines) get a bigger compass instead of leaving dead space
    // at the bottom; the longest possible content (3-line diagnosis + both
    // tags stacked) clamps to a safe minimum that's still verified to
    // never crowd the footer.
    // Gap here (64px) is deliberately generous — it's what keeps the fade
    // line and the "INTERNET ANGEL" pole label from ever crowding each
    // other, which is what caused the stray-looking line before.
    var compassY = diagY + diagHeight + 64;

    var tagRowHeight = 22 + 26;
    var tagGap = 14;
    // Always two tags now — hydration always has something to say (low/mid/
    // high), it's no longer a conditional-presence flag.
    var tagsList = [result.hydrationText, result.auraText];
    var tagsBlockHeight = tagsList.length * tagRowHeight + (tagsList.length - 1) * tagGap;

    var GAP_COMPASS_TO_TAGS = 70;
    var GAP_TAGS_TO_FOOTER = 54;
    var FOOTER_ALLOWANCE = 52;
    var reservedBottom = GAP_COMPASS_TO_TAGS + tagsBlockHeight + GAP_TAGS_TO_FOOTER + FOOTER_ALLOWANCE + pad;

    var availableForCompass = CARD_H - compassY - reservedBottom;
    var compassSize = Math.max(520, Math.min(720, availableForCompass));
    var compassX = (CARD_W - compassSize) / 2;
    var dotPos = drawCompass(ctx, compassX, compassY, compassSize, result);
    positionDotGlow(dotPos.dotX, dotPos.dotY);

    // Garnish tags — stacked vertically, height varies by how many are
    // showing; footer is positioned off the actual returned height, not a
    // fixed guess, so it can never collide with either case.
    var tagsTopY = compassY + compassSize + GAP_COMPASS_TO_TAGS;
    var tagsHeight = drawTags(ctx, tagsTopY, CARD_W / 2, CARD_W - pad * 2 - 80, tagsList);

    // Footer branding — hard requirement: bake URL + brand mark into pixels.
    drawFooter(ctx, tagsTopY + tagsHeight + GAP_TAGS_TO_FOOTER);

    refreshCachedBlob();
  }

  // Keeps cachedBlob current with whatever's actually on the canvas right
  // now (pfp swaps, re-renders, etc). Async, but fired well ahead of any
  // share click in practice, so by the time a button is pressed the blob
  // is already sitting in memory instead of needing to be generated inside
  // the click handler itself.
  function refreshCachedBlob() {
    if (!canvas) return;
    canvas.toBlob(function (blob) { cachedBlob = blob; }, 'image/png');
  }

  // Positions the live on-screen glow overlay over the dot's exact spot,
  // expressed as a percentage of the canvas so it tracks correctly
  // regardless of how the canvas element itself is scaled by CSS.
  function positionDotGlow(dotX, dotY) {
    if (!dotGlowEl) return;
    var leftPct = (dotX / CARD_W) * 100;
    var topPct = (dotY / CARD_H) * 100;
    dotGlowEl.style.left = leftPct + '%';
    dotGlowEl.style.top = topPct + '%';
    dotGlowEl.classList.add('is-ready');
  }

  // Fading horizontal divider — canvas echo of the site's
  // .section-heading__line (a rule that fades to transparent).
  function drawFadeLine(context, x1, y, x2, y2) {
    var grad = context.createLinearGradient(x1, 0, x2, 0);
    grad.addColorStop(0, 'rgba(154,127,209,0.55)');
    grad.addColorStop(1, 'rgba(154,127,209,0)');
    context.strokeStyle = grad;
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(x1, y);
    context.lineTo(x2, y2 === undefined ? y : y2);
    context.stroke();
  }

  function roundRect(context, x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawCompass(context, x, y, size, result) {
    var half = size / 2;
    var cx = x + half;
    var cy = y + half;

    // Soft lifted-module shadow behind the whole panel, so it reads as a
    // distinct "screen" set into the card rather than sitting flush flat.
    // Clipped to never paint above the panel's own top edge — shadowBlur
    // spreads in every direction regardless of shadowOffsetY, and without
    // this clip it bled upward into the "INTERNET ANGEL" label above.
    context.save();
    context.beginPath();
    context.rect(x - 80, y, size + 160, size + 100);
    context.clip();
    context.shadowColor = 'rgba(120,80,180,0.35)';
    context.shadowBlur = 34;
    context.shadowOffsetY = 14;
    context.fillStyle = 'rgba(255,255,255,0.01)';
    roundRect(context, x, y, size, size, 28);
    context.fill();
    context.restore();

    context.save();
    roundRect(context, x, y, size, size, 28);
    context.clip();

    // Corner-glow quadrants: each pole's identity color radiates inward
    // from its own outer corner rather than sitting as a flat tint — same
    // fixed positions and colors every render, so screenshots stay
    // directly comparable, just with more depth than a flat wash.
    var reach = size * 0.95;
    var quadrants = [
      { rx: x, ry: y, cornerX: x, cornerY: y, color: 'rgba(150,170,255,0.55)' },              // TL angel+white
      { rx: cx, ry: y, cornerX: x + size, cornerY: y, color: 'rgba(150,160,205,0.5)' },        // TR angel+black
      { rx: x, ry: cy, cornerX: x, cornerY: y + size, color: 'rgba(255,165,220,0.55)' },       // BL demon+white
      { rx: cx, ry: cy, cornerX: x + size, cornerY: y + size, color: 'rgba(160,85,165,0.55)' } // BR demon+black
    ];
    quadrants.forEach(function (q) {
      context.save();
      context.beginPath();
      context.rect(q.rx, q.ry, half, half);
      context.clip();
      var qGrad = context.createRadialGradient(q.cornerX, q.cornerY, 0, q.cornerX, q.cornerY, reach);
      qGrad.addColorStop(0, q.color);
      qGrad.addColorStop(1, 'rgba(255,255,255,0.2)');
      context.fillStyle = qGrad;
      context.fillRect(q.rx, q.ry, half, half);
      context.restore();
    });

    drawGridTexture(context, x, y, size, size);

    // Axis lines with a soft glow, plus tick marks every 25% for a real
    // "measurement" feel.
    context.save();
    context.shadowColor = 'rgba(255,255,255,0.9)';
    context.shadowBlur = 6;
    context.strokeStyle = 'rgba(255,255,255,0.95)';
    context.lineWidth = 2.5;
    context.beginPath();
    context.moveTo(cx, y);
    context.lineTo(cx, y + size);
    context.moveTo(x, cy);
    context.lineTo(x + size, cy);
    context.stroke();
    context.restore();

    context.strokeStyle = 'rgba(255,255,255,0.75)';
    context.lineWidth = 2;
    [0.25, 0.75].forEach(function (f) {
      context.beginPath();
      context.moveTo(x + size * f, cy - 9);
      context.lineTo(x + size * f, cy + 9);
      context.moveTo(cx - 9, y + size * f);
      context.lineTo(cx + 9, y + size * f);
      context.stroke();
    });

    context.restore();

    // Gradient border — same family as the pfp ring / footer wordmark, so
    // the whole card reads as one designed system.
    var borderGrad = context.createLinearGradient(x, y, x + size, y + size);
    borderGrad.addColorStop(0, '#ffffff');
    borderGrad.addColorStop(0.4, '#f6b8e4');
    borderGrad.addColorStop(0.75, '#a98ee8');
    borderGrad.addColorStop(1, '#8fc2f4');
    context.strokeStyle = borderGrad;
    context.lineWidth = 4;
    roundRect(context, x, y, size, size, 28);
    context.stroke();

    // Pole labels
    context.font = '700 24px "Space Mono"';
    context.fillStyle = PALETTE.purpleDark;
    context.textAlign = 'center';
    context.fillText('INTERNET ANGEL', cx, y - 20);
    context.fillText('REAL LIFE DEMON', cx, y + size + 42);

    context.save();
    context.translate(x - 24, cy);
    context.rotate(-Math.PI / 2);
    context.textAlign = 'center';
    context.fillText('WHITEPILLED', 0, 0);
    context.restore();

    context.save();
    context.translate(x + size + 24, cy);
    context.rotate(Math.PI / 2);
    context.textAlign = 'center';
    context.fillText('BLACKPILLED', 0, 0);
    context.restore();

    // Plotted dot
    var dotX = cx + result.plotX * half * 0.86;
    var dotY = cy + result.plotY * half * 0.86;

    if (result.isClearpilled) {
      var glow = context.createRadialGradient(dotX, dotY, 0, dotX, dotY, 78);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(0.4, 'rgba(247,181,221,0.7)');
      glow.addColorStop(1, 'rgba(247,181,221,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(dotX, dotY, 78, 0, Math.PI * 2);
      context.fill();

      context.beginPath();
      context.arc(dotX, dotY, 40, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(255,255,255,0.8)';
      context.lineWidth = 2;
      context.stroke();
      context.beginPath();
      context.arc(dotX, dotY, 30, 0, Math.PI * 2);
      context.strokeStyle = '#ffffff';
      context.lineWidth = 4;
      context.stroke();
      context.beginPath();
      context.arc(dotX, dotY, 20, 0, Math.PI * 2);
      context.fillStyle = PALETTE.pink;
      context.fill();
    } else {
      var g2 = context.createRadialGradient(dotX, dotY, 0, dotX, dotY, 52);
      g2.addColorStop(0, 'rgba(196,92,174,0.9)');
      g2.addColorStop(1, 'rgba(196,92,174,0)');
      context.fillStyle = g2;
      context.beginPath();
      context.arc(dotX, dotY, 52, 0, Math.PI * 2);
      context.fill();

      context.beginPath();
      context.arc(dotX, dotY, 22, 0, Math.PI * 2);
      context.strokeStyle = 'rgba(255,255,255,0.7)';
      context.lineWidth = 1.5;
      context.stroke();
      context.beginPath();
      context.arc(dotX, dotY, 15, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.fill();
      context.beginPath();
      context.arc(dotX, dotY, 10, 0, Math.PI * 2);
      context.fillStyle = PALETTE.pink;
      context.fill();
    }

    return { dotX: dotX, dotY: dotY };
  }

  // Stacked, not side-by-side — bigger and more readable, and it sidesteps
  // ever having to cram two chips into the card's width at once. Returns
  // the total height used so the caller can position whatever comes next
  // (the footer) off the real result instead of a guessed constant.
  function drawTags(context, topY, centerX, maxWidth, tagsList) {
    var chipGap = 14;
    var padX = 26;
    var baseSize = 22;
    var chipHeight = baseSize + 26;

    tagsList.forEach(function (t, i) {
      var size = baseSize;
      context.font = '700 ' + size + 'px "Space Mono"';
      var w = context.measureText(t).width + padX * 2;
      while (w > maxWidth && size > 15) {
        size -= 1;
        context.font = '700 ' + size + 'px "Space Mono"';
        w = context.measureText(t).width + padX * 2;
      }
      var chipY = topY + i * (chipHeight + chipGap);
      var chipX = centerX - w / 2;
      context.fillStyle = 'rgba(255,255,255,0.8)';
      roundRect(context, chipX, chipY, w, chipHeight, chipHeight / 2);
      context.fill();
      context.strokeStyle = '#ffffff';
      context.lineWidth = 1.5;
      roundRect(context, chipX, chipY, w, chipHeight, chipHeight / 2);
      context.stroke();
      context.fillStyle = PALETTE.purpleMid;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(t, chipX + w / 2, chipY + chipHeight / 2 + 1);
      context.textBaseline = 'alphabetic';
    });

    return tagsList.length * chipHeight + (tagsList.length - 1) * chipGap;
  }

  function drawFooter(context, y) {
    context.textAlign = 'center';
    context.font = '400 34px "Bagel Fat One"';
    var text = '✦ icybear.fun ✦';
    var w = context.measureText(text).width;
    // Same color family as the site nav's wordmark, but dropping its
    // near-white first stop — that reads fine in CSS against the nav's
    // own background but was nearly illegible at this size against the
    // card's light background. Starts on a more saturated pink instead,
    // plus a soft dark-tinted shadow for edge definition.
    var grad = context.createLinearGradient(CARD_W / 2 - w / 2, 0, CARD_W / 2 + w / 2, 0);
    grad.addColorStop(0, '#e88fd0');
    grad.addColorStop(0.5, '#b48ee9');
    grad.addColorStop(1, '#7ba3e8');
    context.save();
    context.shadowColor = 'rgba(120,80,180,0.3)';
    context.shadowBlur = 8;
    context.shadowOffsetY = 2;
    context.fillStyle = grad;
    context.fillText(text, CARD_W / 2, y);
    context.restore();
  }

  // ---------------------------------------------------------------------
  // Result screen lifecycle
  // ---------------------------------------------------------------------
  function minDelay(ms) {
    return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
  }

  // A brief anticipation beat between the last question and the reveal —
  // not just decorative filler: this is also exactly the window where font
  // loading and result computation happen, so the wait is never wasted
  // time even on a slow connection. Shorter and un-animated under
  // prefers-reduced-motion.
  // A one-time celebratory sparkle burst radiating from the card center at
  // the moment of reveal — bigger for clearpilled ("rare drop") results.
  // Freshly generated each time so repeat "get rediagnosed" cycles never
  // replay stale, already-spent sparks.
  function triggerBurst() {
    if (!burstEl || prefersReducedMotion) return;
    burstEl.innerHTML = '';
    var isRare = !!(currentResult && currentResult.isClearpilled);
    var count = isRare ? 16 : 10;
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
      var distance = 90 + Math.random() * 90;
      var bx = Math.cos(angle) * distance;
      var by = Math.sin(angle) * distance;
      var spark = document.createElement('span');
      spark.className = 'chart-burst__spark' + (isRare ? ' chart-burst__spark--rare' : '');
      spark.style.setProperty('--bx', bx.toFixed(1) + 'px');
      spark.style.setProperty('--by', by.toFixed(1) + 'px');
      spark.style.animationDelay = (Math.random() * 0.15).toFixed(2) + 's';
      burstEl.appendChild(spark);
    }
    requestAnimationFrame(function () {
      burstEl.querySelectorAll('.chart-burst__spark').forEach(function (el) {
        el.classList.add('is-flying');
      });
    });
  }

  function showResult() {
    currentResult = computeResult();
    if (loadingLineEl) {
      loadingLineEl.textContent = LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
    }
    if (dotGlowEl) dotGlowEl.classList.remove('is-ready');
    showScreen('loading');
    var pause = prefersReducedMotion ? 300 : 1500;
    Promise.all([ensureFonts(), minDelay(pause)]).then(function () {
      showScreen('result');
      render();
      triggerBurst();
    });
  }

  // ---------------------------------------------------------------------
  // PFP handling
  // ---------------------------------------------------------------------
  function setPfpFromFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () { pfpImage = img; showPfpClear(); render(); };
      img.onerror = function () { pfpImage = null; render(); };
      img.src = e.target.result;
    };
    reader.onerror = function () { pfpImage = null; };
    reader.readAsDataURL(file);
  }

  function showPfpClear() {
    if (pfpClearBtn) pfpClearBtn.hidden = false;
  }

  function setPfpFromHandle(handleRaw) {
    var handle = (handleRaw || '').replace(/^@/, '').trim();
    if (!handle) return;
    if (pfpTimeoutId) window.clearTimeout(pfpTimeoutId);

    var img = new Image();
    img.crossOrigin = 'anonymous';
    var settled = false;

    function fail() {
      if (settled) return;
      settled = true;
      if (shareHint) shareHint.textContent = "couldn't load that pfp, no worries — card still works.";
    }

    img.onload = function () {
      if (settled) return;
      settled = true;
      pfpImage = img;
      showPfpClear();
      if (shareHint) shareHint.textContent = '';
      render();
    };
    img.onerror = fail;
    pfpTimeoutId = window.setTimeout(fail, 6000);
    // /x/ not /twitter/ — the /twitter/ path 301-redirects to /x/, and the
    // redirect response itself doesn't carry the Access-Control-Allow-Origin
    // header (only the final /x/ response does), which silently fails the
    // crossOrigin='anonymous' load every time. Hitting /x/ directly avoids
    // the redirect entirely.
    img.src = 'https://unavatar.io/x/' + encodeURIComponent(handle);
  }

  function clearPfp() {
    pfpImage = null;
    if (pfpFileInput) pfpFileInput.value = '';
    if (pfpHandleInput) pfpHandleInput.value = '';
    if (pfpClearBtn) pfpClearBtn.hidden = true;
    render();
  }

  // ---------------------------------------------------------------------
  // Share controls
  // ---------------------------------------------------------------------
  function canvasToBlob() {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(blob); }, 'image/png');
    });
  }

  // Brief text swap on a button to confirm an action landed (e.g. "copy
  // image" -> "copied ✓" -> back), independent of the shareHint line below
  // the controls — a hint the user has to look away from the button to
  // read is easy to miss entirely.
  function flashButtonState(btn, text, ms) {
    if (!btn) return;
    if (btn.dataset.originalText === undefined) btn.dataset.originalText = btn.textContent;
    window.clearTimeout(btn._flashTimeoutId);
    btn.textContent = text;
    btn._flashTimeoutId = window.setTimeout(function () {
      btn.textContent = btn.dataset.originalText;
    }, ms || 1600);
  }

  // Writes a blob to the clipboard *synchronously relative to the caller*
  // (no .then()-indirection between "have the blob" and "call write()") —
  // see shareToX() for why that ordering specifically matters.
  function writeBlobToClipboard(blob, btn) {
    if (!blob || !navigator.clipboard || !window.ClipboardItem) {
      if (shareHint) shareHint.textContent = "your browser can't copy images directly — try download instead.";
      return;
    }
    navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]).then(function () {
      if (shareHint) shareHint.textContent = 'copied! paste it into your tweet.';
      flashButtonState(btn, 'copied ✓');
    }).catch(function () {
      if (shareHint) shareHint.textContent = "couldn't copy automatically — try download instead.";
    });
  }

  function copyImage() {
    if (!navigator.clipboard || !window.ClipboardItem) {
      if (shareHint) shareHint.textContent = "your browser can't copy images directly — try download instead.";
      return;
    }
    if (cachedBlob) {
      writeBlobToClipboard(cachedBlob, btnCopy);
    } else {
      canvasToBlob().then(function (blob) { writeBlobToClipboard(blob, btnCopy); });
    }
  }

  function shareToX() {
    if (!currentResult) return;
    var text = currentResult.shareText;
    var intentUrl = 'https://x.com/intent/tweet?text=' + encodeURIComponent(text);

    // `navigator.share` existing is NOT a reliable mobile signal — desktop
    // Chrome/Edge (89+) expose it too, and its desktop behavior is
    // inconsistent/often can't actually share files, silently doing
    // nothing. A coarse pointer (touch) is a much more honest "this is
    // probably a phone" check. Everything that isn't confidently
    // touch-plus-share falls straight to the tab-based intent flow, same
    // as plain desktop.
    var isTouchDevice = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);

    if (isTouchDevice && navigator.share) {
      var proceed = function (blob) {
        var file;
        try {
          file = blob ? new File([blob], 'icybear-alignment-chart.png', { type: 'image/png' }) : null;
        } catch (e) {
          file = null;
        }
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share({ files: [file], text: text }).catch(function () { /* user cancelled, ignore */ });
        } else {
          // This device can't actually share the file — fall back to the
          // same copy+tab flow desktop uses. window.open() here needs the
          // same synchronous-gesture treatment as the desktop branch below.
          if (blob) writeBlobToClipboard(blob, btnShareX);
          window.open(intentUrl, '_blank', 'noopener');
        }
      };
      // Cached blob lets this whole branch — including the window.open()
      // fallback inside it — run synchronously within the click handler
      // instead of behind an async canvas export, same reasoning as below.
      if (cachedBlob) proceed(cachedBlob);
      else canvasToBlob().then(proceed);
      return;
    }

    // Desktop (or anything not confidently touch+share-capable). Order
    // matters here: navigator.clipboard.write() generally requires the
    // document to still have focus, and window.open() is about to hand
    // focus to the new tab — so the clipboard write has to be issued
    // *before* window.open(), using the already-cached blob so there's no
    // async gap beforehand for focus to slip away during. window.open()
    // still fires synchronously right after, well within the same user
    // gesture, so it isn't popup-blocked either.
    if (cachedBlob) {
      writeBlobToClipboard(cachedBlob, btnShareX);
    } else if (shareHint) {
      shareHint.textContent = "your browser can't copy images directly — try download instead.";
    }
    window.open(intentUrl, '_blank', 'noopener');
  }

  function downloadImage() {
    var proceed = function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'icybear-alignment-chart.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    };
    if (cachedBlob) proceed(cachedBlob);
    else canvasToBlob().then(proceed);
  }

  // ---------------------------------------------------------------------
  // Keyboard support
  // ---------------------------------------------------------------------
  document.addEventListener('keydown', function (e) {
    if (currentScreen !== 'quiz') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      goForward();
    } else if (/^[1-5]$/.test(e.key)) {
      var q = QUESTIONS[activeIndex];
      var n = Number(e.key);
      if (q.type === 'choice') {
        if (q.choices[n - 1]) answerQuestion(activeIndex, q.choices[n - 1].value);
      } else {
        answerQuestion(activeIndex, n);
      }
    }
  });

  // ---------------------------------------------------------------------
  // Wire up controls
  // ---------------------------------------------------------------------
  if (startBtn) startBtn.addEventListener('click', startQuiz);
  if (backBtn) backBtn.addEventListener('click', goBack);
  if (btnRediagnose) btnRediagnose.addEventListener('click', resetToIntro);
  if (btnCopy) btnCopy.addEventListener('click', function () { copyImage(); });
  if (btnShareX) btnShareX.addEventListener('click', shareToX);
  if (btnDownload) btnDownload.addEventListener('click', downloadImage);

  if (pfpFileInput) {
    pfpFileInput.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (file) setPfpFromFile(file);
    });
  }
  if (pfpHandleGoBtn) {
    pfpHandleGoBtn.addEventListener('click', function () {
      setPfpFromHandle(pfpHandleInput ? pfpHandleInput.value : '');
    });
  }
  if (pfpHandleInput) {
    pfpHandleInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        setPfpFromHandle(pfpHandleInput.value);
      }
    });
  }
  if (pfpClearBtn) pfpClearBtn.addEventListener('click', clearPfp);

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
    prefersReducedMotion = e.matches;
  });

  // ---------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------
  // Defensive backstop for browsers without overflow:clip support (see
  // chart.css comment on .chart-track-viewport): clicking a scale option
  // focuses it, and the browser's default focus-scroll can set scrollLeft
  // on this container even though paging is done entirely via CSS
  // transform on .chart-track, never actual scrolling.
  if (trackViewport) {
    trackViewport.addEventListener('scroll', function () {
      trackViewport.scrollLeft = 0;
    });
  }

  var appEl = document.getElementById('app');
  if (appEl) appEl.style.display = ''; // only reveal the app shell once JS has actually run
  buildSlides();
  showScreen('intro');
})();

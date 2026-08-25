/* icybearOS — every user-facing string.
   Copy is load-bearing. Edit voice here, never in os.js.
   House rules: lowercase, terse, no em dashes, icy is the narrator. */

window.OS_STRINGS = {

  /* ---------- boot ---------- */
  boot: {
    flex: [
      'loading delusions… yippie',
      'waking the bear… gm',
      'loading hydration protocol… quenched',
      'loading humility… not found',
      'loading aesthetic dominance… duh'
    ],
    press: '⋆ PRESS START ⋆',
    welcome: 'gm team!',
    welcomeBack: 'you came back. noted.'
  },

  /* ---------- system chrome ---------- */
  sys: {
    /* the version sits beside the logo now, not in the subtitle line */
    ver: 'v1.0',
    /* the one thing on this site addressed to an employer rather than to a
       visitor, which is why it gets the middle of the bar to itself */
    hire: 'for hire',
    hireTip: 'full-time / freelance · remote · CET',
    subtitle: '✦ INTERNET ANGEL · SINCE FOREVER ✦',
    online: 'icy: online',
    sleeping: 'icy: sleeping',
    amnesia: "the bear doesn't remember you. it would like to.",
    modeToast: 'mode: {mode} ✦',
    modeAutoToast: 'mode: auto ✦ following your clock',
    modeNames: { auto: '✦ auto', day: '☁ day', night: '☾ night', rain: '☔︎ rain', snow: '❄︎ snow' },
    saveNothing: 'nothing saved. as requested.',
    exit: 'you can check out any time you like.',
    gnLine: 'GN. DO NOT POST.',
    gnHint: 'tap to wake',
    viewTitle: 'VIEW',
    jiggleDone: 'done ✦',
  },

  /* ---------- apps ---------- */
  /* THE BEAR KNOWS. Thirteen riddles with no feedback is a completion rate near
     zero, which means the theme ladder -- the whole reward economy -- never pays
     out for anyone. One hint, once per session, after four minutes, and only to
     someone still under five badges. Routed through the bear so the secret still
     feels like a secret: it does not tell you the answer, it tells you what it
     has noticed.

     `angel` is deliberately absent. 13:33 should stay pure. */
  hints: {
    name: 'it does not have a name yet. it has noticed.',
    feel: 'it thinks the terminal is hiding a file it will not list twice.',
    konami: 'it keeps pressing up up down down on nothing.',
    crash: 'it wonders what happens if you type something you should not.',
    feed5: 'it looks at you. then at its mouth. then at you again.',
    mute: 'it wants to know whether you would really turn it off.',
    snowman: 'it keeps looking at the sky. it is waiting for the cold.',
    gn: 'it thinks you should say goodnight properly, at night.',
    cert: 'it thinks the machine already knows what you are.',
    reg: 'it is quietly counting how many times you come back.',
    seasons: 'it has only seen some of the weather so far.',
    every: 'it is fairly sure there is something you have not opened.'
  },

  /* The nudge toward the proof-of-visit card. One per session, and the copy
     names the moment rather than the mechanism, because "print screen" is what
     the button says and nobody has ever wanted to do that. */
  nudge: {
    badge: 'three badges in. that\u2019s card-worthy \u2726',
    diag: 'diagnosis on file. put it on a card \u2726',
    snowman: 'you built a whole snowman. card-worthy \u2726',
    ceremony: 'thirteen of thirteen. this one goes on a card \u2726',
    tip: 'tap to print your proof of visit'
  },

  /* The three lights. Screen-reader labels only -- nothing here is drawn. */
  win: {
    collapse: 'collapse',
    expand: 'expand',
    zoom: 'maximise',
    unzoom: 'restore'
  },

  apps: {
    readme:   { icon: 'readme',  label: 'read_me.txt' },
    quest:    { icon: 'quest',  label: 'quest_log.dat' },
    resume:   { icon: 'resume',  label: 'resume.pdf' },
    diag:     { icon: 'diag',  label: 'diagnosis.exe' },
    folio:    { icon: 'folio',  label: 'portfolio.exe' },
    stick:    { icon: 'stick',  label: 'stickers.exe' },
    guest:    { icon: 'guest',  label: 'guestbook.exe' },
    quote:    { icon: 'quote',  label: 'quote.exe' },
    patch:    { icon: 'patch',  label: 'patch_notes.log' },
    v95:      { icon: 'v95',  label: 'icybear_95.exe' },
    terminal: { icon: 'terminal',  label: 'terminal.exe' },
    ach:      { icon: 'ach',  label: 'badges.sav' },
    specs:    { icon: 'specs',  label: 'system_specs.exe' },
    bags:     { icon: 'bags',  label: 'bags' },
    /* chrome, not an app: listed here for its label and dock icon, but
       CHROME in os.js keeps it out of the 13/13 count. */
    faq:      { icon: 'faq',  label: 'faq.txt' },
    /* also chrome: reached from the theme menu and from stickers.exe, not from
       the desktop, so it is not part of the 14/14 tour either */
    wall:     { icon: 'wall',  label: 'wallpapers.exe' }
  },

  /* ---------- faq ----------
     Lives under help, not on the desktop: someone who wants this is looking
     for it, and an icon for it would compete with read_me for the same
     attention. Rendered as <details>, so open/close costs no javascript.

     Every answer here has to stay true of the actual build. If a behaviour
     changes, this file changes with it. */
  /* ---------- faq ----------
     Lives under help, not on the desktop: someone who wants this is looking
     for it, and an icon for it would compete with read_me for the same
     attention. Rendered as <details>, so open/close costs no javascript.

     Every answer here has to stay true of the actual build. If a behaviour
     changes, this file changes with it.

     Authored in Vaultito -> icybear.fun/faq-copy.md, which is the sheet icy
     edits. That file is the source of truth for the wording; this is where it
     lands. Do not hand-edit one without the other. */
  faq: {
    intro: 'the questions people actually ask. the rest of the OS answers the fun ones.',
    groups: [
      ['✦ WORKING TOGETHER', [
        ['are you available?',
         'yes. full-time or freelance, remote, CET. the chip in the menu bar is honest: if it says <b>for hire</b>, i\'m available.'],
        ['what do you actually do?',
         'i wear many hats: community, design, content, marketing, operations, people. i especially love making memes. everything on this OS is one of them wearing a costume. <b>system_specs.exe</b> has the list.'],
        ['what does it cost?',
         'depends entirely on scope. <b>request a quote</b> asks four questions, and the answers let me reply with a number. interested? you know what to do.'],
        ['full-time or freelance?',
         'currently, both. say which one you mean when you write and i will answer for that one.'],
        ['do you work with my timezone?',
         'i am on CET and i have run programming for communities spread across all of them. timezone has never once been the problem.'],
        ['how fast do you reply?',
         'telegram, same day, almost always. x dms get buried under the seemingly never-ending barrage of gcs, so telegram is the fastest way in.']
      ]],
      ['✦ THIS WEBSITE', [
        ['is this a real operating system?',
         'no. it is hand-written html, css and javascript, with no frameworks and no build step. the windows are divs having a very good time. maybe someday, though!'],
        ['why is it an operating system?',
         'because it\'s fun and whimsical. •ᴗ• a pdf could not have shown you any of this. the site is, itself, a portfolio piece. and also a darn tootin good time.'],
        ['is there a normal version?',
         'yes, two. <b>icybear_95.exe</b> opens the OG site, untouched (for the memories~) and the resume is a standard one-page pdf.'],
        ['does it work on my phone/desktop?',
         'yes. both desktop and mobile have their own curated designs. desktop displays a lovely pc OS. on a phone it stops being a desktop and becomes a phone.'],
        ['what is the bear?',
         'the bear is the bear. you get to name it, and it remembers what you picked.'],
        ['what is a product key?',
         'your badges live in your browser, and browsers forget. the product key is how you carry them to another device. it is in settings, under help.']
      ]],
      ['✦ WHAT THIS SITE KNOWS', [
        ['do you track me?',
         'no analytics, no ad pixels, no tracking scripts. the fonts are served from here, not from google. nothing here follows you anywhere after you close the tab. i am graciously anon-friendly.'],
        ['what do you store?',
         'your bear’s name, your theme, which badges you have, and your guestbook stamp if you left one. the first three sit in your browser. the stamp sits in a database, because a wall of one is not a wall. make a product key and the first three get a copy in the database too, so another device can pick them up.'],
        ['can i get that deleted?',
         'settings has <b>forget me on this device</b>, which clears the local half instantly. for a guestbook stamp or a product key, message me... just know it would make me sad.'],
        ['is the guestbook moderated?',
         'stamps and a short handle, nothing longer. it publishes straight away, and i can hide anything i would rather not have on my wall.']
      ]],
      ['✦ ICY', [
        ['is icy a real person?',
         'yes. i think so? i\'m pretty sure i\'m real.'],
        ['why all the sparkles?',
         'because of the whimsy. the alternative was a boring page with a sans serif on it, and there are already enough of those.'],
        ['who made this?',
         'me! with the help of my loyal code monkey, claude. i handled design, copy, art direction, icon set, and all the cute ideas. claude wrote the code, made the bear, supplied the sounds, and endured over 9000 rounds of iteration.']
      ]]
    ],
    foot: 'something not answered here? ask me directly. maybe your question will be good enough to earn a place here! wow! now that\'s an honor.'
  },

  /* ---------- icy ---------- */
  /* Two characters reacting to the same sky differently is cheaper
     characterisation than any amount of copy describing either of them, and it
     is what turns the bear's rain face from an apparent bug into its opinion.

     PAIRS, not two pools. Drawing icy's line and the bear's independently
     would happily follow "i love rainy days! the bear does not." with a line
     that is not "i do not." — a setup and its punchline have to travel
     together. icy speaks, the bear answers about 1.7s later. */
  weather: {
    day: [
      ['perfect weather for grass touching!', "sun's out, bun's out."],
      ['mmm, vitamin d.', 'warm. good. approved.'],
      ['we are outside! metaphorically.', 'this does not count as touching grass.']
    ],
    night: [
      ['i do my best work at night.', 'same. *honkmimimi*'],
      ['i have the perfect face mask for this.', 'yummy!'],
      ['nobody is normal after midnight.', 'is that a threat or a promise?']
    ],
    rain: [
      ['i love rainy days! the bear does not.', 'i do not.'],
      ['this weather calls for a cozy blankie and tea.', 'the sky is leaking.'],
      ['yippie! rain!', 'i am unenthused.']
    ],
    snow: [
      ['snow! we are both normal about this.', 'SNOW.'],
      ['okay this one we agree on.', '*immediately begins construction*'],
      ['yay, snow!! time to lock in.', 'BUSY.']
    ]
  },

  icy: {
    idle: [
      'gm team!',
      'hire me before someone else does.',
      "it's only delusional until it works.",
      'the bear runs this place now. i just work here.',
      'i built all of this. yes, all of it.',
      'you are allowed to click things.',
      'animal crossing villager eugenics is very normal and okay in my opinion.',
      'the coffee is load-bearing.',
      'this is my third coffee and my first good idea.'
    ],
    /* she talks back to the bear. two characters who acknowledge each other
       cost nothing and make both of them realer. */
    agrees: [
      'so true bestie!',
      'and i always say that.'
    ],
    reacts: {
      readme: 'that one is about me.',
      quest: 'the sacred lore.',
      resume: 'the professional artifact. behold.',
      diag: 'we already know how you post.',
      folio: 'i made all of this tehee~',
      stick: 'so i can always be with you.',
      guest: 'stamps only. i do not read reviews.',
      quote: 'oh? business? go on.',
      patch: 'the changelog. it is honest. mostly.',
      v95: 'vintage. so fetch.',
      terminal: 'careful in there.',
      ach: 'i am not telling you how.',
      bags: 'i warned you.'
    },
    /* one caption, always true, because the pose carries the state */
    poseCap: 'ICY ✦ TAP TO CHANGE POSE',
    poseLines: [
      'new pose. same delusion.',
      'she knows you are looking.',
      'pose changed. mood unchanged.',
      'sparkle sparkle ⋆˙⟡'
    ],
    /* said only when it is genuinely late where she is */
    sitLines: [
      'it is {t} in vienna. this is as up as she gets.',
      "she clocked out. but we can pretend she's still here.",
      'off duty. still photogenic.',
      'vienna is asleep. you are not.',
      'i love chilling. i love relaxing.'
    ],
    /* The one moment on the site where the OS asks the visitor for something
       instead of the other way round, which is exactly what a hydration
       propagandist would build. The waiting is real: say no and it waits. */
    water: {
      ask: 'quick check. are you hydrated?',
      yes: 'yes •ᴗ•',
      no: 'no •ᴖ•',
      confirmed: 'good. i believe you! mostly.',
      wait: "go get water. i'll wait..!",
      back: 'better, right? haha yeag.',
      bear: 'drink water.'
    },
    noticed: 'she noticed.',
    konamiOn: 'konami mode. up up down down and such.',
    konamiOff: 'konami mode off. the code still works.',
    kchip: '1UP',
    kRow: '♥ konami mode',
    lockNotif: 'sup twin, you up?',
    /* before the bear has a name there is no {name} to template, and the fill
       map was seeding the slot with the raw string, so a first-time visitor
       met a literal "{name}" on the lock screen */
    lockNotifAnon: "i'm in your screen.",
    lockWho: 'the bear',
    tabAway: 'come back ✦'
  },

  /* ---------- the bear ----------
     Positive-only memory: it is never sad because you left, never guilt-trips,
     never counts a streak. It is pleased to see you and that is the whole deal. */
  bear: {
    nameTitle: 'a wild bear appeared ✦<br>it needs a name',
    namePlaceholder: 'name it',
    nameGo: 'bless it ♡',
    nameWaiting: 'it is waiting.',
    named: 'it accepts. it is {name} now.',
    namedToast: '{name} has joined icybearOS ✦',
    icyOnName: 'good name. it agrees.',
    renameTitle: 'having second thoughts? ✦<br>rename it',
    renameGo: 'rename ♡',
    renamed: 'it answers to {name} now.',
    plate: '???',
    idle: [
      '*polar noises*',
      'it is thinking about snow.',
      'it believes in you. probably.',
      'it has seen the charts. it does not care.',
      'small. round. employed.',
      'it is guarding the dock.',
      '*soft judging*',
      'it wants you to open the guestbook.',
      'it remembered you first.',
      'it has opinions about the wallpaper.',
      '*exists loudly*',
      'it is not lost. it lives here.',
      'it is thinking about its niche interests.',
      "it wonders if you're doing your part.",
      'it is soooo',
      'it wants to play miladycraft.'
    ],
    feed: [
      '*crunch. delighted.*',
      '*it saved half for later. somewhere.*',
      '*chewing with intent*',
      '*it would die for this berry*',
      '*full. still accepting.*'
    ],
    pet: [
      '*maximum contentment achieved*',
      '*leaning in*',
      '*it trusts you now. big mistake. (no it is not)*',
      '*purring? bears do not purr. it does not care.*',
      '*this is its whole personality now*'
    ],
    play: [
      '*zoomies (small)*',
      '*zoomies (moderate)*',
      '*it did a trick. you missed it.*',
      '*chasing nothing, winning*',
      '*equally athletic and round. it defies logic. neat!*'
    ],
    reacts: {
      bags: '*worried polar noises*',
      terminal: 'it wants to see the commands.',
      diag: 'it refuses to be diagnosed.',
      guest: 'it loves stamps.',
      stick: 'it has requests.',
      ach: 'it knows which ones you are missing.'
    },
    returned: 'it noticed you left. it waited.',
    konami: 'motherlode motherlode motherlode',
    dance: [
      '*small unprompted dancing*',
      'this song is only in its head.',
      'do not look. keep looking.',
      '♪'
    ],
    fed5: 'it would accept a sixth.',
    sleeping: [
      '*asleep. do not wake it.*',
      '*it is dreaming of escape.*',
      '*it will meet you in the dream palace.*'
    ],
  },

  /* ---------- the snowman ---------- */
  snow: {
    begun: '*it has begun...*',
    done: '*it is finished. behold.*',
  },

  /* ---------- mood ring ---------- */
  mood: {
    title: 'MOOD RING',
    who: 'internet angel',
    delulu: 'delulu level:',
    gaugeTip: 'scientifically assigned. do not appeal.',
    gaugeTipSnow: 'peak delulu. it is snowing.',
    icyTime: 'icy time:',
    you: 'you: {n}m on this computer',
    patchTeaser: 'v1.0 · "it boots. it remembers you. the bear has a name now."',
    lines: {
      day: 'mood: functional! suspicious.',
      night: 'mood: do not perceive me.',
      rain: 'mood: tea and blankie cuddles coded. very cool.',
      snow: 'mood: thriving. break out the Glühwein.'
    }
  },

  /* ---------- delulu dispenser ---------- */
  affirmations: [
    'you are the alfa now.',
    'the bottom is in (emotionally)',
    'gm retroactively.',
    'your fave is about to follow you.',
    'ship it anyway.',
    'delulu is a strategy.',
    'the chart respects you. somewhere.',
    'winning in silence hits different.',
    'you are not behind. it is lore enrichment.',
    'you are worthy of love.',
    'sometimes you have to lose it all first to win bigly.',
    'you were so smart and handsome for that.',
    'DID YOU KNOW? i care you (true)',
    'we are forever connected via network spirituality.'
  ],

  /* ---------- sticky notes ---------- */
  delusions: [
    'it works. see: it works.',
    'the bottom is in.',
    'my bags are early, not wrong.',
    'gm is a business strategy.',
    'i am one post away.',
    'touch grass? i AM the grass.'
  ],

  /* ---------- archangel ----------
     The thirteenth theme. 13 is the number of those willing to be unlucky in
     the eyes of the world; 33 is completion and ascension; <33 is love doubled
     against hate. That numerology is what the whole theme is built on: thirteen
     badges, the 13:33 hour, the mark. Every line here is the author's to
     rewrite. Attribution and the fuller note live in the spec, not in shipped
     source, which anyone can read. */
  covenant: {
    eyebrow: 'THE THIRTEENTH',
    title: 'archangel',
    /* Alternates. Each one is anchored to a specific piece of covenant's lore,
       noted after it. Swap any single line in; nothing else has to change.

       -- the doubling, <33 --------------------------------------------------
       'love, doubled. that was always the assignment.'
           <33 on its own: love doubled in answer to hate.
       'they doubled the hate. we doubled first.'
           <33 with teeth. second sentence lands.
       'hate came in volume. so did we.'
           from "overwhelm evil with beauty, love, and truth, in volume."

       -- less than thirty-three ---------------------------------------------
       'less than thirty-three. still climbing.'
           the sign read literally: <33 is "less than Jesus, striving to become
           more like Him." the most precisely on-lore line here.

       -- 1 corinthians 13 ---------------------------------------------------
       'and the greatest of these.'
           the love chapter, left unfinished. anyone who knows, finishes it.

       -- the table ----------------------------------------------------------
       'thirteen sat down. love is what stayed.'
           the last supper: thirteen, betrayal and ultimate love in one room.

       -- the strategy -------------------------------------------------------
       'beauty, in volume. it was never a fair fight.'
           their stated method, said with a straight face.

       -- providence ---------------------------------------------------------
       'you were not lucky. you were led.'
       'you were willing to be unlucky.'
       'most people leave before thirteen.' */
    line: 'love, doubled. now carry it somewhere it is not welcome.',
    foot: 'god is online',
    hint: 'tap to continue',
    hour: '{t} ✦ covenant hour.'
  },

  /* ---------- contact ----------
     Same handle everywhere. Telegram is the one that actually gets read, so it
     is the dock CTA and the default on the quote; x is the alternate. Discord
     has no username URL, hence the numeric id. */
  contact: {
    handle: '@icygobrrr',
    telegram: 'https://t.me/icygobrrr',
    x: 'https://x.com/icygobrrr',
    discord: 'https://discord.com/users/760643095817224214',
    note: 'any of these reach me. telegram is fastest.',
    dm: '♡ dm'
  },

  /* ---------- the six pillars ----------
     One taxonomy for the whole OS: the spec sheet, the skill tree and read_me
     all read from this. Hardware label on the left, the pillar on the right. */
  /* The skill tree's twenty tags and the portfolio's four project names. These
     lived in os.js, which put the closest thing this site has to a CV skills
     section inside the engine file — invisible to the copy sheet and unreachable
     for anyone editing wording. */
  skills: {
    community: ['community building', 'discord config', 'mint management'],
    design: ['photoshop', 'illustrator', 'after effects', 'capcut pro'],
    content: ['copywriting', 'brand voice', 'x spaces', 'livestreams'],
    marketing: ['campaign management', 'B2B partnerships', 'GTM'],
    operations: ['crisis comms', 'irl events', 'AI-enhanced workflows', 'vibe coding'],
    people: ['art direction', 'project management', 'hiring']
  },
  projects: [
    ['th', 'treasure hunter'],
    ['ber', 'beratone'],
    ['tub', 'tubby cats'],
    ['icy', 'icybear']
  ],

  specs: {
    title: 'SYSTEM SPECS',
    chip: '✦ system specs',
    rows: [
      ['processor', 'community', '#e07bb8'],
      ['graphics', 'design', '#b58ded'],
      ['memory', 'content', '#8fc2f4'],
      ['network', 'marketing', '#7fd6c0'],
      ['power supply', 'operations', '#f4c86b'],
      ['user accounts', 'people', '#f2a0c4']
    ]
  },

  /* ---------- terminal ----------
     Terminal law: nothing on `ls` may be inert. Every listed thing answers
     to ls / cat / cd with something, and `help` lies slightly. */
  term: {
    greet: '<b>icy@angelnet</b> ~ type `help` and behave. up arrow remembers.',
    prompt: '<b>icy@angelnet</b> ~ ',
    unknown: 'unknown command. it happens.',
    /* Two lines: things that DO something, then how to poke around. Nothing
       here names a secret — no cheat codes, no `ls -a`, no `crash`, no `gn` —
       because a listed easter egg is not an easter egg. What it does add is the
       two VERBS: `ls` already prints filenames, but nobody knew they could open
       one, so a whole layer of the terminal was invisible behind a guess. */
    help: 'try: gm · whoami · uptime · diagnose · pet · birthday · snake · scores · credits · clear',
    help2: 'poke around: ls · cd &lt;folder&gt; · cat &lt;file&gt; · sudo hire icybear · rm -rf bags (do not)',
    helpMore: 'that is most of them.',
    gm: 'gm. now get to work.',
    gmLate: 'it is {h}am. go to sleep.',
    gn: 'gn. logging you off properly.',
    gnDay: 'it is daytime. nice try.',
    whoami: 'visit #{n} from this machine. the angel sees you.',
    ls: 'icy.txt&nbsp;&nbsp;delusions.txt&nbsp;&nbsp;bags/&nbsp;&nbsp;secrets/&nbsp;&nbsp;grass/ (never touched)',
    lsa: '.&nbsp;&nbsp;..&nbsp;&nbsp;.feelings&nbsp;&nbsp;icy.txt&nbsp;&nbsp;delusions.txt&nbsp;&nbsp;bags/&nbsp;&nbsp;secrets/&nbsp;&nbsp;grass/',
    feelings: 'hidden. keep it that way.',
    delusions: '1. it works.<br>2. see 1.',
    secrets: 'nice try.',
    grass: 'you? touching grass? bold claim.',
    bags: 'no.',
    bagsLs: '47 unrealized losses. do not open them.',
    rmBags: 'absolutely not. bags are load-bearing.',
    formatBags: 'permission denied. see: rm -rf bags.',
    home: 'you are already home. you are always home.',
    isFolder: 'that is a folder. try: cd {t}',
    isFile: 'that is a file. try: cat {t}',
    feelingsCd: 'that is a file. and no.',
    hire: 'permission granted. opening dms…',
    clear: '<b>icy@angelnet</b> ~ clean. like your portfolio should be.',
    matrix: 'entering the timeline…',
    crash: 'oh no.',
    uptime: 'you have been here {n} minute{s}. delulu levels: rising.',
    uptimeUnlocked: 'stat unlocked ✦ the mood ring watches you now',
    /* the arcade wall */
    snakeBest: 'your best: {n}.',
    snakeNewBest: 'new personal best ✦',
    snakeSign: 'type <b>sign yourname</b> to put it on the board.',
    snakeNoScore: 'play a round first. type <b>snake</b>.',
    snakeSigning: 'signing the board…',
    snakeSigned: 'signed. you are <b>#{r}</b> on the board.',
    snakeSignedTop: 'signed. you are <b>#1</b>. the whole board is yours.',
    snakeAlready: 'that one is already on the board. play another.',
    scoresHead: '✦ SNAKE · TOP 10 ✦',
    scoresEmpty: 'nobody has signed the board yet. be first.',
    scoresOffline: 'the board is unreachable right now.',
    scoreErr: {
      empty: 'needs a name.',
      name: 'needs a name.',
      charset: 'that name has characters the board cannot hold.',
      long: 'sixteen characters, tops.',
      too_long: 'sixteen characters, tops.',
      backend: 'the board is unreachable right now.',
      bad_json: 'the board did not understand that.',
      reserved: 'that name is taken. pick another.',
      rejected: 'pick another name.',
      score: 'that score is not possible.',
      closed: 'the board is closed right now.',
      rate_hour: 'that is a lot of snake for one hour. rest.',
      rate_global: 'the board is busy. try again shortly.'
    },
    petNamed: '{name} is busy being round. it says hi.',
    petNameless: 'the bear has no name yet. that is on you.',
    birthday: "{name}'s birthday is the day you named it. write it down. bring berries.",
    birthdayNone: 'name the bear first. then we celebrate.',
    diagnose: [
      'diagnosis: chronically early, permanently loud.',
      'diagnosis: certified delulu. posts through it.',
      'diagnosis: lurker with main character potential.',
      'diagnosis: gm sayer, gn ignorer.'
    ],
    /* the terminal already kept cheat codes from other people's games; these
       are the ones she actually played */
    iddqd: 'wrong decade. respect though.',
    shout: 'hey... is someone there?',
    hey: "can it wait for a bit? i'm in the middle of some calibrations.",
    game: 'truth is, the game was rigged from the start.',
    coffee: 'brewing… this will not help but it will feel like it does.',
    shoutAfter: 'the windows rattled. nothing else happened.',
    bells: 'nook has been notified. he is coming.',
    wumpa: 'aku aku is not going to save you here.',
    icytxt: 'came for the bull market, stayed for the whimsy.',
    xyzzy: 'a hollow voice says gm.',
    hesoyam: 'wrong city. wrong era. still respect.',
    snakeStart: 'snake. arrows steer. eat berries. the bear is watching.',
    snakeOver: 'game over. score: {n}. {verdict}',
    snakeGood: 'the bear is impressed. genuinely.',
    snakeOk: 'the bear nods. acceptable.',
    snakeBad: 'the bear pretends it did not see.'
  },

  bsod: {
    line1: 'DELUSION OVERFLOW ✦ SYSTEM CRIED',
    line2: 'error 0x0DELULU: too much belief in one session',
    trace: ['at hope() line 13', 'at posting_through_it() line 33', 'at she_kept_going() line ∞'],
    recover: 'attempting to recover delusion… {n}%',
    gaveUp: 'recovery failed. delusion was load-bearing.',
    line3: 'press any key to keep believing'
  },

  credits: {
    roles: [
      ['DIRECTED BY', 'icy'],
      ['DESIGN', 'icy'],
      ['COMMUNITY', 'icy'],
      ['MEMES', 'also icy'],
      ['THE BEAR', '{bear}'],
      ['WEATHER', 'the sky (uncredited)'],
      ['BUILT WITH', 'illustrator, claude code, and a lot of arguing'],
      ['SPECIAL THANKS', 'subagents halo effect and pixel judas'],
      ['AND', 'you. specifically you.'],
      ['FILMED ON LOCATION AT', 'icybear.fun']
    ]
  },

  /* ---------- apps ---------- */
  app: {
    diagAgain: 'take it again →',
    guestEmpty: 'nobody has signed yet. be the reason this page exists.',
    guestCount: '{n} stamp{s}',
    bagsError: '<b>error: bags not found.</b><br>you have 47 unrealized losses. do not open.',
    bagsRetry: '<b>error: bags still not found.</b><br>retrying changed nothing. it never does.',
    bagsCope: '<b>coping…</b><br>cope complete. bags remain unfound. ♡',
    stamps: ['🎀', '🐻', '🐻‍❄️', '🐼', '🧸', '😇', '🪽', '✨', '💜',
             '🧁', '🍓', '🧋', '🥛', '🍄', '🌸', '🦄', '🦋', '🌈',
             '😹', '🫶', '⭐', '☁️', '❄️', '👑', '🌙', '🕊️', '💌'],
    stampDone: 'stamped. welcome to the wall.',
    /* ---------- quote.exe ----------
       It used to be a form: name, project, need, shape, budget, a note, and a
       row of pills for each. The person this window exists for is a founder,
       and a founder who wants to work with you does not want to fill in your
       form -- he wants to talk to you. Everything the form collected is the
       first two minutes of that conversation anyway. */
    dmTitle: "let's talk.",
    dmLine1: "tell me what you're building,",
    dmLine2: "i'll tell you if i'm the right person for it.",
    dmTg: 'dm me ✦',
    dmNote: 'i reply within 24h, usually much faster.',
    achPop: 'badge unlocked',
    themePop: 'theme unlocked',
    achScore: '{n}/{t}',
    seeWork: 'see the work →',
    folioAll: 'all',
    stampTwice: 'one stamp per visitor. i said what i said.',
    /* the button read_me ends on. It used to open a form, so it asked for a
       quote; it opens a dm now, so it asks for a conversation. */
    infoCta: "let's talk →",
    setEyebrow: 'settings',
    setKey: 'your product key',
    setKeySub: 'save or restore your badges',
    setFaq: 'faq',
    setFaqSub: 'the questions people actually ask',
    setAbout: 'about icybearOS',
    setAboutSub: 'v1.0 ✦ built by hand',
    setForget: 'forget me on this device',
    setForgetSub: 'clears everything stored here. your key still restores it.',
    setForgetWarn: 'this clears your badges, your bear and your theme from this device. your product key can restore them. carry on?',
    setForgetDone: 'forgotten. refreshing…',
    setAboutSay: 'icybearOS v1.0 ✦ vanilla js, no frameworks, a lot of arguing.',
    pkeyEyebrow: 'your product key',
    pkeyNote: 'this is the only way back to your badges. we suggest writing it down. not your keys, not your bear.',
    pkeyCopy: 'copy',
    pkeySave: 'download',
    pkeyPeek: 'hold to reveal',
    pkeyRestore: 'i have a key',
    pkeyRotate: 'new key',
    pkeyCopied: 'copied. paste it somewhere safe.',
    pkeySaved: 'saved to your downloads.',
    pkeyStream: 'careful if you are streaming.',
    pkeyAsk: 'paste your key',
    pkeyBadFormat: 'that does not look like a key. check for a typo.',
    pkeyUnknown: 'no save found for that key.',
    pkeyRestored: 'welcome back. your badges are here.',
    pkeyRotated: 'new key made. the old one is dead now.',
    pkeyReplaceWarn: 'restoring replaces your bear name and theme. carry on?',
    pkeyRotateWarn: 'your old key stops working immediately. carry on?',
    pkeyOffline: 'cannot reach the vault. try again in a bit.',
    pkeyNone: 'no key yet. earn a few badges first.',
    pkeyMade: 'a product key. keep it somewhere safe.',
    wallLoading: 'loading the wall…',
    wallOffline: 'the wall is having a moment. try again in a bit.',
    wallMore: 'load more',
    /* Specific for a format fault, deliberately vague for a blocklist hit: a
       precise message there is a slur-guessing oracle. */
    guestErr: {
      empty: 'needs a name first.',
      long: '16 characters max, sorry.',
      charset: 'haha oopsie! letters, numbers, and @ . - _ around these parts.',
      reserved: 'that one is spoken for. pick another.',
      rejected: 'that one did not take. try another.',
      rate_hour: 'you signed recently. give it a minute.',
      rate_day: 'that is enough for today.',
      rate_global: 'the wall is busy. try again shortly.',
      closed: 'the wall is closed right now.',
      backend: 'the wall is having a moment. try again in a bit.'
    },
    briefCopied: 'brief copied. paste it in the dm. see you there ♡',
    briefNoClip: 'clipboard said no. the dm is open, tell me yourself.',
    diagWhen: 'filed {d} · retakes overwrite it'
  },

  /* ---------- achievements ----------
     [id, name, riddle shown while locked, how it was earned once found].
     The riddles ARE content: a locked tile has to be worth clicking too.
     Nothing here is device-exclusive — localStorage is per device, so an
     exclusive badge would make 13/13 unreachable and archangel unwinnable. */
  ach: {
    count: '{n} of {t} found',
    locked: '???',
    progress: ' · {n} of {t} so far.',
    hintBack: 'tap again to hide',
    unlocked: 'achievement unlocked ✦ {name}',
    complete: 'the os is blessed now. you did that.',
    completeName: 'completionist',
    completeHow: "found all thirteen! very cool. you have won icy's favor.",
    note: 'some things on this computer earn you these. we will not say which.',
    defs: [
      ['name', 'godparent', 'the small one needs something from you.', 'named the bear. it remembers.'],
      ['feel', 'emotionally curious', 'the terminal hides a file it will not list twice.', 'found .feelings. told no one.'],
      ['konami', 'unc gamer', 'an old code. your thumbs remember it.', 'entered the code. blessed.'],
      ['crash', 'broke it', 'some commands should not be typed.', 'crashed the os. it forgave you.'],
      ['feed5', 'overfeeder', 'it is always hungry. test that.', 'fed the bear five times. it would accept more.'],
      ['mute', 'coward', 'turn it on. then betray it.', 'muted the sound. the bear heard that.'],[
        'snowman',
        'witnessed the construction',
        'patience. in the cold.',
        "stayed for the whole snowman, and won a sliver of the bear's affection."
      ],[
        'gn',
        'logged off properly',
        'say goodnight like you mean it.',
        'said gn at night. rare behavior.'
      ],
      ['cert', 'certified', 'the machine already knows. let it.', 'got diagnosed. the truth is out.'],
      ['reg', 'regular', 'keep coming back. it counts.', 'fifth visit. basically staff now.'],
      ['seasons', 'four seasons', 'the sky has four moods. see all of them.', 'saw every weather. thorough.'],
      ['every', 'the long way round', 'there is nothing here you have not opened.', 'opened every app. nothing left unclicked.'],
      ['angel', 'internet angel', 'one minute, once a day. you already know the number.', 'kept the covenant hour.']
    ]
  },

  /* ---------- proof of visit ---------- */
  cap: {
    eyebrow: '✦ PROOF OF VISIT ✦',
    /* The edition number is struck as a hallmark in the top right corner rather
       than set inside the title, and it carries no copy of its own: the value
       IS the serial, run code included -- ICY 0417, or MP 0007 for a misprint,
       which is numbered in its own run. */
    misprintEyebrow: '✦ MISPRINT · DO NOT DISTRIBUTE ✦',
    misprintStamp: 'MISPRINT',
    /* the chart page's wording, because it is the same promise: the picture is
       already on your clipboard by the time x opens */
    note: 'psst · copy and post both copy the picture automatically. '
        + 'just paste it (⌘/Ctrl+V) into your post.',
    notePhone: 'psst · post hands the picture straight to your share sheet. '
        + 'copy and save both keep it.',
    idPh: 'your @ (optional)',
    idGo: 'add me ✦',
    idSet: 'on the card ♡',
    idCleared: 'handle removed.',
    idNoPfp: "couldn't load that pfp. the handle still shows.",
    filename: 'icybear-proof-of-visit.png',
    copy: 'copy ✦',
    post: 'post ✦',
    save: 'save ✦',
    close: 'close',
    copied: 'copied! paste it into your post.',
    saved: 'saved ♡',
    noCopy: "couldn't copy automatically. try save instead.",
    sub: "you visited icybear's computer",
    verdict: '{name} approved',
    bearLine: '{name} was here too',
    shareDiag: "got diagnosed on icybear's computer: {d}. the bear approved.",
    shareAch: "visited icybear's computer. earned: {a}",
    sharePlain: "visited icybear's computer. {name} approved.",
    labelDiag: 'DIAGNOSIS',
    badgesLabel: 'BADGES EARNED',
    badgesNone: '✦ none..! (yet)',
    labelAch: 'EARNED',
    labelVerdict: 'VERDICT',
    more: '+{n} MORE',
    visit: 'visit {n}',
    tier: '{tier} · {n} of {t} badges found',
    /* rarity, said out loud. the card is an advert for the themes a stranger
       has not unlocked yet, so the ladder has to be legible at a glance. */
    tiers: {
      base: 'standard issue',
      holo: 'uncommon',
      strawberry: 'rare',
      arcade: 'epic',
      archangel: 'the thirteenth'
    }
  },

  /* ---------- themes ---------- */
  /* ---------- wallpapers ---------- */
  wall: {
    intro: 'take the sky with you. every theme, day and night.',
    note: 'free. no signup, no email, no newsletter you did not ask for.',
    phone: 'phone',
    desk: 'desktop',
    day: 'day',
    night: 'night',
    locked: 'locked · {n} badges',
    lockedHint: 'earn it on the desktop and the wallpaper comes with it.',
    sizePhone: '1179 × 2556',
    sizeDesk: '2560 × 1440',
    got: 'saved ✦ {name}',
    open: '↓ get these as wallpapers'
  },

  themes: {
    base: 'cold boot',
    holo: 'prismagical',
    strawberry: 'strawberry spritz',
    arcade: 'midnight arcade',
    archangel: 'archangel',
    applied: 'theme: {name} ✦',
    locked: 'locked. {n} badges opens it.',
    standard: 'standard issue',
    earned: 'unlocked',
    final: 'the thirteenth · all badges',
    lockedMeta: 'locked · {n} badges',
    /* the phone's fallback: it has no room for the panel, so it says it in a line */
    opened: '{name} unlocked ✦'
  }
};

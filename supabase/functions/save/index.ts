// icybearOS saved progress -- the only path to the save table.
//
// `anon` has no grant on public.save at all, so everything arrives here. The
// anon key ships in public JavaScript: assume every field below is hostile.
//
// THE KEY IS NEVER LOGGED. Not on error, not in a debug line, never. It exists
// in this isolate's memory for the length of one request and nowhere else on
// the server side. The Telegram token taught us how quietly a secret reaches a
// log; this one must not.
//
// Secrets: KEY_SALT (hashing the key), IP_SALT (hashing the caller's address).

const ALLOWED_ORIGINS = new Set([
  "https://icybear.fun",
  "https://www.icybear.fun",
  "http://localhost:8000",
]);

// Crockford base32: no I, L, O or U. Removes 1/I and 0/O confusion for anyone
// copying by hand, and the missing U keeps generated keys from spelling
// anything unfortunate.
const A32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PREFIX = "ICYBR";
const BODY_LEN = 15;                       // 15 * 5 bits = 75 bits of entropy

// Duplicated byte-identically in os.js; a test asserts the two agree.
//
// The weights are ODD (2i+1) on purpose. With weights of i+1 the even ones
// share a factor with 32, so a character altered by exactly 16 at an even
// position left the sum unchanged -- 17 single-character typos passed silently.
// Every odd weight is coprime to 32, which makes every single-character error
// detectable. Measured across 300 random keys: 139500/139500 single-character
// typos caught, and 97.4% of adjacent transpositions -- the 2.6% missed are the
// predicted case, two characters whose values differ by exactly 16. Acceptable:
// the checksum exists to save a round trip and give a useful message, and the
// server is what actually decides.
function checkChar(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (2 * i + 1) * A32.indexOf(body[i]);
  return A32[sum % 32];
}

// Crockford treats these as equivalent on input, so a key mis-transcribed from
// a piece of paper still works.
function fold(s: string): string {
  return s.replace(/O/g, "0").replace(/[IL]/g, "1");
}

function canonical(raw: string): string {
  return String(raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Returns the 15-char body, or null if the key is malformed. */
function parseKey(raw: string): string | null {
  const flat = canonical(raw);
  if (flat.length !== PREFIX.length + BODY_LEN + 1) return null;
  // Fold the prefix and the body SEPARATELY. Folding the whole string rewrote
  // the I in ICYBR to a 1, so the prefix never matched itself -- caught by the
  // very first run of key.test.js.
  if (fold(flat.slice(0, PREFIX.length)) !== fold(PREFIX)) return null;
  const rest = fold(flat.slice(PREFIX.length));
  const body = rest.slice(0, BODY_LEN);
  if ([...body].some((c) => A32.indexOf(c) === -1)) return null;
  if (rest[BODY_LEN] !== checkChar(body)) return null;   // checksum
  return body;
}

// ---- what a save is allowed to contain -------------------------------------
const ACH = new Set(["name","feel","konami","crash","feed5","mute","snowman",
                     "gn","cert","reg","seasons","every","angel","all"]);
const THEMES = new Set(["base","holo","strawberry","arcade","archangel"]);

const NAME_RE = /^[\p{L}\p{N} _.@-]+$/u;
const NAME_ALNUM = /[\p{L}\p{N}]/u;

// the guestbook's blocklist, same logic, same reasons
const LEET: Record<string, string> = {
  "1":"i","!":"i","|":"i","3":"e","4":"a","@":"a","0":"o",
  "5":"s","$":"s","7":"t","+":"t","8":"b","9":"g","(":"c" };
/* THE LIST GREW. It was built for slurs and it stopped there, so ordinary
   profanity walked straight through: a snake board signed `Asshole` was the
   first thing a real tester tried and it worked.

   EVERY ADDITION IS EXACT-MATCH ONLY. Nothing here joins SEVERE, which is the
   substring pass and is the reason this filter once rejected 731 ordinary
   words. Three roots were deliberately REFUSED because of what they collapse
   to: `ass` becomes `as`, `kkk` becomes `k`, and `boobs` becomes `bobs`,
   which is somebody's handle. `nonce` was refused for a different reason --
   zero dictionary collisions, but it is a cryptographic term and this site's
   audience is crypto.

   PLURALS STAY EXPLICIT. Stripping a trailing s before matching would catch
   every plural in one line and would also block the surnames Cocks and
   Dicks, which is the Peacock bug returning by another door. */
const BLOCK_RAW = ["nigger", "nigga", "faggot", "fag", "retard", "kike", "spic", "chink",
                   "tranny", "dyke", "gook", "beaner", "wetback", "raghead", "towelhead",
                   "rape", "cunt", "whore", "slut", "bitch", "fuck", "shit", "dick",
                   "cock", "pussy", "nazi", "hitler", "kys", "pedo", "incel", "asshole",
                   "assholes", "asshat", "arsehole", "dumbass", "jackass", "blowjob",
                   "handjob", "rimjob", "cumshot", "deepthroat", "dildo", "jizz", "boner",
                   "penis", "vagina", "anus", "scrotum", "tits", "titties", "smegma",
                   "queef", "masturbate", "porn", "pornhub", "hentai", "bastard", "wanker",
                   "wank", "twat", "bollocks", "bellend", "minge", "skank", "douchebag",
                   "cocksucker", "motherfucker", "fucker", "fuckboy", "fuckface",
                   "shithead", "bullshit", "rapist", "pedophile", "molest", "groomer",
                   "heil", "fuhrer"];

// Pass 2 and pass 3 operate on this subset only. An entry earns a place when an
// embedded match is worth a rare false positive. Deliberately not `fuck`,
// `shit`, `dick` and friends: four letters that live inside hundreds of
// ordinary words, where the wall's hide button is the better answer.
const SEVERE = ["nigger", "nigga", "faggot", "kike", "tranny",
  "wetback", "raghead", "towelhead", "beaner"];

// letters only, accents folded, leet folded, runs KEPT.
// NFKC first: it folds fullwidth to ASCII, so the fullwidth spelling of a slur
// cannot walk past a list written in ASCII.
function flatten(s: string): string {
  let t = (s || "").toLowerCase().normalize("NFKC").toLowerCase();
  t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  t = [...t].map((c) => LEET[c] || c).join("");
  return t.replace(/[^a-z]/g, "");
}

// flatten, then collapse runs. Two names on purpose: pass 2 needs the
// uncollapsed form, and conflating them is exactly how this broke.
function normalize(s: string): string {
  return flatten(s).replace(/(.)\1+/g, "$1");
}

const BLOCK = BLOCK_RAW.map(normalize);

const UNLEET: Record<string, string> = {
  a: "a4@", e: "e3", i: "i1!|", o: "o0", u: "u",
  s: "s5$", t: "t7+", b: "b8", g: "g9", c: "c(",
};

// Third pass, for what normalising cannot see: punctuation standing in for a
// letter. `n.gger` survives pass one, because stripping the dot leaves `ngger`.
function looseRe(word: string): RegExp {
  const sep = "[^a-z0-9]*";
  const pattern = word.split("").map((ch) => {
    const cls = (UNLEET[ch] || ch).replace(/[$()|]/g, "\\$&");
    return "aeiou".includes(ch) ? "(?:[" + cls + "]|[^a-z0-9])" : "[" + cls + "]";
  }).join(sep);
  return new RegExp(pattern);
}
// SEVERE only: this regex is an unanchored substring match with separators
// allowed everywhere, so building it from the full list puts `cock` back inside
// `peacock` and undoes the whole fix one pass later.
const LOOSE = SEVERE.map(looseRe);

// Three passes. Equality on the collapsed form catches the direct hit and every
// padding/leet/spacing trick; substring on the UNCOLLAPSED form catches
// compounds without taking Nigeria down with `nigger`; the regex catches
// punctuation standing in for a letter. Measured against a 232k word
// dictionary: 24 false positives, down from 731. See test/blocklist.test.js.
function isBlocked(s: string): boolean {
  const whole = normalize(s);
  if (BLOCK.includes(whole)) return true;

  for (const w of String(s || "").split(/[^0-9A-Za-z@$!|+(]+/)) {
    if (w && BLOCK.includes(normalize(w))) return true;
  }

  const run = flatten(s);            // runs kept: nigerian is not nigger
  if (SEVERE.some((w) => run.includes(w))) return true;

  const low = (s || "").toLowerCase().normalize("NFKC");
  return LOOSE.some((re) => re.test(low));
}

function graphemes(s: string): number {
  try {
    // @ts-ignore available in Deno
    return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].length;
  } catch { return [...s].length; }
}

/** null when acceptable, otherwise a reason. */
function badBear(name: unknown): string | null {
  if (name === null || name === undefined) return null;
  if (typeof name !== "string") return "bear";
  const n = name.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!n) return null;
  if (graphemes(n) > 16) return "bear";
  if (!NAME_RE.test(n) || !NAME_ALNUM.test(n)) return "bear";
  if (isBlocked(n)) return "bear";
  return null;
}

async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* Any localhost port counts as development. CORS is a browser rule and never
   the security boundary here -- curl ignores it entirely -- so widening it for
   local dev costs nothing, while a mismatched dev origin silently breaks every
   request and looks exactly like a bug in the feature. */
function allowedOrigin(o: string | null): boolean {
  if (!o) return false;
  if (ALLOWED_ORIGINS.has(o)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
}

function cors(origin: string | null) {
  const ok = allowedOrigin(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "https://icybear.fun",
    /* Supabase requires apikey and authorization on every call, so the browser
       asks permission for them in the preflight. Allowing only content-type
       meant the preflight returned 200 while withholding the very headers the
       request needs -- the browser then refused to send it at all, surfacing as
       a bare "Failed to fetch". Invisible to curl and node, which ignore CORS,
       which is exactly why every test passed while the browser could not call
       this at all. */
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}
const reply = (b: unknown, s: number, o: string | null) =>
  new Response(JSON.stringify(b), { status: s, headers: cors(o) });

async function rpc(fn: string, args: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(url + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key,
               Authorization: "Bearer " + key },
    body: JSON.stringify(args),
  });
  if (!r.ok) return null;
  return await r.json();
}


/* ---------------------------------------------------------------- client ip
 *
 * x-forwarded-for is a LIST. Each proxy a request passes through appends the
 * address it received the request from, so an honest request arrives as
 * "client, proxy1, proxy2" and the visitor is on the left.
 *
 * The catch is that the leftmost entry is whatever the CALLER put there. A
 * request that arrives already carrying "x-forwarded-for: anything" gets the
 * real address appended after it, so reading parts[0] reads a string the
 * sender chose. That is what this function used to do, and it means every
 * per-address ceiling here could be reset by changing one header.
 *
 * Counting from the RIGHT fixes it. However many entries the caller invents,
 * they all land to the LEFT of the address the first real proxy appended, so
 * the visitor is always exactly TRUSTED_HOPS from the end, where TRUSTED_HOPS
 * is the number of proxies between them and this function. That number is a
 * property of Supabase's edge, not of this code, and it has to be measured
 * once rather than guessed:
 *
 *   1. set XFF_DEBUG = true, deploy, and open the site from a phone on mobile
 *      data (so it is definitely not the address your laptop uses)
 *   2. read the "xff depth=N" line in the function logs. Only the count is
 *      ever logged, never an address
 *   3. set TRUSTED_HOPS = N, set XFF_DEBUG back to false, deploy again
 *
 * Browsers never send x-forwarded-for themselves, so the depth an honest
 * request logs IS the hop count. No arithmetic.
 *
 * While TRUSTED_HOPS is null this behaves exactly as it always has, so
 * deploying this change on its own cannot alter any behaviour. Do not guess the
 * number to skip a deploy: too high and every visitor resolves to the same
 * shared address, which closes the guestbook for everyone after four
 * signatures. Too low is merely the status quo. Measure it.
 *
 * Either way the real ceilings are the table-wide ones (gb_sign's 30/hour and
 * save_create's 200/hour from migration 0004), because those are counted over
 * data rather than over a header and no request can move them.
 */
const TRUSTED_HOPS: number | null = null;
const XFF_DEBUG = false;

function clientIp(req: Request): string {
  const parts = (req.headers.get("x-forwarded-for") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (XFF_DEBUG) console.log("xff depth=" + parts.length);
  if (!parts.length) return "unknown";
  if (TRUSTED_HOPS === null) return parts[0];
  const i = parts.length - TRUSTED_HOPS;
  return parts[i >= 0 ? i : 0];
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return reply({ error: "method" }, 405, origin);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return reply({ error: "bad_json" }, 400, origin); }

  const op = b.op;
  if (op !== "create" && op !== "redeem" && op !== "sync" && op !== "rotate") {
    return reply({ error: "op" }, 400, origin);
  }

  const ipHash = await sha256(clientIp(req) + (Deno.env.get("IP_SALT") ?? ""));
  const salt = Deno.env.get("KEY_SALT") ?? "";

  // ---- the key. Parsed and hashed, never echoed, never logged.
  const body = parseKey(String(b.key ?? ""));
  if (!body) return reply({ error: "key" }, 400, origin);
  const keyHash = await sha256(PREFIX + body + salt);

  if (op === "redeem") {
    const out = await rpc("save_redeem", { p_ip_hash: ipHash, p_key_hash: keyHash });
    if (!out) return reply({ error: "backend" }, 503, origin);
    if (!out.ok) return reply({ error: out.reason }, out.reason === "rate" ? 429 : 404, origin);
    return reply({ ok: true, ach: out.ach ?? [], bear: out.bear,
                   theme: out.theme, visits: out.visits ?? 0 }, 200, origin);
  }

  if (op === "rotate") {
    const nb = parseKey(String(b.newKey ?? ""));
    if (!nb) return reply({ error: "key" }, 400, origin);
    const out = await rpc("save_rotate", {
      p_ip_hash: ipHash, p_old_hash: keyHash,
      p_new_hash: await sha256(PREFIX + nb + salt) });
    if (!out) return reply({ error: "backend" }, 503, origin);
    if (!out.ok) return reply({ error: out.reason }, out.reason === "rate" ? 429 : 404, origin);
    return reply({ ok: true }, 200, origin);
  }

  // ---- create and sync both carry a payload, so both validate it fully
  const rawAch = Array.isArray(b.ach) ? b.ach : [];
  if (rawAch.length > 32) return reply({ error: "payload" }, 400, origin);
  // unknown ids are dropped rather than stored: the table holds only ids the
  // site actually defines, so nothing arbitrary can be parked in it
  const ach = [...new Set(rawAch.filter((x) => typeof x === "string" && ACH.has(x)))];

  const theme = typeof b.theme === "string" && THEMES.has(b.theme) ? b.theme : null;

  const bearFault = badBear(b.bear);
  if (bearFault) return reply({ error: bearFault }, 400, origin);
  const bear = typeof b.bear === "string" && b.bear.trim()
    ? b.bear.normalize("NFC").trim().replace(/\s+/g, " ") : null;

  const visits = Number.isInteger(b.visits) && (b.visits as number) >= 0
    ? Math.min(b.visits as number, 999999) : 0;

  const out = await rpc(op === "create" ? "save_create" : "save_sync",
    op === "create"
      ? { p_ip_hash: ipHash, p_key_hash: keyHash, p_ach: ach,
          p_bear: bear, p_theme: theme, p_visits: visits }
      : { p_ip_hash: ipHash, p_key_hash: keyHash, p_ach: ach,
          p_bear: bear, p_theme: theme, p_visits: visits });

  if (!out) return reply({ error: "backend" }, 503, origin);
  if (!out.ok) return reply({ error: out.reason }, out.reason === "rate" ? 429 : 404, origin);
  return reply({ ok: true }, 200, origin);
});

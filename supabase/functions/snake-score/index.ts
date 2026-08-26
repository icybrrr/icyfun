// icybearOS snake board -- the only write path for a score.
//
// Third table a stranger can write to, third time this shape: validate from
// scratch on hostile input, rate limit and insert in one transaction, ping the
// operator, never trust the client. The name rules below are the guestbook's,
// character for character, because a leaderboard is a wall with numbers on it
// and the wall's rules are already right.
//
// CHEATING IS NOT DEFENDED, deliberately. A score arrives from a browser and
// nothing can prove a snake was played. Anyone who wants to top a personal
// site's snake board with a forged number has earned it. The name is what
// matters, and the name is defended exactly as hard as the guestbook's.
//
// Secrets: TELEGRAM_BOT_TOKEN  TELEGRAM_CHAT_ID  IP_SALT

const ALLOWED_ORIGINS = new Set([
  "https://icybear.fun",
  "https://www.icybear.fun",
  "http://localhost:8000",
]);

const MAX_SCORE = 600;   // the board is 30x20; a perfect game cannot exceed it

// ---------------------------------------------------------------- name rules
// Unicode letters and numbers plus space _ - . @ -- NOT [a-zA-Z0-9], which
// would reject @icygobrrr, José, Müller, Cyrillic and CJK names. The allowlist
// also rejects, for free, three things a blocklist cannot see: zero-width
// characters, Zalgo combining marks, and the right-to-left override.
// Duplicated byte-identically in os.js; a test asserts the two match.
const NAME_RE = /^[\p{L}\p{N} _.@-]+$/u;
const HAS_ALNUM = /[\p{L}\p{N}]/u;

const RESERVED = ["icy", "icygobrrr", "icybear", "admin", "mod",
                  "moderator", "official", "support"];

// Cyrillic and Greek lookalikes, folded before the reserved-name comparison.
// Not a general homoglyph defence -- that is unachievable while Cyrillic names
// stay legal, which they must. This closes the obvious impersonation only.
const CONFUSABLE: Record<string, string> = {
  "\u0430": "a", "\u0435": "e", "\u043e": "o", "\u0440": "p", "\u0441": "c",
  "\u0445": "x", "\u0443": "y", "\u0456": "i", "\u0455": "s", "\u04bb": "h",
  "\u03b1": "a", "\u03b5": "e", "\u03bf": "o", "\u03c1": "p", "\u03c5": "u",
  "\u0501": "d", "\u0261": "g",
};

function foldConfusables(s: string): string {
  return [...s.toLowerCase()].map((c) => CONFUSABLE[c] ?? c).join("")
    .replace(/[^a-z0-9]/g, "");
}

// ------------------------------------------------- blocklist, ported from os.js
// Verbatim, deliberately. The client keeps its copy so it can reject early; if
// the two ever disagree the client is the one that is wrong, and a test asserts
// they do not.
const LEET: Record<string, string> = {
  "1": "i", "!": "i", "|": "i", "3": "e", "4": "a", "@": "a", "0": "o",
  "5": "s", "$": "s", "7": "t", "+": "t", "8": "b", "9": "g", "(": "c",
};
// Must stay identical to BLOCK_RAW in os.js. test/blocklist.test.js compares the
// two files and fails if they drift, because a word added to only one of them
// means the client rejects what the server accepts, or worse, the reverse.
const BLOCK_RAW = ["nigger", "nigga", "faggot", "fag", "retard", "kike", "spic", "chink",
  "tranny", "dyke", "gook", "beaner", "wetback", "raghead", "towelhead",
  "rape", "cunt", "whore", "slut", "bitch", "fuck", "shit",
  "dick", "cock", "pussy", "nazi", "hitler", "kys", "pedo", "incel"];

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

// ------------------------------------------------------------------ helpers
function graphemes(s: string): number {
  // .length counts UTF-16 code units, which miscounts CJK and decomposed
  // accents. Segmenter counts what a person would call a character.
  try {
    // @ts-ignore -- available in Deno
    return [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].length;
  } catch {
    return [...s].length;
  }
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

function reply(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

// -------------------------------------------------------------------- serve

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

  let body: { name?: unknown; score?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "bad_json" }, 400, origin);
  }

  const score = body.score;
  if (typeof score !== "number" || !Number.isInteger(score) ||
      score <= 0 || score > MAX_SCORE) {
    return reply({ error: "score" }, 400, origin);
  }

  if (typeof body.name !== "string") return reply({ error: "name" }, 400, origin);
  const name = body.name.normalize("NFC").trim().replace(/\s+/g, " ");
  if (!name) return reply({ error: "empty" }, 400, origin);
  if (graphemes(name) > 16) return reply({ error: "too_long" }, 400, origin);
  if (!NAME_RE.test(name)) return reply({ error: "charset" }, 400, origin);
  if (!HAS_ALNUM.test(name)) return reply({ error: "charset" }, 400, origin);

  const folded = foldConfusables(name);
  if (RESERVED.includes(folded)) return reply({ error: "reserved" }, 400, origin);

  // Generic on purpose. A specific message here is a slur-guessing oracle.
  if (isBlocked(name)) return reply({ error: "rejected" }, 400, origin);

  const ipHash = await sha256(clientIp(req) + (Deno.env.get("IP_SALT") ?? ""));

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const rpc = await fetch(url + "/rest/v1/rpc/snake_post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify({ p_ip_hash: ipHash, p_name: name, p_score: score }),
  });

  if (!rpc.ok) return reply({ error: "backend" }, 503, origin);
  const out = await rpc.json();
  if (!out?.ok) return reply({ error: out?.reason ?? "rejected" }, 429, origin);

  // Only worth waking Icy for a score that actually took the top of the board.
  if (out.rank === 1) {
    const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const chat = Deno.env.get("TELEGRAM_CHAT_ID");
    if (token && chat) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 3000);
      try {
        await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chat,
            text: "snake: new #1 -- " + name + " " + score,
          }),
          signal: ctl.signal,
        });
      } catch (e) {
        /* NAME ONLY. Deno puts the request url, and therefore the bot token,
           inside a fetch rejection message. */
        console.error("telegram: " + ((e && (e as Error).name) || "error"));
      } finally {
        clearTimeout(timer);
      }
    }
  }

  return reply({ ok: true, rank: out.rank, name, score }, 200, origin);
});

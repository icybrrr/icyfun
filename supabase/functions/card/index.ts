// icybearOS edition numbers -- the only path to a card serial.
//
// Two operations, both thin: `mint` draws an unused number, `claim` spends a
// one-time code for one of the two reserved ones. All the interesting logic is
// in the database (migration 0006), because the allocation has to be atomic and
// a primary key is the only thing here that can promise that.
//
// This function exists at all because next_card_serial() is service_role only.
// A browser that could call it directly could sit in a loop and burn the run,
// and a browser that could call claim_card_serial() could brute the codes.
//
// No rate limit on `mint` beyond the run itself: a serial is minted once per
// visitor, the table caps at 9999 rows by construction, and there is nothing
// to gain by exhausting it that is worth the machinery. `claim` is naturally
// bounded -- two codes exist and each works once.

const ALLOWED_ORIGINS = new Set([
  "https://icybear.fun",
  "https://www.icybear.fun",
  "http://localhost:8000",
]);

/* Any localhost port counts as development. CORS is a browser rule and never
   the security boundary here -- curl ignores it entirely. */
function allowedOrigin(o: string | null): boolean {
  if (!o) return false;
  if (ALLOWED_ORIGINS.has(o)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
}

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin! : "https://icybear.fun",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Max-Age": "86400",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
}

function reply(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: cors(origin) });
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const r = await fetch(url + "/rest/v1/rpc/" + fn, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) return { ok: false as const, value: null };
  return { ok: true as const, value: (await r.json()) as string | null };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return reply({ error: "method" }, 405, origin);

  let body: { op?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return reply({ error: "bad_json" }, 400, origin);
  }

  if (body.op === "claim") {
    // Shape-checked before it reaches the database. The codes are three groups
    // of five from [a-z0-9]; anything else is not a typo, it is a probe.
    if (typeof body.code !== "string" ||
        !/^[a-z0-9]{5}-[a-z0-9]{5}-[a-z0-9]{5}$/.test(body.code)) {
      return reply({ error: "code" }, 400, origin);
    }
    const out = await rpc("claim_card_serial", { p_code: body.code });
    if (!out.ok) return reply({ error: "backend" }, 503, origin);
    // Same answer for a wrong code and a spent one. Telling them apart would
    // turn this into an oracle for which codes exist.
    if (!out.value) return reply({ error: "spent" }, 409, origin);
    return reply({ ok: true, no: out.value, claimed: true }, 200, origin);
  }

  if (body.op === "mint") {
    const out = await rpc("next_card_serial", {});
    if (!out.ok) return reply({ error: "backend" }, 503, origin);
    if (!out.value) return reply({ error: "exhausted" }, 503, origin);
    return reply({ ok: true, no: out.value }, 200, origin);
  }

  return reply({ error: "op" }, 400, origin);
});

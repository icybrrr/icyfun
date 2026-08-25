-- ============================================================================
-- 0005 - a real sequence behind the proof-of-visit card's edition number.
--
-- NOT APPLIED, AND NOT YET WIRED TO ANYTHING. The client mints its own number
-- today (os.js, cardSerial) and nothing here is called by any code path. This
-- file exists so the upgrade is one deploy rather than one design session.
--
-- WHAT THE CLIENT DOES NOW, AND WHY. The card carries `No. 888-0417`: run 888,
-- four drawn digits. The obvious version is a counter, and a counter is what
-- this file provides -- but a public counter is a public census. A card that
-- says No. 0012 tells everyone who sees it that twelve people have ever been
-- here, which is the one fact a personal site should not put in its own
-- artwork. Drawn digits read as an edition code, which is what they are.
--
-- WHAT THIS ADDS IF APPLIED. A sequence that starts high enough to be honest --
-- 888 is the run, and the first card off the press is 888-0001 -- plus one
-- SECURITY DEFINER function to hand out the next one. Collisions become
-- impossible rather than merely unlikely (drawn digits collide at about 1 in
-- 9999 per pair, which for a few thousand cards is a near certainty by the
-- birthday bound; nobody will ever notice, but it is worth writing down that
-- the client version is unique-ish rather than unique).
--
-- TO WIRE IT UP, three changes, none of them here:
--   1. supabase/functions/save/index.ts: on INSERT, call next_card_serial() and
--      store the result on the row.
--   2. The same function returns it in the response body.
--   3. os.js cardSerial(): prefer the server value when the save round-trip has
--      one, keep the local mint as the offline path, and never overwrite a
--      serial that already exists -- the number is permanent, and a card
--      somebody has already posted must keep the number it was posted with.
--
-- The misprint flag stays client-side either way. It is a coin flip at mint
-- time, it is stored with the number, and the server has no opinion about it.
-- ============================================================================

-- The run. 888 is Icy's, and starting at 1 inside it is honest: the first card
-- really is the first card, it just is not pretending the run started at zero.
create sequence if not exists private.card_serial
  start with 1
  increment by 1
  no maxvalue
  cache 1;

comment on sequence private.card_serial is
  'Edition numbers for the proof-of-visit card. Formatted 888-%04d by the caller.';

-- SECURITY DEFINER because `private` is not reachable by anon, which is the
-- point: the sequence must not be readable (its value is the visitor count) and
-- must not be settable. The only thing anyone may do is take the next one.
create or replace function public.next_card_serial()
returns text
language sql
security definer
set search_path = private, pg_temp
as $$
  select '888-' || lpad(nextval('private.card_serial')::text, 4, '0');
$$;

comment on function public.next_card_serial() is
  'Hands out the next card edition number. Never reveals the counter itself.';

-- Only the service role. The edge function runs as service_role; the browser
-- must never be able to burn numbers by calling this in a loop.
revoke all on function public.next_card_serial() from public, anon, authenticated;

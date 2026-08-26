-- ============================================================================
-- 0006 - the card's edition number, drawn rather than counted.
--
-- NOT APPLIED YET. Apply this, then deploy supabase/functions/card.
--
-- Replaces the unapplied 0005, which handed out a sequence. A sequence is a
-- census: a card that says No. 0012 tells everyone who sees it that twelve
-- people have ever been here, and that is the one fact a personal site should
-- not put in its own artwork. It also cannot be un-said later.
--
-- So the server DRAWS a number and retries if it is taken. That keeps the one
-- thing the sequence was actually for -- guaranteed uniqueness, which the
-- client mint never had (drawn digits collide at about 1 in 9999 per pair, so
-- by the birthday bound a few thousand cards makes a collision near certain) --
-- while leaking nothing about how many have been issued.
--
-- 0001, 8888 AND 0621 ARE NOT IN THE DRAW. They are inserted here, which is what
-- makes them unobtainable: `insert` is the allocator, so a row that already
-- exists can never be allocated. They are handed out by one-time claim code
-- instead. That is also what keeps the proprietor out of the queue for 0001 --
-- she is not in the queue at all.
--
-- Rarity lives in the client (os.js, SUPER and RARE) because it is a costume,
-- not a permission. The server has no opinion about which numbers are pretty.
-- ============================================================================

create table if not exists private.card (
  digits     char(4)     primary key,
  claim_code text        unique,          -- only ever set on the reserved rows
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table private.card is
  'Every edition number ever issued. In `private`, which PostgREST does not
   expose, because a count of these rows is the visitor count.';

-- The three that are spoken for. Reserving them is the whole trick: `insert` is
-- the allocator below, so a row that already exists can never be drawn.
-- Keep this list in step with SUPER in os.js: a number that is dressed as
-- one-of-one in the client but not reserved here can be dealt to a stranger.
--
-- THE CODES ARE NOT IN THIS FILE, AND MUST NEVER BE. This repo is public. The
-- .vercelignore keeps supabase/ off the website but not off github, so a code
-- committed here is a code published. The rows go in reserved-but-unclaimable
-- (claim_code null matches nothing in claim_card_serial), and each code is set
-- by hand once, in the SQL editor, from a note that is not in version control:
--
--   update private.card set claim_code = '<code>' where digits = '0001';
--   update private.card set claim_code = '<code>' where digits = '8888';
--   update private.card set claim_code = '<code>' where digits = '0621';
--
-- Until that runs, all three are out of circulation and nobody -- including
-- the operator -- can claim any of them. That is the correct resting state.
insert into private.card (digits) values ('0001'), ('8888'), ('0621')
  on conflict (digits) do nothing;

-- ---------------------------------------------------------------- the draw
-- Insert IS the allocation: the primary key does the collision check, so there
-- is no read-then-write window for two simultaneous visitors to fall into.
create or replace function public.next_card_serial()
returns text
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  d     char(4);
  tries int := 0;
begin
  loop
    tries := tries + 1;
    -- 9999 numbers and a few thousand cards: this lands first try essentially
    -- always. The ceiling is here so a full table cannot spin forever.
    if tries > 200 then
      return null;
    end if;
    d := lpad((floor(random() * 9999) + 1)::int::text, 4, '0');
    begin
      insert into private.card (digits) values (d);
      return 'ICYB-' || d;
    exception when unique_violation then
      null;   -- taken, or reserved. draw again.
    end;
  end loop;
end;
$$;

comment on function public.next_card_serial() is
  'Draws an unused edition number. Never reveals how many have been drawn.';

-- --------------------------------------------------------------- the claim
-- One shot. The update is the guard: `claimed_at is null` in the WHERE means a
-- second call with the same code matches no row and returns null, so a code
-- cannot be spent twice even if two people race it.
create or replace function public.claim_card_serial(p_code text)
returns text
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  d char(4);
begin
  update private.card
     set claimed_at = now()
   where claim_code = p_code
     and claimed_at is null
  returning digits into d;

  if d is null then
    return null;
  end if;
  return 'ICYB-' || d;
end;
$$;

comment on function public.claim_card_serial(text) is
  'Spends a one-time code for a reserved edition number. Null if already spent.';

-- Only the service role. The edge function runs as service_role; a browser that
-- could call either of these could burn numbers in a loop, or brute the codes.
revoke all on function public.next_card_serial()          from public, anon, authenticated;
revoke all on function public.claim_card_serial(text)     from public, anon, authenticated;
grant execute on function public.next_card_serial()       to service_role;
grant execute on function public.claim_card_serial(text)  to service_role;


-- ------------------------------------------------------------------- verify
--   select count(*) from private.card;                    -- 3 before launch
--   select digits, claim_code is not null as reserved,
--          claimed_at from private.card order by digits;
--
-- BEFORE LAUNCH, once testing is done. This only ever removes DRAWN numbers:
-- the reserved three carry a claim_code, so they are never in the delete's way.
-- The digits clause is the belt to that braces: it protects them even in the
-- window before their codes are set.
--   delete from private.card
--    where claim_code is null and digits not in ('0001', '8888', '0621');
--
-- To re-test a claim after spending a code:
--   update private.card set claimed_at = null where digits = '8888';

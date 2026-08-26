-- icybearOS guestbook -- schema, row level security, rate limiting.
--
-- Run once in the Supabase SQL editor. Reviewed against guestbook-spec.md.
--
-- SECURITY MODEL, in one line: anon may SELECT four columns of non-hidden rows
-- and NOTHING else. Every write goes through the Edge Function, which holds
-- service_role and is the only thing that may insert. The anon key ships in
-- public JavaScript, so anything anon is granted here is granted to the world.

-- ---------------------------------------------------------------- internals
-- A schema the Data API never exposes. Rate-limit state and the kill switch
-- live here so they cannot be read or written from the browser at all.
create schema if not exists private;
revoke all on schema private from anon, authenticated, public;

-- ------------------------------------------------------------------ the wall
create table if not exists public.guestbook (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  stamp      text        not null,
  created_at timestamptz not null default now(),
  hidden     boolean     not null default false,

  -- Defence in depth. The Edge Function does the real validation; these are the
  -- backstop for the day something writes to this table by another route.
  constraint name_length  check (char_length(name) between 1 and 16),
  constraint name_safe    check (name !~ '[<>&"''/\\`();=]' and name !~ '[[:cntrl:]]'),
  constraint stamp_known  check (stamp in (
    '🎀',
    '🐻',
    '🐻‍❄️',
    '🐼',
    '🧸',
    '😇',
    '🪽',
    '✨',
    '💜',
    '🧁',
    '🍓',
    '🧋',
    '🥛',
    '🍄',
    '🌸',
    '🦄',
    '🦋',
    '🌈',
    '😹',
    '🫶',
    '⭐',
    '☁️',
    '❄️',
    '👑',
    '🌙',
    '🕊️',
    '💌'
  ))
);

-- the wall is always read newest-first, and only ever the visible rows
create index if not exists guestbook_wall
  on public.guestbook (created_at desc) where hidden = false;

-- ----------------------------------------------------------------------- RLS
alter table public.guestbook enable row level security;

-- Read: anyone, but only rows that have not been hidden. There is deliberately
-- no INSERT, UPDATE or DELETE policy: absent a policy, RLS denies. service_role
-- bypasses RLS entirely, which is how the Edge Function inserts.
drop policy if exists "anon reads visible entries" on public.guestbook;
create policy "anon reads visible entries"
  on public.guestbook for select to anon
  using (hidden = false);

-- Column-level grant: anon cannot select `hidden` even though it filters on it,
-- so the wall cannot be probed for what has been moderated.
revoke all on public.guestbook from anon, authenticated;
grant select (id, name, stamp, created_at) on public.guestbook to anon;

-- --------------------------------------------------------- rate limit state
-- Raw IP addresses are never stored. This is sha256(ip || IP_SALT), computed in
-- the Edge Function, and it exists only to answer "has this address signed
-- recently". Rows are swept daily by the pg_cron job installed in 0003, so a
-- hash lives at most about three days; it has no purpose beyond that.
--
-- This was untrue from the day it was written until 23 Aug 2026: the function
-- below existed and nothing ever called it.
create table if not exists private.signer (
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);
create index if not exists signer_lookup on private.signer (ip_hash, created_at desc);
create index if not exists signer_sweep  on private.signer (created_at);

create or replace function private.purge_signers()
returns void language sql security definer set search_path = private as $$
  delete from private.signer where created_at < now() - interval '48 hours';
$$;

-- ------------------------------------------------------------- kill switch
-- One row, flipped from the dashboard, that makes the function refuse every
-- write without a redeploy.
create table if not exists private.settings (
  key   text primary key,
  value jsonb not null
);
insert into private.settings (key, value)
  values ('accepting_signatures', 'true'::jsonb)
  on conflict (key) do nothing;

-- ------------------------------------------------------------------ verify
-- Expect: anon has SELECT on four columns and no other privilege anywhere.
--   select grantee, privilege_type, table_name
--   from information_schema.role_table_grants
--   where grantee in ('anon','authenticated') order by table_name;

-- ------------------------------------------------------- the one write path
-- Everything the write needs, in one transaction: kill switch, three rate
-- limits, the signer record and the insert.
--
-- Two reasons this is not done in the Edge Function. First, "count then insert"
-- across a network round trip is a race -- two concurrent requests both read
-- three-so-far and both insert. Second, `private` is not exposed to the Data
-- API at all, by design, so the function cannot read it directly.
--
-- SECURITY DEFINER, so it can touch `private`, with an explicit search_path so
-- it cannot be hijacked by a shadowed relation. EXECUTE is granted to
-- service_role ONLY: anon holds the public key and must never reach this.
create or replace function public.gb_sign(
  p_ip_hash text,
  p_name    text,
  p_stamp   text
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_accepting boolean;
  v_hour   int;
  v_day    int;
  v_global int;
  v_id     uuid;
begin
  select (value #>> '{}')::boolean into v_accepting
    from private.settings where key = 'accepting_signatures';
  if not coalesce(v_accepting, false) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  select count(*) into v_hour from private.signer
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_hour >= 4 then
    return jsonb_build_object('ok', false, 'reason', 'rate_hour');
  end if;

  select count(*) into v_day from private.signer
    where ip_hash = p_ip_hash and created_at > now() - interval '24 hours';
  if v_day >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'rate_day');
  end if;

  -- blunt circuit breaker: a distributed flood defeats per-IP limits entirely
  select count(*) into v_global from public.guestbook
    where created_at > now() - interval '1 hour';
  if v_global >= 30 then
    return jsonb_build_object('ok', false, 'reason', 'rate_global');
  end if;

  insert into private.signer (ip_hash) values (p_ip_hash);
  insert into public.guestbook (name, stamp) values (p_name, p_stamp)
    returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.gb_sign(text, text, text)
  from public, anon, authenticated;
grant execute on function public.gb_sign(text, text, text) to service_role;

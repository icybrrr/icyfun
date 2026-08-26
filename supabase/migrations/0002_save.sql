-- icybearOS saved progress -- the product key.
--
-- Run once in the Supabase SQL editor. Reviewed against accounts-spec.md.
--
-- SECURITY MODEL, in one line: `anon` gets NOTHING here -- not select, not
-- anything. Every operation goes through an Edge Function holding service_role.
-- The anon key ships in public JavaScript, so any grant to anon is a grant to
-- the world, and unlike the guestbook there is nothing here the world may read.
--
-- THE KEY IS NEVER STORED. Only sha256(key || KEY_SALT), computed in the Edge
-- Function. A key can therefore be VERIFIED but never RETRIEVED -- by an
-- attacker, by Supabase, or by the operator. That is deliberate: if she could
-- read keys, her dashboard login would become a master key to every visitor's
-- progress, and one compromised account would expose all of them.
--
-- The consequence is accepted knowingly: there is no recovery and no support
-- path. A lost key is lost. That is the correct trade for cosmetic progress and
-- the reason the key must never gate anything of value (accounts-spec §15).

-- ------------------------------------------------------------------ the save
create table if not exists public.save (
  key_hash     text        primary key,     -- sha256(key || KEY_SALT)
  achievements text[]      not null default '{}',
  bear_name    text,
  theme        text,
  visits       int         not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  retired_at   timestamptz,                 -- set on rotation; retired keys die

  constraint bear_name_len  check (bear_name is null or char_length(bear_name) between 1 and 16),
  constraint bear_name_safe check (bear_name is null or
                                   (bear_name !~ '[<>&"''/\\`();=]' and bear_name !~ '[[:cntrl:]]')),
  constraint visits_sane    check (visits >= 0 and visits < 1000000),
  constraint ach_sane       check (array_length(achievements, 1) is null
                                   or array_length(achievements, 1) <= 32)
);

-- lookup is an index seek on the primary key, never a scan, so a wrong key
-- costs the same as a right one and the comparison leaks nothing by timing
alter table public.save enable row level security;

-- No policies at all. Absent a policy, RLS denies everything. service_role
-- bypasses RLS, which is how the Edge Function works.
revoke all on public.save from anon, authenticated, public;

-- --------------------------------------------------------- rate limit state
-- Raw IPs are never written. sha256(ip || IP_SALT), computed in the function,
-- kept only long enough to answer "has this address been hammering us".
create table if not exists private.attempt (
  ip_hash    text        not null,
  kind       text        not null,          -- 'redeem' | 'create' | 'rotate'
  created_at timestamptz not null default now()
);
create index if not exists attempt_lookup on private.attempt (ip_hash, kind, created_at desc);
create index if not exists attempt_sweep  on private.attempt (created_at);

create or replace function private.purge_attempts()
returns void language sql security definer set search_path = private as $$
  delete from private.attempt where created_at < now() - interval '48 hours';
$$;

-- ------------------------------------------------------------------ helpers
create or replace function private.too_many(p_ip_hash text, p_kind text,
                                            p_window interval, p_max int)
returns boolean language sql security definer set search_path = private as $$
  select count(*) >= p_max from private.attempt
   where ip_hash = p_ip_hash and kind = p_kind and created_at > now() - p_window;
$$;

-- ------------------------------------------------------------------- create
-- Mints a new save. The key itself was generated in the browser and only its
-- hash arrives here, so the server never sees the secret it is storing.
create or replace function public.save_create(
  p_ip_hash text, p_key_hash text,
  p_ach text[], p_bear text, p_theme text, p_visits int
) returns jsonb
language plpgsql security definer set search_path = public, private as $$
begin
  /* A real visitor creates exactly one key, ever, so anything above one is
     several people behind one address -- an office, a university, a mobile
     carrier. Five was tight for the exact moment that matters: a link going
     round and a dozen people earning their third badge within the hour. */
  if private.too_many(p_ip_hash, 'create', interval '1 hour', 12) then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  insert into private.attempt (ip_hash, kind) values (p_ip_hash, 'create');

  insert into public.save (key_hash, achievements, bear_name, theme, visits)
    values (p_key_hash, coalesce(p_ach, '{}'), p_bear, p_theme, greatest(coalesce(p_visits, 0), 0))
    on conflict (key_hash) do nothing;
  if not found then
    -- the hash already exists: this key would open someone else's save.
    -- tell the client to mint a different one rather than silently colliding.
    return jsonb_build_object('ok', false, 'reason', 'retry');
  end if;
  return jsonb_build_object('ok', true);
end; $$;

-- ------------------------------------------------------------------- redeem
-- The one place a key is checked. Rate limited hard: this is an auth endpoint,
-- and the client-side checksum means honest typos never reach it.
create or replace function public.save_redeem(p_ip_hash text, p_key_hash text)
returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare r public.save%rowtype;
begin
  if private.too_many(p_ip_hash, 'redeem', interval '1 hour', 10) then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  insert into private.attempt (ip_hash, kind) values (p_ip_hash, 'redeem');

  select * into r from public.save
   where key_hash = p_key_hash and retired_at is null;
  if not found then
    -- deliberately identical to every other failure: no oracle
    return jsonb_build_object('ok', false, 'reason', 'unknown');
  end if;

  return jsonb_build_object('ok', true, 'ach', r.achievements,
    'bear', r.bear_name, 'theme', r.theme, 'visits', r.visits);
end; $$;

-- --------------------------------------------------------------------- sync
-- Pushes local progress up. Achievements UNION rather than replace, so a leaked
-- key can add badges but can never destroy them -- which turns a leak from a
-- griefing vector into somebody giving away free badges.
--
-- That guarantee covers ACHIEVEMENTS ONLY, and the sentence above used to be
-- read as covering the row. bear_name and theme are coalesce-replaced below, so
-- a leaked key can rename someone's bear and change their wallpaper. visits is
-- greatest(), so it cannot be walked backwards. Nothing here can delete a save.
-- Worth knowing before the guarantee gets quoted at something it does not
-- cover; if bear_name ever needs the same protection, it has to be a separate
-- rule, because a name has no union.
create or replace function public.save_sync(
  p_ip_hash text, p_key_hash text, p_ach text[], p_bear text, p_theme text, p_visits int
) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare n int;
begin
  if private.too_many(p_ip_hash, 'sync', interval '1 hour', 120) then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  insert into private.attempt (ip_hash, kind) values (p_ip_hash, 'sync');

  update public.save set
    achievements = (select array(select distinct unnest(achievements || coalesce(p_ach, '{}')))),
    bear_name    = coalesce(p_bear, bear_name),
    theme        = coalesce(p_theme, theme),
    visits       = greatest(visits, coalesce(p_visits, 0)),
    updated_at   = now()
   where key_hash = p_key_hash and retired_at is null;
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  return jsonb_build_object('ok', true);
end; $$;

-- ------------------------------------------------------------------- rotate
-- A leaked key is otherwise permanent. This copies the save to a new key and
-- retires the old one in a single transaction, so there is no window where both
-- work or neither does.
create or replace function public.save_rotate(
  p_ip_hash text, p_old_hash text, p_new_hash text
) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare r public.save%rowtype;
begin
  if private.too_many(p_ip_hash, 'rotate', interval '1 hour', 5) then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  insert into private.attempt (ip_hash, kind) values (p_ip_hash, 'rotate');

  select * into r from public.save where key_hash = p_old_hash and retired_at is null;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown'); end if;

  insert into public.save (key_hash, achievements, bear_name, theme, visits, created_at)
    values (p_new_hash, r.achievements, r.bear_name, r.theme, r.visits, r.created_at)
    on conflict (key_hash) do nothing;
  if not found then return jsonb_build_object('ok', false, 'reason', 'retry'); end if;
  update public.save set retired_at = now() where key_hash = p_old_hash;

  return jsonb_build_object('ok', true);
end; $$;

-- ------------------------------------------------------------------- grants
-- service_role only. anon holds the public key and must never reach any of this.
revoke all on function public.save_create(text,text,text[],text,text,int) from public, anon, authenticated;
revoke all on function public.save_redeem(text,text)                       from public, anon, authenticated;
revoke all on function public.save_sync(text,text,text[],text,text,int)         from public, anon, authenticated;
revoke all on function public.save_rotate(text,text,text)                  from public, anon, authenticated;

grant execute on function public.save_create(text,text,text[],text,text,int) to service_role;
grant execute on function public.save_redeem(text,text)                       to service_role;
grant execute on function public.save_sync(text,text,text[],text,text,int)         to service_role;
grant execute on function public.save_rotate(text,text,text)                  to service_role;

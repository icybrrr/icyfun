-- ============================================================================
-- 0007 - the arcade wall. snake keeps score.
--
-- NOT APPLIED YET. Apply this, then deploy supabase/functions/snake-score.
--
-- Snake had no high score, no persistence and no board. It is a finished toy
-- with the last five percent missing, and a leaderboard is the only mechanic on
-- this whole site that gives somebody a reason to open it again tomorrow
-- specifically.
--
-- SHAPE. The guestbook's, again, and for the same reason: this is the third
-- table a stranger may write to and it should not invent a third way to be
-- careful. One public read of the top ten, one SECURITY DEFINER write, per-IP
-- and table-wide rate limits, a kill switch, and the 48-hour sweep.
--
-- CHEATING. Trivial and irrelevant. The score arrives from a browser and there
-- is no way to prove a snake was ever played; anyone who wants to be top of a
-- personal site's snake board with a forged number has earned it. What IS
-- defended is the part that would actually hurt: the name, which is public, and
-- which goes through the same allowlist, reserved list, confusable folding and
-- blocklist as the guestbook. A leaderboard is a wall with numbers on it.
-- ============================================================================

create table if not exists public.snake_score (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  score      int         not null check (score > 0 and score <= 600),
  hidden     boolean     not null default false,
  created_at timestamptz not null default now()
);

create index if not exists snake_board on public.snake_score (score desc, created_at asc)
  where hidden = false;

alter table public.snake_score enable row level security;

create policy "anon reads the visible board"
  on public.snake_score for select to anon
  using (hidden = false);

-- Column-level grant: anon filters on `hidden` but must never read it, exactly
-- as in 0001. No insert, update or delete for anyone but the service role.
revoke all on public.snake_score from anon, authenticated;
grant select (id, name, score, created_at) on public.snake_score to anon;

create table if not exists private.player (
  ip_hash    text        not null,
  created_at timestamptz not null default now()
);
create index if not exists player_lookup on private.player (ip_hash, created_at desc);
create index if not exists player_sweep  on private.player (created_at);

create or replace function private.purge_players()
returns void language sql security definer set search_path = private as $$
  delete from private.player where created_at < now() - interval '48 hours';
$$;

insert into private.settings (key, value)
  values ('accepting_scores', 'true'::jsonb)
  on conflict (key) do nothing;

create or replace function public.snake_post(
  p_ip_hash text,
  p_name    text,
  p_score   int
) returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_accepting boolean;
  v_hour   int;
  v_global int;
  v_id     uuid;
  v_rank   int;
begin
  select (value #>> '{}')::boolean into v_accepting
    from private.settings where key = 'accepting_scores';
  if not coalesce(v_accepting, false) then
    return jsonb_build_object('ok', false, 'reason', 'closed');
  end if;

  if p_score is null or p_score <= 0 or p_score > 600 then
    return jsonb_build_object('ok', false, 'reason', 'score');
  end if;

  -- Generous, because losing at snake repeatedly is the intended experience.
  select count(*) into v_hour from private.player
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
  if v_hour >= 20 then
    return jsonb_build_object('ok', false, 'reason', 'rate_hour');
  end if;

  select count(*) into v_global from public.snake_score
    where created_at > now() - interval '1 hour';
  if v_global >= 200 then
    return jsonb_build_object('ok', false, 'reason', 'rate_global');
  end if;

  insert into private.player (ip_hash) values (p_ip_hash);
  insert into public.snake_score (name, score) values (p_name, p_score)
    returning id into v_id;

  -- The rank the player just took, so the client can say "you are 4th" without
  -- a second round trip. Ties break toward the earlier score, which is the
  -- convention every arcade cabinet has used since 1980.
  select count(*) + 1 into v_rank from public.snake_score
    where hidden = false and (score > p_score);

  return jsonb_build_object('ok', true, 'id', v_id, 'rank', v_rank);
end;
$$;

revoke all on function public.snake_post(text, text, int)
  from public, anon, authenticated;
grant execute on function public.snake_post(text, text, int) to service_role;

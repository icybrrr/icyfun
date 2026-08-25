-- ============================================================================
-- 0004 - a global breaker for save_create.
--
-- Approved 23 Aug 2026. Separated from 0003 deliberately so either can be
-- applied on its own. See the x-forwarded-for note in that day's audit; this is
-- the half of the finding that is safe to fix without first probing the live
-- deployment, and it is the half that actually closes the attack.
-- ============================================================================


-- Every per-IP limit in this schema is keyed on a hash of an address the
-- FUNCTION is told about, and the edge function derives that address from the
-- x-forwarded-for header. The leftmost element of that header is written by the
-- caller, so a request that invents a fresh value gets a fresh bucket, and
-- every per-IP ceiling in both functions is defeated by one header.
--
-- gb_sign already survives this, because it also counts the whole table: 30
-- signatures an hour from anyone at all and it closes. No header moves that
-- number. save_create had no equivalent, so the concrete attack is unbounded
-- row creation, one row in public.save plus one in private.attempt per request,
-- forever, against a 500MB free tier.
--
-- This adds the same kind of floor. Deliberately generous: 200 an hour is far
-- above any traffic this site will see, including a link going round, and far
-- below anything that threatens the database. The point is that a ceiling
-- exists at all, not that it is tight.
--
-- This does NOT fix the header parse itself. That is a change in the edge
-- functions and needs one probe against the live deployment to confirm the
-- header's real shape first; guessing wrong takes the site down.

create or replace function public.save_create(
  p_ip_hash text, p_key_hash text,
  p_ach text[], p_bear text, p_theme text, p_visits int
) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare
  v_global int;
begin
  /* A real visitor creates exactly one key, ever, so anything above one is
     several people behind one address: an office, a university, a mobile
     carrier. Five was tight for the exact moment that matters, a link going
     round and a dozen people earning their third badge within the hour. */
  if private.too_many(p_ip_hash, 'create', interval '1 hour', 12) then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;

  /* The floor no header can lower. Counted over the table rather than over one
     address, exactly as gb_sign does, so a forged x-forwarded-for buys a fresh
     per-IP bucket and still runs into this. */
  select count(*) into v_global from public.save
    where created_at > now() - interval '1 hour';
  if v_global >= 200 then
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

-- create or replace keeps the existing grants, but restate them so this file is
-- readable on its own and cannot be applied into a weaker state by mistake.
revoke all on function public.save_create(text, text, text[], text, text, int)
  from public, anon, authenticated;
grant execute on function public.save_create(text, text, text[], text, text, int)
  to service_role;

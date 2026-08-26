-- ============================================================================
-- 0003 - actually run the sweep that 0001 and 0002 promised.
--
-- private.purge_signers() and private.purge_attempts() were both written, both
-- documented as running every 48 hours, and never called once. No pg_cron
-- schedule, no caller in either edge function, no caller anywhere in the repo.
--
-- So the sentence in 0001 -- "rows are swept after 48h; the hash has no purpose
-- beyond that" -- was not true, and two tables of salted IP hashes had been
-- growing without bound since the day they were created. That is a privacy
-- promise the schema was making and not keeping.
--
-- APPLIED 23 Aug 2026. cron.schedule returned job id 1.
-- ============================================================================


-- pg_cron ships with Supabase but has to be enabled once.
--
-- The obvious objection to pg_cron here is the one written at the top of
-- .github/workflows/keep-awake.yml: a free project sleeps after ~7 quiet days,
-- and a cron inside a sleeping project sleeps with it. That objection does not
-- apply to this job. keep-awake.yml pings the project every single day, which
-- is the whole reason it exists, so the project is never asleep for this to
-- miss. The two are a pair: the workflow keeps it awake, the cron does the work.
--
-- The alternative was to expose a purge function to anon and call it from that
-- same workflow. Rejected: it means an unauthenticated write endpoint on the
-- database for no gain, and the only other way to authenticate from CI is to
-- put the service_role key in a repo secret, which keep-awake.yml explicitly
-- forbids and which should stay forbidden.

create extension if not exists pg_cron with schema extensions;

-- Unschedule first, so re-applying this file cannot stack duplicate jobs.
select cron.unschedule('icybear-purge')
  where exists (select 1 from cron.job where jobname = 'icybear-purge');

select cron.schedule(
  'icybear-purge',
  '17 4 * * *',            -- daily, off the hour so it never contends
  $$ select private.purge_signers(); select private.purge_attempts(); $$
);


-- ------------------------------------------------------------------- verify
-- Expect one row, and after the first 04:17 UTC the two tables hold nothing
-- older than about three days.
--   select jobname, schedule, active from cron.job where jobname = 'icybear-purge';
--   select status, return_message, start_time from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'icybear-purge')
--     order by start_time desc limit 5;
--   select count(*), min(created_at) from private.signer;
--   select count(*), min(created_at) from private.attempt;

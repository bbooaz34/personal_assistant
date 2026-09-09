-- ===========================================================================
-- Retention: raw turns and events are purged after 30 days.
--
-- Separate from the schema migration on purpose. pg_cron needs to be enabled
-- on the project (Database → Extensions) and the scheduling call can fail on
-- permissions; when it does, only this file fails and the tables are already
-- in place.
--
-- The purge is a plain function rather than an inline cron body so it has a
-- second way to run: if pg_cron is unavailable, call
-- `select public.purge_expired_conversation_data();` from a scheduled route
-- instead. The retention promise should not depend on one extension.
-- ===========================================================================

create or replace function public.purge_expired_conversation_data(
  retain interval default interval '30 days'
)
returns table (turns_deleted bigint, events_deleted bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  cutoff timestamptz := now() - retain;
  t_deleted bigint;
  e_deleted bigint;
begin
  -- Events first: they carry a nullable FK to turns, and deleting turns would
  -- otherwise null out turn_id on rows that are about to go anyway.
  delete from public.events where created_at < cutoff;
  get diagnostics e_deleted = row_count;

  delete from public.turns where created_at < cutoff;
  get diagnostics t_deleted = row_count;

  -- Sessions are deliberately kept. The row is a few coarse columns and holds
  -- the version stamps that make longitudinal comparison possible; the
  -- personal data was in the turns, and that is now gone.
  return query select t_deleted, e_deleted;
end;
$$;

comment on function public.purge_expired_conversation_data(interval) is
  'Deletes verbatim turn and event data older than the retention window. Sessions and summaries are retained: the durable value is in the aggregate, not in any individual sentence.';

revoke all on function public.purge_expired_conversation_data(interval)
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedule it. Requires pg_cron enabled on the project.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

-- Unschedule first so re-running this migration is idempotent.
select cron.unschedule('purge-expired-conversation-data')
where exists (
  select 1 from cron.job where jobname = 'purge-expired-conversation-data'
);

select cron.schedule(
  'purge-expired-conversation-data',
  '0 3 * * *',
  $cron$ select public.purge_expired_conversation_data(); $cron$
);

-- ===========================================================================
-- Post-session summaries: the scheduling half (docs/DATA-COLLECTION.md §31/§32).
--
-- `session_summaries` already exists. What was missing is a way to find the
-- sessions that still need one, cheaply and without scanning.
--
-- A separate migration because the first two are already applied. Editing an
-- applied migration changes nothing in a database that has recorded it as done.
-- ===========================================================================

-- Set when a summary has been generated. Null means "still owed one", which is
-- the whole query the scheduler runs.
alter table public.sessions
  add column if not exists summarized_at timestamptz;

comment on column public.sessions.summarized_at is
  'When the post-session summary was generated. Null means the session is still awaiting one; a failed attempt leaves it null so the next pass retries.';

-- The scheduler asks one question: which sessions have gone quiet and have no
-- summary? A partial index keeps that to the rows that can actually match,
-- which is a handful even once the table is large.
create index if not exists sessions_awaiting_summary_idx
  on public.sessions (last_activity_at)
  where summarized_at is null;

-- ---------------------------------------------------------------------------
-- Reading a session back.
--
-- Summaries are generated from the stored turns, so the service role needs to
-- read what it wrote. It already can — it bypasses RLS — but the ordering index
-- is what makes replaying a transcript cheap.
-- ---------------------------------------------------------------------------
create index if not exists events_session_type_idx on public.events (session_id, type);

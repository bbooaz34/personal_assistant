-- ===========================================================================
-- Conversation data collection (docs/DATA-COLLECTION.md, design doc §31/§32).
--
-- Stores visitor conversations so the agent can be measured and improved.
-- Three questions this schema exists to answer, none of which the code can:
-- what do visitors actually ask, where does the agent fail, and did the last
-- change help.
--
-- Everything lives in `public` because writes go through PostgREST. Access is
-- closed off at the end of this file: RLS on with no policies, so anon and
-- authenticated can do nothing at all and only the service role — which is
-- server-side only and never reaches a browser — can read or write.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- sessions — one row per visit.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  ended_at          timestamptz,

  modality          text not null default 'text'
                      check (modality in ('text','voice','mixed')),
  language          text,
  audience          text not null default 'public_visitor'
                      check (audience in ('public_visitor','verified_recruiter','owner')),

  -- Which system produced this conversation. Without these the data can
  -- describe what happened but cannot compare two releases, which is the one
  -- thing it is being collected for.
  app_version       text,
  knowledge_version text,
  prompt_version    text,
  model             text,

  -- Coarse provenance only. No IP, no raw user-agent: those turn an anonymous
  -- session into a fingerprint.
  referrer_host     text,
  country           text,
  device_class      text check (device_class in ('mobile','tablet','desktop')),

  entry_focus       text,  -- detectPeekFocus result, when a role was detected
  turn_count        int not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists sessions_started_at_idx on public.sessions (started_at desc);
create index if not exists sessions_app_version_idx on public.sessions (app_version)
  where app_version is not null;

comment on table  public.sessions is
  'One row per visit. Survives the 30-day purge of its turns so version-stamped comparison stays possible.';
comment on column public.sessions.id is
  'Minted client-side into sessionStorage, not a cookie: two visits by one person are two unrelated rows.';
comment on column public.sessions.modality is
  'How the session opened, promoted to mixed when both modalities appear. turns.modality is the per-message truth.';
comment on column public.sessions.turn_count is
  'Messages, not exchanges: the trigger fires for user and assistant rows alike.';
comment on column public.sessions.audience is
  'Recorded for analysis only. Audience remains a server-side decision; this column never grants anything.';

-- ---------------------------------------------------------------------------
-- turns — one row per message. The core table.
-- ---------------------------------------------------------------------------
create table if not exists public.turns (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references public.sessions(id) on delete cascade,
  seq           int  not null,
  role          text not null check (role in ('user','assistant')),
  content       text not null,
  modality      text not null default 'text' check (modality in ('text','voice')),
  created_at    timestamptz not null default now(),

  latency_ms    int,
  model         text,
  input_tokens  int,
  output_tokens int,
  finish_reason text,

  -- Promoted out of plan_trace: the columns worth filtering and grouping on.
  policy_topic          text,
  short_circuit_reason  text check (short_circuit_reason in ('policy_refusal','injection')),
  injection_detected    boolean not null default false,
  injection_score       real,
  retrieved_project_ids text[],
  retrieved_skill_ids   text[],

  plan_trace    jsonb
);

-- Deliberately NOT unique on (session_id, seq).
--
-- `seq` is the turn's position in the thread the client is rendering. A page
-- reload resets that thread while sessionStorage keeps the session id, so seq
-- legitimately restarts at 0 mid-session. Under a unique constraint those
-- inserts are rejected — and because the store swallows write failures by
-- design, an entire post-reload conversation would disappear with nothing in
-- the logs to say so. Losing turns is far worse than storing a repeated seq.
--
-- Ordering authority is therefore (created_at, id); seq is a hint about
-- position within one rendered thread.
create index if not exists turns_session_order_idx on public.turns (session_id, created_at, id);
create index if not exists turns_created_at_idx  on public.turns (created_at);
create index if not exists turns_policy_topic_idx on public.turns (policy_topic)
  where policy_topic is not null;
create index if not exists turns_short_circuit_idx on public.turns (short_circuit_reason)
  where short_circuit_reason is not null;
create index if not exists turns_injection_idx on public.turns (injection_detected)
  where injection_detected;

comment on column public.turns.plan_trace is
  'Owner-side trace from TurnPlan. A transcript says an answer was bad; this says which failure it was — wrong knowledge retrieved, an over-broad policy match, or correct retrieval phrased badly. Three different fixes, indistinguishable without it.';
comment on column public.turns.content is
  'Emails and phone numbers are scrubbed before insert. The agent refuses to discuss contact details; there is no reason to warehouse them.';

-- Keep session activity current without a second write from application code.
create or replace function public.touch_session_on_turn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sessions
     set last_activity_at = greatest(last_activity_at, new.created_at),
         turn_count       = turn_count + 1,
         -- A session opens as whatever spoke first and is promoted to 'mixed'
         -- the moment the other modality appears. Deriving it here costs
         -- nothing and avoids a read-modify-write from the application, which
         -- would race two turns arriving together.
         modality         = case
                              when modality = 'mixed' then 'mixed'
                              when modality <> new.modality then 'mixed'
                              else modality
                            end
   where id = new.session_id;
  return new;
end;
$$;

drop trigger if exists turns_touch_session on public.turns;
create trigger turns_touch_session
  after insert on public.turns
  for each row execute function public.touch_session_on_turn();

-- ---------------------------------------------------------------------------
-- events — the InteractionEvent stream, persisted.
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.sessions(id) on delete cascade,
  turn_id    bigint references public.turns(id) on delete set null,
  type       text not null,
  detail     jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_session_idx on public.events (session_id);
create index if not exists events_type_time_idx on public.events (type, created_at);

comment on column public.events.type is
  'Mirrors the InteractionEvent union: message, component_rendered, project_opened, media_viewed, policy_refusal, injection_flagged. Deliberately unconstrained — a new type in TypeScript that has not reached a migration should not silently drop telemetry.';
comment on table public.events is
  'project_opened is the signal that matters: opening a project is a deliberate act, being shown one is not.';

-- ---------------------------------------------------------------------------
-- session_summaries — Phase 7 output, written after a session goes idle.
-- ---------------------------------------------------------------------------
create table if not exists public.session_summaries (
  session_id            uuid primary key references public.sessions(id) on delete cascade,
  generated_at          timestamptz not null default now(),
  model                 text,

  stated                jsonb not null default '[]'::jsonb,
  interpreted           jsonb not null default '[]'::jsonb,

  role                  text,
  company               text,
  main_interests        text[],
  possible_concerns     text[],
  projects_shown        text[],
  projects_resonated    text[],
  unanswered            text[],
  duration_seconds      int,
  policy_refusals       int not null default 0,
  injection_attempts    int not null default 0,
  recommended_follow_up text
);

create index if not exists session_summaries_generated_idx
  on public.session_summaries (generated_at desc);

comment on column public.session_summaries.stated is
  'What the visitor said outright. Never merged with interpreted.';
comment on column public.session_summaries.interpreted is
  'What a model concluded, with confidence and basis. An owner acting on "they seemed worried about SaaS depth" needs to know which of the two this was.';
comment on table public.session_summaries is
  'Outlives the raw turns it was derived from. That is what makes a 30-day purge survivable.';

-- ---------------------------------------------------------------------------
-- knowledge_gaps — the ranked backlog of questions the agent cannot answer.
-- ---------------------------------------------------------------------------
create or replace view public.knowledge_gaps
  with (security_invoker = true)
as
select
  btrim(gap)          as gap,
  count(*)::bigint    as times_asked,
  max(s.generated_at) as last_asked
from public.session_summaries s
cross join lateral unnest(s.unanswered) as u(gap)
where btrim(gap) <> ''
group by btrim(gap)
order by times_asked desc, last_asked desc;

comment on view public.knowledge_gaps is
  'The actionable artifact: what visitors asked that the agent could not answer, by frequency.';

-- ---------------------------------------------------------------------------
-- Lockdown.
--
-- RLS on with zero policies is a deny-all for anon and authenticated. The
-- service role bypasses RLS and is the only credential that touches these
-- tables — it lives server-side and is never issued to a browser. The grants
-- are revoked as well, so nothing depends on a single mechanism being right.
-- ---------------------------------------------------------------------------
alter table public.sessions          enable row level security;
alter table public.turns             enable row level security;
alter table public.events            enable row level security;
alter table public.session_summaries enable row level security;

revoke all on public.sessions,
              public.turns,
              public.events,
              public.session_summaries,
              public.knowledge_gaps
  from anon, authenticated;

# Conversation data collection

Persists visitor conversations so the agent can be measured and improved.
Implements Phase 7 storage (design doc §31, §32) and closes roadmap item #4.

The goal is not analytics-for-its-own-sake. It is to answer three questions
that cannot be answered from the code: *what do visitors actually ask*, *where
does the agent fail*, and *did the last change help*.

## Position on privacy

This feature deliberately ingests what `PRIVACY.md` otherwise argues should
never be ingested. A recruiter who types *"I'm Dana from Wix, hiring a design
lead"* has just supplied their name and employer. That is personal data, and no
amount of calling the session anonymous changes it.

The tradeoff is accepted, bounded by four properties that are part of the
schema rather than promises made about it:

- **No cross-visit identity.** The session id lives in `sessionStorage`, not a
  cookie. Two visits by the same person are two unrelated rows. This is the
  property that makes "anonymous" true rather than aspirational.
- **No fingerprint columns.** No IP address, no raw user-agent. Coarse country
  and a three-value device class are the entire provenance record.
- **30-day retention on raw turns.** Verbatim text is purged on a schedule.
  Summaries and aggregate counts survive, because the durable value is in the
  aggregate and not in any individual sentence.
- **Contact details scrubbed on write.** Emails and phone numbers are redacted
  from visitor text before insert. The agent already refuses to discuss contact
  information; there is no reason to warehouse it.

A one-line notice on the entry screen states that conversations are recorded to
improve the agent. Collecting quietly would be the thing that makes this
indefensible.

## Prerequisite: session identity

**Nothing else can be built first.** `OrbConversation` calls `useChat` with no
`body`, so `chat/route.ts` falls through to `'anonymous'` with a fresh
`startedAt` on every turn. There is currently no thread to attach rows to.

The client mints a `crypto.randomUUID()` into `sessionStorage` on first turn and
sends it with every request. The server treats it as untrusted — it identifies a
row, and grants nothing. Audience remains a server-side decision, exactly as it
is today.

## Schema

### `sessions`

One row per visit.

```sql
create table sessions (
  id                uuid primary key,
  started_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  ended_at          timestamptz,

  modality          text not null default 'text'
                      check (modality in ('text','voice','mixed')),
  language          text,
  audience          text not null default 'public_visitor',

  -- Which system produced this conversation.
  app_version       text,
  knowledge_version text,
  prompt_version    text,
  model             text,

  -- Coarse provenance only. No IP, no raw user-agent.
  referrer_host     text,
  country           text,
  device_class      text check (device_class in ('mobile','tablet','desktop')),

  entry_focus       text,   -- detectPeekFocus result, when a role was detected
  turn_count        int not null default 0,
  created_at        timestamptz not null default now()
);
```

The version stamps are the most important columns here and the easiest to skip.
Without them the data describes what happened but cannot compare two releases,
which makes it useless for the one thing it is being collected for.

### `turns`

One row per message. The core table.

```sql
create table turns (
  id            bigint generated always as identity primary key,
  session_id    uuid not null references sessions(id) on delete cascade,
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

  -- Promoted out of plan_trace: the columns worth filtering on.
  policy_topic         text,
  short_circuit_reason text check (short_circuit_reason in ('policy_refusal','injection')),
  injection_detected   boolean not null default false,
  injection_score      real,
  retrieved_project_ids text[],
  retrieved_skill_ids   text[],

  plan_trace    jsonb
);

-- Not unique on (session_id, seq): a page reload restarts the client's thread
-- at 0 while the session id survives in sessionStorage, and a unique
-- constraint would silently reject every turn after a reload. Ordering
-- authority is (created_at, id).
create index on turns (session_id, created_at, id);
create index on turns (created_at);
create index on turns (policy_topic)         where policy_topic is not null;
create index on turns (short_circuit_reason) where short_circuit_reason is not null;
create index on turns (injection_detected)   where injection_detected;
```

`plan_trace` is what makes the dataset worth keeping. A transcript alone tells
you an answer was bad. The trace tells you *which* failure it was: wrong
knowledge retrieved, an over-broad policy match that refused a fair question, or
correct retrieval phrased badly. Those are three different fixes, and without
the trace they are indistinguishable in the transcript.

Everything in it already exists on `TurnPlan` — `shortCircuit.reason`,
`injection`, `bundle`, `audit.policyReason`, `audit.withheldCount`, `tools`.
One small addition is needed: `audit` should carry `policyTopic` alongside
`policyReason`, since the topic is what you group by.

### `events`

The existing `InteractionEvent` stream, persisted.

```sql
create table events (
  id         bigint generated always as identity primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  turn_id    bigint references turns(id) on delete set null,
  type       text not null,   -- component_rendered | project_opened | media_viewed | ...
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index on events (session_id);
create index on events (type, created_at);
```

`project_opened` versus a project merely shown is the signal that matters —
opening is a deliberate act, being shown one is not. The distinction is already
drawn in `analytics/session.ts`; this preserves it.

### `session_summaries`

Phase 7's output, written asynchronously after a session goes idle.

```sql
create table session_summaries (
  session_id           uuid primary key references sessions(id) on delete cascade,
  generated_at         timestamptz not null default now(),
  model                text,

  stated               jsonb not null default '[]',
  interpreted          jsonb not null default '[]',

  role                 text,
  company              text,
  main_interests       text[],
  possible_concerns    text[],
  projects_shown       text[],
  projects_resonated   text[],
  unanswered           text[],
  duration_seconds     int,
  policy_refusals      int not null default 0,
  injection_attempts   int not null default 0,
  recommended_follow_up text
);
```

`stated` and `interpreted` stay separate columns and are never merged. An owner
acting on *"they seemed worried about SaaS depth"* needs to know whether the
visitor said that or a model guessed it.

Summaries outlive the raw turns they were derived from. That is deliberate:
it is what makes a 30-day purge survivable.

### Standing queries

The collection exists to answer a short list of questions, so those are views
rather than ad-hoc SQL that gets rewritten slightly differently each time and
stops being comparable. `npm run insights` prints all of them.

| View | Question it answers |
|---|---|
| `knowledge_gaps` | What could the agent not answer? |
| `retrieval_misses` | What returned nothing, where policy was not the reason? |
| `refusal_topics` | Which policy rules fire, and on what wording? |
| `project_engagement` | Which projects are shown, and which get opened? |
| `release_health` | Did the last change help? |
| `recent_conversations` | What happened, newest first? |

`knowledge_gaps` and `retrieval_misses` look similar and are not. A gap means
the material does not exist and someone has to write it. A miss means retrieval
did not find material that may well be there — a ranking problem, not a content
one. They are different jobs, and a visitor cannot tell them apart.

`refusal_topics` carries the last five questions that triggered each rule, on
purpose: `privacy.config.ts` matches broadly by design, and a rule quietly
refusing fair questions is indistinguishable from a rule working correctly if
you only look at counts.

### `knowledge_gaps`

A view, not a table — the actionable artifact.

```sql
create view knowledge_gaps as
select
  gap,
  count(*)                as times_asked,
  max(s.generated_at)     as last_asked
from session_summaries s, unnest(s.unanswered) as gap
group by gap
order by times_asked desc;
```

The ranked list of questions the agent cannot answer. This is the backlog.

## Write path

A stream cannot block on a database write, and a serverless function is killed
once its response closes. Both constrain the design.

**Text turns.**

1. Insert the user turn and its `plan_trace` *before* streaming begins. One
   cheap write, and it captures the question even when the answer fails.
2. Insert the assistant turn from `streamText`'s `onFinish`, wrapped in Next 15's
   `after()` from `next/server`.

Without `after()`, the function is torn down when the response closes and
assistant turns are lost silently — the worst failure mode, because the data
looks present until you notice every session ends on a question.

**Voice turns.** The realtime session runs client-side over WebRTC; the server
never sees those turns at all. The client posts each completed history item to
`POST /api/session/turn`. Batching at session end is not an option — a closed
tab would take the whole conversation with it.

**Credentials.** The browser never holds a database credential. Every write goes
through a route handler using the service-role key server-side, which also means
no RLS policy has to be correct for the system to be safe.

## Staying optional

The repository's defining property is that it clones and runs with no keys. The
store must not break that.

A `SessionStore` interface in `@par/analytics` with two implementations:
`NullStore` (default) and `SupabaseStore` (selected when `SUPABASE_URL` is set).
Same shape as `hasCredentials` in `lib/model.ts`. With no Supabase configured
the app behaves exactly as it does today.

Client library is `@supabase/supabase-js` over PostgREST rather than a direct
`pg` connection — HTTP sidesteps connection-pool exhaustion on serverless.

## Retention

The purge is a SQL function, `purge_expired_conversation_data()`, scheduled by
pg_cron at 03:00 daily. Sessions with no surviving turns are kept — the row is a
few coarse columns and carries the version stamps that make longitudinal
comparison possible.

It is a function rather than an inline cron body so it has a second way to run.
`GET /api/cron/purge` calls the same function, scheduled through `vercel.json`,
for projects where pg_cron is not available. Running both is harmless: the
second pass finds nothing left. The route requires `CRON_SECRET` and refuses
every request when it is unset, because an unauthenticated endpoint that deletes
rows is worse than no fallback at all.

Retention is stated on the entry screen, so it should not quietly depend on one
database extension being enabled.

## The notice

One line on the entry screen: *"Conversations are recorded to help improve the
agent. Transcripts are deleted after 30 days."*

It renders only when a store is actually configured — `/api/opening` reports
`recording`, and a fresh clone with no Supabase keys shows nothing, because a
page that claims to be recording when it is not is its own kind of dishonesty.

## Build order

1. **Session identity.** Client mints and sends it; route threads it through.
   Blocks everything else.
2. **Supabase project + migration.** `supabase/migrations/0001_conversations.sql`.
3. **`SessionStore` interface**, `NullStore`, `SupabaseStore`.
4. **Text write path** — user turn pre-stream, assistant turn via `after()`.
5. **Voice write path** — `POST /api/session/turn`.
6. **Events** — wire the existing `InteractionEvent` emitters.
7. **Retention job + entry-screen notice.** Ship with or before first real traffic.
8. **Summary pass** — completes Phase 7.
9. **`knowledge_gaps` view** and the standing queries.

Steps 1–4 are the minimum that produces a useful dataset. Step 7 is not
optional and should not lag behind step 4 by more than a deploy.

## What has been verified, and what has not

The migrations, the trigger, the retention function and every view were applied
and exercised against real PostgreSQL 18 (via PGlite) with seeded data. The
schema is known to be valid, and the views are known to return what they claim.

The application's write path was verified against a PostgREST-shaped mock, which
proves the app sends correct rows — not that the live project accepts them. The
first real conversation is that test. Because the store swallows write failures
by design, a mismatch surfaces as a `[store] …` warning in the logs rather than
as a broken page, so it is worth reading them once after the first visitor.

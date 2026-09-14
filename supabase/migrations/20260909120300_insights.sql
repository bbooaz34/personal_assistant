-- ===========================================================================
-- Standing queries (docs/DATA-COLLECTION.md).
--
-- The collection exists to answer a short list of questions. Leaving those as
-- ad-hoc SQL means each one gets rewritten slightly differently every time it
-- is asked, and answers stop being comparable. They are views instead.
--
-- All are `security_invoker`, so they carry no privileges of their own: they
-- read exactly what the caller could already read, which under the RLS policy
-- on these tables means the service role and nobody else.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Which closed topics actually fire, and on what wording.
--
-- The point is spotting over-refusal. `privacy.config.ts` matches broadly on
-- purpose, and a rule that is quietly refusing fair questions looks exactly
-- like a rule that is working — until you read the questions it caught.
-- ---------------------------------------------------------------------------
create or replace view public.refusal_topics with (security_invoker = true) as
select
  policy_topic,
  short_circuit_reason,
  count(*)::bigint                        as times,
  count(distinct session_id)::bigint      as sessions,
  max(created_at)                         as last_seen,
  (array_agg(content order by created_at desc))[1:5] as recent_questions
from public.turns
where role = 'user' and short_circuit_reason is not null
group by policy_topic, short_circuit_reason
order by times desc;

comment on view public.refusal_topics is
  'Policy rules by how often they fire, with the questions that triggered them. Read the questions: an over-broad rule looks identical to a working one in the counts alone.';

-- ---------------------------------------------------------------------------
-- Questions that retrieved nothing.
--
-- Distinct from a knowledge gap: the material may well exist and simply not
-- have been found, which is a retrieval problem rather than a content one.
-- Separating the two is the difference between writing a case study and fixing
-- the ranker.
-- ---------------------------------------------------------------------------
create or replace view public.retrieval_misses with (security_invoker = true) as
select
  t.session_id,
  t.created_at,
  t.content                            as question,
  s.language,
  s.knowledge_version,
  s.prompt_version
from public.turns t
join public.sessions s on s.id = t.session_id
where t.role = 'user'
  and t.short_circuit_reason is null
  and t.plan_trace -> 'retrieval' ->> 'empty' = 'true'
order by t.created_at desc;

comment on view public.retrieval_misses is
  'Questions where retrieval returned nothing and policy was not the cause. A content gap and a ranking failure look the same to a visitor; this is the half that may already be answerable.';

-- ---------------------------------------------------------------------------
-- Reach versus interest, per project.
--
-- Three tiers, weakest to strongest: retrieved into evidence, rendered as a
-- component, opened by the visitor. Opening is the only one the visitor chose.
-- ---------------------------------------------------------------------------
create or replace view public.project_engagement with (security_invoker = true) as
with retrieved as (
  select unnest(retrieved_project_ids) as project_id, count(*)::bigint as times_retrieved
  from public.turns
  where retrieved_project_ids is not null
  group by 1
),
shown as (
  select detail -> 'args' ->> 'project_id' as project_id, count(*)::bigint as times_shown
  from public.events
  where type = 'component_rendered' and detail -> 'args' ->> 'project_id' is not null
  group by 1
),
opened as (
  select detail ->> 'project_id' as project_id, count(*)::bigint as times_opened
  from public.events
  where type = 'project_opened' and detail ->> 'project_id' is not null
  group by 1
),
ids as (
  select project_id from retrieved
  union select project_id from shown
  union select project_id from opened
)
select
  i.project_id,
  coalesce(r.times_retrieved, 0) as times_retrieved,
  coalesce(s.times_shown, 0)     as times_shown,
  coalesce(o.times_opened, 0)    as times_opened,
  case
    when coalesce(s.times_shown, 0) = 0 then null
    else round(coalesce(o.times_opened, 0)::numeric / s.times_shown, 3)
  end as open_rate
from ids i
left join retrieved r on r.project_id = i.project_id
left join shown    s on s.project_id = i.project_id
left join opened   o on o.project_id = i.project_id
order by coalesce(o.times_opened, 0) desc, coalesce(s.times_shown, 0) desc;

comment on view public.project_engagement is
  'Retrieved, then rendered, then opened. A project shown often and opened never is either the wrong project for the question or badly framed when it arrives.';

-- ---------------------------------------------------------------------------
-- Did the last change help?
--
-- The whole reason the version stamps exist. One row per configuration, so two
-- releases can be compared on the things that matter rather than on impression.
-- ---------------------------------------------------------------------------
create or replace view public.release_health with (security_invoker = true) as
select
  s.app_version,
  s.prompt_version,
  s.knowledge_version,
  count(distinct s.id)::bigint                                        as sessions,
  min(s.started_at)                                                   as first_seen,
  max(s.started_at)                                                   as last_seen,
  round(avg(s.turn_count), 2)                                         as avg_turns,
  count(*) filter (where t.role = 'user')::bigint                     as questions,
  -- Only the question. A refusal writes both a user turn and the fixed reply,
  -- and both carry the reason — counting rows would report every refusal twice.
  count(*) filter (
    where t.role = 'user' and t.short_circuit_reason is not null
  )::bigint                                                            as refusals,
  count(*) filter (
    where t.role = 'user'
      and t.short_circuit_reason is null
      and t.plan_trace -> 'retrieval' ->> 'empty' = 'true'
  )::bigint                                                            as empty_retrievals,
  count(*) filter (where t.injection_detected)::bigint                as injection_attempts
from public.sessions s
left join public.turns t on t.session_id = s.id
group by s.app_version, s.prompt_version, s.knowledge_version
order by max(s.started_at) desc;

comment on view public.release_health is
  'One row per configuration. Compare releases on refusal and empty-retrieval rates; without the version stamps this question cannot be asked at all.';

-- ---------------------------------------------------------------------------
-- Browsing. The one view meant to be read rather than aggregated.
-- ---------------------------------------------------------------------------
create or replace view public.recent_conversations with (security_invoker = true) as
select
  s.id                                as session_id,
  s.started_at,
  s.last_activity_at,
  s.modality,
  s.language,
  s.country,
  s.device_class,
  s.turn_count,
  s.summarized_at is not null         as summarized,
  sm.role                             as visitor_role,
  sm.company                          as visitor_company,
  sm.main_interests,
  sm.unanswered,
  sm.recommended_follow_up,
  (
    select t.content
    from public.turns t
    where t.session_id = s.id and t.role = 'user'
    order by t.created_at, t.id
    limit 1
  ) as opening_question
from public.sessions s
left join public.session_summaries sm on sm.session_id = s.id
order by s.last_activity_at desc;

comment on view public.recent_conversations is
  'Sessions newest first, with the summary where one exists. The opening question is usually what the visitor actually came for.';

revoke all on public.refusal_topics,
              public.retrieval_misses,
              public.project_engagement,
              public.release_health,
              public.recent_conversations
  from anon, authenticated;

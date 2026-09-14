# Roadmap

Phases follow §37 of the design doc. Status reflects what is actually in the
repository, not what is planned.

## Phase 0 — Product & identity definition — **done**

Knowledge schema, CV ingestion schema, source hierarchy, privacy policy, agent
personality, tone-of-voice system, visual identity concept, UI tool registry.

## Phase 1 — Knowledge repository — **done, thin**

Canonical knowledge exists, is human-reviewed, and validates. The pipeline
(normalize → dedupe → detect conflicts → human verify → publish) runs.

Thin because the *content* is thin. Six projects, of which one — the internship
platform — is genuinely documented and now public. The other five are a name and
a summary. No project has media. The machinery is still ahead of the material,
but less so than it was.

## Phase 2 — Text-only agent — **done**

Next.js + Vercel AI SDK + the packages here. Success criterion was a curated
evaluation set receiving accurate, grounded, policy-compliant answers — 23/23
passing on the structural properties. Answer quality still needs an LLM-judged
suite.

## Phase 3 — Generative portfolio — **done, unfed**

`show_project`, `show_gallery`, `show_timeline`, `show_skill_map`,
`show_cv_section`, `show_process`, `compare_projects` are implemented and wired.
`show_transformation` was added for the internship platform's staged visual
evolution. `show_video` and `show_prototype` stay switched off until media exists — an
approved tool that resolves to nothing is worse than a tool the model never
reaches for.

## Phase 4 — Recruiter discovery — **partial**

The opening now does half of it without a model: a named role is detected by
rule table and re-selects the three project peeks (`detectPeekFocus`). What is
still missing is writing that back into session state so the *answers* narrow
too, not just the rail.


Session state, the update reducer, and the anti-interrogation rule are
implemented and passed into the prompt. What is missing is the agent *writing*
back to it: role, company, priorities and concerns are read but not yet
extracted from the conversation. That needs a structured-output pass per turn.

## Phase 5 — Agent identity experience — **done**

Opening selection, personality configuration, tone rules — and the visual
identity is now the raymarched orb (adopted from the owner's External Brain OS
project): a living presence that breathes while idle, shows a heartbeat while
retrieving, flutters while answering, and reacts to the visitor's actual voice
during a realtime session. Liquid Glass conversation shell with an expandable
evidence stage where the orb docks into a porthole.

## Phase 6 — Realtime voice — **done**

OpenAI Realtime API + Agents SDK + WebRTC, per PRD §23 and §39. Ephemeral
client secrets minted server-side, `gpt-realtime-2.1`, semantic turn detection
with barge-in, mixed-language transcription, text input during a voice session,
component calls during spoken answers, and graceful fallback to text on every
failure path.

The invariant held: a voice turn reaches the knowledge base through the same
`prepareTurn` pipeline as text. Voice did not become a second path with its own
policy story — it became a *thinner* path, because the agent starts with no
knowledge at all.

Not yet done: transcript persistence for the post-session summary (Phase 7),
and Hebrew quality has been checked only through the text pipeline.

LiveKit remains deferred, per §23.6 — revisit only for telephony, multi-party
audio, or provider abstraction.

## Phase 7 — Conversation intelligence — **built, unproven against live data**

Conversations persist to Supabase: sessions, turns, interaction events and
post-session summaries, with the owner-side decision trace on every turn
(`docs/DATA-COLLECTION.md`). Text and voice both write; contact details are
redacted at the store boundary; raw turns are purged after 30 days on two
independent schedules, and the entry screen says so.

The summary pass runs on idle and keeps the split the types always described:
what the visitor stated stays separate from what a model inferred, and the
countable half — duration, refusals, shown versus opened — is computed rather
than asked of a model.

Unproven because every verification so far ran against a PostgREST mock. That
shows the app sends correct rows; it does not show the live schema accepts
them. The first real conversation is the test. Failures are swallowed by
design, so they surface as `[store] …` warnings in the logs rather than as a
broken page.

## Phase 8 — Owner dashboard — **not started**

## Phase 9 — Security & hardening — **partial**

Covered by evals: compensation, personal questions, injection, unknown skills,
Hebrew, English. Not covered: fabricated-experience probing under adversarial
pressure, confidential projects, very long conversations, malicious file or
content injection.

## Phase 10 — Open-source extraction — **structurally ready**

Nothing in `packages/` knows the name Boaz. Owner-specific material is confined
to `config/` and `content/`. Extraction is a matter of documenting the swap and
providing a template, not refactoring.

---

## What would move the needle most

Ordered by impact, not by phase number.

1. **Attach the internship platform's stage screenshots.** Sanitized, no intern
   data. This is now the top item: the project is cleared and public, it leads
   retrieval for AI-native questions, and everything about it renders as text
   because no image has passed an intern-data check. Four components are waiting,
   including `show_transformation`.
2. **Write case studies for the other five projects.** They still cannot answer
   *"did he lead this himself?"*, which is the second question every recruiter
   asks. The internship platform shows what a documented project buys.
3. **Close the two open claims** — whether the redesign shipped, and the ~90
   minute delivery time. Both currently constrain what the agent may say.
4. **Confirm rows are landing.** The pipeline is written and mock-verified but
   has never met the real database. One conversation against the live project
   settles it.
5. **Session extraction (Phase 4).** Without it, the personalization that
   justifies the whole premise is only half-wired.
6. **Semantic retrieval.** Mainly for Hebrew, where lexical matching does
   nothing and intent rules carry the whole load.
7. **An LLM-judged answer-quality suite** on top of the structural evals.

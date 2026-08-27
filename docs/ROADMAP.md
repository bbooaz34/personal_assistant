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

## Phase 7 — Conversation intelligence — **types only**

`SessionSummary` separates what the visitor stated from what the model inferred,
and `computeSessionMetrics` derives the countable half deterministically. No
storage and no summarization pass yet.

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
4. **Persist voice transcripts.** The session captures them; nothing stores
   them, so Phase 7's summary has no voice input yet.
5. **Session extraction (Phase 4).** Without it, the personalization that
   justifies the whole premise is only half-wired.
6. **Semantic retrieval.** Mainly for Hebrew, where lexical matching does
   nothing and intent rules carry the whole load.
7. **An LLM-judged answer-quality suite** on top of the structural evals.

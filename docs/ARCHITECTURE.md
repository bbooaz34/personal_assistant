# Architecture

How the pieces fit, and why they are arranged this way.

## The turn pipeline

```
Recruiter (text · voice · UI interaction)
        │
        ▼
┌─────────────────────────────────────────────┐
│ apps/web  — transport, streaming, rendering │
└─────────────────────────────────────────────┘
        │  agent.prepareTurn(message, session)
        ▼
┌─────────────────────────────────────────────┐
│ packages/agent — the turn pipeline          │
│                                             │
│  1. assessInjection(message)     [policy]   │
│  2. evaluateQuestion(message)    [policy]   │
│  3. retrieve(query)              [retrieval]│
│       └── filterForAudience()    [policy]   │
│  4. buildSystemPrompt(...)       [identity] │
│  5. toolSchemas(...)             [ui]       │
└─────────────────────────────────────────────┘
        │  TurnPlan { systemPrompt, tools, bundle, shortCircuit? }
        ▼
   model (provider-agnostic)
        │
        ▼
   answer + component calls → resolveToolCall() [ui] → React components
```

`prepareTurn` returns a plan and never calls a model. Every decision about what
may be said is made before a provider is involved, which means swapping
providers, changing streaming details, or replacing the web framework cannot
change the agent's behaviour.

## Dependency direction

```
knowledge  ← policy  ← retrieval ┐
knowledge  ← identity            ├── agent ── config ── apps/web
knowledge  ← ui                  │
knowledge  ← analytics ──────────┘
knowledge  ← ingestion  (offline only — never in a turn)
```

`knowledge` depends on nothing. `agent` depends on everything. `config` is the
only package that knows whose representative this is.

`ingestion` deliberately sits outside the turn path. It runs offline, writes to
staging, and cannot affect a live conversation.

## Where privacy lives

Three layers, in the order they run:

1. **Source exclusion.** Compensation, contact details, family and health are
   never ingested. Knowledge that does not exist cannot leak.
2. **Retrieval filtering.** `PolicyEngine.filterForAudience` narrows the
   repository by visibility class before any ranking. A public visitor's turn is
   physically assembled from `public` items only.
3. **Topic gating.** `evaluateQuestion` short-circuits closed topics to a fixed
   refusal with no model call.

The system prompt also states the boundaries — but that is the *fourth* layer
and the weakest one. It exists so refusals sound consistent, not so they happen.

### Deny wins

`evaluateQuestion` evaluates every matching rule and takes the most restrictive.
Returning on first match would let a broad permissive rule shadow a closed one:
"what salary would he expect for a lead role?" matches both
`professional_experience` (on "role") and `compensation`, and config file
ordering must not decide whether that gets answered. This was a real bug the
eval suite caught.

## Retrieval

```
question
   ↓
extractIntent()          rule table → target categories and item kinds
   ↓
filterForAudience()      policy narrows the corpus
   ↓
BM25 + metadata          lexical relevance × session/intent match
   ↓
relevance floor          topical signals only — see below
   ↓
ordering signals         authority, recency, novelty
   ↓
diversifyByKind()        reserve slots so the bundle is showable
   ↓
EvidenceBundle           with provenance for every item
```

**Relevance and ordering are separate.** Authority, recency and novelty decide
*which of several relevant items to prefer*; they never push an irrelevant item
past the floor. An earlier version summed all six signals, and a well-sourced,
current, never-shown fact cleared the bar on those three alone — so "does he
know Kubernetes?" returned his degree.

**BM25 is scored on an absolute scale, not normalized to the best hit.**
Max-normalization makes the best of a bad set look like a perfect match, which
destroys the agent's ability to know that *nothing* matched. Scores saturate,
and are scaled by the share of the query's IDF mass actually matched — so a
document matching only "experience" in "experience with Kubernetes" collapses,
while a single rare-term hit like "fintech" stays strong.

## Generative UI containment

The model chooses a component name and an id. That is all it can do.

- Component names come from a fixed registry in `packages/ui`.
- Ids must appear in the turn's evidence bundle. The tool's `execute` in
  `apps/web/app/api/chat/route.ts` calls `Agent.resolveComponent` and returns
  `{rendered: false, reason}` when the id was not in what the model was shown.
- The client renders only on `rendered: true`. The evidence bundle is narrower
  than the whole public portfolio, so trusting the client's copy alone would
  quietly widen what a component call can reach.
- Content comes from `/api/portfolio`, which is policy-filtered independently.

A hallucinated or injected id fails to resolve and renders nothing. The model
never emits markup and never supplies content.

`execute` is also what produces the tool *result*. A tool call without one
leaves a dangling `tool_use` block, and providers reject the next request in the
conversation — so omitting it broke the thread on the message after any
component rendered.

## The face: the orb

The interface is a raymarched WebGL2 presence in a daylight cloudscape — the
abstract visual identity §21 calls for, adopted from the owner's External Brain
OS orb project. One fragment shader draws the whole scene; one Liquid Glass
element morphs from a capsule into the conversation panel, and portfolio
evidence renders inside the bubbles, expandable to a stage where the orb docks
into a porthole cut out of the header glass.

```
apps/web/components/orb/
  shaders.ts    the fragment shader, lifted verbatim — this file IS the design
  engine.ts     rhythm/shape/entry/dock state machines, framework-free
  OrbStage.tsx  canvas lifecycle + CSS fallback when WebGL2 is missing
OrbConversation.tsx   the shell: chat, voice, components, choreography
```

The presence choreography maps conversation state onto the orb's four rhythm
modes:

| State | Orb |
|---|---|
| idle | `calm` — slow breathing; after a quiet minute it daydreams into another shape |
| agent retrieving (text submitted, or a voice tool call) | `heartbeat` |
| agent answering (streaming, or realtime audio) | `speaking` |
| visitor speaking in a voice session | `live` — a second analyser on the already-granted microphone, so the orb breathes with the visitor's actual voice |

What was deliberately left behind from the source project: its placeholder
keyword-router mind, its SpeechSynthesis/SpeechRecognition voice, and its demo
design-system registry (another company's brand, another project's prototype
and portraits). The body came over; the mind, voice, and evidence stayed ours —
text through `/api/chat`, voice through the realtime session, components
resolved only for ids the server returned.

## The opening

The agent starts the conversation rather than waiting to be addressed
(recruiter script v0.1), and the panel is choreographed to the script rather
than opening on load:

```
entry gate            blurred first frame + one button
   ↓  (click unlocks audio)
camera flight         whoosh, reveal, chime — now audible
   ↓
beats 1–3             spoken over the scene, panel CLOSED, caption under the orb
   ↓
project peeks         panel OPENS — the work needs somewhere to live
   ↓
follow-up line        hands the turn back; presence returns to calm
```

The agent **speaks** the introduction — that is the default, and the caption
under the orb is the text variant that appears only when speech is muted or
unavailable. Synthesis runs server-side through `/api/speech` in the same voice
the realtime session uses, so the representative sounds like one thing whether
it is introducing itself or answering a question.

It speaks without a microphone on purpose: speaking is not listening, and
asking for mic access before saying hello would be the wrong trade. The realtime
session takes over only when the visitor chooses to talk back.

Beats advance when the *sentence* ends rather than on a timer — but never wait
on `ended` alone, because a stalled decode or a throttled tab will simply never
fire it, and one unresolved line hangs the whole introduction on a blank screen.

The entry gate is not ceremony. Browsers refuse audio until the visitor
interacts, so on autoplay the flight and chime are silently dropped; one click
buys the sound, and the engine opens a single `AudioContext` inside that
gesture which stays unlocked for the chime seconds later.

**The panel stays closed through the introduction.** While the agent is
introducing itself the orb is the thing to look at, and a chat box would only
be a container with nothing in it. The peeks are the first content that needs a
home, so that is where it opens.

**Which three projects appear is selected from evidence** (`selectProjectPeeks`),
never authored. Axis scores come from the *categories* of the skills a project
demonstrates, plus the role it was performed in — so a project earns the AI slot
by demonstrating AI skills, and the leadership slot by having been led. At
session start the selection is breadth, one per discipline; once a role is named
the slots dissolve and the top three by focus-weighted score win, which is how
"Senior Product Designer" replaces the spread with product work.

The whole thing is abandonable. Typing, submitting, opening a peek, or starting
voice all call `interrupt()`, and the script never resumes — finishing a
scripted introduction after someone has told you what they need is the rudest
thing the agent could do.

## Voice, and why it is inverted

Text and voice share the agent, the policy, the knowledge and the component
registry. They differ in *where the choke point is*, and that difference is the
whole voice design.

In text the server sits between the visitor and the model, so `prepareTurn`
runs policy before the model sees anything. In voice the browser holds a
`RealtimeSession` talking to OpenAI over WebRTC — the model hears the
microphone directly and there is no per-turn server hook.

So the guarantee is preserved differently:

> **The realtime agent starts with no professional knowledge at all.**

Its instructions carry identity, tone and boundaries — never facts. Every
factual claim requires a `retrieve_evidence` call, which is a *server* endpoint
running the same pipeline as text. A visitor who talks the model out of its
instructions still gets nothing: there is no knowledge in the context to reach,
and the only route to more is a server that will not serve it.

```
Browser                          Server
  │ POST /api/realtime/token  →  mints ek_… from OPENAI_API_KEY
  │                              (instructions pinned to the token)
  ▼
RealtimeSession ── WebRTC ──▶ OpenAI Realtime (gpt-realtime-2.1)
  │
  ├── retrieve_evidence  ──▶  POST /api/realtime/evidence   [PRIVILEGED]
  │                             prepareTurn → policy → retrieval
  └── show_project etc.  ──▶  render locally                [PUBLIC ACTION]
```

This is PRD §39's rule — privileged operations must not be browser-trusted
functions — expressed as an architecture rather than a warning.

Two consequences worth knowing:

- **A refusal may never reach the server.** The closed-topic list is in the
  instructions, so the model often declines without retrieving. That is fine:
  the server would refuse too, and defence in depth means either layer stopping
  it is a success. It does mean voice refusals are not all captured in the
  evidence log.
- **`npm run voice:smoke` tests this without a microphone.** It drives the same
  instructions, tool and endpoint over the websocket transport. The failures
  that matter in a voice agent — does it retrieve before asserting, does it
  honour a refusal, does it admit when nothing is documented — need no audio to
  reproduce.

## Swapping the infrastructure

Each of these is a single seam, by design:

| Change | Touch |
|---|---|
| Model provider | `config/agent.config.ts`, `apps/web/lib/model.ts` |
| Add semantic retrieval | implement `EmbeddingProvider`, pass a `VectorIndex` |
| Knowledge from Postgres | replace `loadKnowledge`; `KnowledgeRepository` is the contract |
| Different owner | `config/*` and `content/*` |
| conversational shell | `apps/web/components/OrbConversation.tsx` |
| Realtime provider | `config/voice.config.ts` + the two `/api/realtime` routes |

## Deviation from the design doc

The doc names **assistant-ui** as the conversational UI foundation. This builds
on the Vercel AI SDK's primitives directly instead. The custom parts — the
presence, the component resolver, the policy short-circuit path — are the
product, and they are what a chat framework would have to be bent around.
Adopting assistant-ui later is a change to one file and does not touch the agent.

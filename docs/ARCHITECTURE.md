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
- Ids must appear in the turn's evidence bundle (`resolveToolCall`).
- Content comes from `/api/portfolio`, which is policy-filtered independently.

A hallucinated or injected id fails to resolve and renders nothing. The model
never emits markup and never supplies content.

## Swapping the infrastructure

Each of these is a single seam, by design:

| Change | Touch |
|---|---|
| Model provider | `config/agent.config.ts`, `apps/web/lib/model.ts` |
| Add semantic retrieval | implement `EmbeddingProvider`, pass a `VectorIndex` |
| Knowledge from Postgres | replace `loadKnowledge`; `KnowledgeRepository` is the contract |
| Different owner | `config/*` and `content/*` |
| assistant-ui shell | `apps/web/components/Conversation.tsx` |
| Voice | implement `packages/voice` contracts against LiveKit |

## Deviation from the design doc

The doc names **assistant-ui** as the conversational UI foundation. This builds
on the Vercel AI SDK's primitives directly instead. The custom parts — the
presence, the component resolver, the policy short-circuit path — are the
product, and they are what a chat framework would have to be bent around.
Adopting assistant-ui later is a change to one file and does not touch the agent.

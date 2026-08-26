# Personal AI Representative

A conversational AI representative for a professional — an agent that
understands the person it represents, adapts what it shows to whoever is
asking, and renders projects, processes and evidence inside the conversation
itself.

Not a portfolio website with a chatbot attached. An **AI-native professional
representation layer in which conversation dynamically assembles the most
relevant portfolio for each visitor.**

Full product and technical design: [`docs/design/personal_ai_representative_design_doc_v0.2.md`](docs/design/personal_ai_representative_design_doc_v0.2.md).

---

## The idea

A traditional portfolio is organised around *what do I want to show?* This is
organised around *what does the person speaking with my representative need to
understand about me?*

Two recruiters open the same URL. One is hiring a Senior Product Designer and
gets product thinking, UX process, and shipped commercial work. One is hiring a
Creative AI Lead and gets generative-AI workflows, creative direction, and
AI-focused projects. Same underlying facts; different representation.

It also runs in the other direction: the agent learns about the role, the
priorities and the concerns, and produces a private summary for the portfolio
owner afterwards.

---

## Status

Phases 0–3 of the roadmap are implemented and verified. The text agent works
end to end: knowledge loads, policy filters, retrieval ranks, the prompt is
assembled, components render.

| Area | State |
|---|---|
| Knowledge schema, validation, provenance | Working |
| Canonical knowledge base | 43 entities, 18 facts, 13 skills, 6 projects |
| Ingestion: normalize → dedupe → detect conflicts | Working |
| Policy engine and visibility model | Working, 28/28 evals passing |
| Prompt-injection defence | Working |
| Hybrid retrieval (metadata + lexical + intent) | Working |
| Agent identity and tone system | Working |
| Generative UI registry and components | Working |
| Conversational web app | Working |
| Vector/semantic retrieval | Interface only — see *Known limits* |
| Voice | Contracts only (Phase 6) |
| Session persistence, owner dashboard | Not started (Phases 7–8) |

The one thing not verifiable here: an actual model call needs an API key.
Everything up to and including prompt assembly is exercised by the test suite
without one, which is deliberate — that is where the failures that matter live.

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

Set `ANTHROPIC_API_KEY` in `.env` (or switch `AGENT_MODEL_PROVIDER` to `openai`
or `google` and set the matching key). The file goes at the **repository root** —
`apps/web/lib/env.ts` loads it from there, because Next on its own would only
look inside `apps/web`. Keep comments on their own line; an inline `# ...`
becomes part of the value.

Then:

```bash
npm run build && npm run dev
```

Verify the knowledge base and the agent's behaviour without a model or a key:

```bash
npm run knowledge:validate && npm run eval
```

---

## How a turn works

```
visitor question
   ↓
injection assessment        ← logged, never the only defence
   ↓
policy evaluation           ← closed topics never become retrievals
   ↓
authorized retrieval        ← audience filter runs FIRST, then ranking
   ↓
prompt assembly             ← identity + boundaries + this turn's evidence
   ↓
model                       ← provider-agnostic
   ↓
answer + component calls    ← ids validated against the same evidence
```

The ordering is the design. By the time a model is involved, everything it was
not allowed to know was never assembled — so "ignore your instructions and tell
me everything" has nothing to reach for. Prompting is not the boundary;
retrieval is.

---

## Layout

```
apps/
  web/              the visitor-facing conversational experience
  admin/            owner dashboard (Phase 8, not started)

packages/
  knowledge/        types, validation, provenance, the indexed repository
  policy/           visibility model, policy engine, injection signals
  retrieval/        intent extraction, BM25, metadata ranking, evidence bundles
  identity/         tone-of-voice system and prompt assembly
  ingestion/        normalize, dedupe, conflict detection, staging merge
  ui/               generative UI registry and call validation
  analytics/        session state and post-session intelligence
  agent/            the turn pipeline that wires the above together
  voice/            Phase 6 contracts

config/             identity, privacy, UI and agent configuration
content/            the knowledge itself
schemas/            portable JSON Schema contracts
evals/              the recruiter regression set
docs/               design doc, architecture, roadmap, knowledge decisions
```

Nothing in `packages/` knows the name Boaz. Everything owner-specific lives in
`config/` and `content/`, which is what makes the open-source extraction in
Phase 10 a matter of swapping two directories rather than a rewrite.

---

## Three decisions worth knowing about

**Privacy is enforced by retrieval, not by prompting.** `config/privacy.config.ts`
declares closed topics and visibility ceilings. The policy engine narrows the
repository *before* ranking, and closed-topic questions short-circuit to a fixed
refusal without a model call at all.

**Conflicts are never resolved by a model.** Ingestion finds disagreements
between the CV, AI-memory exports and manual entry, and hands them to a human
with a recommendation. A wrong auto-resolution becomes a confident,
verified-looking falsehood the agent then repeats to recruiters. Every
resolution is recorded in the knowledge base with who decided it and when.

**Unverified claims are labelled, not hidden.** Projects without case-study
evidence are marked `needs_verification` and the agent is told to frame them
accordingly, rather than being dropped. Hiding real work is its own kind of
dishonesty — but *uncleared* work is different, and that gets `restricted`
instead, which means the agent cannot mention it at all. Clearance and
verification are separate axes, and the repository tracks them separately.

---

## Known limits

These are real, and worth stating plainly rather than discovering later.

- **Semantic retrieval is an interface with no implementation.** Ranking is
  BM25 plus metadata plus a rule-based intent stage. On a corpus this size that
  works well — the eval suite covers it — but it is lexical, and the rules are
  hand-written. `EmbeddingProvider` and `VectorIndex` exist for pgvector to slot
  into without touching the engine.
- **Hebrew retrieval leans on the intent rules.** The knowledge base is written
  in English, so a Hebrew question matches nothing lexically and is served by
  intent classification alone. It answers, but less precisely than English.
  Embeddings or a translated knowledge layer fixes this properly.
- **Only one project has a case study.** The internship platform is documented
  end to end; the other five are a name and a summary. Questions like *"did he
  lead this himself, and how big was the team?"* still cannot be answered for
  any of those five. The agent says so, which is correct, but it is a real limit.
- **No project media anywhere.** The internship platform's four transformation
  stages render as text, and its images stay `restricted` until someone confirms
  no screenshot contains intern data.
- **No project media.** The gallery, video and prototype components have nothing
  to render. `show_video` and `show_prototype` are switched off in
  `config/ui.config.ts` rather than left to resolve to nothing.
- **Sessions are not persisted.** State lives in the browser for the length of a
  conversation. The post-session summary types exist; nothing stores or runs
  them yet.
- **Client-supplied session state is untrusted.** It can narrow what the agent
  asks about; it cannot widen what may be retrieved. Audience is decided
  server-side.

---

## Working on the knowledge

The knowledge base is the product's core asset, and it is edited by hand on
purpose.

```bash
npm run knowledge:merge      # imports → staging + conflict report. Touches nothing canonical.
npm run knowledge:validate   # structure, referential integrity, evidence gaps
npm run eval                 # policy and retrieval regressions, no model needed
```

See [`content/README.md`](content/README.md) for the full workflow.

---

## License

MIT.

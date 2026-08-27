# Specifications

| Document | Status |
|---|---|
| [`personal_ai_representative_PRD_v0.3.md`](personal_ai_representative_PRD_v0.3.md) | **Current.** Supersedes v0.2 where they differ. |
| [`personal_ai_representative_design_doc_v0.2.md`](personal_ai_representative_design_doc_v0.2.md) | Superseded, kept for history. |

## What v0.3 changed

Two things, both of which changed what got built:

**Voice moved into the MVP.** v0.2 had it as Phase 6, after launch. v0.3 §36
states plainly that voice is part of the MVP definition, not a post-MVP
enhancement.

**The voice stack changed.** v0.2 specified LiveKit Agents. v0.3 §39 replaces
that for the browser MVP with the OpenAI Realtime API, the Agents SDK for
TypeScript, `gpt-realtime-2.1`, and direct WebRTC with backend-minted ephemeral
tokens. LiveKit is deferred to §23.6 — revisit only for telephony, multi-party
audio, or provider abstraction.

v0.3 also added §39's tool-execution rule, which is the constraint that shapes
the voice implementation: a `RealtimeSession` running in the browser must not
implement privileged retrieval as a browser-trusted function.

Everything else — the product vision, principles, knowledge architecture,
policy engine, visibility model and grounding policy — is unchanged between the
two.

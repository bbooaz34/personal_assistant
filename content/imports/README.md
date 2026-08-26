# Imports

Source documents waiting to be merged. Nothing here is authoritative.

| File | Type | Authority |
|---|---|---|
| `cv-extraction-v0.2.json` | CV extraction | 1 — authoritative |
| `chatgpt-export-v0.2.json` | AI memory export | 3 — inferred |

Use `docs/knowledge/AI-KNOWLEDGE-EXPORT-PROMPT-v0.2.md` to produce exports from
ChatGPT, Claude, Gemini, or any other assistant. The protocol is deliberately
identical across systems so exports become comparable rather than each arriving
in its own shape.

**AI memories are sources, not truth.** A model that has talked to someone for a
year is confident and frequently wrong: it conflates roles, invents plausible
dates, and rounds team sizes. Everything from a Level 3 source stays
`needs_verification` until a human confirms it — which is exactly what happened
to the ByondXR team figures, and why they are now public.

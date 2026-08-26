# Knowledge decisions

The audit trail for the knowledge base. Every human resolution is recorded here
and mirrored in the `conflicts` array of
`content/canonical/canonical-knowledge.json`.

| Document | What it is |
|---|---|
| `AI-KNOWLEDGE-EXPORT-PROMPT-v0.2.md` | The export protocol handed to ChatGPT, Claude, Gemini or any other assistant. Identical across systems so exports become comparable. |
| `conflict-report-v0.1.md` | The first conflict pass: CV versus ChatGPT memory. |
| `canonical-v0.1-changelog.md` | What the owner decided, and what remains open. |

## Why this exists

`verification_status: "verified"` is a claim the agent repeats to recruiters. It
has to mean *a person checked this*, and it has to be possible to find out who
and when. Without a written trail, "verified" degrades into "nobody objected".

## Adding a decision

When you resolve a conflict:

1. Edit `content/canonical/canonical-knowledge.json` — the fact, and a `conflicts`
   entry with `resolution`, `resolved_by` and `resolved_at`.
2. Add a changelog note here.
3. Run `npm run knowledge:validate`.

## The one place the CV was overruled

The 2025 CV lists a single ByondXR title, "Creative Director". Owner review
established the real path — Junior Product Designer → Creative Team Leader — and
canonical follows the owner rather than the higher-authority document.

Worth understanding as a precedent: authority levels are a default, not a rule.
A CV compresses, and compression can create a false impression without stating
anything false. When a Level 1 source is overruled, the reasoning gets written
down — which is what `conflict_byondxr_title` does.

# Content

The knowledge the representative speaks from. This directory is the source of
truth for the MVP; Postgres + pgvector can back it later without changing
anything that reads it.

```
content/
  canonical/    the reviewed, publishable knowledge base — the only thing the agent reads
  imports/      source documents awaiting merge (CV extraction, AI memory exports)
  projects/     one directory per project: case study, media, conversation hooks
  profile/      narrative identity content
  skills/       skill narratives that need more than a schema entry
  cv/           notes on the CV as a source
```

## The one rule

`canonical/` is written by humans, never by the ingestion pipeline. The merge
step produces a *staging* document and a review queue; a person decides what
gets promoted, and records the decision in `docs/knowledge/`. That is what makes
`verification_status: "verified"` mean something when the agent repeats it to a
recruiter.

## Adding knowledge

1. Drop the source document in `imports/` using the schema in `/schemas`.
2. Run `npm run knowledge:merge` — this writes a staging document and a conflict
   report, and changes nothing canonical.
3. Read the conflict report. Decide each one yourself.
4. Edit `canonical/canonical-knowledge.json` by hand.
5. Run `npm run knowledge:validate`.
6. Record what you decided and why in `docs/knowledge/`.

## What does not belong here

Compensation, contact details, home address, family, health, and anything else
in the `never` list in `config/privacy.config.ts`. Those are excluded at the
source rather than filtered at runtime — knowledge that was never ingested
cannot leak.

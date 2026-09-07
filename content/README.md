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

## Project media in the generative UI

The chat renders every project's visuals under one responsive rule: the inline
conversation column is phone-width and shows the **mobile** rendition; the
expanded stage is desktop-width and switches to the **desktop** rendition.

- **Images** — give each media item both renditions: `uri` (desktop) and
  `mobile_uri` (mobile), exported from the design source. The gallery picks
  per mode. An item without `mobile_uri` shows its `uri` everywhere.
- **HTML artifacts** — build them responsive; the viewer gives them a
  phone-portrait viewport inline and a wide stage when expanded, and the
  artifact reflows on its own. No second file needed.

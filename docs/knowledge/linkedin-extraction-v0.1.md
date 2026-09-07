# LinkedIn layer — ingestion record v0.1

**Date:** 2026-09-07
**Requested by:** Boaz (in session: "i want the agent to know my linkedin profile, my posts and articles. and i want the agent to speak those in context to the projects it presents")
**Source:** https://www.linkedin.com/in/bbooaz/ — profile, activity feed, articles — read through the owner's own browser session.

## What was added

- `content/imports/linkedin-extraction-v0.1.json` — the extraction: headline fact, four post facts, one article fact, two sources, two open conflicts, five unknowns.
- Canonical: the same facts and sources, plus supported_by relationships and a related_to link from the internship-build post fact to the internship project. **No career facts were changed** — see conflicts below.
- `owner_commentary` — a new field on project evidence packages (schema + `ProjectEvidence` type): what the owner said publicly about the work, with an English summary and a short verbatim quote. Attached to:
  - `internship-platform-ios26` — his post about this exact build ("הפער בין רעיון למוצר עובד הצטמצם לשיחה טובה ולכושר החלטה").
  - `lightricks-younger-me` — two adjacent posts: the hands-off trip-planner build and the context-engineering parable ("ה-AI שלכם לא מטומטם. הבריף שלכם קצר.").
- Pipeline: the orchestrator appends public owner commentary to each retrieved project's evidence text, and the system prompt instructs the agent to weave one line of it — attributed to his LinkedIn — into how it presents the project.

## Conflicts left OPEN for the owner — canonical career facts were NOT changed

1. **Zemingo title and start:** LinkedIn says "Product Design Manager, Mar 2025–present"; canonical (CV + owner review) says Design Team Leader since January 2025. In session Boaz has called himself "design team lead and art director."
2. **ByondXR end date:** LinkedIn shows roles running to **Aug 2024**; canonical says Jan 2020–**Jan 2024**.

## Needs owner confirmation

- **The GPT-coach article** (2025-02-27, "כיצד להפוך את צ׳אט GPT למאמן אישי?"): published under Boaz's LinkedIn profile, but the body credits ירדן להבי and the Mehut HaHaim magazine. Until clarified, the fact is `needs_verification` and phrased as "published under his profile", never "he wrote".
- **LEGO immersive Christmas house** (ByondXR × LEGO): a repost tags Boaz on the team — a potential portfolio project not yet in the knowledge base.

## Deliberately not ingested

Follower counts and post impressions (they age instantly), connection lists, and the "open to work" 2yr-old post's framing (superseded by current employment).

---

# Owner decisions, 2026-09-07 (same day)

1. **"Canonical wins all time."** Both career conflicts resolved in canonical's favor: Zemingo = Design Team Leader since January 2025; ByondXR = January 2020 to January 2024. This is a standing rule — future imports that contradict canonical career facts lose by default; only the owner changes canonical.
2. **The GPT-coach article is skipped.** Its fact, source and relationship were removed from canonical; the agent does not know it. The extraction record here keeps it for history.
3. **The LEGO Immersive Christmas House was added** as a project (canonical entry + `content/projects/byondxr-lego-christmas-house/`, status draft): a LEGO Group holiday experience on ByondXR's platform, participation evidenced by the public launch/team posts and owner confirmation. Role scope, timeframe (~2023 holiday season) and visuals still open; the public experience link is dead.

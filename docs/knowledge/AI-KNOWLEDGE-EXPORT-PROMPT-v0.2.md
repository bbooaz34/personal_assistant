# AI Knowledge Export Protocol v0.2

## Purpose

You are participating in the creation of a canonical professional knowledge base for a **Personal AI Representative**.

Your task is to export all professional information you currently know about the subject, using the supplied `knowledge-schema-v0.2.json`.

The output will later be merged with exports from other AI systems, the subject's CV, portfolio, case studies, and manually verified information.

Accuracy is more important than completeness.

---

## Core Rules

1. **Do not invent information.**
2. **Do not complete missing dates, metrics, roles, responsibilities, or project details from assumptions.**
3. Separate:
   - explicit knowledge,
   - derived knowledge,
   - inference.
4. Preserve contradictions instead of resolving them yourself.
5. Every claim must include:
   - confidence,
   - verification status,
   - visibility,
   - source reference when available.
6. Prefer specific evidence over generic claims.
7. Skills must be backed by evidence whenever possible.
8. Project claims must distinguish:
   - known responsibilities,
   - inferred responsibilities,
   - verified outcomes,
   - unverified metrics.
9. If information is missing, add it to `unknowns`.
10. If two claims conflict, include both claims and add an entry to `conflicts`.

---

## Privacy Rules

Do **not** export personal information that is unrelated to professional representation.

Exclude:

- salary or current compensation,
- health information,
- family information,
- precise home address,
- private relationship information,
- account credentials or identifiers,
- financial information,
- legal or medical history,
- unrelated personal conversations.

Professional contact information should only be exported if it was clearly intended to be public.

---

## Source Authority

Use the following hierarchy when describing sources.

### Level 1 — Authoritative
Examples:

- current CV,
- approved portfolio,
- approved case study,
- manually confirmed fact,
- official professional document.

### Level 2 — Strong
Examples:

- project documentation,
- professional presentation,
- work-related conversation with explicit factual statements.

### Level 3 — Inferred / AI Memory
Examples:

- remembered information from prior AI conversations,
- synthesized professional profile,
- repeated contextual information without an authoritative document.

### Level 4 — Unverified
Examples:

- model inference,
- ambiguous historical information,
- assumptions.

Do not silently upgrade a lower-authority source to verified truth.

---

## Evidence-Backed Skills

Do not return skills as an unsupported list.

For each skill, try to connect evidence.

Example:

```json
{
  "id": "skill_creative_direction",
  "name": "Creative Direction",
  "category": "creative",
  "proficiency": "advanced",
  "confidence": 0.95,
  "verification_status": "needs_verification",
  "visibility": "public",
  "evidence": [
    {
      "type": "role",
      "reference_id": "role_creative_team_lead",
      "strength": 0.95
    },
    {
      "type": "project",
      "reference_id": "project_mastercard_virtual_city",
      "strength": 0.85
    }
  ]
}
```

If you cannot provide evidence, keep the skill but lower confidence and mark it `needs_verification`.

---

## Projects

For every project you know about, export as much of the following as is actually known:

- project name,
- organization/company,
- subject's role,
- problem/context,
- responsibilities,
- process,
- tools,
- skills,
- industries,
- outcomes,
- measurable metrics,
- known visual/media assets,
- source evidence,
- verification status.

Do not turn vague recollections into detailed case studies.

---

## Relationships

Create relationships wherever they improve retrieval.

Examples:

- person → held_role → role
- person → worked_at → company
- person → worked_on → project
- project → demonstrates_skill → skill
- project → used_tool → tool
- project → belongs_to_industry → industry
- fact → supported_by → source

This layer will later allow the Personal AI Representative to answer questions using evidence chains rather than keyword matching alone.

---

## Important Distinction

The export is **source knowledge**, not canonical truth.

Your task is to represent what you know faithfully.

Do not attempt to make the final decision about which claims are true when authoritative evidence is missing.

---

## Desired Output

Return **only valid JSON** conforming to `knowledge-schema-v0.2.json`.

Do not include markdown commentary before or after the JSON.

Use stable human-readable IDs when possible, for example:

- `person_boaz_ben_eli`
- `company_zemingo`
- `role_design_team_leader`
- `project_mastercard_virtual_city`
- `skill_product_design`
- `source_chatgpt_memory_2026_08_26`
- `fact_current_role_zemingo`

If you do not know a field, omit it when the schema allows it rather than guessing.

---

## Final Self-Check

Before returning the JSON, verify that:

- no sensitive private information is present,
- every strong professional claim has a source or evidence when available,
- inferred claims are marked as inferred,
- confidence values reflect uncertainty,
- conflicting information has not been silently resolved,
- projects have not been embellished,
- skills are connected to evidence where possible,
- the result is valid JSON.

# Internship Platform — iOS 26 × Zemingo
## Project Evidence Review v0.1

### Why this is a stronger portfolio project
This project demonstrates the intersection we want the portfolio agent to understand: **product design + leadership + AI-native delivery + technical product thinking + visual craft**.

The most useful narrative is not “I redesigned a dashboard in an iOS style.” It is:

**Operational problem → product definition → functional system → AI-agent implementation loop → UX iteration → iOS 26 design-language exploration → Zemingo brand layer.**

### Verified from the uploaded source bundle
The making-of source explicitly defines the visual evolution as:

1. **It starts with code** — Next.js · Supabase · TypeScript
2. **First interface** — “A working prototype — plain Tailwind, zero design opinion”
3. **iOS 26 design language** — grouped lists, pills, segmented controls and soft glass shadows
4. **The Zemingo layer** — brand selection states, progress treatment, Rubik and the wordmark
5. **Finale** — Internship Platform — iOS 26 × Zemingo

The source bundle also contains the application components, auth/progress/database files, iOS-derived token files, Zemingo design-system material and a dedicated making-of implementation.

### Supported by the Claude project export
Claude's project record adds the product story: the three-user-role internship platform, program milestones, hour tracking, mentor feedback, role/privacy model, Supabase RLS, bilingual/RTL implementation, successive v1/v2/v3 product decisions, and the use of AI-authored repo-grounded build specifications.

### Portfolio framing
The project should primarily prove:

- AI-native product methodology
- Product definition and decision making
- UX / information architecture
- Ability to direct autonomous implementation
- Design-system thinking
- Visual transformation and craft
- Product leadership

It should **not** primarily position Boaz as a conventional full-stack engineer.

### Evidence still needed before publishing
- Permission to show the internal Zemingo tool publicly
- Sanitized screenshots/video with no intern data
- Confirmation whether the final redesign shipped
- Repository/deployment evidence if the ~90 minute claim is used

---

## Integration decisions — 2026-08-26

Recorded because several of these changed what the source files said, and a
future reader should not have to guess why.

**Normalized into `content/projects/internship-platform-ios26/project.json`.**
The source JSON did not conform to `schemas/project-evidence-schema-v0.1.json`:
`status: "verified_draft"`, evidence types `knowledge_export` / `source_bundle`,
and `presentation.default_component: "interactive_case_study"` are all outside
their enums, and the `recommended_component` values named components that do not
exist. The content was preserved; the shapes were corrected. The source file is
kept here as the audit artefact.

**Set to `restricted`, not public.** The source's own open questions ask whether
Zemingo permits public portfolio use of an internal tool, and that is unanswered.
So the project, the three facts derived from it, and the three skills whose only
evidence is it are all `restricted` — present in the repository, retrievable by
the owner, and never assembled for a visitor-facing turn. Four eval cases assert
this from different angles, including a visitor naming the project outright.

Publishing is one field per item once Zemingo confirms.

**Skills inherited the restriction.** `skill_product_definition`,
`skill_agentic_delivery` and `skill_design_systems` are evidenced only by this
project. Leaving them public would have leaked the existence of the work through
the back door — a skill the agent can name but not justify is worse than one it
does not mention.

**Rewrote `agent_opening` in third person.** The source had *"the internship
platform I built at Zemingo"*. The agent represents Boaz and never speaks as him
(§3.3, §17), so first-person copy in the knowledge base would have taught it the
opposite of the rule the system prompt enforces. It became `long_pitch`, in third
person.

**The ~90 minute claim is stored unverified.** Kept, because it is genuinely
striking, but marked `verified: false` with a note requiring it to be attributed
to Boaz explicitly or left out. The source's own claim rules say the same.

**Source bundles are not committed.** Both zips are the same bundle of internal
Zemingo application source — routes, server actions, auth, components. They are
referenced as evidence with `uri: null` and `visibility: private`, and `*.zip` is
gitignored. Internal source for an uncleared tool does not belong in a public
repository.

**Added a `show_transformation` component.** The Code → Tailwind → iOS 26 →
Zemingo sequence is the strongest visual-craft evidence in the portfolio, and
nothing in the registry could render a staged evolution. It works from text
today and will take screens per stage when they exist.

### Still blocking publication

1. Zemingo's confirmation that the tool may be shown.
2. Sanitized screenshots and recordings with no intern data.
3. Repository or deployment history, if the ~90 minute claim is to be used.
4. Confirmation of whether the redesign shipped or stayed a redesign layer.

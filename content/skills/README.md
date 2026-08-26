# Skills

Skills live in `content/canonical/canonical-knowledge.json`, not in this
directory. They are structured entries with evidence attached, because a skill
without evidence is a claim (design doc §3.2).

This directory is for narrative that a schema entry cannot hold — a written
explanation of how someone actually works in an area, when that would answer a
recruiter better than a proficiency label.

## The evidence rule

Every skill entry points at the facts, roles, or projects that support it. When
nothing supports it, the entry stays — with lower confidence and
`needs_verification` — rather than being deleted or quietly asserted. The agent
then presents it as unverified.

`skill_workflow_design` is the current example: strongly indicated by the
Lightricks assignment, but the workflow export has not been attached, so it is
not called verified.

## Two skills that look like one

`skill_generative_ai` and `skill_ai_native_design` are deliberately separate.
The first is operating the tools; the second is designing products and workflows
around AI. Recruiters ask about these differently, and collapsing them would
lose the distinction that makes the second one interesting.

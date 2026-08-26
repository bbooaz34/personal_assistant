# Owner dashboard

Phase 8. Not started.

A separate authenticated experience for the portfolio owner: recent sessions,
role and company, duration, projects viewed, questions asked, summaries, and
interest patterns across conversations.

## Prerequisites

This cannot be built usefully until Phase 7 exists — there is nothing to display
without stored sessions and generated summaries. The types are in
`packages/analytics`.

## Two constraints for whoever builds it

**Transcripts and summaries are visible to the owner only.** This is a different
trust boundary from the visitor-facing app, not a stricter setting of the same
one. It needs real authentication, not an environment-variable password.

**Keep stated and inferred separate in the UI.** `SessionSummary` distinguishes
what a recruiter actually said from what a model concluded, and the interface
has to preserve that. An owner acting on *"they seemed worried about SaaS
depth"* needs to know at a glance whether that was said or guessed.

## The most valuable view

Not the summaries — the **unanswered questions**. Every question the agent could
not answer is a documented gap in the knowledge base, and that list is the
owner's highest-value backlog.

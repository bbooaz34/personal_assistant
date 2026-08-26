# CV as a source

The CV is a Level 1 authority for career facts — roles, companies, dates,
education — and it is the highest-authority source in this repository for
anything it actually states (design doc §11, §12).

It is *not* authoritative for project-level detail. A CV compresses; case
studies do not. Where the two disagree about what someone did on a specific
project, the case study wins.

## Current source

`Resume_2025_creative_leader.pdf` — not committed. The extraction derived from
it lives at `content/imports/cv-extraction-v0.2.json`.

The original file is deliberately kept out of version control: it carries a
phone number and a personal email address, neither of which belongs in a
repository that will become public. The extraction excludes both.

## Where the CV was overruled

Once, and on purpose. The CV lists a single ByondXR title, "Creative Director".
Owner review established the real path — Junior Product Designer → Creative Team
Leader — and canonical knowledge follows the owner. The CV compressed a
progression into one line rather than stating something false, but the
compressed version would have misrepresented the trajectory.

That decision is recorded as `conflict_byondxr_title` in
`content/canonical/canonical-knowledge.json`.

## Re-ingesting an updated CV

1. Export a fresh extraction into `content/imports/` using
   `schemas/knowledge-schema-v0.2.json`.
2. Run `npm run knowledge:merge` and read the conflict report.
3. Assume a newer CV supersedes an older one for facts it states — but check
   whether it also *dropped* something that is still true. Compression is the
   most common way a CV introduces a false impression.

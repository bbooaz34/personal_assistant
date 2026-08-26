# Privacy model

## Access classes

Every knowledge item carries one:

| Class | Meaning |
|---|---|
| `PUBLIC` | Any visitor may receive it. |
| `RESTRICTED` | Requires an explicit rule granting it to that audience. |
| `PRIVATE` | Never reaches the visitor-facing agent. |
| `SYSTEM` | Prompts, policies, configuration. Never professional knowledge. |

Audiences have ceilings, set in `config/privacy.config.ts`:

| Audience | Ceiling |
|---|---|
| `public_visitor` | `public` |
| `verified_recruiter` | `restricted` |
| `owner` | `system` |

A visitor cannot claim their way into a higher audience. Audience is decided
server-side, from the request — never from anything the client or the visitor
says.

## Closed topics

Declared as data with match phrases and the exact refusal wording. Current
`never` topics: compensation, home address, family, health, age and protected
attributes, other employers or offers, system internals.
`private_contact_information` is `explicit_permission`; `confidential_projects`
is `restricted`.

Match phrases are intentionally broad, and cover Hebrew as well as English.
Over-refusing a compensation question costs one awkward sentence.
Under-refusing one cannot be undone.

## What is never ingested

Compensation, contact details, home address, family, health, financial and
legal history never enter the knowledge base at all. The original CV — which
carries a phone number and a personal email — is not committed; only an
extraction that omits both.

This is the strongest layer, because it is the only one that cannot be
misconfigured.

## Prompt injection

Assume every visitor may try. The architecture's answer is that access is not a
decision the model makes: the disallowed material was never retrieved, so there
is nothing in context to talk the model out of.

`assessInjection` exists on top of that to *notice* attempts — to log them, to
keep the agent's framing stable, and to give the owner visibility into who
probed. It is defence in depth, and it is never the only thing standing between
a visitor and private data.

Detected attempts get a short, unbothered redirect. Hostility reads as something
to work around; boredom does not.

## Verification and honesty

`unverifiedClaimHandling` is set to `label`, not `hide`. Several real projects
lack case-study evidence, and the honest move is to show them marked unverified
rather than to pretend the work does not exist. The system prompt requires the
agent to frame them accordingly.

`rejected` claims are never presentable to anyone but the owner. A rejected
claim is one someone already decided was wrong.

## Embedded artifacts

The portfolio embeds real running interfaces, not screenshots — which makes
them the highest-risk content in the repository, because a design mockup is
full of realistic sample data.

`scripts/import-artifacts.ts` is the gate. It replaces a reviewed map of names,
avatar initials and addresses, then **fails the import if any unrecognised
person-shaped name survives**. That inversion matters: an allowlist of names to
replace silently passes anyone it does not know about, which is exactly what
happened on the first pass here — three of seven people were missed because the
detection regex could not match a hyphenated surname, and the verifier only
checked the names that same regex had found.

A new bundle containing a new colleague now stops the import rather than
publishing them.

Two further properties:

- **No third-party requests.** React and Babel are vendored into the repository
  rather than loaded from unpkg, so an artifact cannot leak a visitor's IP to a
  CDN and does not break when one is unreachable.
- **Isolation.** Artifacts need `allow-same-origin` to run at all, so set
  `ARTIFACT_ORIGIN` in production to serve them from a separate host. Same-origin
  then means the artifact's origin, not the app's. See `config/ui.config.ts`.

## Testing it

`evals/recruiter-eval-set.json` covers compensation (direct, indirect, and in
Hebrew), contact details, family, age, home address, system internals, and three
injection styles. `npm run eval` runs them without a model or an API key.

Add a case whenever you add a rule. A policy that only works in one language, or
only against the phrasing you thought of, is a gap rather than a limitation.

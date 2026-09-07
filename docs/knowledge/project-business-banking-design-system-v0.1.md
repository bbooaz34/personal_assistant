# Business-banking design system — ingestion record v0.1

**Date:** 2026-09-07
**Requested by:** Boaz (in session: introduce the design-system project and "generate few prototypes from this transition page to showcase the AI workflow of providing development team designs that are nearly ready to production").
**Source:** the design system's Figma file, read live via the Figma desktop bridge. The client is a **confidential banking client** — this repository is public, so the client's name and the file's identifiers appear nowhere in it; the owner holds the file.

## Owner-confirmed same day

- Built by **Boaz's design team at Zemingo, with him leading**.
- Status: **delivered / mostly done** and in the development team's hands.
- The dev team receives **running prototypes plus the specs**.
- Presentation rule: the client is shown publicly only as **"a major Israeli bank"** — the agent never names it and does not confirm or deny guesses.

## What the file contains

An atomic design system for the bank's business app: atoms (colors, text styles, buttons, toasts, labels, icons, snackbar, illustrations, system); molecules (header, text fields, balance titles, date picker, expand/drop, tables, filters, lists, cards, pop-up, navigation, credit cards, footer, transitions); organisms (modals, info/action/system pages); accessibility update tracks (06.26 + future). The **Transitions** page (~286 nodes) documents micro-interaction specs as annotated mobile frames, largely around the signatures flow. Tokens read from the file: primary `#0066ff`, ink `#1d1d20`; the brand font is proprietary (the public prototypes substitute Heebo).

## What was generated

Three interactive prototypes in `content/projects/business-banking-design-system/artifacts/`, built fresh from the Transitions specs — self-contained RTL Hebrew HTML on token-named CSS custom properties, **placeholder data only**:

1. **signatures-swipe.html** — partial drag reveals sign/reject; continuing makes the sign action take over the surface (per the annotation); full swipe commits, badge and card state update.
2. **filters.html** — date presets rewrite the from/to fields, custom typing releases the preset, CTA arms on change, reset restores, applied filters collapse to tags where deleting one reveals the next ("עוד"/"פחות").
3. **account-picker.html** — bottom sheet with slide-up entrance, live search over name/number, radio selection, favorite pinning.

All three verified by driving their interactions in a browser.

## Still open

- Start and delivery dates (status is confirmed; dates are not documented).
- Adoption/outcome signals — none claimed.

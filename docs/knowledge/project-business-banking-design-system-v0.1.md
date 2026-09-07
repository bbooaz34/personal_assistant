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

---

# v0.2 — The marketing clip replaces the first prototype pass, 2026-09-07

Owner feedback: the three spec prototypes didn't match the Figma designs accurately enough. They were retired the same day (recoverable from git history; a faithful rebuild is planned). The owner pointed the Figma bridge at the app's **marketing-screens file** and asked for a marketing clip.

- Exported the six store screens (cover, signatures, sharing, RTGS transfers, multiple checks, English variant — 1242×2208 App Store format, placeholder data, no client branding) to `slide-*.jpg`.
- Built **marketing-clip.html**: an auto-playing six-scene clip — floating slide cards with slow Ken Burns drift, strong-ease entrances/exits, per-scene kicker captions, a top progress rail, a drifting background wash, click-to-skip, reduced-motion crossfade variant — ending on a card with a **"השקת אב־טיפוס" CTA** (stubbed to a "coming soon" toast until the rebuilt prototype lands) and a replay control.
- The clip is now the project's sole artifact and media (`type: video`); hooks, pitches and the peek were rewritten around it.
- Identifier sweep re-run: no client-identifying strings anywhere in the repo or API payloads.

---

# v0.3 — The design-accurate interactive prototype, 2026-09-07

Owner pointed the Figma bridge at the app's cancel-instruction prototype file (a six-screen wired flow) and asked for a rebuild with guaranteed design accuracy.

**Approach — the design itself is what runs.** Instead of re-implementing the UI (where the first pass drifted), the player works the way Figma's own does:
- Each screen is a **1:1 export of the Figma frame** (2x PNG, cropped to exact frame bounds — the raw exports include unclipped overflow, offset (44,40) logical).
- The **interaction graph was read from the prototype wiring itself**: every reaction's hotspot rect, destination, transition type, direction and authored duration (MOVE_IN LEFT 400ms, MOVE_OUT RIGHT 383ms, MOVE_IN TOP 511ms, SLIDE_OUT BOTTOM, SMART_ANIMATE≈dissolve 1022ms, plus two AFTER_TIMEOUT steps at 3s and 1.2s).
- Transitions reproduce Figma's literal direction semantics; a click on a dead area flashes the live hotspots, exactly like Figma's player; ⟲ restarts; reduced-motion gets instant swaps.
- Flow verified end-to-end in a browser: list → cancel → payees modal → close → back → summary → confirmation toast pair.

The marketing clip's CTA now launches the prototype (verified). The owner also provided a local .fig copy of the design system as backup design data; it was not needed — the live bridge supplied everything.

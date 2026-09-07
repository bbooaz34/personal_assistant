# Heights Telecom Website — ingestion record v0.1

**Date:** 2026-09-07
**Requested by:** Boaz (in session: "read the project 'Heights website final' … add this project to my list, make sure the personal assistant can generate assets from this project and showcase it on the chat")
**Source:** Figma file "Heights Website Final" (`m0OXA1pyrIm0M7VSgAfYG7` — see canonical source entry for the exact URL), read live via the Figma desktop bridge.

## What was added

- `content/projects/heights-telecom-website/project.json` — evidence package, status `draft`.
- `content/projects/heights-telecom-website/artifacts/` — nine PNGs exported directly from the Figma file at 1x: home, about, products gallery, product detail (Brandbook 25.5 set), services, solutions, contact, press room, styleguide. Served at `/api/artifact/heights-telecom-website/<file>`.
- Canonical additions: `company_heights_telecom`, `industry_telecom`, `source_figma_heights_website_2026_09_07`, `project_heights_telecom_website`, and worked_on / demonstrates_skill relationships.

## What the source establishes

The Figma file establishes the design work itself: seven page templates (plus contact form states), a styleguide (buttons, icons, components, color palette, fonts), the Heights Brandbook 25.5, iterations, a moodboard and a scroll-animation storyboard. Heights Telecom's business (gateways + software platform, ARPU/churn story, Bezeq case study) is taken from the design copy itself.

## What it does NOT establish — owner must confirm before promoting past draft

1. Boaz's exact role and scope (solo vs team/agency; website only vs branding too).
2. Timeframe (footer copyright in the design says 2022; brandbook is versioned 25.5).
3. Whether the design shipped to heights-t.com.
4. Any outcome or metric — none are attached, deliberately.
5. Owner's own few words describing the project in his voice (current summary is inferred).

The design's "Animation parallax"/"Story" dashed block on the previous home page is a placeholder for a scroll-driven animation designed on the storyboard page — the exported home.png includes it and its caption explains it.

---

# v0.2 — Owner confirmation, 2026-09-07

**Confirmed by Boaz in session, same day:**

- This is a **Zemingo client project** — background at https://www.zemingo.com/en/projects/heights-telecom (scope there: visual identity, interaction design, web development & PWA).
- The **latest phase designed and developed a fresh new homepage**, desktop **and mobile**.
- Boaz's role: **design team lead and art director**.
- The phase started **~3–4 months before 2026-09-07** (≈June 2026) and **launched 2026-09-06**.
- Launch independently verified: heights-t.com serves the redesign (animated Tailor Made / WiFi 7 hero, product catalogue, solutions, press room; footer © 2026). Structure matches the Figma design; the shipped hero copy differs slightly from the working file's "Your Network Your Rules".

**Changes applied:**

- Exported the new homepage from Figma: `home-new-desktop.png` (frame 1919:20246, 1x) and `home-new-mobile.png` (frame 1919:20668, 2x), added as the leading media; the old `home.png` re-captioned as the previous phase (before/after pair).
- Canonical: added `source_zemingo_heights_case_study` (authority 2) and `source_manual_confirmation_2026_09_07` (authority 1); project `verification_status` → **verified**; `role_ids` → `role_design_team_leader`; skills extended with creative direction and team leadership; relationship confidences raised to 1.
- Evidence package status → **verified**; added Zemingo case-study and live-site evidence links; open questions reduced to team composition and post-launch metrics.

**Still open:** team composition under Boaz's direction; post-launch metrics (launch was yesterday — none exist yet, and the agent must not claim any).

---

# v0.3 — Focused section assets + responsive gallery, 2026-09-07

Owner feedback: the full-page exports were too big; focus on 2–3 main sections, show mobile renditions in the compact chat and desktop renditions when expanded.

- Replaced all previous exports with three homepage sections, each as a desktop + mobile pair exported from the new-homepage frames and recompressed to web-size JPGs (~100–220 KB each): `hero`, `products`, `solutions` (`<name>-desktop.jpg` / `<name>-mobile.jpg`). Overflowing Figma frame content was cropped out of the solutions and hero-mobile exports.
- Added `mobile_uri` to the media model (knowledge `Media` type, evidence schema, portfolio types); canonical and package media now carry both renditions.
- `MediaGallery` renders `mobile_uri` in the inline (narrow) chat and switches to the desktop `uri` in the expanded overlay (`renderComponent` gained an `expanded` flag; the overlay passes `true`).
- Dropped the before/after hook (the previous-phase page exports are no longer shipped) and reworded the design-system hook accordingly.

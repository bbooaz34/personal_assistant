# DARING workshop — ingestion record v0.1

**Date:** 2026-10-19
**Requested by:** Boaz (in session: export the DARING project as a package; when no project existed, he asked for it to be created in the portfolio first).
**Source:** the workshop repository on Zemingo's Bitbucket (`zemingo/daring-workshop`, local checkout `daring-starters`) at `2eafeb6`, and what Boaz said in the Claude Code sessions that built the workshop between 2026-10-04 and 2026-10-19.

## What the owner said

- The format for the day was nine stations around one big table: set them up first, walk between them, stop where something catches you, then make something new.
- After the workshop on 2026-10-06 he said it was really successful ("היה ממש מוצלח") and that he would run it again about a week later for another team.
- On 2026-10-19 he asked for the workshop to be added to the portfolio.

On 2026-10-19 he confirmed his role — Design Team Leader and facilitator of the workshop — and that he designed the workshop (including the DARING key visual and the 3D ribbon built from it) and wrote its content. He has not yet reviewed the rest of the project copy.

## What was brought in

- `content/projects/daring-workshop/artifacts/workshop/` — the stations page and the get-ready page, Hebrew, with their stylesheet, script, the hero bundle, the poster and the Zemingo wordmark, plus `source/` with the readable Three.js source of the 3D ribbon and its build config, so the shape can be changed and rebuilt.
- `content/projects/daring-workshop/artifacts/stations/` — production builds of seven stations (01, 03, 05, 06, 07, 08, 09), each self-contained with relative paths.
- `content/projects/daring-workshop/artifacts/gallery/` — one screenshot per station (all nine), taken from the automated test evidence in the workshop repository, converted to JPEG at original size.
- `content/projects/daring-workshop/artifacts/thumb.jpg` — a still of the live 3D hero.

## Edits to the artifacts, and why

All forced by the artifact route or by authorship; nothing else differs from the workshop repository.

1. Fonts are inlined as `data:font/woff2` URIs in `workshop/style.css` and in station 01's CSS, and station 01's `.woff` fallbacks were removed. The route serves neither `.woff2` nor `.woff`.
2. Stations were built with `vite build --base ./`, so their files resolve beside the page and not against the app root.
3. Station 08's prepared-images directory was absolute (`/prepared`) in the bundle; it is `./prepared`.
4. Stations 06 and 09 were built from `e519810`, the facilitator's last commit, not from `main`. Commits after it, to stations 04, 06 and 09, were made by two participants and are their work, not Boaz's.

These files did not pass through `scripts/import-artifacts.ts`; its map belongs to the internship bundle. They were reviewed by hand for personal data and contain none.

## Photos and videos from the day

On 2026-10-19 the owner decided to publish all six photos and all three videos from the day with faces blurred, and accepted that browser windows and participants' work are visible in them. Faces were blurred on this machine, not through any online service, with macOS Vision: face detection over the whole picture and over overlapping crops, plus the head area of every upper body it finds; in video each detection is held for 12 frames. Vision misses turned and down-looking faces, so every photo and frames across every clip were checked by eye and regions were added by hand. Also blurred: a webcam preview and a woven portrait on laptop screens in the photos, and a browser bookmark bar in one photo that named another, confidential client. Audio was removed from the videos. Only the blurred files are in the repository (`artifacts/gallery/day-*.jpg`, `apps/web/public/media/daring-day-*.mp4`); the originals stay with the owner.

## Left out, and why

- The thank-you page; its photos and videos are in the gallery instead.
- Stations 02 and 04 as running artifacts: the sandbox grants no microphone or camera, and station 04 also needs a MediaPipe model and WebAssembly that the route does not serve. Both appear as images.

## Registered as

- Package `content/projects/daring-workshop/project.json`, status `draft`.
- Canonical `project_daring_workshop`, `verification_status: needs_verification`. Flip both once Boaz has read the copy.
- New canonical records: `tool_threejs`, `tool_mediapipe`, `tool_playwright`, `source_daring_workshop_repo_2026_10_19`, `source_owner_statements_daring_2026_10`, and five relationships.
- Package file: `docs/project-packages/daring-workshop.package.md`.

## Still open

- Attendance and what participants made on the day.
- Participants' consent to publication of the blurred photos and videos.
- Whether the second run took place.

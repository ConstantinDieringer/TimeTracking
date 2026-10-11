# Hyperframes Composition Brief: Zeiterfassung

## Objective
Create a short launch-style brag video for Zeiterfassung (Austrian time tracking with built-in labor-law checks).

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 22 seconds

## Source Material
- Project root: repository root
- Primary files read: README.md, web/src/styles/tokens.css, web/src/styles/pages.css, web/src/styles/base.css, web/src/pages/Heute.tsx, web/src/components/{Findings,Tageslinie,LogoMark}.tsx, web/src/lib/protokoll.ts, packages/legal/src/azg.ts
- Product name: Zeiterfassung
- Strongest claim: "Die Grenzen werden nicht nur dokumentiert, sondern laufend überwacht." / record "hält einer Prüfung nach § 26 AZG stand"
- Key UI to recreate: the `.stamp` card (Heute page), the Tageslinie, the Prüfung findings, one Änderungsprotokoll entry
- Copy that must appear verbatim (from the UI / legal package):
  - Noch nicht begonnen · Kommen · Arbeitszeit läuft · Eingestempelt um 08:00 · Einen guten Arbeitstag!
  - Tagessoll erreicht
  - Alles im Rahmen — alle Arbeitszeitregeln eingehalten.
  - Tagesarbeitszeit 12:30 h — über der Höchstgrenze von 12 Stunden. (§ 9 Abs 1 AZG)
  - Ruhezeit 9:15 h seit 22:30 — unter den vorgeschriebenen 11 Stunden. (§ 12 Abs 1 AZG)
  - AZG · ARG · KJBG · UrlG

## Creative Direction
- Tone preset: polished
- Creative direction: calm Viennese precision: a stopwatch that read the law
- Interpretation: slow confident reveals, one idea per scene, soft slides/crossfades, sentence case, no exclamation-mark energy; the red violation is the only weighted moment.
- Angle: a normal clock-in turns out to be watched over by the Arbeitszeitgesetz; the app names the paragraph and keeps a log nobody can scrub.
- Hook: cursor clicks the green "Kommen" button on the real stamp card; clock starts running.
- Outro: logo + "Zeiterfassung" + "AZG · ARG · KJBG · UrlG" + "Hält einer Prüfung nach § 26 AZG stand."
- Avoid: generic SaaS language, abstract filler, gradients/glass/neon (the project's tokens.css forbids them), emoji.

## Visual Identity
- Background `#f6f7f9`; surface `#ffffff`; muted `#f1f3f6`; hairline `#e6e9ee`
- Text `#111827`, muted `#5b6474`
- Accent `#047857` (text/buttons), `#059669` (bars), soft `#ecfdf5`/`#d1fae5`
- Break amber `#f59e0b`; warn `#b45309`/`#fffbeb`
- Violation `#b91c1c` on `#fef2f2`, border `#fca5a5`, 3px left edge
- Fonts: Geist Variable + Geist Mono Variable (local woff2 copied from node_modules/@fontsource-variable)
- Radii 8/12px, shadows only for layering

## Storyboard
Contract: `brag-output/brag-plan.md`.
1. Kommen — 3.4s — stamp card, cursor clicks Kommen, status flips, clock runs, toast
2. Der Tag — 5.2s — timeline segments, progress → Tagessoll erreicht, figure tiles
3. Prüfung — 5.0s — headline, all-clear, then two red findings with paragraphs
4. Protokoll — 3.7s — audit entry 16:45 → 17:30, "Auch ein Administrator kann das Protokoll nicht bereinigen."
5. Outro — 4.7s — logo, name, laws, § 26 AZG claim

## Audio
- Role: warm bed, sparse accents
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`, volume 0.3, fade-in 0.5s, fade-out 1.5s
- Cue source: bundled preset `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.md`; lock violation card ~10.93s, logo ~17.47s; timeline segments on 3.82/4.39/4.91
- Audio-reactive: subtle; skipped if extraction helper unavailable (domain skill not installed locally; documented)
- SFX: click on Kommen, soft drop on toasts, soft impact on first violation, bell on logo
- Exact SFX choice is made against the implemented animation.

## Hyperframes Instructions
Use native Hyperframes conventions (data-composition-id root, timed `.clip` scenes, paused GSAP timeline registered on `window.__timelines`). Show real product UI, keep text readable, 22s total, run `npx hyperframes check` before render, keep everything local.

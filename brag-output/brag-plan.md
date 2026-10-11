# Brag Plan: Zeiterfassung

## What is this app?
Time tracking for small Austrian teams that doesn't just record hours: it checks every day against the AZG, ARG, KJBG and UrlG as you work and names the paragraph when a limit is crossed.

## The angle
Most time trackers are a stopwatch with a spreadsheet attached. This one has a stopwatch that has read the law. The video starts as a calm, ordinary clock-in, then shows that the app quietly keeps track of rest breaks, the 12-hour cap and the 11-hour rest period, and that the audit log can't be wiped, not even by an admin. The joke stays dry: very Austrian, very precise, very calm. The app's own copy does the heavy lifting (it quotes paragraphs like "§ 9 Abs 1 AZG"), so we let it.

On-screen language is German (de-AT), the product's own voice.

## Hook (first 2-3 seconds)
The real "Stempeln" card, empty: "Noch nicht begonnen", a giant Geist Mono `0:00`. A cursor clicks the green **Kommen** button. The status pill flips to "Arbeitszeit läuft" and the clock starts running. The product doing its one job, at full scale, in the first second.

## Key moments (the middle)
- **The day fills itself in.** The Tageslinie (day timeline) draws: green work, amber break, green work. The progress bar runs to the daily target and the real toast lands: "Tagessoll erreicht".
- **The law is watching.** The "Prüfung" section. First the green all-clear: "Alles im Rahmen — alle Arbeitszeitregeln eingehalten." Then a different day: a red finding, "Tagesarbeitszeit 12:30 h — über der Höchstgrenze von 12 Stunden", tagged § 9 Abs 1 AZG, followed by "Ruhezeit 9:15 h … unter den vorgeschriebenen 11 Stunden" (§ 12 Abs 1 AZG). Headline (README, verbatim in spirit): "Grenzen werden nicht nur dokumentiert, sondern laufend überwacht."
- **Nobody edits the past quietly.** One Änderungsprotokoll entry: who, which day, value before → after (Gehen 16:45 → 17:30). Line: "Auch ein Administrator kann das Protokoll nicht bereinigen."

## Outro / punchline
Logo mark (clock on emerald) + "Zeiterfassung". Under it: "AZG · ARG · KJBG · UrlG". Then the final claim: "Hält einer Prüfung nach § 26 AZG stand." Music resolves, silence.

## User flow worth showing
1. Entry: Heute page, "Noch nicht begonnen", cursor clicks **Kommen**, clock runs.
2. Key action: the workday accumulates: timeline segments, progress bar to "Tagessoll erreicht".
3. Result: the Prüfung section evaluates the day (all clear), and on a bad day it flags the exact violation with its paragraph.

## Tone
- Preset: polished
- Creative direction: "calm Viennese precision: a stopwatch that read the law"
- Interpretation: light UI on cool grey, slow confident reveals, soft crossfades/slides, one idea per scene, no exclamation marks; the only "loud" moment is the red violation card, and it's still restrained.

## Format: landscape — 1920x1080
## Duration: 23s (final; scene 3 got +0.9s so both findings can be read)

## Visual identity (from the project)
- Background: `#f6f7f9` (page), surfaces `#ffffff`, muted surface `#f1f3f6`
- Accent: `#047857` (emerald), `#059669` for bars/segments, soft `#ecfdf5` / `#d1fae5`
- Text: `#111827`, muted `#5b6474`
- Warn: `#b45309` on `#fffbeb` (line `#fcd34d`); break segment `#f59e0b`
- Violation: `#b91c1c` on `#fef2f2` (line `#fca5a5`)
- Display font: Geist Variable (sentence case, no tracked caps)
- Body/clock font: Geist Variable; Geist Mono Variable for the big clock
- Strongest visual element: the `.stamp` card (big mono clock + green Kommen button + 4 figure tiles) and the finding cards with a 3px colored left edge
- Radii 8/12px, hairline borders `#e6e9ee`, shadows only for layering. No gradients, no glass, no emoji (all per tokens.css)

## Share copy (draft)
Zeiterfassung that has read the Austrian Arbeitszeitgesetz: it stamps your hours, checks every day against AZG, ARG and KJBG, and keeps an audit log nobody can scrub.

## Audio direction
- Role: warm bed, sparse professional accents
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (steady, clean; the polished pick)
- Music treatment: start at 0, volume ~0.3, soft 0.5s fade-in, 1.5s fade-out at the end
- Music cue guidance: preset read (`vol-12.music-cues.md`, ~110 BPM). Strong cues to target: **10.93s** (violation card lands), **18.56s** (logo lands). Beat grid around 3.8–5.3s for timeline segments (3.82, 4.39, 4.91); finding cards in scene 3 snap to every other beat (≥1.1s apart) so each line can be read.
- Audio-reactive treatment: subtle. The emerald logo tile / running-status dot may breathe slightly with bass energy. No waveforms.
- SFX posture: sparse, motion-matched, soft
- Audio-coupled moments: cursor click on "Kommen"; toast arrival; violation card arrival (one soft impact); logo landing (one bell)
- Restraint rule: no SFX on every element; no glitch/error sounds on the violation (it's serious, not comic)

## Storyboard

### Scene 1 — Kommen — 3.4s (0.0–3.4)
Stamp card centered at large scale. Greeting "Guten Morgen, Anna" (fictional name from seed data), date line "Montag, 12. Oktober 2026". Pill "Noch nicht begonnen", clock `0:00`, hint "Ein Klick auf „Kommen“ startet die Aufzeichnung." Cursor glides in and clicks **Kommen** (~1.2s). Pill turns emerald "Arbeitszeit läuft", hint becomes "seit 08:00 Uhr", clock starts counting in fast-forward. Toast slides in top-right: "Eingestempelt um 08:00 — Einen guten Arbeitstag!"
Sequential/interaction: yes, simulated cursor click on Kommen; status flip; clock count.
Audio intent: settle in, gentle start
Audio-coupled idea: click on button press; soft drop on toast
Transition mood: soft → Scene 2 (camera pulls back / card slides up)

### Scene 2 — Der Tag — 5.2s (3.4–8.6)
Same card, now showing the day: Tageslinie draws three segments one after another (work 08:00–12:15, break 12:15–12:45, work 12:45–16:15) with tick labels 09:00/12:00/15:00. Progress bar fills "7:42 von 7:42 h" and the four figure tiles count up: Gearbeitet 7:45 · Pause 0:30 · Tagessoll 7:42 · Saldo heute +0:03. Toast: "Tagessoll erreicht — 7:42 h sind geschafft."
Sequential/interaction: yes, 3 timeline segments on beats (3.82 / 4.39 / 4.91, non-text accents), tiles count up together.
Audio intent: forward motion, satisfaction
Audio-coupled idea: soft ticks on segments; success cue on toast
Transition mood: clean slide → Scene 3

### Scene 3 — Prüfung — 5.9s (8.6–14.5)
Headline top: "Grenzen werden nicht nur dokumentiert, sondern laufend überwacht." Section "Prüfung" with tag "AZG". The green all-clear row appears: "Alles im Rahmen — alle Arbeitszeitregeln eingehalten." Then a date chip switches to another day ("Do 08.10.") and the all-clear gives way to two finding cards, one by one:
1. red: "Tagesarbeitszeit 12:30 h — über der Höchstgrenze von 12 Stunden." · § 9 Abs 1 AZG (lands ~10.93s, beat-locked)
2. red: "Ruhezeit 9:15 h seit 22:30 — unter den vorgeschriebenen 11 Stunden." · § 12 Abs 1 AZG (~12.0s)
Both hold together to the end of the scene.
Sequential/interaction: yes, 2 cards, ≥1.1s apart, then hold
Audio intent: a small shift in weight: serious, not alarming
Audio-coupled idea: one soft impact on the first violation card
Transition mood: soft crossfade → Scene 4

### Scene 4 — Protokoll — 3.8s (14.5–18.3)
One Änderungsprotokoll entry card: "Arbeitszeit · geändert", subject "Arbeit am Mo 05.10.2026", changed by "Markus (Verwaltung)", row "Ende: 16:45 → 17:30" (old value struck through, new in emerald). A small lock. Line: "Auch ein Administrator kann das Protokoll nicht bereinigen."
Sequential/interaction: entry slides in, then the before→after value animates
Audio intent: quiet confidence
Audio-coupled idea: soft click when the lock appears
Transition mood: soft → Scene 5

### Scene 5 — Zeiterfassung — 4.7s (18.3–23.0)
Logo mark (white clock on emerald tile) scales in, lands on 17.47s, "Zeiterfassung" beside it. Below: "AZG · ARG · KJBG · UrlG". Then: "Hält einer Prüfung nach § 26 AZG stand." Hold. Music fades.
Sequential/interaction: logo → name → law row → claim
Audio intent: resolve
Audio-coupled idea: one bell on logo landing
Transition mood: end

**Music mood for this video:** polished, steady, upbeat-calm
**Audio summary:** a clean steady bed under a few soft, motion-matched clicks; one weighted hit on the violation, one bell on the logo, then a fade to silence.

## Data note
All names and times on screen are fictional stand-ins (Anna, Markus from seed data; no real customer data, emails, hostnames or keys).

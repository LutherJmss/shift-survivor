# Changelog

All notable changes to SHIFT SURVIVOR are documented here.

## v1.1.1 — 2026-11-08

Scoring and XP rework. The v1.1.0 anti-spam mechanics held up (spam still loses), but the score
and level targets did not: a review rerun measured spam at 18 692 vs smart 10 646 (176 %), the
repo simulation measured smart at level 10.4 (target 18–25), and winning scored barely more than
dying early (smart 10 646 vs never 10 338). Root cause: score and XP were kill-driven, so an
aggressive short run could bank more kills than a careful winning run.

### Scoring (v1.1.1)

- **Survival is now the main score source: +10 per second alive.**
- Kill scores reduced 10/12/30 → **2/2/8** (crawler/wasp/brute). PERFECT SHIFT stays +100.
- Boss kill stays +4000, victory bonus stays +2000 — a win is worth ~10 000 points before
  survival and kills are counted.

### XP (v1.1.1)

- **Survival is now the main XP source: +1 per second alive.**
- Kill XP reduced 1/1/3 → **0.5/0.5/1.5**.
- `xpForLevel` reworked: `round(18 + 0.8×level)` up to level 18, then **×1.8 per level** — the
  level-19+ wall caps the kill→DPS snowball for every strategy.
- Enemy HP growth raised **0.5 → 1.2 per 30 s** (authorised tuning knob): at 8 minutes a level-21
  player faces a crawler with `(1 + floor(480/30)×1.2 + (21−1)×0.08) × 3 = (1 + 19.2 + 1.6) × 3 ≈ 65 HP`,
  so no DPS build can clear the swarm — survival has to come from shifting.

### Measured result (npm test on the delivered code, seeds 1001–1005, 5 runs per strategy)

| strategy | avg score | avg time | win rate | avg level | avg perfects |
| --- | --- | --- | --- | --- | --- |
| never | 4100 | 223 s | 0/5 | 20.6 | 0.0 |
| spam | 3374 | 157 s | 0/5 | 18.6 | 0.0 |
| smart | 12378 | 486 s | 5/5 | 21.0 | 6.6 |

- min winning score **11795** > max non-winning score **5157**
- spam vs smart score: 3374 vs 12378 (**27 %**)
- Assertions (all PASS, `npm test` exit code 0): spam avg score ≤ smart avg score; spam win rate ≤
  smart win rate; smart avg level within 18–25 (21.0); min winning score > max non-winning score;
  smart wins all 5 runs.

Reproducibility note: the simulation is seeded and byte-for-byte deterministic inside one
environment (repeat runs here are identical). Floating-point differences between Node/CPU builds
can shift per-seed outcomes slightly in this chaotic system: an independent rerun of the same
package measured never 3845 / 213 s / level 20.4, spam 3777 / 171 s / 18.8, smart 12356 / 488 s /
21.0 / 6.4 perfects — spam/smart 31 %, min winning score 11795 > max non-winning score 5879.
All five assertions PASS in both environments; treat per-run numbers as environment-specific.

## v1.1.0 — 2026-11-08

Balance patch after a headless review found that shift-key spam was the optimal strategy
(v1.0 review: spam 3/3 wins, 120k–170k score, only 8–14 hits per run).

### Balance — shift anti-spam (the headline fix)

- Shift invulnerability reduced **0.25 s → 0.12 s**; it is now always shorter than the shortest
  possible cooldown, so shifting can never be chained into permanent invulnerability.
- RESONANCE cooldown floor raised **0.15 s → 0.35 s**.
- **PERFECT SHIFT tightened**: only counts when a same-plane enemy is within
  `r_enemy + r_player + 6 px` **and** ≥ 1.2 s since the last shift. A PERFECT now forces a
  1.5 s shift cooldown afterwards — mashing the key can no longer farm PERFECTs.
- Shifting now pushes overlapping same-plane enemies outward ~12 px, so phasing into a crowd is
  not an instant chain of hits.
- Win is now the main score event: boss kill **1000 → 4000**, victory bonus **500 → 2000**.
  Surviving and beating the Eclipse Lord must out-score dying after a kill farm.
- Result (headless simulation, 5 seeds per strategy): shift-spam dies at ~167 s on average with
  **0/5 wins**, and the surrounded-only strategy wins **5/5**.
  **Correction (v1.1.1):** the initially claimed "spam at 84 % of smart's score" did not hold —
  a rerun measured spam at 18 692 vs smart 10 646 (176 %). The win-rate result was reproducible;
  the score margin was not. Fixed by the v1.1.1 scoring rework above.

### Input

- `keydown` now ignores `e.repeat` — holding Shift shifts exactly once.
- Alternate shift keys added: **Q**, **E** and **mouse right-click**.
- Title screen and first-run tutorial mention all shift keys; title screen warns that pressing
  Shift five times triggers Windows Sticky Keys and suggests Q / E / right-click.

### Progression

- XP curve `4 + 2×level` replaced with `round(6 + 3×level + 1.2×level^1.5)`.
  **Correction (v1.1.1):** this curve did **not** land an 8-minute skilled run in the 18–25 band —
  the repo simulation measured level 10.4. Fixed by the v1.1.1 survival-XP rework (measured 21.0).
- Level-up picks filter out maxed upgrades (fire rate, move speed, multishot, resonance) and
  MED KIT at full HP; if fewer than 3 options remain, MED KIT or a +50 score bonus fills the slot.

### Readability & mobile

- All in-canvas text now uses 8 px or multiples of 8 (Press Start 2P's design grid); copy was
  shortened and layouts re-spaced to fit.
- Mobile: pause button added at the top-right; the shift button now shows a cooldown progress ring.

### Testing

- New `tests/` directory, pure Node (no test framework): `tests/unit.mjs` (32 assertions covering
  the dual-plane damage rules, shift cooldown, PERFECT gating, pushback, upgrade filtering,
  alternate keys, `e.repeat`) and `tests/sim.mjs` (three strategies — never / spam / surrounded-only
  — × 5 seeded runs each).
- `npm test` runs both. Since v1.1.1 it also asserts: smart avg level within 18–25, min winning
  score > max non-winning score, and smart winning all 5 runs.

### Misc

- Author name replaced with the `AUTHOR_NAME` placeholder in README / LICENSE / itch page.

## v1.0.0 — 2026-11-07

Initial Game Off 2026 submission: dual-plane (DAY/NIGHT) survivor shooter, 3 enemy types,
Eclipse Lord boss at 8:00, 8-upgrade level picks, world shift every 60 s, Web Audio synth SFX
and DAY/NIGHT music loops, desktop + touch controls, local top-5, itch.io packaging.
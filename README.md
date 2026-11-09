<!-- TODO: replace AUTHOR_NAME with the real author name before publishing (README / LICENSE / itch page). -->

# SHIFT SURVIVOR

A dual-world survivor shooter made for **GitHub Game Off 2026** — theme: **SHIFT**.

Two worlds overlap: a bright **DAY** plane and a dark **NIGHT** plane. So do the monsters.
Press `Shift` to phase between planes, dodge what you cannot fight, and shoot only what shares
your world. Survive 8 minutes and the Eclipse Lord will find you.

- Play in the browser (Canvas 2D, no engine, no assets)
- 960×540, works at 60 FPS with 300+ enemies
- Keyboard + mouse on desktop, virtual stick + shift button on mobile

---

## Gameplay

- **Two planes.** Every enemy belongs either to DAY or NIGHT. Bullets only damage enemies on the
  same plane as the shot, and only same-plane enemies can hurt you. Enemies on the other plane are
  drawn at 30% opacity and phase straight through you.
- **Shifting.** `Shift` / `Q` / `E` / right-click swaps your plane instantly. Base cooldown is
  **0.6 s**; the whole screen palette hard-switches in a `steps()`-style cut with a short glitch
  pass. Shifting grants only 0.12 s of invulnerability — always shorter than the cooldown — and
  enemies overlapping you are pushed out ~12 px so a shift into a crowd isn't an instant hit.
- **PERFECT SHIFT.** If a same-plane enemy is within contact range (`r_enemy + r_player + 6 px`)
  and at least 1.2 s have passed since your last shift, you get a **PERFECT SHIFT**: +100 score and
  2.5 s of doubled fire rate, followed by a forced 1.5 s shift cooldown. The intended loop is to
  bait a hit, then phase out at the last possible moment — mashing the key earns nothing.
- **World Shift.** Every 60 s a 3-second countdown warns that **all enemies swap planes** at once.
- **Levels.** Surviving (+1 XP/s) and kills (+0.5/+0.5/+1.5 XP) grant XP; every level pauses the
  action for a 3-card upgrade pick. Levels 1–18 come at a steady pace, after that each level costs
  1.8× the previous one. Two upgrades are shift-specific: **PHASE WAVE** (shockwave on every shift)
  and **RESONANCE** (shorter shift cooldown).
- **Boss.** At **8:00** the Eclipse Lord spawns. It flips its own plane every 4.5 s (with a blink
  telegraph) and is invulnerable while on the other side. Kill it to win.

## Controls

| Action | Desktop | Mobile |
| --- | --- | --- |
| Move | `WASD` / arrow keys | left virtual stick |
| Aim | mouse | auto-aim |
| Fire | hold left mouse / `Space` | auto-fire |
| Shift plane | `Shift` / `Q` / `E` / right-click | big button, bottom-right |
| Pause | `P` / `Esc` | top-right button |
| Fullscreen | `F` or title button | title button |

Held keys are ignored (`e.repeat`), so holding Shift shifts exactly once.
Windows tip: pressing `Shift` five times in a row triggers Sticky Keys — use `Q` / `E` /
right-click if that gets in your way.

The window auto-pauses when the tab loses focus. The canvas keeps 16:9 and fills the window
(`image-rendering: pixelated`).

## How to run

```bash
npm install
npm run dev        # local dev server
npm run build      # production build -> dist/
npm run preview    # preview the production build
npm test           # headless unit tests + 3-strategy balance simulation
npm run package    # build + zip dist into shift-survivor-itch.zip
```

The itch.io upload is `shift-survivor-itch.zip`: `index.html` sits at the archive root and every
path inside is relative, so it works as a plain HTML5 upload. Recommended embed size: **960×540**,
fullscreen enabled.

### Dev-only hotkeys

- **F9** freezes the current frame and hides the HUD — useful for capturing the store/cover shot.
  Only compiled into dev builds (`import.meta.env.DEV`).

## Theme interpretation — SHIFT

`Shift` is used four ways:

1. **Input** — the Shift key literally moves the player between worlds.
2. **Space** — two planes occupy the same coordinates; what is solid in one is a ghost in the other.
3. **Perception** — the palette flips hard between warm DAY and cold NIGHT, changing how the same
   arena reads.
4. **Pressure** — every 60 s the world itself shifts under your feet, forcing you to re-read which
   enemies suddenly became lethal.

The mechanic is not a gimmick bolted on top: threat, damage, aiming, dodging and scoring all route
through which side of the shift you are on.

## Code reuse disclosure

This project is an independent Vite + vanilla JS + Canvas codebase with no Vue and no external
art/audio assets. Parts were adapted from the author's earlier **pixel-vue-blog** project
(`src/game/engine.js`, `src/lib/sprites.js`, `src/lib/sfx.js`):

- `src/sfx.js` — the Web Audio oscillator/noise `blip()` helper and basic shoot/hit/hurt/boom/level
  sounds are adapted from `pixel-vue-blog/src/lib/sfx.js`. Shift-specific sounds are new.
- `src/sprites.js` — the character-map sprite idea, `drawSprite`-style palette mapping, and a few
  sprite maps (`heart`, `sword`, `potion`, `gem`, `star`, `bullet`, `crosshair`) are adapted from
  `pixel-vue-blog/src/lib/sprites.js`. The player/enemy/boss/icon sprites for this game are new, and
  sprites are now pre-rendered and cached per plane instead of being drawn pixel-by-pixel each frame.
- `src/engine.js` — the overall game loop shape, pixel-coordinate camera, spawn/bullet/particle
  loops and the upgrade-pick pattern started from `pixel-vue-blog/src/game/engine.js`. The dual-plane
  system, PERFECT SHIFT, world shift event, boss, HUD/screens, scoring and input model are new.

The core mechanic (two overlapping planes with per-plane damage) is new to this project.

## AI-assisted development

This game was built with AI assistance (model-assisted coding and review) under human direction.
All gameplay rules, tuning decisions, art direction and the final code were reviewed and accepted by
the developer. No third-party code, art, audio or fonts other than the items credited below are
included.

## Credits

- Game, code, pixel art, sound design: AUTHOR_NAME
- Font: **Press Start 2P** by CodeMan38 / The Press Start 2P Project Authors — SIL Open Font
  License 1.1. License text: [`public/fonts/OFL-LICENSE.txt`](public/fonts/OFL-LICENSE.txt).
  The font is bundled locally (`public/fonts/PressStart2P.ttf`); no web font CDN is used.
- Game jam: GitHub Game Off 2026.

## Technical notes

- Internal resolution **480×270**, upscaled by CSS with `image-rendering: pixelated`.
- All sprites are character maps rendered once into per-plane offscreen canvases and blitted with
  `drawImage` — no per-pixel fillRect in the hot loop.
- All audio is synthesised at runtime with Web Audio (square/triangle/saw oscillators + noise);
  the DAY/NIGHT loops share one 16th-note clock so switching melody never breaks the beat.
- No images, no audio files, no external fonts loaded from the network.
- Settings (`sound`, `flash reduce`, tutorial seen, top-5 scores) live in `localStorage`; all
  storage access is wrapped in try/catch so private-mode embeds still work.

## Tuning table

All gameplay numbers live in `TUNING` at the top of `src/engine.js`.

| Player | Value |
| --- | --- |
| Radius | 7 |
| HP | 100 |
| Move speed | 80 px/s (+8% per SWIFT BOOTS, cap 140) |
| Fire interval | 0.15 s (×0.85 per RAPID FIRE, floor 0.06) |
| Bullet damage | 1 (+1 per HEAVY ROUNDS) |
| Bullets per shot | 1 (+1 per MULTISHOT, cap 5) |
| Bullet speed / life | 250 px/s / 1.1 s |
| Shift cooldown | 0.6 s (−0.12 s per RESONANCE, floor **0.35**) |
| Perfect window | enemy within `r_enemy + 7 + 6` px **and** ≥ 1.2 s since the last shift |
| Perfect reward | +100 score, 2.5 s fire interval ×0.5, then a forced 1.5 s shift cooldown |
| Shift i-frames | 0.12 s (always shorter than the shortest possible cooldown) |
| Shift pushback | same-plane enemies overlapping the player are pushed out ~12 px |

| Enemy | Radius | HP | Speed | Contact dmg | Score | XP | Unlock |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Crawler | 6 | 3 | 28 | 11 | 2 | 0.5 | 0 s |
| Wasp | 5 | 2 | 44 | 8 | 2 | 0.5 | 40 s, 30% roll |
| Brute | 8 | 10 | 22 | 18 | 8 | 1.5 | 90 s, 12% roll |

HP scale: `1 + floor(elapsed/30)×1.2 + (level−1)×0.08` (v1.1.1: 2.4× growth (0.5 → 1.2 per 30 s) — late-game
enemies out-level any DPS build, so clearing the swarm is never a valid survival plan).
Speed scale: `1 + min(0.8, elapsed×0.006)`.

| Score (v1.1.1) | Value |
| --- | --- |
| Survival | +10 per second alive — the main score source |
| Kills | 2 / 2 / 8 (crawler / wasp / brute) |
| PERFECT SHIFT | +100 |
| Boss kill | +4000 |
| Victory | +2000 |

| XP (v1.1.1) | Value |
| --- | --- |
| Survival | +1 per second alive — the main XP source |
| Kills | 0.5 / 0.5 / 1.5 (crawler / wasp / brute) |
| nextXp(level) | `round(18 + 0.8×level)` up to level 18, then ×1.8 per level |

The flat-then-exponential curve plus survival-driven XP means living longer is how you level,
and the level-19+ wall caps the kill→DPS snowball for every strategy.

| Spawning | Value |
| --- | --- |
| Interval | `max(0.22, 1.05 − elapsed×0.012 − (level−1)×0.02)` s |
| Batch | `min(1 + floor(elapsed/30) + floor(level/3), 6)` |
| Cap | 300 enemies |
| Boss period | interval ×2 |

| Upgrades | Effect |
| --- | --- |
| RAPID FIRE | fire interval ×0.85 |
| HEAVY ROUNDS | damage +1 |
| MED KIT | +30 HP |
| ARMOR UP | max HP +20 (and heal 20) |
| SWIFT BOOTS | speed ×1.08 (cap 140) |
| MULTISHOT | +1 bullet (cap 5) |
| PHASE WAVE | shift shockwave: damage `6 + 4×Lv`, radius `34 + 4×Lv` px |
| RESONANCE | shift cooldown −0.12 s (floor 0.35) |

Maxed-out upgrades (rate / speed / multishot / resonance) and MED KIT at full HP are filtered out
of the level-up pick; if fewer than 3 options remain, MED KIT or a +50 score bonus fills the slot.

| Events | Value |
| --- | --- |
| World shift | every 60 s, 3 s warning, all enemies flip plane |
| Boss spawn | 480 s |
| Boss | 400 HP, r=16, speed 26, dmg 25, 4000 score, flips plane every 4.5 s |
| Victory bonus | +2000 score |

## License

MIT — see [`LICENSE`](LICENSE). The bundled font is licensed under SIL OFL 1.1 — see
[`public/fonts/OFL-LICENSE.txt`](public/fonts/OFL-LICENSE.txt).
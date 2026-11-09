/**
 * 核心机制单测（纯 Node，无测试框架）。
 * 运行：node tests/unit.mjs
 */
import { TUNING, STATE } from '../src/engine.js'
import { freshGame, makeEnemy, check, summary, seedRandom } from './harness.mjs'

const restore = seedRandom(12345)
const step = (g, n, dt = 1 / 60) => {
  for (let i = 0; i < n; i++) g._update(dt)
}

console.log('SHIFT SURVIVOR unit tests\n')

/* 1. 同面子弹命中 */
{
  const g = freshGame()
  g.mouse.active = true
  g.mouse.down = true
  g.mouse.x = 240 + 40
  g.mouse.y = 135
  const e = makeEnemy(g, { plane: 0 })
  g.enemies.push(e)
  step(g, 20)
  check('same-plane bullet damages enemy', e.hp < 3, `hp=${e.hp}`)
  g.destroy()
}

/* 2. 异面子弹不命中 */
{
  const g = freshGame()
  g.mouse.active = true
  g.mouse.down = true
  g.mouse.x = 240 + 40
  g.mouse.y = 135
  const e = makeEnemy(g, { plane: 1 })
  g.enemies.push(e)
  step(g, 20)
  check('other-plane bullet passes through', e.hp === 3, `hp=${e.hp}`)
  g.destroy()
}

/* 3. 异面敌人不伤害玩家 */
{
  const g = freshGame()
  g.enemies.push(makeEnemy(g, { plane: 1, x: g.player.x, y: g.player.y }))
  const before = g.player.hp
  step(g, 30)
  check('other-plane enemy cannot hurt player', g.player.hp === before, `hp=${g.player.hp}`)
  g.destroy()
}

/* 4. 同面敌人伤害玩家 */
{
  const g = freshGame()
  g.enemies.push(makeEnemy(g, { plane: 0, x: g.player.x, y: g.player.y }))
  const before = g.player.hp
  step(g, 5)
  check('same-plane enemy hurts player', g.player.hp < before, `hp=${g.player.hp}`)
  g.destroy()
}

/* 5. 切换 + 冷却阻挡 */
{
  const g = freshGame()
  g.planeCd = 0
  g.player.plane = 0
  g.tryShift()
  const first = { plane: g.player.plane, cd: g.planeCd, fx: g.shiftFx > 0 }
  g.tryShift()
  const blocked = g.player.plane === first.plane
  step(g, 40)
  check('shift swaps plane', first.plane === 1)
  check('shift starts cooldown', first.cd > 0.5, `cd=${first.cd}`)
  check('shift glitch fx triggers', first.fx)
  check('shift blocked during cooldown', blocked)
  check('cooldown expires', g.planeCd <= 0, `cd=${g.planeCd}`)
  g.destroy()
}

/* 6. PERFECT SHIFT 判定与奖励 */
{
  const g = freshGame()
  g.player.plane = 0
  g.planeCd = 0
  g.lastShiftAt = -999
  g.perfects = 0
  g.score = 0
  g.enemies.push(makeEnemy(g, { plane: 0, x: g.player.x + 14, y: g.player.y }))
  g.tryShift()
  check('perfect shift counted', g.perfects === 1, `perfects=${g.perfects}`)
  check('perfect shift scores +100', g.score === 100, `score=${g.score}`)
  check('perfect shift boosts fire rate', Math.abs(g.perfectBoost - TUNING.shift.boostTime) < 1e-6)
  check('perfect shift forces long cooldown', g.planeCd >= TUNING.shift.perfectExtraCd, `cd=${g.planeCd}`)
  g.destroy()
}

/* 7. 冲击波强化清场 */
{
  const g = freshGame()
  g.player.plane = 0
  g.planeCd = 0
  g.shockLv = 1
  g.enemies.push(makeEnemy(g, { plane: 1, x: g.player.x + 10, y: g.player.y }))
  g.tryShift()
  step(g, 10)
  check('phase wave damages enemies', g.enemies.length === 0, `left=${g.enemies.length}`)
  check('phase wave spawned ring', g.waves.length === 1, `waves=${g.waves.length}`)
  g.destroy()
}

/* 8. 60 秒强制世界切换 */
{
  const g = freshGame()
  g.enemies.push(makeEnemy(g, { plane: 0, x: 600, y: 600 }))
  g.enemies.push(makeEnemy(g, { plane: 1, x: 620, y: 600 }))
  g.elapsed = 59.5
  const before = g.enemies.map((e) => e.plane)
  step(g, 40)
  const after = g.enemies.map((e) => e.plane)
  check('forced world shift flips all enemies', before[0] !== after[0] && before[1] !== after[1], `${before} -> ${after}`)
  check('forced shift schedules next at +60s', g.forcedNext === 120, `next=${g.forcedNext}`)
  g.destroy()
}

/* 9. v1.1：连按不能刷 PERFECT（1.2 秒门槛） */
{
  const g = freshGame()
  g.player.plane = 0
  g.planeCd = 0
  g.elapsed = 5
  g.lastShiftAt = 4.5 // 0.5s 前刚切换过
  g.perfects = 0
  g.enemies.push(makeEnemy(g, { plane: 0, x: g.player.x + 14, y: g.player.y }))
  g.tryShift()
  check('perfect gated by 1.2s since last shift', g.perfects === 0, `perfects=${g.perfects}`)
  g.destroy()
}

/* 10. v1.1：无敌时间短于最短冷却 */
check(
  'shift invuln shorter than min cooldown',
  TUNING.shift.invuln < TUNING.shift.cdMin,
  `invuln=${TUNING.shift.invuln} cdMin=${TUNING.shift.cdMin}`
)
check('resonance floor raised to 0.35s', TUNING.shift.cdMin >= 0.35, `cdMin=${TUNING.shift.cdMin}`)

/* 11. v1.1：切换时推开重叠敌人 */
{
  const g = freshGame()
  g.player.plane = 0
  g.planeCd = 0
  const e = makeEnemy(g, { plane: 0, x: g.player.x + 3, y: g.player.y })
  g.enemies.push(e)
  const before = Math.hypot(e.x - g.player.x, e.y - g.player.y)
  g.tryShift()
  const after = Math.hypot(e.x - g.player.x, e.y - g.player.y)
  check('overlapping enemies pushed out on shift', after - before > 8, `${before.toFixed(1)} -> ${after.toFixed(1)}`)
  g.destroy()
}

/* 12. v1.1：升级过滤已满强化 + 满血不出 MED KIT */
{
  const g = freshGame()
  const p = g.player
  p.fireCdBase = 0.06
  p.speed = 140
  p.bulletCount = 5
  p.shiftCd = TUNING.shift.cdMin
  p.hp = p.maxHp
  let bad = 0
  for (let i = 0; i < 200; i++) {
    const keys = g._pickThree().map((u) => u.key)
    if (keys.includes('rate') || keys.includes('speed') || keys.includes('multi') || keys.includes('cd') || keys.includes('heal')) bad++
  }
  check('maxed upgrades filtered from picks', bad === 0, `bad picks=${bad}`)
  g.destroy()
}

/* 13. v1.1：e.repeat 被忽略（按住只切一次） */
{
  const g = freshGame()
  g.planeCd = 0
  const fake = { key: 'Shift', repeat: true, preventDefault() {} }
  const before = g.player.plane
  g._onKeyDown(fake)
  check('keydown repeat ignored for shift', g.player.plane === before)
  g._onKeyDown({ key: 'Shift', repeat: false, preventDefault() {} })
  check('shift works on first keydown', g.player.plane !== before)
  g.destroy()
}

/* 14. v1.1：Q / E / 鼠标右键备用切换 */
{
  const g = freshGame()
  g.planeCd = 0
  const a = g.player.plane
  g._onKeyDown({ key: 'q', repeat: false, preventDefault() {} })
  const viaQ = g.player.plane !== a
  g.planeCd = 0
  const b = g.player.plane
  g._onKeyDown({ key: 'E', repeat: false, preventDefault() {} })
  const viaE = g.player.plane !== b
  g.planeCd = 0
  const c = g.player.plane
  g._onPointerDown({
    pointerType: 'mouse',
    button: 2,
    clientX: 240,
    clientY: 135,
    preventDefault() {}
  })
  const viaRmb = g.player.plane !== c
  check('Q shifts world', viaQ)
  check('E shifts world', viaE)
  check('right mouse shifts world', viaRmb)
  g.destroy()
}

/* 15. v1.1：满血补位不会出现 MED KIT */
{
  const g = freshGame()
  const p = g.player
  p.hp = p.maxHp
  p.fireCdBase = 0.06
  p.speed = 140
  p.bulletCount = 5
  p.shiftCd = TUNING.shift.cdMin
  const picks = g._pickThree()
  check('full HP never offers med kit', !picks.some((u) => u.key === 'heal'))
  check('always offers three choices', picks.length === 3)
  g.destroy()
}

/* 16. 状态机：升级暂停 */
{
  const g = freshGame()
  g.xp = g.nextXp
  g._checkLevel()
  check('level up enters upgrade state', g.state === STATE.upgrade)
  check('three upgrade choices offered', g.upgradeChoices.length === 3)
  g.chooseUpgrade(g.upgradeChoices[0].key)
  check('choosing upgrade resumes game', g.state === STATE.running)
  g.destroy()
}

restore()
summary('unit')
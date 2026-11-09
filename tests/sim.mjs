/**
 * 平衡性模拟：三种玩法策略各跑 5 局（固定种子），输出对比数据。
 * 运行：node tests/sim.mjs
 *
 * 断言（v1.1.0 要求）：无脑连切的平均得分不得高于「被包围才切」。
 */
import { TUNING } from '../src/engine.js'
import { makeGame, seedRandom } from './harness.mjs'

const RUNS = 5
const SEEDS = [1001, 1002, 1003, 1004, 1005]
const MAX_SECONDS = 660 // 11 分钟上限（Boss 在 8 分钟出场）

/* 升级选择策略：三种玩法共用，保证公平 */
function pickUpgrade(g) {
  const choices = g.upgradeChoices
  if (!choices.length) return
  const p = g.player
  const order =
    p.hp < p.maxHp * 0.45 && choices.some((u) => u.key === 'heal')
      ? ['heal', 'multi', 'dmg', 'rate', 'maxhp', 'cd', 'shock', 'speed', 'score']
      : ['multi', 'dmg', 'rate', 'maxhp', 'cd', 'shock', 'speed', 'heal', 'score']
  for (const key of order) {
    const found = choices.find((u) => u.key === key)
    if (found) {
      g.chooseUpgrade(found.key)
      return
    }
  }
  g.chooseUpgrade(choices[0].key)
}

/* 走位：绕圈风筝，保持火力射程内（约 60–170px），贴脸时后撤 */
function moveBot(g) {
  const p = g.player
  let nearest = null
  let nd = Infinity
  for (const e of g.enemies) {
    if (e.plane !== p.plane) continue
    const d = Math.hypot(e.x - p.x, e.y - p.y)
    if (d < nd) {
      nd = d
      nearest = e
    }
  }

  let mx = 0
  let my = 0
  if (!nearest) {
    mx = Math.cos(g.elapsed)
    my = Math.sin(g.elapsed)
  } else if (nd > 170) {
    mx = nearest.x - p.x
    my = nearest.y - p.y
  } else if (nd < 55) {
    mx = p.x - nearest.x
    my = p.y - nearest.y
  } else {
    // 切向绕圈 + 轻微外拉
    const dx = p.x - nearest.x
    const dy = p.y - nearest.y
    const d = nd || 1
    mx = -dy / d + (dx / d) * 0.25
    my = dx / d + (dy / d) * 0.25
  }

  // 极近敌人额外斥力，避免贴脸
  for (const e of g.enemies) {
    if (e.plane !== p.plane) continue
    const dx = p.x - e.x
    const dy = p.y - e.y
    const d = Math.hypot(dx, dy) || 1
    if (d < 34) {
      mx += (dx / d) * 1.2
      my += (dy / d) * 1.2
    }
  }

  const len = Math.hypot(mx, my) || 1
  g.joy.active = true
  g.joy.x = mx / len
  g.joy.y = my / len
}

/* 「被包围才切」：同面近身敌人 ≥2，或最近敌人已进入 PERFECT 距离 */
function surrounded(g) {
  const p = g.player
  let close = 0
  let nearest = Infinity
  for (const e of g.enemies) {
    if (e.plane !== p.plane) continue
    const d = Math.hypot(e.x - p.x, e.y - p.y)
    if (d < 46) close++
    if (d < nearest) nearest = d
  }
  return close >= 2 || nearest < 22
}

function play(seed, strategy) {
  const restore = seedRandom(seed)
  const g = makeGame()
  g.start()
  g.touchMode = true
  g.autoPause = false
  g.joy.active = true

  const maxFrames = MAX_SECONDS * 60
  let frames = 0
  let hits = 0
  let lastHp = g.player.hp

  while (frames < maxFrames && g.state !== 'over') {
    if (g.state === 'upgrade') {
      pickUpgrade(g)
      continue
    }
    moveBot(g)

    if (g.state === 'running' && g.planeCd <= 0) {
      if (strategy === 'spam') {
        g.tryShift()
      } else if (strategy === 'smart' && surrounded(g)) {
        g.tryShift()
      }
    }

    const hpBefore = g.player.hp
    g._update(1 / 60)
    if (g.player.hp < hpBefore) hits++
    lastHp = g.player.hp
    frames++

    // 防止升级期间死循环（选完仍是 upgrade 才会继续）
    if (frames > maxFrames) break
  }

  const result = {
    strategy,
    seed,
    score: Math.round(g.score),
    time: g.state === 'over' ? Math.round(g.elapsed) : MAX_SECONDS,
    win: !!g.win,
    level: g.level,
    perfects: g.perfects,
    hits,
    dead: g.state === 'over' && !g.win
  }
  g.destroy()
  restore()
  return result
}

function avg(list, key) {
  return list.reduce((s, r) => s + r[key], 0) / list.length
}

const strategies = ['never', 'spam', 'smart']
const data = {}

for (const name of strategies) {
  const runs = []
  for (const seed of SEEDS) runs.push(play(seed, name))
  data[name] = runs
}

console.log('\nSHIFT SURVIVOR balance simulation')
console.log(`runs per strategy: ${RUNS}, seeds: ${SEEDS.join(', ')}\n`)

for (const name of strategies) {
  console.log(`[${name}]`)
  for (const r of data[name]) {
    console.log(
      `  seed ${r.seed}: score ${String(r.score).padEnd(6)} time ${String(r.time).padStart(3)}s  ` +
        `win ${r.win ? 'yes' : 'no '}  level ${String(r.level).padStart(2)}  perfects ${String(r.perfects).padStart(3)}  hits ${r.hits}`
    )
  }
  const wins = data[name].filter((r) => r.win).length
  console.log(
    `  AVG: score ${avg(data[name], 'score').toFixed(0)}  time ${avg(data[name], 'time').toFixed(0)}s  ` +
      `win ${((wins / RUNS) * 100).toFixed(0)}%  level ${avg(data[name], 'level').toFixed(1)}  perfects ${avg(data[name], 'perfects').toFixed(1)}\n`
  )
}

const spamAvg = avg(data.spam, 'score')
const smartAvg = avg(data.smart, 'score')
const spamWin = data.spam.filter((r) => r.win).length
const smartWin = data.smart.filter((r) => r.win).length

console.log('--- comparison ---')
console.log(`spam  vs smart score: ${spamAvg.toFixed(0)} vs ${smartAvg.toFixed(0)} (${((spamAvg / smartAvg) * 100).toFixed(0)}%)`)
console.log(`spam  vs smart win rate: ${spamWin}/${RUNS} vs ${smartWin}/${RUNS}`)
console.log(`never avg survival: ${avg(data.never, 'time').toFixed(0)}s, avg level ${avg(data.never, 'level').toFixed(1)}`)
console.log(`smart avg level (target 18-25): ${avg(data.smart, 'level').toFixed(1)}`)

// 通关局 / 未通关局的得分边界
const allWinScores = [...data.never, ...data.spam, ...data.smart].filter((r) => r.win).map((r) => r.score)
const allLoseScores = [...data.never, ...data.spam, ...data.smart].filter((r) => !r.win).map((r) => r.score)
const minWinScore = allWinScores.length ? Math.min(...allWinScores) : Infinity
const maxLoseScore = allLoseScores.length ? Math.max(...allLoseScores) : -Infinity
console.log(`min winning score: ${minWinScore}, max non-winning score: ${maxLoseScore}`)

const smartLevel = avg(data.smart, 'level')

const scoreOk = spamAvg <= smartAvg
const winOk = spamWin <= smartWin
const levelOk = smartLevel >= 18 && smartLevel <= 25
const winDominatesOk = allWinScores.length > 0 && minWinScore > maxLoseScore
const smartAllWinOk = smartWin === RUNS

console.log(`\nASSERT spam avg score <= smart avg score: ${scoreOk ? 'PASS' : 'FAIL'}`)
console.log(`ASSERT spam win rate <= smart win rate: ${winOk ? 'PASS' : 'FAIL'}`)
console.log(`ASSERT smart avg level within 18-25: ${levelOk ? 'PASS' : 'FAIL'} (${smartLevel.toFixed(1)})`)
console.log(`ASSERT min winning score > max non-winning score: ${winDominatesOk ? 'PASS' : 'FAIL'} (${minWinScore} vs ${maxLoseScore})`)
console.log(`ASSERT smart wins all ${RUNS} runs: ${smartAllWinOk ? 'PASS' : 'FAIL'} (${smartWin}/${RUNS})`)

if (!scoreOk || !winOk || !levelOk || !winDominatesOk || !smartAllWinOk) process.exitCode = 1
/**
 * 测试用无头运行器：不依赖 DOM / Canvas / 浏览器。
 * 所有随机数用固定种子，保证模拟可复现。
 */
import { Game } from '../src/engine.js'

/** mulberry32 */
export function makeRng(seed) {
  let a = seed >>> 0
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 用固定种子接管 Math.random，返回恢复函数 */
export function seedRandom(seed) {
  const original = Math.random
  const rng = makeRng(seed)
  Math.random = rng
  return () => {
    Math.random = original
  }
}

function makeCanvas() {
  return {
    width: 480,
    height: 270,
    getContext: () => null,
    addEventListener() {},
    removeEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 })
  }
}

export function makeGame() {
  const game = new Game(makeCanvas(), { headless: true })
  game.autoPause = false
  return game
}

/** 开始一局并清空刷怪计时，便于摆放测试实体 */
export function freshGame() {
  const g = makeGame()
  g.start()
  g.spawnT = 1e9
  g.enemies.length = 0
  g.bullets.length = 0
  return g
}

export function makeEnemy(g, over = {}) {
  return {
    type: 'crawler',
    x: g.player.x + 40,
    y: g.player.y,
    r: 6,
    hp: 3,
    maxHp: 3,
    speed: 0,
    dmg: 11,
    score: 10,
    xp: 1,
    plane: g.player.plane,
    bob: 0,
    knock: null,
    ...over
  }
}

/** 简易断言（不引入测试框架） */
export const results = { pass: 0, fail: 0, failures: [] }

export function check(name, condition, detail = '') {
  if (condition) {
    results.pass++
    console.log(`  PASS  ${name}`)
  } else {
    results.fail++
    results.failures.push(name + (detail ? ` (${detail})` : ''))
    console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)
  }
}

export function summary(label) {
  console.log(`\n${label}: ${results.pass} passed, ${results.fail} failed`)
  if (results.fail > 0) {
    for (const f of results.failures) console.log('  - ' + f)
    process.exitCode = 1
  }
}
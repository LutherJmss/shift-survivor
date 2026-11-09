/**
 * SHIFT SURVIVOR —— 双世界切换幸存者射击引擎
 * 内部使用低分辨率像素坐标（480x270），外层 CSS 放大 + pixelated。
 * 核心机制：DAY / NIGHT 两个重叠的「面」，Shift 键瞬间切换；
 * 只有同面的敌人能互相伤害，异面敌人半透明、可穿过。
 */
import { getSprite, PLANE } from './sprites.js'
import {
  sfxShoot, sfxHit, sfxHurt, sfxBoom, sfxLevel, sfxOver,
  sfxShift, sfxPerfect, sfxWave, sfxAlarm, sfxTickHigh,
  sfxBoss, sfxWin, sfxClick, setSfxEnabled, ensureAudio
} from './sfx.js'
import { musicStart, musicStop, setMusicPlane } from './music.js'

const clamp = (n, a, b) => Math.min(b, Math.max(a, n))

export const STATE = {
  title: 'title',
  running: 'running',
  paused: 'paused',
  upgrade: 'upgrade',
  over: 'over'
}

/* ---------------- 数值表（调难度改这里） ---------------- */
export const TUNING = {
  player: { r: 7, hp: 100, speed: 80, fireCd: 0.15, dmg: 1, bullets: 1, bulletSpeed: 250, bulletLife: 1.1 },
  shift: {
    cd: 0.6,            // 切换基础冷却（秒）
    cdMin: 0.35,        // 强化后下限（高于无敌时间，杜绝无敌连按）
    cdStep: 0.12,       // 每次强化减少量
    perfectRadius: 6,   // 敌人贴身判定距离（半径增量）
    perfectMinGap: 1.2, // 距上次切换至少这么久才算 PERFECT
    perfectExtraCd: 1.5,// PERFECT 后强制冷却
    perfectScore: 100,  // PERFECT SHIFT 奖励分
    boostTime: 2.5,     // 射速加成时长
    boostMul: 0.5,      // 射速加成倍率（间隔 ×0.5）
    invuln: 0.12,       // 切换后短暂无敌（必须短于最短冷却）
    pushOut: 12         // 切换时把重叠的旧面敌人推开
  },
  xp: { base: 18, linear: 0.8, flatUntil: 18, ramp: 1.8 },
  xpPerSecond: 1, // 存活经验：经验主体挂在存活时长上，认真玩（活得久）升级更快
  score: { perSecond: 10 }, // 存活得分：得分的主体，奖励活下来而不是刷怪
  spawn: {
    baseInterval: 1.05, minInterval: 0.22,
    intervalPerSec: 0.012, // 每秒经过缩短多少
    batchTime: 30, batchLevel: 3, maxBatch: 6,
    cap: 300
  },
  enemies: {
    crawler: { r: 6, hp: 3, speed: 28, dmg: 11, score: 2, xp: 0.5, after: 0, chance: 1 },
    wasp: { r: 5, hp: 2, speed: 44, dmg: 8, score: 2, xp: 0.5, after: 40, chance: 0.3 },
    brute: { r: 8, hp: 10, speed: 22, dmg: 18, score: 8, xp: 1.5, after: 90, chance: 0.12 }
  },
  hpPer30: 1.2, // 每 30 秒敌人 HP 增幅（v1.1.1 上调，压制高等级连切的清场能力）
  hpScale: '1 + floor(elapsed/30)*hpPer30 + (level-1)*0.08',
  speedScale: '1 + min(0.8, elapsed*0.006)',
  forced: { every: 60, warn: 3 },   // 每 60 秒强制世界切换，提前 3 秒警告
  boss: { time: 480, hp: 400, r: 16, speed: 26, dmg: 25, score: 4000, shiftEvery: 4.5, telegraph: 1 },
  winBonus: 2000, // 通关奖励：得分应奖励达成目标，而非死前刷怪量
  upgrades: {
    rate: 0.85, dmg: 1, heal: 30, maxhp: 20, speedMul: 1.08, speedCap: 140,
    multiCap: 5, shockDmg: [6, 4], shockRadius: [34, 4] // 基础 + 每级增量
  }
}

const UPGRADE_POOL = [
  { key: 'rate', name: 'RAPID FIRE', desc: 'FIRE GAP -15%', icon: 'bolt' },
  { key: 'dmg', name: 'HEAVY ROUNDS', desc: 'DAMAGE +1', icon: 'sword' },
  { key: 'heal', name: 'MED KIT', desc: 'HEAL 30 HP', icon: 'potion' },
  { key: 'maxhp', name: 'ARMOR UP', desc: 'MAX HP +20', icon: 'heart' },
  { key: 'speed', name: 'SWIFT BOOTS', desc: 'SPEED +8%', icon: 'boot' },
  { key: 'multi', name: 'MULTISHOT', desc: '+1 BULLET', icon: 'gem' },
  { key: 'shock', name: 'PHASE WAVE', desc: 'SHIFT SHOCKWAVE', icon: 'wave' },
  { key: 'cd', name: 'RESONANCE', desc: 'SHIFT CD -0.12S', icon: 'clock' }
]

/* 可选强化不足 3 个时的补位项 */
const FILLER_HEAL = { key: 'heal', name: 'MED KIT', desc: 'HEAL 30 HP', icon: 'potion' }
const FILLER_SCORE = { key: 'score', name: 'BONUS', desc: '+50 SCORE', icon: 'star' }

/** 升到下一级所需经验（v1.1 曲线：8 分钟认真玩约 18–25 级） */
export function xpForLevel(level) {
  const T = TUNING.xp
  if (level <= T.flatUntil) {
    return Math.round(T.base + T.linear * level)
  }
  // 拐点之后指数式抬升：等级越高越难升，封住「刷怪→升级→清场」雪球
  const flat = T.base + T.linear * T.flatUntil
  return Math.round(flat * Math.pow(T.ramp, level - T.flatUntil))
}

/* ---------------- localStorage 安全封装 ---------------- */
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (err) {
    return fallback
  }
}
function saveJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val))
  } catch (err) {
    /* 隐私模式等场景下静默失败 */
  }
}

export class Game {
  constructor(canvas, opts = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext ? canvas.getContext('2d') : null
    this.opts = opts
    this.vw = canvas.width
    this.vh = canvas.height
    this.dev = !!opts.dev
    this.headless = !!opts.headless // 无 DOM 模拟（tests/ 使用）

    this.touchMode = false
    this.keys = new Set()
    this.mouse = { x: this.vw / 2, y: this.vh / 2, down: false, active: false }
    this.joy = { active: false, ox: 0, oy: 0, x: 0, y: 0 }
    this.buttons = []
    this.frozen = false // 开发模式 F9：冻结画面隐藏 HUD
    this.autoPause = true // 失焦自动暂停（自动化测试时可关闭）

    // 持久化设置
    this.soundOn = loadJSON('ss.sound', true)
    this.reducedFlash = loadJSON('ss.flash', false)
    setSfxEnabled(this.soundOn)

    this.state = STATE.title
    this.reset()

    this._loop = this._loop.bind(this)
    this._onKeyDown = this._onKeyDown.bind(this)
    this._onKeyUp = this._onKeyUp.bind(this)
    this._onPointerDown = this._onPointerDown.bind(this)
    this._onPointerMove = this._onPointerMove.bind(this)
    this._onPointerUp = this._onPointerUp.bind(this)
    this._onBlur = this._onBlur.bind(this)
    this._onVisibility = this._onVisibility.bind(this)

    if (!this.headless) {
      window.addEventListener('keydown', this._onKeyDown)
      window.addEventListener('keyup', this._onKeyUp)
      canvas.addEventListener('pointerdown', this._onPointerDown)
      canvas.addEventListener('pointermove', this._onPointerMove)
      window.addEventListener('pointerup', this._onPointerUp)
      window.addEventListener('blur', this._onBlur)
      document.addEventListener('visibilitychange', this._onVisibility)

      this._raf = requestAnimationFrame(this._loop)
    } else {
      this._raf = 0
    }
    this._last = performance.now()
  }

  /** 无 DOM 环境下手动推进一步（tests/ 使用） */
  tick(dt = 1 / 60) {
    if (this.state === STATE.running) this._update(dt)
  }

  destroy() {
    if (this.headless) return
    cancelAnimationFrame(this._raf)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    this.canvas.removeEventListener('pointerdown', this._onPointerDown)
    this.canvas.removeEventListener('pointermove', this._onPointerMove)
    window.removeEventListener('pointerup', this._onPointerUp)
    window.removeEventListener('blur', this._onBlur)
    document.removeEventListener('visibilitychange', this._onVisibility)
    musicStop()
  }

  /* ---------------- 生命周期 ---------------- */

  reset() {
    this.elapsed = 0
    this.score = 0
    this.level = 1
    this.xp = 0
    this.nextXp = xpForLevel(1)
    this.upgradeChoices = []
    this.player = {
      x: 0, y: 0, r: TUNING.player.r,
      hp: TUNING.player.hp, maxHp: TUNING.player.hp,
      speed: TUNING.player.speed,
      invuln: 0, fireCd: 0,
      fireCdBase: TUNING.player.fireCd,
      dmg: TUNING.player.dmg,
      bulletCount: TUNING.player.bullets,
      plane: PLANE.DAY,
      shiftCd: TUNING.shift.cd,
      bob: 0
    }
    this.planeCd = 0
    this.perfectBoost = 0
    this.perfects = 0
    this.lastShiftAt = -999 // 上次切换时间（PERFECT 门槛）
    this.shockLv = 0
    this.bullets = []
    this.enemies = []
    this.particles = []
    this.floaters = []
    this.waves = [] // 冲击波
    this.spawnT = 1.0
    this.shake = 0
    this.shiftFx = 0 // 切换特效计时
    this.flashT = 0 // 白闪
    this.aim = { x: 1, y: 0 }
    this.cam = { x: -this.vw / 2, y: -this.vh / 2 } // 玩家初始在世界原点，先对准
    this.forcedNext = TUNING.forced.every
    this.forcedWarned = -1
    this.boss = null
    this.bossSpawned = false
    this.win = false
    this.rankIndex = -1
    this.titleT = 0
    this.tutorialSeen = loadJSON('ss.tutorial', false)
    this._last = performance.now()
  }

  start() {
    this.reset()
    this.state = STATE.running
    ensureAudio()
    setSfxEnabled(this.soundOn)
    if (this.soundOn) musicStart()
    setMusicPlane(this.player.plane)
  }

  pause() {
    if (this.state === STATE.running) this.state = STATE.paused
  }

  resume() {
    if (this.state === STATE.paused) {
      this.state = STATE.running
      this._last = performance.now()
    }
  }

  quitToTitle() {
    this.state = STATE.title
    this.reset()
  }

  /* ---------------- 输入 ---------------- */

  _onKeyDown(e) {
    const k = e.key
    const kl = k.toLowerCase()
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(kl)) e.preventDefault()
    if (e.repeat) return // 按住 Shift / 移动键不重复触发

    if (this.dev && k === 'F9') {
      e.preventDefault()
      this.frozen = !this.frozen
      return
    }

    if (this.state === STATE.title) {
      if (k === 'Enter' || k === ' ') this.start()
      return
    }
    if (this.state === STATE.over) {
      if (k === 'Enter' || k === ' ') this.start()
      return
    }
    if (this.state === STATE.upgrade) {
      if (k === '1' || k === '2' || k === '3') {
        const idx = Number(k) - 1
        if (this.upgradeChoices[idx]) this.chooseUpgrade(this.upgradeChoices[idx].key)
      }
      return
    }
    if (kl === 'p' || k === 'Escape') {
      if (this.state === STATE.running) this.pause()
      else if (this.state === STATE.paused) this.resume()
      return
    }
    if (this.state !== STATE.running) return

    if (k === 'Shift' || kl === 'q' || kl === 'e') {
      this.tryShift()
      return
    }
    if (kl === 'f') {
      this.opts.toggleFullscreen && this.opts.toggleFullscreen()
      return
    }
    if (k === 'ArrowUp') this.keys.add('w')
    if (k === 'ArrowDown') this.keys.add('s')
    if (k === 'ArrowLeft') this.keys.add('a')
    if (k === 'ArrowRight') this.keys.add('d')
    if (kl === 'w') this.keys.add('w')
    if (kl === 's') this.keys.add('s')
    if (kl === 'a') this.keys.add('a')
    if (kl === 'd') this.keys.add('d')
    if (k === ' ') this.keys.add('fire')
  }

  _onKeyUp(e) {
    const k = e.key.toLowerCase()
    if (k === 'arrowup' || k === 'w') this.keys.delete('w')
    if (k === 'arrowdown' || k === 's') this.keys.delete('s')
    if (k === 'arrowleft' || k === 'a') this.keys.delete('a')
    if (k === 'arrowright' || k === 'd') this.keys.delete('d')
    if (k === ' ') this.keys.delete('fire')
  }

  _toLocal(e) {
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * this.vw,
      y: ((e.clientY - rect.top) / rect.height) * this.vh
    }
  }

  _onPointerDown(e) {
    const p = this._toLocal(e)
    e.preventDefault()
    if (e.pointerType === 'touch') this.touchMode = true
    // 触摸时捕获指针，手指滑出画布也能持续拖动摇杆
    if (e.pointerType === 'touch' && this.canvas.setPointerCapture) {
      try {
        this.canvas.setPointerCapture(e.pointerId)
      } catch (err) {
        /* 某些浏览器在非活动指针上会抛错，忽略 */
      }
    }

    // 先处理屏幕按钮（标题 / 暂停 / 升级 / 结束）
    for (const b of this.buttons) {
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        sfxClick()
        b.cb()
        return
      }
    }

    if (this.state === STATE.title) {
      this.start()
      return
    }
    if (this.state === STATE.over) {
      this.start()
      return
    }

    // 手机右上角暂停 / 继续
    if (this.touchMode && this._inPauseBtn(p)) {
      if (this.state === STATE.running) this.pause()
      else if (this.state === STATE.paused) this.resume()
      return
    }

    if (this.state !== STATE.running) return

    // 鼠标右键 = 备用切换键
    if (e.button === 2) {
      this.tryShift()
      return
    }

    if (e.pointerType === 'touch') {
      // 右下切换按钮
      if (this._inShiftBtn(p)) {
        this.tryShift()
        return
      }
      if (p.x < this.vw * 0.55) {
        this.joy.active = true
        this.joy.ox = p.x
        this.joy.oy = p.y
        this.joy.x = 0
        this.joy.y = 0
      }
    } else {
      this.mouse.active = true
      this.mouse.x = p.x
      this.mouse.y = p.y
      this.mouse.down = true
    }
  }

  _onPointerMove(e) {
    const p = this._toLocal(e)
    if (this.joy.active && e.pointerType === 'touch') {
      const dx = p.x - this.joy.ox
      const dy = p.y - this.joy.oy
      const len = Math.hypot(dx, dy)
      const cl = Math.min(len, 28) / 28
      const ang = Math.atan2(dy, dx)
      this.joy.x = Math.cos(ang) * cl
      this.joy.y = Math.sin(ang) * cl
    }
    if (e.pointerType !== 'touch') {
      this.mouse.x = p.x
      this.mouse.y = p.y
      this.mouse.active = true
    }
  }

  _onPointerUp(e) {
    if (this.joy.active && e.pointerType === 'touch') {
      this.joy.active = false
      this.joy.x = 0
      this.joy.y = 0
    }
    if (e.pointerType !== 'touch') this.mouse.down = false
  }

  _onBlur() {
    if (this.autoPause && this.state === STATE.running) this.state = STATE.paused
  }

  _onVisibility() {
    if (this.autoPause && document.hidden && this.state === STATE.running) this.state = STATE.paused
  }

  /* ---------------- 世界切换 ---------------- */

  tryShift() {
    if (this.state !== STATE.running || this.frozen) return
    const p = this.player
    if (this.planeCd > 0) return

    // PERFECT 判定：同面敌人即将贴身，且距上次切换足够久（防连按刷 PERFECT）
    let perfect = false
    if (this.elapsed - this.lastShiftAt >= TUNING.shift.perfectMinGap) {
      for (const e of this.enemies) {
        if (e.plane !== p.plane) continue
        if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r + TUNING.shift.perfectRadius) {
          perfect = true
          break
        }
      }
    }

    // 旧面上与玩家重叠的敌人：向四周推开，避免切面后立刻轮流挨打
    const overlaps = []
    for (const e of this.enemies) {
      if (e.plane !== p.plane) continue
      if (Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) overlaps.push(e)
    }
    for (const e of overlaps) {
      let dx = e.x - p.x
      let dy = e.y - p.y
      let len = Math.hypot(dx, dy)
      if (len < 0.001) {
        const a = Math.random() * Math.PI * 2
        dx = Math.cos(a)
        dy = Math.sin(a)
        len = 1
      }
      e.x += (dx / len) * TUNING.shift.pushOut
      e.y += (dy / len) * TUNING.shift.pushOut
    }

    p.plane = p.plane === PLANE.DAY ? PLANE.NIGHT : PLANE.DAY
    this.planeCd = p.shiftCd
    this.lastShiftAt = this.elapsed
    this.shiftFx = 0.18
    if (!this.reducedFlash) this.flashT = 0.06
    p.invuln = Math.max(p.invuln, TUNING.shift.invuln)
    setMusicPlane(p.plane)
    sfxShift()
    this.shake = this.reducedFlash ? 2 : 4

    // 冲击波强化
    if (this.shockLv > 0) {
      const radius = TUNING.upgrades.shockRadius[0] + TUNING.upgrades.shockRadius[1] * this.shockLv
      const dmg = TUNING.upgrades.shockDmg[0] + TUNING.upgrades.shockDmg[1] * this.shockLv
      this.waves.push({ x: p.x, y: p.y, r: 6, max: radius, dmg })
      sfxWave()
    }

    if (perfect) {
      this.perfects++
      this.score += TUNING.shift.perfectScore
      this.perfectBoost = TUNING.shift.boostTime
      // PERFECT 后强制进入较长冷却，堵死连按收益
      this.planeCd = Math.max(this.planeCd, TUNING.shift.perfectExtraCd)
      this.floaters.push({ x: p.x, y: p.y - 14, text: 'PERFECT!', life: 1.0, color: '#ffd23f' })
      sfxPerfect()
    }
  }

  _forceShift() {
    for (const e of this.enemies) {
      e.plane = e.plane === PLANE.DAY ? PLANE.NIGHT : PLANE.DAY
    }
    if (this.boss) {
      this.boss.plane = this.boss.plane === PLANE.DAY ? PLANE.NIGHT : PLANE.DAY
      this.boss.shiftT = TUNING.boss.shiftEvery
    }
    this.shiftFx = this.reducedFlash ? 0 : 0.18
    if (!this.reducedFlash) this.flashT = 0.06
  }

  /* ---------------- 升级 ---------------- */

  _checkLevel() {
    while (this.xp >= this.nextXp) {
      this.xp -= this.nextXp
      this.level += 1
      this.nextXp = xpForLevel(this.level)
      this.upgradeChoices = this._pickThree()
      this.state = STATE.upgrade
      sfxLevel()
      break // 一次只弹一次三选一
    }
  }

  _pickThree() {
    const p = this.player
    const T = TUNING.upgrades
    // 过滤掉已到上限 / 当前无意义的强化
    const available = UPGRADE_POOL.filter((u) => {
      switch (u.key) {
        case 'rate':
          return p.fireCdBase > 0.061
        case 'speed':
          return p.speed < T.speedCap - 0.01
        case 'multi':
          return p.bulletCount < T.multiCap
        case 'cd':
          return p.shiftCd > TUNING.shift.cdMin + 0.001
        case 'heal':
          return p.hp < p.maxHp // 满血不出 MED KIT
        default:
          return true
      }
    })
    const pool = available.slice()
    const out = []
    while (out.length < 3 && pool.length) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
    }
    // 可选不足 3 个：补 MED KIT（未满血）或 +50 分
    while (out.length < 3) {
      out.push(this.player.hp < this.player.maxHp ? FILLER_HEAL : FILLER_SCORE)
    }
    return out
  }

  chooseUpgrade(key) {
    if (this.state !== STATE.upgrade) return
    const p = this.player
    const T = TUNING.upgrades
    switch (key) {
      case 'rate':
        p.fireCdBase = Math.max(0.06, p.fireCdBase * T.rate)
        break
      case 'dmg':
        p.dmg += T.dmg
        break
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + T.heal)
        break
      case 'maxhp':
        p.maxHp += T.maxhp
        p.hp += T.maxhp
        break
      case 'speed':
        p.speed = Math.min(T.speedCap, p.speed * T.speedMul)
        break
      case 'multi':
        p.bulletCount = Math.min(T.multiCap, p.bulletCount + 1)
        break
      case 'shock':
        this.shockLv += 1
        break
      case 'cd':
        p.shiftCd = Math.max(TUNING.shift.cdMin, p.shiftCd - TUNING.shift.cdStep)
        break
      case 'score':
        this.score += 50
        break
    }
    this.upgradeChoices = []
    this.state = STATE.running
    p.invuln = Math.max(p.invuln, 1.2)
    this._last = performance.now()
  }

  /* ---------------- 主循环 ---------------- */

  _loop(now) {
    const dt = clamp((now - this._last) / 1000, 0, 0.05)
    this._last = now

    if (this.state === STATE.running && !this.frozen) this._update(dt)
    if (this.state === STATE.title) this.titleT += dt
    this._draw()
    this._raf = requestAnimationFrame(this._loop)
  }

  _update(dt) {
    const p = this.player
    this.elapsed += dt
    this.score += TUNING.score.perSecond * dt // 存活得分
    this.xp += TUNING.xpPerSecond * dt // 存活经验
    this._checkLevel()

    if (this.planeCd > 0) this.planeCd -= dt
    if (this.perfectBoost > 0) this.perfectBoost -= dt
    if (this.shiftFx > 0) this.shiftFx -= dt
    if (this.flashT > 0) this.flashT -= dt
    if (p.invuln > 0) p.invuln -= dt

    // --- 移动 ---
    let mx = 0
    let my = 0
    if (this.keys.has('a')) mx -= 1
    if (this.keys.has('d')) mx += 1
    if (this.keys.has('w')) my -= 1
    if (this.keys.has('s')) my += 1
    if (this.joy.active) {
      mx += this.joy.x
      my += this.joy.y
    }
    const ml = Math.hypot(mx, my)
    if (ml > 1) {
      mx /= ml
      my /= ml
    }
    p.x += mx * p.speed * dt
    p.y += my * p.speed * dt
    p.bob += dt * 6

    // --- 瞄准 ---
    if (this.touchMode || !this.mouse.active) {
      const target = this._nearestEnemy()
      if (target) {
        const dx = target.x - p.x
        const dy = target.y - p.y
        const len = Math.hypot(dx, dy) || 1
        this.aim.x = dx / len
        this.aim.y = dy / len
      }
    } else {
      const wx = this.cam.x + this.mouse.x
      const wy = this.cam.y + this.mouse.y
      const dx = wx - p.x
      const dy = wy - p.y
      const len = Math.hypot(dx, dy) || 1
      this.aim.x = dx / len
      this.aim.y = dy / len
    }

    // --- 射击 ---
    const firing = this.touchMode || this.mouse.down || this.keys.has('fire')
    p.fireCd -= dt
    if (firing && p.fireCd <= 0) {
      p.fireCd = this.perfectBoost > 0 ? p.fireCdBase * TUNING.shift.boostMul : p.fireCdBase
      this._fire()
    }

    // --- 刷怪 ---
    this.spawnT -= dt
    if (this.spawnT <= 0 && this.enemies.length < TUNING.spawn.cap) {
      const s = TUNING.spawn
      let interval = Math.max(s.minInterval, s.baseInterval - this.elapsed * s.intervalPerSec - (this.level - 1) * 0.02)
      if (this.boss) interval *= 2 // Boss 期降低小怪压力
      this.spawnT = interval
      const batch = Math.min(1 + Math.floor(this.elapsed / s.batchTime) + Math.floor(this.level / s.batchLevel), s.maxBatch)
      for (let i = 0; i < batch; i++) this._spawnEnemy()
    }

    // --- Boss ---
    if (!this.bossSpawned && this.elapsed >= TUNING.boss.time) {
      this.bossSpawned = true
      this._spawnBoss()
    }
    if (this.boss) this._updateBoss(this.boss, dt)

    // --- 强制世界切换 ---
    const forcedRemain = this.forcedNext - this.elapsed
    if (forcedRemain <= TUNING.forced.warn && forcedRemain > 0) {
      const sec = Math.ceil(forcedRemain)
      if (sec !== this.forcedWarned) {
        this.forcedWarned = sec
        sfxTickHigh()
      }
    }
    if (forcedRemain <= 0) {
      sfxAlarm()
      this._forceShift()
      this.forcedNext += TUNING.forced.every
      this.forcedWarned = -1
    }

    // --- 子弹 ---
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.life -= dt
      if (
        b.life <= 0 ||
        b.x < this.cam.x - 30 ||
        b.x > this.cam.x + this.vw + 30 ||
        b.y < this.cam.y - 30 ||
        b.y > this.cam.y + this.vh + 30
      ) {
        this.bullets.splice(i, 1)
        continue
      }
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j]
        if (e.plane !== b.plane) continue
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + 2) {
          e.hp -= b.dmg
          e.knock = { x: b.vx / 620, y: b.vy / 620, t: 0.08 }
          this._burst(b.x, b.y, '#ffd23f', 3)
          sfxHit()
          this.bullets.splice(i, 1)
          if (e.hp <= 0) this._kill(j)
          b.consumed = true
          break
        }
      }
      // 子弹打 Boss
      const boss = this.boss
      if (!b.consumed && boss && boss.plane === b.plane) {
        if (Math.hypot(b.x - boss.x, b.y - boss.y) < boss.r + 2) {
          boss.hp -= b.dmg
          this._burst(b.x, b.y, '#ffd23f', 3)
          sfxHit()
          this.bullets.splice(i, 1)
          if (boss.hp <= 0) this._winGame()
        }
      }
    }

    // --- 敌人 ---
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i]
      const dx = p.x - e.x
      const dy = p.y - e.y
      const len = Math.hypot(dx, dy) || 1
      let vx = (dx / len) * e.speed
      let vy = (dy / len) * e.speed
      if (e.knock && e.knock.t > 0) {
        vx += e.knock.x * 220
        vy += e.knock.y * 220
        e.knock.t -= dt
      }
      e.x += vx * dt
      e.y += vy * dt
      e.bob += dt * 8

      if (e.plane === p.plane && Math.hypot(e.x - p.x, e.y - p.y) < e.r + p.r) {
        if (p.invuln <= 0) {
          p.hp -= e.dmg
          p.invuln = 0.9
          this.shake = 6
          this._burst(p.x, p.y, '#ff4b4b', 8)
          sfxHurt()
          if (p.hp <= 0) {
            p.hp = 0
            this._gameOver()
            return
          }
        }
      }
    }

    // --- Boss 接触伤害 ---
    const boss = this.boss
    if (boss && boss.plane === p.plane && p.invuln <= 0) {
      if (Math.hypot(boss.x - p.x, boss.y - p.y) < boss.r + p.r) {
        p.hp -= boss.dmg
        p.invuln = 0.9
        this.shake = 8
        this._burst(p.x, p.y, '#ff4b4b', 10)
        sfxHurt()
        if (p.hp <= 0) {
          p.hp = 0
          this._gameOver()
          return
        }
      }
    }

    // --- 冲击波 ---
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i]
      const prev = w.r
      w.r += 160 * dt
      // 对新扫到的同面敌人一次性结算伤害
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j]
        if (e.plane !== p.plane) continue
        const d = Math.hypot(e.x - w.x, e.y - w.y)
        if (d < w.r && d >= prev - 1) {
          e.hp -= w.dmg
          e.knock = { x: (e.x - w.x) / (d || 1), y: (e.y - w.y) / (d || 1), t: 0.12 }
          if (e.hp <= 0) this._kill(j)
        }
      }
      if (w.r >= w.max) this.waves.splice(i, 1)
    }

    // --- 粒子 / 飘字 ---
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i]
      pt.x += pt.vx * dt
      pt.y += pt.vy * dt
      pt.life -= dt
      if (pt.life <= 0) this.particles.splice(i, 1)
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]
      f.y -= 14 * dt
      f.life -= dt
      if (f.life <= 0) this.floaters.splice(i, 1)
    }

    if (this.shake > 0) this.shake -= dt * 14

    this.cam.x = p.x - this.vw / 2
    this.cam.y = p.y - this.vh / 2
  }

  _fire() {
    const p = this.player
    const base = Math.atan2(this.aim.y, this.aim.x)
    const n = p.bulletCount
    const spread = 0.14
    for (let i = 0; i < n; i++) {
      const ang = base + (i - (n - 1) / 2) * spread
      this.bullets.push({
        x: p.x + Math.cos(ang) * (p.r + 3),
        y: p.y + Math.sin(ang) * (p.r + 3),
        vx: Math.cos(ang) * TUNING.player.bulletSpeed,
        vy: Math.sin(ang) * TUNING.player.bulletSpeed,
        life: TUNING.player.bulletLife,
        dmg: p.dmg,
        plane: p.plane
      })
    }
    sfxShoot()
  }

  _nearestEnemy() {
    let best = null
    let bd = Infinity
    const total = Math.min(this.enemies.length, 60)
    for (let i = this.enemies.length - 1; i >= this.enemies.length - total; i--) {
      if (i < 0) break
      const e = this.enemies[i]
      if (e.plane !== this.player.plane) continue
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y)
      if (d < bd) {
        bd = d
        best = e
      }
    }
    if (!best && this.boss && this.boss.plane === this.player.plane) return this.boss
    return best
  }

  _spawnEnemy() {
    // 沿视口矩形边缘外侧刷新，保证敌人很快能进画面
    const ang = Math.random() * Math.PI * 2
    const dx = Math.cos(ang)
    const dy = Math.sin(ang)
    const hw = this.vw / 2 + 18
    const hh = this.vh / 2 + 18
    const t = Math.min(hw / Math.max(0.0001, Math.abs(dx)), hh / Math.max(0.0001, Math.abs(dy)))
    const x = this.player.x + dx * t
    const y = this.player.y + dy * t

    let type = 'crawler'
    const roll = Math.random()
    if (this.elapsed > TUNING.enemies.wasp.after && roll < TUNING.enemies.wasp.chance) type = 'wasp'
    if (this.elapsed > TUNING.enemies.brute.after && roll < TUNING.enemies.brute.chance) type = 'brute'

    const def = TUNING.enemies[type]
    const hpScale = 1 + Math.floor(this.elapsed / 30) * TUNING.hpPer30 + (this.level - 1) * 0.08
    const spScale = 1 + Math.min(0.8, this.elapsed * 0.006)

    this.enemies.push({
      type,
      x,
      y,
      r: def.r,
      hp: Math.round(def.hp * hpScale),
      maxHp: Math.round(def.hp * hpScale),
      speed: def.speed * spScale,
      dmg: def.dmg,
      score: def.score,
      xp: def.xp,
      plane: Math.random() < 0.5 ? PLANE.DAY : PLANE.NIGHT,
      bob: Math.random() * 10,
      knock: null
    })
  }

  _spawnBoss() {
    const b = TUNING.boss
    const ang = Math.random() * Math.PI * 2
    this.boss = {
      x: this.player.x + Math.cos(ang) * 260,
      y: this.player.y + Math.sin(ang) * 260,
      r: b.r,
      hp: b.hp,
      maxHp: b.hp,
      speed: b.speed,
      dmg: b.dmg,
      plane: this.player.plane === PLANE.DAY ? PLANE.NIGHT : PLANE.DAY,
      shiftT: b.shiftEvery,
      bob: 0
    }
    sfxBoss()
    this.floaters.push({ x: this.player.x, y: this.player.y - 20, text: 'ECLIPSE LORD!', life: 2.0, color: '#ff4f9a' })
  }

  _updateBoss(b, dt) {
    const p = this.player
    // 自主切面
    b.shiftT -= dt
    if (b.shiftT <= 0) {
      b.plane = b.plane === PLANE.DAY ? PLANE.NIGHT : PLANE.DAY
      b.shiftT = TUNING.boss.shiftEvery
      sfxShift()
    }
    // 追踪玩家
    const dx = p.x - b.x
    const dy = p.y - b.y
    const len = Math.hypot(dx, dy) || 1
    b.x += (dx / len) * b.speed * dt
    b.y += (dy / len) * b.speed * dt
    b.bob += dt * 4
  }

  _kill(idx) {
    const e = this.enemies[idx]
    this.enemies.splice(idx, 1)
    this.score += e.score
    this.xp += e.xp
    this._burst(e.x, e.y, e.plane === PLANE.DAY ? '#f5a742' : '#8f7bff', 10)
    this.floaters.push({ x: e.x, y: e.y, text: `+${e.score}`, life: 0.8, color: '#ffd23f' })
    sfxBoom()
    this._checkLevel()
  }

  _burst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      if (this.particles.length > 400) break
      const a = Math.random() * Math.PI * 2
      const sp = 24 + Math.random() * 60
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.3,
        color,
        size: Math.random() < 0.5 ? 1 : 2
      })
    }
  }

  _gameOver() {
    this.state = STATE.over
    this._burst(this.player.x, this.player.y, '#ff4f9a', 26)
    sfxOver()
    this._finishRun(false)
  }

  _winGame() {
    const b = this.boss
    this.boss = null
    this.score += TUNING.boss.score + TUNING.winBonus
    this._burst(b.x, b.y, '#ffd23f', 40)
    sfxWin()
    this.state = STATE.over
    this.win = true
    this._finishRun(true)
  }

  _finishRun(win) {
    // 排行榜
    const top = loadJSON('ss.top5', [])
    const entry = {
      score: Math.floor(this.score),
      time: Math.floor(this.elapsed),
      perfects: this.perfects,
      win
    }
    top.push(entry)
    top.sort((a, b) => b.score - a.score)
    while (top.length > 5) top.pop()
    this.rankIndex = top.indexOf(entry)
    saveJSON('ss.top5', top)
    if (!this.tutorialSeen) {
      this.tutorialSeen = true
      saveJSON('ss.tutorial', true)
    }
  }

  /* ---------------- 绘制 ---------------- */

  _planeColors() {
    return this.player.plane === PLANE.DAY
      ? { bg: '#2e7d4f', grid: 'rgba(255,255,255,0.10)', deco: 'rgba(0,0,0,0.14)' }
      : { bg: '#141433', grid: 'rgba(150,160,255,0.12)', deco: 'rgba(200,180,255,0.10)' }
  }

  _draw() {
    this.buttons = []
    if (this.state === STATE.title) this._drawTitle()
    else this._drawWorldFrame()
  }

  _drawWorldFrame() {
    const ctx = this.ctx
    const p = this.player
    const colors = this._planeColors()

    let shakeX = 0
    let shakeY = 0
    if (this.shake > 0) {
      const s = this.reducedFlash ? this.shake * 0.5 : this.shake
      shakeX = (Math.random() - 0.5) * s
      shakeY = (Math.random() - 0.5) * s
    }

    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, this.vw, this.vh)

    ctx.save()
    const cam = this.cam
    const ox = Math.round(cam.x + shakeX)
    const oy = Math.round(cam.y + shakeY)
    const GRID = 16

    ctx.strokeStyle = colors.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    for (let gx = -((ox % GRID) + GRID); gx < this.vw + GRID; gx += GRID) {
      ctx.moveTo(gx, 0)
      ctx.lineTo(gx, this.vh)
    }
    for (let gy = -((oy % GRID) + GRID); gy < this.vh + GRID; gy += GRID) {
      ctx.moveTo(0, gy)
      ctx.lineTo(this.vw, gy)
    }
    ctx.stroke()

    ctx.fillStyle = colors.deco
    for (let gx = -((ox % GRID) + GRID); gx < this.vw + GRID; gx += GRID) {
      for (let gy = -((oy % GRID) + GRID); gy < this.vh + GRID; gy += GRID) {
        const h = ((gx + ox) * 73856093) ^ ((gy + oy) * 19349663)
        if (h % 7 < 2) {
          ctx.fillRect(gx + (h % GRID), gy + ((h >> 3) % GRID), 1, 1)
        }
      }
    }

    const toScreen = (x, y) => [Math.round(x - ox), Math.round(y - oy)]
    const drawShadow = (x, y, r) => {
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fillRect(Math.round(x - ox - r * 0.8), Math.round(y - oy + r * 0.9), Math.round(r * 1.6), Math.round(r * 0.5))
    }

    // 冲击波
    for (const w of this.waves) {
      const [sx, sy] = toScreen(w.x, w.y)
      ctx.strokeStyle = 'rgba(255,210,63,0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sx, sy, w.r, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 敌人（异面半透明先画，同面后画）
    for (const e of this.enemies) {
      const [sx, sy] = toScreen(e.x, e.y)
      if (sx < -20 || sx > this.vw + 20 || sy < -20 || sy > this.vh + 20) continue
      const lift = Math.sin(e.bob) * 0.8
      const spr = getSprite(e.type, e.plane)
      if (e.plane === p.plane) {
        drawShadow(e.x, e.y, e.r)
        ctx.drawImage(spr, sx - (spr.width >> 1), sy - (spr.height >> 1) - 6 - lift)
      } else {
        ctx.globalAlpha = 0.3
        ctx.drawImage(spr, sx - (spr.width >> 1), sy - (spr.height >> 1) - 6 - lift)
        ctx.globalAlpha = 1
      }
    }

    // Boss
    if (this.boss) {
      const b = this.boss
      const [sx, sy] = toScreen(b.x, b.y)
      const spr = getSprite('boss', b.plane)
      const blink = b.shiftT < TUNING.boss.telegraph && Math.floor(b.shiftT * 8) % 2 === 0
      if (b.plane === p.plane) {
        drawShadow(b.x, b.y, b.r)
        ctx.drawImage(spr, sx - spr.width, sy - spr.height + Math.sin(b.bob) * 1.5)
      } else {
        ctx.globalAlpha = blink ? 0.55 : 0.3
        ctx.drawImage(spr, sx - spr.width, sy - spr.height + Math.sin(b.bob) * 1.5)
        ctx.globalAlpha = 1
      }
    }

    // 玩家
    if (this.state !== STATE.over || this.win) {
      drawShadow(p.x, p.y, p.r)
      const lift = Math.sin(p.bob) * 1.0
      const [sx, sy] = toScreen(p.x, p.y - 7 - lift)
      const spr = getSprite('player', p.plane)
      if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.45
      ctx.drawImage(spr, sx - (spr.width >> 1), sy - (spr.height >> 1))
      ctx.globalAlpha = 1
      // 玩家轮廓：密集场面里保持可辨识
      ctx.strokeStyle = p.plane === PLANE.DAY ? 'rgba(255,246,224,0.5)' : 'rgba(207,196,255,0.55)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(sx, sy + 1, p.r + 4, 0, Math.PI * 2)
      ctx.stroke()
    }

    // 子弹
    for (const b of this.bullets) {
      const [sx, sy] = toScreen(b.x, b.y)
      ctx.fillStyle = '#ffd23f'
      ctx.fillRect(sx - 1, sy - 1, 3, 3)
      ctx.fillStyle = '#fff2b0'
      ctx.fillRect(sx, sy, 1, 1)
    }

    // 粒子
    for (const pt of this.particles) {
      ctx.globalAlpha = clamp(pt.life / 0.4, 0, 1)
      ctx.fillStyle = pt.color
      const [sx, sy] = toScreen(pt.x, pt.y)
      ctx.fillRect(sx, sy, pt.size, pt.size)
    }
    ctx.globalAlpha = 1

    ctx.restore()

    // 切换故障特效（减少闪烁模式下不画）
    if (this.shiftFx > 0 && !this.reducedFlash) {
      const n = 6
      for (let i = 0; i < n; i++) {
        const y = Math.floor(Math.random() * this.vh)
        const h = 2 + Math.floor(Math.random() * 5)
        const dx = Math.floor((Math.random() - 0.5) * 14)
        ctx.drawImage(this.canvas, 0, y, this.vw, h, dx, y, this.vw, h)
      }
    }
    if (this.flashT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(this.flashT / 0.06) * 0.5})`
      ctx.fillRect(0, 0, this.vw, this.vh)
    }

    if (!this.frozen) {
      if (this.state !== STATE.over) {
        this._drawHud()
        this._drawFloaters()
      }
      this._drawTouchControls()

      if (this.state === STATE.paused) this._drawPause()
      if (this.state === STATE.upgrade) this._drawUpgrade()
      if (this.state === STATE.over) this._drawOver()
    }
  }

  _drawFloaters() {
    const ctx = this.ctx
    ctx.font = '8px "Press Start 2P", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const f of this.floaters) {
      ctx.globalAlpha = clamp(f.life / 0.8, 0, 1)
      ctx.fillStyle = f.color || '#ffd23f'
      ctx.fillText(f.text, f.x - this.cam.x, f.y - this.cam.y)
    }
    ctx.globalAlpha = 1
  }

  _drawHud() {
    const ctx = this.ctx
    const p = this.player
    const dark = 'rgba(8,8,24,0.72)'

    // HP / XP / 等级
    ctx.fillStyle = dark
    ctx.fillRect(4, 4, 104, 26)
    ctx.fillStyle = '#3a1020'
    ctx.fillRect(8, 8, 88, 8)
    ctx.fillStyle = p.hp / p.maxHp > 0.3 ? '#ff4b4b' : '#ff9838'
    ctx.fillRect(8, 8, Math.max(0, p.hp / p.maxHp) * 88, 8)
    ctx.fillStyle = '#22224a'
    ctx.fillRect(8, 19, 88, 4)
    ctx.fillStyle = '#ffd23f'
    ctx.fillRect(8, 19, (this.xp / this.nextXp) * 88, 4)
    this._text(`LV${this.level}`, 112, 13, 8, '#cfd6ff', 'left')

    // 时间 / 分数
    const mm = String(Math.floor(this.elapsed / 60))
    const ss = String(Math.floor(this.elapsed % 60)).padStart(2, '0')
    ctx.fillStyle = dark
    ctx.fillRect(this.vw / 2 - 56, 4, 112, 30)
    this._text(`${mm}:${ss}`, this.vw / 2, 13, 8, '#fff')
    this._text(`SCORE ${Math.floor(this.score)}`, this.vw / 2, 26, 8, '#ffd23f')

    // PERFECT 数 + 当前面 + 切换冷却（右上，触屏时右侧留暂停按钮）
    const chipX = this.vw - 124
    const chipW = 92
    const planeName = p.plane === PLANE.DAY ? 'DAY' : 'NIGHT'
    const planeColor = p.plane === PLANE.DAY ? '#f5a742' : '#8f7bff'
    ctx.fillStyle = dark
    ctx.fillRect(chipX, 4, chipW, 30)
    this._text(`PS ${this.perfects}`, chipX + 4, 12, 8, '#ff4f9a', 'left')
    this._text(planeName, chipX + chipW - 4, 12, 8, planeColor, 'right')
    ctx.fillStyle = '#22224a'
    ctx.fillRect(chipX + 4, 21, chipW - 8, 4)
    const cdFill = this.planeCd > 0 ? 1 - this.planeCd / p.shiftCd : 1
    ctx.fillStyle = this.planeCd > 0 ? '#8a94b8' : '#3fe07f'
    ctx.fillRect(chipX + 4, 21, (chipW - 8) * cdFill, 4)

    // Boss 血条
    if (this.boss) {
      ctx.fillStyle = dark
      ctx.fillRect(this.vw / 2 - 102, 38, 204, 12)
      ctx.fillStyle = '#3a1020'
      ctx.fillRect(this.vw / 2 - 100, 40, 200, 8)
      ctx.fillStyle = '#ff4b4b'
      ctx.fillRect(this.vw / 2 - 100, 40, Math.max(0, this.boss.hp / this.boss.maxHp) * 200, 8)
    }

    // 强制切换倒计时
    const forcedRemain = this.forcedNext - this.elapsed
    if (forcedRemain <= TUNING.forced.warn && forcedRemain > 0) {
      const blinkOn = Math.floor(this.elapsed * 4) % 2 === 0
      if (blinkOn) {
        this._text(`WORLD SHIFT IN ${Math.ceil(forcedRemain)}!`, this.vw / 2, 58, 8, '#ff4f9a')
      }
    }

    // 引导（第一局前 30 秒）
    if (!this.tutorialSeen && this.elapsed < 30 && this.state === STATE.running) {
      let msg = ''
      if (this.elapsed > 1.5 && this.elapsed < 8) {
        msg = this.touchMode ? 'TAP THE BIG BUTTON TO SWAP WORLDS' : 'SHIFT / Q / E / RMB TO SWAP WORLDS'
      } else if (this.elapsed >= 9 && this.elapsed < 15) {
        msg = 'ONLY SAME-SIDE ENEMIES CAN HIT YOU'
      } else if (this.elapsed >= 16 && this.elapsed < 22) {
        msg = 'DODGE AT THE LAST MOMENT - PERFECT SHIFT'
      }
      if (msg) {
        ctx.fillStyle = 'rgba(8,8,24,0.72)'
        const w = msg.length * 8 + 16
        ctx.fillRect(this.vw / 2 - w / 2, this.vh - 28, w, 18)
        this._text(msg, this.vw / 2, this.vh - 19, 8, '#3ee6c9')
      }
    }
  }

  _drawTouchControls() {
    const ctx = this.ctx
    if (this.state !== STATE.running && this.state !== STATE.paused) return

    if (this.joy.active) {
      ctx.strokeStyle = 'rgba(62,230,201,0.5)'
      ctx.lineWidth = 2
      ctx.strokeRect(this.joy.ox - 16, this.joy.oy - 16, 32, 32)
      ctx.fillStyle = 'rgba(255,210,63,0.9)'
      const kx = this.joy.ox + this.joy.x * 8
      const ky = this.joy.oy + this.joy.y * 8
      ctx.fillRect(kx - 4, ky - 4, 8, 8)
    }

    if (this.touchMode) {
      // 右上角暂停按钮
      const px = this.vw - 18
      const py = 18
      ctx.fillStyle = 'rgba(8,8,24,0.72)'
      ctx.beginPath()
      ctx.arc(px, py, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#cfd6ff'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(px, py, 11, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = '#cfd6ff'
      ctx.fillRect(px - 4, py - 4, 2, 8)
      ctx.fillRect(px + 2, py - 4, 2, 8)

      // 右下切换按钮 + 冷却进度环
      const cx = this.vw - 38
      const cy = this.vh - 38
      const ready = this.planeCd <= 0
      const frac = ready ? 1 : clamp(1 - this.planeCd / this.player.shiftCd, 0, 1)
      ctx.lineWidth = 3
      ctx.strokeStyle = 'rgba(138,148,184,0.45)'
      ctx.beginPath()
      ctx.arc(cx, cy, 24, 0, Math.PI * 2)
      ctx.stroke()
      ctx.strokeStyle = ready ? '#3ee6c9' : '#ffd23f'
      ctx.beginPath()
      ctx.arc(cx, cy, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac)
      ctx.stroke()
      const name = this.player.plane === PLANE.DAY ? 'sun' : 'moon'
      const spr = getSprite(name, this.player.plane)
      ctx.drawImage(spr, cx - (spr.width >> 1), cy - (spr.height >> 1))
      this._text('SHIFT', cx, cy + 34, 8, ready ? '#3ee6c9' : '#8a94b8')
    }

    if (!this.touchMode && this.state === STATE.running) {
      const spr = getSprite('crosshair', this.player.plane)
      ctx.drawImage(spr, Math.round(this.mouse.x - 2), Math.round(this.mouse.y - 2))
    }
  }

  _drawPause() {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(6,6,15,0.75)'
    ctx.fillRect(0, 0, this.vw, this.vh)
    this._text('PAUSED', this.vw / 2, 70, 16, '#fff')
    this._button(this.vw / 2 - 60, 98, 120, 22, 'RESUME', () => this.resume())
    this._button(this.vw / 2 - 60, 126, 120, 22, 'QUIT TO TITLE', () => this.quitToTitle())
    this._text('[P] / [ESC] TO RESUME', this.vw / 2, 168, 8, '#8a94b8')
  }

  _drawUpgrade() {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(6,6,15,0.82)'
    ctx.fillRect(0, 0, this.vw, this.vh)
    this._text('LEVEL UP!', this.vw / 2, 30, 16, '#ffd23f')

    const w = 136
    const h = 110
    const gap = 10
    const totalW = w * 3 + gap * 2
    const x0 = (this.vw - totalW) / 2
    const y0 = 50

    this.upgradeChoices.forEach((u, i) => {
      const x = x0 + i * (w + gap)
      const hovered = this.mouse.active && this.mouse.x >= x && this.mouse.x <= x + w && this.mouse.y >= y0 && this.mouse.y <= y0 + h
      ctx.fillStyle = hovered ? '#2a2a52' : '#1a1a38'
      ctx.fillRect(x, y0, w, h)
      ctx.strokeStyle = hovered ? '#ffd23f' : '#3a3a6a'
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, y0 + 0.5, w - 1, h - 1)

      const spr = getSprite(u.icon, PLANE.DAY)
      ctx.drawImage(spr, x + w / 2 - (spr.width >> 1), y0 + 8)
      this._text(u.name, x + w / 2, y0 + 32, 8, '#fff')
      this._text(u.desc, x + w / 2, y0 + 50, 8, '#cfd6ff')
      this._text(`[${i + 1}]`, x + w / 2, y0 + 88, 8, '#8a94b8')

      const cb = () => this.chooseUpgrade(u.key)
      this.buttons.push({ x, y: y0, w, h, cb })
    })

    this._text('CHOOSE ONE - [1] [2] [3]', this.vw / 2, 182, 8, '#8a94b8')
  }

  _drawOver() {
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(6,6,15,0.85)'
    ctx.fillRect(0, 0, this.vw, this.vh)
    this._text(this.win ? 'VICTORY!' : 'GAME OVER', this.vw / 2, 30, 24, this.win ? '#3fe07f' : '#ff4b4b')
    if (this.win) this._text('THE ECLIPSE LORD IS VANQUISHED', this.vw / 2, 52, 8, '#ffd23f')

    const mm = String(Math.floor(this.elapsed / 60))
    const ss = String(Math.floor(this.elapsed % 60)).padStart(2, '0')
    const scoreY = this.win ? 72 : 62
    this._text(`SCORE ${Math.floor(this.score)}`, this.vw / 2, scoreY, 16, '#fff')
    this._text(`TIME ${mm}:${ss} - PERFECT SHIFTS ${this.perfects}`, this.vw / 2, scoreY + 18, 8, '#cfd6ff')

    // 排行榜
    const top = loadJSON('ss.top5', [])
    const topY = scoreY + 34
    this._text('- TOP 5 -', this.vw / 2, topY, 8, '#ffd23f')
    top.forEach((entry, i) => {
      const isMe = this.rankIndex === i
      this._text(
        `${i + 1}. ${entry.score}${entry.win ? '*' : ''}  ${entry.time}S  PS:${entry.perfects}`,
        this.vw / 2,
        topY + 14 + i * 14,
        8,
        isMe ? '#3fe07f' : '#cfd6ff'
      )
    })

    this._button(this.vw / 2 - 60, 196, 120, 22, 'PLAY AGAIN', () => this.start())
    this._button(this.vw / 2 - 60, 224, 120, 22, 'TITLE', () => this.quitToTitle())
    this._text('* = WIN', this.vw / 2, 258, 8, '#8a94b8')
  }

  _drawTitle() {
    const ctx = this.ctx
    const t = this.titleT

    // 背景缓慢流动的网格
    const colors = this._planeColors()
    ctx.fillStyle = colors.bg
    ctx.fillRect(0, 0, this.vw, this.vh)
    ctx.strokeStyle = colors.grid
    ctx.lineWidth = 1
    ctx.beginPath()
    const off = (t * 12) % 16
    for (let gx = -off; gx < this.vw + 16; gx += 16) {
      ctx.moveTo(gx, 0)
      ctx.lineTo(gx, this.vh)
    }
    for (let gy = -off; gy < this.vh + 16; gy += 16) {
      ctx.moveTo(0, gy)
      ctx.lineTo(this.vw, gy)
    }
    ctx.stroke()

    // 漂浮的敌人剪影做装饰
    const decoTypes = ['crawler', 'wasp', 'brute']
    for (let i = 0; i < 5; i++) {
      const type = decoTypes[i % decoTypes.length]
      const plane = i % 2
      const spr = getSprite(type, plane)
      const x = ((t * 8 + i * 110) % (this.vw + 40)) - 20
      const y = 24 + Math.sin(t * 0.8 + i * 2.1) * 14 + i * 5
      ctx.globalAlpha = 0.35
      ctx.drawImage(spr, Math.round(x), Math.round(y))
      ctx.globalAlpha = 1
    }

    // Logo
    const bob = Math.sin(t * 2) * 2
    this._text('SHIFT', this.vw / 2, 40 + bob, 32, '#ffd23f')
    this._text('SURVIVOR', this.vw / 2, 68 + bob, 16, '#8f7bff')
    this._text('GITHUB GAME OFF 2026 - THEME: SHIFT', this.vw / 2, 86, 8, '#8a94b8')

    // 按钮
    this._button(this.vw / 2 - 75, 98, 150, 24, 'START', () => this.start(), true)
    this._button(this.vw / 2 - 75, 128, 150, 18, `SOUND: ${this.soundOn ? 'ON' : 'OFF'}`, () => {
      this.soundOn = !this.soundOn
      saveJSON('ss.sound', this.soundOn)
      setSfxEnabled(this.soundOn)
      if (this.soundOn) musicStart()
      else musicStop()
    })
    this._button(this.vw / 2 - 75, 150, 150, 18, `FLASH REDUCE: ${this.reducedFlash ? 'ON' : 'OFF'}`, () => {
      this.reducedFlash = !this.reducedFlash
      saveJSON('ss.flash', this.reducedFlash)
    })
    this._button(this.vw / 2 - 75, 172, 150, 18, 'FULLSCREEN', () => {
      this.opts.toggleFullscreen && this.opts.toggleFullscreen()
    })

    // 操作说明（8px 网格）
    this._text('WASD MOVE - MOUSE AIM - HOLD TO SHOOT', this.vw / 2, 194, 8, '#cfd6ff')
    this._text('SHIFT / Q / E / RMB - SWAP WORLDS', this.vw / 2, 206, 8, '#cfd6ff')
    this._text('ONLY SAME-SIDE ENEMIES CAN HIT OR BE HIT', this.vw / 2, 218, 8, '#8a94b8')
    this._text('P/ESC PAUSE - F FULLSCREEN', this.vw / 2, 230, 8, '#8a94b8')
    this._text('WINDOWS: USE Q/E/RMB IF SHIFT STICKS', this.vw / 2, 242, 8, '#8a94b8')
    this._text('SURVIVE 8 MIN - DEFEAT THE ECLIPSE LORD', this.vw / 2, 254, 8, '#ffd23f')
    this._text('2026 XIAXIA YU - MIT LICENSE', this.vw / 2, 264, 8, '#4a4a6a')
  }

  /* ---------------- UI 工具 ---------------- */

  _text(str, x, y, size, color, align = 'center', maxWidth) {
    const ctx = this.ctx
    ctx.font = `${size}px "Press Start 2P", monospace`
    ctx.fillStyle = color
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    if (maxWidth) {
      // 只允许缩到 8 的整数倍（字体设计网格）
      let s = size
      while (s > 8 && ctx.measureText(str).width > maxWidth) {
        s -= 8
        ctx.font = `${s}px "Press Start 2P", monospace`
      }
    }
    ctx.fillText(str, x, y)
  }

  _button(x, y, w, h, label, cb, big) {
    const ctx = this.ctx
    const hovered =
      this.mouse.active && this.mouse.x >= x && this.mouse.x <= x + w && this.mouse.y >= y && this.mouse.y <= y + h
    ctx.fillStyle = hovered ? '#2a2a52' : '#1a1a38'
    ctx.fillRect(x, y, w, h)
    ctx.strokeStyle = hovered ? '#ffd23f' : '#3a3a6a'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
    this._text(label, x + w / 2, y + h / 2, big ? 16 : 8, hovered ? '#ffd23f' : '#cfd6ff')
    this.buttons.push({ x, y, w, h, cb })
  }

  _inShiftBtn(p) {
    const cx = this.vw - 38
    const cy = this.vh - 38
    return Math.hypot(p.x - cx, p.y - cy) < 28
  }

  _inPauseBtn(p) {
    return Math.hypot(p.x - (this.vw - 18), p.y - 18) < 14
  }
}

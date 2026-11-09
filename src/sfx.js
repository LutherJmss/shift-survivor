/**
 * 8-bit 音效：Web Audio 方波/锯齿波短包络，全部实时合成，无音频文件。
 * 首次用户交互后才创建 AudioContext（移动端自动播放限制）。
 * 基于Pixel Blog 项目的 sfx.js 扩展，新增切换类音效。
 */

let ctx = null
let enabled = true
let lastShoot = 0
let lastHit = 0

export function ensureAudio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    try {
      ctx = new AC()
    } catch (err) {
      return null
    }
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function blip(freq, dur = 0.06, type = 'square', vol = 0.05, slideTo = null) {
  if (!enabled) return
  const ac = ensureAudio()
  if (!ac) return
  const now = ac.currentTime
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, now)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), now + dur)
  gain.gain.setValueAtTime(vol, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  osc.connect(gain).connect(ac.destination)
  osc.start(now)
  osc.stop(now + dur + 0.02)
}

export function setSfxEnabled(value) {
  enabled = !!value
}

export function isSfxEnabled() {
  return enabled
}

export function sfxClick() {
  blip(520, 0.05)
  setTimeout(() => blip(760, 0.045), 40)
}

export function sfxShoot() {
  const now = Date.now()
  if (now - lastShoot < 85) return
  lastShoot = now
  blip(920, 0.03, 'square', 0.022, 620)
}

export function sfxHit() {
  const now = Date.now()
  if (now - lastHit < 50) return
  lastHit = now
  blip(220, 0.04, 'square', 0.03, 120)
}

export function sfxHurt() {
  blip(160, 0.12, 'sawtooth', 0.045, 70)
}

export function sfxBoom() {
  if (!enabled) return
  const ac = ensureAudio()
  if (!ac) return
  const now = ac.currentTime
  const dur = 0.16
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource()
  const gain = ac.createGain()
  const filter = ac.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1400, now)
  filter.frequency.exponentialRampToValueAtTime(200, now + dur)
  gain.gain.setValueAtTime(0.05, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur)
  src.buffer = buffer
  src.connect(filter).connect(gain).connect(ac.destination)
  src.start(now)
}

export function sfxLevel() {
  // do-mi-so 琶音（上升三和弦 = 升级感）
  blip(523, 0.08)
  setTimeout(() => blip(659, 0.08), 90)
  setTimeout(() => blip(784, 0.14), 180)
}

export function sfxOver() {
  blip(320, 0.12, 'square', 0.05, 200)
  setTimeout(() => blip(200, 0.2, 'square', 0.05, 90), 140)
}

/* ---------- SHIFT SURVIVOR 新增音效 ---------- */

/** 切换世界：上滑扫频 */
export function sfxShift() {
  blip(180, 0.12, 'square', 0.05, 720)
  setTimeout(() => blip(360, 0.08, 'square', 0.035, 900), 60)
}

/** PERFECT SHIFT：清亮双音 */
export function sfxPerfect() {
  blip(880, 0.07, 'square', 0.05)
  setTimeout(() => blip(1319, 0.12, 'square', 0.05), 70)
}

/** 冲击波：低频噗 */
export function sfxWave() {
  blip(120, 0.18, 'sawtooth', 0.05, 40)
}

/** 世界强制切换警报：下行三连音 */
export function sfxAlarm() {
  blip(660, 0.09, 'square', 0.04)
  setTimeout(() => blip(660, 0.09, 'square', 0.04), 130)
  setTimeout(() => blip(494, 0.16, 'square', 0.04), 260)
}

/** 倒计时嘀 */
export function sfxTickHigh() {
  blip(1180, 0.03, 'square', 0.03)
}

/** Boss 出场：低吼 */
export function sfxBoss() {
  blip(70, 0.5, 'sawtooth', 0.07, 45)
  setTimeout(() => blip(90, 0.4, 'square', 0.05, 50), 250)
}

/** 通关小号 */
export function sfxWin() {
  const seq = [
    [523, 0], [659, 120], [784, 240], [1047, 360],
    [784, 520], [1047, 640], [1319, 780]
  ]
  for (const [f, t] of seq) setTimeout(() => blip(f, 0.16, 'square', 0.05), t)
}

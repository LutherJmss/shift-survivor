/**
 * 8-bit 循环背景音乐（Web Audio 实时合成，无音频文件）。
 * DAY / NIGHT 两版旋律共享同一个 16 分音符时钟，
 * 切面时直接换谱，节奏不断拍，实现无缝切换。
 */
import { ensureAudio } from './sfx.js'

const BPM = 132
const STEP = 60 / BPM / 4 // 16 分音符时长
const PATTERN_LEN = 32

// 音高表
const C3 = 130.81, E3 = 164.81, F3 = 174.61, G3 = 196
const A2 = 110, E2 = 82.41, F2 = 87.31, G2 = 98
const G4 = 392, A4 = 440, B4 = 493.88
const C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99

/* DAY：明亮大调（C 大调五声） */
const DAY_LEAD = [
  E5, 0, G5, 0, C5, 0, E5, 0, D5, 0, 0, C5, 0, 0, G4, 0,
  A4, 0, C5, 0, E5, 0, D5, 0, C5, 0, 0, 0, G4, 0, 0, 0
]
const DAY_BASS = [
  C3, 0, 0, 0, C3, 0, 0, 0, G2, 0, 0, 0, G2, 0, 0, 0,
  A2, 0, 0, 0, A2, 0, 0, 0, F3, 0, 0, 0, G3, 0, 0, 0
]

/* NIGHT：阴郁小调（A 小调），整体低八度、更慢的呼吸感 */
const NIGHT_LEAD = [
  A4, 0, C5, 0, E5, 0, D5, 0, C5, 0, B4, 0, A4, 0, G4, 0,
  A4, 0, 0, E4, 0, 0, F4, 0, E4, 0, D4, 0, E4, 0, 0, 0
]
const NIGHT_BASS = [
  A2, 0, 0, 0, A2, 0, 0, 0, E2, 0, 0, 0, E2, 0, 0, 0,
  F2, 0, 0, 0, F2, 0, 0, 0, G2, 0, 0, 0, E2, 0, 0, 0
]

let plane = 0
let running = false
let master = null
let noiseBuf = null
let timer = null
let step = 0
let nextTime = 0

function makeNoise(ac) {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.05), ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return buf
}

function tone(ac, freq, at, dur, type, vol) {
  const osc = ac.createOscillator()
  const gain = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, at)
  gain.gain.setValueAtTime(vol, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  osc.connect(gain).connect(master)
  osc.start(at)
  osc.stop(at + dur + 0.02)
}

function hat(ac, at, vol) {
  const src = ac.createBufferSource()
  const gain = ac.createGain()
  const hp = ac.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 6000
  src.buffer = noiseBuf
  gain.gain.setValueAtTime(vol, at)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.04)
  src.connect(hp).connect(gain).connect(master)
  src.start(at)
}

function schedule() {
  const ac = ensureAudio()
  if (!ac || !master) return
  while (nextTime < ac.currentTime + 0.12) {
    const lead = plane === 0 ? DAY_LEAD : NIGHT_LEAD
    const bass = plane === 0 ? DAY_BASS : NIGHT_BASS
    const i = step % PATTERN_LEN
    if (lead[i]) tone(ac, lead[i], nextTime, STEP * 1.6, 'square', 0.02)
    if (bass[i]) tone(ac, bass[i], nextTime, STEP * 1.9, 'triangle', 0.035)
    // 底鼓式噪声打点：每 4 步重、每 2 步轻
    if (i % 4 === 0) hat(ac, nextTime, 0.015)
    else if (i % 2 === 0) hat(ac, nextTime, 0.008)
    nextTime += STEP
    step++
  }
}

export function musicStart() {
  const ac = ensureAudio()
  if (!ac) return
  if (!master) {
    master = ac.createGain()
    master.gain.value = 0.9
    master.connect(ac.destination)
  }
  if (running) return
  running = true
  step = 0
  nextTime = ac.currentTime + 0.05
  if (!noiseBuf) noiseBuf = makeNoise(ac)
  schedule()
  timer = setInterval(schedule, 40)
}

export function musicStop() {
  running = false
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

export function setMusicPlane(p) {
  plane = p ? 1 : 0
}

export function setMusicVolume(v) {
  if (master) master.gain.value = v
}

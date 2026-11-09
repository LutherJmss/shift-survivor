/**
 * SHIFT SURVIVOR 启动入口：加载字体、装配引擎、处理全屏。
 */
import { Game } from './engine.js'

const canvas = document.getElementById('game')
const stage = document.getElementById('stage')

/* 字体：Press Start 2P（OFL 1.1，见 public/fonts/OFL-LICENSE.txt） */
if ('fonts' in document && window.FontFace) {
  const face = new FontFace('Press Start 2P', 'url(./fonts/PressStart2P.ttf)')
  face
    .load()
    .then(() => {
      document.fonts.add(face)
    })
    .catch(() => {
      /* 字体加载失败时回退 monospace，不影响游戏 */
    })
}

/* 全屏（兼容 Safari 前缀） */
function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen()
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen()
  } else if (stage.requestFullscreen) {
    stage.requestFullscreen()
  } else if (stage.webkitRequestFullscreen) {
    stage.webkitRequestFullscreen()
  }
}

/* eslint-disable no-unused-vars */
const game = new Game(canvas, {
  dev: import.meta.env.DEV,
  toggleFullscreen
})

/* 开发模式暴露句柄，方便自动化测试与调试（生产构建不包含） */
if (import.meta.env.DEV) {
  window.__game = game
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault())

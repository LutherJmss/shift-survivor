/**
 * SHIFT SURVIVOR —— 像素精灵系统
 * 所有图形用字符画定义、运行时渲染，项目零图片资源。
 * 每个精灵按 DAY / NIGHT 两套调色板预渲染到离屏 canvas 缓存，
 * 主循环里只用 drawImage，保证 300+ 实体稳定 60 帧。
 *
 * 调色板字符约定（a/A/b/c/e 会随面变化，其余为共用色）：
 *   DAY  面：a 金橙 / A 深橙 / b 高光 / c 次要暖色
 *   NIGHT面：a 紫 / A 深紫 / b 高光 / c 青色
 */

export const PLANE = { DAY: 0, NIGHT: 1 }

const SHARED = {
  r: '#ff4b4b',
  R: '#b62b2b',
  y: '#ffd23f',
  Y: '#c99a00',
  g: '#3fe07f',
  m: '#ff4f9a',
  o: '#ff9838',
  p: '#9d6bff',
  t: '#3ee6c9',
  v: '#cfd6ff',
  x: '#b5722f',
  z: '#8a94b8',
  u: '#d18f5f',
  s: '#ffe9c9'
}

export const PAL_DAY = {
  ...SHARED,
  a: '#f5a742',
  A: '#c97a1e',
  b: '#ffe0a3',
  c: '#ff7a45',
  k: '#33210d',
  w: '#fff6e0',
  e: '#4d2b0d'
}

export const PAL_NIGHT = {
  ...SHARED,
  a: '#8f7bff',
  A: '#5a41c9',
  b: '#cfc4ff',
  c: '#3ec9ff',
  k: '#0e0a26',
  w: '#e8e6ff',
  e: '#1d1444'
}

export const SPRITES = {
  /* ---------- 角色 ---------- */
  player: {
    map: [
      '..aaaaaaaa..',
      '..aAAAAAAa..',
      '..aAwwwwAa..',
      '..aAwewewAa.',
      '..aAwwwwAa..',
      '..aaaaaaaa..',
      '.kkaaaaaakk..',
      '.kkaaaaaakk.',
      '..aAAAAAAa..',
      '..aaAAAAaa..',
      '..AA....AA..',
      '.kkk....kkk.'
    ]
  },
  crawler: {
    map: [
      '....aaaa....',
      '..aabbbbaa..',
      '.aabbbbbbaa.',
      'aabkbbbbkbaa',
      'aabbbbbbbbaa',
      'aabaaaaaabaa',
      '.aabbbbbbaa.',
      '..aa.aa.aa..'
    ]
  },
  wasp: {
    map: [
      'c........c',
      'cc.aaaa.cc',
      'ccaaaaaacc',
      '.aakbbkaa.',
      '.aaaaaaaa.',
      '..aAAAAa..',
      '...c..c...'
    ]
  },
  brute: {
    map: [
      '....aaaaaa....',
      '..aabbbbbbaa..',
      '.abbbbbbbbbba.',
      'abbbkbbbbkbba.',
      'abbbbbbbbbbbba',
      '.abbbAAAAbbba.',
      '.abbAAAAAAbba.',
      '.abbbAAAAbbba.',
      '..abbbbbbbba..',
      '..abbbbbbbba..',
      '..aaAAAAAAaa..',
      '..AA...AA...AA'
    ]
  },
  boss: {
    map: [
      '..A..............A..',
      '..aA............Aa..',
      '..aaA..........Aaa..',
      '...aaA........Aaa...',
      '....aaaaaaaaaaaa....',
      '...aabbbbbbbbbbaa...',
      '..aabbbbbbbbbbbbaa..',
      '..abbbbbbbbbbbbbba..',
      '..abbkwbbbbbkwbbba..',
      '..abbkbbbbbbbkbbba..',
      '.abbbbbbwwbbbbbbba..',
      '.abbbbbwwwwbbbbbba..',
      '.abbbbbbwwkwwbbbbba.',
      '.abbbbbbbwwbbbbbbba.',
      '..abbbbbbbbbbbbbba..',
      '..aabbbbbbbbbbbbaa..',
      '...aabbbbbbbbbbaa...',
      '....aAAAAAAAAAAa....',
      '...cc..cc..cc..cc...',
      '..ccc..cc..cc..ccc..'
    ]
  },

  /* ---------- 弹体 / UI ---------- */
  bullet: { map: ['.y.', 'ywy', 'ywy', '.y.'] },
  crosshair: { map: ['..m..', '..m..', 'mm.mm', '..m..', '..m..'] },

  /* ---------- 升级图标 ---------- */
  heart: { map: ['.rr..rr.', 'rwwrrrrr', 'rrrrrrrr', '.rrrrrr.', '..rrrr..', '...rr...'] },
  sword: {
    map: [
      '.....v......',
      '.....v......',
      '....wtv.....',
      '....wtv.....',
      '....wtv.....',
      '....wtv.....',
      '....wtv.....',
      '...yyyyy....',
      '.....x......',
      '.....x......',
      '....yyy.....'
    ]
  },
  potion: {
    map: [
      '....xx......',
      '....vv......',
      '....vv......',
      '...vvvv.....',
      '..vmmmmmv...',
      '..vwmmmmv...',
      '..vmmmmmv...',
      '..vvvvvvv...'
    ]
  },
  boot: {
    map: [
      '....cc..',
      '...cc...',
      '...cc...',
      '...cc...',
      '..ccc...',
      '..cccc..',
      '.cccccc.',
      '.oooooo.'
    ]
  },
  bolt: {
    map: ['....yy..', '...yy...', '..yyy...', 'yyyyyy..', '...yyy..', '..yyy...', '..yy....', '..y.....']
  },
  gem: {
    map: [
      '..ccccccc..',
      '.cwccccccc.',
      'ccccccccccc',
      '.ccccccccc.',
      '..ccccccc..',
      '...ttttt...',
      '....ttt....',
      '.....t.....'
    ]
  },
  wave: {
    map: [
      '..ccc..ccc..',
      '.c...cc...c.',
      'c...yyyy...c',
      'c..ywwwwy..c',
      'c..yw..wy..c',
      'c..yw..wy..c',
      'c..ywwwwy..c',
      '.c...yy...c.',
      '..ccc..ccc..'
    ]
  },
  clock: {
    map: ['...yyyy...', '..y......y', '.y...k....y', '.y...kk...y', '.y...k.k..y', '.y....kk..y', '..y......y', '...yyyy...']
  },
  star: {
    map: [
      '.....y.....',
      '.....y.....',
      '....yyy....',
      '....yyy....',
      'yyyyywwwyyy',
      'yyyyywwwyyy',
      '....yyy....',
      '....yyy....',
      '.....y.....',
      '.....y.....'
    ]
  },

  /* ---------- 面指示 ---------- */
  sun: {
    map: [
      '...y..y...',
      '.y..yy..y.',
      '..yyyyyy..',
      '.yywyyyyy.',
      'ywwyyyyyyy',
      'ywwyyyyyyy',
      '.yywyyyyy.',
      '..yyyyyy..',
      '.y..yy..y.',
      '...y..y...'
    ]
  },
  moon: {
    map: [
      '....ccc...',
      '..ccccccc..',
      '.cccccccc..',
      '.cccccc....',
      '.ccccc.....',
      '.cccccc....',
      '.cccccccc..',
      '..ccccccc..',
      '....ccc....',
      '...........'
    ]
  }
}

/** 把精灵按指定面的调色板渲染到新 canvas */
function renderSprite(sprite, plane) {
  const map = sprite.map
  let w = 0
  for (const row of map) w = Math.max(w, row.length)
  const h = map.length
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const pal = plane === PLANE.NIGHT ? PAL_NIGHT : PAL_DAY
  for (let row = 0; row < h; row++) {
    const line = map[row]
    for (let col = 0; col < line.length; col++) {
      const color = pal[line[col]]
      if (color) {
        ctx.fillStyle = color
        ctx.fillRect(col, row, 1, 1)
      }
    }
  }
  return canvas
}

const cache = new Map()

/** 取精灵的离屏缓存（plane: 0=DAY 1=NIGHT） */
export function getSprite(name, plane = PLANE.DAY) {
  const key = name + ':' + plane
  let c = cache.get(key)
  if (!c) {
    c = renderSprite(SPRITES[name], plane)
    cache.set(key, c)
  }
  return c
}

/** 供测试/调试：精灵尺寸 */
export function spriteSize(name) {
  const map = SPRITES[name].map
  let w = 0
  for (const row of map) w = Math.max(w, row.length)
  return { w, h: map.length }
}

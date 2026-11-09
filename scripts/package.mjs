/**
 * 一键构建 + 打包 itch.io 上传包。
 * 用法：npm run package
 * 产物：项目根目录 shift-survivor-itch.zip（index.html 在压缩包根目录）
 */
import { execSync } from 'node:child_process'
import { createWriteStream, existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import archiver from 'archiver'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const outFile = path.join(root, 'shift-survivor-itch.zip')

console.log('[package] building...')
execSync('npm run build', { cwd: root, stdio: 'inherit' })

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('[package] dist/index.html not found, build failed')
  process.exit(1)
}

if (existsSync(outFile)) rmSync(outFile)

const output = createWriteStream(outFile)
const archive = archiver('zip', { zlib: { level: 9 } })

output.on('close', () => {
  const kb = (archive.pointer() / 1024).toFixed(1)
  console.log(`[package] done -> ${path.basename(outFile)} (${kb} KB)`)
})

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') console.warn('[package] warning:', err.message)
  else throw err
})
archive.on('error', (err) => {
  throw err
})

archive.pipe(output)
// 第二个参数 false = 直接把 dist 内容放到压缩包根目录
archive.directory(dist, false)
archive.finalize()

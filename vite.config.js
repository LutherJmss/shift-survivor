import { defineConfig } from 'vite'

// base: './' —— 生成完全相对路径，dist 目录可直接打 zip 上传 itch.io
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 512,
    reportCompressedSize: false
  }
})

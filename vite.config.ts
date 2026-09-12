import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // 使用相对资源路径，编译后的 dist 可直接部署到 Nginx 任意二级目录。
  base: './',
  plugins: [react()],
})

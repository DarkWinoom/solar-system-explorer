import { defineConfig } from "vite";

// Vite config — 适配 GitHub Pages（相对路径 base）
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
  },
  server: {
    port: 5173,
    host: true, // 暴露给局域网（手机调试响应式）
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});

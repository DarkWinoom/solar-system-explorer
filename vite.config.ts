import { defineConfig } from "vite";

// Vite config — 适配 GitHub Pages（相对路径 base）
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: true,
    // 升到 esnext — Three.js r160 WebGPU 用了 top-level await,需要 es2022+ 才能编译
    target: "esnext",
  },
  // Three.js r160 的 WebGPU / TSL 有 Vite 5 optimize 兼容问题
  // (temp 注册顺序 + GPUShaderStage 引用顺序)
  // r185+ 改用 three/webgpu + three/tsl 独立 build 文件, 模块图更干净。
  // 保留 build.target: esnext(支持 top-level await), 其他用默认 optimizeDeps。
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  server: {
    port: 5173,
    host: true, // 暴露给局域网（手机调试响应式）
  },
  test: {
    globals: true,
    environment: "jsdom",
    // 排除 .agents-docs/(AI 内部文档 + temp 备份目录,不应被 vitest 当作 test 源)
    exclude: ["**/node_modules/**", "**/dist/**", ".agents-docs/**"],
  },
});


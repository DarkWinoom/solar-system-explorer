/// <reference types="vite/client" />

/**
 * 通用类型 — 全局类型声明
 */

import type { I18n } from "../i18n";

declare global {
  interface Window {
    /** i18n 单例 — 暴露到 window 供 console / 第三方扩展 / devtools 使用 */
    appI18n: I18n;
  }
}

// 模块级 SVG / texture 资源（Vite import）
declare module "*.svg" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.glsl" {
  const src: string;
  export default src;
}
declare module "*.vert" {
  const src: string;
  export default src;
}
declare module "*.frag" {
  const src: string;
  export default src;
}

export {};


/// <reference types="vite/client" />

/**
 * 通用类型 — 全局类型声明
 */

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

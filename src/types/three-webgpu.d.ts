/**
 * Three.js r185+ 的 WebGPU / TSL 子入口 ambient declarations
 *
 * 背景：
 *   - r185+ 的 `three/webgpu` 入口 (build/three.webgpu.js) 内置 WebGPURenderer + NodeMaterial + TSL 节点
 *   - r185+ 的 `three/tsl` 入口 (build/three.tsl.js) 单独 TSL 节点导出
 *   - r185+ 的 `three/addons/*` 入口 映射到 `examples/jsm/*`（WebGPU 渲染器、NodeMaterial 等）
 *   - @types/three@0.185.0 覆盖 `three` 主入口（含 Scene/Camera/Light/Vector3 等）
 *   - 但 **@types/three 还没覆盖 `three/webgpu` `three/tsl` `three/addons/*` 子入口**
 *
 * 我们 ambient 声明这些子入口为任意模块（所有 export 视为 any），
 * 编译/运行时不影响（运行时由 build/three.*.js + examples/jsm/... 提供实现）。
 *
 * 关键：不覆盖 `three` 主入口 — 让 @types/three 完整生效。
 */
declare module "three/webgpu";
declare module "three/tsl";
declare module "three/addons/*";

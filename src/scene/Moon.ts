import * as THREE from "three";
import { TextureLoader } from "three";

export interface MoonOptions {
  /** 月球半径。默认 0.5（阶段 19b 调大, 真实 0.27u 在 35u 距离屏幕 < 1% = 6 像素看不见）*/
  radius?: number;
  /** 月球纹理 URL。默认 /textures/2k_moon.jpg (solarsystemscope, CC BY 4.0) */
  textureUrl?: string;
}

/**
 * Moon — 月球 mesh（阶段 17 接入 SEM 方案）
 *
 * 视觉：
 *   - **MeshStandardMaterial（标准 PBR, 非 TSL）** — WebGL2 backend 完全支持
 *   - 月球纹理用 solarsystemscope 2k_moon.jpg（CC BY 4.0）
 *   - 月相由 DirectionalLight 决定（朝阳面亮, 背阳面暗）
 *   - 半径 0.5u（v19b 调大, 让屏幕可见）
 *   - **emissive 0x202020 (12.5% 基础亮度)**：让背阳面也能看见, 否则新月时月球朝阳面对着太阳 = 背阳面对着相机 = 屏幕纯黑
 *   - **roughness 1.0, metalness 0.0** — 月壤粗糙, 无金属反光
 *
 * ⚠️ 2026-08-20 关键修复 (v19d):
 *   v19b: 用 MeshStandardNodeMaterial (TSL) + emissiveNode
 *   v19c: 改用 emissive = new Color(0x202020) 试图兼容 WebGL2 backend
 *   v19d (本版): 改用**标准** MeshStandardMaterial (非 TSL)
 *
 *   根因: MeshStandardNodeMaterial 在 WebGPURenderer({ forceWebGL: true }) 的
 *   WebGL2 backend 下, colorNode / emissive 字段行为不可预测, 月球在 Three.js
 *   r185 + WebGL2 backend 中渲染为纯黑。
 *
 *   修法: 改用**标准** MeshStandardMaterial (从 "three" 入口, 不是 "three/webgpu"),
 *   它是 Three.js r0+ 一直支持的 PBR 材质, WebGL / WebGL2 / WebGPU 都完全兼容。
 *   配 map (纹理) + emissive (基础亮度) + roughness 1.0 + metalness 0.0
 *   跟 DirectionalLight 互动, 月相正常显示。
 *
 * 简化：
 *   - 月球不自转（潮汐锁定, MVP 视觉无差异）
 *   - 不加 bump map（保持精简）
 *   - 不加陨石坑凹凸（MVP 精简）
 *
 * 父级：EarthScene 中, Moon mesh 直接 add 到 scene, position 每帧手动算 = earthPos + R(moonAngle) × (30, 0, 0)
 *
 * @contract
 *   - `mesh` 永远指向同一个 THREE.Mesh 实例
 *   - `setSunDirection(vec3)` 保留 API（标准 material 不需要, 但兼容旧代码）
 *   - `dispose()` 释放 geometry + material
 *
 * @see /docs/PLAN-SEM.md § 4
 * @see /NOTICES.md "Solar System Scope Textures (CC BY 4.0)"
 */
export class Moon {
  readonly mesh: THREE.Mesh;
  readonly radius: number;
  private readonly material: THREE.MeshStandardMaterial;
  private disposed: boolean = false;

  constructor(options: MoonOptions = {}) {
    this.radius = options.radius ?? 0.5;
    const textureUrl = options.textureUrl ?? "/textures/2k_moon.jpg";

    // --- 加载月球纹理 ---
    const textureLoader = new TextureLoader();
    const moonTexture = textureLoader.load(textureUrl);
    moonTexture.colorSpace = THREE.SRGBColorSpace;
    moonTexture.anisotropy = 8;

    // --- 几何 ---
    const moonGeometry = new THREE.SphereGeometry(this.radius, 64, 32);

    // --- 标准 PBR 材质 (WebGL2 backend 完全支持) ---
    this.material = new THREE.MeshStandardMaterial({
      map: moonTexture,
      // 基础亮度 12.5% 灰 — 新月时朝阳面对着太阳 = 背阳面对着相机,
      // 没有这个 emissive, 月球整面都会被光照计算为 0, 渲染为纯黑
      emissive: new THREE.Color(0x202020),
      emissiveIntensity: 1.0,
      // 月壤粗糙, 无金属反光
      roughness: 1.0,
      metalness: 0.0,
    });

    this.mesh = new THREE.Mesh(moonGeometry, this.material);
    this.mesh.name = "Moon";
    this.mesh.position.set(0, 0, 0); // 默认位置, EarthScene tick 每帧手动算 position
  }

  /**
   * 设置太阳方向（从月球指向太阳的世界空间方向）
   * 保留 API 以备未来扩展（标准 material 自动响应 DirectionalLight, 此方法为 no-op）
   */
  setSunDirection(_sunDirection: THREE.Vector3): void {
    // no-op: 标准 MeshStandardMaterial 自动响应 scene 里的 DirectionalLight
    // 保留 API 兼容旧代码 (EarthScene.tick() 会调用)
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.mesh.geometry.dispose();
    if (this.mesh.material instanceof THREE.Material) {
      this.mesh.material.dispose();
    }
  }
}

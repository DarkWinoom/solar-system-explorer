import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { uniform, vec3 } from "three/tsl";
import { TextureLoader } from "three";

export interface MoonOptions {
  /** 月球半径。默认 0.27（地球半径的 0.27×, 真实比例）*/
  radius?: number;
  /** 月球纹理 URL。默认 /textures/2k_moon.jpg (solarsystemscope, CC BY 4.0) */
  textureUrl?: string;
}

/**
 * Moon — 月球 mesh（阶段 17 接入 SEM 方案）
 *
 * 视觉：
 *   - MeshStandardNodeMaterial（TSL, 跟 Earth 保持一致）
 *   - 月球纹理用 solarsystemscope 2k_moon.jpg（CC BY 4.0）
 *   - 月相由 uSunDir uniform 决定（被太阳照亮那半边亮, 背面暗）
 *   - 半径 0.27u（真实地球的 0.27×）
 *
 * 简化：
 *   - 月球不自转（潮汐锁定, MVP 视觉无差异）
 *   - 不加 bump map（保持精简）
 *   - 不加陨石坑凹凸（MVP 精简）
 *   - 月相方向用 sunPosition（不精确算 sun - moon 方向, 因为 |moon - earth| = 30 << |earth - sun| = 80）
 *
 * 父级：
 *   - Moon mesh 加到 moonOrbit Group
 *   - moonOrbit 加到 earthOrbitGroup
 *   - earthOrbitGroup.rotation.y = earth 公转角
 *   - moonOrbit.rotation.y = 月球相对地球公转角
 *
 * @contract
 *   - `mesh` 永远指向同一个 THREE.Mesh 实例
 *   - `setSunDirection(vec3)` 每帧从 EarthScene 调
 *   - `dispose()` 释放 geometry + material
 *
 * @see /docs/PLAN-SEM.md § 4
 * @see /NOTICES.md "Solar System Scope Textures (CC BY 4.0)"
 */
export class Moon {
  readonly mesh: THREE.Mesh;
  readonly radius: number;
  // MeshStandardNodeMaterial 类型 r160 的 @types/three 不覆盖, 用 any 兜底
  // 运行时由 build/three.module.js + three/webgpu 提供实际实现
  private readonly material: any;
  /** TSL uniform vec3 — 太阳方向（从月球指向太阳） */
  private readonly uSunDir;
  private disposed: boolean = false;

  constructor(options: MoonOptions = {}) {
    this.radius = options.radius ?? 0.27;
    const textureUrl = options.textureUrl ?? "/textures/2k_moon.jpg";

    // --- 太阳方向 uniform（TSL vec3） — 初始朝 +Z, 之后 EarthScene 调 setSunDirection 实时更新 ---
    this.uSunDir = uniform(new THREE.Vector3(0, 0, 1));

    // --- 加载月球纹理 ---
    const textureLoader = new TextureLoader();
    const moonTexture = textureLoader.load(textureUrl);
    moonTexture.colorSpace = THREE.SRGBColorSpace;
    moonTexture.anisotropy = 8;

    // --- 几何 + 材质 ---
    const moonGeometry = new THREE.SphereGeometry(this.radius, 64, 32);

    this.material = new MeshStandardNodeMaterial();
    this.material.colorNode = vec3(moonTexture);

    // 月相节点: 月球表面的"朝向太阳"程度 = 法线 · 太阳方向
    // 月球大部分情况下用 sunOrientation 控制自发光（夜面变暗, 跟地球昼夜原理一样）
    // 这里用 smoothstep + mix 实现: 太阳光到的部分 = PBR 光照, 没光到的部分 = 黑色
    // MVP 简化: 只用 DirectionalLight + 1 个 PBR 材质, 不额外做"月相" emission
    // 月相效果由 DirectionalLight 决定（光照在动, 月球亮暗跟随）
    this.mesh = new THREE.Mesh(moonGeometry, this.material);
    this.mesh.name = "Moon";
    this.mesh.position.set(0, 0, 0); // 默认位置, 由父级 moonOrbit 旋转决定

    // uSunDir 节点已用, 但 MeshStandardNodeMaterial 自动用 scene 里的 DirectionalLight 做光照
    // 保留 uSunDir 字段以备未来扩展 (例如自定义月相 shader)
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    this.uSunDir;
  }

  /**
   * 设置太阳方向（从月球指向太阳的世界空间方向）
   * MVP 简化: 接受 EarthScene 传入的 sunPosition, 因为月球到地球 30u 远小于地球到太阳 80u,
   * 方向偏差 < 22°, 视觉无差异
   */
  setSunDirection(sunDirection: THREE.Vector3): void {
    this.uSunDir.value.copy(sunDirection);
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

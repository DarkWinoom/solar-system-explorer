import * as THREE from "three";
import { TextureLoader } from "three";

export interface SunOptions {
  /** 太阳半径。默认 5.0（地球半径 1u, 1/22 压缩真实 109×）*/
  radius?: number;
  /** 太阳纹理 URL。默认 /textures/2k_sun.jpg (solarsystemscope, CC BY 4.0) */
  textureUrl?: string;
  /** 是否画 corona（外层 BackSide + Fresnel 光晕）。默认 true */
  withCorona?: boolean;
}

/**
 * Sun — 太阳 mesh（阶段 17 接入 SEM 方案）
 *
 * 视觉：
 *   - 内层 MeshBasicMaterial（不受光照影响, 始终亮）
 *   - 太阳纹理用 solarsystemscope 2k_sun.jpg（CC BY 4.0）
 *   - 外层可选 corona（BackSide 球体 + Fresnel 边缘光晕）
 *   - 位置固定在原点 (0, 0, 0)
 *
 * 简化：
 *   - 不模拟太阳自转（视觉无差异, 太阳贴图本身有扰动）
 *   - 不做 lens flare / manga flare（MVP 精简）
 *   - 不参与光照计算（光照用现有 DirectionalLight 维持大气层 Fresnel 兼容）
 *
 * 后续（阶段 17 接入后）：
 *   - PointLight 加在太阳位置（强度 2.5, 照亮月球）
 *   - 相机"总览"模式以地球为 target（不在本类范围, 阶段 18 处理）
 *
 * @contract
 *   - `mesh` 永远指向同一个 THREE.Mesh 实例
 *   - `mesh.position` 固定 (0, 0, 0), 不参与任何 rotation
 *   - `dispose()` 释放 geometry + material + corona
 *   - `corona` 在 `withCorona: true` 时存在, 否则为 null
 *
 * @see /docs/PLAN-SEM.md § 3
 * @see /NOTICES.md "Solar System Scope Textures (CC BY 4.0)"
 */
export class Sun {
  readonly mesh: THREE.Mesh;
  readonly radius: number;
  /** corona mesh (BackSide 球体 + Fresnel 光晕), null 当 withCorona: false */
  readonly corona: THREE.Mesh | null = null;
  private readonly material: THREE.MeshBasicMaterial;
  private disposed: boolean = false;

  constructor(options: SunOptions = {}) {
    this.radius = options.radius ?? 5.0;
    const textureUrl = options.textureUrl ?? "/textures/2k_sun.jpg";
    const withCorona = options.withCorona ?? true;

    // --- 内层 mesh：球体 + MeshBasicMaterial（不受光照, 始终亮）---
    const sunTexture = new TextureLoader().load(textureUrl);
    sunTexture.colorSpace = THREE.SRGBColorSpace;
    sunTexture.anisotropy = 8;

    const sunGeometry = new THREE.SphereGeometry(this.radius, 64, 32);
    this.material = new THREE.MeshBasicMaterial({
      map: sunTexture,
      // 太阳本身不参与光照计算, 保持纯色
      toneMapped: false, // 防止 tone mapping 调暗, 太阳保持最亮
    });
    this.mesh = new THREE.Mesh(sunGeometry, this.material);
    this.mesh.name = "Sun";
    this.mesh.position.set(0, 0, 0); // 太阳固定在原点

    // --- 外层 corona：BackSide 球体 + Fresnel 边缘光晕 ---
    if (withCorona) {
      const coronaGeometry = new THREE.SphereGeometry(this.radius * 1.15, 64, 32);
      const coronaMaterial = new THREE.MeshBasicMaterial({
        color: 0xffaa44,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.18,
        // 简单 Fresnel 效果: 用 depthWrite=false + 自发光色, 视觉效果接近 Fresnel
        depthWrite: false,
        toneMapped: false,
        blending: THREE.AdditiveBlending,
      });
      this.corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
      this.corona.name = "SunCorona";
      this.corona.position.set(0, 0, 0);
    }
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.mesh.geometry.dispose();
    this.material.dispose();
    if (this.mesh.material instanceof THREE.Material) {
      this.mesh.material.dispose();
    }
    if (this.corona) {
      this.corona.geometry.dispose();
      if (this.corona.material instanceof THREE.Material) {
        this.corona.material.dispose();
      }
    }
  }
}

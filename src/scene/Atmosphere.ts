import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  cameraPosition,
  color,
  mix,
  normalWorldGeometry,
  positionWorld,
  uniform,
  vec4,
} from "three/tsl";

/**
 * 大气层（Atmosphere / Glow）
 *
 * 视觉：地球外圈淡淡彩色光晕
 *   - 朝光侧（晨昏线附近）= 暖橙（大气散射的"红色"分量，类似真实日落）
 *   - 背光侧（白天天顶）= 冷蓝（大气散射的"蓝色"分量，瑞利散射）
 *   - 夜面侧 = 几乎不可见（无太阳照射，无散射）
 *
 * 实现要点：
 *   - 几何：跟地球共用 SphereGeometry（外部传入），scale 1.04
 *   - 材质：MeshBasicNodeMaterial + side: BackSide（只渲染球的"内壁"） + transparent
 *   - 颜色：mix(twilight, day, sunOrientation.smoothstep(-0.25, 0.75))
 *   - 透明度：Fresnel 边缘最强 + sunOrientation 限制（夜面 alpha ≈ 0）
 *     Fresnel 公式：1 - abs(dot(viewDir, normalWorld))
 *     pow(3) 让边缘衰减更陡（中心透明，边缘明显）
 *
 * 关键决策：完全对齐 Three.js 官方 webgpu_tsl_earth.html 的 atmosphere 实现
 *
 * @contract
 *   - `mesh` 永远指向同一个 THREE.Mesh 实例
 *   - `geometry` 外部传入（跟 Earth 共用 SphereGeometry 节省内存）
 *   - `setSunDirection(vec3)` 由 EarthScene 调用,跟地球同步
 *   - `dispose()` 释放 material（geometry 由 Earth 释放）
 */
export interface AtmosphereOptions {
  /** 几何（外部传入，通常是 earth 的 SphereGeometry） */
  geometry: THREE.BufferGeometry;
  /** 球体缩放。默认 1.04 */
  scale?: number;
}

export class Atmosphere {
  readonly mesh: THREE.Mesh;
  // MeshBasicNodeMaterial r185 没有显式 d.ts,用 any 兜底
  private readonly material: any;
  /** TSL uniform vec3 — 太阳方向(从地球指向太阳) */
  private readonly uSunDir: any;

  constructor(options: AtmosphereOptions) {
    const scale = options.scale ?? 1.04;

    // --- 太阳方向 uniform（与 Earth 共用方向,每帧同步） ---
    this.uSunDir = uniform(new THREE.Vector3(0, 0, 1));

    // --- TSL 节点：Fresnel + sunOrientation ---
    const viewDirection = positionWorld.sub(cameraPosition).normalize();
    const fresnel = viewDirection.dot(normalWorldGeometry).abs().oneMinus().toVar();
    const sunOrientation = normalWorldGeometry.dot(this.uSunDir.normalize()).toVar();

    // --- 大气颜色：朝光侧 = 暖橙,背光侧 = 冷蓝 ---
    const twilightColor = uniform(color("#bc490b")); // 暖橙（朝光）
    const dayColor = uniform(color("#4db2ff"));      // 冷蓝（背光）
    const atmosphereColor = mix(
      twilightColor,
      dayColor,
      sunOrientation.smoothstep(-0.25, 0.75)
    );

    // --- 透明度：Fresnel 边缘最强 + 夜面 ≈ 0 ---
    let alpha = fresnel.remap(0.73, 1, 1, 0).pow(3);
    alpha = alpha.mul(sunOrientation.smoothstep(-0.5, 1));

    // --- 材质：BackSide + transparent ---
    this.material = new MeshBasicNodeMaterial({
      side: THREE.BackSide,
      transparent: true,
    });
    this.material.outputNode = vec4(atmosphereColor, alpha);

    this.mesh = new THREE.Mesh(options.geometry, this.material);
    this.mesh.scale.setScalar(scale);
    this.mesh.renderOrder = 1; // 渲染在地球之后
  }

  /**
   * 同步太阳方向(由 EarthScene 调用,与地球 uSunDir 同步)
   * @param direction THREE.Vector3 太阳相对地球的方向
   */
  setSunDirection(direction: THREE.Vector3): void {
    this.uSunDir.value.copy(direction);
  }

  dispose(): void {
    this.material.dispose();
  }
}

import * as THREE from "three";
import { PointsNodeMaterial } from "three/webgpu";
import { attribute, sin, uniform } from "three/tsl";

/**
 * Mulberry32 — 小型 32-bit seeded PRNG
 */
function mulberry32(seed: number): () => number {
  return function (): number {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface StarsOptions {
  /** 星点数量。默认 4000 */
  count?: number;
  /** 球面半径。默认 50 */
  radius?: number;
  /** 随机种子。默认 1337 */
  seed?: number;
}

/**
 * Stars — 背景星空（TSL PointsNodeMaterial 实现）
 *
 * 关键决策：
 *   - WebGPURenderer 不接受传统 ShaderMaterial,只能用 NodeMaterial
 *   - 用 PointsNodeMaterial + 静态 color/size 基础参数（不在 sizeNode/colorNode 节点上做 per-vertex 控制）
 *   - **闪烁通过 attribute 传入频率/相位,在 vertex shader 中由 Three.js 内部处理**
 *   - 实际闪烁需要 PointsNodeMaterial.sizeNode + custom TSL vertex — 这部分在 WebGL2 backend 下可能不 work
 *
 * 简化策略：
 *   - 4 色 + 3 大小分级通过 vertex colors + 静态 size 表达
 *   - 闪烁:**先用 PointsNodeMaterial.sizeAttenuation 静态星点**,TSL 闪烁作为可选增强
 *   - 实际工作后,看 TSL sizeNode 是否需要,再考虑手动 uniform 驱动
 *
 * 配色（4 类恒星光谱）：
 *   - 70% 冷白 / 淡黄（类太阳 G 型）
 *   - 15% 偏蓝（O / B 型热星）
 *   - 10% 偏橙（K 型）
 *   - 5% 偏红（M 型红巨星）
 */
export class Stars {
  readonly points: THREE.Points;

  // PointsNodeMaterial 类型 r185 没有显式 d.ts,用 any 兜底
  private readonly material: any;
  private readonly geometry: THREE.BufferGeometry;
  /** TSL uniform float — 手动驱动闪烁（如果 sizeNode 能 work 的话） */
  private readonly uTime: any;

  constructor(options: StarsOptions = {}) {
    const count = options.count ?? 4000;
    const radius = options.radius ?? 50;
    const seed = options.seed ?? 1337;
    const rng = mulberry32(seed);

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const frequencies = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // 球面均匀分布（拒绝采样）
      let x: number, y: number, z: number, len: number;
      do {
        x = rng() * 2 - 1;
        y = rng() * 2 - 1;
        z = rng() * 2 - 1;
        len = x * x + y * y + z * z;
      } while (len > 1 || len < 0.0001);
      const norm = radius / Math.sqrt(len);
      positions[i * 3] = x * norm;
      positions[i * 3 + 1] = y * norm;
      positions[i * 3 + 2] = z * norm;

      // 颜色分层（4 类恒星光谱）
      const r = rng();
      if (r < 0.7) {
        // 70% 冷白 / 淡黄
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.9 + rng() * 0.1;
        colors[i * 3 + 2] = 0.8 + rng() * 0.2;
      } else if (r < 0.85) {
        // 15% 偏蓝
        colors[i * 3] = 0.4 + rng() * 0.3;
        colors[i * 3 + 1] = 0.6 + rng() * 0.3;
        colors[i * 3 + 2] = 1.0;
      } else if (r < 0.95) {
        // 10% 偏橙
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.5 + rng() * 0.3;
        colors[i * 3 + 2] = 0.3 + rng() * 0.2;
      } else {
        // 5% 偏红
        colors[i * 3] = 1.0;
        colors[i * 3 + 1] = 0.3 + rng() * 0.2;
        colors[i * 3 + 2] = 0.2 + rng() * 0.1;
      }

      // 闪烁参数（保留数据,后续 sizeNode 实现时用）
      frequencies[i] = 0.5 + rng() * 0.5;
      phases[i] = rng() * Math.PI * 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("phase", new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute(
      "frequency",
      new THREE.BufferAttribute(frequencies, 1)
    );
    this.geometry = geometry;

    // 手动 uniform 驱动闪烁(在 WebGL2 backend 下,如果 sizeNode work 就能用)
    this.uTime = uniform(0.0);

    // 尝试 1：sizeNode + 闪烁
    // baseSize 用 TSL float 节点(不能用 number 直接参与 TSL 运算)
    const baseSize = uniform(1.5);
    const freqAttr = attribute("frequency", "float");
    const phaseAttr = attribute("phase", "float");
    const blink = sin(this.uTime.mul(freqAttr).add(phaseAttr));
    const sizeNode = blink.mul(0.3).add(0.7).mul(baseSize);

    const material = new PointsNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      size: 2.0, // 基础 size 兜底（如果 sizeNode 失效）
    });
    // 同时设 sizeNode 尝试闪烁
    material.sizeNode = sizeNode;
    material.colorNode = attribute("color", "vec3");
    this.material = material;

    this.points = new THREE.Points(geometry, this.material);
    this.points.renderOrder = -1;
    this.points.frustumCulled = false;
  }

  /**
   * 每帧调用：把 elapsed 推给 uTime uniform
   */
  update(elapsedSeconds: number): void {
    this.uTime.value = elapsedSeconds;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

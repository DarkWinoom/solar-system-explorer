import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  bumpMap,
  cameraPosition,
  color,
  max,
  mix,
  normalWorldGeometry,
  output,
  positionWorld,
  step,
  texture,
  uniform,
  uv,
  vec3,
  vec4,
} from "three/tsl";
import { SpeedTween } from "./SpeedTween";

/**
 * 1:1 现实自转角速度（rad / sec）
 * 24h 旋转 2π → ROTATION_SPEED = 2π / 86400 ≈ 7.27e-5
 */
const ROTATION_SPEED = (2 * Math.PI) / 86400;

export interface EarthOptions {
  /** 球体半径。默认 1.0 */
  radius?: number;
  /** 经度段数。默认 64 */
  widthSegments?: number;
  /** 纬度段数。默认 64 */
  heightSegments?: number;
  /** 白天纹理 URL。默认 /textures/earth-day.jpg */
  dayTextureUrl?: string;
  /** 夜面纹理（城市灯光）URL。默认 /textures/earth-night.jpg */
  nightTextureUrl?: string;
  /** Bump / roughness / clouds 整合纹理 URL。默认 /textures/earth-bump-roughness-clouds.jpg */
  bumpTextureUrl?: string;
}

/**
 * Earth — 3D 地球（WebGPU + TSL MeshStandardNodeMaterial）
 *
 * 关键决策：完全对齐 Three.js 官方 webgpu_tsl_earth.html 示例
 *   - 不用 ShaderMaterial + GLSL 自写昼夜 shader
 *   - 改用 MeshStandardNodeMaterial（TSL 节点系统）：
 *     · DirectionalLight 提供 PBR 灯光（日面/夜面自动由光照决定）
 *     · 夜面纹理通过 emissive 通道叠加（城市灯光效果）
 *     · bumpMap 通道用 bump_roughness_clouds 整合图：r=bump g=roughness b=clouds
 *   - 太阳方向通过 uniform vec3 uSunDir 传入（TSL 算 sunOrientation = normalWorldGeometry.dot(normalize(uSunDir))）
 *   - 阶段 7（大气层 BackSide Fresnel）和阶段 8（OrbitControls）后续接
 *
 * 渲染管线要求：
 *   - 必须用 WebGPURenderer（不是 WebGLRenderer）
 *   - 浏览器需支持 WebGPU（Chrome / Edge 113+）
 *   - Three.js r160+ 的 three/webgpu + three/tsl 入口
 *
 * @contract
 *   - `mesh` 永远指向同一个 THREE.Mesh 实例
 *   - 纹理异步加载（Three.js TextureLoader.load 立即返回，图像后台加载）
 *   - `update(elapsed)` 必须每帧调用
 *   - `setSunDirection(vec3)` 由 EarthScene 调用，每帧从 sunDirection(new Date()) 算
 *   - `dispose()` 释放 geometry + material
 */
export class Earth {
  readonly mesh: THREE.Mesh;
  readonly radius: number;

  // MeshStandardNodeMaterial 类型 r160 的 @types/three 不覆盖, 用 any 兜底
  // 运行时由 build/three.module.js + examples/jsm/... 提供实际实现
  private readonly material: any;
  /**
   * 虚拟累计时间(秒) — 1:1 真实时间按 rotationSpeedMultiplier 加权
   * 不用外部 elapsed,因为乘数变化时 elapsed 不连续
   */
  private virtualElapsed: number = 0;
  /**
   * 速度倍数 tween(独立 class,可单测)
   * 阶段 11 启动 60x → locate 完成 3s 减速回 1x
   */
  private speedTween: SpeedTween = new SpeedTween();
  /** TSL uniform vec3 — 太阳相对地球的方向（从地球指向太阳） */
  private readonly uSunDir;

  constructor(options: EarthOptions = {}) {
    this.radius = options.radius ?? 1.0;
    const widthSegments = options.widthSegments ?? 64;
    const heightSegments = options.heightSegments ?? 64;
    const dayTextureUrl =
      options.dayTextureUrl ?? "/textures/earth-day.jpg";
    const nightTextureUrl =
      options.nightTextureUrl ?? "/textures/earth-night.jpg";
    const bumpTextureUrl =
      options.bumpTextureUrl ?? "/textures/earth-bump-roughness-clouds.jpg";

    // --- 太阳方向 uniform（TSL vec3） — 初始朝 +Z, 之后 EarthScene 调 setSunDirection 实时更新 ---
    this.uSunDir = uniform(new THREE.Vector3(0, 0, 1));

    // --- 加载 3 张官方 4096 纹理 ---
    const textureLoader = new THREE.TextureLoader();
    const dayTexture = textureLoader.load(dayTextureUrl);
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.anisotropy = 8;

    const nightTexture = textureLoader.load(nightTextureUrl);
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.anisotropy = 8;

    const bumpRoughnessCloudsTexture = textureLoader.load(bumpTextureUrl);
    bumpRoughnessCloudsTexture.anisotropy = 8;

    // --- 核心 TSL 节点（完全照抄官方示例） ---

    // sun orientation: 法线 · 太阳方向
    // r185+: normalWorldGeometry
    const sunOrientation = normalWorldGeometry.dot(this.uSunDir.normalize()).toVar();

    // 云强度：从整合图的蓝通道取, smoothstep(0.2, 1)
    const cloudsStrength = texture(bumpRoughnessCloudsTexture, uv()).b.smoothstep(0.2, 1);

    // --- 大气层节点（与 Atmosphere.ts 共享的逻辑）---
    // 跟 Atmosphere.ts 独立定义(TSL 节点无副作用,重复定义 OK;不共享 uniform 以便 Earth 和 Atmosphere mesh 各自独立)
    // 颜色值在 Atmosphere.ts 同步,改色时两处都要改(阶段 8 之后可以提到 EarthScene 共享)
    const viewDirection = positionWorld.sub(cameraPosition).normalize();
    const fresnel = viewDirection.dot(normalWorldGeometry).abs().oneMinus().toVar();

    // 大气颜色 uniform(暖橙=夜面边缘 / 冷蓝=白天天顶)
    const atmosphereTwilightColor = uniform(color("#bc490b"));
    const atmosphereDayColor = uniform(color("#4db2ff"));
    const atmosphereColor = mix(
      atmosphereTwilightColor,
      atmosphereDayColor,
      sunOrientation.smoothstep(-0.25, 0.75)
    );

    // --- 材质节点（MeshStandardNodeMaterial） ---
    this.material = new MeshStandardNodeMaterial();

    // 1) 颜色：日纹 + 云层混合（云多的地方偏白）
    this.material.colorNode = mix(texture(dayTexture), vec3(1), cloudsStrength.mul(2));

    // 2) 粗糙度：roughness 通道 (g) + 云层（云有显著 roughness 提升）
    const roughness = max(
      texture(bumpRoughnessCloudsTexture).g,
      step(0.01, cloudsStrength)
    );
    this.material.roughnessNode = roughness.remap(0, 1, 0.25, 0.35);

    // 3) 自发光 = 夜面城市灯光（始终亮, 不受光影响）

    // 4) 输出：3 段 mix ——
    //   a) 夜面纹理 vs PBR 日面（按 dayStrength 混合）
    //   b) 上面结果 vs 大气颜色（按 atmosphereMix 混合, 让地球朝光侧边缘有一圈暖橙光）
    //   c) 跟官方 webgpu_tsl_earth.html 完全一致（外层 BackSide atmosphere + 表面 atmosphereMix 双层）
    const night = texture(nightTexture);
    const dayStrength = sunOrientation.smoothstep(-0.25, 0.5);
    const atmosphereDayStrength = sunOrientation.smoothstep(-0.5, 1);
    const atmosphereMix = atmosphereDayStrength.mul(fresnel.pow(2)).clamp(0, 1);
    let finalOutput = mix(night.rgb, output.rgb, dayStrength);
    finalOutput = mix(finalOutput, atmosphereColor, atmosphereMix);
    this.material.outputNode = vec4(finalOutput, output.a);

    // 5) 法线：bumpMap 从整合图的红通道（bump 高度）算
    const bumpElevation = max(
      texture(bumpRoughnessCloudsTexture).r,
      cloudsStrength
    );
    this.material.normalNode = bumpMap(bumpElevation);

    // --- 几何 + mesh ---
    const geometry = new THREE.SphereGeometry(
      this.radius,
      widthSegments,
      heightSegments
    );
    this.mesh = new THREE.Mesh(geometry, this.material);
  }

  /**
   * 设置太阳方向（从地球指向太阳的方向）
   * 由 EarthScene 在每帧 / 按需调用,从 sunDirection(new Date()) 算
   */
  setSunDirection(direction: THREE.Vector3): void {
    // TSL uniform 的 .value 是 THREE.Vector3, 直接覆盖
    this.uSunDir.value.copy(direction);
  }

  /**
   * 每帧调用：自转(用 delta 而非 elapsed,因为速度倍数变化时 elapsed 不连续)
   * @param _elapsed 累计秒数(r185 Timer.getElapsed,目前不用,保留为 API 兼容)
   * @param delta 这一帧的 delta 秒数(r185 Timer.getDelta)
   */
  update(_elapsed: number, delta: number): void {
    // 1. 推进 speedTween
    this.speedTween.update();
    const speed = this.speedTween.value;
    // 2. 用 delta 累加 virtualElapsed(乘以当前 speed)
    this.virtualElapsed += delta * speed;
    // 3. 应用到 mesh
    this.mesh.rotation.y = this.virtualElapsed * ROTATION_SPEED;
  }

  /**
   * 设置旋转速度倍数(可带过渡)
   * @param target 目标倍数(0=暂停, 1=1:1 真实, 60=60x)
   * @param durationMs 过渡时长(毫秒);0 = 立即切换
   *
   * 阶段 11 用法:
   *   - 启动: setRotationSpeedMultiplier(60, 0) — 立即 60x
   *   - locate 完成: setRotationSpeedMultiplier(1, 3000) — 3s 减速回 1x
   */
  setRotationSpeedMultiplier(target: number, durationMs: number = 0): void {
    this.speedTween.set(target, durationMs);
  }

  /**
   * 当前自转角(度, 0-360)
   */
  get rotationDegrees(): number {
    return (this.virtualElapsed * ROTATION_SPEED * 180) / Math.PI;
  }

  /**
   * 当前旋转速度倍数(用于 devtools 调试)
   */
  get currentRotationSpeedMultiplier(): number {
    return this.speedTween.value;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

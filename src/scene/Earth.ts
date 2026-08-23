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
   * 1:1 现实自转角速度（rad / sec,保留供 get rotationDegrees / currentRotationSpeedMultiplier 兼容用）
   * 24h 旋转 2π → ROTATION_SPEED = 2π / 86400 ≈ 7.27e-5
   */
  private static readonly ROTATION_SPEED = (2 * Math.PI) / 86400;
  /**
   * ⚠️ 2026-08-20 修复:sun position bug
   *
   * 历史:Earth mesh 之前用 `this.mesh.rotation.y += dt` 模拟"地球自转",但
   * latLonToCameraPosition(lat, lon) 算的是**球面 local 3D 位置**,而 mesh
   * 自转后球面 local (31, 121) 的 world 位置变成 (31, 121 - rotation) 地理
   * 位置,导致"看上海时间 = 实际看伦敦附近",太阳光斑/夜面全错位。
   *
   * 修法:删 mesh.rotation.y 赋值,大陆固定。视觉"自转" = uSunDir 跟着 UTC
   * 时间变(光照在动),更直观也更符合 latLonToCameraPosition 的"地理 lon"语义。
   * startup 3s 高速旋转改用 OrbitControls.autoRotate(相机绕地球转,效果一样)。
   */
  private virtualElapsed: number = 0;
  /** TSL uniform vec3 — 太阳相对地球的方向（从地球指向太阳） */
  private readonly uSunDir;
  /** 总览模式的非物理展示补光；地球视角保持 0，避免冲淡真实昼夜。 */
  private readonly uOverviewFill;

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
    this.uOverviewFill = uniform(0);

    // --- 加载 3 张官方 4096 纹理 ---
    const textureLoader = new THREE.TextureLoader();
    const dayTexture = textureLoader.load(dayTextureUrl);
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    dayTexture.anisotropy = 8;
    // v19g 修复: NASA Blue Marble 纹理 u=0 是 180°W (dateline), u=0.5 是 0° (本初),
    //   但 v19g latLon 公式下 latLon(0, 0) 渲染到 Three.js -X 半球 (u=0 位置)
    //   跟"地理 0° (本初)" 语义错位 180°。修法: texture.offset.x = 0.5 旋转 NASA 纹理
    //   让 u=0 = 0° (本初), u=0.5 = 180° (dateline), 跟 latLon 公式对齐。
    //   不动 latLon 公式, 不动昼夜逻辑, 只旋转纹理贴图位置。
    //   用户报告: "上海 (latLon 0, 121) 渲染到北美偏东部 (差 180°)" — 这就是根因。
    dayTexture.offset.x = 0.5;
    // offset 会把 u=0.5~1 映射到 1~1.5；默认 ClampToEdgeWrapping 会让
    // 后半球永久采样最右一列像素。经度纹理必须在水平方向循环。
    dayTexture.wrapS = THREE.RepeatWrapping;

    const nightTexture = textureLoader.load(nightTextureUrl);
    nightTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.anisotropy = 8;
    // 夜面纹理也旋转 180° 保持跟 dayTexture 一致(否则月相/夜面大陆位置反)
    nightTexture.offset.x = 0.5;
    nightTexture.wrapS = THREE.RepeatWrapping;

    const bumpRoughnessCloudsTexture = textureLoader.load(bumpTextureUrl);
    bumpRoughnessCloudsTexture.anisotropy = 8;
    // bump map 也旋转 180° 保持跟 dayTexture 一致(否则山脉凹凸位置反)
    bumpRoughnessCloudsTexture.offset.x = 0.5;
    bumpRoughnessCloudsTexture.wrapS = THREE.RepeatWrapping;

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
    // 修复 v19i-3: dayStrength 范围 [0, 0.2] — 朝阳面 >0.2 就 100% day, 晨昏线只占 0~0.2 窄带
    const dayStrength = sunOrientation.smoothstep(0, 0.2);
    const atmosphereDayStrength = sunOrientation.smoothstep(-0.25, 0.5);
    const atmosphereMix = atmosphereDayStrength.mul(fresnel.pow(2)).clamp(0, 1);
    // 修复 v19i-2: PBR output.rgb 在 forceWebGL backend 下输出≈黑色
    //   改用 texture(dayTexture) 直接采样作为 day side 颜色, 跳过 PBR 受光计算
    // 修复 v19i-3: dayStrength 区间 [-0.25, 0.5] 太宽, 朝阳面 0.3~0.5 区域 dayStrength<1
    //   → night texture 城市灯光在朝阳面 30%+ 渗出, 视觉上"朝阳面是夜面"
    //   改用 [0, 0.2] 缩窄到朝阳面 0.2 以上就 100% 是白天, 晨昏线只占 0~0.2 窄区
    // 修复 v19i-4: 云丢失 — 把 cloud mix (vec3(1) 偏白) 加到 dayColor 上, 跟原 colorNode 一致
    //   修复后: 朝阳面 = dayTexture(白偏云) + 蓝天 + 海洋; 夜面 = night texture (城市灯光)
    //   晨昏线 = 快速从 day 过渡到 night, atmosphere twilight 暖橙覆盖边缘
    const dayColor = mix(texture(dayTexture), vec3(1), cloudsStrength.mul(2));
    // 总览模式只给暗面极低的蓝色基底和边缘泛光，保留黑色宇宙背景以及昼夜对比。
    const nightColor = night.rgb.add(
      vec3(0.012, 0.03, 0.08).mul(this.uOverviewFill),
    );
    let finalOutput = mix(nightColor, dayColor.rgb, dayStrength);
    finalOutput = mix(finalOutput, atmosphereColor, atmosphereMix);
    finalOutput = finalOutput.add(
      vec3(0.03, 0.12, 0.3)
        .mul(fresnel.pow(3))
        .mul(this.uOverviewFill),
    );
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

  /** 仅总览开启克制的暗面可读性增强；不改变太阳方向或物理昼夜判定。 */
  setOverviewMode(enabled: boolean): void {
    this.uOverviewFill.value = enabled ? 1 : 0;
  }

  /**
   * 每帧调用:大陆固定,光照在 uSunDir 里跟着 UTC 变(EarthScene.setSunDirection)。
   * 历史:之前用 mesh.rotation.y 模拟"地球自转",但这跟 latLonToCameraPosition
   * 的"地理 lon"语义冲突,导致太阳位置错位。详见 virtualElapsed 注释。
   *
   * @param elapsed 累计秒数(r185 Timer.getElapsed,目前仍用于 get rotationDegrees 兼容)
   * @param _delta 这一帧的 delta 秒数(r185 Timer.getDelta,目前不用)
   */
  update(elapsed: number, _delta: number): void {
    this.virtualElapsed = elapsed;
    // 不再改 mesh.rotation.y(大陆固定)
  }

  /**
   * 兼容旧 API,实际"地球自转"改用光照(uSunDir)跟 UTC 时间变。
   * 大陆固定后不需要 mesh rotation,这个方法保留为 no-op 兼容历史调用。
   *
   * @param _target 目标倍数(0=暂停, 1=1:1 真实, 60=60x)— 忽略
   * @param _durationMs 过渡时长(毫秒);0 = 立即切换 — 忽略
   */
  setRotationSpeedMultiplier(_target: number, _durationMs: number = 0): void {
    // no-op:大陆固定后,mesh 不再自转。光照(uSunDir)由 EarthScene 每帧
    // 按 UTC 时间算,跟"1:1 真实时间"语义等价(大陆纹理固定,昼夜跟着 UTC 漂移)。
  }

  /**
   * 当前自转角(度, 0-360) — 历史兼容,大陆固定后永远返回 0
   */
  get rotationDegrees(): number {
    return (this.virtualElapsed * Earth.ROTATION_SPEED * 180) / Math.PI;
  }

  /**
   * 当前旋转速度倍数(用于 devtools 调试) — 大陆固定后永远 0
   */
  get currentRotationSpeedMultiplier(): number {
    return 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

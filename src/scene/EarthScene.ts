import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Stars } from "./Stars";
import { Earth } from "./Earth";
import { Atmosphere } from "./Atmosphere";
import { Sun } from "./Sun";
import { Moon } from "./Moon";
import {
  celestialState,
  overviewCameraPose,
  type CelestialState,
} from "../utils/orbits";

export type SceneViewMode = "overview" | "sun" | "earth" | "moon";

/**
 * EarthScene — Three.js 场景容器（WebGPURenderer 模式）
 *
 * 架构（业界 pivot 模式 + 手动 position 双保险）：
 *   - 所有天体 mesh 直接 add 到 scene root（**不嵌套 group**）
 *   - 天体位置、地轴、昼夜材质与月相全部来自同一个 celestialState(instant)
 *   - 地球和大气层使用相同世界姿态，地球亮面始终面向原点太阳
 *   - 月球以日地连线为基准：新月在太阳侧，满月在背日侧
 *
 * 为什么不用嵌套 group 旋转（业界教程常见）？
 *   嵌套 group R(earthAngle) × T(80) × R(moonAngle) × T(30) 会让 earthAngle 同时影响 moon
 *   的旋转（数学上月球位置 = earthPos + R(earthAngle)*R(moonAngle)*30 ≠ 期望的 earthPos + R(moonAngle)*30）
 *   手动算 position 是最稳的写法，Three.js 矩阵嵌套对复合旋转不友好
 *
 * 渲染管线：
 *   - WebGPURenderer（不是 WebGLRenderer）
 *   - Earth 用 MeshStandardNodeMaterial（TSL，自定义昼夜 shader 复杂）
 *   - Moon 用 MeshStandardMaterial（标准 PBR，v19d 改回 — TSL 在 WebGL2 backend 不稳定）
 *   - Sun 用 MeshBasicMaterial（不受光照影响，自身发光）
 *   - 太阳 = DirectionalLight（位置固定原点、目标为地球）兼容大气层 shader + 照亮月球
 *   - 删 sunPointLight（v19d）: decay 1.5 让月球几乎收不到光, DirectionalLight 单光源足够
 *
 * 浏览器要求：Chrome / Edge 113+（WebGPU 支持）
 *
 * @contract
 *   - `scene` 永远指向同一个 THREE.Scene 实例
 *   - `camera` / `renderer` 永不重新创建,resize 只更新内部参数
 *   - `currentEarthWorldPosition` 每帧更新（tick 后立即可读）
 *   - `dispose()` 幂等（多次调用安全）
 *   - render loop 在 dispose 后停止
 */
export interface EarthSceneOptions {
  /** 场景挂载的 DOM 元素 */
  container: HTMLElement;
  /** 初始宽度；不传则用 container.clientWidth */
  width?: number;
  /** 初始高度；不传则用 container.clientHeight */
  height?: number;
  /** 背景色（深空黑）；默认 #02050f */
  backgroundColor?: number;
  /** 星空配置；不传则用默认 6000 颗星；传 false 关闭 */
  stars?: ConstructorParameters<typeof Stars>[0] | false;
  /** 地球配置；不传则用默认；传 false 关闭 */
  earth?: ConstructorParameters<typeof Earth>[0] | false;
}

function createOrbitGuide(radius: number, color: number): THREE.Line {
  const points: THREE.Vector3[] = [];
  const segments = 128;
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, -Math.sin(angle) * radius));
  }
  // WebGPURenderer 当前不支持 LineLoop；用首尾重复的 Line 表示闭合轨道。
  points.push(points[0].clone());
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material);
  line.renderOrder = 2;
  return line;
}

export class EarthScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  // WebGPURenderer 类型 r160 的 @types/three 不覆盖, 用 any 兜底
  readonly renderer: any;

  private readonly container: HTMLElement;
  private readonly clock: THREE.Timer;
  /** 太阳 DirectionalLight — 兼容现有大气层 Fresnel shader（v19b 决策） */
  private readonly sun: THREE.DirectionalLight;
  /** 总览模式的展示性补光，只增强月球的暗面可读性。 */
  private readonly overviewFillLight: THREE.HemisphereLight;
  private readonly earthOrbitGuide: THREE.Line;
  private readonly moonOrbitGuide: THREE.Line;
  private overviewMode: boolean = false;
  private focusMode: SceneViewMode = "earth";
  /** 太阳 mesh — 阶段 17 接入 */
  sunMesh: Sun | null = null;
  private stars: Stars | null = null;
  /**
   * 当前地球公转角度(弧度) — tick() 每帧从 new Date() 算
   * 暴露 public 供测试/调试读
   */
  currentEarthOrbitAngle: number = 0;
  /**
   * 当前月球公转角度(弧度) — tick() 每帧从 new Date() 算
   * 暴露 public 供测试/调试读
   */
  currentMoonOrbitAngle: number = 0;
  /**
   * 当前地球世界坐标位置（tick() 每帧算）— 阶段 18d 暴露给 app.ts 用于相机 tween
   * 复用 Vector3 实例避免每帧 new（GC 友好）
   */
  readonly currentEarthWorldPosition: THREE.Vector3 = new THREE.Vector3(80, 0, 0);
  /** 当前月球世界坐标，供月球视角和相机动画读取。 */
  readonly currentMoonWorldPosition: THREE.Vector3 = new THREE.Vector3();
  /** 地球本地经纬度坐标转为当前世界坐标时使用的姿态。 */
  readonly currentEarthOrientation: THREE.Quaternion = new THREE.Quaternion();
  /**
   * Earth 暴露 public 供 app.ts 控制
   * dispose 时会重置为 null,所以不能 readonly
   */
  earth: Earth | null = null;
  private atmosphere: Atmosphere | null = null;
  /**
   * 月球 mesh — 阶段 17 接入
   * 直接 add 到 scene，position 每帧手动设
   * dispose 时会重置为 null
   */
  moon: Moon | null = null;
  /**
   * OrbitControls — 拖拽/缩放交互
   * 暴露 public 让 UIRoot 等 caller 能访问
   */
  controls: any = null;
  private disposed: boolean = false;
  /**
   * 阶段 18d: 相机 tween 进行中标记
   * tick() 在 isCameraTweening=true 时不覆盖 controls.target, 避免跟 tween 内部 lerp 冲突
   */
  isCameraTweening: boolean = false;

  constructor(options: EarthSceneOptions) {
    this.container = options.container;
    const width = options.width ?? options.container.clientWidth;
    const height = options.height ?? options.container.clientHeight;

    // --- Scene ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(
      options.backgroundColor ?? 0x02050f,
    );

    // --- Camera — fov 25 + far 1000 (修复 v19a: far 100 太小, Stars 250 被切) ---
    // 修复 v19b: 构造时不预设 camera.position + lookAt(0,0,0) — 默认值 (0,0,0) 位置是太阳内部
    // camera 摆位交给 app.ts 启动时设置(camera.position + controls.target 都对齐到地球)
    this.camera = new THREE.PerspectiveCamera(25, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);

    // --- Renderer (WebGPURenderer) ---
    this.renderer = new WebGPURenderer({
      antialias: true,
      forceWebGL: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(options.backgroundColor ?? 0x02050f, 1);
    this.container.appendChild(this.renderer.domElement);

    // --- 太阳 DirectionalLight — 兼容大气层 Fresnel shader + 照亮月球 (v19d 改用 DirectionalLight 单光源) ---
    // 修复 v19c: 之前 target 默认 (0,0,0) + position.copy(sunPosition) → 光方向 = target - position
    //   = (0,0,0) - sunPos = -sunPos, 法线与光方向 dot 后朝阳面 dot<0 = 黑, 背阳面亮 = 昼夜反了
    // 修法: target.position = earthPos, 每帧 tick 同步
    //   光方向 = earthPos - sunPos = 正确从太阳射向地球
    // 修复 v19d: 删 PointLight (decay 1.5 + distance 80u 让月球几乎收不到光)
    //   DirectionalLight 没有距离衰减, 平行光, 完美模拟"太阳光" 模型, 月球标准 PBR 材质能正常响应
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.position.set(0, 0, 3); // 初始占位, tick 每帧覆盖
    this.sun.target.position.set(80, 0, 0); // 初始看地球位置, tick 每帧覆盖
    this.scene.add(this.sun);
    // 必须 add target 到 scene, 否则 target.matrixWorld 不更新, 光方向错
    this.scene.add(this.sun.target);

    // 背景维持纯黑；总览模式才提高这盏半球补光，避免月球在背日侧完全消失。
    this.overviewFillLight = new THREE.HemisphereLight(0x7aa7ff, 0x070b18, 0.04);
    this.scene.add(this.overviewFillLight);

    // --- 太阳 mesh — 阶段 17 接入，半径 5u, 固定原点 ---
    // 修复 v19b: 关闭 corona（之前用 0xffaa44 棕黄, 像一圈难看的边框）
    // 视觉上让 sun mesh 自身足够亮（emissive + toneMapping: false），不需要外圈
    this.sunMesh = new Sun({ radius: 5.0, withCorona: false });
    this.scene.add(this.sunMesh.mesh);
    if (this.sunMesh.corona) {
      this.scene.add(this.sunMesh.corona);
    }

    // 轨道线只在总览显示，是空间关系的阅读辅助而非物理发光体。
    this.earthOrbitGuide = createOrbitGuide(80, 0x35649a);
    this.moonOrbitGuide = createOrbitGuide(30, 0x7a869a);
    this.earthOrbitGuide.visible = false;
    this.moonOrbitGuide.visible = false;
    this.scene.add(this.earthOrbitGuide, this.moonOrbitGuide);

    // --- 星空（GLSL ShaderMaterial, WebGPU 兼容） ---
    if (options.stars !== false) {
      this.stars = new Stars(options.stars);
      this.scene.add(this.stars.points);
    }

    // --- 地球 + 大气层 + 月球（阶段 19b 重写：所有 mesh 直接 add 到 scene, 不嵌套 group） ---
    if (options.earth !== false) {
      this.earth = new Earth(options.earth);
      this.scene.add(this.earth.mesh);

      this.atmosphere = new Atmosphere({ geometry: this.earth.mesh.geometry });
      this.scene.add(this.atmosphere.mesh);

      this.moon = new Moon({ radius: 0.5 });
      this.scene.add(this.moon.mesh);
    }

    // --- OrbitControls（拖拽/缩放）---
    // 阶段 19a: 范围 [1.5, 200] 兼容地球视角(贴近) + 总览模式(拉远看全系统)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 200;
    // 修复 v19b: 默认 controls.target 设为地球位置(避免初始帧渲染时 target=(0,0,0) 太阳)
    // tick 跑后会被每帧 currentEarthWorldPosition 覆盖
    this.controls.target.set(80, 0, 0);

    // 让首帧的太阳、地球、月球和相机 target 已经处于同一时刻的状态。
    this.applyCelestialState(celestialState(new Date()));
    this.setViewMode("earth");

    // Resize handler
    window.addEventListener("resize", this.onResize);

    // Clock（r185+ 用 Timer 替代 Clock）
    this.clock = new THREE.Timer();
    this.clock.connect(document);

    // WebGPURenderer 用 setAnimationLoop 替代 raf
    this.renderer.setAnimationLoop(this.tick);

    console.log("[3d-earth] EarthScene initialized (WebGPU + TSL, pivot mode)");
  }

  /** 把地球本地坐标中的偏移转换为当前世界坐标，供按经纬度定位相机。 */
  localEarthOffsetToWorld(
    localOffset: THREE.Vector3,
    out: THREE.Vector3 = new THREE.Vector3(),
  ): THREE.Vector3 {
    return out
      .copy(localOffset)
      .applyQuaternion(this.currentEarthOrientation)
      .add(this.currentEarthWorldPosition);
  }

  /**
   * 总览相机的确定性构图：看向日地中点，从黄道侧上方观察。
   * 同一个 celestialState 必然得到相同的 target 与 position；不依赖渲染帧时间。
   */
  getOverviewCameraPose(): { position: THREE.Vector3; target: THREE.Vector3 } {
    return overviewCameraPose(this.currentEarthWorldPosition);
  }

  /** 太阳中心视角：保留稳定的侧上方偏移，用户可继续自由旋转。 */
  getSunCameraPose(): { position: THREE.Vector3; target: THREE.Vector3 } {
    const earthDirection = this.currentEarthWorldPosition.clone().normalize();
    const tangent = new THREE.Vector3(0, 1, 0).cross(earthDirection).normalize();
    return {
      target: new THREE.Vector3(),
      position: earthDirection
        .multiplyScalar(19)
        .addScaledVector(tangent, 4)
        .add(new THREE.Vector3(0, 6, 0)),
    };
  }

  /** 月球中心视角：略偏离日地轴，方便同时察看月面和邻近地球。 */
  getMoonCameraPose(): { position: THREE.Vector3; target: THREE.Vector3 } {
    const earthToMoon = this.currentMoonWorldPosition
      .clone()
      .sub(this.currentEarthWorldPosition)
      .normalize();
    const tangent = new THREE.Vector3(0, 1, 0).cross(earthToMoon).normalize();
    const offset = earthToMoon
      .multiplyScalar(2.8)
      .addScaledVector(tangent, 0.8)
      .add(new THREE.Vector3(0, 1.1, 0));
    return {
      target: this.currentMoonWorldPosition.clone(),
      position: this.currentMoonWorldPosition.clone().add(offset.normalize().multiplyScalar(3.4)),
    };
  }

  /** 获取当前模式在每帧应保持的 OrbitControls target。 */
  private getFocusTarget(): THREE.Vector3 {
    if (this.focusMode === "overview") return this.getOverviewCameraPose().target;
    if (this.focusMode === "sun") return new THREE.Vector3();
    if (this.focusMode === "moon") return this.currentMoonWorldPosition;
    return this.currentEarthWorldPosition;
  }

  /** 同步相机关注对象及总览专用可读性辅助，不改变天体状态。 */
  setViewMode(mode: SceneViewMode): void {
    this.focusMode = mode;
    this.overviewMode = mode === "overview";
    this.earthOrbitGuide.visible = this.overviewMode;
    this.moonOrbitGuide.visible = this.overviewMode;
    this.overviewFillLight.intensity = this.overviewMode ? 0.5 : 0.04;
    this.earth?.setOverviewMode(this.overviewMode);
  }

  /** 将统一天体状态应用到场景、光照和材质。 */
  private applyCelestialState(state: CelestialState): void {
    this.currentEarthOrbitAngle = state.earthOrbitAngle;
    this.currentMoonOrbitAngle = state.moonOrbitAngle;
    this.currentEarthWorldPosition.copy(state.earthPosition);
    this.currentEarthOrientation.copy(state.earthOrientation);

    // 太阳 mesh 位于原点；平行光同样从原点射向地球。
    this.sun.position.set(0, 0, 0);
    this.sun.target.position.copy(state.earthPosition);

    if (this.earth) {
      this.earth.mesh.position.copy(state.earthPosition);
      this.earth.mesh.quaternion.copy(state.earthOrientation);
      // normalWorldGeometry 使用世界法线，因此传入真实的世界太阳方向。
      this.earth.setSunDirection(state.earthToSun);
    }
    if (this.atmosphere) {
      this.atmosphere.mesh.position.copy(state.earthPosition);
      this.atmosphere.mesh.quaternion.copy(state.earthOrientation);
      this.atmosphere.setSunDirection(state.earthToSun);
    }
    if (this.moon) {
      this.moon.mesh.position.copy(state.moonPosition);
    }
    this.currentMoonWorldPosition.copy(state.moonPosition);
    this.moonOrbitGuide.position.copy(state.earthPosition);
  }

  /** 每帧：用一个 UTC instant 更新日地月状态，然后渲染。 */
  private tick = (): void => {
    if (this.disposed) return;

    // Timer 需要每帧 update() 才能推进时间
    this.clock.update();
    const elapsed = this.clock.getElapsed();
    const delta = this.clock.getDelta();
    void delta; // 预留给未来自转/物理动画

    // 同一 Date 实例驱动太阳、地球、月球、地轴及地表昼夜，避免状态撕裂。
    this.applyCelestialState(celestialState(new Date()));
    if (this.earth) this.earth.update(elapsed, delta);

    // 同步 OrbitControls.target 到地球位置（让相机始终跟地球）
    // 跳过 tween 期间（避免 tween 内部 lerp + tick 覆盖 冲突）
    if (this.controls && this.earth && !this.isCameraTweening) {
      this.controls.target.copy(this.getFocusTarget());
    }

    // Stars 闪烁
    if (this.stars) this.stars.update(elapsed);

    // OrbitControls.update（enableDamping 需要每帧调用）
    if (this.controls) this.controls.update();

    // Render
    this.renderer.render(this.scene, this.camera);
  };

  private onResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width === 0 || height === 0) return;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  /**
   * 清理 WebGPU 资源 + 移除 DOM + 停止 render loop
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.onResize);

    if (this.stars) {
      this.stars.dispose();
      this.stars = null;
    }
    if (this.earth) {
      this.earth.dispose();
      this.earth = null;
    }
    if (this.atmosphere) {
      this.atmosphere.dispose();
      this.atmosphere = null;
    }
    if (this.moon) {
      this.moon.dispose();
      this.moon = null;
    }
    if (this.sunMesh) {
      this.sunMesh.dispose();
      this.sunMesh = null;
    }
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) mat.dispose();
    });

    this.renderer.dispose();

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.removeChild(this.renderer.domElement);
    }
  }
}

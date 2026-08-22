import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Stars } from "./Stars";
import { Earth } from "./Earth";
import { Atmosphere } from "./Atmosphere";
import { Sun } from "./Sun";
import { Moon } from "./Moon";
import { sunDirection } from "../utils/sun";
import { earthOrbitAngle, synodicAge } from "../utils/orbits";

/**
 * EarthScene — Three.js 场景容器（WebGPURenderer 模式）
 *
 * 渲染管线：
 *   - WebGPURenderer（不是 WebGLRenderer）
 *   - Earth 用 MeshStandardNodeMaterial（TSL）
 *   - 太阳 = DirectionalLight（位置由 sunDirection(new Date()) 实时算）
 *   - Stars 仍是 GLSL ShaderMaterial（Three.js r160 WebGPU 兼容传统材质）
 *   - 交互：OrbitControls（拖拽/缩放，禁用 pan）
 *
 * 关键决策：
 *   - 完全对齐 Three.js 官方 webgpu_tsl_earth.html 示例
 *   - 用 setAnimationLoop（WebGPURenderer 原生）,不用 raf
 *   - 太阳方向每帧从 sunDirection(new Date()) 算,同步给 DirectionalLight 和地球 uSunDir uniform
 *
 * 浏览器要求：Chrome / Edge 113+（WebGPU 支持）
 *
 * 后续阶段：
 *   - 8: OrbitControls（拖拽/缩放）✓
 *   - 9: UI 集成（顶栏 / 信息卡 / 静音 / recenter / 帮助）
 *
 * @contract
 *   - `scene` 永远指向同一个 THREE.Scene 实例
 *   - `camera` / `renderer` 永不重新创建,resize 只更新内部参数
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
  /** 星空配置；不传则用默认 4000 颗星；传 false 关闭 */
  stars?: ConstructorParameters<typeof Stars>[0] | false;
  /** 地球配置；不传则用默认；传 false 关闭 */
  earth?: ConstructorParameters<typeof Earth>[0] | false;
}

export class EarthScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  // WebGPURenderer 类型 r160 的 @types/three 不覆盖, 用 any 兜底
  // 运行时由 build/three.module.js + examples/jsm/... 提供实际实现
  readonly renderer: any;

  private readonly container: HTMLElement;
  private readonly clock: THREE.Timer;
  /** 太阳 DirectionalLight — position 决定光从哪来（指向 0,0,0） */
  private readonly sun: THREE.DirectionalLight;
  /**
   * 太阳 PointLight — 阶段 17 新增，照亮月球
   * 位置固定 (0, 0, 0)（跟 Sun mesh 同位置）
   * 强度 2.5（强度够让月球 PBR 材质正确显示昼夜面）
   */
  private readonly sunPointLight: THREE.PointLight;
  /** 太阳方向（从地球指向太阳的世界空间 Vector3）— 每帧从 sunDirection() 算 */
  private readonly sunPosition: THREE.Vector3 = new THREE.Vector3();
  /**
   * 太阳 mesh — 阶段 17 接入
   * 固定在原点 (0, 0, 0), 半径 5u（详见 Sun.ts）
   * dispose 时会重置为 null
   */
  sunMesh: Sun | null = null;
  private stars: Stars | null = null;
  /**
   * 地球公转 group — 阶段 16 接入
   * 包住 Earth + Atmosphere(未来包住 MoonOrbit + Moon)
   * group.rotation.y = earthOrbitAngle(date) 实现"地球绕太阳公转"
   * 注意: Earth 内部 mesh.rotation.y 始终 = 0(2026-08-20 修复 sun position bug 时已禁用)
   * group 旋转跟 mesh 自转语义不同:group = 公转(一年一圈), mesh 自转 = 一天一圈
   * @see /docs/PLAN-SEM.md § 2 + § 7.2
   */
  private readonly earthOrbitGroup: THREE.Group = new THREE.Group();
  /**
   * 月球公转 group — 阶段 17 接入
   * 加到 earthOrbitGroup 下, group.rotation.y = (synodicAge/29.53) * 2π
   * 月球 mesh 在 moonOrbitGroup 里, 默认位置 (0, 0, 0)
   * 父级 earthOrbitGroup 旋转时, moonOrbitGroup 跟着转(地球带着月球一起公转)
   */
  private readonly moonOrbitGroup: THREE.Group = new THREE.Group();
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
   * Earth 暴露 public 供 app.ts 控制旋转速度(阶段 11 启动高速 → locate 完成减速)
   * dispose 时会重置为 null,所以不能 readonly
   */
  earth: Earth | null = null;
  private atmosphere: Atmosphere | null = null;
  /**
   * 月球 mesh — 阶段 17 接入
   * 加到 moonOrbitGroup 下, 默认位置 (0, 0, 0)
   * 月球公转由 moonOrbitGroup.rotation.y 控制
   * dispose 时会重置为 null
   */
  moon: Moon | null = null;
  /**
   * OrbitControls — 拖拽/缩放交互
   * r185 的 three/addons/* 在我们的 ambient declaration 里被声明为 any,
   * 实际类型 OrbitControls 在 @types/three/examples/jsm/controls/OrbitControls.d.ts,
   * 但 module "three/addons/*" 的 wildcard ambient 会让它退化为 any。
   * 运行时由 examples/jsm/controls/OrbitControls.js 提供。
   *
   * 暴露 public 让 UIRoot 等 caller 能监听 'start' 事件(阶段 9 recenter 按钮)
   * dispose 时会重新赋 null,所以不能 readonly
   */
  controls: any = null;
  private disposed: boolean = false;

  constructor(options: EarthSceneOptions) {
    this.container = options.container;
    const width = options.width ?? options.container.clientWidth;
    const height = options.height ?? options.container.clientHeight;

    // --- Scene ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(
      options.backgroundColor ?? 0x02050f,
    );

    // --- Camera — fov 25 + position (4.5, 2, 3) 对齐官方示例（更近 + 更聚焦） ---
    this.camera = new THREE.PerspectiveCamera(25, width / height, 0.1, 100);
    this.camera.position.set(4.5, 2, 3);
    this.camera.lookAt(0, 0, 0);

    // --- Renderer (WebGPURenderer) ---
    // forceWebGL: true — 用户的 Chrome 不支持 WebGPU 时,Three.js 自动 fallback WebGL2 backend
    // (本来 fallback,会打 "WebGPU is not available" warning)。
    // 显式设 forceWebGL=true 跳过 availability check,直接用 WebGL2 backend,不报 warning。
    // 如果用户未来启用 WebGPU (chrome://flags/#enable-unsafe-webgpu),把这个改为 false。
    this.renderer = new WebGPURenderer({
      antialias: true,
      forceWebGL: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(options.backgroundColor ?? 0x02050f, 1);
    this.container.appendChild(this.renderer.domElement);

    // --- 太阳：DirectionalLight, intensity 2, 白色（对齐官方示例） ---
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.position.set(0, 0, 3); // 初始朝 +Z, 之后每帧更新
    this.scene.add(this.sun);

    // --- 太阳 PointLight — 阶段 17 新增，照亮月球 ---
    // 位置固定原点(跟 Sun mesh 同位置)，强度 2.5（DirectionalLight 是 2, PointLight 略强补衰减）
    this.sunPointLight = new THREE.PointLight(0xfff5e0, 2.5, 0, 1.5);
    this.sunPointLight.position.set(0, 0, 0);
    this.scene.add(this.sunPointLight);

    // --- 太阳 mesh（阶段 17 接入） — 半径 5u, 固定原点 ---
    this.sunMesh = new Sun({ radius: 5.0 });
    this.scene.add(this.sunMesh.mesh);
    if (this.sunMesh.corona) {
      this.scene.add(this.sunMesh.corona);
    }

    // --- 星空（GLSL ShaderMaterial, WebGPU 兼容） ---
    if (options.stars !== false) {
      this.stars = new Stars(options.stars);
      this.scene.add(this.stars.points);
    }

    // --- 地球（TSL MeshStandardNodeMaterial） ---
    if (options.earth !== false) {
      this.earth = new Earth(options.earth);
      // 阶段 16: 地球 + 大气层 加到 earthOrbitGroup, 未来 moonOrbit + moon 也加进来
      // earthOrbitGroup.rotation.y 由 tick() 每帧从 earthOrbitAngle(new Date()) 算
      this.earthOrbitGroup.add(this.earth.mesh);

      // --- 大气层（BackSide + Fresnel,与地球共用 SphereGeometry） ---
      this.atmosphere = new Atmosphere({ geometry: this.earth.mesh.geometry });
      this.earthOrbitGroup.add(this.atmosphere.mesh);

      // --- 月球（阶段 17 接入） — 半径 0.27u, 纹理 solarsystemscope ---
      // Moon 加到 moonOrbitGroup, moonOrbitGroup 加到 earthOrbitGroup
      // earthOrbitGroup 转 → 月球跟着地球一起公转
      // moonOrbitGroup 转 → 月球相对地球公转
      this.moon = new Moon({ radius: 0.27 });
      this.moonOrbitGroup.add(this.moon.mesh);
      this.earthOrbitGroup.add(this.moonOrbitGroup);

      // earthOrbitGroup 本身 add 到 root scene
      this.scene.add(this.earthOrbitGroup);
    }

    // --- OrbitControls（拖拽/缩放）---
    // 配置：damping 平滑、minDistance 4、maxDistance 8、禁用 pan
    //   范围 [4, 8] 兼容相机初始 (4.5, 2, 3) distance≈5.77 + 限制"撞脸" / 拖太远
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false;
    this.controls.minDistance = 4;
    this.controls.maxDistance = 8;

    // Resize handler
    window.addEventListener("resize", this.onResize);

    // Clock（r185+ 用 Timer 替代 Clock）
    this.clock = new THREE.Timer();
    this.clock.connect(document);

    // WebGPURenderer 用 setAnimationLoop 替代 raf
    this.renderer.setAnimationLoop(this.tick);

    console.log("[3d-earth] EarthScene initialized (WebGPU + TSL)");
  }

  /**
   * 每帧：更新太阳位置(从 sunDirection(new Date()) 实时算) + 自转 + render
   */
  private tick = (): void => {
    if (this.disposed) return;

    // Timer 需要每帧 update() 才能推进时间
    this.clock.update();
    const elapsed = this.clock.getElapsed();
    // r185 Timer.getDelta() 给出本帧 delta 秒数(供 Earth.update 用)
    const delta = this.clock.getDelta();

    // 1) 实时算太阳位置（从地球指向太阳）
    const sd = sunDirection(new Date());
    // sunDirection 返回 (lat_rad, lon_rad) ... 实际是 (x, y, z) 三元组?
    // 看一下:src/utils/sun.ts: sunDirection(date) 返回 [x, y, z] Vector3
    // 我们直接取三维方向
    this.sunPosition.set(sd[0], sd[1], sd[2]);
    // 同步给 DirectionalLight（光照方向 = light.position → 0, 即从 sunPosition 照来）
    this.sun.position.copy(this.sunPosition);
    // 同步给地球 shader（uSunDir uniform）
    if (this.earth) {
      this.earth.setSunDirection(this.sunPosition);
    }
    // 同步给大气层 shader（uSunDir uniform）
    if (this.atmosphere) {
      this.atmosphere.setSunDirection(this.sunPosition);
    }
    // 同步给月球 shader（uSunDir uniform）— 阶段 17 新增
    if (this.moon) {
      this.moon.setSunDirection(this.sunPosition);
    }

    // 2) 地球公转（阶段 16）— group.rotation.y = earthOrbitAngle(new Date())
    // 注意: 这是 1 圈/年, 慢得看不出视觉变化, 但代码上准备好"地球绕太阳公转"
    // 未来阶段 18 ViewModeTabs 切"总览"时, 配合 earthOrbitGroup.position(后续接入)看地球
    this.currentEarthOrbitAngle = earthOrbitAngle(new Date());
    this.earthOrbitGroup.rotation.y = this.currentEarthOrbitAngle;

    // 3) 月球公转（阶段 17）— moonOrbitGroup.rotation.y = (synodicAge/29.53) * 2π
    // 朔望月 29.53 天, 1 圈/月, 视觉上月球相对地球明显移动
    this.currentMoonOrbitAngle = (synodicAge(new Date()) / 29.530588853) * 2 * Math.PI;
    this.moonOrbitGroup.rotation.y = this.currentMoonOrbitAngle;

    // 2) 自转
    if (this.stars) {
      this.stars.update(elapsed);
    }
    if (this.earth) {
      this.earth.update(elapsed, delta);
    }

    // 3) OrbitControls.update（enableDamping 需要每帧调用）
    if (this.controls) {
      this.controls.update();
    }

    // 4) Render
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

    // 移除 PointLight（阶段 17 新增, dispose 时从 scene 移除）
    if (this.sunPointLight.parent) {
      this.sunPointLight.parent.remove(this.sunPointLight);
    }

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
      if (Array.isArray(mat)) {
        mat.forEach((m) => m.dispose());
      } else if (mat) {
        mat.dispose();
      }
    });

    this.renderer.dispose();

    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}

import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { Stars } from "./Stars";
import { Earth } from "./Earth";
import { sunDirection } from "../utils/sun";

/**
 * EarthScene — Three.js 场景容器（WebGPURenderer 模式）
 *
 * 渲染管线：
 *   - WebGPURenderer（不是 WebGLRenderer）
 *   - Earth 用 MeshStandardNodeMaterial（TSL）
 *   - 太阳 = DirectionalLight（位置由 sunDirection(new Date()) 实时算）
 *   - Stars 仍是 GLSL ShaderMaterial（Three.js r160 WebGPU 兼容传统材质）
 *
 * 关键决策：
 *   - 完全对齐 Three.js 官方 webgpu_tsl_earth.html 示例
 *   - 用 setAnimationLoop（WebGPURenderer 原生）,不用 raf
 *   - 太阳方向每帧从 sunDirection(new Date()) 算,同步给 DirectionalLight 和地球 uSunDir uniform
 *
 * 浏览器要求：Chrome / Edge 113+（WebGPU 支持）
 *
 * 后续阶段：
 *   - 7: 大气层（BackSide + Fresnel + 暖橙/冷蓝）
 *   - 8: OrbitControls（拖拽/缩放）
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
  /** 太阳方向（从地球指向太阳的世界空间 Vector3）— 每帧从 sunDirection() 算 */
  private readonly sunPosition: THREE.Vector3 = new THREE.Vector3();
  private stars: Stars | null = null;
  private earth: Earth | null = null;
  private disposed: boolean = false;

  constructor(options: EarthSceneOptions) {
    this.container = options.container;
    const width = options.width ?? options.container.clientWidth;
    const height = options.height ?? options.container.clientHeight;

    // --- Scene ---
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(
      options.backgroundColor ?? 0x02050f
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

    // --- 星空（GLSL ShaderMaterial, WebGPU 兼容） ---
    if (options.stars !== false) {
      this.stars = new Stars(options.stars);
      this.scene.add(this.stars.points);
    }

    // --- 地球（TSL MeshStandardNodeMaterial） ---
    if (options.earth !== false) {
      this.earth = new Earth(options.earth);
      this.scene.add(this.earth.mesh);
    }

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

    // 2) 自转
    if (this.stars) {
      this.stars.update(elapsed);
    }
    if (this.earth) {
      this.earth.update(elapsed);
    }

    // 3) Render
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
      this.renderer.domElement.parentNode.removeChild(
        this.renderer.domElement
      );
    }
  }
}

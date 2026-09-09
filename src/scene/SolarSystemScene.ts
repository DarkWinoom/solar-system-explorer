import {
  ACESFilmicToneMapping,
  BufferGeometry,
  Color,
  Line,
  LineBasicMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
} from "three";
import { WebGPURenderer } from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BODIES, isBodyId, type BodyId, type ViewId } from "../data/bodies";
import {
  DAY_MS,
  orbitPoints,
  RealTimeEphemeris,
  type SolarState,
} from "../astronomy/ephemeris";
import { CameraController } from "./CameraController";
import { CelestialBody } from "./CelestialBody";
import { Starfield } from "./Starfield";
import { TextureStore } from "./TextureStore";

interface SceneOptions {
  container: HTMLElement;
  location: { lat: number; lon: number };
  onSelect: (id: BodyId) => void;
  onFrame: (
    state: SolarState,
    camera: PerspectiveCamera,
    bodies: readonly CelestialBody[],
  ) => void;
  onTextureError: (path: string) => void;
  onContextLost: () => void;
}

export class SolarSystemScene {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(44, 1, 0.025, 5000);
  readonly renderer: WebGPURenderer;
  readonly ephemeris = new RealTimeEphemeris();
  readonly bodies: CelestialBody[] = [];
  private readonly textures: TextureStore;
  private readonly stars: Starfield;
  private readonly geometry = new SphereGeometry(1, 64, 40);
  private readonly guides = new Map<
    BodyId,
    Line<BufferGeometry, LineBasicMaterial>
  >();
  private readonly controller: CameraController;
  private readonly observer: ResizeObserver;
  private readonly events = new AbortController();
  private readonly raycaster = new Raycaster();
  private pointerStart: { x: number; y: number; id: number } | null = null;
  private multiPointer = false;
  private guideEpoch = 0;
  private lastGuideUpdate = 0;
  private guideVisible = true;
  private disposed = false;
  private ready = false;
  private width = 0;
  private height = 0;
  private lastFrame = 0;
  private frameAverage = 16;
  private qualityCheckedAt = performance.now();

  constructor(private readonly options: SceneOptions) {
    this.renderer = new WebGPURenderer({
      antialias: true,
      forceWebGL: true,
      alpha: true,
    });
    this.renderer.setClearColor(0x05080d, 0);
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, innerWidth < 768 ? 1.5 : 2),
    );
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    const canvas = this.renderer.domElement;
    canvas.setAttribute("aria-label", "Solar system");
    canvas.dataset.scene = "solar-system";
    options.container.appendChild(canvas);
    this.textures = new TextureStore(options.onTextureError);
    this.stars = new Starfield(innerWidth < 768);
    this.scene.add(this.stars.group);
    for (const definition of BODIES) {
      const body = new CelestialBody(definition, this.geometry, this.textures);
      this.bodies.push(body);
      this.scene.add(body.group);
      body.update(this.ephemeris.state.bodies[definition.id]);
    }
    this.controller = new CameraController(
      this.camera,
      new OrbitControls(this.camera, canvas),
      options.location,
    );
    this.buildGuides();
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(options.container);
    const signal = this.events.signal;
    canvas.addEventListener("pointerdown", this.onPointerDown, { signal });
    canvas.addEventListener("pointerup", this.onPointerUp, { signal });
    canvas.addEventListener(
      "pointercancel",
      () => {
        this.pointerStart = null;
      },
      { signal },
    );
    canvas.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        void this.renderer.setAnimationLoop(null);
        options.onContextLost();
      },
      { signal },
    );
    document.addEventListener("visibilitychange", this.visibilityChanged, {
      signal,
    });
    this.resize();
    this.controller.select("overview", this.ephemeris.state, false);
  }

  async start(): Promise<void> {
    await Promise.all(this.textures.requests);
    await this.renderer.init();
    if (this.disposed) return;
    this.ready = true;
    await this.renderer.setAnimationLoop(document.hidden ? null : this.tick);
    if (!this.disposed) this.options.container.dataset.ready = "true";
  }

  private buildGuides(): void {
    const instant = this.ephemeris.state.instant;
    for (const { id, color } of BODIES) {
      if (id === "sun") continue;
      const geometry = new BufferGeometry().setFromPoints(
        orbitPoints(id, instant, this.ephemeris.clock.isAdvancing ? 256 : 512),
      );
      const existing = this.guides.get(id);
      if (existing) {
        existing.geometry.dispose();
        existing.geometry = geometry;
      } else {
        const material = new LineBasicMaterial({
          color: new Color(color).lerp(new Color("#7b9cb7"), 0.58),
          opacity: 0.29,
          transparent: true,
          depthWrite: false,
        });
        const line = new Line(geometry, material);
        line.visible = this.guideVisible;
        this.guides.set(id, line);
        this.scene.add(line);
      }
    }
    this.guideEpoch = instant;
    this.lastGuideUpdate = performance.now();
  }

  private tick = (now: number): void => {
    if (this.disposed) return;
    const interval = now - this.lastFrame;
    this.lastFrame = now;
    if (interval > 0 && interval < 250)
      this.frameAverage += (interval - this.frameAverage) * 0.08;
    if (
      now - this.qualityCheckedAt > 3000 &&
      this.frameAverage > 45 &&
      this.renderer.getPixelRatio() > 0.55
    ) {
      this.renderer.setPixelRatio(
        Math.max(0.55, this.renderer.getPixelRatio() * 0.75),
      );
      this.qualityCheckedAt = now;
      this.frameAverage = 16;
    }
    const state = this.ephemeris.update();
    if (
      Math.abs(state.instant - this.guideEpoch) >= DAY_MS &&
      (!this.ephemeris.clock.isAdvancing || now - this.lastGuideUpdate >= 500)
    )
      this.buildGuides();
    this.bodies.forEach((body) =>
      body.update(
        state.bodies[body.definition.id],
        this.ephemeris.clock.isAdvancing,
        now,
      ),
    );
    this.guides.get("moon")!.position.copy(state.bodies.earth.position);
    this.controller.update(state, now);
    this.stars.follow(this.camera.position);
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    this.options.onFrame(state, this.camera, this.bodies);
    this.renderer.render(this.scene, this.camera);
  };

  select(view: ViewId): void {
    this.resize();
    this.controller.select(view, this.ephemeris.update());
    for (const [id, guide] of this.guides) {
      guide.material.opacity = view === id ? 0.4 : 0.27;
    }
    this.renderer.domElement.dataset.view = view;
  }

  setAdvancing(enabled: boolean): void {
    this.ephemeris.clock.setAdvancing(enabled);
    this.ephemeris.update();
    this.buildGuides();
  }

  setOrbits(visible: boolean): void {
    this.guideVisible = visible;
    for (const guide of this.guides.values()) guide.visible = visible;
  }

  private resize = (): void => {
    if (this.disposed) return;
    const { clientWidth: width, clientHeight: height } = this.options.container;
    if (!width || !height) return;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.controller.resize(this.ephemeris.state);
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (this.pointerStart) {
      this.multiPointer = true;
      return;
    }
    if (event.button !== 0) return;
    this.multiPointer = false;
    this.pointerStart = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
    };
  };

  private onPointerUp = (event: PointerEvent): void => {
    const start = this.pointerStart;
    if (!start || event.pointerId !== start.id) return;
    this.pointerStart = null;
    if (
      this.multiPointer ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6
    )
      return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      ),
      this.camera,
    );
    const hit = this.raycaster.intersectObjects(
      this.bodies.map((body) => body.mesh),
      false,
    )[0];
    const id = hit?.object.userData.bodyId;
    if (typeof id === "string" && isBodyId(id)) this.options.onSelect(id);
  };

  private visibilityChanged = (): void => {
    if (!this.ready || this.disposed) return;
    this.ephemeris.update();
    void this.renderer.setAnimationLoop(document.hidden ? null : this.tick);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    void this.renderer.setAnimationLoop(null);
    this.events.abort();
    this.observer.disconnect();
    this.controller.dispose();
    this.bodies.forEach((body) => body.dispose());
    this.geometry.dispose();
    this.textures.dispose();
    this.stars.dispose();
    this.guides.forEach((guide) => {
      guide.geometry.dispose();
      guide.material.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

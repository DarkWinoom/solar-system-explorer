import { MathUtils, PerspectiveCamera, Quaternion, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { BODY_BY_ID, type ViewId } from "../data/bodies";
import type { SolarState } from "../astronomy/ephemeris";

interface Transition {
  start: number;
  target: Vector3;
  direction: Vector3;
  rotation: Quaternion;
  distance: number;
  endDistance: number;
  travel: number;
}

export function fittingDistance(
  radius: number,
  aspect: number,
  fov: number,
  fraction = 0.65,
): number {
  const vertical = MathUtils.degToRad(fov / 2);
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return radius / (Math.sin(Math.min(vertical, horizontal)) * fraction);
}

export class CameraController {
  view: ViewId = "overview";
  private transition: Transition | null = null;
  private readonly lastTarget = new Vector3();
  private readonly target = new Vector3();
  private readonly offset = new Vector3();
  private readonly rotation = new Quaternion();
  private userMoved = false;

  constructor(
    readonly camera: PerspectiveCamera,
    readonly controls: OrbitControls,
    private readonly location: { lat: number; lon: number },
  ) {
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.autoRotate = false;
    controls.maxDistance = 900;
    controls.addEventListener("start", this.interrupt);
  }

  private interrupt = (): void => {
    this.transition = null;
    this.userMoved = true;
    this.controls.enableDamping = true;
  };

  select(view: ViewId, state: SolarState, animate = true): void {
    this.view = view;
    this.userMoved = false;
    this.target.copy(
      view === "overview" ? new Vector3() : state.bodies[view].position,
    );
    const direction = this.viewDirection(view, state);
    const radius =
      view === "overview"
        ? 120
        : BODY_BY_ID[view].radius * (view === "saturn" ? 2.4 : 1.06);
    const distance =
      view === "overview"
        ? 160 /
          (Math.tan(MathUtils.degToRad(this.camera.fov / 2)) *
            Math.min(this.camera.aspect, 1.55))
        : fittingDistance(
            radius,
            this.camera.aspect,
            this.camera.fov,
            view === "saturn" ? 0.83 : 0.65,
          );
    this.controls.minDistance =
      view === "overview" ? 12 : BODY_BY_ID[view].radius * 1.3;
    const startOffset = this.camera.position.clone().sub(this.controls.target);
    const startDistance = startOffset.length();
    if (
      animate &&
      startDistance > 0.01 &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      const startDirection = startOffset.normalize();
      this.controls.enableDamping = false;
      this.controls.update();
      this.transition = {
        start: performance.now(),
        target: this.controls.target.clone(),
        direction: startDirection,
        rotation: new Quaternion().setFromUnitVectors(
          startDirection,
          direction,
        ),
        distance: startDistance,
        endDistance: distance,
        travel: this.target.distanceTo(this.controls.target),
      };
    } else {
      this.transition = null;
      this.controls.target.copy(this.target);
      this.camera.position
        .copy(this.target)
        .addScaledVector(direction, distance);
      this.controls.update();
    }
    this.lastTarget.copy(this.target);
  }

  private viewDirection(view: ViewId, state: SolarState): Vector3 {
    if (view === "overview")
      return new Vector3(
        0.12,
        this.camera.aspect < 0.85 ? 1.45 : 0.58,
        1,
      ).normalize();
    if (view === "earth") {
      const lat = MathUtils.degToRad(this.location.lat),
        lon = MathUtils.degToRad(this.location.lon);
      return new Vector3(
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        -Math.cos(lat) * Math.sin(lon),
      )
        .applyQuaternion(state.bodies.earth.orientation)
        .normalize();
    }
    const sun =
      view === "sun"
        ? new Vector3(0, 0, 1)
        : state.bodies[view].sunDirection.clone();
    return sun.add(new Vector3(0.24, 0.38, 0.16)).normalize();
  }

  update(state: SolarState, now: number): void {
    this.target.copy(
      this.view === "overview"
        ? new Vector3()
        : state.bodies[this.view].position,
    );
    const transition = this.transition;
    if (transition) {
      const t = Math.min((now - transition.start) / 1200, 1);
      const eased = t * t * (3 - 2 * t);
      this.controls.target.lerpVectors(transition.target, this.target, eased);
      this.rotation.identity().slerp(transition.rotation, eased);
      this.offset.copy(transition.direction).applyQuaternion(this.rotation);
      const distance =
        Math.exp(
          MathUtils.lerp(
            Math.log(transition.distance),
            Math.log(transition.endDistance),
            eased,
          ),
        ) +
        Math.sin(Math.PI * eased) * transition.travel * 0.65;
      this.camera.position
        .copy(this.controls.target)
        .addScaledVector(this.offset, distance);
      if (t === 1) {
        this.transition = null;
        this.controls.enableDamping = true;
      }
    } else {
      this.offset.copy(this.target).sub(this.lastTarget);
      this.camera.position.add(this.offset);
      this.controls.target.copy(this.target);
    }
    this.lastTarget.copy(this.target);
    this.controls.update();
  }

  resize(state: SolarState): void {
    if (!this.userMoved) this.select(this.view, state, false);
  }

  dispose(): void {
    this.controls.removeEventListener("start", this.interrupt);
    this.controls.dispose();
  }
}

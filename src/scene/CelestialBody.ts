import {
  BackSide,
  DoubleSide,
  Group,
  Mesh,
  RingGeometry,
  SphereGeometry,
  Sprite,
  Vector3,
  type Material,
  type BufferGeometry,
} from "three";
import { MeshBasicNodeMaterial, SpriteNodeMaterial } from "three/webgpu";
import {
  cameraPosition,
  color,
  float,
  mix,
  normalWorldGeometry,
  positionWorld,
  texture,
  uniform,
  uv,
  vec3,
} from "three/tsl";
import type { BodyDefinition } from "../data/bodies";
import type { BodyState } from "../astronomy/ephemeris";
import { TextureStore } from "./TextureStore";
import { SurfaceRotation } from "./SurfaceRotation";

export class CelestialBody {
  readonly group = new Group();
  readonly mesh: Mesh;
  private readonly sun = uniform(new Vector3(1, 0, 0));
  private readonly center = uniform(new Vector3());
  private readonly materials: Material[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly surfaceRotation: SurfaceRotation;

  constructor(
    readonly definition: BodyDefinition,
    geometry: SphereGeometry,
    textures: TextureStore,
  ) {
    this.surfaceRotation = new SurfaceRotation(definition.rotationDays);
    const material = new MeshBasicNodeMaterial();
    const map = texture(textures.get(definition.texture, definition.color));
    const lighting = normalWorldGeometry.dot(this.sun).max(0);
    const day = map.rgb.mul(lighting.mul(0.94).add(0.045));
    material.colorNode = definition.id === "sun" ? map.rgb.mul(1.8) : day;
    if (definition.id === "earth") {
      const night = texture(textures.get("2k_earth_nightmap.webp", "#000000"));
      const clouds = texture(
        textures.get("2k_earth_clouds.webp", "#000000", false),
      ).r;
      const daylight = normalWorldGeometry
        .dot(this.sun)
        .smoothstep(-0.04, 0.08);
      const earthDay = mix(map.rgb, vec3(0.93), clouds.mul(0.88)).mul(
        lighting.mul(0.9).add(0.11),
      );
      const earthNight = night.rgb.mul(0.95).add(map.rgb.mul(0.018));
      material.colorNode = mix(earthNight, earthDay, daylight);
    }
    this.materials.push(material);
    this.mesh = new Mesh(geometry, material);
    this.mesh.scale.setScalar(definition.radius);
    this.mesh.userData.bodyId = definition.id;
    this.group.add(this.mesh);
    if (definition.id === "earth") this.addAtmosphere(geometry);
    if (definition.id === "saturn") this.addRings(textures);
    if (definition.id === "sun") this.addCorona();
  }

  private addAtmosphere(geometry: SphereGeometry): void {
    const material = new MeshBasicNodeMaterial({
      side: BackSide,
      transparent: true,
      depthWrite: false,
    });
    const view = cameraPosition.sub(positionWorld).normalize();
    const fresnel = normalWorldGeometry.dot(view).abs().oneMinus().pow(3);
    const sun = normalWorldGeometry.dot(this.sun);
    material.colorNode = mix(
      color("#c16432"),
      color("#529dde"),
      sun.smoothstep(-0.2, 0.6),
    );
    material.opacityNode = fresnel.mul(sun.smoothstep(-0.4, 0.6)).mul(0.55);
    const atmosphere = new Mesh(geometry, material);
    atmosphere.scale.setScalar(this.definition.radius * 1.026);
    this.materials.push(material);
    this.group.add(atmosphere);
  }

  private addRings(textures: TextureStore): void {
    const radius = this.definition.radius;
    const inner = radius * 1.24,
      outer = radius * 2.32;
    const geometry = new RingGeometry(inner, outer, 160);
    const positions = geometry.getAttribute("position"),
      uvs = geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      const length = Math.hypot(positions.getX(i), positions.getY(i));
      uvs.setXY(i, (length - inner) / (outer - inner), 0.5);
    }
    geometry.rotateX(-Math.PI / 2);
    const material = new MeshBasicNodeMaterial({
      side: DoubleSide,
      transparent: true,
      depthWrite: false,
    });
    const map = texture(textures.get("2k_saturn_ring_alpha.png", "#b9a786"));
    const offset = positionWorld.sub(this.center);
    const alongSun = offset.dot(this.sun);
    const closest = offset.sub(this.sun.mul(alongSun)).length();
    const shadow = alongSun
      .lessThan(0)
      .and(closest.lessThan(radius))
      .select(float(0.07), float(1));
    material.colorNode = map.rgb
      .mul(normalWorldGeometry.dot(this.sun).abs().mul(0.65).add(0.35))
      .mul(shadow);
    material.opacityNode = map.a;
    const ring = new Mesh(geometry, material);
    ring.userData.bodyId = this.definition.id;
    this.materials.push(material);
    this.geometries.push(geometry);
    this.group.add(ring);
  }

  private addCorona(): void {
    const material = new SpriteNodeMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    material.colorNode = color("#e8ad62");
    material.opacityNode = uv()
      .sub(0.5)
      .length()
      .mul(2)
      .oneMinus()
      .max(0)
      .pow(3)
      .mul(0.24);
    const sprite = new Sprite(material);
    sprite.scale.setScalar(this.definition.radius * 4.5);
    this.materials.push(material);
    this.group.add(sprite);
  }

  update(state: BodyState, advancing = false, now = performance.now()): void {
    this.group.position.copy(state.position);
    this.group.quaternion.copy(
      this.surfaceRotation.update(state.orientation, advancing, now),
    );
    this.sun.value.copy(state.sunDirection);
    this.center.value.copy(state.position);
  }

  dispose(): void {
    this.materials.forEach((material) => material.dispose());
    this.geometries.forEach((geometry) => geometry.dispose());
  }
}

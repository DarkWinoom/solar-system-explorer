import {
  CanvasTexture,
  Color,
  Group,
  InstancedBufferAttribute,
  Sprite,
  Vector3,
} from "three";
import { PointsNodeMaterial } from "three/webgpu";
import { float, instancedBufferAttribute, texture } from "three/tsl";

export class Starfield {
  readonly group = new Group();
  private readonly texture: CanvasTexture;
  private readonly layers: { sprite: Sprite; material: PointsNodeMaterial }[] =
    [];

  constructor(compact: boolean) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 32;
    const context = canvas.getContext("2d")!;
    const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, "#ffffff");
    gradient.addColorStop(0.14, "#ffffff");
    gradient.addColorStop(0.4, "#ffffff66");
    gradient.addColorStop(1, "#ffffff00");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 32, 32);
    this.texture = new CanvasTexture(canvas);
    let seed = 74319;
    const random = () => {
      seed = (Math.imul(1664525, seed) + 1013904223) | 0;
      return (seed >>> 0) / 4294967296;
    };
    for (const [count, size, opacity] of [
      [compact ? 1500 : 3300, 2.1, 0.65],
      [compact ? 250 : 550, 3.6, 0.8],
      [70, 6, 0.95],
    ]) {
      const positions: number[] = [],
        colors: number[] = [];
      for (let i = 0; i < count; i++) {
        const longitude = random() * Math.PI * 2;
        const latitude =
          i % 3 === 0
            ? (random() + random() + random() - 1.5) * 0.18
            : Math.asin(random() * 2 - 1);
        const p = new Vector3(
          Math.cos(latitude) * Math.cos(longitude),
          Math.sin(latitude),
          Math.cos(latitude) * Math.sin(longitude),
        );
        p.applyAxisAngle(new Vector3(0, 0, 1), 0.62).multiplyScalar(2200);
        positions.push(p.x, p.y, p.z);
        const c = new Color().setHSL(
          0.1 + random() * 0.53,
          random() * 0.28,
          0.72 + random() * 0.25,
        );
        colors.push(c.r, c.g, c.b);
      }
      const material = new PointsNodeMaterial({
        transparent: true,
        depthWrite: false,
        sizeAttenuation: false,
      });
      material.positionNode = instancedBufferAttribute<"vec3">(
        new InstancedBufferAttribute(new Float32Array(positions), 3),
        "vec3",
      );
      material.colorNode = instancedBufferAttribute<"vec3">(
        new InstancedBufferAttribute(new Float32Array(colors), 3),
        "vec3",
      );
      material.sizeNode = float(size);
      material.opacityNode = texture(this.texture).a.mul(opacity);
      const sprite = new Sprite(material);
      sprite.count = count;
      sprite.frustumCulled = false;
      sprite.geometry = sprite.geometry.clone();
      this.layers.push({ sprite, material });
      this.group.add(sprite);
    }
  }

  follow(cameraPosition: Vector3): void {
    this.group.position.copy(cameraPosition);
  }
  dispose(): void {
    this.layers.forEach(({ sprite, material }) => {
      sprite.geometry.dispose();
      material.dispose();
    });
    this.texture.dispose();
  }
}

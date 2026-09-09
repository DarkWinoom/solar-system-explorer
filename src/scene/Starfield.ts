import {
  CanvasTexture,
  BackSide,
  Color,
  Group,
  InstancedBufferAttribute,
  Sprite,
  Mesh,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from "three";
import { MeshBasicNodeMaterial, PointsNodeMaterial } from "three/webgpu";
import { float, instancedBufferAttribute, screenUV, texture } from "three/tsl";

export class Starfield {
  readonly group = new Group();
  private readonly texture: CanvasTexture;
  private readonly galaxyTexture: CanvasTexture;
  private readonly galaxy: Mesh<SphereGeometry, MeshBasicNodeMaterial>;
  private readonly layers: { sprite: Sprite; material: PointsNodeMaterial }[] =
    [];

  constructor(compact: boolean) {
    this.galaxyTexture = this.createGalaxy();
    const galaxyMaterial = new MeshBasicNodeMaterial({
      side: BackSide,
      transparent: true,
      depthWrite: false,
    });
    const galaxyMap = texture(this.galaxyTexture);
    galaxyMaterial.colorNode = galaxyMap.rgb;
    const edge = screenUV.x
      .smoothstep(0, 0.1)
      .mul(screenUV.x.oneMinus().smoothstep(0, 0.1))
      .mul(screenUV.y.smoothstep(0, 0.1))
      .mul(screenUV.y.oneMinus().smoothstep(0, 0.1));
    galaxyMaterial.opacityNode = galaxyMap.a.mul(0.6).mul(edge);
    this.galaxy = new Mesh(new SphereGeometry(2100, 40, 24), galaxyMaterial);
    this.galaxy.rotation.z = 0.62;
    this.galaxy.renderOrder = -100;
    this.group.add(this.galaxy);
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
        let longitude = random() * Math.PI * 2;
        let latitude =
          i % 3 === 0
            ? (random() + random() + random() - 1.5) * 0.18
            : Math.asin(random() * 2 - 1);
        if (i % 17 === 0) {
          const cluster = i % 3;
          longitude =
            [0.7, 2.5, 4.8][cluster] + (random() + random() - 1) * 0.055;
          latitude =
            [0.14, -0.09, 0.05][cluster] + (random() + random() - 1) * 0.04;
        }
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

  private createGalaxy(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext("2d")!;
    const pixels = context.createImageData(canvas.width, canvas.height);
    const hash = (x: number, y: number) => {
      let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
      n = Math.imul(n ^ (n >>> 13), 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
    };
    const noise = (u: number, v: number, grid: number) => {
      const x = u * grid,
        y = v * grid,
        ix = Math.floor(x),
        iy = Math.floor(y);
      const smooth = (a: number) => a * a * (3 - 2 * a);
      const fx = smooth(x - ix),
        fy = smooth(y - iy);
      const a = hash(ix % grid, iy),
        b = hash((ix + 1) % grid, iy);
      const c = hash(ix % grid, iy + 1),
        d = hash((ix + 1) % grid, iy + 1);
      return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    };
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const u = x / canvas.width,
          v = y / (canvas.height - 1),
          angle = u * Math.PI * 2;
        const latitude = (v - 0.5) * Math.PI;
        const center =
          Math.sin(angle * 2) * 0.055 + Math.sin(angle * 5) * 0.018;
        const lane = latitude - center;
        const cloud =
          noise(u, v, 16) * 0.55 +
          noise(u, v, 40) * 0.3 +
          noise(u, v, 96) * 0.15;
        const band = Math.exp(-Math.pow(lane / 0.16, 2));
        const halo = Math.exp(-Math.pow(lane / 0.34, 2));
        const dust =
          Math.exp(
            -Math.pow((lane + (noise(u, v, 24) - 0.5) * 0.1) / 0.035, 2),
          ) * 0.72;
        const density =
          (band * (0.15 + cloud * 0.85) + halo * 0.12) * (1 - dust);
        const warm = (Math.sin(angle - 0.8) + 1) * 0.5;
        const index = (y * canvas.width + x) * 4;
        pixels.data[index] = 70 + warm * 24 + cloud * 18;
        pixels.data[index + 1] = 91 + cloud * 21;
        pixels.data[index + 2] = 119 + cloud * 25;
        pixels.data[index + 3] = density * 105;
      }
    context.putImageData(pixels, 0, 0);
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    return result;
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
    this.galaxy.geometry.dispose();
    this.galaxy.material.dispose();
    this.galaxyTexture.dispose();
  }
}

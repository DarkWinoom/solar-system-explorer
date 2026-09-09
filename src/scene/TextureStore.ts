import { ImageLoader, RepeatWrapping, SRGBColorSpace, Texture } from "three";

export class TextureStore {
  private readonly textures = new Map<string, Texture>();
  private disposed = false;
  readonly requests: Promise<void>[] = [];

  constructor(private readonly onError: (path: string) => void) {}

  get(name: string, fallback = "#777777", srgb = true): Texture {
    const existing = this.textures.get(name);
    if (existing) return existing;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 2;
    const context = canvas.getContext("2d")!;
    context.fillStyle = fallback;
    context.fillRect(0, 0, 2, 2);
    const texture = new Texture<HTMLCanvasElement | HTMLImageElement>(canvas);
    texture.wrapS = RepeatWrapping;
    if (srgb) texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    this.textures.set(name, texture);
    this.requests.push(
      new Promise<void>((resolve) => {
        new ImageLoader().load(
          `${import.meta.env.BASE_URL}textures/${name}`,
          (image) => {
            if (!this.disposed) {
              texture.image = image;
              texture.needsUpdate = true;
            }
            resolve();
          },
          undefined,
          () => {
            if (!this.disposed) this.onError(name);
            resolve();
          },
        );
      }),
    );
    return texture;
  }

  dispose(): void {
    this.disposed = true;
    this.textures.forEach((texture) => texture.dispose());
    this.textures.clear();
  }
}

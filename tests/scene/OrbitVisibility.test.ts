import { afterEach, describe, expect, it, vi } from "vitest";
import { Line } from "three";
import { BODIES } from "../../src/data/bodies";
import { SolarSystemScene } from "../../src/scene/SolarSystemScene";

vi.mock("three/webgpu", async (importOriginal) => ({
  ...(await importOriginal<typeof import("three/webgpu")>()),
  WebGPURenderer: class {
    domElement = document.createElement("canvas");
    setClearColor() {}
    setPixelRatio() {}
    setSize() {}
    setAnimationLoop() {}
    dispose() {}
  },
}));
vi.mock("../../src/scene/TextureStore", async () => {
  const { Texture } = await import("three");
  return {
    TextureStore: class {
      requests = [];
      get() {
        return new Texture();
      }
      dispose() {}
    },
  };
});
vi.mock("../../src/scene/Starfield", async () => {
  const { Group } = await import("three");
  return {
    Starfield: class {
      group = new Group();
      dispose() {}
    },
  };
});

afterEach(() => vi.unstubAllGlobals());

describe("orbit visibility", () => {
  it("keeps all nine orbit objects visible across focus changes and respects the global switch during refresh", () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const container = document.createElement("div");
    Object.defineProperties(container, {
      clientWidth: { value: 800 },
      clientHeight: { value: 600 },
    });
    const scene = new SolarSystemScene({
      container,
      location: { lat: 31.2, lon: 121.5 },
      onFrame: vi.fn(),
      onSelect: vi.fn(),
      onTextureError: vi.fn(),
      onContextLost: vi.fn(),
    });
    try {
      const lines = scene.scene.children.filter(
        (object) => object instanceof Line,
      );
      expect(lines).toHaveLength(9);
      for (const { id } of BODIES) {
        scene.select(id);
        expect(lines.every((line) => line.visible)).toBe(true);
      }
      scene.setOrbits(false);
      scene.select("overview");
      scene.setAdvancing(true);
      expect(lines.every((line) => !line.visible)).toBe(true);
      scene.select("earth");
      expect(lines.every((line) => !line.visible)).toBe(true);
      scene.setOrbits(true);
      scene.setAdvancing(false);
      expect(lines.every((line) => line.visible)).toBe(true);
    } finally {
      scene.dispose();
    }
  });
});

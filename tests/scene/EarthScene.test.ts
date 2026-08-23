import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("EarthScene orbit guides", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "scene", "EarthScene.ts"),
    "utf-8",
  );

  it("uses WebGPURenderer-compatible closed Line guides instead of LineLoop", () => {
    expect(source).not.toMatch(/new THREE\.LineLoop/);
    expect(source).toMatch(/function createOrbitGuide\([^)]*\): THREE\.Line/);
    expect(source).toMatch(/points\.push\(points\[0\]\.clone\(\)\)/);
    expect(source).toMatch(/new THREE\.Line\(/);
  });
});

import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import {
  occludedBySphere,
  projectTarget,
  separateIndicators,
} from "../../src/ui/projection";

const camera = new PerspectiveCamera(60, 2, 0.1, 100);
camera.updateMatrixWorld();
const safe = { left: 20, right: 780, top: 70, bottom: 370 };
const project = (x: number, y: number, z: number) =>
  projectTarget(new Vector3(x, y, z), camera, 800, 400, safe);

describe("off-screen navigation", () => {
  it("keeps a visible target at its actual screen position", () =>
    expect(project(0, 0, -10)).toMatchObject({
      visible: true,
      behind: false,
      x: 400,
      y: 200,
    }));
  it.each([
    [-20, "left"],
    [20, "right"],
  ])("routes an off-screen target at x=%s to %s", (x, side) => {
    const target = project(Number(x), 0, -10);
    expect(target.visible).toBe(false);
    expect(target.side).toBe(side);
  });
  it("does not invert left/right for a target behind the camera", () => {
    expect(project(10, 0, 10)).toMatchObject({
      visible: false,
      behind: true,
      side: "right",
    });
    expect(project(-10, 0, 10)).toMatchObject({
      visible: false,
      behind: true,
      side: "left",
    });
  });
  it("handles directly behind, vertical targets and the camera plane without NaN", () => {
    for (const target of [
      project(0, 0, 10),
      project(0, 100, -1),
      project(0, 0, 0),
    ]) {
      expect(Number.isFinite(target.x)).toBe(true);
      expect(Number.isFinite(target.y)).toBe(true);
      expect(Number.isFinite(target.angle)).toBe(true);
      expect(target.y).toBeGreaterThanOrEqual(safe.top);
      expect(target.y).toBeLessThanOrEqual(safe.bottom);
    }
  });
  it("avoids occupied top/bottom regions", () => {
    expect(project(20, 100, -10).y).toBe(70);
    expect(project(-20, -100, -10).y).toBe(370);
  });
  it("separates crowded labels and returns overflow destinations", () => {
    const { placed, overflow } = separateIndicators(
      Array.from({ length: 9 }, (_, id) => ({ id, y: 190 })),
      100,
      300,
      60,
    );
    expect(placed).toHaveLength(4);
    expect(overflow).toHaveLength(5);
    expect(placed[0].y).toBeGreaterThanOrEqual(100);
    expect(placed.at(-1)!.y).toBeLessThanOrEqual(300);
    for (let i = 1; i < placed.length; i++)
      expect(placed[i].y - placed[i - 1].y).toBeGreaterThanOrEqual(60);
  });
  it("only hides bodies behind a nearer sphere", () => {
    const target = new Vector3(0, 0, -20),
      origin = new Vector3();
    expect(occludedBySphere(target, origin, new Vector3(0, 0, -10), 1)).toBe(
      true,
    );
    expect(occludedBySphere(target, origin, new Vector3(0, 0, -30), 1)).toBe(
      false,
    );
    expect(occludedBySphere(target, origin, new Vector3(4, 0, -10), 1)).toBe(
      false,
    );
  });
});

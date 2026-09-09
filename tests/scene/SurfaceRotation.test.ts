import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { SurfaceRotation } from "../../src/scene/SurfaceRotation";
import { BODIES } from "../../src/data/bodies";
import { solarState } from "../../src/astronomy/ephemeris";

describe("accelerated surface rotation", () => {
  it.each(BODIES)(
    "$id keeps a continuous, correctly directed spin despite wrapped astronomical phases",
    (body) => {
      const surface = new SurfaceRotation(body.rotationDays);
      const axis = new Vector3(0, 1, 0);
      surface.update(new Quaternion(), false, 0);
      for (let i = 1; i <= 60; i++) {
        const previous = surface.orientation.clone();
        const actual = new Quaternion().setFromAxisAngle(axis, i * 2.9);
        surface.update(actual, true, i * 67);
        const delta = previous.clone().invert().multiply(surface.orientation);
        expect(previous.angleTo(surface.orientation)).toBeLessThan(0.11);
        expect(Math.sign(delta.y)).toBe(Math.sign(body.rotationDays));
      }
    },
  );
  it("tracks the current axial direction without moving the underlying astronomical state", () => {
    const a = solarState(new Date("2026-09-09T00:00:00Z")).bodies.earth;
    const b = solarState(new Date("2027-09-09T00:00:00Z")).bodies.earth;
    const copy = b.orientation.clone();
    const surface = new SurfaceRotation(0.99726968);
    surface.update(a.orientation, false, 0);
    surface.update(b.orientation, true, 33);
    expect(
      new Vector3(0, 1, 0)
        .applyQuaternion(surface.orientation)
        .angleTo(new Vector3(0, 1, 0).applyQuaternion(b.orientation)),
    ).toBeLessThan(1e-7);
    expect(copy.equals(b.orientation)).toBe(true);
  });
  it("bounds a slow frame and restores the exact live pose smoothly", () => {
    const surface = new SurfaceRotation(0.99726968);
    const actual = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 2);
    surface.update(new Quaternion(), false, 0);
    surface.update(actual, true, 30_000);
    expect(new Quaternion().angleTo(surface.orientation)).toBeLessThan(0.11);
    const start = surface.orientation.clone();
    surface.update(actual, false, 30_001);
    expect(surface.orientation.angleTo(start)).toBeLessThan(1e-7);
    surface.update(actual, false, 30_351);
    expect(surface.orientation.angleTo(actual)).toBeLessThan(
      start.angleTo(actual),
    );
    surface.update(actual, false, 30_701);
    expect(surface.orientation.angleTo(actual)).toBeLessThan(1e-7);
  });
});

import { describe, expect, it } from "vitest";
import { SimulationClock } from "../../src/astronomy/SimulationClock";
import {
  DAY_MS,
  RealTimeEphemeris,
  solarState,
} from "../../src/astronomy/ephemeris";
import { BODIES } from "../../src/data/bodies";

describe("simulation time", () => {
  it("advances 30 days per second and restores the current wall clock", () => {
    let wall = Date.UTC(2026, 8, 9),
      elapsed = 0;
    const clock = new SimulationClock(
      () => wall,
      () => elapsed,
    );
    expect(clock.now()).toBe(wall);
    clock.setAdvancing(true);
    elapsed = 1000;
    expect(clock.now()).toBe(wall + 30 * DAY_MS);
    clock.setAdvancing(true);
    elapsed = 2000;
    expect(clock.now()).toBe(wall + 60 * DAY_MS);
    wall += 2000;
    clock.setAdvancing(false);
    expect(clock.now()).toBe(wall);
    expect(clock.isAdvancing).toBe(false);
  });
  it("uses monotonic elapsed time during simulation, including time spent away", () => {
    let wall = Date.UTC(2026, 8, 9),
      elapsed = 50;
    const initial = wall,
      clock = new SimulationClock(
        () => wall,
        () => elapsed,
      );
    clock.setAdvancing(true);
    wall -= DAY_MS;
    elapsed += 10_000;
    expect(clock.now()).toBe(initial + 300 * DAY_MS);
    clock.setAdvancing(false);
    expect(clock.now()).toBe(wall);
  });
  it("updates every body's position and rotation at the same accelerated instant", () => {
    let wall = Date.UTC(2026, 8, 9),
      elapsed = 0;
    const ephemeris = new RealTimeEphemeris(
      () => wall,
      () => elapsed,
    );
    const start = ephemeris.state.bodies.earth.orientation.clone();
    ephemeris.clock.setAdvancing(true);
    elapsed = 3;
    const state = ephemeris.update();
    const expected = solarState(new Date(wall + 0.09 * DAY_MS));
    expect(state.instant).toBe(expected.instant);
    expect(start.angleTo(state.bodies.earth.orientation)).toBeGreaterThan(0.5);
    for (const { id } of BODIES) {
      expect(
        state.bodies[id].position.distanceTo(expected.bodies[id].position),
      ).toBeLessThan(1e-10);
      expect(
        state.bodies[id].orientation.angleTo(expected.bodies[id].orientation),
      ).toBeLessThan(1e-7);
    }
    wall += 5_000;
    ephemeris.clock.setAdvancing(false);
    expect(ephemeris.update().instant).toBe(wall);
  });
});

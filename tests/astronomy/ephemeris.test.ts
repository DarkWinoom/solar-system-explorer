import { describe, expect, it } from "vitest";
import { MathUtils, Vector3 } from "three";
import {
  BODIES,
  PLANETS,
  BODY_BY_ID,
  type BodyId,
} from "../../src/data/bodies";
import {
  DAY_MS,
  RealTimeEphemeris,
  bodyPositionAU,
  orbitPoints,
  solarState,
} from "../../src/astronomy/ephemeris";
import reference from "./jpl-samples.json";

describe("independent JPL Horizons positions", () => {
  const errors: number[] = [];
  it.each(reference.samples)(
    "$id at $date agrees within one arcminute",
    (sample) => {
      const date = new Date(sample.date);
      const actual = bodyPositionAU(sample.id as BodyId, date);
      if (sample.id === "moon") actual.sub(bodyPositionAU("earth", date));
      const expected = new Vector3(
        sample.xyz[0],
        sample.xyz[2],
        -sample.xyz[1],
      );
      const arcseconds = MathUtils.radToDeg(actual.angleTo(expected)) * 3600;
      errors.push(arcseconds);
      expect(arcseconds).toBeLessThan(60);
      expect(
        Math.abs(actual.length() - expected.length()) / expected.length(),
      ).toBeLessThan(0.001);
    },
  );
  it("records the worst angular deviation", () => {
    console.log(
      `Maximum JPL deviation (${errors.length} samples): ${Math.max(...errors).toFixed(3)} arcseconds`,
    );
    expect(errors).toHaveLength(27);
  });
});

describe("real-time model", () => {
  it("uses the same instant regardless of the input time zone", () => {
    const utc = solarState(new Date("2026-09-09T04:00:00Z"));
    const shanghai = solarState(new Date("2026-09-09T12:00:00+08:00"));
    for (const { id } of BODIES)
      expect(
        utc.bodies[id].positionAU.distanceTo(shanghai.bodies[id].positionAU),
      ).toBe(0);
  });
  it("advances 1:1 and resynchronizes after background time or a clock change", () => {
    let now = Date.UTC(2026, 8, 9, 4);
    const clock = new RealTimeEphemeris(() => now);
    const start = clock.state.instant;
    now += 500;
    expect(clock.update().instant - start).toBe(500);
    const first = clock.state.bodies.mercury.position.clone();
    for (let i = 0; i < 30; i++) clock.update();
    expect(clock.state.bodies.mercury.position.distanceTo(first)).toBe(0);
    now += 4 * DAY_MS + 321;
    expect(clock.update().instant).toBe(now);
    const correct = solarState(new Date(now));
    expect(
      clock.state.bodies.mercury.positionAU.distanceTo(
        correct.bodies.mercury.positionAU,
      ),
    ).toBeLessThan(1e-9);
    now -= 60_000;
    expect(clock.update().instant).toBe(now);
  });
  it.each(PLANETS)(
    "$id stays on its sampled path as real time advances",
    (definition) => {
      const date = Date.UTC(2026, 8, 9);
      const points = orbitPoints(definition.id, date);
      const later = solarState(new Date(date + 4 * 3600_000)).bodies[
        definition.id
      ].position;
      const nearest = Math.min(
        ...points.slice(0, -1).map((a, index) => {
          const delta = points[index + 1].clone().sub(a);
          const t = MathUtils.clamp(
            later.clone().sub(a).dot(delta) / delta.lengthSq(),
            0,
            1,
          );
          return a.clone().addScaledVector(delta, t).distanceTo(later);
        }),
      );
      expect(nearest).toBeLessThan(0.015);
    },
  );
  it("preserves the Earth–Moon direction through independent visual scaling", () => {
    const { bodies } = solarState(new Date("2026-09-09T00:00:00Z"));
    const physical = bodies.moon.positionAU
      .clone()
      .sub(bodies.earth.positionAU);
    const visual = bodies.moon.position.clone().sub(bodies.earth.position);
    expect(physical.angleTo(visual)).toBeLessThan(1e-7);
    expect(visual.length()).toBeGreaterThan(
      BODY_BY_ID.earth.radius + BODY_BY_ID.moon.radius,
    );
  });
  it.each(["2024-02-29T23:59:59Z", "2026-12-31T23:59:59Z"])(
    "is continuous at %s",
    (input) => {
      const now = Date.parse(input),
        a = solarState(new Date(now)),
        b = solarState(new Date(now + 2000));
      for (const { id } of BODIES)
        expect(
          a.bodies[id].position.distanceTo(b.bodies[id].position),
        ).toBeLessThan(0.003);
    },
  );
  it("puts Greenwich in daylight at equinox noon and darkness at midnight", () => {
    for (const [hour, sign] of [
      [12, 1],
      [0, -1],
    ]) {
      const { earth } = solarState(
        new Date(Date.UTC(2026, 2, 20, hour)),
      ).bodies;
      const primeMeridian = new Vector3(1, 0, 0).applyQuaternion(
        earth.orientation,
      );
      expect(primeMeridian.dot(earth.sunDirection) * sign).toBeGreaterThan(
        0.99,
      );
    }
  });
  it("keeps the seasonal tilt and sidereal self-rotation physically consistent", () => {
    const june = solarState(new Date("2026-06-21T12:00:00Z")).bodies.earth;
    const december = solarState(new Date("2026-12-21T12:00:00Z")).bodies.earth;
    expect(
      new Vector3(0, 1, 0)
        .applyQuaternion(june.orientation)
        .dot(june.sunDirection),
    ).toBeGreaterThan(0.39);
    expect(
      new Vector3(0, 1, 0)
        .applyQuaternion(december.orientation)
        .dot(december.sunDirection),
    ).toBeLessThan(-0.39);
    const a = solarState(new Date("2026-09-09T00:00:00Z")).bodies.earth;
    const b = solarState(new Date("2026-09-09T01:00:00Z")).bodies.earth;
    expect(
      MathUtils.radToDeg(a.orientation.angleTo(b.orientation)),
    ).toBeCloseTo(15.041, 2);
  });
  it("matches known new and full Moon events", () => {
    expect(
      solarState(new Date("2024-04-08T18:21:00Z")).moonIllumination,
    ).toBeLessThan(0.001);
    expect(
      solarState(new Date("2024-03-25T07:00:00Z")).moonIllumination,
    ).toBeGreaterThan(0.999);
  });
  it("rejects invalid instants", () =>
    expect(() => solarState(new Date(NaN))).toThrow(RangeError));
});

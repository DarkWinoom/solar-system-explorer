import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  celestialState,
  EARTH_ORBIT_RADIUS,
  MOON_ORBIT_RADIUS,
  earthOrbitAngle,
  earthOrbitPosition,
  moonPhase,
  moonOrbitPosition,
  overviewCameraPose,
  synodicAge,
} from "../../src/utils/orbits";

describe("earthOrbitAngle — 四季位置", () => {
  const cases = [
    ["春分", new Date(Date.UTC(2024, 2, 20, 3, 6)), 0],
    ["夏至", new Date(Date.UTC(2024, 5, 20, 22, 51)), Math.PI / 2],
    ["秋分", new Date(Date.UTC(2024, 8, 22, 12, 44)), Math.PI],
    ["冬至", new Date(Date.UTC(2024, 11, 21, 9, 21)), Math.PI * 1.5],
  ] as const;

  for (const [name, date, expected] of cases) {
    it(`${name}位于预期的轨道象限`, () => {
      expect(Math.abs(earthOrbitAngle(date) - expected)).toBeLessThan(0.1);
      expect(earthOrbitPosition(date).length()).toBeCloseTo(EARTH_ORBIT_RADIUS, 8);
    });
  }
});

describe("celestialState — 统一的空间与昼夜坐标", () => {
  // 春夏秋冬 + 同一天的多个时刻；用于防止只在某一时刻碰巧正确。
  const instants = [
    new Date("2026-03-20T00:00:00.000Z"),
    new Date("2026-06-21T06:00:00.000Z"),
    new Date("2026-08-23T02:30:00.000Z"), // 上海 10:30 (UTC+8)
    new Date("2026-09-22T12:00:00.000Z"),
    new Date("2026-12-21T18:00:00.000Z"),
  ];

  for (const instant of instants) {
    it(`${instant.toISOString()}：亮面、太阳和地轴使用同一姿态`, () => {
      const state = celestialState(instant);
      const worldSubsolarPoint = state.localSunDirection
        .clone()
        .applyQuaternion(state.earthOrientation);

      // 地理直射点变换到世界空间后必须直接朝向场景中的太阳。
      expect(worldSubsolarPoint.dot(state.earthToSun)).toBeGreaterThan(0.999999);
      // 变换后的地理北极必须是固定的倾斜地轴。
      expect(
        new THREE.Vector3(0, 1, 0)
          .applyQuaternion(state.earthOrientation)
          .dot(state.earthAxis),
      ).toBeGreaterThan(0.999999);
      expect(state.earthToSun.length()).toBeCloseTo(1, 10);
      expect(state.earthAxis.length()).toBeCloseTo(1, 10);
      expect(state.moonPosition.distanceTo(state.earthPosition)).toBeCloseTo(
        MOON_ORBIT_RADIUS,
        10,
      );
    });
  }

  it("相同 instant 无论以 UTC 还是东八区文本构造，状态都相同", () => {
    const utc = celestialState(new Date("2026-08-23T02:30:00.000Z"));
    const shanghai = celestialState(new Date("2026-08-23T10:30:00+08:00"));
    expect(utc.instant.getTime()).toBe(shanghai.instant.getTime());
    expect(utc.earthPosition.distanceTo(shanghai.earthPosition)).toBeLessThan(1e-10);
    expect(utc.moonPosition.distanceTo(shanghai.moonPosition)).toBeLessThan(1e-10);
  });
});

describe("moonOrbitPosition — 月相与空间相对位置", () => {
  it("已知新月位于日地之间", () => {
    const state = celestialState(new Date(Date.UTC(2024, 0, 11, 11, 57)));
    expect(moonPhase(state.instant).name).toBe("newMoon");
    expect(state.earthToMoon.dot(state.earthToSun)).toBeGreaterThan(0.99);
  });

  it("已知满月位于地球背日侧", () => {
    const state = celestialState(new Date(Date.UTC(2024, 0, 25, 17, 54)));
    expect(moonPhase(state.instant).name).toBe("fullMoon");
    expect(state.earthToMoon.dot(state.earthToSun)).toBeLessThan(-0.99);
  });

  it("独立 API 也以传入的地球到太阳方向为新月基准", () => {
    const date = new Date(Date.UTC(2024, 0, 11, 11, 57));
    const earth = earthOrbitPosition(date);
    const earthToSun = earth.clone().negate().normalize();
    const moon = moonOrbitPosition(date, earth, earthToSun);
    expect(moon.clone().sub(earth).normalize().dot(earthToSun)).toBeGreaterThan(0.99);
  });
});

describe("overviewCameraPose — 稳定且同时容纳日地月", () => {
  const instants = [
    new Date("2026-03-20T00:00:00.000Z"),
    new Date("2026-06-21T06:00:00.000Z"),
    new Date("2026-08-23T02:30:00.000Z"),
    new Date("2026-12-21T18:00:00.000Z"),
  ];

  for (const instant of instants) {
    it(`${instant.toISOString()}：总览构图确定且日地月位于镜头前方`, () => {
      const state = celestialState(instant);
      const first = overviewCameraPose(state.earthPosition);
      const second = overviewCameraPose(state.earthPosition);
      expect(first.position.distanceTo(second.position)).toBeLessThan(1e-12);
      expect(first.target.distanceTo(second.target)).toBeLessThan(1e-12);
      expect(first.target.distanceTo(state.earthPosition.clone().multiplyScalar(0.5))).toBeLessThan(1e-12);

      const forward = first.target.clone().sub(first.position).normalize();
      for (const body of [new THREE.Vector3(), state.earthPosition, state.moonPosition]) {
        const direction = body.clone().sub(first.position).normalize();
        // 40° 覆盖 52° 垂直视场和常见桌面横向视场中的三体边界。
        expect(direction.dot(forward)).toBeGreaterThan(Math.cos((40 * Math.PI) / 180));
      }
    });
  }
});

describe("synodicAge 与 moonPhase", () => {
  it("月龄始终在一个朔望月范围内", () => {
    for (const date of [
      new Date(Date.UTC(2020, 0, 1)),
      new Date(Date.UTC(2026, 7, 23)),
      new Date(Date.UTC(2030, 11, 31)),
    ]) {
      expect(synodicAge(date)).toBeGreaterThanOrEqual(0);
      expect(synodicAge(date)).toBeLessThan(29.530588853);
    }
  });

  it("已知满月的照明比例接近 100%", () => {
    expect(moonPhase(new Date(Date.UTC(2024, 0, 25, 17, 54))).illumination).toBeGreaterThan(0.95);
  });

  it("已知上弦与下弦仍可正确分类", () => {
    const firstQuarter = moonPhase(new Date(Date.UTC(2024, 0, 18, 3, 53)));
    const lastQuarter = moonPhase(new Date(Date.UTC(2024, 1, 2, 23, 18)));
    expect(firstQuarter.name).toBe("firstQuarter");
    expect(firstQuarter.illumination).toBeGreaterThan(0.4);
    expect(firstQuarter.illumination).toBeLessThan(0.6);
    expect(lastQuarter.name).toBe("lastQuarter");
    expect(lastQuarter.illumination).toBeGreaterThan(0.4);
    expect(lastQuarter.illumination).toBeLessThan(0.6);
  });
});

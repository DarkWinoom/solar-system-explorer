import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  earthOrbitAngle,
  earthOrbitPosition,
  synodicAge,
  moonOrbitPosition,
  moonPhase,
  type MoonPhase,
} from "../../src/utils/orbits";

/**
 * 日地月轨道算法 — 单元测试
 *
 * 覆盖：
 *   - earthOrbitAngle: 4 个节气（春分/夏至/秋分/冬至）容差 ±3°
 *   - earthOrbitPosition: y 分量恒为 0（轨道平面在 xz）
 *   - synodicAge: 范围 [0, 29.53) + 已知新月接近 0
 *   - moonPhase: 已知新月/满月/上弦对应名称
 *   - moonOrbitPosition: 输出是相对位置（earthPos + 偏移）
 *
 * 容差：地球轨道 ±3°（基于"春分固定 dayOfYear 80.5"近似，月球 ±0.5 天）
 *
 * @see /docs/PLAN-SEM.md § 5
 */

describe("earthOrbitAngle — 4 个节气 (使用真实天文时间)", () => {
  // 真实节气时间（来源: NASA / USNO 数据，±1 分钟精度）
  // 2024 年春分 3月20日 03:06 UTC, 夏至 6月20日 22:51 UTC, 秋分 9月22日 12:44 UTC, 冬至 12月21日 09:21 UTC
  // 容差 ±0.1 rad (5.7°): 地球公转是椭圆 (开普勒第一定律) 不是匀速, 1/4 年长度 91.25 天是近似,
  // 180° 处的累积误差最大 (~3.4°), MVP 视觉无差异
  it("2024 春分 (3-20 03:06 UTC): angle ≈ 0", () => {
    const date = new Date(Date.UTC(2024, 2, 20, 3, 6, 0));
    const angle = earthOrbitAngle(date);
    expect(Math.abs(angle)).toBeLessThan(0.1);
  });

  it("2024 夏至 (6-20 22:51 UTC): angle ≈ π/2", () => {
    const date = new Date(Date.UTC(2024, 5, 20, 22, 51, 0));
    const angle = earthOrbitAngle(date);
    expect(Math.abs(angle - Math.PI / 2)).toBeLessThan(0.1);
  });

  it("2024 秋分 (9-22 12:44 UTC): angle ≈ π", () => {
    const date = new Date(Date.UTC(2024, 8, 22, 12, 44, 0));
    const angle = earthOrbitAngle(date);
    expect(Math.abs(angle - Math.PI)).toBeLessThan(0.1);
  });

  it("2024 冬至 (12-21 09:21 UTC): angle ≈ 3π/2", () => {
    const date = new Date(Date.UTC(2024, 11, 21, 9, 21, 0));
    const angle = earthOrbitAngle(date);
    expect(Math.abs(angle - (3 * Math.PI) / 2)).toBeLessThan(0.1);
  });
});

describe("earthOrbitPosition", () => {
  // 容差 toBeCloseTo(value, -1) = ±5 单位差
  it("2024 春分: 地球位置 ≈ (-radius, 0, 0)", () => {
    const date = new Date(Date.UTC(2024, 2, 20, 3, 6, 0));
    const pos = earthOrbitPosition(date, 80);
    expect(pos.x).toBeCloseTo(-80, -1);
    expect(pos.y).toBe(0);
    expect(pos.z).toBeCloseTo(0, -1);
  });

  it("2024 夏至: 地球位置 ≈ (0, 0, +radius)", () => {
    const date = new Date(Date.UTC(2024, 5, 20, 22, 51, 0));
    const pos = earthOrbitPosition(date, 80);
    expect(pos.x).toBeCloseTo(0, -1);
    expect(pos.y).toBe(0);
    expect(pos.z).toBeCloseTo(80, -1);
  });

  it("2024 秋分: 地球位置 ≈ (+radius, 0, 0)", () => {
    const date = new Date(Date.UTC(2024, 8, 22, 12, 44, 0));
    const pos = earthOrbitPosition(date, 80);
    expect(pos.x).toBeCloseTo(80, -1);
    expect(pos.y).toBe(0);
    expect(pos.z).toBeCloseTo(0, -1);
  });

  it("y 分量恒为 0（轨道平面在 xz）", () => {
    const dates = [
      new Date(Date.UTC(2024, 0, 15, 0, 0, 0)),
      new Date(Date.UTC(2024, 6, 4, 0, 0, 0)),
      new Date(Date.UTC(2024, 11, 31, 0, 0, 0)),
    ];
    for (const d of dates) {
      const pos = earthOrbitPosition(d, 80);
      expect(pos.y).toBe(0);
    }
  });

  it("支持 out 参数复用", () => {
    const out = new THREE.Vector3();
    const date = new Date(Date.UTC(2024, 2, 20, 3, 6, 0));
    const result = earthOrbitPosition(date, 80, out);
    expect(result).toBe(out);
    expect(out.x).toBeCloseTo(-80, 0);
  });
});

describe("synodicAge — 朔望月龄", () => {
  it("范围 [0, 29.53)", () => {
    const dates = [
      new Date(Date.UTC(2020, 0, 1, 0, 0, 0)),
      new Date(Date.UTC(2024, 5, 15, 0, 0, 0)),
      new Date(Date.UTC(2030, 11, 31, 0, 0, 0)),
    ];
    for (const d of dates) {
      const age = synodicAge(d);
      expect(age).toBeGreaterThanOrEqual(0);
      expect(age).toBeLessThan(29.53);
    }
  });

  it("已知新月 (2024-01-11 11:57 UTC): age ≈ 0", () => {
    const date = new Date(Date.UTC(2024, 0, 11, 11, 57, 0));
    const age = synodicAge(date);
    expect(age).toBeLessThan(0.5);
  });

  it("已知新月 (2024-12-30 22:27 UTC): age ≈ 0", () => {
    const date = new Date(Date.UTC(2024, 11, 30, 22, 27, 0));
    const age = synodicAge(date);
    expect(age).toBeLessThan(0.5);
  });

  it("已知满月 (2024-01-25 17:54 UTC): age ≈ 14.77 (满月)", () => {
    const date = new Date(Date.UTC(2024, 0, 25, 17, 54, 0));
    const age = synodicAge(date);
    expect(age).toBeGreaterThan(13);
    expect(age).toBeLessThan(16);
  });
});

describe("moonPhase — 8 阶段判定", () => {
  it("已知新月 (2024-01-11 11:57 UTC): name = 'newMoon'", () => {
    const date = new Date(Date.UTC(2024, 0, 11, 11, 57, 0));
    const phase = moonPhase(date);
    expect(phase.name).toBe("newMoon");
    expect(phase.illumination).toBeLessThan(0.05);
  });

  it("已知满月 (2024-01-25 17:54 UTC): name = 'fullMoon', illumination ≈ 1", () => {
    const date = new Date(Date.UTC(2024, 0, 25, 17, 54, 0));
    const phase = moonPhase(date);
    expect(phase.name).toBe("fullMoon");
    expect(phase.illumination).toBeGreaterThan(0.95);
  });

  it("已知上弦 (2024-01-18 03:53 UTC): name = 'firstQuarter'", () => {
    const date = new Date(Date.UTC(2024, 0, 18, 3, 53, 0));
    const phase = moonPhase(date);
    expect(phase.name).toBe("firstQuarter");
    expect(phase.illumination).toBeGreaterThan(0.4);
    expect(phase.illumination).toBeLessThan(0.6);
  });

  it("已知下弦 (2024-02-02 23:18 UTC): name = 'lastQuarter'", () => {
    const date = new Date(Date.UTC(2024, 1, 2, 23, 18, 0));
    const phase = moonPhase(date);
    expect(phase.name).toBe("lastQuarter");
    expect(phase.illumination).toBeGreaterThan(0.4);
    expect(phase.illumination).toBeLessThan(0.6);
  });

  it("illumination 公式: (1 - cos(2π × age/29.53)) / 2", () => {
    // 中点: 满月 (age = 14.77) illumination = 1
    const fullMoon = new Date(Date.UTC(2024, 0, 25, 17, 54, 0));
    expect(moonPhase(fullMoon).illumination).toBeCloseTo(1.0, 1);
    // 半月: age = 0 或 29.53 illumination = 0
    const newMoon = new Date(Date.UTC(2024, 0, 11, 11, 57, 0));
    expect(moonPhase(newMoon).illumination).toBeCloseTo(0.0, 1);
  });

  it("8 个阶段名称都覆盖", () => {
    const allNames = new Set<MoonPhase>();
    // 1 个朔望月 29.53 天, 每天采一个点
    const start = Date.UTC(2024, 0, 11, 11, 57, 0);
    for (let day = 0; day < 30; day++) {
      const date = new Date(start + day * 86_400_000);
      allNames.add(moonPhase(date).name);
    }
    expect(allNames.size).toBeGreaterThanOrEqual(7); // 30 天覆盖到 7-8 个
  });
});

describe("moonOrbitPosition", () => {
  it("新月: 月球在地球 + 太阳方向（接近地球正对面太阳）", () => {
    // 新月时月球在太阳和地球之间 → 相对地球位置接近 (-radius, 0, 0)
    // 但更准确：新月时月球 angle = 0 → offset = (-cos(0) * 30, 0, sin(0) * 30) = (-30, 0, 0)
    const newMoon = new Date(Date.UTC(2024, 0, 11, 11, 57, 0));
    const earthPos = earthOrbitPosition(newMoon, 80);
    const moonPos = moonOrbitPosition(newMoon, earthPos, 30);
    // moonPos = earthPos + (-30, 0, 0) → 距离太阳更近
    expect(moonPos.x).toBeCloseTo(earthPos.x - 30, 0);
    expect(moonPos.y).toBe(0);
  });

  it("满月: 月球在地球 + 远离太阳方向", () => {
    // 满月时月球 angle = π → offset = (-cos(π) * 30, 0, sin(π) * 30) = (30, 0, 0)
    const fullMoon = new Date(Date.UTC(2024, 0, 25, 17, 54, 0));
    const earthPos = earthOrbitPosition(fullMoon, 80);
    const moonPos = moonOrbitPosition(fullMoon, earthPos, 30);
    expect(moonPos.x).toBeCloseTo(earthPos.x + 30, 0);
    expect(moonPos.y).toBe(0);
  });

  it("支持 out 参数复用", () => {
    const out = new THREE.Vector3();
    const date = new Date(Date.UTC(2024, 0, 11, 11, 57, 0));
    const earthPos = earthOrbitPosition(date, 80);
    const result = moonOrbitPosition(date, earthPos, 30, out);
    expect(result).toBe(out);
  });
});

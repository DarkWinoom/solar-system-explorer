import { describe, it, expect } from "vitest";
import {
  solarDeclination,
  solarSubsolarLongitude,
  sunDirection,
  calcSunTimes,
} from "../../src/utils/sun";

/**
 * 太阳位置算法 — 单元测试
 *
 * 覆盖：
 *   - 4 个节气（春分 / 夏至 / 秋分 / 冬至）— 赤纬角验证
 *   - 4 个时点（UTC 0/6/12/18）— 直射经度验证
 *   - 归一化向量
 *   - 日出日落（上海春分）
 *   - 极昼 / 极夜
 *
 * 容差：±1°（NOAA 简化算法精度）
 */

describe("solarDeclination — 4 个节气", () => {
  it("春分 (~3月20日): 赤纬角 ≈ 0°", () => {
    // 2026 春分 = 3月20日 14:46 UTC（取中午 12:00 UTC 简化）
    const date = new Date(Date.UTC(2026, 2, 20, 12, 0, 0));
    const decl = solarDeclination(date);
    expect(Math.abs(decl)).toBeLessThan(1.5);
  });

  it("夏至 (~6月21日): 赤纬角 ≈ +23.45°", () => {
    const date = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
    const decl = solarDeclination(date);
    expect(Math.abs(decl - 23.45)).toBeLessThan(1.5);
  });

  it("秋分 (~9月22日): 赤纬角 ≈ 0°", () => {
    const date = new Date(Date.UTC(2026, 8, 22, 12, 0, 0));
    const decl = solarDeclination(date);
    expect(Math.abs(decl)).toBeLessThan(1.5);
  });

  it("冬至 (~12月21日): 赤纬角 ≈ -23.45°", () => {
    const date = new Date(Date.UTC(2026, 11, 21, 12, 0, 0));
    const decl = solarDeclination(date);
    expect(Math.abs(decl - -23.45)).toBeLessThan(1.5);
  });
});

describe("solarSubsolarLongitude — 4 个时点", () => {
  it("UTC 12:00: 直射本初子午线 (0°)", () => {
    const date = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
    const lon = solarSubsolarLongitude(date);
    expect(Math.abs(lon)).toBeLessThan(1);
  });

  it("UTC 00:00: 直射 +180° (国际日期变更线附近)", () => {
    const date = new Date(Date.UTC(2026, 5, 21, 0, 0, 0));
    const lon = solarSubsolarLongitude(date);
    expect(Math.abs(lon - 180)).toBeLessThan(1);
  });

  it("UTC 06:00: 直射 +90° (东经 90°)", () => {
    // 物理：6h 之前太阳在本初子午线东方 6h × 15° = 90°（即东经 90°）
    // 公式 lon = (12 - UTC_hour) × 15
    const date = new Date(Date.UTC(2026, 5, 21, 6, 0, 0));
    const lon = solarSubsolarLongitude(date);
    expect(Math.abs(lon - 90)).toBeLessThan(1);
  });

  it("UTC 18:00: 直射 -90° (西经 90°)", () => {
    const date = new Date(Date.UTC(2026, 5, 21, 18, 0, 0));
    const lon = solarSubsolarLongitude(date);
    expect(Math.abs(lon - -90)).toBeLessThan(1);
  });
});

describe("sunDirection — 归一化向量", () => {
  it("任意时间点: |sunDir| = 1（单位向量）", () => {
    const testCases = [
      new Date(Date.UTC(2026, 2, 20, 12, 0, 0)), // 春分正午
      new Date(Date.UTC(2026, 5, 21, 12, 0, 0)), // 夏至正午
      new Date(Date.UTC(2026, 11, 21, 12, 0, 0)), // 冬至正午
      new Date(Date.UTC(2026, 5, 21, 6, 0, 0)), // UTC 6
    ];

    for (const date of testCases) {
      const [x, y, z] = sunDirection(date);
      const length = Math.sqrt(x * x + y * y + z * z);
      expect(Math.abs(length - 1)).toBeLessThan(1e-9);
    }
  });

  it("夏至正午: y 分量 = sin(decl)（太阳偏北）", () => {
    const date = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
    // 用 solarDeclination 算预期（公式 sin 在 n=172 不精确 = 1，所以 decl 不是精确 23.45）
    const declDeg = solarDeclination(date);
    const expectedY = Math.sin((declDeg * Math.PI) / 180);
    const [, y] = sunDirection(date);
    expect(Math.abs(y - expectedY)).toBeLessThan(1e-9);
  });

  it("支持 out 参数复用（性能优化）", () => {
    const date = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
    const out: [number, number, number] = [0, 0, 0];
    const result = sunDirection(date, out);
    // 同一个引用
    expect(result).toBe(out);
    expect(out[0] !== 0 || out[1] !== 0 || out[2] !== 0).toBe(true);
  });
});

describe("calcSunTimes — 日出日落", () => {
  it("上海春分 (~3月20日): 日出 ~6:00，日落 ~18:00（本地 UTC+8）", () => {
    const date = new Date(Date.UTC(2026, 2, 20, 12, 0, 0));
    const { sunrise, sunset } = calcSunTimes(31.23, 121.47, date, 8);

    expect(sunrise).not.toBeNull();
    expect(sunset).not.toBeNull();

    if (sunrise !== null && sunset !== null) {
      // 容差 ±1 小时（简化算法精度）
      expect(Math.abs(sunrise - 6)).toBeLessThan(1);
      expect(Math.abs(sunset - 18)).toBeLessThan(1);
      // 日长应该接近 12 小时
      const dayLength = sunset - sunrise;
      expect(Math.abs(dayLength - 12)).toBeLessThan(1);
    }
  });

  it("赤道春分: 日出 ~6:00，日落 ~18:00（任意经度都接近 6/18）", () => {
    const date = new Date(Date.UTC(2026, 2, 20, 12, 0, 0));
    const { sunrise, sunset } = calcSunTimes(0, 0, date, 0);

    if (sunrise !== null && sunset !== null) {
      expect(Math.abs(sunrise - 6)).toBeLessThan(0.5);
      expect(Math.abs(sunset - 18)).toBeLessThan(0.5);
    }
  });

  it("时区偏移影响本地显示时间（上海日出 5:24 春分实际）", () => {
    // 春分太阳直射赤道，任何纬度日长都是 12h
    // 但日出日落的"本地时间"取决于经度
    // 上海 121.47°E → solarNoon = 12 - 121.47/15 ≈ 3.90 UTC = 11:54 上海时间
    // 日长 12h → 日出 5:54 上海, 日落 17:54 上海
    // 注：实际上海春分日出约 6:00（因 equation of time 略偏）
    const date = new Date(Date.UTC(2026, 2, 20, 12, 0, 0));
    const { sunrise, sunset } = calcSunTimes(31.23, 121.47, date, 8);

    // 日出应在 5:30-6:30 之间
    if (sunrise !== null) {
      expect(sunrise).toBeGreaterThan(5);
      expect(sunrise).toBeLessThan(7);
    }
    if (sunset !== null) {
      expect(sunset).toBeGreaterThan(17);
      expect(sunset).toBeLessThan(19);
    }
  });
});

describe("calcSunTimes — 极昼 / 极夜", () => {
  it("北极 80° 夏至: 极昼（无日出无日落）", () => {
    const date = new Date(Date.UTC(2026, 5, 21, 12, 0, 0));
    const { sunrise, sunset } = calcSunTimes(80, 0, date, 0);
    expect(sunrise).toBeNull();
    expect(sunset).toBeNull();
  });

  it("北极 80° 冬至: 极夜（无日出无日落）", () => {
    const date = new Date(Date.UTC(2026, 11, 21, 12, 0, 0));
    const { sunrise, sunset } = calcSunTimes(80, 0, date, 0);
    expect(sunrise).toBeNull();
    expect(sunset).toBeNull();
  });

  it("南极 80° 冬至: 极昼（南半球相反）", () => {
    // 南半球冬至（12月21日）= 南极的夏至 → 极昼
    const date = new Date(Date.UTC(2026, 11, 21, 12, 0, 0));
    const { sunrise, sunset } = calcSunTimes(-80, 0, date, 0);
    expect(sunrise).toBeNull();
    expect(sunset).toBeNull();
  });
});

describe("回归测试 — 完整链路", () => {
  it("2026-08-19 20:00 UTC（项目当前时间附近）: 太阳直射北半球 + 经度 -120°", () => {
    const date = new Date(Date.UTC(2026, 7, 19, 20, 0, 0));
    const [x, y, z] = sunDirection(date);
    // y > 0（北半球夏天 → decl > 0）
    expect(y).toBeGreaterThan(0);
    // 直射经度：UTC 20:00 → 12 时 0，差 8h → -120°
    // 2026-08-20 修正:sunDirection x 分量 = -cos(decl)·cos(lon) 匹配 Three.js 球体
    const declDeg = solarDeclination(date);
    const expectedX =
      -Math.cos((declDeg * Math.PI) / 180) *
      Math.cos((-120 * Math.PI) / 180);
    expect(Math.abs(x - expectedX)).toBeLessThan(1e-9);
    // 验证 z 分量 = cos(decl) × sin(-120°)
    const expectedZ =
      Math.cos((declDeg * Math.PI) / 180) *
      Math.sin((-120 * Math.PI) / 180);
    expect(Math.abs(z - expectedZ)).toBeLessThan(1e-9);
  });
});

import { describe, it, expect } from "vitest";
import { tzOffsetHours } from "../../src/geo/timezone";

/**
 * tzOffsetHours 测试
 *
 * 3 件事(测试细化偏好):
 *   1. 已知时区(Asia/Shanghai)返回正确偏移(全年 +8)
 *   2. 夏令时时区(America/Los_Angeles)夏令时 -7 / 冬令时 -8
 *   3. 错误时区抛错或返回 NaN(Intl 行为)
 */
describe("tzOffsetHours", () => {
  it("returns +8 for Asia/Shanghai (no DST)", () => {
    // 9 月(夏)、1 月(冬)都是 +8
    expect(tzOffsetHours("Asia/Shanghai", new Date(2026, 8, 8))).toBeCloseTo(8, 5);
    expect(tzOffsetHours("Asia/Shanghai", new Date(2026, 0, 1))).toBeCloseTo(8, 5);
  });

  it("returns -7 for America/Los_Angeles in summer (PDT)", () => {
    // 2026-09-08 仍在 PDT(-7)
    expect(tzOffsetHours("America/Los_Angeles", new Date(2026, 8, 8))).toBeCloseTo(-7, 5);
  });

  it("returns -8 for America/Los_Angeles in winter (PST)", () => {
    // 2026-01-15 PST(-8)
    expect(tzOffsetHours("America/Los_Angeles", new Date(2026, 0, 15))).toBeCloseTo(-8, 5);
  });

  it("returns 0 for UTC", () => {
    expect(tzOffsetHours("UTC", new Date(2026, 8, 8))).toBeCloseTo(0, 5);
    expect(tzOffsetHours("Etc/UTC", new Date(2026, 0, 1))).toBeCloseTo(0, 5);
  });

  it("returns -4 for America/New_York in summer (EDT)", () => {
    // EDT (夏令时) = UTC-4,EST (冬令时) = UTC-5
    expect(tzOffsetHours("America/New_York", new Date(2026, 8, 8))).toBeCloseTo(-4, 5);
  });

  it("returns -5 for America/New_York in winter (EST)", () => {
    expect(tzOffsetHours("America/New_York", new Date(2026, 0, 15))).toBeCloseTo(-5, 5);
  });

  it("handles half-hour timezones (Asia/Kolkata = +5.5)", () => {
    expect(tzOffsetHours("Asia/Kolkata", new Date(2026, 8, 8))).toBeCloseTo(5.5, 5);
  });
});

import { describe, it, expect } from "vitest";
import { formatCountdown, formatLocalTime } from "../../src/ui/format";

/**
 * UI 格式化工具测试
 *
 * 3 件事覆盖:
 *   1. formatCountdown  — ms → "Xh Ym" / 极昼极夜 / 跨午夜
 *   2. formatLocalTime  — Date → "HH:MM:SS" (本地时区)
 */
describe("formatCountdown", () => {
  it("formats hours and minutes (positive)", () => {
    // 5h 18m
    const result = formatCountdown(5 * 3600_000 + 18 * 60_000);
    expect(result).toBe("5h 18m");
  });

  it("formats hours only when minutes = 0", () => {
    expect(formatCountdown(3 * 3600_000)).toBe("3h 0m");
  });

  it("formats minutes only when hours = 0", () => {
    expect(formatCountdown(45 * 60_000)).toBe("0h 45m");
  });

  it("returns polar-day string for null sunrise/sunset (极昼)", () => {
    // 当 calcSunTimes 返回 null 时,InfoCard 显示极昼/极夜
    // 这个测试覆盖 UI 层的格式化策略(不是 null 检测)
    const ms = Number.POSITIVE_INFINITY; // 用 Infinity 表示"无事件"
    const result = formatCountdown(ms);
    expect(result).toBe("--");
  });

  it("handles negative ms (event already passed today, wraps to tomorrow)", () => {
    // 倒计时 0 = 现在;负数 = 已过去(InfoCard 应跳到明天同一时刻)
    // UI 层把负数当成 0 处理
    expect(formatCountdown(-1000)).toBe("0h 0m");
  });
});

describe("formatLocalTime", () => {
  it("formats date as HH:MM:SS in 24h", () => {
    const date = new Date(2026, 0, 1, 19, 24, 35);
    // padStart 行为
    expect(formatLocalTime(date)).toBe("19:24:35");
  });

  it("zero-pads single-digit hours/minutes/seconds", () => {
    const date = new Date(2026, 0, 1, 1, 2, 3);
    expect(formatLocalTime(date)).toBe("01:02:03");
  });

  it("shows 00:00:00 at midnight", () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    expect(formatLocalTime(date)).toBe("00:00:00");
  });

  it("shows 23:59:59 just before midnight", () => {
    const date = new Date(2026, 0, 1, 23, 59, 59);
    expect(formatLocalTime(date)).toBe("23:59:59");
  });
});

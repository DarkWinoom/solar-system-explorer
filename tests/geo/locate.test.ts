import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  locate,
  _resetLocateForTest,
  _setGetTimezoneOverrideForTest,
} from "../../src/geo/locate";

/**
 * 位置识别策略链测试
 *
 * 优先级(2026-08-20 用户反馈调整):
 *   0. URL ?loc=lat,lon (手动覆盖,最高优先级)
 *   1. Intl 时区查内置表 → 立即用(不查 IP)
 *   2. IP API → Intl 未知时用
 *   3. UTC 兜底
 *
 * 3 件事(测试细化偏好):
 *   1. URL ?loc= 命中 → 最高优先级,其他策略不调
 *   2. Intl 命中(28 城市表)→ 用 Intl,IP API 不调
 *   3. Intl 未知 + IP API 失败 → UTC
 */
describe("locate", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    _resetLocateForTest();
    _setGetTimezoneOverrideForTest(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    _setGetTimezoneOverrideForTest(null);
    vi.restoreAllMocks();
  });

  // ---- 优先级 1: Intl 时区(用户意图)----

  it("uses Intl timezone when known (Asia/Shanghai) — no IP API call", async () => {
    _setGetTimezoneOverrideForTest(() => "Asia/Shanghai");
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const result = await locate();
    expect(result.source).toBe("intl");
    expect(result.lat).toBeCloseTo(31.2, 0);
    expect(result.lon).toBeCloseTo(121.5, 0);
    expect(result.utcOffset).toBeCloseTo(8, 0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses Intl timezone for Europe/London", async () => {
    _setGetTimezoneOverrideForTest(() => "Europe/London");
    globalThis.fetch = vi.fn();

    const result = await locate();
    expect(result.source).toBe("intl");
    expect(result.lat).toBeCloseTo(51.5, -1);
    expect(result.lon).toBeCloseTo(-0.1, -1);
    expect(result.utcOffset).toBeCloseTo(1, 0);
  });

  it("uses Intl timezone for America/Los_Angeles", async () => {
    _setGetTimezoneOverrideForTest(() => "America/Los_Angeles");
    globalThis.fetch = vi.fn();

    const result = await locate();
    expect(result.source).toBe("intl");
    expect(result.lat).toBeCloseTo(34.0, 0);
    expect(result.lon).toBeCloseTo(-118.2, 0);
    expect(result.utcOffset).toBeCloseTo(-7, 0);
  });

  // ---- 优先级 2: IP API(Intl 未知)----

  it("falls back to ipapi when Intl timezone is unknown", async () => {
    _setGetTimezoneOverrideForTest(() => "Pacific/Marquesas");
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latitude: -9.0,
        longitude: -139.5,
        timezone: "Pacific/Marquesas",
      }),
    } as Response);

    const result = await locate();
    expect(result.source).toBe("ipapi");
    expect(result.lat).toBeCloseTo(-9.0);
    expect(result.utcOffset).toBeCloseTo(-9.5, 0);
  });

  it("falls back to ipwho.is when ipapi fails AND Intl unknown", async () => {
    _setGetTimezoneOverrideForTest(() => "Pacific/Marquesas");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          latitude: -9.0,
          longitude: -139.5,
          timezone: { id: "Pacific/Marquesas" },
          connection: {},
        }),
      } as Response);

    const result = await locate();
    expect(result.source).toBe("ipwho");
  });

  // ---- 优先级 3: UTC 兜底----

  it("returns UTC (0, 0) when Intl unknown AND both IP APIs fail", async () => {
    _setGetTimezoneOverrideForTest(() => "Pacific/Marquesas");
    globalThis.fetch = vi
      .fn()
      .mockRejectedValue(new Error("network down"))
      .mockRejectedValue(new Error("network down"));

    const result = await locate();
    expect(result.source).toBe("utc");
    expect(result.lat).toBe(0);
    expect(result.lon).toBe(0);
    expect(result.utcOffset).toBe(0);
  });
});

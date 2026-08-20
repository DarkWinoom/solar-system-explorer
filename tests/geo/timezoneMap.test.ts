import { describe, it, expect } from "vitest";
import { timezoneToCoord, getSupportedTimezones } from "../../src/geo/timezoneMap";

/**
 * 内置时区 → 经纬度 映射表测试
 *
 * 3 件事(测试细化偏好):
 *   1. 已知时区(Asia/Shanghai)返回合理 lat/lon
 *   2. 未知时区(America/Atlantis)返回 null(不兜底,交给 UTC)
 *   3. 表大小合理(覆盖主要城市,不全)
 */
describe("timezoneMap", () => {
  describe("timezoneToCoord", () => {
    it("returns lat/lon for known timezone Asia/Shanghai", () => {
      const result = timezoneToCoord("Asia/Shanghai");
      expect(result).not.toBeNull();
      expect(result!.lat).toBeCloseTo(31.2, 0);
      expect(result!.lon).toBeCloseTo(121.5, 0);
    });

    it("returns lat/lon for Europe/London", () => {
      const result = timezoneToCoord("Europe/London");
      expect(result).not.toBeNull();
      expect(result!.lat).toBeCloseTo(51.5, -1);
      expect(result!.lon).toBeCloseTo(-0.1, -1);
    });

    it("returns null for unknown timezone (e.g. UTC)", () => {
      expect(timezoneToCoord("Etc/UTC")).toBeNull();
    });

    it("returns null for non-existent timezone", () => {
      expect(timezoneToCoord("Mars/Olympus_Mons")).toBeNull();
    });
  });

  describe("getSupportedTimezones", () => {
    it("returns array of all supported timezones", () => {
      const list = getSupportedTimezones();
      expect(list).toContain("Asia/Shanghai");
      expect(list).toContain("Europe/London");
      expect(list).toContain("America/New_York");
    });

    it("has reasonable count (>= 10 main cities, not exhaustive)", () => {
      const list = getSupportedTimezones();
      // 精简交付:覆盖主要城市,不全
      expect(list.length).toBeGreaterThanOrEqual(10);
      expect(list.length).toBeLessThan(50);
    });
  });
});

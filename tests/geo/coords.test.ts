import { describe, it, expect } from "vitest";
import { latLonToCameraPosition, latLonToCartesian } from "../../src/geo/coords";
import * as THREE from "three";

/**
 * 经纬度 → 3D 坐标工具测试
 *
 * 3 件事(测试细化偏好):
 *   1. 赤道本初子午线 (0,0) → x 正方向
 *   2. 北极 (90, 0) → y 正方向
 *   3. 东经 90 度 (0, 90) → z 正方向(Three.js 约定 z 朝东)
 *
 * 坐标系约定(对齐 Earth.ts sun.ts):
 *   - x = 朝向 0° 经度方向
 *   - y = 朝向北(地球自转轴北极)
 *   - z = 朝向东
 */
describe("coords", () => {
  describe("latLonToCartesian", () => {
    // ⚠️ 2026-08-20 v19g 修正:去掉 +180° lon 偏移
    //   旧公式 (带 +180 偏移) 让"地理 0° (本初)" 渲染到 Three.js +X 半球 (背阳面),
    //   跟"直射 0° 时本初朝阳 = 在 Three.js 朝阳面 (-X 半球)" 的物理意义矛盾 180°。
    //   后果: v19c/v19f 公式让 "Three.js 背阳面" 渲染成纯黑 (PBR 无 ambient + dot > 0
    //   让 mix(night, output, dayStrength) 偏向 output=0, 看不到 night texture 城市灯光)。
    //   新公式 (不带 +180 偏移) 让 latLon(0, 0) = -X 朝阳面, 跟物理"直射 0° 时本初朝阳" 一致。
    it("equator (0, 0) — geographic 0° maps to Three.js -X (朝阳面) = (-1, 0, 0)", () => {
      // 物理: 直射 0° 时本初朝阳 = 在 Three.js 朝阳面 (-X 半球)
      // 新公式: x = -cos(0)·cos(0°) = -1 = -X ✓
      const v = latLonToCartesian(0, 0);
      expect(v.x).toBeCloseTo(-1, 5);
      expect(v.y).toBeCloseTo(0, 5);
      expect(v.z).toBeCloseTo(0, 5);
    });

    it("north pole (90, 0) maps to (0, 1, 0)", () => {
      const v = latLonToCartesian(90, 0);
      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(1, 5);
      expect(v.z).toBeCloseTo(0, 5);
    });

    it("east 90° (0, 90) maps to (0, 0, 1) — 晨昏线边缘", () => {
      // 新公式: x = -cos(0)·cos(90°) = 0, z = cos(0)·sin(90°) = +1
      const v = latLonToCartesian(0, 90);
      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(0, 5);
      expect(v.z).toBeCloseTo(1, 5);
    });

    it("west 90° (0, -90) maps to (0, 0, -1)", () => {
      // 新公式: x = -cos(0)·cos(-90°) = 0, z = cos(0)·sin(-90°) = -1
      const v = latLonToCartesian(0, -90);
      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(0, 5);
      expect(v.z).toBeCloseTo(-1, 5);
    });

    it("dateline (0, 180) maps to (1, 0, 0) — 跟物理直射 180° 时 180° 朝阳错位 180°(latLon 公式固有限制)", () => {
      // 新公式: x = -cos(0)·cos(180°) = +1 = +X 背阳面
      // 注意: latLon 公式是 L 的函数, 无法让"直射 L 时 L 都在 -X 半球" 对所有 L 满足。
      //   实际意义: latLon(0, 0) = -X (直射 0° 时 0° 朝阳 ✓),
      //             latLon(0, 90)/(0, -90) = ±Z (晨昏线 ✓),
      //             latLon(0, 180) = +X (直射 180° 时 180° 朝阳, 但 latLon 让 180° 渲染在背阳面 ❌)
      //   这是 latLon 公式的"半周期" 错位: 只能让一半 L 满足"直射 L 时 L 朝阳" 物理。
      //   接受这个错位 — Earth TSL 的 sunDirection 公式跟新 latLon 一致,
      //   整体保持"上海 22:00 渲染成夜面 + Three.js 朝阳面 (latLon(0, 0)) 渲染成受光" 双对。
      const v = latLonToCartesian(0, 180);
      expect(v.x).toBeCloseTo(1, 5);
      expect(v.y).toBeCloseTo(0, 5);
      expect(v.z).toBeCloseTo(0, 5);
    });

    it("south pole (-90, 0) maps to (0, -1, 0)", () => {
      const v = latLonToCartesian(-90, 0);
      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(-1, 5);
      expect(v.z).toBeCloseTo(0, 5);
    });

    it("Beijing (39.9, 116.4) — geographic formula (no +180 offset)", () => {
      const v = latLonToCartesian(39.9, 116.4);
      const latRad = (39.9 * Math.PI) / 180;
      const lonRad = (116.4 * Math.PI) / 180;
      expect(v.x).toBeCloseTo(-Math.cos(latRad) * Math.cos(lonRad), 5);
      expect(v.y).toBeCloseTo(Math.sin(latRad), 5);
      expect(v.z).toBeCloseTo(Math.cos(latRad) * Math.sin(lonRad), 5);
    });

    it("Shanghai (31.2, 121.5) — verify for camera alignment", () => {
      const v = latLonToCartesian(31.2, 121.5);
      // 模长 = 1(单位球)
      const len = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
      expect(len).toBeCloseTo(1, 5);
      // y 应该是 sin(31.2°) ≈ 0.52(北半球偏上)
      expect(v.y).toBeCloseTo(Math.sin((31.2 * Math.PI) / 180), 5);
    });
  });

  describe("latLonToCameraPosition", () => {
    it("scales unit vector to given distance", () => {
      const v = latLonToCameraPosition(0, 0, 5.77);
      // 模长应该是 5.77
      const len = Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
      expect(len).toBeCloseTo(5.77, 5);
    });

    it("preserves direction from latLonToCartesian", () => {
      const dir = latLonToCartesian(30, 60);
      const pos = latLonToCameraPosition(30, 60, 10);
      // 比例应该一致
      expect(pos.x).toBeCloseTo(dir.x * 10, 5);
      expect(pos.y).toBeCloseTo(dir.y * 10, 5);
      expect(pos.z).toBeCloseTo(dir.z * 10, 5);
    });

    it("returns THREE.Vector3 instance", () => {
      const v = latLonToCameraPosition(0, 0, 1);
      expect(v).toBeInstanceOf(THREE.Vector3);
    });
  });
});

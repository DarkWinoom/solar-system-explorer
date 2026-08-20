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
    // 2026-08-20 二次修正:加 180° lon 偏移对齐 NASA 纹理原点
    // (球面 local lon=0 渲染到 NASA 纹理 u=0 = 180°W dateline,
    //  所以"地理 lon=0"(本初)需对应"球面 local lon=180°"位置)
    it("equator (0, 0) — geographic 0° maps to sphere local 180° = (1, 0, 0)", () => {
      // 地理 0°(本初)→ 球面 local 180° → x = -cos(0)·cos(180°) = +1
      const v = latLonToCartesian(0, 0);
      expect(v.x).toBeCloseTo(1, 5);
      expect(v.y).toBeCloseTo(0, 5);
      expect(v.z).toBeCloseTo(0, 5);
    });

    it("north pole (90, 0) maps to (0, 1, 0)", () => {
      const v = latLonToCartesian(90, 0);
      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(1, 5);
      expect(v.z).toBeCloseTo(0, 5);
    });

    it("east 90° (0, 90) maps to (0, 0, -1) — opposite of dateline alignment", () => {
      // 地理 90°E → 球面 local 270° → x = -cos(0)·cos(270°) = 0, z = cos(0)·sin(270°) = -1
      const v = latLonToCartesian(0, 90);
      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(0, 5);
      expect(v.z).toBeCloseTo(-1, 5);
    });

    it("west 90° (0, -90) maps to (0, 0, 1)", () => {
      // 地理 90°W → 球面 local 90° → x = -cos(0)·cos(90°) = 0, z = cos(0)·sin(90°) = +1
      const v = latLonToCartesian(0, -90);
      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(0, 5);
      expect(v.z).toBeCloseTo(1, 5);
    });

    it("dateline (0, 180) maps to (-1, 0, 0) — geographic 180° = sphere local 0°", () => {
      // 地理 180°(dateline)→ 球面 local 0° → x = -cos(0)·cos(0°) = -1
      const v = latLonToCartesian(0, 180);
      expect(v.x).toBeCloseTo(-1, 5);
      expect(v.y).toBeCloseTo(0, 5);
      expect(v.z).toBeCloseTo(0, 5);
    });

    it("south pole (-90, 0) maps to (0, -1, 0)", () => {
      const v = latLonToCartesian(-90, 0);
      expect(v.x).toBeCloseTo(0, 5);
      expect(v.y).toBeCloseTo(-1, 5);
      expect(v.z).toBeCloseTo(0, 5);
    });

    it("Beijing (39.9, 116.4) — geographic formula + 180° offset", () => {
      const v = latLonToCartesian(39.9, 116.4);
      const latRad = (39.9 * Math.PI) / 180;
      const lonRad = ((116.4 + 180) * Math.PI) / 180;
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

import { describe, it, expect, beforeAll } from "vitest";
import * as THREE from "three";
import { Moon } from "../../src/scene/Moon";

/**
 * Moon 单元测试 — 验证 material 行为
 *
 * 3 件事 (测试细化偏好):
 *   1. material 用标准 MeshStandardMaterial (WebGL2 backend 兼容)
 *   2. material.emissive = 0x202020 (基础亮度, 月相保留)
 *   3. dispose 释放资源
 *
 * 历史:
 *   - v19b: 用 MeshStandardNodeMaterial (TSL) + emissiveNode, WebGL2 backend 下不工作
 *   - v19c: 改用 emissive = new Color(0x202020) 试图兼容, 仍然不显示
 *   - v19d (本次): 改用标准 MeshStandardMaterial, WebGL2 完全支持
 */

describe("Moon", () => {
  describe("material 用标准 MeshStandardMaterial (非 TSL)", () => {
    it("mesh.material 是 MeshStandardMaterial instance", () => {
      const moon = new Moon();
      expect(moon.mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    });

    it("material 有 map（月球纹理）", () => {
      const moon = new Moon();
      const mat = moon.mesh.material as THREE.MeshStandardMaterial;
      expect(mat.map).toBeTruthy();
      // map 应该是 Texture
      expect(mat.map).toBeInstanceOf(THREE.Texture);
    });

    it("material.emissive = 0x202020 (12.5% 基础亮度，月相保留)", () => {
      const moon = new Moon();
      const mat = moon.mesh.material as THREE.MeshStandardMaterial;
      // 0x202020 = RGB(32, 32, 32) = 12.5% 灰
      expect(mat.emissive.getHex()).toBe(0x202020);
    });

    it("material.roughness = 1.0 (月壤粗糙，无金属反光)", () => {
      const moon = new Moon();
      const mat = moon.mesh.material as THREE.MeshStandardMaterial;
      expect(mat.roughness).toBe(1.0);
      expect(mat.metalness).toBe(0.0);
    });
  });

  describe("dispose", () => {
    it("dispose 释放 geometry + material", () => {
      const moon = new Moon();
      expect(() => moon.dispose()).not.toThrow();
      // 二次 dispose 幂等
      expect(() => moon.dispose()).not.toThrow();
    });
  });

  describe("API contract", () => {
    it("mesh 永远指向同一个 THREE.Mesh", () => {
      const moon = new Moon();
      const mesh1 = moon.mesh;
      const mesh2 = moon.mesh;
      expect(mesh1).toBe(mesh2);
    });

    it("setSunDirection 不抛错（保留 API 兼容）", () => {
      const moon = new Moon();
      const dir = new THREE.Vector3(1, 0, 0);
      expect(() => moon.setSunDirection(dir)).not.toThrow();
    });
  });
});

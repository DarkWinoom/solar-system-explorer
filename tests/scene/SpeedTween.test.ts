import { describe, it, expect, beforeEach } from "vitest";
import { SpeedTween } from "../../src/scene/SpeedTween";

/**
 * SpeedTween 测试
 *
 * 3 件事(测试细化偏好):
 *   1. 默认值 / 立即切换(0ms 持续时间)
 *   2. ease-out cubic 平滑过渡(中间值 + 终点)
 *   3. 多次 set 重新启动 tween(后一次覆盖前一次)
 *
 * 注意:SpeedTween 接收 now 参数(默认 performance.now())— 测试手动传 now,
 * 不依赖 vi.useFakeTimers(后者不 mock performance.now)
 */
describe("SpeedTween", () => {
  let tween: SpeedTween;

  beforeEach(() => {
    tween = new SpeedTween();
  });

  describe("initial state", () => {
    it("starts at value 1", () => {
      expect(tween.value).toBe(1);
    });

    it("is not animating", () => {
      expect(tween.isAnimating).toBe(false);
    });
  });

  describe("set() with durationMs = 0 (immediate)", () => {
    it("jumps to target immediately", () => {
      tween.set(60, 0);
      expect(tween.value).toBe(60);
    });

    it("is not animating after immediate set", () => {
      tween.set(60, 0);
      expect(tween.isAnimating).toBe(false);
    });
  });

  describe("set() with durationMs > 0 (tween)", () => {
    it("keeps current value at start (before update)", () => {
      tween.set(60, 1000, 0);
      // 刚 set,还没 update — value 仍是 1 (旧值)
      expect(tween.value).toBe(1);
      expect(tween.isAnimating).toBe(true);
    });

    it("reaches midpoint ~87.5% after half duration (ease-out cubic 非线性)", () => {
      tween.set(60, 1000, 0);
      tween.update(500); // 过了 50% 时间
      // ease-out cubic: 1 - (1 - 0.5)^3 = 1 - 0.125 = 0.875
      // value = 1 + (60 - 1) * 0.875 ≈ 52.625
      expect(tween.value).toBeCloseTo(52.625, 2);
    });

    it("reaches target after full duration", () => {
      tween.set(60, 1000, 0);
      tween.update(1000);
      expect(tween.value).toBe(60);
    });

    it("clamps to target if updated past duration", () => {
      tween.set(60, 1000, 0);
      tween.update(2000); // 超过
      expect(tween.value).toBe(60);
    });

    it("is not animating after reaching target", () => {
      tween.set(60, 1000, 0);
      tween.update(1000);
      expect(tween.isAnimating).toBe(false);
    });

    it("overrides previous tween when set called mid-tween", () => {
      // 第一次:1 → 60, 1000ms
      tween.set(60, 1000, 0);
      tween.update(500); // 现在 ~52
      expect(tween.value).toBeCloseTo(52.625, 2);

      // 第二次:从 52 → 1, 1000ms(覆盖之前的 60 目标)
      tween.set(1, 1000, 500); // now=500 = 重启时间点
      // 此时 tween.value 仍是 52.625(startValue = currentValue)
      tween.update(1000); // 过了 500ms(从重启点)
      // ease-out cubic 0.5: 0.875
      // value = 52.625 + (1 - 52.625) * 0.875 = 52.625 - 45.172 = 7.45
      expect(tween.value).toBeCloseTo(7.45, 1);
    });
  });
});

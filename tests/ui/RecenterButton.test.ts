import { describe, it, expect, beforeEach, vi } from "vitest";
import { RecenterState } from "../../src/ui/RecenterButton";

/**
 * RecenterButton 状态机测试
 *
 * 3 件事覆盖:
 *   1. 初始状态:hidden(用户没操作地球)
 *   2. 交互后:visible(用户拖拽 / 缩放 → 3s 后隐藏)
 *   3. 点击 recenter:触发 onRecenter 回调 + 立即隐藏
 *
 * 故意把状态机抽成独立 class(RecenterState),不耦合 OrbitControls / DOM,
 * 这样能纯单测。DOM 渲染的 class 留个简单 wrapper 即可。
 */
describe("RecenterState", () => {
  let onRecenter: ReturnType<typeof vi.fn>;
  let state: RecenterState;

  beforeEach(() => {
    onRecenter = vi.fn();
    state = new RecenterState({ onRecenter, autoHideMs: 3000 });
    vi.useFakeTimers();
  });

  describe("initial state", () => {
    it("starts hidden", () => {
      expect(state.isVisible()).toBe(false);
    });
  });

  describe("onUserInteraction", () => {
    it("shows the button", () => {
      state.onUserInteraction();
      expect(state.isVisible()).toBe(true);
    });

    it("resets auto-hide timer on repeated interactions", () => {
      state.onUserInteraction();
      vi.advanceTimersByTime(2000);
      state.onUserInteraction(); // 用户又动了一下
      vi.advanceTimersByTime(2000);
      // 距上次 onUserInteraction 才 2s,还没到 3s
      expect(state.isVisible()).toBe(true);
      vi.advanceTimersByTime(1000);
      // 累计距上次 onUserInteraction 已经 3s
      expect(state.isVisible()).toBe(false);
    });

    it("hides after autoHideMs of no interaction", () => {
      state.onUserInteraction();
      vi.advanceTimersByTime(2999);
      expect(state.isVisible()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(state.isVisible()).toBe(false);
    });
  });

  describe("recenter()", () => {
    it("triggers onRecenter callback", () => {
      state.onUserInteraction();
      state.recenter();
      expect(onRecenter).toHaveBeenCalledTimes(1);
    });

    it("hides immediately after recenter", () => {
      state.onUserInteraction();
      state.recenter();
      expect(state.isVisible()).toBe(false);
    });

    it("cancels pending auto-hide timer", () => {
      state.onUserInteraction();
      state.recenter();
      vi.advanceTimersByTime(5000);
      // 不应该被自动隐藏 timer 触发 onRecenter 二次
      expect(onRecenter).toHaveBeenCalledTimes(1);
      // 状态仍 hidden
      expect(state.isVisible()).toBe(false);
    });
  });

  describe("dispose()", () => {
    it("cancels pending timers", () => {
      state.onUserInteraction();
      state.dispose();
      vi.advanceTimersByTime(5000);
      // 不应该 auto-hide 抛错或重新触发
      expect(state.isVisible()).toBe(true);
    });
  });
});

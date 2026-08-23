import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { UIRoot } from "../../src/ui/UIRoot";
import { i18n } from "../../src/i18n";
import { zhCN } from "../../src/i18n/locales/zh-CN";
import { enUS } from "../../src/i18n/locales/en-US";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * UIRoot 关键行为测试
 *
 * 5 件事:
 *   1. mount 后 ViewModeTabs 在 DOM
 *   2. ViewModeTabs 默认 "只看地球" 高亮
 *   3. 点击 ViewModeTabs tab 触发 onViewModeChange 回调
 *   4. InfoCard / HelpHint / TopBar 仍正常存在 (regression check)
 *   5. 不再创建 RecenterButton (阶段 18c 移除)
 *   6. unmount 后 DOM 清理干净
 */
describe("UIRoot", () => {
  let parent: HTMLDivElement;
  let onViewModeChange: ReturnType<typeof vi.fn>;
  let onRecenter: ReturnType<typeof vi.fn>; // legacy, should be unused in 18c

  beforeAll(() => {
    i18n.registerLocale("zh-CN", zhCN);
    i18n.registerLocale("en-US", enUS);
  });

  beforeEach(() => {
    onViewModeChange = vi.fn();
    onRecenter = vi.fn();
    parent = document.createElement("div");
    document.body.appendChild(parent);
    i18n.setLocale("en-US");
  });

  afterEach(() => {
    parent.remove();
  });

  it("mount 后 ViewModeTabs 在 DOM", () => {
    const ui = new UIRoot({ onViewModeChange });
    ui.mount(parent);
    const tabs = parent.querySelector('[data-testid="viewmode-tabs"]');
    expect(tabs).not.toBeNull();
    ui.unmount();
  });

  it("ViewModeTabs 默认 '总览视角' tab 高亮 (v19b 默认改 overview)", () => {
    const ui = new UIRoot({ onViewModeChange });
    ui.mount(parent);
    const overviewTab = parent.querySelector(
      '[data-testid="viewmode-tab-overview"]'
    ) as HTMLButtonElement;
    expect(overviewTab.getAttribute("aria-pressed")).toBe("true");
    ui.unmount();
  });

  it("点击 '只看地球' tab → 触发 onViewModeChange('earth') (v19b 默认 overview, 测切换到 earth)", () => {
    const ui = new UIRoot({ onViewModeChange });
    ui.mount(parent);
    // 默认是 overview, 切到 earth 触发回调
    const earthTab = parent.querySelector(
      '[data-testid="viewmode-tab-earth"]'
    ) as HTMLButtonElement;
    earthTab.click();
    expect(onViewModeChange).toHaveBeenCalledWith("earth");
    ui.unmount();
  });

  it("InfoCard / TopBar / HelpHint 仍存在 (regression)", () => {
    const ui = new UIRoot({ onViewModeChange });
    ui.mount(parent);
    expect(parent.querySelector('[data-testid="info-card"]')).not.toBeNull();
    expect(parent.querySelector('[data-testid="topbar"]')).not.toBeNull();
    expect(parent.querySelector('[data-testid="help-hint"]')).not.toBeNull();
    ui.unmount();
  });

  it("不再创建 RecenterButton (阶段 18c 移除)", () => {
    const ui = new UIRoot({ onViewModeChange, onRecenter });
    ui.mount(parent);
    // RecenterButton 已删除 — 通过 data-testid 验证
    const oldRecenter = parent.querySelector('[data-testid="recenter-button"]');
    expect(oldRecenter).toBeNull();
    ui.unmount();
  });

  it("unmount 后 ViewModeTabs 移除", () => {
    const ui = new UIRoot({ onViewModeChange });
    ui.mount(parent);
    expect(parent.querySelector('[data-testid="viewmode-tabs"]')).not.toBeNull();
    ui.unmount();
    expect(parent.querySelector('[data-testid="viewmode-tabs"]')).toBeNull();
  });

  it("提供 controls 选项时挂载, 不抛错", () => {
    // mock OrbitControls 实际不调用其方法, 仅检查类型
    const controls = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as OrbitControls;
    const ui = new UIRoot({ onViewModeChange, controls });
    expect(() => ui.mount(parent)).not.toThrow();
    ui.unmount();
  });
});

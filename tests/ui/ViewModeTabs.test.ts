import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ViewModeTabs, type ViewMode } from "../../src/ui/ViewModeTabs";
import { i18n } from "../../src/i18n";
import { zhCN } from "../../src/i18n/locales/zh-CN";
import { enUS } from "../../src/i18n/locales/en-US";

const MODES: readonly ViewMode[] = ["overview", "sun", "earth", "moon"];

describe("ViewModeTabs", () => {
  let tabs: ViewModeTabs;
  let parent: HTMLDivElement;
  let onModeChange: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    i18n.registerLocale("zh-CN", zhCN);
    i18n.registerLocale("en-US", enUS);
  });

  beforeEach(() => {
    onModeChange = vi.fn();
    tabs = new ViewModeTabs({ onModeChange });
    parent = document.createElement("div");
    document.body.appendChild(parent);
    i18n.setLocale("en-US");
  });

  afterEach(() => {
    tabs.unmount();
    parent.remove();
  });

  it("默认地球视角高亮", () => {
    tabs.mount(parent);
    expect(tabs.currentMode).toBe("earth");
    expect(getButton("earth").getAttribute("aria-pressed")).toBe("true");
  });

  it("渲染总览、太阳、地球、月球四个 tab", () => {
    tabs.mount(parent);
    for (const mode of MODES) {
      expect(getButton(mode)).not.toBeNull();
    }
  });

  it.each(MODES)("点击 %s 切换状态并只触发一次回调", (mode) => {
    tabs.mount(parent);
    if (mode === "earth") {
      getButton(mode).click();
      expect(onModeChange).not.toHaveBeenCalled();
      return;
    }
    getButton(mode).click();
    expect(onModeChange).toHaveBeenCalledTimes(1);
    expect(onModeChange).toHaveBeenCalledWith(mode);
    expect(tabs.currentMode).toBe(mode);
    expect(getButton(mode).getAttribute("aria-pressed")).toBe("true");
  });

  it("setMode 仅同步 UI，不触发用户回调", () => {
    tabs.mount(parent);
    tabs.setMode("moon");
    expect(tabs.currentMode).toBe("moon");
    expect(onModeChange).not.toHaveBeenCalled();
  });

  it("中文标签为 总览、太阳、地球、月球", () => {
    tabs.mount(parent);
    i18n.setLocale("zh-CN");
    expect(getButton("overview").textContent).toBe("总览");
    expect(getButton("sun").textContent).toBe("太阳");
    expect(getButton("earth").textContent).toBe("地球");
    expect(getButton("moon").textContent).toBe("月球");
    i18n.setLocale("en-US");
  });

  function getButton(mode: ViewMode): HTMLButtonElement {
    return tabs.element.querySelector(
      `[data-testid="viewmode-tab-${mode}"]`,
    ) as HTMLButtonElement;
  }
});

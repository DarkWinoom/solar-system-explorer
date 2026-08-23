import { TopBar } from "./TopBar";
import { InfoCard } from "./InfoCard";
import { HelpHint } from "./HelpHint";
import { ViewModeTabs, type ViewMode } from "./ViewModeTabs";

/**
 * UIRoot — UI 组合根
 *
 * 装配:
 *   - TopBar          顶栏(标题 + LocaleSwitcher)
 *   - ViewModeTabs    顶栏下方居中 tabs(总览/只看地球), 阶段 18 新增, 替代 RecenterButton
 *   - InfoCard        左下角信息卡
 *   - HelpHint        右下角操作提示
 *
 * ViewModeTabs 集成:
 *   - 点击 tab → 触发 onViewModeChange(mode) 回调
 *   - UIRoot 不再监听 OrbitControls 'start' 事件(原 RecenterButton 逻辑已删除)
 *
 * @contract
 *   - `mount()` 挂载所有 UI 组件到指定 parent (默认 document.body)
 *   - `unmount()` 移除 DOM + 释放所有组件
 *   - `infoCard` 暴露给 caller (阶段 11 接 setLocation, 阶段 18 接 setMoonPhase / setOrbitPosition)
 *   - `viewModeTabs` 暴露给 caller (供阶段 18d app.ts 调 setMode)
 */
export interface UIRootOptions {
  /** 视图模式变化回调 (用户点击 ViewModeTabs 触发) */
  onViewModeChange?: (mode: ViewMode) => void;
}

export class UIRoot {
  readonly element: HTMLDivElement;
  readonly infoCard: InfoCard;
  readonly topBar: TopBar;
  readonly helpHint: HelpHint;
  readonly viewModeTabs: ViewModeTabs | null = null;
  private mounted: boolean = false;

  constructor(options: UIRootOptions = {}) {
    this.element = document.createElement("div");
    this.element.id = "ui-root";
    this.element.setAttribute("data-testid", "ui-root");
    // 容器:全屏覆盖,pointer-events: none(子组件自己设 auto)
    this.element.style.cssText = `
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: 1000;
      font-family: "Inter", sans-serif;
    `;

    this.topBar = new TopBar();
    this.infoCard = new InfoCard();
    this.helpHint = new HelpHint();

    if (options.onViewModeChange) {
      this.viewModeTabs = new ViewModeTabs({
        onModeChange: options.onViewModeChange,
        initial: "overview", // v19b 调整: 默认显示"总览视角"(看到整个日地月系统)
      });
      // 定位: TopBar 下方居中 (top: 68px, TopBar padding 12px + 12px gap)
      this.viewModeTabs.element.style.position = "absolute";
      this.viewModeTabs.element.style.top = "68px";
      this.viewModeTabs.element.style.left = "50%";
      this.viewModeTabs.element.style.transform = "translateX(-50%)";
      this.viewModeTabs.element.style.zIndex = "9";
    }
  }

  mount(parent: HTMLElement = document.body): void {
    if (this.mounted) return;
    parent.appendChild(this.element);

    this.topBar.mount(this.element);
    this.infoCard.mount(this.element);
    this.helpHint.mount(this.element);

    if (this.viewModeTabs) {
      this.viewModeTabs.mount(this.element);
    }

    this.mounted = true;
  }

  unmount(): void {
    if (!this.mounted) return;

    this.topBar.unmount();
    this.infoCard.unmount();
    this.helpHint.unmount();
    this.viewModeTabs?.unmount();

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.mounted = false;
  }
}


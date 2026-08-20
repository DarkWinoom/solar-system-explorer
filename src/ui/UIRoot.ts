import { TopBar } from "./TopBar";
import { InfoCard } from "./InfoCard";
import { HelpHint } from "./HelpHint";
import { RecenterState } from "./RecenterButton";
import { RecenterButtonView } from "./RecenterButtonView";
import type { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * UIRoot — UI 组合根
 *
 * 装配:
 *   - TopBar          顶栏(标题 + LocaleSwitcher)
 *   - InfoCard        左下角信息卡
 *   - HelpHint        右下角操作提示
 *   - RecenterButton  主场景下方(用户操作 OrbitControls 后淡入)
 *
 * OrbitControls 集成:
 *   - 'start' 事件 → RecenterState.onUserInteraction()
 *   - 点击按钮 → 触发 onRecenter 回调(相机 tween 回原视角)
 *
 * @contract
 *   - `mount(controls?)` 挂载 UI + 绑定 OrbitControls 'start' 事件
 *   - `unmount()` 移除 DOM + 释放所有组件
 *   - `infoCard` 暴露给 caller(阶段 11 接 setLocation)
 */
export interface UIRootOptions {
  controls?: OrbitControls | null;
  onRecenter?: () => void;
}

export class UIRoot {
  readonly element: HTMLDivElement;
  readonly infoCard: InfoCard;
  readonly topBar: TopBar;
  readonly helpHint: HelpHint;
  private readonly recenterState: RecenterState | null = null;
  private readonly recenterView: RecenterButtonView | null = null;
  private controls: OrbitControls | null = null;
  private onStart: (() => void) | null = null;
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

    if (options.controls) {
      this.controls = options.controls;
      this.recenterState = new RecenterState({
        onRecenter: options.onRecenter ?? (() => {}),
        autoHideMs: 3000,
      });
      this.recenterView = new RecenterButtonView(this.recenterState);
    }
  }

  mount(parent: HTMLElement = document.body): void {
    if (this.mounted) return;
    parent.appendChild(this.element);

    this.topBar.mount(this.element);
    this.infoCard.mount(this.element);
    this.helpHint.mount(this.element);

    if (this.recenterView) {
      this.recenterView.mount(this.element);
    }

    if (this.controls && this.recenterState) {
      this.onStart = () => this.recenterState!.onUserInteraction();
      this.controls.addEventListener("start", this.onStart);
    }

    this.mounted = true;
  }

  unmount(): void {
    if (!this.mounted) return;

    if (this.controls && this.onStart) {
      this.controls.removeEventListener("start", this.onStart);
      this.onStart = null;
    }

    this.topBar.unmount();
    this.infoCard.unmount();
    this.helpHint.unmount();
    this.recenterView?.unmount();
    this.recenterState?.dispose();

    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.mounted = false;
  }
}

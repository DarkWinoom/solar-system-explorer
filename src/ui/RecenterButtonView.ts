import { i18n } from "../i18n";
import { i18nKeys } from "./i18nKeys";
import { RecenterState } from "./RecenterButton";

/**
 * RecenterButtonView — DOM 渲染层
 *
 * 设计:
 *   - 监听 RecenterState 的可见性变化
 *   - visible 时 opacity 1,hidden 时 opacity 0(不卸载 DOM,纯 CSS 过渡)
 *   - 点击 → state.recenter() → 触发 onRecenter(由 caller 传,通常是相机 tween)
 *
 * @contract
 *   - `mount(parent)` 挂载
 *   - `unmount()` 移除 DOM + 释放 state
 *   - i18n 切换时 label 文本自动更新
 */
export class RecenterButtonView {
  private readonly element: HTMLButtonElement;
  private readonly labelEl: HTMLSpanElement;
  private unsubI18n: (() => void) | null = null;
  private mounted: boolean = false;
  private readonly state: RecenterState;

  constructor(state: RecenterState) {
    this.state = state;
    this.element = document.createElement("button");
    this.element.type = "button";
    this.element.setAttribute("data-testid", "recenter-button");
    this.element.style.cssText = `
      position: absolute;
      left: 50%;
      bottom: 100px;
      transform: translateX(-50%);
      padding: 10px 20px;
      background: rgba(8, 16, 32, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(77, 178, 255, 0.4);
      border-radius: 999px;
      color: #4db2ff;
      font-family: "Orbitron", sans-serif;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.1em;
      cursor: pointer;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.3s ease, background 0.2s, border-color 0.2s;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    `;
    this.element.addEventListener("mouseenter", () => {
      this.element.style.background = "rgba(77, 178, 255, 0.15)";
      this.element.style.borderColor = "rgba(77, 178, 255, 0.6)";
    });
    this.element.addEventListener("mouseleave", () => {
      this.element.style.background = "rgba(8, 16, 32, 0.85)";
      this.element.style.borderColor = "rgba(77, 178, 255, 0.4)";
    });

    this.labelEl = document.createElement("span");
    this.element.appendChild(this.labelEl);

    this.element.addEventListener("click", () => this.state.recenter());
  }

  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    parent.appendChild(this.element);
    this.unsubI18n = i18n.subscribe(() => this.renderLabel());
    this.renderLabel();
    this.syncVisibility();
    // 轮询 state(每 100ms 检查一次,够用且简单)
    this.startPolling();
    this.mounted = true;
  }

  unmount(): void {
    if (!this.mounted) return;
    this.unsubI18n?.();
    this.unsubI18n = null;
    this.stopPolling();
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.mounted = false;
  }

  private renderLabel(): void {
    this.labelEl.textContent = `⌖ ${i18n.t(i18nKeys.ui.recenter.label)}`;
  }

  // ---- state polling ----
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastVisible: boolean | null = null;

  private startPolling(): void {
    this.pollTimer = setInterval(() => this.syncVisibility(), 100);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private syncVisibility(): void {
    const visible = this.state.isVisible();
    if (visible === this.lastVisible) return;
    this.lastVisible = visible;
    this.element.style.opacity = visible ? "1" : "0";
    this.element.style.pointerEvents = visible ? "auto" : "none";
  }
}

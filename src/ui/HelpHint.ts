import { i18n } from "../i18n";
import { i18nKeys } from "./i18nKeys";

/**
 * HelpHint — 右下角操作提示
 *
 * 显示 2 行:
 *   ▸ 拖拽旋转
 *   ▸ 滚轮缩放
 *
 * 桌面(>640px)显示,移动隐藏
 *
 * @contract
 *   - `mount(parent)` 挂载
 *   - `unmount()` 移除 DOM + 取消 i18n 订阅
 *   - i18n 切换自动更新
 */
export class HelpHint {
  private readonly element: HTMLDivElement;
  private readonly dragEl: HTMLDivElement;
  private readonly zoomEl: HTMLDivElement;
  private unsubI18n: (() => void) | null = null;
  private mounted: boolean = false;
  private resizeHandler: (() => void) | null = null;

  constructor() {
    this.element = document.createElement("div");
    this.element.setAttribute("data-testid", "help-hint");
    this.element.style.cssText = `
      position: absolute;
      right: 20px;
      bottom: 20px;
      padding: 12px 16px;
      background: rgba(8, 16, 32, 0.6);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(77, 178, 255, 0.15);
      border-radius: 8px;
      color: rgba(224, 232, 255, 0.7);
      font-family: "Inter", sans-serif;
      font-size: 12px;
      pointer-events: auto;
    `;

    this.dragEl = this.makeHintRow();
    this.zoomEl = this.makeHintRow();

    this.element.appendChild(this.dragEl);
    this.element.appendChild(this.zoomEl);
  }

  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    parent.appendChild(this.element);
    this.unsubI18n = i18n.subscribe(() => this.render());
    this.resizeHandler = () => this.updateVisibility();
    window.addEventListener("resize", this.resizeHandler);
    this.render();
    this.updateVisibility();
    this.mounted = true;
  }

  unmount(): void {
    if (!this.mounted) return;
    this.unsubI18n?.();
    this.unsubI18n = null;
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.mounted = false;
  }

  private render(): void {
    this.dragEl.lastChild!.textContent = i18n.t(i18nKeys.ui.help.drag);
    this.zoomEl.lastChild!.textContent = i18n.t(i18nKeys.ui.help.zoom);
  }

  private updateVisibility(): void {
    // 桌面(>640px)显示,移动隐藏
    const isMobile = window.innerWidth < 640;
    this.element.style.display = isMobile ? "none" : "block";
  }

  private makeHintRow(): HTMLDivElement {
    const row = document.createElement("div");
    row.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1.6;
    `;
    const arrow = document.createElement("span");
    arrow.textContent = "▸";
    arrow.style.cssText = "color: #4db2ff; font-size: 10px;";
    const text = document.createElement("span");
    row.appendChild(arrow);
    row.appendChild(text);
    return row;
  }
}

import { i18n } from "../i18n";
import { i18nKeys } from "./i18nKeys";
import { LocaleSwitcher } from "./LocaleSwitcher";

/**
 * TopBar — 顶栏
 *
 * 布局:左侧 🌍 地球 emoji + 标题(Orbitron 字体),右侧 LocaleSwitcher
 * 高度 56px,半透明背景 + 细线边框
 *
 * @contract
 *   - `mount(parent)` 挂载到 UIRoot 容器
 *   - `unmount()` 移除 DOM + 取消子组件订阅
 *   - i18n 切换时标题自动更新
 */
export class TopBar {
  private readonly element: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly switcher: LocaleSwitcher;
  private unsubI18n: (() => void) | null = null;
  private mounted: boolean = false;

  constructor() {
    this.element = document.createElement("div");
    this.element.setAttribute("data-testid", "topbar");
    this.element.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      background: linear-gradient(to bottom, rgba(8, 16, 32, 0.85) 0%, rgba(8, 16, 32, 0) 100%);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      pointer-events: auto;
    `;

    // 左侧:图标 + 标题
    const left = document.createElement("div");
    left.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
    `;
    const icon = document.createElement("span");
    icon.textContent = "🌍";
    icon.style.cssText = "font-size: 24px; line-height: 1;";
    icon.setAttribute("aria-hidden", "true");
    this.titleEl = document.createElement("div");
    this.titleEl.style.cssText = `
      font-family: "Orbitron", sans-serif;
      font-size: 18px;
      font-weight: 600;
      letter-spacing: 0.1em;
      color: #e0e8ff;
    `;
    left.appendChild(icon);
    left.appendChild(this.titleEl);
    this.element.appendChild(left);

    // 右侧:LocaleSwitcher
    this.switcher = new LocaleSwitcher();
    this.element.appendChild(this.switcher.element);
  }

  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    parent.appendChild(this.element);
    this.switcher.mount(this.element);
    this.unsubI18n = i18n.subscribe(() => this.renderTitle());
    this.renderTitle();
    this.mounted = true;
  }

  unmount(): void {
    if (!this.mounted) return;
    this.unsubI18n?.();
    this.unsubI18n = null;
    this.switcher.unmount();
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.mounted = false;
  }

  private renderTitle(): void {
    this.titleEl.textContent = i18n.t(i18nKeys.app.title);
  }
}

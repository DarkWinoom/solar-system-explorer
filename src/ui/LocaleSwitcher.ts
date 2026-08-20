import { i18n, type LocaleCode } from "../i18n";
import { i18nKeys } from "./i18nKeys";

/**
 * LocaleSwitcher — 顶栏右侧的 locale 切换按钮组
 *
 * 设计:
 *   - 两个按钮(zh-CN / en-US),当前 active 高亮(青蓝色)
 *   - 点击 → i18n.setLocale() → 自动通知所有订阅者 re-render
 *   - 切换按钮自身也订阅 i18n(locale 变化时高亮跟随)
 *
 * @contract
 *   - `mount(parent)` 挂载到指定容器
 *   - `unmount()` 移除 DOM + 取消 i18n 订阅
 *   - 切换不会写 localStorage(项目规则:不持久化)
 */
export class LocaleSwitcher {
  readonly element: HTMLDivElement;
  private unsubI18n: (() => void) | null = null;
  private mounted: boolean = false;
  /** UI 上支持的 locale(按钮标签) */
  private readonly supportedLocales: LocaleCode[] = ["zh-CN", "en-US"];

  constructor() {
    this.element = document.createElement("div");
    this.element.setAttribute("data-testid", "locale-switcher");
    this.element.style.cssText = `
      display: inline-flex;
      gap: 4px;
      padding: 4px;
      background: rgba(8, 16, 32, 0.6);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(77, 178, 255, 0.25);
      border-radius: 999px;
      font-family: "JetBrains Mono", monospace;
    `;
  }

  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    this.render();
    parent.appendChild(this.element);
    this.unsubI18n = i18n.subscribe(() => this.render());
    this.mounted = true;
  }

  unmount(): void {
    if (!this.mounted) return;
    this.unsubI18n?.();
    this.unsubI18n = null;
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.mounted = false;
  }

  private render(): void {
    this.element.innerHTML = "";
    const current = i18n.getLocale();
    for (const code of this.supportedLocales) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = this.localeLabel(code);
      const isActive = code === current;
      btn.setAttribute("aria-pressed", String(isActive));
      btn.style.cssText = `
        padding: 4px 12px;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.05em;
        border: none;
        border-radius: 999px;
        cursor: pointer;
        background: ${isActive ? "rgba(77, 178, 255, 0.25)" : "transparent"};
        color: ${isActive ? "#4db2ff" : "rgba(224, 232, 255, 0.6)"};
        transition: background 0.2s, color 0.2s;
        font-family: inherit;
      `;
      btn.addEventListener("click", () => {
        if (i18n.getLocale() !== code) {
          i18n.setLocale(code);
        }
      });
      this.element.appendChild(btn);
    }
  }

  /** 按钮标签(中英按钮都用对方语言) */
  private localeLabel(code: LocaleCode): string {
    if (code === "zh-CN") return i18n.t(i18nKeys.ui.locale.zh);
    if (code === "en-US") return i18n.t(i18nKeys.ui.locale.en);
    return code;
  }
}

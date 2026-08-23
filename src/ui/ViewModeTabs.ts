import { i18n } from "../i18n";
import { i18nKeys } from "./i18nKeys";

/** 相机关注对象；总览、太阳、地球、月球都可独立进入。 */
export type ViewMode = "overview" | "sun" | "earth" | "moon";

export interface ViewModeTabsOptions {
  onModeChange: (mode: ViewMode) => void;
  initial?: ViewMode;
}

const MODES: readonly ViewMode[] = ["overview", "sun", "earth", "moon"];

/** 持久显示的四视图切换条。 */
export class ViewModeTabs {
  readonly element: HTMLDivElement;
  currentMode: ViewMode;
  private readonly onModeChange: (mode: ViewMode) => void;
  private unsubI18n: (() => void) | null = null;
  private mounted: boolean = false;
  private readonly buttons = new Map<ViewMode, HTMLButtonElement>();

  constructor(options: ViewModeTabsOptions) {
    this.onModeChange = options.onModeChange;
    this.currentMode = options.initial ?? "earth";

    this.element = document.createElement("div");
    this.element.setAttribute("data-testid", "viewmode-tabs");
    this.element.style.cssText = `
      display: inline-flex;
      gap: 0;
      max-width: calc(100vw - 24px);
      background: rgba(8, 16, 32, 0.72);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      overflow: hidden;
      font-family: "Inter", sans-serif;
      pointer-events: auto;
    `;

    for (const mode of MODES) {
      const button = this.makeTab(mode);
      this.buttons.set(mode, button);
      this.element.appendChild(button);
    }
  }

  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    parent.appendChild(this.element);
    this.unsubI18n = i18n.subscribe(() => this.render());
    this.render();
    this.mounted = true;
  }

  unmount(): void {
    if (!this.mounted) return;
    this.unsubI18n?.();
    this.unsubI18n = null;
    this.element.remove();
    this.mounted = false;
  }

  /** 程序设置状态，不重复触发用户回调。 */
  setMode(mode: ViewMode): void {
    if (this.currentMode === mode) return;
    this.currentMode = mode;
    this.render();
  }

  private makeTab(mode: ViewMode): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("data-testid", `viewmode-tab-${mode}`);
    button.style.cssText = `
      padding: 8px clamp(10px, 2vw, 20px);
      font-family: "Inter", sans-serif;
      font-size: clamp(12px, 1.35vw, 13px);
      font-weight: 500;
      white-space: nowrap;
      color: rgba(224, 232, 255, 0.55);
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      transition: color 0.18s ease, border-color 0.18s ease, background 0.18s ease;
    `;
    button.addEventListener("click", () => {
      if (this.currentMode === mode) return;
      this.currentMode = mode;
      this.render();
      this.onModeChange(mode);
    });
    return button;
  }

  private render(): void {
    for (const mode of MODES) {
      const button = this.buttons.get(mode)!;
      button.textContent = i18n.t(i18nKeys.ui.viewMode[mode]);
      const isActive = this.currentMode === mode;
      button.setAttribute("aria-pressed", String(isActive));
      button.style.color = isActive ? "#ff9a3c" : "rgba(224, 232, 255, 0.55)";
      button.style.borderBottomColor = isActive ? "#ff9a3c" : "transparent";
      button.style.background = isActive ? "rgba(255, 154, 60, 0.06)" : "transparent";
    }
  }
}

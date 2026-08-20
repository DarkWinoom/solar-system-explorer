/**
 * RecenterButton — 回到默认视角
 *
 * 设计：
 *   - 初始 hidden(用户没动地球时不显示)
 *   - 用户拖拽 / 缩放 → 立即显示
 *   - 3s 无操作 → 自动隐藏
 *   - 点击按钮 → 触发 onRecenter 回调 + 立即隐藏
 *
 * 状态机抽成独立 class(RecenterState),不耦合 OrbitControls / DOM,
 * 便于单测。DOM 渲染的 RecenterButtonView class 在同文件内,
 * 只负责订阅状态变化 + 渲染按钮 / 隐藏。
 *
 * @contract
 *   - `onUserInteraction()` 由 OrbitControls 'start' 事件触发
 *   - `recenter()` 触发 onRecenter 回调
 *   - `dispose()` 取消所有 pending timer
 */

export interface RecenterStateOptions {
  /** 点击 recenter 按钮 / 触发回原视角时调用 */
  onRecenter: () => void;
  /** 自动隐藏延迟(毫秒)。默认 3000 */
  autoHideMs?: number;
}

/**
 * 纯状态机 — 可独立单测
 */
export class RecenterState {
  private visible = false;
  private autoHideTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly onRecenter: () => void;
  private readonly autoHideMs: number;
  private disposed = false;

  constructor(options: RecenterStateOptions) {
    this.onRecenter = options.onRecenter;
    this.autoHideMs = options.autoHideMs ?? 3000;
  }

  /** 当前是否显示 */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * 用户开始操作地球(由 OrbitControls 'start' 事件调用)
   * - 立即显示按钮
   * - 重置 3s 自动隐藏 timer
   */
  onUserInteraction(): void {
    if (this.disposed) return;
    this.visible = true;
    this.clearAutoHideTimer();
    this.autoHideTimer = setTimeout(() => {
      this.visible = false;
      this.autoHideTimer = null;
    }, this.autoHideMs);
  }

  /**
   * 点击 recenter 按钮 / 触发回原视角
   * - 调用 onRecenter 回调(由 caller 负责相机 tween / position 重置)
   * - 立即隐藏按钮
   * - 取消 pending auto-hide timer
   */
  recenter(): void {
    if (this.disposed) return;
    this.clearAutoHideTimer();
    this.visible = false;
    this.onRecenter();
  }

  /** 清理(组件 unmount 时调用) */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearAutoHideTimer();
  }

  private clearAutoHideTimer(): void {
    if (this.autoHideTimer !== null) {
      clearTimeout(this.autoHideTimer);
      this.autoHideTimer = null;
    }
  }
}

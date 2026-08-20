/**
 * SpeedTween — 速度倍数的 ease-out cubic 过渡
 *
 * 用途:阶段 11 启动时地球高速旋转(60x),locate 完成后 3s 内减速到 1x(1:1 真实)
 * 把逻辑抽成独立 class,便于单测(不依赖 three.js)
 *
 * @contract
 *   - `set(target, durationMs, now?)` — 设置目标值,durationMs > 0 时启动 tween
 *   - `update(now?)` — 推进到指定时刻(默认 performance.now())
 *   - `value` — 当前值(可能介于 旧值 和 target 之间)
 *   - `isAnimating` — value !== target(用于判断是否还在过渡)
 *   - ease-out cubic 公式: 1 - (1 - t)^3 — 起步快,接近目标时减速
 */
export class SpeedTween {
  private _value: number = 1;
  private target: number = 1;
  private startValue: number = 1;
  private startTime: number = 0;
  private duration: number = 0;

  get value(): number {
    return this._value;
  }

  get isAnimating(): boolean {
    return this._value !== this.target;
  }

  /**
   * 设置目标值
   * @param target 目标倍数
   * @param durationMs 过渡时长(0 = 立即)
   * @param now 时间戳(默认 performance.now(),测试可注入)
   */
  set(target: number, durationMs: number, now: number = performance.now()): void {
    if (durationMs <= 0) {
      this._value = target;
      this.target = target;
      return;
    }
    this.startValue = this._value;
    this.target = target;
    this.startTime = now;
    this.duration = durationMs;
  }

  /**
   * 推进到指定时刻
   * @param now 时间戳(默认 performance.now(),测试可注入)
   */
  update(now: number = performance.now()): void {
    if (this._value === this.target) return;
    const t = Math.min((now - this.startTime) / this.duration, 1);
    // ease-out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    this._value = this.startValue + (this.target - this.startValue) * eased;
  }
}

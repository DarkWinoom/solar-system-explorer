/**
 * UI 格式化工具（纯函数）
 *
 * - formatCountdown(ms)  — 倒计时毫秒数 → "Xh Ym" 字符串
 *   极昼极夜（Infinity / NaN / null）→ "--"
 *   负数 / 0 → "0h 0m"（事件已发生或正在发生）
 *
 * - formatLocalTime(date) — Date → "HH:MM:SS" 24h 本地时区
 *   用于 InfoCard 时间行（实时更新）
 *
 * 故意保持纯函数:不引用 i18n / DOM / 时钟,便于单元测试。
 * i18n 的"Xh Ym" / "极昼" / "极夜" 文本由 InfoCard 在调用时包装。
 */

/**
 * 把毫秒数格式化为 "Xh Ym"
 * @param ms 倒计时毫秒数(可负 / Infinity / NaN)
 * @returns "Xh Ym" 或 "--"(极昼极夜等无意义值)
 */
export function formatCountdown(ms: number): string {
  // 极昼极夜 / 无意义值
  if (!Number.isFinite(ms)) return "--";
  // 负数视为 0(事件已发生)
  const safe = Math.max(0, ms);
  const totalMinutes = Math.floor(safe / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

/**
 * 把 Date 格式化为 "HH:MM:SS"(24h,本地时区)
 * @param date 任意 Date
 * @returns 零填充的时间字符串
 */
export function formatLocalTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

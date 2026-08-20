/**
 * 时区工具
 *
 * `tzOffsetHours(tz, date?)` — 给定 IANA 时区名(如 "America/Los_Angeles"),
 * 返回该时区在指定时刻的 UTC 偏移小时数(正 = 东,负 = 西,LA = -7 / NY = -5 / 北京 = 8)
 *
 * 实现:用 Intl.DateTimeFormat 把 date 格式化到目标时区,跟 UTC 时间比对,差值即偏移
 *   - 自动处理夏令时(夏令时 offset 不同,公式依然准确)
 *   - 不依赖任何外部库
 *
 * @example
 *   tzOffsetHours("America/Los_Angeles", new Date(2026, 8, 8)) // 9 月 LA = -7 (PDT)
 *   tzOffsetHours("Asia/Shanghai", new Date(2026, 0, 1))       // 北京全年 = +8
 */

/**
 * 给定时区在指定时刻的 UTC 偏移(小时)
 * @param tz IANA 时区名(如 "Asia/Shanghai")
 * @param date 参考时刻(默认当前)
 * @returns 偏移小时数(可能是小数,如印度 +5.5)
 */
export function tzOffsetHours(tz: string, date: Date = new Date()): number {
  // 把 date 格式化到目标时区
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string): number => {
    const part = parts.find((p) => p.type === type);
    if (!part) throw new Error(`Missing ${type} in formatted date`);
    return parseInt(part.value, 10);
  };

  // 用 UTC 数字"假装"本地时间,差 date.getTime() = 偏移(毫秒)
  // 注意 hour12:false + Intl 可能在午夜返回 "24" → 取模
  const tzTime = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  );
  const rawHours = (tzTime - date.getTime()) / 3600_000;
  // 四舍五入到 0.01 小时(36 秒)精度 — 消除毫秒→小时换算的浮点尾数
  // (如 Asia/Shanghai 理论 +8 算出 7.99999... → +8.00)
  return Math.round(rawHours * 100) / 100;
}

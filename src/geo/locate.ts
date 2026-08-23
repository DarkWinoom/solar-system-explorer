/**
 * 位置识别策略链
 *
 * 优先级(按 PLAN §7,移除 localStorage 缓存):
 *   1. fetch ipapi.co/json/ (CORS 友好,3s timeout)
 *   2. fetch ipwho.is/       (备选,3s timeout)
 *   3. Intl.DateTimeFormat().resolvedOptions().timeZone
 *      → 内置时区表(覆盖主要城市)
 *   4. UTC 兜底 (0, 0)
 *
 * 项目规则:不持久化(2026-08-20 用户确认,跟 i18n 一致)
 *   - 每次访问都重新识别位置
 *   - 失败不阻塞 UI(locate() 是 async,app.ts 不 await)
 *
 * @contract
 *   - `locate()` 返回 Promise<{ lat, lon, source, error? }>
 *   - source 标识数据来源('ipapi' / 'ipwho' / 'intl' / 'utc')
 *   - 3s 单 API timeout(国内网络可能慢)
 *   - 测试用 `_resetLocateForTest()` 清内部 cache
 */

import { timezoneToCoord } from "./timezoneMap";
import { tzOffsetHours } from "./timezone";

export interface LocateResult {
  lat: number;
  lon: number;
  /**
   * IP 所在地 / Intl 时区的 UTC 偏移(小时)
   * 用作 InfoCard 算 sunrise/sunset 的 tz 参数
   * (不能用用户本机时区 — IP 所在地 ≠ 用户电脑时区,常见于 VPN / 出差)
   */
  utcOffset: number;
  source: "ipapi" | "ipwho" | "intl" | "utc" | "url-param";
  /** 失败时的错误信息(source='utc' 时填) */
  error?: string;
}

const TIMEOUT_MS = 3000;
const IPAPI_URL = "https://ipapi.co/json/";
const IPWHO_URL = "https://ipwho.is/";

/**
 * 测试钩子:允许测试覆盖"读取本机时区"的实现(Intl 是 readonly 全局,无法 spy)
 * 默认用 Intl.DateTimeFormat。生产代码不调用此函数。
 */
let _getTimezoneOverride: (() => string | null) | null = null;
export function _setGetTimezoneOverrideForTest(
  fn: (() => string | null) | null
): void {
  _getTimezoneOverride = fn;
}

function getCurrentTimezone(): string | null {
  if (_getTimezoneOverride) return _getTimezoneOverride();
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/**
 * 位置识别入口
 *
 * 优先级(2026-08-20 用户反馈调整):
 *   0. URL ?loc=lat,lon (最高优先级,手动覆盖,不持久化)
 *   1. Intl 时区查内置表(覆盖 28 个主要城市)
 *      - 反映用户**真实意图**(他设定的系统时区)
 *      - 不受 VPN / 代理影响(VPN 翻墙时 IP 出口在国外,但用户仍想用国内时区)
 *      - 立即返回(<1ms,不需网络)
 *   2. IP API(ipapi 3s → ipwho 3s)— Intl 未知时用(覆盖长尾位置)
 *   3. UTC 兜底
 *
 * @contract
 *   - `locate()` 返回 Promise<{ lat, lon, utcOffset, source }>
 *   - source 标识数据来源('url' / 'intl' / 'ipapi' / 'ipwho' / 'utc')
 *   - Intl 路径不查网络,IP API 路径 3s 单 timeout
 *   - 测试用 `_resetLocateForTest()` / `_setGetTimezoneOverrideForTest()`
 */
export async function locate(): Promise<LocateResult> {
  // 1. Intl 时区(用户意图,优先)
  const intlResult = tryIntlTimezone();
  if (intlResult) {
    return { ...intlResult, source: "intl" };
  }

  // 2. ipapi.co(物理位置,Intl 未知时用)
  try {
    const result = await fetchJSON<{
      latitude: number;
      longitude: number;
      timezone?: string;
    }>(
      IPAPI_URL,
      (data) => {
        if (
          typeof data.latitude !== "number" ||
          typeof data.longitude !== "number"
        ) {
          return null;
        }
        const offset =
          data.timezone && typeof data.timezone === "string"
            ? tzOffsetHours(data.timezone)
            : tzOffsetHours("UTC");
        return { lat: data.latitude, lon: data.longitude, utcOffset: offset };
      }
    );
    if (result) {
      return { ...result, source: "ipapi" };
    }
  } catch (err) {
    // 继续 fallback
    void err;
  }

  // 3. ipwho.is
  try {
    const result = await fetchJSON<{
      latitude: number;
      longitude: number;
      timezone?: { id?: string } | string;
    }>(
      IPWHO_URL,
      (data) => {
        if (
          typeof data.latitude !== "number" ||
          typeof data.longitude !== "number"
        ) {
          return null;
        }
        const tzName =
          typeof data.timezone === "string"
            ? data.timezone
            : data.timezone?.id;
        const offset = tzName ? tzOffsetHours(tzName) : tzOffsetHours("UTC");
        return { lat: data.latitude, lon: data.longitude, utcOffset: offset };
      }
    );
    if (result) {
      return { ...result, source: "ipwho" };
    }
  } catch (err) {
    // 继续 fallback
    void err;
  }

  // 4. UTC 兜底
  return {
    lat: 0,
    lon: 0,
    utcOffset: 0,
    source: "utc",
    error: "Intl timezone unknown and all IP APIs failed",
  };
}

// ---- 内部 helpers ----

interface FetchOk {
  lat: number;
  lon: number;
  utcOffset: number;
}

/**
 * 通用 fetch + timeout + JSON 解析
 * @param url 请求地址
 * @param extract 从 JSON 抽取 {lat, lon, utcOffset} 或 null(无效)
 * @returns 抽取结果 或 null
 * @throws timeout / network error
 */
async function fetchJSON<T>(
  url: string,
  extract: (data: T) => FetchOk | null
): Promise<FetchOk | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as T;
    return extract(data);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 用 Intl.DateTimeFormat 时区查内置表
 * @returns 经纬度 + 本机时区 UTC 偏移 或 null(未知时区)
 */
function tryIntlTimezone(): FetchOk | null {
  const tz = getCurrentTimezone();
  if (!tz) return null;
  const coord = timezoneToCoord(tz);
  if (coord) {
    return { lat: coord.lat, lon: coord.lon, utcOffset: tzOffsetHours(tz) };
  }
  return null;
}

/**
 * 测试用:重置内部状态(目前没有内部 cache,留口子给未来扩展)
 */
export function _resetLocateForTest(): void {
  // 当前实现无内部 state,保留函数以便未来加 cache 时测试可重置
}

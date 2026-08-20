/**
 * 内置时区 → 经纬度 映射表
 *
 * 用途:Intl.DateTimeFormat().resolvedOptions().timeZone → 大致经纬度
 *   (IP API 失败/超时的兜底;精度足够 InfoCard 显示日出日落,不适合导航)
 *
 * 设计:
 *   - 覆盖全球主要城市(20+)
 *   - 故意不全(避免维护负担,主流时区不在表里就 fallback UTC)
 *   - 经纬度是时区中心的大致坐标(不是边界)
 *
 * 后续可扩展:Phase 12 维护期间,按用户位置补充新城市
 */

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * 主要时区中心点(经度,纬度)
 * 命名/数值参考 IANA tz database 主要城市的时区中心
 */
const TIMEZONE_CENTERS: Record<string, LatLon> = {
  // 亚洲
  "Asia/Shanghai": { lat: 31.2, lon: 121.5 },
  "Asia/Beijing": { lat: 39.9, lon: 116.4 },
  "Asia/Hong_Kong": { lat: 22.3, lon: 114.2 },
  "Asia/Taipei": { lat: 25.0, lon: 121.6 },
  "Asia/Tokyo": { lat: 35.7, lon: 139.7 },
  "Asia/Seoul": { lat: 37.6, lon: 127.0 },
  "Asia/Singapore": { lat: 1.3, lon: 103.8 },
  "Asia/Bangkok": { lat: 13.7, lon: 100.5 },
  "Asia/Kolkata": { lat: 22.6, lon: 88.4 },
  "Asia/Dubai": { lat: 25.2, lon: 55.3 },

  // 欧洲
  "Europe/London": { lat: 51.5, lon: -0.1 },
  "Europe/Paris": { lat: 48.9, lon: 2.3 },
  "Europe/Berlin": { lat: 52.5, lon: 13.4 },
  "Europe/Madrid": { lat: 40.4, lon: -3.7 },
  "Europe/Rome": { lat: 41.9, lon: 12.5 },
  "Europe/Moscow": { lat: 55.8, lon: 37.6 },

  // 美洲
  "America/New_York": { lat: 40.7, lon: -74.0 },
  "America/Chicago": { lat: 41.9, lon: -87.6 },
  "America/Denver": { lat: 39.7, lon: -105.0 },
  "America/Los_Angeles": { lat: 34.0, lon: -118.2 },
  "America/Toronto": { lat: 43.7, lon: -79.4 },
  "America/Mexico_City": { lat: 19.4, lon: -99.1 },
  "America/Sao_Paulo": { lat: -23.5, lon: -46.6 },
  "America/Buenos_Aires": { lat: -34.6, lon: -58.4 },

  // 大洋洲
  "Australia/Sydney": { lat: -33.9, lon: 151.2 },
  "Australia/Melbourne": { lat: -37.8, lon: 144.96 },
  "Pacific/Auckland": { lat: -36.8, lon: 174.8 },

  // 非洲
  "Africa/Cairo": { lat: 30.0, lon: 31.2 },
  "Africa/Johannesburg": { lat: -26.2, lon: 28.0 },
  "Africa/Lagos": { lat: 6.5, lon: 3.4 },
};

/**
 * 时区 → 经纬度(查内置表)
 * @param tz IANA 时区名(如 "Asia/Shanghai")
 * @returns 经纬度(度),未在表里返回 null
 */
export function timezoneToCoord(tz: string): LatLon | null {
  return TIMEZONE_CENTERS[tz] ?? null;
}

/** 列出所有已支持的时区(供 devtools / 调试用) */
export function getSupportedTimezones(): string[] {
  return Object.keys(TIMEZONE_CENTERS);
}

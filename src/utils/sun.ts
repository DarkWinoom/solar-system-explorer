/**
 * 太阳位置计算工具（NOAA 简化版）
 *
 * 精度：视觉模拟级。采用 NOAA 的 fractional-year 近似，包含均时差；
 * 不含岁差、章动与大气折射，因此不用于天文导航。
 *
 * 参考：NOAA Solar Calculator 简化
 *  https://gml.noaa.gov/grad/solcalc/
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * 计算太阳赤纬角 δ（solar declination）
 *
 * @param date UTC 时间
 * @returns 赤纬角（度），范围 -23.45° ~ +23.45°
 *   +23.45° ≈ 夏至（太阳直射北回归线）
 *   0°     ≈ 春分/秋分（太阳直射赤道）
 *   -23.45° ≈ 冬至（太阳直射南回归线）
 */
export function solarDeclination(date: Date): number {
  // 一年中的天数（1-based）+ UTC 时间小数
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const diff = date.getTime() - start;
  const dayOfYear = Math.floor(diff / 86400000);
  const hour =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  // NOAA Solar Calculator 的太阳赤纬近似（弧度）。
  const decl =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);
  return decl * RAD;
}

/** NOAA 近似均时差，单位分钟。正值表示真太阳时领先于平均太阳时。 */
export function equationOfTimeMinutes(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000);
  const hour =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  const gamma = (2 * Math.PI / 365) * (dayOfYear - 1 + (hour - 12) / 24);
  return 229.18 * (
    0.000075 +
    0.001868 * Math.cos(gamma) -
    0.032077 * Math.sin(gamma) -
    0.014615 * Math.cos(2 * gamma) -
    0.040849 * Math.sin(2 * gamma)
  );
}

/**
 * 计算太阳直射经度 λ（subsolar longitude）
 *
 * 每小时太阳西移 15°，并以 NOAA 均时差修正。
 * 12:00 UTC 时太阳直射本初子午线（0°）
 *
 * @param date UTC 时间
 * @returns 直射经度（度），范围 -180° ~ +180°（正 = 东，0 = 本初子午线）
 */
export function solarSubsolarLongitude(date: Date): number {
  const hour =
    date.getUTCHours() +
    date.getUTCMinutes() / 60 +
    date.getUTCSeconds() / 3600;
  // solar noon: UTC minutes + equationOfTime + 4 × longitude = 720
  let lon = 180 - 15 * hour - equationOfTimeMinutes(date) / 4;
  // 归一化到 -180 ~ 180
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

/**
 * 计算太阳归一化方向向量（3D）
 *
 * 坐标系约定（与 latLonToCartesian 一致,v19g,见 src/geo/coords.ts）:
 *   - x = 朝向 0° 经度方向（z+ 经度 0 视为原方向，由 sphere geometry 决定）
 *   - y = 朝向北（地球自转轴）
 *   - z = 朝向东
 *   - **v19g 公式**: lon = lonDeg * DEG (无 +180 偏移), 跟新 latLonToCartesian 一致
 *
 * 阶段 6 用法:vertex shader 拿到这个 sunDir 后,
 *   dot(normalize(vNormal), sunDir) 决定昼夜。
 *
 * ⚠️ 2026-08-20 v19g 修复: 同步去掉 +180 偏移, 跟新 latLonToCartesian 公式一致
 *
 *   v19f (旧, 已回滚): sunDirection = latLonToCartesian(0, lonDeg) (带 +180 偏移)
 *     → 物理上对: "上海 22:00 渲染成夜面" ✓
 *     → 但 "Three.js 背阳面" 渲染成纯黑 ❌ (PBR 无 ambient + dot > 0 让 output=0, 看不到 night texture)
 *     → user 报告: "背对太阳那面贴图完全丢失, 只能看到蓝色泛光"
 *
 *   v19g (本版): sunDirection 跟新 latLon 一致 (不带 +180 偏移)
 *     → "Three.js 朝阳面" (latLon(0, 0) 位置) 渲染成受光 ✓
 *     → "Three.js 背阳面" (latLon(0, 180) 位置) 渲染成 night texture (城市灯光) ✓
 *     → "上海 22:00" 渲染成夜面 ✓ (跟物理一致)
 *     → 物理视觉同时对
 *
 * @param date UTC 时间
 * @param out 可选 — 复用外部数组避免每帧分配（性能优化）
 * @returns 长度 3 的数组 [x, y, z]
 */
export function sunDirection(
  date: Date,
  out?: [number, number, number]
): [number, number, number] {
  const declDeg = solarDeclination(date);
  const lonDeg = solarSubsolarLongitude(date);

  const decl = declDeg * DEG;
  // v19g 去掉 +180 偏移:跟新 latLonToCartesian 公式保持一致
  const lon = lonDeg * DEG;

  // 球坐标 → 笛卡尔
  // 太阳方向 = 地球表面"太阳直射点"的法向（外指）
  const x = -Math.cos(decl) * Math.cos(lon);
  const y = Math.sin(decl);
  const z = Math.cos(decl) * Math.sin(lon);

  if (out) {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
  }
  return [x, y, z];
}

/**
 * 计算日出日落时间（小时，本地时区 0-24）
 *
 * 算法：日长 = 2 × arccos(-tan(lat) × tan(decl)) / 15
 *   太阳中午（本地）= 12 - lon / 15
 *   日出 = 中午 - 日长/2
 *   日落 = 中午 + 日长/2
 *
 * @param lat 纬度（度，-90 ~ 90）
 * @param lon 经度（度，-180 ~ 180）
 * @param date 当天任意时间（仅日期 + 时区有意义）
 * @param tz 时区偏移（小时，UTC+8 = 8，UTC-5 = -5）
 * @returns { sunrise, sunset } 单位小时（0-24）
 *   极昼 / 极夜时返回 { sunrise: null, sunset: null }
 */
export function calcSunTimes(
  lat: number,
  lon: number,
  date: Date,
  tz: number
): { sunrise: number | null; sunset: number | null } {
  const declDeg = solarDeclination(date);
  const decl = declDeg * DEG;
  const latRad = lat * DEG;

  // cosH = -tan(lat) × tan(decl)
  // 极昼：cosH < -1（H 不存在）→ 太阳不下落
  // 极夜：cosH > 1（H 不存在）→ 太阳不升起
  const cosH = -Math.tan(latRad) * Math.tan(decl);
  if (cosH > 1 || cosH < -1) {
    return { sunrise: null, sunset: null };
  }

  // 半日长（度，1° = 4 分钟）
  const H = Math.acos(cosH) * RAD;
  // 太阳中午（UTC hour，本地时间不考虑时区偏移时使用）
  const solarNoonUTC = 12 - lon / 15;
  const sunriseUTC = solarNoonUTC - H / 15;
  const sunsetUTC = solarNoonUTC + H / 15;

  return {
    sunrise: (sunriseUTC + tz + 24) % 24,
    sunset: (sunsetUTC + tz + 24) % 24,
  };
}

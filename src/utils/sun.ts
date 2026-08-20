/**
 * 太阳位置计算工具（NOAA 简化版）
 *
 * 精度：±1°（赤纬角）+ 忽略 equation of time
 * 足够视觉昼夜使用，但不适合天文导航
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
  const n = dayOfYear - 1 + (hour - 12) / 24;

  // 赤纬角（度）= 23.45° × sin(2π × (284 + n) / 365)
  return 23.45 * Math.sin((2 * Math.PI * (284 + n)) / 365);
}

/**
 * 计算太阳直射经度 λ（subsolar longitude）
 *
 * 简化：每小时太阳西移 15°（忽略 equation of time，误差约 ±4 分钟 / ±1°）
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
  // 每小时 -15°（地球自西向东转 → 太阳相对向西）
  let lon = -15 * (hour - 12);
  // 归一化到 -180 ~ 180
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

/**
 * 计算太阳归一化方向向量（3D）
 *
 * 坐标系约定（与 latLonToCartesian 一致,见 src/geo/coords.ts）:
 *   - x = 朝向 0° 经度方向（z+ 经度 0 视为原方向，由 sphere geometry 决定）
 *   - y = 朝向北（地球自转轴）
 *   - z = 朝向东
 *   - **lon + 180° 偏移**:让"地理 lon"对齐到 Three.js SphereGeometry 渲染位置
 *     (NASA 纹理原点在 180°W,不在 0°。球面 local 0° 渲染到纹理 180°W)
 *
 * 阶段 6 用法:vertex shader 拿到这个 sunDir 后,
 *   dot(normalize(vNormal), sunDir) 决定昼夜。
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
  // + 180° 偏移:对齐 Three.js SphereGeometry 球面 local 坐标系
  // (跟 latLonToCartesian 公式保持一致,否则昼面/夜面会跟地图错位 180°)
  const lon = (lonDeg + 180) * DEG;

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

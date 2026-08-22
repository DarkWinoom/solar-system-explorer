import * as THREE from "three";

/**
 * 日地月轨道算法 — 粗略计算（视觉精度即可）
 *
 * 公式选择：
 *   - 地球公转：dayOfYear → angle (春分固定 dayOfYear 80.5, 1 年 365.25 天)
 *   - 月球公转：synodicAge (朔望月) → angle (参考新月 2000-01-06 18:14 UTC)
 *   - 月相 8 阶段：按月龄范围 + 几何照度公式
 *
 * 精度：
 *   - 地球公转 ±3° (基于"春分固定 dayOfYear 80.5"近似, 实际春分 3-19~3-21)
 *   - 月球公转 ±0.5 天 (朔望月 29.530588853 天)
 *
 * 简化：
 *   - 轨道都是正圆 (不模拟椭圆/倾角) — MVP 视觉无差异
 *   - 地球轨道平面 = xz 平面 (y=0)
 *   - 月球不自转 (潮汐锁定简化)
 *
 * @see /docs/PLAN-SEM.md § 5
 * @see /tests/utils/orbits.test.ts
 */

/** 1 年长度（天）— 365.25 包含闰年平均 */
const YEAR_DAYS = 365.25;
/** 春分近似 dayOfYear（3-21 中午 UTC = 1-indexed 第 80.5 天）*/
const SPRING_EQUINOX_DAY = 80.5;

/** 朔望月长度（天）— 新月到下次新月的平均周期 */
const SYNODIC_MONTH = 29.530588853;
/** 参考新月：2000-01-06 18:14 UTC（已知月相数据）*/
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

/** 1 天毫秒数（性能优化：避免 86_400_000 重复计算）*/
const MS_PER_DAY = 86_400_000;

/** 月相 8 阶段名称（跟 i18n key 路径一致）*/
export type MoonPhase =
  | "newMoon"
  | "waxingCrescent"
  | "firstQuarter"
  | "waxingGibbous"
  | "fullMoon"
  | "waningGibbous"
  | "lastQuarter"
  | "waningCrescent";

/**
 * 地球公转角度（弧度）
 * - angle = 0 → 春分（地球在 x 轴负方向，因 -cos）
 * - angle = π/2 → 夏至
 * - angle = π → 秋分
 * - angle = 3π/2 → 冬至
 */
export function earthOrbitAngle(date: Date): number {
  const year = date.getUTCFullYear();
  const yearStart = Date.UTC(year, 0, 1);
  // dayOfYear 1-indexed (1-1 00:00 UTC 是 1)
  const dayOfYear = (date.getTime() - yearStart) / MS_PER_DAY + 1;
  return ((dayOfYear - SPRING_EQUINOX_DAY) / YEAR_DAYS) * 2 * Math.PI;
}

/**
 * 地球公转位置（世界坐标 Vector3）
 * - 太阳在原点 (0, 0, 0)
 * - 轨道平面 = xz 平面 (y = 0)
 * - 距离 = radius（默认 80u，对应方案 § 1 比例尺）
 * - x = -cos(angle) 跟 Three.js SphereGeometry lat/lon 公式一致（负号！）
 */
export function earthOrbitPosition(
  date: Date,
  radius: number = 80,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const angle = earthOrbitAngle(date);
  out.set(-Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  return out;
}

/**
 * 朔望月龄（天）
 * - 范围 [0, SYNODIC_MONTH) = [0, 29.53)
 * - 0 = 新月
 * - ~14.77 = 满月
 * - 接近 SYNODIC_MONTH 时归 0 (下次新月)
 */
export function synodicAge(date: Date): number {
  const days = (date.getTime() - KNOWN_NEW_MOON_MS) / MS_PER_DAY;
  return ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

/**
 * 月球公转位置（世界坐标 Vector3）
 * - 返回 = earthPos + 月球相对地球的轨道偏移
 * - angle = 0 (新月) → 月球在地球朝向太阳一侧（-radius 方向）
 * - angle = π (满月) → 月球在地球背向太阳一侧（+radius 方向）
 * - 轨道平面 = xz 平面 (y = 0)
 */
export function moonOrbitPosition(
  date: Date,
  earthPos: THREE.Vector3,
  radius: number = 30,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const angle = (synodicAge(date) / SYNODIC_MONTH) * 2 * Math.PI;
  out.copy(earthPos).add(
    new THREE.Vector3(-Math.cos(angle) * radius, 0, Math.sin(angle) * radius),
  );
  return out;
}

/**
 * 月相（8 阶段名称 + 几何照度）
 * - illumination: 0 (新月) - 1 (满月) — 用 (1 - cos(2π × age/29.53)) / 2 算
 * - name: 8 阶段，按月龄范围划分（每个阶段 3.69 天左右）
 */
export function moonPhase(date: Date): {
  name: MoonPhase;
  illumination: number;
} {
  const age = synodicAge(date);
  const illumination = (1 - Math.cos((age / SYNODIC_MONTH) * 2 * Math.PI)) / 2;

  // 8 阶段，每段 ~3.69 天 (29.53 / 8)
  // 边界用常量明确写出，便于测试和 review
  if (age < 1.8457) return { name: "newMoon", illumination };
  if (age < 5.53699) return { name: "waxingCrescent", illumination };
  if (age < 9.22831) return { name: "firstQuarter", illumination };
  if (age < 12.91963) return { name: "waxingGibbous", illumination };
  if (age < 16.61095) return { name: "fullMoon", illumination };
  if (age < 20.30228) return { name: "waningGibbous", illumination };
  if (age < 23.99361) return { name: "lastQuarter", illumination };
  if (age < 27.68493) return { name: "waningCrescent", illumination };
  return { name: "newMoon", illumination };
}

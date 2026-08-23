import * as THREE from "three";
import { latLonToCartesian } from "../geo/coords";
import { solarSubsolarLongitude } from "./sun";

/** 日地月系统的显示比例（地球半径 = 1u）。 */
export const EARTH_ORBIT_RADIUS = 80;
export const MOON_ORBIT_RADIUS = 30;
/** 地球黄赤交角；地轴在世界坐标中保持固定。 */
export const EARTH_AXIAL_TILT_DEG = 23.43928;

const YEAR_DAYS = 365.2422;
const SPRING_EQUINOX_DAY = 79.75;
const SYNODIC_MONTH = 29.530588853;
const KNOWN_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);
const MS_PER_DAY = 86_400_000;
const DEG = Math.PI / 180;

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
 * 地球公转角度。0° 是北半球春分附近；轨道只用于总览的空间位置，
 * 地表昼夜由同一状态对象中的地球姿态决定。
 */
export function earthOrbitAngle(date: Date): number {
  const yearStart = Date.UTC(date.getUTCFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - yearStart) / MS_PER_DAY + 1;
  return ((dayOfYear - SPRING_EQUINOX_DAY) / YEAR_DAYS) * Math.PI * 2;
}

/** 太阳位于世界原点时的地球世界坐标。 */
export function earthOrbitPosition(
  date: Date,
  radius: number = EARTH_ORBIT_RADIUS,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const angle = earthOrbitAngle(date);
  return out.set(Math.cos(angle) * radius, 0, -Math.sin(angle) * radius);
}

/** 月龄，范围 [0, SYNODIC_MONTH)。 */
export function synodicAge(date: Date): number {
  const days = (date.getTime() - KNOWN_NEW_MOON_MS) / MS_PER_DAY;
  return ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH;
}

/** 月相名称与照明比例。 */
export function moonPhase(date: Date): {
  name: MoonPhase;
  illumination: number;
} {
  const age = synodicAge(date);
  const illumination = (1 - Math.cos((age / SYNODIC_MONTH) * Math.PI * 2)) / 2;

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

/**
 * 当前时刻唯一的日地月状态。
 *
 * `instant` 必须是绝对时间（UTC instant）。IANA 时区只负责把用户输入的
 * 本地年月日时分换算为这个 instant，以及显示本地时间；它不改变天体位置。
 */
export interface CelestialState {
  instant: Date;
  earthOrbitAngle: number;
  earthPosition: THREE.Vector3;
  /** 地球中心指向太阳的世界单位向量。 */
  earthToSun: THREE.Vector3;
  /** 地球北极在世界坐标中的单位向量。 */
  earthAxis: THREE.Vector3;
  /** 太阳直射纬度；由轨道与地轴直接推得。 */
  subsolarLatitudeDeg: number;
  /** 太阳直射经度；包括均时差修正。 */
  subsolarLongitudeDeg: number;
  /** 地球局部坐标系中的太阳方向。 */
  localSunDirection: THREE.Vector3;
  /** 将地球本地经纬度坐标转换到世界坐标的姿态。 */
  earthOrientation: THREE.Quaternion;
  moonOrbitAngle: number;
  earthToMoon: THREE.Vector3;
  moonPosition: THREE.Vector3;
}

export interface OverviewCameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/**
 * 总览相机的确定性构图。镜头看向日地中点，从黄道侧上方观察，
 * 使太阳、地球、月球和两条轨道线都落在同一稳定画面中。
 */
export function overviewCameraPose(
  earthPosition: THREE.Vector3,
): OverviewCameraPose {
  const target = earthPosition.clone().multiplyScalar(0.5);
  const radial = earthPosition.clone().normalize();
  const tangent = new THREE.Vector3(0, 1, 0).cross(radial).normalize();
  const position = target
    .clone()
    .addScaledVector(tangent, 105)
    .add(new THREE.Vector3(0, 58, 0));
  return { position, target };
}

/**
 * 根据 mesh 球面半径、相机垂直 FOV 与视口宽高比，返回让该球在屏幕短边
 * 占屏 `screenRatio`（默认 0.6，即 60% 直径）的相机距离。
 *
 * 通用 — 任何已知半径的 mesh（太阳 / 地球 / 月球 / 后续金星等）都可调用，
 * 切 tab 时按当时 camera.fov / camera.aspect 实时计算，响应式适配窗口大小。
 *
 * 算法：取 min(vertical FOV, horizontal FOV) 作为占屏基准。
 * - 垂直 FOV = camera.fov
 * - 水平 FOV = 2 * atan(tan(vFov/2) * aspect)
 * - 距离 = radius / tan(minFov × screenRatio / 2)
 *
 * 跨项目适用：任何 Three.js 球体"按 FOV 适配视口" 的相机距离计算
 */
export function fovFittingDistance(
  radius: number,
  cameraFovDeg: number,
  aspect: number,
  screenRatio: number = 0.6,
): number {
  if (radius <= 0) return 0;
  const vFov = cameraFovDeg;
  const hFov =
    2 *
    Math.atan(Math.tan((vFov * Math.PI) / 360) * aspect) *
    (180 / Math.PI);
  const fovEff = Math.min(vFov, hFov);
  const halfAngle = (fovEff * screenRatio * Math.PI) / 360;
  return radius / Math.tan(halfAngle);
}

/**
 * 在同一时间点将地球本地北极和太阳直射点映射到世界空间。
 * 这样总览里地球亮面必然朝向场景内真实太阳，同时相机仍能按地理经纬度定位。
 */
function earthOrientationFromSun(
  localSun: THREE.Vector3,
  worldSun: THREE.Vector3,
  earthAxis: THREE.Vector3,
): THREE.Quaternion {
  const localNorth = new THREE.Vector3(0, 1, 0);
  const localHorizontal = localSun
    .clone()
    .addScaledVector(localNorth, -localSun.dot(localNorth))
    .normalize();
  const worldHorizontal = worldSun
    .clone()
    .addScaledVector(earthAxis, -worldSun.dot(earthAxis))
    .normalize();

  const localBasis = new THREE.Matrix4().makeBasis(
    localHorizontal,
    localNorth,
    localHorizontal.clone().cross(localNorth),
  );
  const worldBasis = new THREE.Matrix4().makeBasis(
    worldHorizontal,
    earthAxis,
    worldHorizontal.clone().cross(earthAxis),
  );
  return new THREE.Quaternion().setFromRotationMatrix(
    worldBasis.multiply(localBasis.invert()),
  );
}

/**
 * 根据朔望月角度计算月球相对地球的位置。
 * 月龄 0 时月球朝向太阳（新月），月龄一半时背向太阳（满月）。
 */
export function moonOrbitPosition(
  date: Date,
  earthPosition: THREE.Vector3,
  earthToSun: THREE.Vector3,
  radius: number = MOON_ORBIT_RADIUS,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const angle = (synodicAge(date) / SYNODIC_MONTH) * Math.PI * 2;
  // 简化月球轨道位于黄道面；以太阳方向作为相位 0 的基准，确保新月/满月
  // 的空间关系严格正确。轨道倾角和交点回归可在后续精度升级时加入。
  const orbitalAxis = new THREE.Vector3(0, 1, 0);
  const earthToMoon = earthToSun
    .clone()
    .applyAxisAngle(orbitalAxis, angle)
    .multiplyScalar(radius);
  return out.copy(earthPosition).add(earthToMoon);
}

/** 计算并返回可同时驱动场景、材质、相机与 UI 的天体状态。 */
export function celestialState(date: Date): CelestialState {
  const earthPosition = earthOrbitPosition(date);
  const earthToSun = earthPosition.clone().negate().normalize();
  const tilt = EARTH_AXIAL_TILT_DEG * DEG;
  // 春分时太阳在 -X，夏至时在 +Z，因此北极朝 +Z 倾斜。
  const earthAxis = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt));
  const subsolarLatitudeDeg = Math.asin(earthToSun.dot(earthAxis)) / DEG;
  const subsolarLongitudeDeg = solarSubsolarLongitude(date);
  const localSunDirection = latLonToCartesian(
    subsolarLatitudeDeg,
    subsolarLongitudeDeg,
  );
  const earthOrientation = earthOrientationFromSun(
    localSunDirection,
    earthToSun,
    earthAxis,
  );
  const moonOrbitAngle = (synodicAge(date) / SYNODIC_MONTH) * Math.PI * 2;
  const moonPosition = moonOrbitPosition(
    date,
    earthPosition,
    earthToSun,
  );
  const earthToMoon = moonPosition.clone().sub(earthPosition).normalize();

  return {
    instant: new Date(date.getTime()),
    earthOrbitAngle: earthOrbitAngle(date),
    earthPosition,
    earthToSun,
    earthAxis,
    subsolarLatitudeDeg,
    subsolarLongitudeDeg,
    localSunDirection,
    earthOrientation,
    moonOrbitAngle,
    earthToMoon,
    moonPosition,
  };
}

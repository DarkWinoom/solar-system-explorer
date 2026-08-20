import * as THREE from "three";

/**
 * 经纬度 → 3D 坐标工具
 *
 * 坐标系约定(对齐 Earth.ts + sun.ts):
 *   - x = 朝向 0° 经度方向(本初子午线)
 *   - y = 朝向北极
 *   - z = 朝向东(经度 90°E)
 *
 * 公式(球面坐标 → 笛卡尔):
 *   x = cos(lat) · cos(lon)
 *   y = sin(lat)
 *   z = cos(lat) · sin(lon)
 */

const DEG = Math.PI / 180;

/**
 * 经纬度 → 单位球面上的 THREE.Vector3(模长 1)
 * @param latDeg 纬度(度,-90 ~ 90)
 * @param lonDeg 经度(度,-180 ~ 180)
 * @returns 三维单位向量
 */
export function latLonToCartesian(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.sin(lon)
  );
}

/**
 * 经纬度 → 给定距离的相机位置(球面外)
 * @param latDeg 纬度(度)
 * @param lonDeg 经度(度)
 * @param distance 距地球中心距离(> 地球半径)
 * @returns 相机应该放置的世界坐标
 *
 * 用法:相机设到这个位置,lookAt(0, 0, 0) 就能看到经纬度 (lat, lon) 对应的地表
 */
export function latLonToCameraPosition(
  latDeg: number,
  lonDeg: number,
  distance: number
): THREE.Vector3 {
  const unit = latLonToCartesian(latDeg, lonDeg);
  return unit.multiplyScalar(distance);
}

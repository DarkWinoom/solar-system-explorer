import * as THREE from "three";

/**
 * 经纬度 → 3D 坐标工具
 *
 * 坐标系约定(对齐 Three.js SphereGeometry 的 UV 映射):
 *   - x = -cos(lat)·cos(lon)  (lon=0 在 -x 方向,不是 +x)
 *   - y = sin(lat)             (北极)
 *   - z = cos(lat)·sin(lon)   (lon=90°E 在 +z 方向)
 *
 * ⚠️ 2026-08-20 修正:原公式 x = +cos(lat)·cos(lon) 是错的——
 * Three.js SphereGeometry 源码:`vertex.x = -ringRadius * Math.cos(phi)`,
 * 而 lat=0,lon=0 实际渲染在 -x 方向(不是 +x)。原公式导致相机对齐
 * 错位(上海跑到北美西部海域),整个地球表面 lat/lon ↔ xyz 映射镜像翻转。
 *
 * sunDirection / Earth mesh 纹理 UV 同步遵循同一公式(已同步修正)
 */
const DEG = Math.PI / 180;

/**
 * 经纬度 → 单位球面上的 THREE.Vector3(模长 1)
 * @param latDeg 纬度(度,-90 ~ 90)
 * @param lonDeg 经度(度,-180 ~ 180)
 * @returns 三维单位向量(对齐 Three.js SphereGeometry 渲染)
 */
export function latLonToCartesian(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  return new THREE.Vector3(
    -Math.cos(lat) * Math.cos(lon), // -cos(lon) 修正:匹配 Three.js 球体
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

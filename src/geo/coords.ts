import * as THREE from "three";

/**
 * 经纬度 → 3D 坐标工具
 *
 * 坐标系约定(对齐 Three.js SphereGeometry + NASA 纹理原点):
 *   - 公式:  x = -cos(lat)·cos(lon + 180°)
 *            y = sin(lat)
 *            z = cos(lat)·sin(lon + 180°)
 *
 *   - 解读: "地理 lon=0"(本初子午线) → 渲染到 NASA 纹理的 0° 位置(本初)
 *           "地理 lon=121°E"(上海)  → 渲染到 NASA 纹理的 121°E 位置(上海)
 *
 * ⚠️ 2026-08-20 二次修复(纹理原点对齐):
 *   Three.js SphereGeometry 默认 phiStart=0 → 第一个 vertex 的 UV u=0;
 *   NASA Blue Marble 纹理的 u=0 实际是 180°W(国际日期变更线),不是 0°(本初)。
 *   所以"球面 local lon=0"位置 渲染到 NASA 纹理的 180°W = 大西洋上空。
 *   用户报告"看上海时间(地理 121°E),实际渲染到北美东部海域"——
 *   根因:地理 lon 跟 NASA 纹理原点有 180° 偏移。
 *
 *   修法:latLon 加 180° 偏移,让"地理 lon=0"对齐到"NASA 纹理 0°(本初)"。
 *   等价:也可以设 `texture.offset.x = 0.5` 旋转纹理,但 texture.offset 副作用
 *   更大(emissive / bumpMap 等所有 UV 引用都偏移)。
 *
 * 历史修正:
 *   - 第一次: x = -cos(lon) 匹配 Three.js SphereGeometry 顶点公式
 *   - 第二次: x = -cos(lon + 180°) 匹配 NASA 纹理原点(dateline 而非本初)
 */
const DEG = Math.PI / 180;

/**
 * 经纬度 → 单位球面上的 THREE.Vector3(模长 1)
 * @param latDeg 纬度(度,-90 ~ 90)
 * @param lonDeg 经度(度,-180 ~ 180)— 真实地理经度(本初 = 0°,东 = 正,西 = 负)
 * @returns 三维单位向量(对齐 Three.js SphereGeometry + NASA 纹理渲染)
 */
export function latLonToCartesian(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = latDeg * DEG;
  // 加 180° 偏移:把"地理 lon"映射到"球面 local lon"
  // 让 NASA 纹理 dateline(球面 local 0°)对应"地理 180°W"
  // 让 NASA 纹理 本初(球面 local 180°)对应"地理 0°(本初)"
  const lon = (lonDeg + 180) * DEG;
  return new THREE.Vector3(
    -Math.cos(lat) * Math.cos(lon),
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

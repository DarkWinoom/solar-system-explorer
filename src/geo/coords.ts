import * as THREE from "three";

/**
 * 经纬度 → 3D 坐标工具
 *
 * 坐标系约定(对齐 Three.js SphereGeometry 朝阳面方向):
 *   - 公式:  x = -cos(lat)·cos(lon)
 *            y = sin(lat)
 *            z = cos(lat)·sin(lon)
 *
 *   - 解读: "地理 lon=0"(本初子午线) → 渲染到 Three.js -X 半球(朝阳面方向)
 *           "地理 lon=180°"(dateline) → 渲染到 Three.js +X 半球(背阳面方向)
 *           "地理 lon=90°E" → 渲染到 +Z 半球(晨昏线边缘)
 *
 * ⚠️ 2026-08-20 v19g 修复(去掉 +180° 偏移):
 *   旧公式 (带 +180 偏移, v19c/v19f 状态) 让"地理 0° 位置" = (1, 0, 0) = Three.js +X 半球 (背阳面)。
 *   后果: v19c/v19f 公式让"Three.js 背阳面 (latLon(0, 0) 位置)" 渲染成纯黑:
 *     - 当 sunDirection.x > 0 (UTC 6-18 范围), +X 半球法线 dot uSunDir > 0
 *     - Earth TSL `mix(night.rgb, output.rgb, dayStrength)` 偏向 output (PBR 受光 = 0 因为 DirectionalLight 不照 +X 半球)
 *     - → finalOutput = 0 (纯黑, 看不到 night texture 城市灯光)
 *   用户报告"背对太阳那面贴图完全丢失, 只能看到蓝色泛光" (Atmosphere Fresnel BackSide 边缘可见)
 *
 *   新公式 (不带 +180 偏移) 让 latLon(0, 0) = -X 朝阳面方向,
 *   跟"直射 0° 时 0° 朝阳" 物理意义一致, 配合新 sunDirection 公式 (v19g 跟 latLon 一致, 不带 +180 偏移):
 *     - "Three.js 朝阳面" (latLon(0, 0) 位置) 在直射 0° 时朝阳 ✓
 *     - "Three.js 背阳面" (latLon(0, 180) 位置) 在直射 0° 时背阳, 渲染成 night texture (城市灯光) ✓
 *     - "上海 22:00" (新 latLon(31, 121) 位置) 离直射 151° 接近深夜, 渲染成 night texture ✓
 *
 * 半周期错位限制 (latLon 公式固有限制, 接受):
 *   - latLon 是 L 的函数, 无法让"直射 L 时 L 在 -X 半球" 对所有 L 满足
 *   - 实际意义: latLon(0, 0) 在 -X (直射 0° 时 0° 朝阳 ✓),
 *             latLon(0, 180) 在 +X (直射 180° 时 180° 应该朝阳但 latLon 让 180° 在背阳面 ❌)
 *   - 修法: 接受这个错位 (v19g 整体方案), Earth TSL 跟新 latLon + 新 sunDirection 保持一致
 *
 * 历史修正:
 *   - 第一次: x = -cos(lon) 匹配 Three.js SphereGeometry 顶点公式
 *   - 第二次: x = -cos(lon + 180°) 匹配 NASA 纹理原点 (v19c/v19f)
 *   - 第三次: x = -cos(lon) 去掉 +180 偏移 (v19g, 修 "Three.js 背阳面 渲染成纯黑" 问题)
 */
const DEG = Math.PI / 180;

/**
 * 经纬度 → 单位球面上的 THREE.Vector3(模长 1)
 * @param latDeg 纬度(度,-90 ~ 90)
 * @param lonDeg 经度(度,-180 ~ 180)— 真实地理经度(本初 = 0°,东 = 正,西 = 负)
 * @returns 三维单位向量(对齐 Three.js SphereGeometry 朝阳面方向)
 */
export function latLonToCartesian(latDeg: number, lonDeg: number): THREE.Vector3 {
  const lat = latDeg * DEG;
  // 去掉 +180 偏移:让 latLon(0, 0) = -X (Three.js 朝阳面方向)
  // 跟"直射 0° 时 0° 朝阳" 物理意义一致 (v19g)
  const lon = lonDeg * DEG;
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

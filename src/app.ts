import * as THREE from "three";
import { EarthScene } from "./scene/EarthScene";
import { buildLocale } from "./i18n/buildLocale";
import { UIRoot } from "./ui/UIRoot";
import { locate, type LocateResult } from "./geo/locate";
import { latLonToCameraPosition } from "./geo/coords";
import { moonPhase } from "./utils/orbits";

/**
 * 应用初始化入口
 *
 * 阶段 8: Earth + Atmosphere + OrbitControls + i18n
 * 阶段 9: UI 集成(TopBar / InfoCard / HelpHint / RecenterButton)
 * 阶段 11: 位置识别 + 启动 60x 旋转 + locate 完成后 3s tween(地球减速 + 相机平滑对齐)
 * 阶段 9+: Recenter 按钮 → tween 到时区所在位置(1.5s ease-out cubic,不是直接 snap)
 *
 * 协作纪律:
 *   - i18n 早期接入(buildLocale 在任何 DOM 文本前)
 *   - 禁止 commit(用户明示"本项目不需要你 commit")
 */

let scene: EarthScene | null = null;
let ui: UIRoot | null = null;
/** RecenterButton 触发的"回到默认视角"(4.5, 2, 3) — 阶段 18 移除, 留作 18d 复用 */
const DEFAULT_CAMERA_POSITION: [number, number, number] = [4.5, 2, 3];
/** 相机到地球中心的固定距离(保持跟默认视角一致) */
const CAMERA_DISTANCE = Math.sqrt(
  DEFAULT_CAMERA_POSITION[0] ** 2 +
    DEFAULT_CAMERA_POSITION[1] ** 2 +
    DEFAULT_CAMERA_POSITION[2] ** 2,
); // ≈ 5.77
/** locate 完成后 tween 时长(同时用于地球减速 + 相机对齐) */
const AUTO_RECENTER_DURATION_MS = 3000;
/** locate 完成后,等用户几秒再触发 tween(给用户先看高速旋转) */
const AUTO_RECENTER_DELAY_MS = 2000;
/** 用户点 ViewModeTabs 时的 tween 时长 (阶段 18d) */
const USER_VIEWMODE_DURATION_MS = 1500;
/** 用户是否已经拖动过地球(若已操作,locate 完成不重置相机) */
let userInteracted = false;
/** locate 结果(供 tween 用) */
let locatedResult: LocateResult | null = null;
/** 当前正在跑的 camera tween 的 rAF handle(避免并发) */
let activeCameraTween: number | null = null;
/** tween 期间临时关闭 controls damping，防止旧的球面速度叠加造成镜头跳转。 */
let savedDampingState: boolean | null = null;

/**
 * 平滑切换相机位置、目标点和 FOV。
 *
 * 观察方向在单位球面上做最短路径插值，而非让相机直线穿过 target，
 * 因而不会发生切换到对侧天体时常见的 180° 突转。
 */
function tweenCameraTo(
  targetPosition: THREE.Vector3,
  durationMs: number,
  lookAt: THREE.Vector3 = scene?.currentEarthWorldPosition ?? new THREE.Vector3(),
  targetFov: number = scene?.camera.fov ?? 25,
): void {
  if (!scene) return;
  cancelCameraTween();
  scene.isCameraTweening = true;
  const startTarget = scene.controls
    ? scene.controls.target.clone()
    : new THREE.Vector3();
  const endTarget = lookAt.clone();
  const startOffset = scene.camera.position.clone().sub(startTarget);
  const endOffset = targetPosition.clone().sub(endTarget);
  const startDistance = startOffset.length();
  const endDistance = endOffset.length();
  const startDirection = startOffset.normalize();
  const endDirection = endOffset.normalize();
  const directionRotation = new THREE.Quaternion().setFromUnitVectors(
    startDirection,
    endDirection,
  );
  const startFov = scene.camera.fov;
  if (scene.controls) {
    savedDampingState = scene.controls.enableDamping;
    scene.controls.enableDamping = false;
  }
  const startTime = performance.now();

  const step = (): void => {
    if (!scene) return;
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / durationMs, 1);
    // ease-in-out cubic：起止平缓，视图切换更自然。
    const eased = t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
    const target = new THREE.Vector3().lerpVectors(startTarget, endTarget, eased);
    const direction = startDirection
      .clone()
      .applyQuaternion(new THREE.Quaternion().slerp(directionRotation, eased));
    const distance = THREE.MathUtils.lerp(startDistance, endDistance, eased);
    scene.camera.position.copy(target).addScaledVector(direction, distance);
    scene.camera.fov = THREE.MathUtils.lerp(startFov, targetFov, eased);
    scene.camera.updateProjectionMatrix();
    if (scene.controls) {
      scene.controls.target.copy(target);
      scene.camera.lookAt(scene.controls.target);
      scene.controls.update();
    } else {
      scene.camera.lookAt(target);
    }
    if (t < 1) {
      activeCameraTween = requestAnimationFrame(step);
    } else {
      activeCameraTween = null;
      scene.isCameraTweening = false;
      if (scene.controls && savedDampingState !== null) {
        scene.controls.enableDamping = savedDampingState;
      }
      savedDampingState = null;
    }
  };
  activeCameraTween = requestAnimationFrame(step);
}

function cancelCameraTween(): void {
  if (activeCameraTween !== null) {
    cancelAnimationFrame(activeCameraTween);
    activeCameraTween = null;
  }
  if (scene) scene.isCameraTweening = false;
  if (scene?.controls && savedDampingState !== null) {
    scene.controls.enableDamping = savedDampingState;
  }
  savedDampingState = null;
}

/** 闰年判断 (Gregorian calendar, 阶段 18d InfoCard dayOfYear 用) */
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function initApp(): void {
  const root = document.getElementById("app");
  if (!root) {
    console.error("[3d-earth] #app root element not found");
    return;
  }

  // i18n 早期接入(阶段 9-prep): 任何 DOM 文本前必须先 buildLocale
  buildLocale();

  // 禁止文本选择（CSS 已设置，JS 兜底）
  document.addEventListener("selectstart", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());

  // 创建 Three.js 场景
  scene = new EarthScene({
    container: root,
    backgroundColor: 0x02050f,
  });

  // 修复 v19d: 不在 EarthScene 构造后立即摆位 earth mode 位置
  // 之前: line 122-128 摆位 earth mode, 然后 line 186-201 立即按 initial 覆盖到 overview
  //       → 同步代码"先 earth 后 overview" 双重摆位, 用户报告"启动先总览后地球" 抖动
  // 修法: 删 line 122-128, 只在 line 186-201 按 initial mode 摆位一次(消除双重摆位)
  // 注意: tick 异步, 启动时 currentEarthWorldPosition 还没值, 用 earthOrbitPosition(new Date(), 80) 同步算

  // 修复 v19b: 不开 autoRotate — 之前 autoRotate 转动时 camera 可能绕到太阳方向
  // 视觉效果上"被拉到太阳位置被完全挡住"。改为静态启动。
  // 地球自转视觉通过 uSunDir 每帧更新(光照在动)实现, 不需要 autoRotate
  if (scene.controls) {
    scene.controls.autoRotate = false;
  }

  // UI 层(阶段 9 + 阶段 18: ViewModeTabs 替代 RecenterButton)
  // 阶段 18d: 完整接入 onViewModeChange → 相机 tween 到对应 view
  ui = new UIRoot({
    onViewModeChange: (mode) => {
      if (!scene) return;
      scene.setViewMode(mode);
      if (mode === "earth") {
        const offset = locatedResult
          ? latLonToCameraPosition(
              locatedResult.lat,
              locatedResult.lon,
              CAMERA_DISTANCE,
            )
          : new THREE.Vector3(...DEFAULT_CAMERA_POSITION);
        tweenCameraTo(
          scene.localEarthOffsetToWorld(offset),
          USER_VIEWMODE_DURATION_MS,
          scene.currentEarthWorldPosition,
          25,
        );
      } else if (mode === "overview") {
        const pose = scene.getOverviewCameraPose();
        tweenCameraTo(
          pose.position,
          USER_VIEWMODE_DURATION_MS,
          pose.target,
          52,
        );
      } else if (mode === "sun") {
        const pose = scene.getSunCameraPose();
        tweenCameraTo(pose.position, USER_VIEWMODE_DURATION_MS, pose.target, 25);
      } else {
        const pose = scene.getMoonCameraPose();
        tweenCameraTo(pose.position, USER_VIEWMODE_DURATION_MS, pose.target, 25);
      }
    },
  });
  ui.mount(document.body);

  // 修复 v19c + v19d: UIRoot initial 改 "overview" 后 ViewModeTabs 高亮对了, 但
  //   onViewModeChange 回调只在用户点击时触发, 启动时相机不会自动 tween。
  //   v19c 修复: 立即按 initial 摆位一次(duration=0, 不动画)
  //   v19d 修复: 同时处理 earth + overview 两种 mode, 删 line 122-128 的双重摆位
  // EarthScene 构造时已同步应用一次 celestialState，因此初始姿态和首帧完全一致。
  if (ui.viewModeTabs) {
    const initMode = ui.viewModeTabs.currentMode;
    const initEarthPos = scene.currentEarthWorldPosition;
    scene.setViewMode(initMode);
    if (initMode === "overview") {
      scene.camera.fov = 52;
      scene.camera.updateProjectionMatrix();
      const pose = scene.getOverviewCameraPose();
      scene.camera.position.copy(pose.position);
      scene.controls.target.copy(pose.target);
      scene.controls.update();
    } else if (initMode === "earth") {
      // earth 模式: fov 25° + 距离 5.77u + 偏移 (4.5, 2, 3) 相对地球中心
      scene.camera.fov = 25;
      scene.camera.updateProjectionMatrix();
      scene.camera.position.copy(
        scene.localEarthOffsetToWorld(new THREE.Vector3(4.5, 2, 3)),
      );
      scene.controls.target.copy(initEarthPos);
      scene.controls.update();
    } else if (initMode === "sun") {
      const pose = scene.getSunCameraPose();
      scene.camera.fov = 25;
      scene.camera.updateProjectionMatrix();
      scene.camera.position.copy(pose.position);
      scene.controls.target.copy(pose.target);
      scene.controls.update();
    } else {
      const pose = scene.getMoonCameraPose();
      scene.camera.fov = 25;
      scene.camera.updateProjectionMatrix();
      scene.camera.position.copy(pose.position);
      scene.controls.target.copy(pose.target);
      scene.controls.update();
    }
  }

  // 阶段 18d: 启动后立即更新一次 InfoCard (月相 + 公转)
  {
    const now = new Date();
    const mp = moonPhase(now);
    ui.infoCard.setMoonPhase(mp.name, mp.illumination);
    const dYear =
      Math.floor(
        (now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000,
      ) + 1;
    const totalDays = isLeapYear(now.getUTCFullYear()) ? 366 : 365;
    ui.infoCard.setOrbitPosition(dYear, totalDays);
  }

  // 阶段 18d: 每秒更新一次 InfoCard (月相 + 公转)
  setInterval(() => {
    if (!ui) return;
    const now = new Date();
    const mp = moonPhase(now);
    ui.infoCard.setMoonPhase(mp.name, mp.illumination);
    const dYear =
      Math.floor(
        (now.getTime() - Date.UTC(now.getUTCFullYear(), 0, 1)) / 86_400_000,
      ) + 1;
    const totalDays = isLeapYear(now.getUTCFullYear()) ? 366 : 365;
    ui.infoCard.setOrbitPosition(dYear, totalDays);
  }, 1000);

  // 监听 OrbitControls 'start' 事件(用户开始拖动地球)
  // 阶段 11 用途:locate 完成后,如果用户没操作,自动对齐相机到定位位置;
  // 用户一旦操作,尊重用户视角,不再自动重置
  if (scene.controls) {
    scene.controls.addEventListener("start", () => {
      userInteracted = true;
    });
  }

  // 位置识别(阶段 11)— fire-and-forget,不阻塞 UI 启动
  // 1. 完成 → 更新 InfoCard
  // 2. 2s 延迟后(给用户看高速旋转):
  //    - 如果用户没操作 → tween 地球减速回 1x + 相机平滑对齐到定位位置(3s)
  void locate()
    .then((result) => {
      console.log(
        `[3d-earth] located: ${result.source} (${result.lat.toFixed(2)}, ${result.lon.toFixed(2)}, utc${result.utcOffset >= 0 ? "+" : ""}${result.utcOffset})`
      );
      locatedResult = result;
      ui?.infoCard.setLocation(result.lat, result.lon, result.utcOffset);

      // 延迟 AUTO_RECENTER_DELAY_MS (修复 v19b: 不再 autoRotate, 纯 tween 到定位位置)
      setTimeout(() => {
        if (userInteracted || !locatedResult) {
          // 用户已操作 OR locate 没结果 → 不自动对齐
          return;
        }
        // 修复 v19e: 尊重 user 的 ViewModeTabs 选择
        //   仅当用户仍处于地球模式才自动对齐定位；总览、太阳、月球都不抢镜头。
        // 注意: 这里读 currentMode (实时) 不是 initMode (启动时), 尊重 user 切换
        const currentMode = ui?.viewModeTabs?.currentMode;
        if (currentMode !== "earth") {
          console.log(
            `[3d-earth] skip auto-tween: user is in overview mode`
          );
          return;
        }
        // 没操作且在 earth 模式: 启动相机 tween 到定位位置
        // 修复 v19b: latLonToCameraPosition 返回**世界坐标**(从 (0,0,0) 出发)
        //   必须 + earthPos 偏移, 否则 tween 会把 camera 摆到太阳位置(根因!)
        const offset = latLonToCameraPosition(
          locatedResult.lat,
          locatedResult.lon,
          CAMERA_DISTANCE
        );
        if (!scene) return;
        tweenCameraTo(
          scene.localEarthOffsetToWorld(offset),
          AUTO_RECENTER_DURATION_MS,
        );
        console.log(
          `[3d-earth] tweening camera to user location over ${AUTO_RECENTER_DURATION_MS}ms`
        );
      }, AUTO_RECENTER_DELAY_MS);
    })
    .catch((err) => {
      // locate 内部已 fallback UTC,这里只是兜底防 bug
      console.warn("[3d-earth] locate unexpected error:", err);
    });

  // 标签页隐藏时暂停渲染，节省资源
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      console.log("[3d-earth] tab hidden — render loop throttled by browser");
    } else {
      console.log("[3d-earth] tab visible — render loop resumed");
    }
  });

  // Hot reload 友好：HMR 时主动 dispose
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      ui?.unmount();
      ui = null;
      scene?.dispose();
      scene = null;
    });
  }

  console.log("[3d-earth] app initialized (stage 9: UI integrated)");
}

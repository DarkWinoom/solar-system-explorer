import * as THREE from "three";
import { EarthScene } from "./scene/EarthScene";
import { buildLocale } from "./i18n/buildLocale";
import { UIRoot } from "./ui/UIRoot";
import { locate, type LocateResult } from "./geo/locate";
import { latLonToCameraPosition } from "./geo/coords";

/**
 * 应用初始化入口
 *
 * 阶段 8: Earth + Atmosphere + OrbitControls + i18n
 * 阶段 9: UI 集成(TopBar / InfoCard / HelpHint / RecenterButton)
 * 阶段 11: 位置识别 + 启动 60x 旋转 + locate 完成后 3s tween(地球减速 + 相机平滑对齐)
 *
 * 协作纪律:
 *   - i18n 早期接入(buildLocale 在任何 DOM 文本前)
 *   - 禁止 commit(用户明示"本项目不需要你 commit")
 */

let scene: EarthScene | null = null;
let ui: UIRoot | null = null;
/** RecenterButton 触发的"回到默认视角"(4.5, 2, 3) */
const DEFAULT_CAMERA_POSITION: [number, number, number] = [4.5, 2, 3];
/** 相机到地球中心的固定距离(保持跟默认视角一致) */
const CAMERA_DISTANCE = Math.sqrt(
  DEFAULT_CAMERA_POSITION[0] ** 2 +
    DEFAULT_CAMERA_POSITION[1] ** 2 +
    DEFAULT_CAMERA_POSITION[2] ** 2
); // ≈ 5.77
/** 启动时地球高速旋转倍数 — 1°/秒 (肉眼明显;6 分钟转 1 圈 = 360x 真实) */
const STARTUP_ROTATION_SPEED = 600;
/** locate 完成后 tween 时长(同时用于地球减速 + 相机对齐) */
const AUTO_RECENTER_DURATION_MS = 3000;
/** locate 完成后,等用户几秒再触发 tween(给用户先看高速旋转) */
const AUTO_RECENTER_DELAY_MS = 2000;
/** 用户是否已经拖动过地球(若已操作,locate 完成不重置相机) */
let userInteracted = false;
/** locate 结果(供 tween 用) */
let locatedResult: LocateResult | null = null;
/** 当前正在跑的 camera tween 的 rAF handle(避免并发) */
let activeCameraTween: number | null = null;

/**
 * RecenterButton 触发的"回到默认视角" (4.5, 2, 3) — 阶段 9 行为(立即重置,无 tween)
 */
function recenterCameraToDefault(): void {
  if (!scene) return;
  cancelCameraTween();
  scene.camera.position.set(...DEFAULT_CAMERA_POSITION);
  scene.camera.lookAt(0, 0, 0);
  if (scene.controls) {
    scene.controls.target.set(0, 0, 0);
    scene.controls.update();
  }
}

/**
 * 平滑 tween 相机到指定世界坐标(ease-out cubic)
 */
function tweenCameraTo(target: THREE.Vector3, durationMs: number): void {
  if (!scene) return;
  cancelCameraTween();
  const startPos = scene.camera.position.clone();
  const startTime = performance.now();

  const step = (): void => {
    if (!scene) return;
    const elapsed = performance.now() - startTime;
    const t = Math.min(elapsed / durationMs, 1);
    // ease-out cubic — 起步快,接近目标时减速
    const eased = 1 - Math.pow(1 - t, 3);
    scene.camera.position.lerpVectors(startPos, target, eased);
    scene.camera.lookAt(0, 0, 0);
    if (scene.controls) {
      scene.controls.target.set(0, 0, 0);
      scene.controls.update();
    }
    if (t < 1) {
      activeCameraTween = requestAnimationFrame(step);
    } else {
      activeCameraTween = null;
    }
  };
  activeCameraTween = requestAnimationFrame(step);
}

function cancelCameraTween(): void {
  if (activeCameraTween !== null) {
    cancelAnimationFrame(activeCameraTween);
    activeCameraTween = null;
  }
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

  // 启动时地球高速旋转(阶段 11) — 让人能"看到在动"
  // locate 完成后 2s + 3s tween 减速回 1:1 真实
  if (scene.earth) {
    scene.earth.setRotationSpeedMultiplier(STARTUP_ROTATION_SPEED, 0); // 立即 60x
  }

  // UI 层(阶段 9)
  ui = new UIRoot({
    controls: scene.controls,
    onRecenter: recenterCameraToDefault,
  });
  ui.mount(document.body);

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

      // 延迟 AUTO_RECENTER_DELAY_MS,给用户先看高速旋转
      setTimeout(() => {
        if (userInteracted || !locatedResult) {
          // 用户已操作 OR locate 没结果 → 不自动对齐
          // 但地球仍要减速回 1x(否则一直 60x 浪费)
          if (scene?.earth) {
            scene.earth.setRotationSpeedMultiplier(1, AUTO_RECENTER_DURATION_MS);
          }
          return;
        }
        // 没操作:启动 tween
        if (scene?.earth) {
          scene.earth.setRotationSpeedMultiplier(1, AUTO_RECENTER_DURATION_MS);
        }
        const pos = latLonToCameraPosition(
          locatedResult.lat,
          locatedResult.lon,
          CAMERA_DISTANCE
        );
        tweenCameraTo(pos, AUTO_RECENTER_DURATION_MS);
        console.log(
          `[3d-earth] tweening camera to located position (3s) + easing rotation 60x→1x`
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

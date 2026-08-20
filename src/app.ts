import { EarthScene } from "./scene/EarthScene";
import { buildLocale } from "./i18n/buildLocale";
import { UIRoot } from "./ui/UIRoot";
import { locate } from "./geo/locate";

/**
 * 应用初始化入口
 *
 * 阶段 8: Earth + Atmosphere + OrbitControls + i18n
 * 阶段 9: UI 集成(TopBar / InfoCard / HelpHint / RecenterButton)
 * 后续阶段: 位置识别(11) / 性能优化(13)
 *
 * 协作纪律:
 *   - i18n 早期接入(buildLocale 在任何 DOM 文本前)
 *   - 默认相机视角 (4.5, 2, 3) — 同时是 RecenterButton 的"原视角"参考
 *   - 禁止 commit(用户明示"本项目不需要你 commit")
 */

let scene: EarthScene | null = null;
let ui: UIRoot | null = null;

/** RecenterButton 触发的"回到原视角" — 阶段 9 范围:直接复位(无 tween) */
const DEFAULT_CAMERA_POSITION: [number, number, number] = [4.5, 2, 3];

function recenterCamera(): void {
  if (!scene) return;
  scene.camera.position.set(...DEFAULT_CAMERA_POSITION);
  scene.camera.lookAt(0, 0, 0);
  // OrbitControls 也需要 reset 内部状态(target / spherical)
  if (scene.controls) {
    // ambient-typed any,直接调 .target / .update()
    scene.controls.target.set(0, 0, 0);
    scene.controls.update();
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

  // UI 层(阶段 9)
  ui = new UIRoot({
    controls: scene.controls,
    onRecenter: recenterCamera,
  });
  ui.mount(document.body);

  // 位置识别(阶段 11)— fire-and-forget,不阻塞 UI 启动
  // 完成后只更新 InfoCard(不动相机:用户视角优先)
  // 传 utcOffset 让 InfoCard 用 IP 所在地的时区算日出日落(不能用户电脑时区 — VPN 常见)
  void locate()
    .then((result) => {
      console.log(
        `[3d-earth] located: ${result.source} (${result.lat.toFixed(2)}, ${result.lon.toFixed(2)}, utc${result.utcOffset >= 0 ? "+" : ""}${result.utcOffset})`
      );
      ui?.infoCard.setLocation(result.lat, result.lon, result.utcOffset);
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

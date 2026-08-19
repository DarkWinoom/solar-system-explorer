import { EarthScene } from "./scene/EarthScene";

/**
 * 应用初始化入口
 *
 * 阶段 2：创建 EarthScene 跑通 render loop（黑屏 + 旋转立方体验证）
 * 后续阶段：在此接入星空 / 地球 / 大气层 / OrbitControls / UI / i18n / 位置识别
 */

let scene: EarthScene | null = null;

export function initApp(): void {
  const root = document.getElementById("app");
  if (!root) {
    console.error("[3d-earth] #app root element not found");
    return;
  }

  // 禁止文本选择（CSS 已设置，JS 兜底）
  document.addEventListener("selectstart", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());

  // 创建 Three.js 场景
  scene = new EarthScene({
    container: root,
    backgroundColor: 0x02050f,
  });

  // 标签页隐藏时暂停渲染，节省资源
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      // Three.js 默认会跟着 raf 暂停（标签页隐藏时 raf 也会降频）
      // 这里只做日志，调试用
      console.log("[3d-earth] tab hidden — render loop throttled by browser");
    } else {
      console.log("[3d-earth] tab visible — render loop resumed");
    }
  });

  // Hot reload 友好：HMR 时主动 dispose
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      scene?.dispose();
      scene = null;
    });
  }

  console.log("[3d-earth] app initialized (stage 2: Three.js scene + test cube)");
}

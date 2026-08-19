/**
 * 应用初始化（阶段 1 占位）
 * 后续阶段会注入 Three.js 场景、UI、i18n、位置识别等模块
 */

export function initApp(): void {
  // 阶段 1: 仅基础 DOM + console 验证脚手架是否跑通
  const root = document.getElementById("app");
  if (!root) {
    console.error("[3d-earth] #app root element not found");
    return;
  }

  // 临时占位 — 阶段 2 替换为 Three.js canvas
  root.innerHTML = `
    <div style="
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      color: #00d4ff;
      font-family: 'Orbitron', sans-serif;
      font-size: 24px; letter-spacing: 0.2em;
      background: radial-gradient(ellipse at center, #050a1a 0%, #02050f 100%);
    ">
      🌍 3D Earth Simulator
      <span style="color:#7080a0; font-size:14px; margin-left:12px;">
        stage 1 — scaffold ready
      </span>
    </div>
  `;

  // 禁止文本选择（CSS 已设置，JS 兜底）
  document.addEventListener("selectstart", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());

  console.log("[3d-earth] app initialized (stage 1: scaffold)");
}

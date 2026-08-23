import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 锁源测试: 防止 auto-tween 退回老逻辑
 *
 * 背景:
 *   阶段 11 旧逻辑: locate 完成后 2s 自动 tween 相机到用户定位位置
 *   阶段 18+: ViewModeTabs 替代 RecenterButton, 默认 initial = "overview"
 *     → 用户明确选 overview 视角(看日地月系统), 不该被 auto-tween 拉近
 *
 * 测试方法:
 *   用 grep 检查 src/app.ts setTimeout 块里**必须**有 initial mode 检查
 *   (避免未来误改回老逻辑, 让 overview 模式被自动 tween 拉近)
 *
 * ⚠️ 锁源测试的局限:
 *   1. 不能 catch 复杂的逻辑错误(只能 catch 明显的回归)
 *   2. 真正的 visual 验证要 dev 跑
 *
 * 跨项目适用: 任何"auto-action 必须尊重用户初始选择" 的逻辑
 */
describe("auto-tween respects initial view mode (锁源测试)", () => {
  const appTsPath = join(process.cwd(), "src", "app.ts");
  const src = readFileSync(appTsPath, "utf-8");

  it("app.ts: setTimeout 块里有 initial mode 检查 (overview 不 auto-tween)", () => {
    // 锁源: 必须有 'overview' 字符串 + 早返回 (避免 auto-tween 在 overview 模式触发)
    // 用 regex 找 setTimeout 块里的 initial mode 检查
    // 模式示例: initMode === "overview" 配合 early return
    const hasInitialCheck =
      /initMode\s*===\s*["']overview["'][^]*?(return|continue)/.test(src);
    expect(
      hasInitialCheck,
      "src/app.ts 缺少 initial mode 检查 — overview 模式会被 auto-tween 拉近到地球视角"
    ).toBe(true);
  });

  it("app.ts: locate 完成后的 setTimeout 块存在 (v19d 修复后保留条件检查)", () => {
    // 锁源: setTimeout 块必须保留 (locate 完成后还是要做点什么 — 比如 update InfoCard)
    // 但**不能**无条件 tween
    const hasConditionalTween =
      /setTimeout[\s\S]*?locate[\s\S]*?overview[\s\S]*?return/.test(src);
    expect(
      hasConditionalTween,
      "src/app.ts setTimeout 块缺 overview 早返回 — 会让 overview 模式被 auto-tween 拉近"
    ).toBe(true);
  });
});

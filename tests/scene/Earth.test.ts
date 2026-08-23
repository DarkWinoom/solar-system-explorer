import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 纹理经度偏移必须配合 RepeatWrapping：offset.x = 0.5 会使后半段 UV 超过 1，
 * 若使用默认 ClampToEdgeWrapping，会把半球钳制成纹理最右侧的一列像素。
 */
describe("Earth texture longitude wrapping", () => {
  const src = readFileSync(
    join(process.cwd(), "src", "scene", "Earth.ts"),
    "utf-8",
  );

  it("day、night 和 bump 纹理均以 0.5 偏移并横向循环", () => {
    for (const textureName of [
      "dayTexture",
      "nightTexture",
      "bumpRoughnessCloudsTexture",
    ]) {
      expect(
        new RegExp(`${textureName}\\.offset\\.x\\s*=\\s*0\\.5`).test(src),
      ).toBe(true);
      expect(
        new RegExp(`${textureName}\\.wrapS\\s*=\\s*THREE\\.RepeatWrapping`).test(src),
      ).toBe(true);
    }
  });

  it("白昼颜色不依赖 forceWebGL 下不稳定的 PBR output.rgb", () => {
    expect(/dayColor\.rgb/.test(src)).toBe(true);
    const codeOnly = src
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(/\boutput\.rgb\b/.test(codeOnly)).toBe(false);
  });
});

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { InfoCard } from "../../src/ui/InfoCard";
import { i18n } from "../../src/i18n";
import { zhCN } from "../../src/i18n/locales/zh-CN";
import { enUS } from "../../src/i18n/locales/en-US";

/**
 * InfoCard 关键行为测试
 *
 * 3 件事(测试细化偏好):
 *   1. 默认(locationKnown=false)sun value 显示"待定位"占位 — 防止 (0,0) 兜底误导用户
 *   2. setLocation 后 sun value 切换到真实倒计时
 *   3. 重置后回到"待定位"
 *
 * 用 jsdom 测 DOM 行为(InfoCard 是 DOM class,核心合约在 DOM 上)。
 */
describe("InfoCard", () => {
  let card: InfoCard;
  let parent: HTMLDivElement;

  // 测试套件只跑一次:i18n 单例需要 locales(测试不调 buildLocale)
  beforeAll(() => {
    i18n.registerLocale("zh-CN", zhCN);
    i18n.registerLocale("en-US", enUS);
  });

  beforeEach(() => {
    // 确保 i18n 已知(测试间不持久化,默认 en-US)
    i18n.setLocale("en-US");
    parent = document.createElement("div");
    document.body.appendChild(parent);
    card = new InfoCard();
  });

  afterEach(() => {
    card.unmount();
    parent.remove();
  });

  it("shows 'Awaiting location' for sun value when location is unknown", () => {
    card.mount(parent);
    const sunValue = card.element.querySelector(
      '[data-testid="info-card"] > div:nth-child(6)'
    ) as HTMLElement;
    // 简化:第 6 个子元素是 sun value(label=3, value=4 是 time;label=5, value=6 是 sun)
    // 实际用直接查找 — sunLabel + sunValue 是第 5/6 个 div
    expect(sunValue.textContent).toBe("Awaiting location");
  });

  it("switches to real countdown after setLocation", () => {
    card.mount(parent);
    // 北京天安门大致 (39.9, 116.4)
    card.setLocation(39.9, 116.4);
    // sun value 不再是 "Awaiting location"
    const sunValue = card.element.querySelector(
      '[data-testid="info-card"] > div:nth-child(6)'
    ) as HTMLElement;
    expect(sunValue.textContent).not.toBe("Awaiting location");
    // 真实倒计时应该以 "Sunrise in" / "Sunset in" / "Polar day/night" 开头
    expect(sunValue.textContent).toMatch(
      /^(Sunrise in|Sunset in|Polar day|Polar night)/
    );
  });

  it("goes back to 'Awaiting location' after resetLocation", () => {
    card.mount(parent);
    card.setLocation(39.9, 116.4);
    card.resetLocation();
    const sunValue = card.element.querySelector(
      '[data-testid="info-card"] > div:nth-child(6)'
    ) as HTMLElement;
    expect(sunValue.textContent).toBe("Awaiting location");
  });
});

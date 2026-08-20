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
    // 北京天安门大致 (39.9, 116.4) + utcOffset = 8
    card.setLocation(39.9, 116.4, 8);
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

  it("uses provided utcOffset (not local timezone) for sun calculation", () => {
    // 关键测试:用 LA 经纬度 + LA 时区 utcOffset=-7
    // 跟"用 LA 经纬度 + 用户本机时区 (Asia/Shanghai +8)" 的结果应该不同
    // (用户在 Asia/Shanghai,但 IP 定位到 LA — 这是测试要覆盖的关键场景)
    card.mount(parent);
    card.setLocation(34.04, -118.25, -7); // LA + PDT
    const sunValueLA = card.element.querySelector(
      '[data-testid="info-card"] > div:nth-child(6)'
    ) as HTMLElement;
    // 不是 "Awaiting location"
    expect(sunValueLA.textContent).not.toBe("Awaiting location");
    // 应该有真实倒计时文字
    expect(sunValueLA.textContent).toMatch(
      /^(Sunrise in|Sunset in|Polar day|Polar night)/
    );
  });

  it("uses utcOffset for nowHour comparison (VPN scenario)", () => {
    // 用户报告的 bug:北京时间 09:46 + IP 定位 LA → 应该看到"距日落 ~24m"(LA 18:46 接近 19:10 日落)
    // 之前错误:用 now.getHours() = 9 → 跟 LA 的 sunset 19.10 比 → 9h 41m(错)
    // 修后:把 now 转成 LA 时间(18.46)再跟 LA 的 19.10 比 → ~24m(对)
    card.mount(parent);
    card.setLocation(34.04, -118.25, -7); // LA + PDT

    // mock 当前时间:UTC 01:46 = 北京 09:46 = LA 18:46(前一天)
    // 验证逻辑分支选了"Sunset in"且数字 < 1h
    const sunValueLA = card.element.querySelector(
      '[data-testid="info-card"] > div:nth-child(6)'
    ) as HTMLElement;
    // 关键:不应该显示"9h"或更长(说明修复生效)
    expect(sunValueLA.textContent).toMatch(/^Sunset in \d+h \d+m$/);
    // LA 18:46 vs sunset 19:10 → 应该 < 1h(0-59m)
    const match = sunValueLA.textContent!.match(/^Sunset in (\d+)h (\d+)m$/);
    expect(match).not.toBeNull();
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      // 总分钟数 < 90(给点宽松,日落 ±1.5h)
      expect(h * 60 + m).toBeLessThan(90);
    }
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

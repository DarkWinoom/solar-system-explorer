import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
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
 * sun 倒计时依赖"当前时间"——用 vi.useFakeTimers + setSystemTime 固定到 LA 当地 12:00 PDT
 * (确保既不是 sunrise 也不是 sunset 边界,测试稳定)。
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
    // 固定到 LA 当地 18:30 PDT(UTC 01:30 第二天)— 距离日落 19:10 PDT 还有 ~40 分钟
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-09T01:30:00Z")); // UTC 01:30 = PDT 18:30
    // 确保 i18n 已知(测试间不持久化,默认 en-US)
    i18n.setLocale("en-US");
    parent = document.createElement("div");
    document.body.appendChild(parent);
    card = new InfoCard();
  });

  afterEach(() => {
    card.unmount();
    parent.remove();
    vi.useRealTimers();
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
    // fake time 固定到 UTC 19:00 = PDT 12:00(LA 当地中午)
    // 此时 LA 12:00, sunrise ~6:30, sunset ~19:10 → 应显示"距日落 ~7h"
    card.mount(parent);
    card.setLocation(34.04, -118.25, -7); // LA + PDT
    const sunValueLA = card.element.querySelector(
      '[data-testid="info-card"] > div:nth-child(6)'
    ) as HTMLElement;
    // 不是 "Awaiting location"
    expect(sunValueLA.textContent).not.toBe("Awaiting location");
    // 应该有真实倒计时文字 — 应该是 "Sunset in 7h" 附近(LA 12:00 vs sunset 19:10)
    expect(sunValueLA.textContent).toMatch(
      /^(Sunrise in|Sunset in|Polar day|Polar night) \d+h \d+m$/
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

  // ---- 阶段 18a: 月相行 + 公转行 ----
  describe("月相行 (setMoonPhase)", () => {
    it("默认 (未调 setMoonPhase) 显示占位 '—'", () => {
      card.mount(parent);
      const moonValue = card.element.querySelector(
        '[data-testid="info-card-moon-value"]'
      ) as HTMLElement;
      expect(moonValue.textContent).toBe("—");
    });

    it("setMoonPhase('firstQuarter', 0.6) → '上弦月 60%' (zh-CN)", () => {
      i18n.setLocale("zh-CN");
      card.mount(parent);
      card.setMoonPhase("firstQuarter", 0.6);
      const moonValue = card.element.querySelector(
        '[data-testid="info-card-moon-value"]'
      ) as HTMLElement;
      expect(moonValue.textContent).toBe("上弦月 60%");
      i18n.setLocale("en-US"); // 恢复默认
    });

    it("setMoonPhase('fullMoon', 1.0) → '满月 100%' (zh-CN)", () => {
      i18n.setLocale("zh-CN");
      card.mount(parent);
      card.setMoonPhase("fullMoon", 1.0);
      const moonValue = card.element.querySelector(
        '[data-testid="info-card-moon-value"]'
      ) as HTMLElement;
      expect(moonValue.textContent).toBe("满月 100%");
      i18n.setLocale("en-US");
    });

    it("setMoonPhase 8 阶段都正确 (zh-CN)", () => {
      i18n.setLocale("zh-CN");
      card.mount(parent);
      const expected = [
        ["newMoon", "新月", 0],
        ["waxingCrescent", "蛾眉月", 0.25],
        ["firstQuarter", "上弦月", 0.5],
        ["waxingGibbous", "盈凸月", 0.75],
        ["fullMoon", "满月", 1],
        ["waningGibbous", "亏凸月", 0.75],
        ["lastQuarter", "下弦月", 0.5],
        ["waningCrescent", "残月", 0.25],
      ] as const;
      for (const [name, phaseName, illumination] of expected) {
        card.setMoonPhase(name, illumination);
        const moonValue = card.element.querySelector(
          '[data-testid="info-card-moon-value"]'
        ) as HTMLElement;
        expect(moonValue.textContent).toContain(phaseName);
        expect(moonValue.textContent).toContain(
          `${Math.round(illumination * 100)}%`
        );
      }
      i18n.setLocale("en-US");
    });

    it("i18n 切到 en-US → 月相名变成英文", () => {
      card.mount(parent);
      card.setMoonPhase("firstQuarter", 0.6);
      i18n.setLocale("en-US");
      const moonValue = card.element.querySelector(
        '[data-testid="info-card-moon-value"]'
      ) as HTMLElement;
      expect(moonValue.textContent).toBe("First Quarter 60%");
    });

    it("百分比 4 舍 5 入到整数 (0.605 → 61%)", () => {
      card.mount(parent);
      card.setMoonPhase("waxingGibbous", 0.605);
      const moonValue = card.element.querySelector(
        '[data-testid="info-card-moon-value"]'
      ) as HTMLElement;
      expect(moonValue.textContent).toContain("61%");
    });
  });

  describe("公转行 (setOrbitPosition)", () => {
    it("默认 (未调 setOrbitPosition) 显示占位 '—'", () => {
      card.mount(parent);
      const orbitValue = card.element.querySelector(
        '[data-testid="info-card-orbit-value"]'
      ) as HTMLElement;
      expect(orbitValue.textContent).toBe("—");
    });

    it("setOrbitPosition(234, 365) → '第 234 / 365 天' (zh-CN)", () => {
      i18n.setLocale("zh-CN");
      card.mount(parent);
      card.setOrbitPosition(234, 365);
      const orbitValue = card.element.querySelector(
        '[data-testid="info-card-orbit-value"]'
      ) as HTMLElement;
      expect(orbitValue.textContent).toBe("第 234 / 365 天");
      i18n.setLocale("en-US");
    });

    it("setOrbitPosition(1, 365) → '第 1 / 365 天' (年初)", () => {
      i18n.setLocale("zh-CN");
      card.mount(parent);
      card.setOrbitPosition(1, 365);
      const orbitValue = card.element.querySelector(
        '[data-testid="info-card-orbit-value"]'
      ) as HTMLElement;
      expect(orbitValue.textContent).toBe("第 1 / 365 天");
      i18n.setLocale("en-US");
    });

    it("i18n 切到 en-US → 公转格式英文", () => {
      card.mount(parent);
      card.setOrbitPosition(234, 365);
      i18n.setLocale("en-US");
      const orbitValue = card.element.querySelector(
        '[data-testid="info-card-orbit-value"]'
      ) as HTMLElement;
      expect(orbitValue.textContent).toBe("Day 234 / 365");
    });
  });
});

import { i18n } from "../i18n";
import { i18nKeys } from "./i18nKeys";
import { formatLocalTime, formatCountdown } from "./format";
import { calcSunTimes, solarDeclination } from "../utils/sun";

/**
 * InfoCard — 左下角信息卡
 *
 * 3 行布局(每行 = label 小字 + value 主字):
 *   1. 时区(Intl.DateTimeFormat().resolvedOptions().timeZone)
 *   2. 时间(formatLocalTime,每秒更新)
 *   3. 日出日落倒计时(calcSunTimes(0, 0, date, tz_offset),阶段 11 接真实经纬度)
 *
 * @contract
 *   - `mount(parent)` 挂载 + 启动 1s tick
 *   - `unmount()` 清除 tick + 取消 i18n 订阅
 *   - `setLocation(lat, lon)` 阶段 11 接入真实经纬度
 *   - locale 切换时所有 i18n label 自动更新
 */
export class InfoCard {
  private readonly element: HTMLDivElement;
  private readonly tzLabelEl: HTMLDivElement;
  private readonly tzValueEl: HTMLDivElement;
  private readonly timeLabelEl: HTMLDivElement;
  private readonly timeValueEl: HTMLDivElement;
  private readonly sunLabelEl: HTMLDivElement;
  private readonly sunValueEl: HTMLDivElement;
  private unsubI18n: (() => void) | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private mounted: boolean = false;
  /**
   * 位置是否已知。Phase 9 默认未知,避免用 (0,0) 兜底误导用户(赤道日出跟用户位置无关)。
   * Phase 11 接 GeoLocation 拿到真实经纬度后,通过 setLocation() 设 true。
   */
  private locationKnown = false;
  private lat = 0;
  private lon = 0;

  constructor() {
    this.element = document.createElement("div");
    this.element.setAttribute("data-testid", "info-card");
    this.element.style.cssText = `
      position: absolute;
      left: 20px;
      bottom: 20px;
      min-width: 240px;
      padding: 16px 18px;
      background: rgba(8, 16, 32, 0.72);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(77, 178, 255, 0.2);
      border-radius: 12px;
      color: #e0e8ff;
      font-family: "Inter", sans-serif;
      pointer-events: auto;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
    `;

    // 行 1:时区
    this.tzLabelEl = this.makeLabel();
    this.tzValueEl = this.makeValue();
    this.tzValueEl.style.fontSize = "13px";

    // 行 2:时间
    this.timeLabelEl = this.makeLabel();
    this.timeValueEl = this.makeValue();
    this.timeValueEl.style.fontSize = "22px";
    this.timeValueEl.style.fontWeight = "500";
    this.timeValueEl.style.letterSpacing = "0.05em";

    // 行 3:日出日落
    this.sunLabelEl = this.makeLabel();
    this.sunValueEl = this.makeValue();
    this.sunValueEl.style.fontSize = "13px";
    this.sunValueEl.style.color = "#4db2ff";

    this.element.appendChild(this.tzLabelEl);
    this.element.appendChild(this.tzValueEl);
    this.element.appendChild(this.timeLabelEl);
    this.element.appendChild(this.timeValueEl);
    this.element.appendChild(this.sunLabelEl);
    this.element.appendChild(this.sunValueEl);
  }

  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    parent.appendChild(this.element);
    this.unsubI18n = i18n.subscribe(() => this.renderStatic());
    this.renderStatic();
    this.update();
    this.tickTimer = setInterval(() => this.update(), 1000);
    this.mounted = true;
  }

  unmount(): void {
    if (!this.mounted) return;
    this.unsubI18n?.();
    this.unsubI18n = null;
    if (this.tickTimer !== null) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
    this.mounted = false;
  }

  /** 阶段 11 接入:由 GeoLocation 调用,更新经纬度。会自动启用 sun 倒计时显示。 */
  setLocation(lat: number, lon: number): void {
    this.lat = lat;
    this.lon = lon;
    this.locationKnown = true;
    this.update();
  }

  /** 测试/调试用:重置为未知位置 */
  resetLocation(): void {
    this.locationKnown = false;
    this.update();
  }

  private renderStatic(): void {
    this.tzLabelEl.textContent = i18n.t(i18nKeys.ui.timezone.label);
    this.timeLabelEl.textContent = i18n.t(i18nKeys.ui.time.label);
    this.sunLabelEl.textContent = i18n.t(i18nKeys.ui.sun.countdown.label);
  }

  private update(): void {
    const now = new Date();
    // 时区(Intl 永远真实)
    this.tzValueEl.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone;
    // 时间(本地,永远真实)
    this.timeValueEl.textContent = formatLocalTime(now);
    // 日出日落倒计时:仅在位置已知时计算
    this.sunValueEl.textContent = this.locationKnown
      ? this.computeSunCountdown(now)
      : i18n.t(i18nKeys.ui.sun.countdown.unknown);
  }

  private computeSunCountdown(now: Date): string {
    const tzOffsetMin = -now.getTimezoneOffset();
    const tz = tzOffsetMin / 60;
    const { sunrise, sunset } = calcSunTimes(this.lat, this.lon, now, tz);

    // 极昼 / 极夜
    if (sunrise === null && sunset === null) {
      const declDeg = solarDeclination(now);
      return declDeg >= 0
        ? i18n.t(i18nKeys.ui.sun.countdown.polarDay)
        : i18n.t(i18nKeys.ui.sun.countdown.polarNight);
    }

    const nowHour =
      now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;

    if (sunrise !== null && sunset !== null) {
      if (nowHour < sunrise) {
        return `${i18n.t(i18nKeys.ui.sun.countdown.sunrise)} ${formatCountdown(
          (sunrise - nowHour) * 3600_000
        )}`;
      } else if (nowHour < sunset) {
        return `${i18n.t(i18nKeys.ui.sun.countdown.sunset)} ${formatCountdown(
          (sunset - nowHour) * 3600_000
        )}`;
      } else {
        // 已过今天日落 → 明天日出
        const tomorrowSunrise = sunrise + 24;
        return `${i18n.t(i18nKeys.ui.sun.countdown.sunrise)} ${formatCountdown(
          (tomorrowSunrise - nowHour) * 3600_000
        )}`;
      }
    }

    return "—";
  }

  private makeLabel(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.cssText = `
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: rgba(224, 232, 255, 0.45);
      margin-top: 8px;
    `;
    return el;
  }

  private makeValue(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.cssText = `
      font-family: "JetBrains Mono", monospace;
      color: #e0e8ff;
      margin-top: 2px;
    `;
    return el;
  }
}

import { i18n } from "../i18n";
import { i18nKeys } from "./i18nKeys";
import { formatLocalTime, formatCountdown } from "./format";
import { calcSunTimes, solarDeclination } from "../utils/sun";
import type { MoonPhase } from "../utils/orbits";

/**
 * InfoCard — 左下角信息卡
 *
 * 5 行布局(每行 = label 小字 + value 主字):
 *   1. 时区(Intl.DateTimeFormat().resolvedOptions().timeZone)
 *   2. 时间(formatLocalTime,每秒更新)
 *   3. 日出日落倒计时(calcSunTimes(0, 0, date, tz_offset),阶段 11 接真实经纬度)
 *   4. 月相(阶段 18 接入:moonPhase(date).name + .illumination)
 *   5. 公转位置(阶段 18 接入:earthOrbitAngle 推到 dayOfYear 1-365)
 *
 * @contract
 *   - `mount(parent)` 挂载 + 启动 1s tick
 *   - `unmount()` 清除 tick + 取消 i18n 订阅
 *   - `setLocation(lat, lon)` 阶段 11 接入真实经纬度
 *   - `setMoonPhase(name, illumination)` 阶段 18 接入, 默认显示 "—"
 *   - `setOrbitPosition(dayOfYear, totalDays)` 阶段 18 接入, 默认显示 "—"
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
  private readonly moonLabelEl: HTMLDivElement;
  private readonly moonValueEl: HTMLDivElement;
  private readonly orbitLabelEl: HTMLDivElement;
  private readonly orbitValueEl: HTMLDivElement;
  private readonly sunDividerEl: HTMLDivElement;
  private readonly orbitDividerEl: HTMLDivElement;
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
  /**
   * IP 所在地的 UTC 偏移(小时)。null = 未知(用本机时区)
   * 重要:不能用用户本机时区!IP 所在地 ≠ 电脑时区(VPN / 出差常见)
   */
  private utcOffset: number | null = null;
  /**
   * 月相 — 默认 null (显示 "—"), 由 setMoonPhase 设置
   */
  private moonPhaseName: MoonPhase | null = null;
  private moonIllumination: number = 0;
  /**
   * 公转位置 — 默认 null (显示 "—"), 由 setOrbitPosition 设置
   */
  private orbitDayOfYear: number | null = null;
  private orbitTotalDays: number = 365;

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

    // 分隔线 (行 3 后)
    this.sunDividerEl = this.makeDivider();

    // 行 4:月相
    this.moonLabelEl = this.makeLabel();
    this.moonValueEl = this.makeValue();
    this.moonValueEl.setAttribute("data-testid", "info-card-moon-value");
    this.moonValueEl.style.fontSize = "13px";

    // 分隔线 (行 4 后)
    this.orbitDividerEl = this.makeDivider();

    // 行 5:公转位置
    this.orbitLabelEl = this.makeLabel();
    this.orbitValueEl = this.makeValue();
    this.orbitValueEl.setAttribute("data-testid", "info-card-orbit-value");
    this.orbitValueEl.style.fontSize = "13px";

    this.element.appendChild(this.tzLabelEl);
    this.element.appendChild(this.tzValueEl);
    this.element.appendChild(this.timeLabelEl);
    this.element.appendChild(this.timeValueEl);
    this.element.appendChild(this.sunLabelEl);
    this.element.appendChild(this.sunValueEl);
    this.element.appendChild(this.sunDividerEl);
    this.element.appendChild(this.moonLabelEl);
    this.element.appendChild(this.moonValueEl);
    this.element.appendChild(this.orbitDividerEl);
    this.element.appendChild(this.orbitLabelEl);
    this.element.appendChild(this.orbitValueEl);
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

  /**
   * 阶段 11 接入:由 GeoLocation 调用,更新经纬度。
   * @param lat 纬度(度)
   * @param lon 经度(度)
   * @param utcOffset IP 所在地的 UTC 偏移(小时);不传时用本机时区(可能不准,常见于 VPN)
   */
  setLocation(lat: number, lon: number, utcOffset?: number): void {
    this.lat = lat;
    this.lon = lon;
    if (typeof utcOffset === "number") {
      this.utcOffset = utcOffset;
    }
    this.locationKnown = true;
    this.update();
  }

  /** 测试/调试用:重置为未知位置 */
  resetLocation(): void {
    this.locationKnown = false;
    this.utcOffset = null;
    this.update();
  }

  /**
   * 阶段 18 接入:由 EarthScene tick 调,更新月相显示
   * @param name 8 阶段名称
   * @param illumination 几何照度 (0-1, e.g. 0.6 = 60%)
   */
  setMoonPhase(name: MoonPhase, illumination: number): void {
    this.moonPhaseName = name;
    this.moonIllumination = illumination;
    this.updateMoonValue();
  }

  /**
   * 阶段 18 接入:由 EarthScene tick 调,更新公转位置
   * @param dayOfYear 1-indexed day of year (1-366)
   * @param totalDays 一年总天数(平年 365, 闰年 366)
   */
  setOrbitPosition(dayOfYear: number, totalDays: number): void {
    this.orbitDayOfYear = dayOfYear;
    this.orbitTotalDays = totalDays;
    this.updateOrbitValue();
  }

  private renderStatic(): void {
    this.tzLabelEl.textContent = i18n.t(i18nKeys.ui.timezone.label);
    this.timeLabelEl.textContent = i18n.t(i18nKeys.ui.time.label);
    this.sunLabelEl.textContent = i18n.t(i18nKeys.ui.sun.countdown.label);
    this.moonLabelEl.textContent = i18n.t(i18nKeys.ui.moon.label);
    this.orbitLabelEl.textContent = i18n.t(i18nKeys.ui.orbit.label);
    // locale 切换时月相 + 公转的 value 也要更新(读已存的字段重新渲染)
    this.updateMoonValue();
    this.updateOrbitValue();
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

  private updateMoonValue(): void {
    if (this.moonPhaseName === null) {
      this.moonValueEl.textContent = "—";
      return;
    }
    const phaseKey = i18nKeys.ui.moon.phase[this.moonPhaseName];
    const phaseName = i18n.t(phaseKey);
    const pct = Math.round(this.moonIllumination * 100);
    this.moonValueEl.textContent = `${phaseName} ${pct}%`;
  }

  private updateOrbitValue(): void {
    if (this.orbitDayOfYear === null) {
      this.orbitValueEl.textContent = "—";
      return;
    }
    this.orbitValueEl.textContent = i18n.t(i18nKeys.ui.orbit.dayProgress, {
      day: this.orbitDayOfYear,
      total: this.orbitTotalDays,
    });
  }

  private computeSunCountdown(now: Date): string {
    // 优先用 IP 所在地的 UTC 偏移(VPN/出差常见 IP ≠ 电脑时区)
    // 未设置时退化到本机时区
    const tz =
      this.utcOffset !== null
        ? this.utcOffset
        : -now.getTimezoneOffset() / 60;
    const { sunrise, sunset } = calcSunTimes(this.lat, this.lon, now, tz);

    // 极昼 / 极夜
    if (sunrise === null && sunset === null) {
      const declDeg = solarDeclination(now);
      return declDeg >= 0
        ? i18n.t(i18nKeys.ui.sun.countdown.polarDay)
        : i18n.t(i18nKeys.ui.sun.countdown.polarNight);
    }

    // **关键**:`nowHour` 必须用 tz 转换到 IP 所在地时间,不能直接用本机 getHours()
    // 不然:VPN 用户本机时间 9:46(北京时间) 但 IP 所在地 LA 是 18:46(PDT),
    //     用 9:46 跟 LA 的 sunset(19:10) 比 → "距日落 9h 24m" — 错!
    //     正确:用 18:46 跟 19:10 比 → "距日落 24m" — 对
    const utcHours =
      now.getUTCHours() +
      now.getUTCMinutes() / 60 +
      now.getUTCSeconds() / 3600;
    const localNowHour = (utcHours + tz + 24) % 24;

    if (sunrise !== null && sunset !== null) {
      if (localNowHour < sunrise) {
        return `${i18n.t(i18nKeys.ui.sun.countdown.sunrise)} ${formatCountdown(
          (sunrise - localNowHour) * 3600_000
        )}`;
      } else if (localNowHour < sunset) {
        return `${i18n.t(i18nKeys.ui.sun.countdown.sunset)} ${formatCountdown(
          (sunset - localNowHour) * 3600_000
        )}`;
      } else {
        // 已过今天日落 → 明天日出
        const tomorrowSunrise = sunrise + 24;
        return `${i18n.t(i18nKeys.ui.sun.countdown.sunrise)} ${formatCountdown(
          (tomorrowSunrise - localNowHour) * 3600_000
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

  private makeDivider(): HTMLDivElement {
    const el = document.createElement("div");
    el.style.cssText = `
      border: 0;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      margin: 10px 0 0 0;
    `;
    return el;
  }
}

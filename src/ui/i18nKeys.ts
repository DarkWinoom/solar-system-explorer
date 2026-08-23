/**
 * UI 组件用的 i18n key 集中管理
 *
 * 目的:避免散落在组件代码里的字符串 key 拼写错误 / 改名不同步
 *
 * @contract
 *   - key 必须与 src/i18n/locales/{zh-CN,en-US}.ts 同步
 *   - 改名时:先改这里 + 两个语言包 + 测试
 */
export const i18nKeys = {
  app: {
    title: "app.title",
  },
  ui: {
    timezone: {
      label: "ui.timezone.label",
    },
    time: {
      label: "ui.time.label",
      live: "ui.time.live",
    },
    sun: {
      countdown: {
        label: "ui.sun.countdown.label",
        sunrise: "ui.sun.countdown.sunrise",
        sunset: "ui.sun.countdown.sunset",
        polarDay: "ui.sun.countdown.polarDay",
        polarNight: "ui.sun.countdown.polarNight",
        unknown: "ui.sun.countdown.unknown",
      },
    },
    moon: {
      label: "ui.moon.label",
      phase: {
        newMoon: "ui.moon.phase.newMoon",
        waxingCrescent: "ui.moon.phase.waxingCrescent",
        firstQuarter: "ui.moon.phase.firstQuarter",
        waxingGibbous: "ui.moon.phase.waxingGibbous",
        fullMoon: "ui.moon.phase.fullMoon",
        waningGibbous: "ui.moon.phase.waningGibbous",
        lastQuarter: "ui.moon.phase.lastQuarter",
        waningCrescent: "ui.moon.phase.waningCrescent",
      },
    },
    orbit: {
      label: "ui.orbit.label",
      dayProgress: "ui.orbit.dayProgress",
    },
    viewMode: {
      overview: "ui.viewMode.overview",
      sun: "ui.viewMode.sun",
      earth: "ui.viewMode.earth",
      moon: "ui.viewMode.moon",
    },
    recenter: {
      label: "ui.recenter.label",
    },
    help: {
      drag: "ui.help.drag",
      zoom: "ui.help.zoom",
    },
    locale: {
      zh: "ui.locale.zh",
      en: "ui.locale.en",
    },
  },
} as const;

/** 任意 i18n key 字符串 */
export type UI18nKey = string;

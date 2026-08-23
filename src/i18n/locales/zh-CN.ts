import type { NestedDict } from "../index";

/**
 * 中文（简体）语言包
 *
 * 键命名约定: dot.path.from.root.to.key
 * - app.*: 顶栏 / 全局
 * - ui.*:  UI 组件
 *   - timezone: 时区显示
 *   - time:     时间显示
 *   - sun:      日出日落倒计时
 *   - recenter: 回到默认视角按钮
 *   - help:     操作提示
 *   - locale:   locale 切换按钮标签
 *
 * 阶段 9 落档。
 */
export const zhCN: NestedDict = {
  app: {
    title: "3D 地球模拟器",
  },
  ui: {
    timezone: {
      label: "时区",
    },
    time: {
      label: "时间",
      live: "● 实时",
    },
    sun: {
      countdown: {
        label: "日出日落",
        sunrise: "距日出",
        sunset: "距日落",
        polarDay: "极昼",
        polarNight: "极夜",
        unknown: "待定位",
      },
    },
    moon: {
      label: "月相",
      phase: {
        newMoon: "新月",
        waxingCrescent: "蛾眉月",
        firstQuarter: "上弦月",
        waxingGibbous: "盈凸月",
        fullMoon: "满月",
        waningGibbous: "亏凸月",
        lastQuarter: "下弦月",
        waningCrescent: "残月",
      },
    },
    orbit: {
      label: "公转",
      dayProgress: "第 {day} / {total} 天",
    },
    viewMode: {
      overview: "总览",
      sun: "太阳",
      earth: "地球",
      moon: "月球",
    },
    recenter: {
      label: "回到默认视角",
    },
    help: {
      drag: "拖拽旋转",
      zoom: "滚轮缩放",
    },
    locale: {
      zh: "中文",
      en: "EN",
    },
  },
};

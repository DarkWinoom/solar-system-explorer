import type { NestedDict } from "../index";

/**
 * English (US) locale
 *
 * Key naming: dot.path.from.root.to.key
 * - app.*: top bar / global
 * - ui.*:  UI components
 *   - timezone: timezone display
 *   - time:     time display
 *   - sun:      sunrise/sunset countdown
 *   - recenter: reset view button
 *   - help:     operation hint
 *   - locale:   locale switcher button labels
 *
 * Stage 9.
 */
export const enUS: NestedDict = {
  app: {
    title: "3D Earth Simulator",
  },
  ui: {
    timezone: {
      label: "Timezone",
    },
    time: {
      label: "Time",
      live: "● Live",
    },
    sun: {
      countdown: {
        label: "Sunrise & sunset",
        sunrise: "Sunrise in",
        sunset: "Sunset in",
        polarDay: "Polar day",
        polarNight: "Polar night",
        unknown: "Awaiting location",
      },
    },
    moon: {
      label: "Moon phase",
      phase: {
        newMoon: "New Moon",
        waxingCrescent: "Waxing Crescent",
        firstQuarter: "First Quarter",
        waxingGibbous: "Waxing Gibbous",
        fullMoon: "Full Moon",
        waningGibbous: "Waning Gibbous",
        lastQuarter: "Last Quarter",
        waningCrescent: "Waning Crescent",
      },
    },
    orbit: {
      label: "Orbit",
      dayProgress: "Day {day} / {total}",
    },
    viewMode: {
      overview: "Overview",
      sun: "Sun",
      earth: "Earth",
      moon: "Moon",
    },
    recenter: {
      label: "Reset view",
    },
    help: {
      drag: "Drag to rotate",
      zoom: "Scroll to zoom",
    },
    locale: {
      zh: "中文",
      en: "EN",
    },
  },
};

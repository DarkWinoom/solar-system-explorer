import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { I18n } from "../../src/i18n";
import { enUS } from "../../src/i18n/locales/en-US";
import { zhCN } from "../../src/i18n/locales/zh-CN";

function create() {
  const locale = new I18n();
  locale.registerLocale("en-US", enUS, { label: "English" });
  locale.registerLocale("zh-CN", zhCN, { label: "简体中文" });
  return locale;
}
function keys(object: object, prefix = ""): string[] {
  return Object.entries(object)
    .flatMap(([key, value]) =>
      typeof value === "string"
        ? [`${prefix}${key}`]
        : keys(value, `${prefix}${key}.`),
    )
    .sort();
}
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("extensible language registry", () => {
  it.each([
    ["zh-TW", "zh-CN"],
    ["en-GB", "en-US"],
    ["fr-FR", "en-US"],
  ])("resolves %s to %s", (browser, expected) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([browser]);
    expect(create().init()).toBe(expected);
  });
  it("checks all browser language preferences", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["fr-FR", "zh-HK"]);
    expect(create().init()).toBe("zh-CN");
  });
  it("prioritizes URL override over saved preference and browser", () => {
    localStorage.setItem("orbital.locale", "en-US");
    expect(create().init([], "zh-CN")).toBe("zh-CN");
  });
  it("remembers a manual choice and can return to following the system", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-GB"]);
    const locale = create();
    locale.init();
    locale.setLocale("zh-CN");
    expect(create().init()).toBe("zh-CN");
    locale.followSystem();
    expect(locale.getLocale()).toBe("en-US");
    expect(locale.isFollowingSystem()).toBe(true);
    expect(localStorage.getItem("orbital.locale")).toBeNull();
  });
  it("adds a third language at runtime, updates subscribers and falls back for missing keys", () => {
    const locale = create();
    locale.init();
    const listener = vi.fn();
    locale.subscribe(listener);
    locale.registerLocale(
      "ja-JP",
      { ui: { overview: "太陽系" } },
      { label: "日本語" },
    );
    expect(listener).toHaveBeenCalled();
    expect(locale.getAvailableLocales()).toEqual(["en-US", "zh-CN", "ja-JP"]);
    locale.setLocale("ja-JP");
    expect(locale.t("ui.overview")).toBe("太陽系");
    expect(locale.t("ui.volume")).toBe("Volume");
    expect(locale.getLocaleMetadata("ja-JP").label).toBe("日本語");
    expect(document.documentElement.lang).toBe("ja-JP");
  });
  it("supports direction metadata for future right-to-left languages", () => {
    const locale = create();
    locale.registerLocale("ar", {}, { label: "العربية", dir: "rtl" });
    locale.setLocale("ar");
    expect(document.documentElement.dir).toBe("rtl");
    locale.setLocale("en-US");
    expect(document.documentElement.dir).toBe("ltr");
  });
  it("has matching complete Chinese and English keys", () =>
    expect(keys(zhCN)).toEqual(keys(enUS)));
  it("interpolates parameters, merges registrations, and preserves unknown keys", () => {
    const locale = create();
    locale.setLocale("en-US");
    expect(locale.t("ui.navigate", { name: "Earth" })).toBe("Go to Earth");
    locale.registerLocale("en-US", { test: "{value}" });
    expect(locale.t("test", { value: 14 })).toBe("14");
    expect(locale.t("ui.volume")).toBe("Volume");
    expect(locale.t("missing")).toBe("missing");
  });
  it("ignores unknown selections and removes subscriptions", () => {
    const locale = create();
    const listener = vi.fn();
    const unsubscribe = locale.subscribe(listener);
    locale.setLocale("not-a-language");
    expect(listener).not.toHaveBeenCalled();
    locale.setLocale("zh-CN");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    locale.setLocale("en-US");
    expect(listener).toHaveBeenCalledTimes(1);
  });
  it("works when preference storage is denied", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const locale = create();
    expect(() => locale.setLocale("zh-CN")).not.toThrow();
    expect(locale.getLocale()).toBe("zh-CN");
  });
});

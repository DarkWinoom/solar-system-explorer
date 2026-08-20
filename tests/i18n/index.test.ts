import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { I18n } from "../../src/i18n";

/**
 * I18n 单元测试
 *
 * 覆盖 3 件事(测试细化偏好):
 *   1. t() 翻译正确(基本 / fallback / 缺失 / 参数替换)
 *   2. locale 切换(setLocale / getLocale / subscribe / 持久化)
 *   3. 注册(registerLocale 嵌套 + 平铺 + 合并)
 *  + init() 解析策略(localStorage > navigator > 主语言降级 > default)
 */
describe("I18n", () => {
  let i18n: I18n;

  beforeEach(() => {
    i18n = new I18n();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- t() ----
  describe("t()", () => {
    it("returns translated string for known key", () => {
      i18n.registerLocale("zh-CN", { app: { title: "3D 地球" } });
      i18n.setLocale("zh-CN");
      expect(i18n.t("app.title")).toBe("3D 地球");
    });

    it("falls back to default locale when key missing in current", () => {
      i18n.registerLocale("zh-CN", { app: { title: "3D 地球" } });
      i18n.registerLocale("en-US", { app: { title: "3D Earth" } });
      // 'ui.button' 在 zh-CN 不存在,en-US 也没有,降级失败
      i18n.setLocale("zh-CN");
      expect(i18n.t("ui.button")).toBe("ui.button");
    });

    it("falls back to default locale when key exists there", () => {
      i18n.registerLocale("zh-CN", { app: { title: "3D 地球" } });
      i18n.registerLocale("en-US", {
        app: { title: "3D Earth" },
        ui: { ok: "OK" },
      });
      // zh-CN 没有 ui.ok,降级到 en-US 拿到
      // 但当前 locale 解析依赖 registered 列表,需要先让 en-US 在 init fallback 列表里
      // 手动 setLocale zh-CN,init 不必
      i18n.setLocale("zh-CN");
      expect(i18n.t("ui.ok")).toBe("OK");
    });

    it("returns key when missing in both current and default", () => {
      i18n.registerLocale("en-US", { app: { title: "X" } });
      // default = en-US 已注册,没有 'nonexistent' 键
      expect(i18n.t("nonexistent")).toBe("nonexistent");
    });

    it("replaces {param} placeholders", () => {
      i18n.registerLocale("en-US", { greet: "Hello, {name}! You are {age}." });
      expect(i18n.t("greet", { name: "Alice", age: 30 })).toBe(
        "Hello, Alice! You are 30."
      );
    });

    it("keeps unresolved placeholders when param not provided", () => {
      i18n.registerLocale("en-US", { greet: "Hello, {name}!" });
      expect(i18n.t("greet")).toBe("Hello, {name}!");
    });
  });

  // ---- setLocale + getLocale ----
  describe("setLocale + getLocale", () => {
    beforeEach(() => {
      i18n.registerLocale("zh-CN", { app: { title: "3D 地球" } });
      i18n.registerLocale("en-US", { app: { title: "3D Earth" } });
    });

    it("switches active locale", () => {
      i18n.setLocale("zh-CN");
      expect(i18n.getLocale()).toBe("zh-CN");
      i18n.setLocale("en-US");
      expect(i18n.getLocale()).toBe("en-US");
    });

    it("does NOT persist to localStorage (项目规则: 不持久化)", () => {
      i18n.setLocale("zh-CN");
      expect(localStorage.getItem("locale")).toBeNull();
    });

    it("warns and ignores unknown locale", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      i18n.setLocale("fr-FR");
      expect(warn).toHaveBeenCalled();
      // current 仍是 default (en-US,因为 zh-CN setLocale 没被调用)
      // 实际上 current 仍是初始 DEFAULT_LOCALE 'en-US'(因为 init 没调过)
      expect(i18n.getLocale()).toBe("en-US");
    });
  });

  // ---- subscribe ----
  describe("subscribe", () => {
    beforeEach(() => {
      i18n.registerLocale("zh-CN", { app: { title: "X" } });
      i18n.registerLocale("en-US", { app: { title: "Y" } });
    });

    it("notifies on locale change", () => {
      const fn = vi.fn();
      i18n.subscribe(fn);
      i18n.setLocale("zh-CN");
      expect(fn).toHaveBeenCalledWith("zh-CN");
      i18n.setLocale("en-US");
      expect(fn).toHaveBeenCalledWith("en-US");
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it("returns unsubscribe function", () => {
      const fn = vi.fn();
      const unsub = i18n.subscribe(fn);
      unsub();
      i18n.setLocale("zh-CN");
      expect(fn).not.toHaveBeenCalled();
    });
  });

  // ---- registerLocale ----
  describe("registerLocale", () => {
    it("registers a new locale from nested dict", () => {
      i18n.registerLocale("zh-CN", { app: { title: "3D 地球" } });
      i18n.setLocale("zh-CN");
      expect(i18n.t("app.title")).toBe("3D 地球");
    });

    it("registers a new locale from flat dict", () => {
      i18n.registerLocale("zh-CN", { "app.title": "3D 地球" });
      i18n.setLocale("zh-CN");
      expect(i18n.t("app.title")).toBe("3D 地球");
    });

    it("merges on re-register (later overrides earlier)", () => {
      i18n.registerLocale("zh-CN", { a: "1", b: "2" });
      i18n.registerLocale("zh-CN", { b: "overridden", c: "3" });
      i18n.setLocale("zh-CN");
      expect(i18n.t("a")).toBe("1");
      expect(i18n.t("b")).toBe("overridden");
      expect(i18n.t("c")).toBe("3");
    });
  });

  // ---- init() ----
  describe("init()", () => {
    it("uses navigator.language on every call (no localStorage)", () => {
      vi.stubGlobal("navigator", { language: "zh-CN" });
      i18n.registerLocale("zh-CN", {});
      i18n.registerLocale("en-US", {});
      i18n.init(["zh-CN", "en-US"]);
      expect(i18n.getLocale()).toBe("zh-CN");
    });

    it("downgrades by main language (zh-TW → zh-CN)", () => {
      vi.stubGlobal("navigator", { language: "zh-TW" });
      i18n.registerLocale("zh-CN", {});
      i18n.registerLocale("en-US", {});
      i18n.init(["zh-CN", "en-US"]);
      expect(i18n.getLocale()).toBe("zh-CN");
    });

    it("falls back to default locale when no match", () => {
      vi.stubGlobal("navigator", { language: "fr-FR" });
      i18n.registerLocale("zh-CN", {});
      i18n.registerLocale("en-US", {});
      i18n.init(["zh-CN", "en-US"]);
      expect(i18n.getLocale()).toBe("en-US");
    });

    it("does NOT read localStorage (项目规则: 不持久化)", () => {
      localStorage.setItem("locale", "zh-CN");
      vi.stubGlobal("navigator", { language: "en-US" });
      i18n.registerLocale("zh-CN", {});
      i18n.registerLocale("en-US", {});
      i18n.init(["zh-CN", "en-US"]);
      // navigator en-US 胜出,localStorage zh-CN 被忽略
      expect(i18n.getLocale()).toBe("en-US");
    });

    it("updates document.documentElement.lang", () => {
      vi.stubGlobal("navigator", { language: "zh-CN" });
      i18n.registerLocale("zh-CN", {});
      i18n.registerLocale("en-US", {});
      i18n.init(["zh-CN", "en-US"]);
      expect(document.documentElement.lang).toBe("zh-CN");
    });

    // ---- init() with override (URL ?lan=xx) ----
    it("uses override if provided, ignoring navigator.language", () => {
      vi.stubGlobal("navigator", { language: "fr-FR" });
      i18n.registerLocale("zh-CN", {});
      i18n.registerLocale("en-US", {});
      i18n.init(["zh-CN", "en-US"], "zh-CN");
      expect(i18n.getLocale()).toBe("zh-CN");
    });

    it("override takes priority over navigator.language (URL > region)", () => {
      vi.stubGlobal("navigator", { language: "fr-FR" });
      i18n.registerLocale("zh-CN", {});
      i18n.registerLocale("en-US", {});
      i18n.init(["zh-CN", "en-US"], "en-US");
      expect(i18n.getLocale()).toBe("en-US");
    });

    it("override does NOT persist to localStorage (项目规则: 不持久化)", () => {
      vi.stubGlobal("navigator", { language: "fr-FR" });
      i18n.registerLocale("zh-CN", {});
      i18n.registerLocale("en-US", {});
      i18n.init(["zh-CN", "en-US"], "zh-CN");
      expect(localStorage.getItem("locale")).toBeNull();
    });
  });

  // ---- getAvailableLocales ----
  describe("getAvailableLocales", () => {
    it("lists all registered locales in registration order", () => {
      i18n.registerLocale("zh-CN", {});
      i18n.registerLocale("en-US", {});
      i18n.registerLocale("ja-JP", {});
      expect(i18n.getAvailableLocales()).toEqual(["zh-CN", "en-US", "ja-JP"]);
    });

    it("returns empty array when nothing registered", () => {
      expect(i18n.getAvailableLocales()).toEqual([]);
    });
  });

  // ---- hasLocale ----
  describe("hasLocale", () => {
    it("returns true for registered locales", () => {
      i18n.registerLocale("zh-CN", {});
      expect(i18n.hasLocale("zh-CN")).toBe(true);
    });

    it("returns false for unregistered locales", () => {
      i18n.registerLocale("zh-CN", {});
      expect(i18n.hasLocale("fr-FR")).toBe(false);
    });
  });
});

/**
 * i18n 框架（轻量自实现）
 *
 * API 表面：
 *   t(key, params?)             — 取翻译
 *   setLocale(code)             — 切换 + 持久化 + 通知
 *   getLocale()                 — 当前 locale
 *   registerLocale(code, dict)  — 注册/合并语言包（支持第三方扩展）
 *   subscribe(fn)               — 订阅 locale 变化,返回 unsubscribe
 *   getAvailableLocales()       — 已注册列表
 *   init(fallback?)             — 一次性解析 localStorage > navigator > DEFAULT
 *
 * 设计原则：
 *   - 嵌套 dict 自动拍平为 dot-key({a:{b:'x'}} → {'a.b':'x'})
 *   - 缺失键降级到 DEFAULT_LOCALE,再缺失返回 key(便于排查)
 *   - 切换 locale 时自动更新 <html lang="..."> + localStorage 'locale'
 *
 * @contract
 *   - `i18n` 单例全局唯一
 *   - registerLocale 可在 init() 之前或之后调用(之后调用需手动 setLocale 激活)
 *   - 订阅函数抛错不影响其他订阅者(无 try/catch,让用户自己处理)
 */

export type LocaleCode = string;
export type Dict = Record<string, string>;
export type NestedDict = { [key: string]: string | NestedDict };

const DEFAULT_LOCALE: LocaleCode = "en-US";
/** 模板参数正则:匹配 {name} 形式 */
const PARAM_RE = /\{(\w+)\}/g;

/**
 * 把嵌套 dict 拍平成 dot-key 形式
 * { a: { b: 'x' } } → { 'a.b': 'x' }
 * { a: { b: { c: 'y' } } } → { 'a.b.c': 'y' }
 */
function flatten(input: NestedDict, prefix = ""): Dict {
  const out: Dict = {};
  for (const [k, v] of Object.entries(input)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") {
      out[key] = v;
    } else if (v !== null && typeof v === "object") {
      Object.assign(out, flatten(v, key));
    }
  }
  return out;
}

export class I18n {
  private locales = new Map<LocaleCode, Dict>();
  private listeners = new Set<(locale: LocaleCode) => void>();
  private current: LocaleCode = DEFAULT_LOCALE;
  private initialized = false;

  /**
   * 初始化(应用启动时调用一次)
   * 解析顺序: override (URL ?lan=) > navigator.language > DEFAULT_LOCALE
   *
   * 注意:本项目不持久化 locale(用户要求"暂时不需要持久化语言"),
   * 每次访问都重新读 navigator.language——保留用户每次访问的"区域自动识别"行为。
   *
   * @param fallback 已注册 locale 列表(供主语言降级匹配,如 zh-TW → zh-CN)
   * @param override 强制覆盖(如 URL ?lan=zh-CN),生效但不持久化
   * @returns 解析后的 locale code
   */
  init(fallback: LocaleCode[] = [], override?: LocaleCode): LocaleCode {
    if (this.initialized) return this.current;
    this.initialized = true;
    // 优先级: override > browser > DEFAULT
    const candidate = override ?? this.readBrowser() ?? DEFAULT_LOCALE;
    const resolved = this.resolve(candidate, fallback);
    this.current = resolved;
    this.applyDom(resolved);
    return resolved;
  }

  /**
   * 取翻译
   * @param key 翻译键(支持 dot 路径,内部用 flatten 处理)
   * @param params 模板参数(替换 {name} 形式)
   * @returns 翻译文本;key 缺失时降级到 DEFAULT_LOCALE,再缺失返回 key 本身
   */
  t(key: string, params?: Record<string, string | number>): string {
    const dict = this.locales.get(this.current);
    let text = dict?.[key];
    if (text === undefined && this.current !== DEFAULT_LOCALE) {
      text = this.locales.get(DEFAULT_LOCALE)?.[key];
    }
    if (text === undefined) return key;
    if (params) {
      text = text.replace(PARAM_RE, (_match, name: string) =>
        params[name] !== undefined ? String(params[name]) : `{${name}}`
      );
    }
    return text;
  }

  /**
   * 切换 locale(通知订阅者 + 更新 <html lang>)
   * - 不持久化(本项目规则:setLocale 是临时切换,刷新后由 navigator 重新解析)
   * - 未注册的 locale 会 warn 并忽略
   */
  setLocale(code: LocaleCode): void {
    if (!this.locales.has(code)) {
      console.warn(`[i18n] locale not registered: ${code}`);
      return;
    }
    this.current = code;
    this.applyDom(code);
    // Set copy avoids mutation during iteration if listener calls setLocale
    for (const fn of Array.from(this.listeners)) {
      try {
        fn(code);
      } catch (err) {
        console.error("[i18n] subscriber threw", err);
      }
    }
  }

  /** 当前 locale */
  getLocale(): LocaleCode {
    return this.current;
  }

  /**
   * 注册/合并语言包
   * - 接受嵌套或平铺 dict(嵌套会自动 flatten)
   * - 重复注册同一 code 会合并(后者覆盖前者)
   */
  registerLocale(code: LocaleCode, dict: NestedDict | Dict): void {
    const isNested = Object.values(dict).some(
      (v) => v !== null && typeof v === "object"
    );
    const flat = isNested ? flatten(dict as NestedDict) : (dict as Dict);
    const existing = this.locales.get(code) ?? {};
    this.locales.set(code, { ...existing, ...flat });
  }

  /**
   * 订阅 locale 变化
   * @returns unsubscribe 函数
   */
  subscribe(fn: (locale: LocaleCode) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** 已注册 locale 列表(按注册顺序) */
  getAvailableLocales(): LocaleCode[] {
    return Array.from(this.locales.keys());
  }

  /** 检查 locale 是否已注册(给 buildLocale 之类需要校验外部输入的场景用) */
  hasLocale(code: LocaleCode): boolean {
    return this.locales.has(code);
  }

  // ---- 私有 ----

  private readBrowser(): LocaleCode | null {
    if (typeof navigator === "undefined") return null;
    return navigator.language ?? null;
  }

  /**
   * 解析策略:
   *   1. 精确匹配
   *   2. 主语言降级(zh-TW → zh-CN if available,en-GB → en-US if available)
   *   3. DEFAULT_LOCALE
   */
  private resolve(candidate: LocaleCode, fallback: LocaleCode[]): LocaleCode {
    if (this.locales.has(candidate)) return candidate;
    const main = candidate.split("-")[0];
    const matched = fallback.find((c) => c.startsWith(main + "-"));
    if (matched && this.locales.has(matched)) return matched;
    return DEFAULT_LOCALE;
  }

  private applyDom(code: LocaleCode): void {
    if (typeof document !== "undefined") {
      document.documentElement.lang = code;
    }
  }
}

/** 全局单例 — 业务代码 import { i18n } from "..." 即可 */
export const i18n = new I18n();

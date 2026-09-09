import { readPreference, savePreference } from "../utils/storage";

export type LocaleCode = string;
export type Dict = Record<string, string>;
export type NestedDict = { [key: string]: string | NestedDict };
export interface LocaleMetadata {
  label: string;
  dir?: "ltr" | "rtl";
}
const DEFAULT = "en-US";

function flatten(input: NestedDict, prefix = ""): Dict {
  const result: Dict = {};
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result[path] = value;
    else Object.assign(result, flatten(value, path));
  }
  return result;
}

export class I18n {
  private readonly locales = new Map<string, Dict>();
  private readonly metadata = new Map<string, LocaleMetadata>();
  private readonly listeners = new Set<(code: string) => void>();
  private current = DEFAULT;
  private initialized = false;
  private system = !readPreference("locale");

  registerLocale(
    code: string,
    dict: NestedDict | Dict,
    metadata?: LocaleMetadata,
  ): void {
    this.locales.set(code, { ...this.locales.get(code), ...flatten(dict) });
    this.metadata.set(
      code,
      metadata ?? this.metadata.get(code) ?? { label: code },
    );
    if (this.initialized) this.notify();
  }

  init(_fallback: string[] = [], override?: string): string {
    if (this.initialized) return this.current;
    this.initialized = true;
    const saved = readPreference("locale");
    this.system = !saved && !override;
    this.current = this.resolve(
      override ? [override] : saved ? [saved] : this.browserLanguages(),
    );
    this.applyDom();
    return this.current;
  }

  t(key: string, params?: Record<string, string | number>): string {
    const value =
      this.locales.get(this.current)?.[key] ??
      this.locales.get(DEFAULT)?.[key] ??
      key;
    return params
      ? value.replace(/\{(\w+)\}/g, (match, name: string) =>
          String(params[name] ?? match),
        )
      : value;
  }

  setLocale(code: string): void {
    if (!this.locales.has(code)) return;
    this.current = code;
    this.system = false;
    savePreference("locale", code);
    this.applyDom();
    this.notify();
  }

  followSystem(): void {
    this.system = true;
    savePreference("locale", null);
    this.current = this.resolve(this.browserLanguages());
    this.applyDom();
    this.notify();
  }

  refreshSystem(): void {
    if (this.system) this.followSystem();
  }
  isFollowingSystem(): boolean {
    return this.system;
  }
  getLocale(): string {
    return this.current;
  }
  getAvailableLocales(): string[] {
    return [...this.locales.keys()];
  }
  getLocaleMetadata(code: string): LocaleMetadata {
    return this.metadata.get(code) ?? { label: code };
  }
  hasLocale(code: string): boolean {
    return this.locales.has(code);
  }
  subscribe(listener: (code: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private browserLanguages(): readonly string[] {
    return navigator.languages?.length
      ? navigator.languages
      : [navigator.language || DEFAULT];
  }
  private resolve(candidates: readonly string[]): string {
    for (const candidate of candidates) {
      const exact = [...this.locales.keys()].find(
        (code) => code.toLowerCase() === candidate.toLowerCase(),
      );
      if (exact) return exact;
      const main = candidate.split("-")[0].toLowerCase();
      const match = [...this.locales.keys()].find(
        (code) => code.split("-")[0].toLowerCase() === main,
      );
      if (match) return match;
    }
    return DEFAULT;
  }
  private applyDom(): void {
    document.documentElement.lang = this.current;
    document.documentElement.dir =
      this.getLocaleMetadata(this.current).dir ?? "ltr";
  }
  private notify(): void {
    for (const listener of [...this.listeners]) listener(this.current);
  }
}
export const i18n = new I18n();

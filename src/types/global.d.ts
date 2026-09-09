import type { I18n } from "../i18n";

declare global {
  interface Window {
    appI18n: I18n;
  }
}
export {};

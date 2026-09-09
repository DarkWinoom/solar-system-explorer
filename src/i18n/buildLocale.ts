import { i18n } from "./index";
import { enUS } from "./locales/en-US";
import { zhCN } from "./locales/zh-CN";

export function buildLocale() {
  i18n.registerLocale("en-US", enUS, { label: "English" });
  i18n.registerLocale("zh-CN", zhCN, { label: "简体中文" });
  const requested = new URLSearchParams(location.search).get("lan");
  i18n.init([], requested && i18n.hasLocale(requested) ? requested : undefined);
  window.appI18n = i18n;
  return i18n;
}

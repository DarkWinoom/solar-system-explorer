import { i18n, type I18n } from "./index";
import { zhCN } from "./locales/zh-CN";
import { enUS } from "./locales/en-US";

/**
 * 应用启动时调用一次:
 *   1. 注册内置语言包(zh-CN / en-US)
 *   2. 解析当前 locale(优先级: URL ?lan= > navigator.language > en-US)
 *      项目规则:不持久化——每次访问都重新读 navigator,保留"区域自动识别"
 *   3. 挂到 window.appI18n(供其他地方 / 第三方扩展 / devtools 用)
 *
 * URL 参数示例:
 *   ?lan=zh-CN     → 强制中文(无视 navigator 区域,命中不持久化)
 *   ?lan=en-US     → 强制英文
 *   ?lan=invalid   → 忽略,走 navigator.language
 *   (无参数)       → 走 navigator.language > en-US
 *
 * 调用时机:必须在任何 DOM 文本组件挂载前(按"i18n 早期接入"纪律)
 *
 * @returns i18n 单例(方便 caller 链式调用或测试断言)
 */
export function buildLocale(): I18n {
  i18n.registerLocale("zh-CN", zhCN);
  i18n.registerLocale("en-US", enUS);

  // URL 参数 ?lan=xx(无视 navigator 区域;命中不持久化)
  const urlLan = readUrlLan();
  const override = urlLan && i18n.hasLocale(urlLan) ? urlLan : undefined;

  i18n.init(["zh-CN", "en-US"], override);

  // 暴露到 window(供 console / 第三方扩展使用)
  if (typeof window !== "undefined") {
    (window as unknown as { appI18n: I18n }).appI18n = i18n;
  }

  return i18n;
}

/**
 * 读取 URL ?lan= 参数
 * - 仅在浏览器环境有效(Node SSR / unit test 无 window 时返回 null)
 * - 解析失败(URLSearchParams 抛错)也返回 null
 */
function readUrlLan(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get("lan");
  } catch {
    return null;
  }
}

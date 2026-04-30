/**
 * 文件：backend/src/shared/i18n/locale.context.ts
 * 功能：使用 AsyncLocalStorage 在请求作用域内持有当前 locale，避免在每个 service 层显式传参。
 * 交互：locale.middleware.ts 写入；i18n.service.ts、export.service.ts 等读取。
 * 作者：吴川
 */
import { AsyncLocalStorage } from 'async_hooks';

export type SupportedLocale = 'zh-CN' | 'en' | 'id-ID';
export const SUPPORTED_LOCALES: SupportedLocale[] = ['zh-CN', 'en', 'id-ID'];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

interface LocaleStore {
  locale: SupportedLocale;
}

const storage = new AsyncLocalStorage<LocaleStore>();

export const LocaleContext = {
  run<T>(locale: SupportedLocale, callback: () => T): T {
    return storage.run({ locale }, callback);
  },
  current(): SupportedLocale {
    return storage.getStore()?.locale ?? DEFAULT_LOCALE;
  },
};

/** 把任意 locale 字符串规范成受支持的 SupportedLocale，未知归一到默认。 */
export function normalizeLocale(value?: string | null): SupportedLocale {
  if (!value) return DEFAULT_LOCALE;
  const v = value.replace('_', '-').toLowerCase();
  if (v === 'id' || v.startsWith('id-')) return 'id-ID';
  if (v === 'en' || v.startsWith('en-')) return 'en';
  if (v === 'zh' || v.startsWith('zh-')) return 'zh-CN';
  return DEFAULT_LOCALE;
}

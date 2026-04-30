/**
 * 文件：frontend/src/i18n/index.ts
 * 功能：初始化多语言资源并根据本地偏好设置当前语言。
 * 交互：被 main.ts 注册；供各 Vue 页面通过 useI18n() 获取文案。
 * 作者：吴川
 */
import { createI18n } from 'vue-i18n';
import zhCN from './zh-CN.json';
import en from './en.json';
import idID from './id-ID.json';

export const LOCALE_STORAGE_KEY = 'locale';
export const supportedLocales = ['id-ID', 'en', 'zh-CN'] as const;
export type SupportedLocale = typeof supportedLocales[number];

export function normalizeLocale(value?: string | null): SupportedLocale | '' {
  if (!value) return '';
  const normalized = value.replace('_', '-').toLowerCase();
  if (normalized === 'id' || normalized === 'id-id' || normalized.startsWith('id-')) return 'id-ID';
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  if (normalized === 'zh' || normalized.startsWith('zh-')) return 'zh-CN';
  return '';
}

export function resolveInitialLocale(): SupportedLocale {
  const cached = normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  if (cached) return cached;

  const systemLocales = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const systemLocale of systemLocales) {
    const matched = normalizeLocale(systemLocale);
    if (matched) return matched;
  }
  return 'en';
}

export const i18n = createI18n({
  legacy: false,
  locale: resolveInitialLocale(),
  fallbackLocale: 'en',
  messages: { 'zh-CN': zhCN, en, 'id-ID': idID },
});

export function setAppLocale(locale: SupportedLocale) {
  i18n.global.locale.value = locale;
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  document.documentElement.lang = locale;
  document.title = i18n.global.t('app.title');
  window.dispatchEvent(new CustomEvent('bidflow:locale-changed', { detail: { locale } }));
}

document.documentElement.lang = i18n.global.locale.value;
document.title = i18n.global.t('app.title');

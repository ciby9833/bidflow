/**
 * 文件：backend/src/shared/i18n/i18n.service.ts
 * 功能：加载 zh-CN/en/id-ID 词条 JSON，提供按 key 路径取文案的能力，支持 {param} 占位符。
 * 交互：被 i18n.exception.filter.ts、export.service.ts 调用；locale 来自 LocaleContext。
 * 作者：吴川
 */
import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  DEFAULT_LOCALE, LocaleContext, SUPPORTED_LOCALES, SupportedLocale,
} from './locale.context';

type Dict = Record<string, unknown>;

@Injectable()
export class I18nService {
  private readonly logger = new Logger(I18nService.name);
  private readonly dicts = new Map<SupportedLocale, Dict>();

  constructor() {
    for (const locale of SUPPORTED_LOCALES) {
      try {
        const file = path.join(__dirname, 'locales', `${locale}.json`);
        const raw = fs.readFileSync(file, 'utf-8');
        this.dicts.set(locale, JSON.parse(raw));
      } catch (err) {
        this.logger.warn(`Failed to load locale ${locale}: ${(err as Error).message}`);
        this.dicts.set(locale, {});
      }
    }
  }

  /** 翻译指定 key；locale 缺省时取请求作用域。找不到时回退到默认 locale，仍找不到则返回 key 本身。 */
  t(key: string, params?: Record<string, unknown>, locale?: SupportedLocale): string {
    const target = locale ?? LocaleContext.current();
    const value = this.lookup(target, key) ?? this.lookup(DEFAULT_LOCALE, key);
    if (value === undefined) return key;
    return this.interpolate(String(value), params);
  }

  private lookup(locale: SupportedLocale, key: string): unknown {
    const dict = this.dicts.get(locale);
    if (!dict) return undefined;
    return key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object') return (acc as Dict)[part];
      return undefined;
    }, dict);
  }

  private interpolate(text: string, params?: Record<string, unknown>): string {
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (_, name) => {
      const v = params[name];
      return v === undefined || v === null ? `{${name}}` : String(v);
    });
  }

  /** 当前请求 locale，便于服务层做 locale 相关排序/格式化。 */
  currentLocale(): SupportedLocale {
    return LocaleContext.current();
  }
}

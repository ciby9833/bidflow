/**
 * 文件：backend/src/shared/i18n/locale.middleware.ts
 * 功能：从请求 header 解析 locale（优先 X-Locale，其次 Accept-Language），写入 LocaleContext。
 * 交互：在 app.module.ts 注册到 '*' 全路径；后续所有 service 通过 LocaleContext / I18nService 读取。
 * 作者：吴川
 */
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LocaleContext, normalizeLocale } from './locale.context';

@Injectable()
export class LocaleMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const explicit = req.headers['x-locale'];
    const accept = req.headers['accept-language'];
    const raw = (Array.isArray(explicit) ? explicit[0] : explicit)
      ?? (typeof accept === 'string' ? accept.split(',')[0] : undefined);
    const locale = normalizeLocale(raw);
    LocaleContext.run(locale, () => next());
  }
}

/**
 * 文件：backend/src/shared/i18n/i18n.exception.filter.ts
 * 功能：全局异常过滤器，把 service 层抛出的 message_key（如 'error.tender.not_found'）翻译成当前 locale 的 message，并按 ApiResponse 结构返回。
 * 交互：在 main.ts 通过 useGlobalFilters 注册；与 response.dto.ts 的 ApiResponse 形状保持一致。
 * 作者：吴川
 */
import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { I18nService } from './i18n.service';

@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(I18nExceptionFilter.name);
  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let messageKey = 'error.internal';
    let code = 'INTERNAL';
    let detail: Record<string, unknown> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const raw = typeof body === 'string'
        ? body
        : (body as { message?: string | string[] }).message;
      const text = Array.isArray(raw) ? raw[0] : raw;
      if (text && /^error\./.test(text)) messageKey = text;
      else if (text) { messageKey = text; }
      code = exception.constructor.name.replace(/Exception$/, '').toUpperCase();
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    const message = this.i18n.t(messageKey);
    res.status(status).json({
      success: false,
      data: null,
      error: {
        code,
        message_key: messageKey,
        message,
        detail,
      },
    });
  }
}

/**
 * 文件：backend/src/shared/i18n/i18n.module.ts
 * 功能：将 I18nService 暴露为全局 provider，避免在每个业务模块重复 imports。
 * 交互：在 app.module.ts imports；I18nService 可被任意 module 直接注入。
 * 作者：吴川
 */
import { Global, Module } from '@nestjs/common';
import { I18nService } from './i18n.service';
import { I18nExceptionFilter } from './i18n.exception.filter';

@Global()
@Module({
  providers: [I18nService, I18nExceptionFilter],
  exports: [I18nService, I18nExceptionFilter],
})
export class I18nModule {}

/**
 * 文件：backend/src/shared/mail/mail.module.ts
 * 功能：导出共享邮件服务，供各业务模块按需引入。
 * 交互：AuthModule 引入后用于发送注册验证码；后续通知模块可复用同一服务。
 * 作者：吴川
 */
import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

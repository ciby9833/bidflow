/**
 * 文件：backend/src/shared/config/mail.config.ts
 * 功能：集中定义邮件发送配置，供认证、通知、邀请等业务复用。
 * 交互：由 app.module.ts 的 ConfigModule 加载；被 mail.service.ts 读取并创建发送通道。
 * 作者：吴川
 */
import { registerAs } from '@nestjs/config';

export interface MailTransportConfig {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

export interface MailConfig {
  default: MailTransportConfig;
}

export default registerAs('mail', (): MailConfig => ({
  default: {
    host: process.env.SMTP_HOST || undefined,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT || 587) === 465,
    user: process.env.SMTP_USER || undefined,
    pass: process.env.SMTP_PASS || undefined,
    from: process.env.SMTP_FROM || 'noreply@bidflow.local',
  },
}));

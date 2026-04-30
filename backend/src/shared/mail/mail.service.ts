/**
 * 文件：backend/src/shared/mail/mail.service.ts
 * 功能：封装邮件发送能力，统一读取邮件配置并管理 nodemailer transport。
 * 交互：被 auth.service.ts 等业务服务调用；配置来源为 shared/config/mail.config.ts。
 * 作者：吴川
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailConfig, MailTransportConfig } from '../config/mail.config';

export interface SendMailInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  attachments?: nodemailer.SendMailOptions['attachments'];
}

@Injectable()
export class MailService {
  private readonly transporters = new Map<string, nodemailer.Transporter>();

  constructor(private readonly config: ConfigService) {}

  getConfig(profile = 'default'): MailTransportConfig {
    const mail = this.config.get<MailConfig>('mail');
    const selected = mail?.[profile as keyof MailConfig];
    if (!selected) {
      throw new Error(`Mail profile "${profile}" is not configured`);
    }
    return selected;
  }

  async send(input: SendMailInput, profile = 'default') {
    const mailConfig = this.getConfig(profile);
    const transporter = this.getTransporter(profile, mailConfig);
    return transporter.sendMail({
      from: input.from ?? mailConfig.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments,
    });
  }

  private getTransporter(profile: string, mailConfig: MailTransportConfig) {
    const cached = this.transporters.get(profile);
    if (cached) return cached;

    const transporter = mailConfig.host
      ? nodemailer.createTransport({
        host: mailConfig.host,
        port: mailConfig.port,
        secure: mailConfig.secure,
        auth: mailConfig.user
          ? {
            user: mailConfig.user,
            pass: mailConfig.pass,
          }
          : undefined,
      })
      : nodemailer.createTransport({ streamTransport: true, newline: 'unix' });

    this.transporters.set(profile, transporter);
    return transporter;
  }
}

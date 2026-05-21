/**
 * 文件：backend/src/shared/mail/templates/tender-invitation.template.ts
 * 功能：生成「定向招标邀请」通知邮件的主题、纯文本与 HTML，支持 zh-CN / en / id-ID 三语。
 * 交互：由 tender.service.ts 在招标发布时调用后交给 MailService 发送给被邀供应商的关联用户。
 * 作者：吴川
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { SendMailInput } from '../mail.service';

const LOGO_CID = 'bidflow-jnt-logo';

type Locale = 'zh-CN' | 'en' | 'id-ID';

export interface TenderInvitationEmailInput {
  to: string;
  locale?: string;
  supplierName?: string;
  tenderNo: string;
  tenderTitle: string;
  bidDeadline?: Date | string | null;
  portalUrl?: string;
  productName?: string;
}

const STRINGS: Record<Locale, {
  subject: (t: string) => string;
  greeting: (name: string) => string;
  intro: (product: string) => string;
  labelTenderNo: string;
  labelTenderTitle: string;
  labelDeadline: string;
  noDeadline: string;
  cta: string;
  footer: string;
}> = {
  'zh-CN': {
    subject: (t) => `【J&T Cargo 招标邀请】${t}`,
    greeting: (name) => `${name} 您好：`,
    intro: (product) => `您已被邀请参与 ${product} 上的一个新招标项目，详情如下：`,
    labelTenderNo: '招标编号',
    labelTenderTitle: '招标名称',
    labelDeadline: '报价截止时间',
    noDeadline: '发布后立即开始，以系统公告为准',
    cta: '登录查看并报价',
    footer: '如果您未参与该招标业务，请忽略此邮件。',
  },
  en: {
    subject: (t) => `[J&T Cargo Tender Invitation] ${t}`,
    greeting: (name) => `Dear ${name},`,
    intro: (product) => `You have been invited to a new tender on ${product}. Details below:`,
    labelTenderNo: 'Tender No.',
    labelTenderTitle: 'Tender Title',
    labelDeadline: 'Bid Deadline',
    noDeadline: 'Starts right after publishing — see system notice',
    cta: 'Sign in to view & bid',
    footer: 'If this tender is not relevant to you, please ignore this email.',
  },
  'id-ID': {
    subject: (t) => `[J&T Cargo Undangan Tender] ${t}`,
    greeting: (name) => `Yth. ${name},`,
    intro: (product) => `Anda diundang untuk mengikuti tender baru di ${product}. Rincian di bawah ini:`,
    labelTenderNo: 'No. Tender',
    labelTenderTitle: 'Judul Tender',
    labelDeadline: 'Tenggat Penawaran',
    noDeadline: 'Dimulai segera setelah dipublikasikan — lihat pengumuman sistem',
    cta: 'Masuk untuk melihat & menawar',
    footer: 'Jika tender ini tidak relevan bagi Anda, abaikan email ini.',
  },
};

function normalizeLocale(value?: string): Locale {
  if (!value) return 'en';
  const v = value.replace('_', '-').toLowerCase();
  if (v === 'id' || v.startsWith('id-')) return 'id-ID';
  if (v === 'zh' || v.startsWith('zh-')) return 'zh-CN';
  return 'en';
}

function formatDeadline(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const dt = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export function buildTenderInvitationEmail(input: TenderInvitationEmailInput): SendMailInput {
  const productName = input.productName ?? 'BidFlow';
  const locale = normalizeLocale(input.locale);
  const s = STRINGS[locale];
  const supplierName = input.supplierName?.trim() || (locale === 'zh-CN' ? '供应商' : 'Supplier');
  const deadline = formatDeadline(input.bidDeadline) ?? s.noDeadline;
  const logoPath = resolve(process.cwd(), 'src/public/jnt-Logo.png');
  const subject = s.subject(input.tenderTitle);

  const text = [
    s.greeting(supplierName),
    '',
    s.intro(productName),
    '',
    `${s.labelTenderNo}: ${input.tenderNo}`,
    `${s.labelTenderTitle}: ${input.tenderTitle}`,
    `${s.labelDeadline}: ${deadline}`,
    '',
    input.portalUrl ? `${s.cta}: ${input.portalUrl}` : '',
    '',
    s.footer,
  ].filter((line) => line !== undefined).join('\n');

  return {
    to: input.to,
    subject,
    text,
    html: buildHtml({
      productName,
      strings: s,
      supplierName,
      tenderNo: input.tenderNo,
      tenderTitle: input.tenderTitle,
      deadline,
      portalUrl: input.portalUrl,
      hasLogo: existsSync(logoPath),
    }),
    attachments: existsSync(logoPath)
      ? [{ filename: 'jnt-Logo.png', path: logoPath, cid: LOGO_CID }]
      : undefined,
  };
}

function buildHtml(input: {
  productName: string;
  strings: (typeof STRINGS)[Locale];
  supplierName: string;
  tenderNo: string;
  tenderTitle: string;
  deadline: string;
  portalUrl?: string;
  hasLogo: boolean;
}) {
  const { strings: s } = input;
  const logo = input.hasLogo
    ? `<img src="cid:${LOGO_CID}" width="160" alt="${input.productName}" style="display:block;border:0;width:160px;height:auto;margin:0 auto;" />`
    : `<div style="font-size:28px;line-height:36px;font-weight:700;color:#111827;">${input.productName}</div>`;

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:10px 16px;font-size:13px;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;white-space:nowrap;">${label}</td>
      <td style="padding:10px 16px;font-size:14px;color:#0f172a;font-weight:600;border:1px solid #e2e8f0;">${value}</td>
    </tr>`;

  const cta = input.portalUrl
    ? `<tr><td align="center" style="padding:32px 0 0;">
         <a href="${input.portalUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">${s.cta}</a>
       </td></tr>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${s.subject(input.tenderTitle)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;color:#0f172a;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f1f5f9;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr><td style="padding:40px 32px 24px;text-align:center;">${logo}</td></tr>
            <tr><td style="padding:0 32px 8px;font-size:16px;font-weight:600;color:#0f172a;">${s.greeting(input.supplierName)}</td></tr>
            <tr><td style="padding:0 32px 24px;font-size:14px;line-height:22px;color:#475569;">${s.intro(input.productName)}</td></tr>
            <tr><td style="padding:0 32px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                ${row(s.labelTenderNo, input.tenderNo)}
                ${row(s.labelTenderTitle, input.tenderTitle)}
                ${row(s.labelDeadline, input.deadline)}
              </table>
            </td></tr>
            ${cta}
            <tr><td style="padding:32px 32px 16px;font-size:12px;line-height:20px;color:#94a3b8;">${s.footer}</td></tr>
            <tr><td style="padding:0 32px 32px;font-size:12px;color:#cbd5e1;">© ${input.productName}</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

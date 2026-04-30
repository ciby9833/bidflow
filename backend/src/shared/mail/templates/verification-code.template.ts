/**
 * 文件：backend/src/shared/mail/templates/verification-code.template.ts
 * 功能：生成验证码邮件的 HTML、纯文本与主题，兼顾品牌展示和系统验证码识别。
 * 交互：由 auth.service.ts 调用后交给 MailService 发送。
 * 作者：吴川
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { SendMailInput } from '../mail.service';

const LOGO_CID = 'bidflow-jnt-logo';

export interface VerificationCodeEmailInput {
  to: string;
  code: string;
  expiresInMinutes: number;
  productName?: string;
}

export function buildVerificationCodeEmail(input: VerificationCodeEmailInput): SendMailInput {
  const productName = input.productName ?? 'BidFlow';
  const logoPath = resolve(process.cwd(), 'src/public/jnt-Logo.png');
  const subject = `${input.code} is your ${productName} verification code`;

  const text = [
    `${input.code} is your ${productName} verification code.`,
    '',
    `Your ${productName} verification code is: ${input.code}`,
    '',
    `This code can only be used once. It expires in ${input.expiresInMinutes} minutes.`,
    '',
    `If you did not request this code, you can ignore this email.`,
  ].join('\n');

  return {
    to: input.to,
    subject,
    text,
    html: buildHtml({
      code: input.code,
      productName,
      expiresInMinutes: input.expiresInMinutes,
      hasLogo: existsSync(logoPath),
    }),
    attachments: existsSync(logoPath)
      ? [{
        filename: 'jnt-Logo.png',
        path: logoPath,
        cid: LOGO_CID,
      }]
      : undefined,
  };
}

function buildHtml(input: {
  code: string;
  productName: string;
  expiresInMinutes: number;
  hasLogo: boolean;
}) {
  const logo = input.hasLogo
    ? `<img src="cid:${LOGO_CID}" width="180" height="90" alt="${input.productName}" style="display:block;border:0;outline:none;text-decoration:none;width:180px;height:auto;margin:0 auto;" />`
    : `<div style="font-size:32px;line-height:40px;font-weight:700;color:#111827;">${input.productName}</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${input.code} is your ${input.productName} verification code</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#202124;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;text-size-adjust:100%;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      ${input.code} is your ${input.productName} verification code.
    </div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#ffffff;border-collapse:collapse;">
      <tr>
        <td align="center" style="padding:96px 24px 48px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:560px;border-collapse:collapse;text-align:center;">
            <tr>
              <td align="center" style="padding:0 0 72px;">
                ${logo}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 0 20px;font-size:20px;line-height:28px;font-weight:400;color:#202124;">
                Your verification code:
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 0 24px;">
                <span style="font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:38px;font-weight:700;letter-spacing:12px;color:#202124;">${input.code}</span>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 0 72px;font-size:18px;line-height:28px;font-weight:400;color:#202124;">
                This code can only be used once. It expires in ${input.expiresInMinutes} minutes.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0;font-size:14px;line-height:22px;color:#6b7280;">
                If you did not request this code, you can ignore this email.
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:28px 0 0;font-size:14px;line-height:22px;color:#9ca3af;">
                © ${input.productName}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

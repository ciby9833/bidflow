import { BadRequestException } from '@nestjs/common';
import { BranchSettings } from '../../modules/organization/branch.entity';
export const CURRENCIES = ['IDR', 'VND', 'USD', 'CNY', 'BRL'] as const;
export const MARKETS: Record<string, Required<Pick<BranchSettings, 'currency' | 'timezone' | 'defaultLocale'>>> = {
  ID: { currency: 'IDR', timezone: 'Asia/Jakarta', defaultLocale: 'id-ID' },
  VN: { currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', defaultLocale: 'vi-VN' },
  CN: { currency: 'CNY', timezone: 'Asia/Shanghai', defaultLocale: 'zh-CN' },
  BR: { currency: 'BRL', timezone: 'America/Sao_Paulo', defaultLocale: 'pt-BR' },
};
export function currencyCode(value: unknown): string {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  // Match the original quote API: supported currencies are not a five-country allowlist.
  if (!/^[A-Z]{3}$/.test(code)) throw new BadRequestException('error.quote.currency_required');
  return code;
}
export function marketSettings(country: string, settings: BranchSettings = {}): BranchSettings {
  const result = { ...MARKETS[country], ...settings };
  if (result.currency) result.currency = currencyCode(result.currency);
  try {
    // Unknown countries and partially configured legacy institutions remain supported.
    if (result.timezone) new Intl.DateTimeFormat('en', { timeZone: result.timezone }).format();
  } catch { throw new BadRequestException('error.branch.invalid_settings'); }
  return result;
}

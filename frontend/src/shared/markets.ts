export const currencyCodes = ['IDR', 'VND', 'USD', 'CNY', 'BRL'] as const;
export const marketDefaults: Record<string, { currency: string; timezone: string; defaultLocale: string }> = {
  ID: { currency: 'IDR', timezone: 'Asia/Jakarta', defaultLocale: 'id-ID' },
  VN: { currency: 'VND', timezone: 'Asia/Ho_Chi_Minh', defaultLocale: 'vi-VN' },
  CN: { currency: 'CNY', timezone: 'Asia/Shanghai', defaultLocale: 'zh-CN' },
  BR: { currency: 'BRL', timezone: 'America/Sao_Paulo', defaultLocale: 'pt-BR' },
};

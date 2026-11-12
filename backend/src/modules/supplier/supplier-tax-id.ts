import { BadRequestException } from '@nestjs/common';

// Receita Federal, Manual de cálculo do DV: ASCII minus 48, modulo 11.
// Supports both numeric legacy CNPJs and alphanumeric CNPJs issued since July 2026.
export function normalizeSupplierTaxId(country: string, value?: string, required = false): string | undefined {
  if (country !== 'BR') return value;
  const id = (value ?? '').trim().toUpperCase().replace(/[.\/\s-]/g, '');
  if (!id && !required) return undefined;
  if (!/^[A-Z0-9]{12}[0-9]{2}$/.test(id) || /^(.)\1+$/.test(id)) throw new BadRequestException('error.supplier.invalid_cnpj');
  const digit = (base: string) => {
    let sum = 0, weight = 2;
    for (let i = base.length - 1; i >= 0; i--) { sum += (base.charCodeAt(i) - 48) * weight; weight = weight === 9 ? 2 : weight + 1; }
    const remainder = sum % 11;
    return remainder < 2 ? '0' : String(11 - remainder);
  };
  const first = digit(id.slice(0, 12));
  if (id.slice(12) !== first + digit(id.slice(0, 12) + first)) throw new BadRequestException('error.supplier.invalid_cnpj');
  return id;
}

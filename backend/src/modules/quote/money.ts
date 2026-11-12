import Decimal from 'decimal.js';
import { BadRequestException } from '@nestjs/common';

// Match the existing numeric(20, 4) storage boundary, not a new business amount cap.
export const MAX_QUOTE_AMOUNT = '9999999999999999.9999';
export function checkedAmount(value: unknown): Decimal {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new BadRequestException('error.quote.invalid_amount');
  const amount = new Decimal(value);
  if (amount.lte(0) || amount.gt(MAX_QUOTE_AMOUNT) || amount.decimalPlaces() > 4) throw new BadRequestException('error.quote.invalid_amount');
  return amount;
}
export function convertAmount(value: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) throw new BadRequestException('error.quote.exchange_rate_unavailable');
  const converted = checkedAmount(value).times(rate).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  if (converted.lte(0) || converted.gt(MAX_QUOTE_AMOUNT)) throw new BadRequestException('error.quote.invalid_amount');
  return converted.toNumber();
}
export function decreaseLimit(value: number, percent: number): number {
  return new Decimal(value).times(new Decimal(1).minus(new Decimal(percent).div(100))).toDecimalPlaces(4, Decimal.ROUND_DOWN).toNumber();
}
export function originalCurrencyLimit(value: number, rate: number): number {
  return new Decimal(value).div(rate).toDecimalPlaces(2, Decimal.ROUND_DOWN).toNumber();
}

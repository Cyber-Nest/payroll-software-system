import Decimal from 'decimal.js';
import mongoose from 'mongoose';

export const money = new Decimal(0);

export function decimalToMoney(value: Decimal | string | number): mongoose.Types.Decimal128 {
  const amount = new Decimal(value);
  return mongoose.Types.Decimal128.fromString(amount.toFixed(2));
}

export function moneyToDecimal(value: mongoose.Types.Decimal128 | Decimal | string | number): Decimal {
  if (value instanceof Decimal) {
    return value;
  }

  if (value instanceof mongoose.Types.Decimal128) {
    return new Decimal(value.toString());
  }

  return new Decimal(value.toString());
}

export function formatMoney(value: mongoose.Types.Decimal128 | Decimal | string | number): string {
  return moneyToDecimal(value).toFixed(2);
}

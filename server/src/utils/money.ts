import Decimal from 'decimal.js';
import mongoose from 'mongoose';

export const money = new Decimal(0);
export type MoneyValue = mongoose.Types.Decimal128 | Decimal | string | number;

export function decimalToMoney(value: MoneyValue): mongoose.Types.Decimal128 {
  const amount = moneyToDecimal(value);
  return mongoose.Types.Decimal128.fromString(amount.toFixed(2));
}

export function moneyToDecimal(value: MoneyValue): Decimal {
  if (value instanceof Decimal) {
    return value;
  }

  if (value instanceof mongoose.Types.Decimal128) {
    return new Decimal(value.toString());
  }

  return new Decimal(value.toString());
}

export function formatMoney(value: MoneyValue): string {
  return moneyToDecimal(value).toFixed(2);
}

export function sumMoney(values: MoneyValue[]): Decimal {
  return values.reduce<Decimal>((total, value) => total.plus(moneyToDecimal(value)), new Decimal(0));
}

export function addMoney(left: MoneyValue, right: MoneyValue): Decimal {
  return moneyToDecimal(left).plus(moneyToDecimal(right));
}

export function multiplyMoney(value: MoneyValue, multiplier: Decimal | string | number): Decimal {
  return moneyToDecimal(value).times(new Decimal(multiplier));
}

export function moneyToNumber(value: MoneyValue): number {
  return Number(formatMoney(value));
}

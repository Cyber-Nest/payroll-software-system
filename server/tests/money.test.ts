import Decimal from 'decimal.js';
import mongoose from 'mongoose';
import { decimalToMoney, formatMoney, moneyToDecimal } from '../src/utils/money';

describe('money utils', () => {
  it('converts a decimal value to Decimal128 safely', () => {
    const money = decimalToMoney('123.45');
    expect(mongoose.Types.Decimal128.fromString('123.45').toString()).toBe(money.toString());
  });

  it('round-trips Decimal128 back to Decimal.js', () => {
    const value = moneyToDecimal(mongoose.Types.Decimal128.fromString('99.99'));
    expect(value).toBeInstanceOf(Decimal);
    expect(value.toString()).toBe('99.99');
  });

  it('formats money with two decimal places', () => {
    expect(formatMoney('15.5')).toBe('15.50');
  });
});

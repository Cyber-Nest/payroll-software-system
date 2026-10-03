import Decimal from 'decimal.js';
import mongoose from 'mongoose';
import { addMoney, decimalToMoney, formatMoney, moneyToDecimal, multiplyMoney, sumMoney } from '../src/utils/money';

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

  it('sums money without native floating point drift', () => {
    expect(formatMoney(sumMoney(['0.10', '0.20', '0.30']))).toBe('0.60');
  });

  it('multiplies money for tax and deduction style calculations safely', () => {
    expect(formatMoney(multiplyMoney('1631.06', '0.28'))).toBe('456.70');
    expect(formatMoney(multiplyMoney('1631.06', '1.28'))).toBe('2087.76');
  });

  it('adds seeded payroll offsets with Decimal math', () => {
    expect(formatMoney(addMoney('1631.06', multiplyMoney(18, 1)))).toBe('1649.06');
  });
});

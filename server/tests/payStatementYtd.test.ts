import { isInPayStatementYtd } from '../src/utils/payStatementYtd';

const anchor = (payDate: string, payPeriodNumber: number, payPeriodYear = 2026) => ({
  payDate: new Date(payDate),
  payPeriodNumber,
  payPeriodYear
});

describe('pay statement YTD boundaries', () => {
  it('includes prior pay dates in the same year', () => {
    expect(isInPayStatementYtd(anchor('2026-03-15', 315), anchor('2026-03-31', 331))).toBe(true);
  });

  it('excludes later periods that share the current pay date', () => {
    expect(isInPayStatementYtd(anchor('2026-03-31', 430), anchor('2026-03-31', 331))).toBe(false);
  });

  it('excludes other payroll years', () => {
    expect(isInPayStatementYtd(anchor('2025-12-31', 1231, 2025), anchor('2026-01-15', 115))).toBe(false);
  });
});

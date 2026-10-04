import { assertPayrollTransition, canTransitionPayrollRun, calculatePayrollLine } from '../src/services/payrollWorkflow.service';
import { formatMoney } from '../src/utils/money';

describe('payroll workflow state machine', () => {
  it('allows the normal payroll lifecycle', () => {
    expect(canTransitionPayrollRun('draft', 'in_review')).toBe(true);
    expect(canTransitionPayrollRun('in_review', 'approved')).toBe(true);
    expect(canTransitionPayrollRun('approved', 'finalized')).toBe(true);
    expect(canTransitionPayrollRun('approved', 'draft')).toBe(true);
    expect(canTransitionPayrollRun('finalized', 'locked')).toBe(true);
  });

  it('rejects invalid jumps', () => {
    expect(() => assertPayrollTransition('draft', 'approved')).toThrow('Cannot transition');
    expect(() => assertPayrollTransition('locked', 'finalized')).toThrow('Cannot transition');
  });

  it('calculates payroll lines with Decimal-safe money helpers', () => {
    const line = calculatePayrollLine({ employeeId: '64b7f8f8f8f8f8f8f8f8f8f2', regularHours: 80, overtimeHours: 2, hourlyRate: '20.10' });
    expect(formatMoney(line.vacationPay)).toBe('66.73');
    expect(formatMoney(line.grossPay)).toBe('1735.03');
    expect(formatMoney(line.deductionsTotal)).toBe('311.31');
    expect(formatMoney(line.netPay)).toBe('1423.72');
  });

  it('keeps visible deduction lines separate and reconciled to the total', () => {
    const line = calculatePayrollLine({
      employeeId: '64b7f8f8f8f8f8f8f8f8f8f2',
      regularHours: 80,
      overtimeHours: 2,
      hourlyRate: '20.10'
    });
    const visibleDeductions =
      Number(formatMoney(line.cpp)) +
      Number(formatMoney(line.cpp2)) +
      Number(formatMoney(line.ei)) +
      Number(formatMoney(line.federalTax)) +
      Number(formatMoney(line.provincialTax)) +
      Number(formatMoney(line.preTaxDeductions)) +
      Number(formatMoney(line.postTaxDeductions));

    expect(Number(formatMoney(line.federalTax))).toBeGreaterThan(0);
    expect(Number(formatMoney(line.provincialTax))).toBeGreaterThan(0);
    expect(visibleDeductions.toFixed(2)).toBe(formatMoney(line.deductionsTotal));
  });

  it.each([
    ['weekly', 44],
    ['biweekly', 88],
    ['monthly', 176]
  ] as const)('moves %s hours above %d to overtime', (payFrequency, limit) => {
    const line = calculatePayrollLine({
      employeeId: '64b7f8f8f8f8f8f8f8f8f8f2',
      regularHours: limit + 2,
      overtimeHours: 1,
      hourlyRate: '20.00',
      payFrequency
    });

    expect(line.regularHours).toBe(limit);
    expect(line.overtimeHours).toBe(3);
    const baseGross = limit * 20 + 3 * 30;
    expect(formatMoney(line.grossPay)).toBe((baseGross * 1.04).toFixed(2));
  });

  it('pays Alberta holiday entitlement plus premium when the employee works', () => {
    const line = calculatePayrollLine({
      employeeId: '64b7f8f8f8f8f8f8f8f8f8f2',
      regularHours: 0,
      overtimeHours: 0,
      statePayHours: 8,
      statePayBaseHours: 8,
      hourlyRate: '20.00'
    });

    expect(formatMoney(line.statePay)).toBe('400.00');
    expect(formatMoney(line.vacationPay)).toBe('16.00');
    expect(formatMoney(line.grossPay)).toBe('416.00');
    expect(line.statePayProvince).toBe('AB');
    expect(line.statePayExplanation).toContain('8 entitlement hours x regular rate + 8 worked hours x 1.5');
  });

  it.each(['AB', 'BC', 'MB', 'SK', 'ON'] as const)(
    'pays the holiday entitlement when an eligible %s employee does not work',
    (province) => {
      const line = calculatePayrollLine({
        employeeId: '64b7f8f8f8f8f8f8f8f8f8f2',
        regularHours: 0,
        overtimeHours: 0,
        statePayHours: 0,
        statePayBaseHours: 8,
        hourlyRate: '20.00',
        province
      });
      expect(formatMoney(line.statePay)).toBe('160.00');
    }
  );

  it('does not pay an Alberta non-regular holiday when the employee did not work', () => {
    const line = calculatePayrollLine({
      employeeId: '64b7f8f8f8f8f8f8f8f8f8f2', regularHours: 0, overtimeHours: 0,
      statePayHours: 0, statePayBaseHours: 8, statePayRegularDay: false,
      hourlyRate: '20.00', province: 'AB'
    });
    expect(formatMoney(line.statePay)).toBe('0.00');
  });

  it('pays BC double time after 12 holiday hours', () => {
    const line = calculatePayrollLine({
      employeeId: '64b7f8f8f8f8f8f8f8f8f8f2', regularHours: 0, overtimeHours: 0,
      statePayHours: 13, statePayBaseHours: 8, hourlyRate: '20.00', province: 'BC'
    });
    expect(formatMoney(line.statePay)).toBe('560.00');
    expect(line.statePayExplanation).toContain('12 worked hours x 1.5 + 1 worked hours x 2');
  });

  it('automatically applies the company vacation accrual rate', () => {
    const line = calculatePayrollLine({
      employeeId: '64b7f8f8f8f8f8f8f8f8f8f2',
      regularHours: 80,
      overtimeHours: 0,
      hourlyRate: '20.00',
      vacationAccrualRate: '4.00'
    });

    expect(formatMoney(line.vacationPay)).toBe('64.00');
    expect(formatMoney(line.grossPay)).toBe('1664.00');
  });

  it('defaults vacation and statutory deductions from the employer province', () => {
    const line = calculatePayrollLine({
      employeeId: '64b7f8f8f8f8f8f8f8f8f8f2',
      regularHours: 80,
      overtimeHours: 0,
      hourlyRate: '20.00',
      province: 'SK'
    });

    expect(formatMoney(line.vacationPay)).toBe('92.32');
    expect(formatMoney(line.cpp)).toBe('92.68');
    expect(formatMoney(line.ei)).toBe('27.58');
    expect(formatMoney(line.federalTax)).toBe('123.42');
    expect(formatMoney(line.provincialTax)).toBe('82.76');
    expect(formatMoney(line.deductionsTotal)).toBe('326.44');
    expect(formatMoney(line.netPay)).toBe('1365.88');
  });

  it('does not allow an employee vacation value to override the provincial rate', () => {
    const line = calculatePayrollLine({
      employeeId: '64b7f8f8f8f8f8f8f8f8f8f2',
      regularHours: 80,
      overtimeHours: 0,
      hourlyRate: '20.00',
      vacationPay: '0.00',
      vacationAccrualRate: '4.00'
    });

    expect(formatMoney(line.vacationPay)).toBe('64.00');
    expect(formatMoney(line.grossPay)).toBe('1664.00');
  });
});

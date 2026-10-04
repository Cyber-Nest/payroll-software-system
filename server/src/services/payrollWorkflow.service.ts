import mongoose from 'mongoose';
import { IPayrollRun, PayrollFrequency, PayrollRunStatus } from '../models/PayrollRun';
import {
  addMoney,
  decimalToMoney,
  formatMoney,
  moneyToDecimal,
  multiplyMoney,
  sumMoney
} from '../utils/money';
import { calculateStatutoryDeductions } from './taxEngine.service';

export const payrollTransitions: Record<PayrollRunStatus, PayrollRunStatus[]> = {
  draft: ['in_review'],
  in_review: ['approved', 'draft'],
  approved: ['finalized', 'draft'],
  finalized: ['locked', 'reversed', 'adjusted'],
  locked: ['reversed', 'adjusted'],
  reversed: [],
  adjusted: ['locked']
};

export const payrollFrequencyRules: Record<
  PayrollFrequency,
  { regularHoursLimit: number; payPeriods: number }
> = {
  weekly: { regularHoursLimit: 44, payPeriods: 52 },
  biweekly: { regularHoursLimit: 88, payPeriods: 26 },
  monthly: { regularHoursLimit: 176, payPeriods: 12 }
};

export function canTransitionPayrollRun(from: PayrollRunStatus, to: PayrollRunStatus): boolean {
  return payrollTransitions[from]?.includes(to) || false;
}

export function assertPayrollTransition(from: PayrollRunStatus, to: PayrollRunStatus): void {
  if (!canTransitionPayrollRun(from, to)) {
    throw new Error(`Cannot transition payroll run from ${from} to ${to}`);
  }
}

export type PayrollHoursInput = {
  employeeId: string;
  regularHours?: number;
  overtimeHours?: number;
  statePayHours?: number;
  statePayBaseHours?: number;
  statePayRegularDay?: boolean;
  statePayAlternativeDayOff?: boolean;
  hourlyRate?: string | number;
  province?: 'AB' | 'BC' | 'MB' | 'SK' | 'ON';
  payPeriods?: number;
  payFrequency?: PayrollFrequency;
  bonus?: string | number;
  commission?: string | number;
  vacationPay?: string | number;
  vacationAccrualRate?: string | number;
  statePay?: string | number;
  otherEarnings?: string | number;
  reimbursement?: string | number;
  preTaxDeductions?: string | number;
  postTaxDeductions?: string | number;
  note?: string;
};

export function calculatePayrollLine(
  input: Required<
    Pick<PayrollHoursInput, 'employeeId' | 'regularHours' | 'overtimeHours' | 'hourlyRate'>
  > &
    Partial<PayrollHoursInput>
) {
  const frequency = input.payFrequency || 'biweekly';
  const frequencyRule = payrollFrequencyRules[frequency];
  const excessRegularHours = Math.max(input.regularHours - frequencyRule.regularHoursLimit, 0);
  const regularHours = Math.min(input.regularHours, frequencyRule.regularHoursLimit);
  const overtimeHours = input.overtimeHours + excessRegularHours;
  const regularPay = multiplyMoney(input.hourlyRate, regularHours);
  const overtimePay = multiplyMoney(multiplyMoney(input.hourlyRate, '1.5'), overtimeHours);
  const statePayHours = input.statePayHours || 0;
  const statePayBaseHours = input.statePayBaseHours || 0;
  const province = input.province || 'AB';
  const regularDay = input.statePayRegularDay !== false;
  const alternativeDayOff = input.statePayAlternativeDayOff === true;
  const basePay = multiplyMoney(input.hourlyRate, statePayBaseHours);
  let statePay = moneyToDecimal(0);
  let statePayFormula = '';

  if (province === 'AB') {
    if (regularDay) {
      if (alternativeDayOff) {
        statePay = multiplyMoney(input.hourlyRate, statePayHours);
        statePayFormula = `${statePayHours} worked hours x regular rate (substitute paid day selected)`;
      } else {
        statePay = moneyToDecimal(basePay).plus(
          multiplyMoney(multiplyMoney(input.hourlyRate, '1.5'), statePayHours)
        );
        statePayFormula = `${statePayBaseHours} entitlement hours x regular rate + ${statePayHours} worked hours x 1.5`;
      }
    } else if (statePayHours > 0) {
      statePay = multiplyMoney(multiplyMoney(input.hourlyRate, '1.5'), statePayHours);
      statePayFormula = `${statePayHours} worked hours x 1.5 (holiday was not a regular workday)`;
    } else {
      statePayFormula = 'No holiday pay: the holiday was not a regular workday and no hours were worked';
    }
  } else if (province === 'BC') {
    const timeAndAHalfHours = Math.min(statePayHours, 12);
    const doubleTimeHours = Math.max(statePayHours - 12, 0);
    if (alternativeDayOff) {
      statePay = multiplyMoney(input.hourlyRate, statePayHours);
      statePayFormula = `${statePayHours} worked hours x regular rate (substitute paid day selected)`;
    } else {
      statePay = moneyToDecimal(basePay)
        .plus(multiplyMoney(multiplyMoney(input.hourlyRate, '1.5'), timeAndAHalfHours))
        .plus(multiplyMoney(multiplyMoney(input.hourlyRate, '2'), doubleTimeHours));
      statePayFormula = `${statePayBaseHours} average-day hours x regular rate + ${timeAndAHalfHours} worked hours x 1.5${doubleTimeHours ? ` + ${doubleTimeHours} worked hours x 2` : ''}`;
    }
  } else {
    if (alternativeDayOff) {
      statePay = multiplyMoney(input.hourlyRate, statePayHours);
      statePayFormula = `${statePayHours} worked hours x regular rate (substitute paid day selected)`;
    } else {
      statePay = moneyToDecimal(basePay).plus(
        multiplyMoney(multiplyMoney(input.hourlyRate, '1.5'), statePayHours)
      );
      statePayFormula = `${statePayBaseHours} entitlement hours x regular rate + ${statePayHours} worked hours x 1.5`;
    }
  }
  const provinceNames = { AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', SK: 'Saskatchewan', ON: 'Ontario' };
  const statePayExplanation = `${provinceNames[province]}: ${statePayFormula}. Total ${formatMoney(statePay)}.`;
  const bonus = moneyToDecimal(input.bonus || 0);
  const commission = moneyToDecimal(input.commission || 0);
  const otherEarnings = moneyToDecimal(input.otherEarnings || 0);
  const vacationableEarnings = moneyToDecimal(
    sumMoney([regularPay, overtimePay, statePay, bonus, commission, otherEarnings])
  );
  // Vacation pay is a company-province rule, not an employee-entered earning.
  const vacationPay = vacationableEarnings.times(
    moneyToDecimal(input.vacationAccrualRate || 0).div(100)
  );
  const reimbursement = moneyToDecimal(input.reimbursement || 0);
  const preTaxDeductions = moneyToDecimal(input.preTaxDeductions || 0);
  const postTaxDeductions = moneyToDecimal(input.postTaxDeductions || 0);
  const grossPay = sumMoney([
    regularPay,
    overtimePay,
    statePay,
    bonus,
    commission,
    vacationPay,
    otherEarnings
  ]);
  // Off-cycle payroll and adjustments are PayrollRun rows with runType values.
  // They share the lifecycle/audit trail and optionally link to originalRunId.
  const statutory = calculateStatutoryDeductions({
    grossPay: moneyToDecimal(grossPay).minus(preTaxDeductions),
    province,
    payPeriods: input.payPeriods || frequencyRule.payPeriods
  });
  const provincialTax = statutory.incomeTax.minus(statutory.federalTax);
  return {
    employeeId: new mongoose.Types.ObjectId(input.employeeId),
    regularHours,
    overtimeHours,
    statePayHours,
    statePayBaseHours,
    statePayRegularDay: regularDay,
    statePayAlternativeDayOff: alternativeDayOff,
    statePayProvince: province,
    statePayExplanation,
    hourlyRate: decimalToMoney(input.hourlyRate),
    bonus: decimalToMoney(bonus),
    commission: decimalToMoney(commission),
    vacationPay: decimalToMoney(vacationPay),
    statePay: decimalToMoney(statePay),
    otherEarnings: decimalToMoney(otherEarnings),
    reimbursement: decimalToMoney(reimbursement),
    preTaxDeductions: decimalToMoney(preTaxDeductions),
    postTaxDeductions: decimalToMoney(postTaxDeductions),
    cpp: decimalToMoney(statutory.cpp),
    cpp2: decimalToMoney(statutory.cpp2),
    ei: decimalToMoney(statutory.ei),
    federalTax: decimalToMoney(statutory.federalTax),
    provincialTax: decimalToMoney(provincialTax),
    carryForwardAdjustment: decimalToMoney(0),
    carryForwardAdjustmentIds: [],
    note: input.note,
    grossPay: decimalToMoney(grossPay),
    deductionsTotal: decimalToMoney(
      sumMoney([statutory.totalDeductions, preTaxDeductions, postTaxDeductions])
    ),
    netPay: decimalToMoney(
      moneyToDecimal(grossPay)
        .minus(statutory.totalDeductions)
        .minus(preTaxDeductions)
        .minus(postTaxDeductions)
        .plus(reimbursement)
    )
  };
}

export function summarizePayrollLines(lines: IPayrollRun['lines']) {
  return {
    employeeCount: lines.length,
    totalHours: lines.reduce(
      (total, line) =>
        total +
        line.regularHours +
        line.overtimeHours +
        (line.statePayHours || 0) +
        (line.statePayBaseHours || 0),
      0
    ),
    estimatedGross: decimalToMoney(sumMoney(lines.map((line) => line.grossPay))),
    totalDeductions: decimalToMoney(sumMoney(lines.map((line) => line.deductionsTotal))),
    totalNetPay: decimalToMoney(sumMoney(lines.map((line) => line.netPay)))
  };
}

export function serializePayrollRun(run: IPayrollRun & { _id: unknown }) {
  return {
    id: String(run._id),
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    payDate: run.payDate,
    runType: run.runType,
    payFrequency: run.payFrequency || 'biweekly',
    originalRunId: run.originalRunId ? String(run.originalRunId) : undefined,
    employeeCount: run.employeeCount,
    totalHours: run.totalHours,
    estimatedGross: formatMoney(run.estimatedGross),
    totalDeductions: formatMoney(run.totalDeductions),
    totalNetPay: formatMoney(run.totalNetPay),
    status: run.status,
    createdAt: run.createdAt,
    lines: run.lines.map((line) => ({
      employeeId: String(line.employeeId),
      regularHours: line.regularHours,
      overtimeHours: line.overtimeHours,
      statePayHours: line.statePayHours || 0,
      statePayBaseHours: line.statePayBaseHours || 0,
      statePayRegularDay: line.statePayRegularDay !== false,
      statePayAlternativeDayOff: Boolean(line.statePayAlternativeDayOff),
      statePayProvince: line.statePayProvince || '',
      statePayExplanation: line.statePayExplanation || '',
      hourlyRate: formatMoney(line.hourlyRate),
      bonus: formatMoney(line.bonus || 0),
      commission: formatMoney(line.commission || 0),
      vacationPay: formatMoney(line.vacationPay || 0),
      statePay: formatMoney(line.statePay || 0),
      otherEarnings: formatMoney(line.otherEarnings || 0),
      reimbursement: formatMoney(line.reimbursement || 0),
      preTaxDeductions: formatMoney(line.preTaxDeductions || 0),
      postTaxDeductions: formatMoney(line.postTaxDeductions || 0),
      cpp: formatMoney(line.cpp || 0),
      cpp2: formatMoney(line.cpp2 || 0),
      ei: formatMoney(line.ei || 0),
      federalTax: formatMoney(line.federalTax || 0),
      provincialTax: formatMoney(line.provincialTax || 0),
      carryForwardAdjustment: formatMoney(line.carryForwardAdjustment || 0),
      carryForwardAdjustmentIds: (line.carryForwardAdjustmentIds || []).map(String),
      note: line.note || '',
      grossPay: formatMoney(line.grossPay),
      deductionsTotal: formatMoney(line.deductionsTotal),
      netPay: formatMoney(line.netPay),
      statementId: line.statementId ? String(line.statementId) : undefined
    })),
    statusHistory: run.statusHistory
  };
}

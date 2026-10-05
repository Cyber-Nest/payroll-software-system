import { Router } from 'express';
import { z } from 'zod';
import { AuditLog } from '../models/AuditLog';
import { Company, ICompany } from '../models/Company';
import { CompanyBulletin } from '../models/CompanyBulletin';
import { Employee, IEmployee } from '../models/Employee';
import { PayStatement } from '../models/PayStatement';
import { TaxFormDocument } from '../models/TaxFormDocument';
import { User } from '../models/User';
import { authenticate, AuthRequest, requirePermission, signToken } from '../middleware/auth';
import { serializeEmployee, serializeMoney } from '../utils/serializers';
import { MoneyValue, sumMoney } from '../utils/money';
import { employeeCompanyScope } from '../utils/scope';
import { payslipPdf, payslipsPdf, PayslipPdfData, t4Pdf } from '../utils/pdf';
import { isInPayStatementYtd } from '../utils/payStatementYtd';
import { calculatePayrollLine, stateHolidayPayRule2026 } from '../services/payrollWorkflow.service';
import { defaultHelpContent } from '../data/helpContent';
import { Help } from '../models/Help';
import { PlatformNotification } from '../models/PlatformNotification';
import { decryptSin } from '../utils/security';
import { normalizeProvince } from '../services/vacationPolicy.service';

const router = Router();
router.use(authenticate);

type DisplayLine = {
  code?: string;
  description?: string;
  amount: unknown;
  ytd?: string;
  currentUnits?: string;
  ytdUnits?: string;
  rate?: string;
};

const hiddenDeductionCodes = new Set(['CPP2']);
const hiddenDeductionDescriptions = ['additional cpp', 'other tax'];
const optionalZeroDeductionCodes = new Set(['PRE', 'POST']);
const requiredStatutoryDeductionCodes = new Set(['CPP', 'EI', 'FTAX', 'PTAX']);

function payrollDeductionLabel(code?: string, description?: string): string {
  const normalizedCode = String(code || '').toUpperCase();
  const normalizedDescription = normalizedDisplayText(description);
  if (normalizedCode === 'CPP' || normalizedDescription === 'canada pension plan') return 'CPP';
  if (normalizedCode === 'EI' || normalizedDescription === 'employment insurance') return 'EI';
  if (normalizedCode === 'FTAX' || normalizedDescription === 'federal income tax') return 'Federal tax';
  if (normalizedCode === 'PTAX' || normalizedDescription === 'provincial income tax')
    return 'Provincial tax';
  return description || '';
}
function canonicalDeductionCode(code?: string, description?: string): string {
  const normalizedCode = String(code || '').toUpperCase();
  const label = payrollDeductionLabel(normalizedCode, description).toLowerCase();
  if (normalizedCode === 'CPP' || label === 'cpp') return 'CPP';
  if (normalizedCode === 'CPP2' || label.includes('additional cpp')) return 'CPP2';
  if (normalizedCode === 'EI' || label === 'ei') return 'EI';
  if (normalizedCode === 'FTAX' || label === 'federal tax') return 'FTAX';
  if (normalizedCode === 'PTAX' || label === 'provincial tax') return 'PTAX';
  if (normalizedCode === 'PRE') return 'PRE';
  if (normalizedCode === 'POST') return 'POST';
  if (normalizedCode === 'TOTAL' || label === 'total deductions') return 'TOTAL';
  return normalizedCode;
}
const optionalEarningCodes = new Set(['BONUS', 'BON', 'COMM', 'COMMISSION', 'OTHER', 'OTH']);
const optionalEarningDescriptions = ['bonus', 'commission', 'other earning', 'other earnings'];

function normalizedDisplayText(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function deductionTotalAmount(lines: Array<{ code?: string; amount: unknown }>): MoneyValue {
  const explicitTotal = lines.find((line) => line.code === 'TOTAL')?.amount;
  const lineTotal = sumMoney(
    lines.filter((line) => line.code !== 'TOTAL').map((line) => serializeMoney(line.amount))
  );
  if (explicitTotal === undefined || explicitTotal === null) return lineTotal;
  if (Number(serializeMoney(explicitTotal)) === 0 && Number(serializeMoney(lineTotal)) !== 0) {
    return lineTotal;
  }
  return serializeMoney(explicitTotal);
}

function lineDescriptionIncludes(line: { description?: string }, values: string[]) {
  const description = normalizedDisplayText(line.description);
  return values.some((value) => description.includes(value));
}

function displayEarningLines<T extends DisplayLine>(lines: T[]) {
  return lines.filter((line) => {
    const code = String(line.code || '').toUpperCase();
    const optional =
      optionalEarningCodes.has(code) || lineDescriptionIncludes(line, optionalEarningDescriptions);
    return !optional || Number(serializeMoney(line.amount)) !== 0;
  });
}

function displayPayslipEarningLines<T extends DisplayLine>(lines: T[]) {
  return displayEarningLines(lines).filter((line) => {
    const code = String(line.code || '').toUpperCase();
    if (
      code === 'OT' &&
      Number(serializeMoney(line.amount)) === 0 &&
      Number(serializeMoney(line.ytd || 0)) === 0 &&
      Number(line.currentUnits || 0) === 0 &&
      Number(line.ytdUnits || 0) === 0
    ) {
      return false;
    }
    return true;
  });
}

function displayDeductionLines<T extends DisplayLine>(lines: T[]) {
  return lines
    .filter((line) => {
      const code = String(line.code || '').toUpperCase();
      if (optionalZeroDeductionCodes.has(code) && Number(serializeMoney(line.amount)) === 0) {
        return false;
      }
      if (code !== 'TOTAL' && !requiredStatutoryDeductionCodes.has(code) && Number(serializeMoney(line.amount)) === 0) return false;
      return !hiddenDeductionCodes.has(code) && !lineDescriptionIncludes(line, hiddenDeductionDescriptions);
    })
    .map((line) => ({
      ...line,
      description: payrollDeductionLabel(line.code, line.description)
    }));
}

router.get('/help', async (req: AuthRequest, res) => {
  const { company } = await loadContext(req);
  const help = await Help.findOneAndUpdate(
    { key: defaultHelpContent.key },
    { $setOnInsert: defaultHelpContent },
    { new: true, upsert: true }
  ).lean();
  res.json({
    ...help,
    employerName: company.operatingName || company.legalName,
    customerCareNumber: company.customerCarePhone || '(403) 555-0147'
  });
});

async function loadContext(req: AuthRequest) {
  const employee = await Employee.findOne({
    _id: req.employeeContext?.employeeId,
    userId: req.user?.id
  });
  const company = employee ? await Company.findById(employee.companyId) : null;
  if (!employee || !company) throw new Error('Missing employee context');
  return { employee, company };
}

function payDto(statement: unknown, employee?: IEmployee, company?: ICompany) {
  const s = statement as {
    _id: unknown;
    employeeId: unknown;
    companyId: unknown;
    payDate: Date;
    payPeriodNumber: number;
    payPeriodYear: number;
    type?: string;
    netPay: unknown;
    yearToDateNetPay: unknown;
    grossEarnings: Array<{
      code: string;
      description: string;
      amount: unknown;
      currentUnits?: string;
      ytdUnits?: string;
      rate?: string;
    }>;
    deductions: Array<{ code: string; description: string; amount: unknown }>;
    additionalInfo: Array<{ key: string; value: string }>;
    periodStart?: Date;
    periodEnd?: Date;
    regularHours?: number;
    overtimeHours?: number;
    statePayHours?: number;
    statePayBaseHours?: number;
    hourlyRate?: unknown;
    grossPay?: unknown;
    revision?: number;
    changeSummary?: string[];
    isUnread: boolean;
  };
  const grossTotal =
    s.grossEarnings.find((line) => line.code === 'TOTAL')?.amount ||
    sumMoney(s.grossEarnings.map((line) => line.amount as MoneyValue));
  const statePay = s.grossEarnings.find((line) => line.code === 'STATE')?.amount || 0;
  const storedDeductionsTotal = deductionTotalAmount(s.deductions);
  const grossValue = Number(serializeMoney(grossTotal));
  const inferredDeductionsTotal = grossValue - Number(serializeMoney(s.netPay));
  const deductionsTotal =
    Number(serializeMoney(storedDeductionsTotal)) !== 0
      ? storedDeductionsTotal
      : inferredDeductionsTotal > 0
        ? inferredDeductionsTotal.toFixed(2)
        : storedDeductionsTotal;
  const profile = employee?.adminProfile as
    | {
        compensation?: { hourlyRate?: string | number };
        tax?: { provinceOfResidence?: string };
        banking?: { accountNumber?: string | number };
      }
    | undefined;
  const fallbackRate = Number(profile?.compensation?.hourlyRate || 0);
  const fallbackHours = fallbackRate > 0 ? grossValue / fallbackRate : 0;
  const regularHours = s.regularHours ?? fallbackHours;
  const hourlyRate = s.hourlyRate ? serializeMoney(s.hourlyRate) : fallbackRate.toFixed(2);
  const effectiveHourlyRate = Number(hourlyRate || 0);
  const onlySummaryDeduction =
    s.deductions.length === 1 && (s.deductions[0].code === 'TOTAL' || !s.deductions[0].code);
  const statutoryDetailTotal = sumMoney(
    s.deductions
      .filter((line) => ['CPP', 'CPP2', 'EI', 'FTAX', 'PTAX'].includes(String(line.code || '').toUpperCase()))
      .map((line) => serializeMoney(line.amount))
  );
  const missingStatutoryDetails =
    Number(serializeMoney(deductionsTotal)) > 0 && Number(serializeMoney(statutoryDetailTotal)) === 0;
  const reconstructed =
    employee &&
    (onlySummaryDeduction || missingStatutoryDetails) &&
    effectiveHourlyRate > 0 &&
    regularHours > 0
      ? calculatePayrollLine({
          employeeId: String(s.employeeId),
          regularHours,
          overtimeHours: s.overtimeHours || 0,
          hourlyRate,
          province: (company?.address?.province || 'AB') as
            | 'AB'
            | 'BC'
            | 'MB'
            | 'SK'
            | 'ON'
        })
      : undefined;
  const reconstructedMatches =
    reconstructed &&
    (missingStatutoryDetails ||
      (Math.abs(
        Number(serializeMoney(reconstructed.deductionsTotal)) -
          Number(serializeMoney(deductionsTotal))
      ) < 0.02 &&
        Math.abs(Number(serializeMoney(reconstructed.netPay)) - Number(serializeMoney(s.netPay))) <
          0.02));
  const calculatedDeductionLines = reconstructed
    ? [
        { code: 'CPP', description: 'CPP', amount: reconstructed.cpp },
        { code: 'CPP2', description: 'Additional CPP', amount: reconstructed.cpp2 },
        { code: 'EI', description: 'EI', amount: reconstructed.ei },
        { code: 'FTAX', description: 'Federal tax', amount: reconstructed.federalTax },
        { code: 'PTAX', description: 'Provincial income tax', amount: reconstructed.provincialTax },
        { code: 'TOTAL', description: 'Total deductions', amount: deductionsTotal }
      ]
    : undefined;
  const storedHasPositiveDeductionDetails = s.deductions.some(
    (line) => line.code !== 'TOTAL' && Number(serializeMoney(line.amount)) > 0
  );
  const deductionLines =
    calculatedDeductionLines &&
    (reconstructedMatches ||
      (!storedHasPositiveDeductionDetails && Number(serializeMoney(deductionsTotal)) > 0))
      ? calculatedDeductionLines
      : s.deductions;
  const priorAdjustmentInfo = s.additionalInfo.find(
    (line) => line.key === 'Prior Payroll Adjustment'
  );
  const priorAdjustmentAmount = priorAdjustmentInfo?.value.match(/[-+]?\d[\d,]*\.\d{2}/)?.[0];
  const normalizedAdjustment = priorAdjustmentAmount?.replace(/,/g, '');
  const displayedGrossTotal = normalizedAdjustment
    ? sumMoney([grossTotal as MoneyValue, normalizedAdjustment])
    : grossTotal;
  const hasAdjustmentLine = s.grossEarnings.some((line) => line.code === 'ADJ');
  const grossEarningLines =
    normalizedAdjustment
      ? [
          ...s.grossEarnings.filter((line) => line.code !== 'TOTAL'),
          ...(!hasAdjustmentLine
            ? [
                {
                  code: 'ADJ',
                  description: 'Prior payroll net adjustment (non-taxable)',
                  amount: normalizedAdjustment
                }
              ]
            : []),
          {
            code: 'TOTAL',
            description: 'Total earnings including adjustments',
            amount: displayedGrossTotal
          }
        ]
      : s.grossEarnings;
  return {
    id: String(s._id),
    employeeId: String(s.employeeId),
    companyId: String(s.companyId),
    payDate: s.payDate,
    payPeriodNumber: s.payPeriodNumber,
    payPeriodYear: s.payPeriodYear,
    type: s.type || '',
    grossPay: serializeMoney(displayedGrossTotal),
    statePay: serializeMoney(statePay),
    netPay: serializeMoney(s.netPay),
    yearToDateNetPay: serializeMoney(s.yearToDateNetPay),
    deductionsTotal: serializeMoney(deductionsTotal),
    grossEarnings: displayEarningLines(grossEarningLines).map((line, index, lines) => ({
      code: line.code || (index === lines.length - 1 ? 'TOTAL' : 'EARN'),
      description:
        line.description || (index === lines.length - 1 ? 'Total earnings' : 'Payroll earnings'),
      amount: serializeMoney(line.amount),
      currentUnits: line.currentUnits,
      ytdUnits: line.ytdUnits,
      rate: line.rate
    })),
    deductions: displayDeductionLines(deductionLines).map((line, index, lines) => ({
      code: line.code || (index === lines.length - 1 ? 'TOTAL' : 'DED'),
      description:
        line.description || (index === lines.length - 1 ? 'Total deductions' : 'Payroll deduction'),
      amount: serializeMoney(line.code === 'TOTAL' ? deductionsTotal : line.amount)
    })),
    additionalInfo: [
      ...(profile?.banking?.accountNumber
        ? [{ key: 'Deposit Account', value: 'XX [hidden]' }]
        : []),
      ...s.additionalInfo.map((line) => ({
        key: line.key || 'Payroll information',
        value: line.value || '-'
      }))
    ],
    periodStart: s.periodStart,
    periodEnd: s.periodEnd,
    regularHours,
    overtimeHours: s.overtimeHours || 0,
    statePayHours: s.statePayHours || 0,
    statePayBaseHours: s.statePayBaseHours || 0,
    hourlyRate,
    revision: s.revision || 1,
    changeSummary: s.changeSummary || [],
    isUnread: s.isUnread
  };
}

function profileValue(section: Record<string, unknown> | undefined, key: string): string {
  const value = section?.[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function addressLines(address?: {
  street?: string;
  line2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}): string[] {
  if (!address) return [];
  return [
    address.street,
    address.line2,
    [address.city, address.province, address.postalCode].filter(Boolean).join(', ')
  ].filter(Boolean) as string[];
}

function displayPeriodNumber(
  storedPeriodNumber: number,
  periodEnd: Date | string | undefined,
  payFrequency: string | undefined
): string {
  if (!periodEnd || storedPeriodNumber < 100) return String(storedPeriodNumber);
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return String(storedPeriodNumber);
  const yearStart = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  const dayOfYear =
    Math.floor((Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) - yearStart.getTime()) / 86400000) +
    1;
  const frequency = String(payFrequency || '').toLowerCase().replace(/\s+/g, '');
  if (frequency === 'weekly') return String(Math.ceil(dayOfYear / 7));
  if (frequency === 'monthly') return String(end.getUTCMonth() + 1);
  return String(Math.ceil(dayOfYear / 14));
}

function payrollAccountNumber(company: ICompany): string {
  const cra = company.craPayroll || {};
  const payrollAccount =
    typeof cra.payrollAccount === 'string' ? cra.payrollAccount.trim().toUpperCase() : '';
  if (payrollAccount) return payrollAccount;
  const suffix = typeof cra.accountSuffix === 'string' && cra.accountSuffix.trim()
    ? cra.accountSuffix.trim()
    : '0001';
  const businessNumber = String(company.businessNumber || '').trim().toUpperCase();
  if (/^\d{9}RP\d{4}$/.test(businessNumber)) return businessNumber;
  if (/^\d{9}$/.test(businessNumber)) return `${businessNumber}RP${suffix}`;
  return company.customerId;
}

async function payslipData(
  dto: ReturnType<typeof payDto>,
  employee: IEmployee,
  company: ICompany
): Promise<PayslipPdfData> {
  const history = (await PayStatement.find({
    employeeId: dto.employeeId,
    companyId: dto.companyId,
    payPeriodYear: dto.payPeriodYear,
    payDate: { $lte: dto.payDate },
    supersededByStatementId: { $exists: false }
  })).filter((statement) => isInPayStatementYtd(statement, dto));
  const historyDtos = history.map((statement) => payDto(statement, employee, company));
  const ytdFor = (kind: 'grossEarnings' | 'deductions', code: string) =>
    serializeMoney(
      sumMoney(
        historyDtos.flatMap((statement) => {
          const targetCodes =
            kind === 'deductions' && String(code || '').toUpperCase() === 'CPP'
              ? ['CPP', 'CPP2']
              : [String(code || '').toUpperCase()];
          return statement[kind]
            .filter((line) =>
              kind === 'deductions'
                ? targetCodes.includes(canonicalDeductionCode(line.code, line.description))
                : targetCodes.includes(String(line.code || '').toUpperCase())
            )
            .map((line) => line.amount);
        })
      )
    );
  const grossTotalYtd = serializeMoney(
    sumMoney(
      history.map((statement) => {
        const earningLines = statement.grossEarnings.filter(
          (line) => line.code !== 'TOTAL' && line.code !== 'ADJ'
        );
        const taxableGross = earningLines.length
          ? sumMoney(earningLines.map((line) => line.amount))
          : statement.grossPay ||
            statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount ||
            0;
        const storedAdjustment = statement.grossEarnings.find(
          (line) => line.code === 'ADJ'
        )?.amount;
        const legacyAdjustment = statement.additionalInfo
          .find((line) => line.key === 'Prior Payroll Adjustment')
          ?.value?.match(/[-+]?\d[\d,]*\.\d{2}/)?.[0]
          ?.replace(/,/g, '');
        return sumMoney([taxableGross, storedAdjustment || legacyAdjustment || 0]);
      })
    )
  );
  const deductionsTotalYtd = serializeMoney(
    sumMoney(
      historyDtos.map((statement) => statement.deductionsTotal)
    )
  );
  const netPayYtd = serializeMoney(sumMoney(history.map((statement) => statement.netPay)));
  const regularHoursYtd = history.reduce(
    (total, statement) => total + (statement.regularHours || 0),
    0
  );
  const overtimeHoursYtd = history.reduce(
    (total, statement) => total + (statement.overtimeHours || 0),
    0
  );
  const statePayHoursYtd = history.reduce(
    (total, statement) =>
      total + Number(statement.statePayBaseHours || 0) + Number(statement.statePayHours || 0),
    0
  );
  const statePayUnits = Number(dto.statePayBaseHours || 0) + Number(dto.statePayHours || 0);
  const employeeName =
    `${employee.legalFirstName || ''} ${employee.middleName || ''} ${employee.legalLastName || ''}`.trim();
  const employeeAddress = employee.addresses?.[0];
  const banking = employee.adminProfile?.banking;
  const employment = employee.adminProfile?.employment;
  const accountNumber = profileValue(banking, 'accountNumber');
  const maskedAccount = accountNumber ? 'XX [hidden]' : '';
  const payPeriod =
    dto.periodStart && dto.periodEnd
      ? `${new Date(dto.periodStart).toISOString().slice(0, 10)} to ${new Date(dto.periodEnd).toISOString().slice(0, 10)}`
      : String(dto.payPeriodNumber);
  const payFrequency = profileValue(employee.adminProfile?.compensation, 'payFrequency') || employee.payGroup || String(company.payrollConfiguration?.payFrequency || '');
  const periodNumber = displayPeriodNumber(dto.payPeriodNumber, dto.periodEnd, payFrequency);
  const companyProvince = company.address?.province || '';
  const canonicalInfoKeys = new Set([
    'Pay Period',
    'Period Number',
    'Payroll Number',
    'Employee Number',
    'Deposit Account',
    'Sequence Number',
    'Province of Employment',
    'Payslip Revision',
    'Payroll Run'
  ]);
  const derivedInfo = [
    { key: 'Pay Period', value: payPeriod },
    { key: 'Period Number', value: periodNumber },
    { key: 'Payroll Number', value: payrollAccountNumber(company) },
    { key: 'Employee Number', value: employee.employeeNumber },
    ...(maskedAccount ? [{ key: 'Deposit Account', value: maskedAccount }] : []),
    { key: 'Sequence Number', value: `${employee.employeeNumber}-${dto.payPeriodYear}-${periodNumber}` },
    {
      key: 'Province of Employment',
      value: companyProvince
    },
    { key: 'Payslip Revision', value: String(dto.revision) },
    ...(Number(dto.statePay || 0) > 0 && !dto.additionalInfo.some((line) => line.key === 'State Holiday Pay Rule')
      ? [{ key: 'State Holiday Pay Rule', value: stateHolidayPayRule2026(companyProvince) }]
      : [])
  ];
  const additionalInfo = [
    ...derivedInfo,
    ...dto.additionalInfo.filter((line) => !canonicalInfoKeys.has(line.key))
  ].filter(
    (line, index, lines) => line.value && lines.findIndex((item) => item.key === line.key) === index
  );
  const hasDeductionDetails = dto.deductions.some(
    (line) => line.code !== 'TOTAL' && Number(line.amount) > 0
  );
  const rebuiltDeductions =
    !hasDeductionDetails && Number(dto.deductionsTotal) > 0 && Number(dto.hourlyRate) > 0
      ? displayDeductionLines(
          [
            ...[
              calculatePayrollLine({
                employeeId: dto.employeeId,
                regularHours: dto.regularHours,
                overtimeHours: dto.overtimeHours,
                hourlyRate: dto.hourlyRate,
                statePayHours: dto.statePayHours,
                statePayBaseHours: dto.statePayBaseHours,
                province: normalizeProvince(company.address?.province || 'AB') as
                  | 'AB'
                  | 'BC'
                  | 'MB'
                  | 'SK'
                  | 'ON',
                payFrequency:
                  String(company.payrollConfiguration?.payFrequency || employee.payGroup || 'biweekly')
                    .toLowerCase()
                    .replace(/\s+/g, '') === 'weekly'
                    ? 'weekly'
                    : String(company.payrollConfiguration?.payFrequency || employee.payGroup || 'biweekly')
                          .toLowerCase()
                          .replace(/\s+/g, '') === 'monthly'
                      ? 'monthly'
                      : 'biweekly'
              })
            ].flatMap((line) => [
              { code: 'CPP', description: 'CPP', amount: serializeMoney(line.cpp) },
              { code: 'CPP2', description: 'Additional CPP', amount: serializeMoney(line.cpp2) },
              { code: 'EI', description: 'EI', amount: serializeMoney(line.ei) },
              { code: 'FTAX', description: 'Federal tax', amount: serializeMoney(line.federalTax) },
              { code: 'PTAX', description: 'Provincial tax', amount: serializeMoney(line.provincialTax) }
            ].map((line) => {
              const calculatedYtd = ytdFor('deductions', line.code);
              return {
                ...line,
                ytd: Number(calculatedYtd) > 0 ? calculatedYtd : line.amount
              };
            })),
            {
              code: 'TOTAL',
              description: 'Total deductions',
              amount: dto.deductionsTotal
            }
          ]
        )
      : dto.deductions;
  const earningRows = dto.grossEarnings.map((line) => ({
    ...line,
    currentUnits:
      line.currentUnits ||
      (line.code === 'REG'
        ? String(dto.regularHours)
        : line.code === 'OT'
          ? String(dto.overtimeHours)
          : line.code === 'STATE'
            ? String(statePayUnits)
            : ''),
    ytdUnits:
      line.code === 'REG'
        ? String(regularHoursYtd)
        : line.code === 'OT'
          ? String(overtimeHoursYtd)
          : line.code === 'STATE'
            ? String(statePayHoursYtd)
            : '',
    rate:
      line.rate ||
      (line.code === 'REG'
        ? dto.regularHours > 0
          ? dto.hourlyRate
          : ''
        : line.code === 'OT'
          ? dto.overtimeHours > 0
            ? (Number(line.amount) / dto.overtimeHours).toFixed(2)
            : ''
          : line.code === 'STATE'
            ? dto.hourlyRate || (statePayUnits > 0 ? (Number(line.amount) / statePayUnits).toFixed(2) : '')
            : ''),
    ytd:
      line.code === 'TOTAL'
        ? grossTotalYtd
        : line.code === 'ADJ' && ytdFor('grossEarnings', line.code) === '0.00'
          ? line.amount
          : ytdFor('grossEarnings', line.code)
  }));
  if (!earningRows.some((line) => line.code === 'OT') && (Number(ytdFor('grossEarnings', 'OT')) > 0 || overtimeHoursYtd > 0)) {
    earningRows.splice(Math.max(1, earningRows.findIndex((line) => line.code === 'TOTAL')), 0, {
      code: 'OT',
      description: 'Overtime earnings',
      amount: '0.00',
      currentUnits: '0',
      ytdUnits: String(overtimeHoursYtd),
      rate: dto.hourlyRate ? (Number(dto.hourlyRate) * 1.5).toFixed(2) : '',
      ytd: ytdFor('grossEarnings', 'OT')
    });
  }
  if (!earningRows.some((line) => line.code === 'STATE') && (Number(ytdFor('grossEarnings', 'STATE')) > 0 || statePayHoursYtd > 0)) {
    earningRows.splice(Math.max(1, earningRows.findIndex((line) => line.code === 'TOTAL')), 0, {
      code: 'STATE',
      description: 'Statutory holiday pay',
      amount: '0.00',
      currentUnits: '0',
      ytdUnits: String(statePayHoursYtd),
      rate: dto.hourlyRate,
      ytd: ytdFor('grossEarnings', 'STATE')
    });
  }
  return {
    companyName: company.legalName,
    companyAddress: addressLines(company.address),
    employeeName,
    employeeCode: employee.employeeNumber,
    payGroup: profileValue(employee.adminProfile?.compensation, 'payFrequency') || employee.payGroup || 'Not available',
    employeeAddress: addressLines(employeeAddress),
    payDate: new Date(dto.payDate).toLocaleDateString('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }),
    netPay: dto.netPay,
    yearToDateNetPay: netPayYtd,
    grossPay: dto.grossPay,
    deductionsTotal: dto.deductionsTotal,
    grossEarnings: displayPayslipEarningLines(earningRows),
    deductions: rebuiltDeductions.map((line) => ({
      ...line,
      ytd: line.code === 'TOTAL' ? deductionsTotalYtd : ytdFor('deductions', line.code)
    })),
    additionalInfo
  };
}

router.get('/context', requirePermission('self.context.view'), async (req: AuthRequest, res) => {
  const { employee, company } = await loadContext(req);
  const employees = await Employee.find({ userId: req.user?.id }).populate('companyId');
  res.json({
    employee: serializeEmployee(employee, company),
    companies: employees.map((item) => {
      const itemCompany = item.companyId as never as {
        _id: unknown;
        legalName: string;
        customerId: string;
      };
      return {
        employeeId: String(item._id),
        companyId: String(itemCompany._id),
        companyName: itemCompany.legalName,
        customerId: itemCompany.customerId
      };
    })
  });
});

router.post(
  '/context/:employeeId',
  requirePermission('self.context.switch'),
  async (req: AuthRequest, res) => {
    const employee = await Employee.findOne({ _id: req.params.employeeId, userId: req.user?.id });
    if (!employee)
      return res.status(403).json({ message: 'Employee context is not available to this user' });
    await User.findByIdAndUpdate(req.user?.id, { lastSelectedEmployeeId: employee._id });
    res.json({ token: signToken(req.user!.id, String(employee._id), String(employee.companyId)) });
  }
);

router.get('/profile', requirePermission('self.profile.view'), async (req: AuthRequest, res) => {
  const { employee, company } = await loadContext(req);
  res.json(serializeEmployee(employee, company));
});

router.patch('/profile', requirePermission('self.profile.edit'), async (req: AuthRequest, res) => {
  const parsed = z
    .object({
      legalFirstName: z.string().optional(),
      middleName: z.string().optional(),
      legalLastName: z.string().optional(),
      salutation: z.string().optional(),
      preferredFirstName: z.string().optional(),
      preferredLastName: z.string().optional(),
      citizenship: z.string().optional(),
      addresses: z
        .array(
          z.object({
            street: z.string(),
            city: z.string(),
            province: z.string(),
            postalCode: z.string()
          })
        )
        .optional(),
      phones: z
        .array(z.object({ type: z.enum(['Home', 'Mobile', 'Work']), number: z.string() }))
        .optional(),
      personalEmail: z.string().email().optional(),
      notificationEmailPreference: z.enum(['company', 'personal']).optional(),
      emergencyContacts: z
        .array(z.object({ name: z.string(), relationship: z.string(), phone: z.string() }))
        .optional(),
      payStatementPreference: z
        .object({ emailStatement: z.boolean(), language: z.enum(['English', 'French']) })
        .optional()
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid profile payload' });
  const employee = await Employee.findOneAndUpdate(
    { _id: req.employeeContext?.employeeId, userId: req.user?.id },
    parsed.data,
    { new: true }
  );
  const company = employee ? await Company.findById(employee.companyId) : null;
  if (!employee || !company) return res.status(404).json({ message: 'Profile not found' });
  res.json(serializeEmployee(employee, company));
});

router.patch(
  '/two-factor',
  requirePermission('self.security.edit'),
  async (req: AuthRequest, res) => {
    const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid two-factor payload' });
    const user = await User.findByIdAndUpdate(
      req.user?.id,
      { twoFactorEnabled: parsed.data.enabled },
      { new: true }
    );
    res.json({ twoFactorEnabled: Boolean(user?.twoFactorEnabled) });
  }
);

router.get('/pay-statements', requirePermission('self.pay.view'), async (req: AuthRequest, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const filter = {
    ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId),
    ...(year ? { payPeriodYear: year } : {})
  };
  const statements = await PayStatement.find({
    ...filter,
    supersededByStatementId: { $exists: false }
  }).sort({ payDate: -1 });
  const allYears = await PayStatement.distinct(
    'payPeriodYear',
    employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId)
  );
  const [employee, company] = await Promise.all([
    Employee.findById(req.employeeContext!.employeeId),
    Company.findById(req.employeeContext!.companyId)
  ]);
  res.json({
    years: allYears.sort((a, b) => b - a),
    statements: statements.map((statement) => payDto(statement, employee || undefined, company || undefined))
  });
});

router.post(
  '/pay-statements/download-selected',
  requirePermission('self.pay.view'),
  async (req: AuthRequest, res) => {
    const parsed = z.object({ ids: z.array(z.string()).min(1) }).safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: 'Select at least one pay statement' });
    const statements = await PayStatement.find({
      _id: { $in: parsed.data.ids },
      ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId)
    }).sort({ payDate: -1 });
    if (!statements.length)
      return res.status(404).json({ message: 'No selected pay statements found' });
    const employee = await Employee.findById(req.employeeContext!.employeeId);
    const company = await Company.findById(req.employeeContext!.companyId);
    if (!employee || !company)
      return res.status(404).json({ message: 'Employee or company details not found' });
    const pages = await Promise.all(
      statements.map((statement) => payslipData(payDto(statement, employee, company), employee, company))
    );
    res
      .type('application/pdf')
      .setHeader('Cache-Control', 'no-store')
      .setHeader('Content-Disposition', 'attachment; filename="payhours-selected-payslips.pdf"')
      .send(payslipsPdf(pages));
  }
);

router.get(
  '/pay-statements/:id',
  requirePermission('self.pay.view'),
  async (req: AuthRequest, res) => {
    const statement = await PayStatement.findOne({
      _id: req.params.id,
      ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId)
    });
    if (!statement) return res.status(404).json({ message: 'Pay statement not found' });
    const [employee, company] = await Promise.all([
      Employee.findById(req.employeeContext!.employeeId),
      Company.findById(req.employeeContext!.companyId)
    ]);
    res.json(payDto(statement, employee || undefined, company || undefined));
  }
);

router.post(
  '/pay-statements/:id/read',
  requirePermission('self.pay.view'),
  async (req: AuthRequest, res) => {
    await PayStatement.updateOne(
      {
        _id: req.params.id,
        ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId)
      },
      { isUnread: false }
    );
    res.json({ message: 'Marked read' });
  }
);

router.get(
  '/pay-statements/:id/download',
  requirePermission('self.pay.view'),
  async (req: AuthRequest, res) => {
    const statement = await PayStatement.findOne({
      _id: req.params.id,
      ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId)
    });
    if (!statement) return res.status(404).json({ message: 'Pay statement not found' });
    const employee = await Employee.findById(statement.employeeId);
    const company = await Company.findById(statement.companyId);
    if (!employee || !company)
      return res.status(404).json({ message: 'Employee or company details not found' });
    const dto = payDto(statement, employee, company);
    res
      .type('application/pdf')
      .setHeader('Cache-Control', 'no-store')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="payhours-payslip-${statement.payPeriodYear}-${statement.payPeriodNumber}.pdf"`
      )
      .send(payslipPdf(await payslipData(dto, employee, company)));
  }
);

router.get(
  '/tax-forms/:id/download',
  requirePermission('self.tax.view'),
  async (req: AuthRequest, res) => {
    const form = await TaxFormDocument.findOne({
      _id: req.params.id,
      ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId)
    });
    if (!form) return res.status(404).json({ message: 'Tax form not found' });
    const employee = await Employee.findById(form.employeeId);
    const company = await Company.findById(form.companyId);
    const statements = await PayStatement.find({
      employeeId: form.employeeId,
      companyId: form.companyId,
      payPeriodYear: form.taxYear,
      supersededByStatementId: { $exists: false }
    });
    const deduction = (...codes: string[]) => serializeMoney(sumMoney(statements.flatMap((statement) =>
      statement.deductions.filter((line) => codes.includes(line.code || '')).map((line) => line.amount)
    )));
    const employmentIncome = serializeMoney(sumMoney(statements.map((statement) =>
      statement.grossPay || statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0
    )));
    const address = employee?.addresses?.[0];
    res
      .type('application/pdf')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="payhours-${form.formType}-${form.taxYear}.pdf"`
      )
      .send(
        t4Pdf({
          employerName: company?.legalName || 'Gayatri Holding Medicine Hat A Inc',
          employerAddress: addressLines(company?.address),
          year: form.taxYear,
          sin: employee?.sinEncrypted ? decryptSin(employee.sinEncrypted) : '',
          lastName: employee?.legalLastName || 'SUHAGIYA',
          firstName: employee?.legalFirstName || 'ANILKUMAR',
          initial: employee?.middleName?.charAt(0) || 'M',
          address: address ? [address.street, `${address.city}, ${address.province}`, address.postalCode] : [],
          province: normalizeProvince(company?.address?.province || 'AB'),
          employmentIncome,
          incomeTax: deduction('TAX', 'FTAX', 'PTAX'),
          cppContributions: deduction('CPP'),
          eiPremiums: deduction('EI')
        })
      );
  }
);

router.get('/tax-forms', requirePermission('self.tax.view'), async (req: AuthRequest, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const filter = {
    ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId),
    ...(year ? { taxYear: year } : {})
  };
  const forms = await TaxFormDocument.find(filter).sort({ taxYear: -1 });
  const years = await TaxFormDocument.distinct(
    'taxYear',
    employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId)
  );
  res.json({
    years: years.sort((a, b) => b - a),
    forms: forms.map((form) => ({
      id: String(form._id),
      taxYear: form.taxYear,
      formType: form.formType,
      generatedAt: form.generatedAt
    }))
  });
});

router.get(
  '/bulletins',
  requirePermission('self.bulletins.view'),
  async (req: AuthRequest, res) => {
    const [bulletins, platformNotifications] = await Promise.all([
      CompanyBulletin.find({ companyId: req.employeeContext?.companyId }),
      PlatformNotification.find({ audience: { $in: ['employees', 'both'] } })
    ]);
    res.json(
      [...bulletins.map((item) => ({
        id: String(item._id),
        title: item.title,
        body: item.body,
        postedAt: item.postedAt,
        postedBy: item.postedBy,
        isRead: item.readByEmployeeIds.some(
          (employeeId) => String(employeeId) === req.employeeContext?.employeeId
        ), source: 'employer'
      })), ...platformNotifications.map((item) => ({
        id: String(item._id), title: item.title, body: item.body, postedAt: item.postedAt,
        postedBy: item.postedBy, audience: item.audience, source: 'platform',
        isRead: item.readByEmployeeIds.some((id) => String(id) === req.employeeContext?.employeeId)
      }))].sort((left, right) => new Date(right.postedAt).getTime() - new Date(left.postedAt).getTime())
    );
  }
);

router.post(
  '/bulletins/:id/read',
  requirePermission('self.bulletins.view'),
  async (req: AuthRequest, res) => {
    const bulletin = await CompanyBulletin.findOneAndUpdate(
      { _id: req.params.id, companyId: req.employeeContext?.companyId },
      { $addToSet: { readByEmployeeIds: req.employeeContext?.employeeId } },
      { new: true }
    );
    if (!bulletin) {
      const platform = await PlatformNotification.findOneAndUpdate(
        { _id: req.params.id, audience: { $in: ['employees', 'both'] } },
        { $addToSet: { readByEmployeeIds: req.employeeContext?.employeeId } },
        { new: true }
      );
      if (!platform) return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ id: req.params.id, isRead: true });
  }
);

router.post(
  '/bulletins/read-all',
  requirePermission('self.bulletins.view'),
  async (req: AuthRequest, res) => {
    await CompanyBulletin.updateMany(
      { companyId: req.employeeContext?.companyId },
      { $addToSet: { readByEmployeeIds: req.employeeContext?.employeeId } }
    );
    await PlatformNotification.updateMany(
      { audience: { $in: ['employees', 'both'] } },
      { $addToSet: { readByEmployeeIds: req.employeeContext?.employeeId } }
    );
    res.json({ success: true });
  }
);

router.get('/sin/unmask', requirePermission('employee.sin.view'), async (req: AuthRequest, res) => {
  await AuditLog.create({
    userId: req.user?.id,
    employeeId: req.employeeContext?.employeeId,
    companyId: req.employeeContext?.companyId,
    eventType: 'SIN_UNMASK'
  });
  res.status(403).json({ message: 'SIN unmask is not available in the employee portal' });
});

export default router;

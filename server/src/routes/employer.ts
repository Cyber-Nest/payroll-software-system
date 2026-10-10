import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuditLog } from '../models/AuditLog';
import { Company } from '../models/Company';
import { CompanyBulletin } from '../models/CompanyBulletin';
import { PlatformNotification } from '../models/PlatformNotification';
import { Employee, IEmployee } from '../models/Employee';
import { EmployerUser } from '../models/EmployerUser';
import { GovernmentFiling, GovernmentFilingType } from '../models/GovernmentFiling';
import { PayStatement } from '../models/PayStatement';
import { payslipPdf, payslipsPdf, PayslipPdfData, roePdf, t4sPdf, T4PdfData } from '../utils/pdf';
import { isInPayStatementYtd } from '../utils/payStatementYtd';
import { DeductionType } from '../models/DeductionType';
import { TaxFormDocument } from '../models/TaxFormDocument';
import { RoeDocument } from '../models/RoeDocument';
import { PayrollRun } from '../models/PayrollRun';
import { PayrollCarryForward } from '../models/PayrollCarryForward';
import { User } from '../models/User';
import {
  authenticate,
  AuthRequest,
  requirePermission,
  signEmployerToken
} from '../middleware/auth';
import { sendEmployeeCredentialsEmail } from '../services/employerWelcome.service';
import { emailService } from '../services/email.service';
import {
  normalizeProvince,
  vacationPolicyForProvince
} from '../services/vacationPolicy.service';
import {
  decimalToMoney,
  formatMoney,
  MoneyValue,
  moneyToDecimal,
  moneyToNumber,
  sumMoney
} from '../utils/money';
import { normalizeRole } from '../security/rbac';
import { roleNames, rolePermissions } from '../security/rbac';
import {
  decryptSin,
  encryptSin,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword
} from '../utils/security';
import { serializeEmployee } from '../utils/serializers';
import {
  assertPayrollTransition,
  calculatePayrollLine,
  payrollFrequencyRules,
  serializePayrollRun,
  stateHolidayPayRule2026,
  summarizePayrollLines
} from '../services/payrollWorkflow.service';
import { calculateStatutoryDeductions } from '../services/taxEngine.service';
import { env } from '../config/env';

const router = Router();

function settingDefaults(company?: InstanceType<typeof Company>) {
  const province = company?.address?.province || 'SK';
  const legalName = company?.legalName || '';
  const operatingName = company?.operatingName || legalName;
  const rp = String(company?.craPayroll?.programAccountNumber || company?.businessNumber || 'RP0001 2345 6789');
  return {
    general: {
      companyInformation: {
        legalCompanyName: legalName,
        operatingName,
        businessNumber: company?.businessNumber || '',
        craProgramAccountNumber: rp,
        address: company?.address?.street || '',
        city: company?.address?.city || '',
        province,
        postalCode: company?.address?.postalCode || '',
        phone: company?.customerCarePhone || '',
        email: company?.craPayroll?.email || '',
        website: company?.craPayroll?.website || ''
      },
      logoBranding: { brandName: 'Payhours', tagline: 'People • Hours • Pay • Simpler' },
      systemPreferences: { dateFormat: 'MMM d, yyyy', timeFormat: '12 Hour (AM/PM)', currency: 'CAD - Canadian Dollar ($)', itemsPerPage: '25', darkMode: false, language: 'English (Canada)' },
      yearEnd: { taxYearEnd: 'December 31', generateT4Automatically: true, generateRoeAutomatically: true }
    },
    payroll: {
      paySchedule: { payFrequency: company?.payrollConfiguration?.payFrequency || 'Bi-Weekly', firstPayPeriodStartDate: '2025-01-01', payPeriodLength: '2 Weeks', payDay: 'Friday', payPeriodNumbering: 'Continuous (1, 2, 3...)', currentPayPeriod: 'Apr 1, 2025 - Apr 15, 2025 (#24)' },
      calculation: { workHoursPerWeek: 40, dailyHours: 8, overtimeDaily: 8, overtimeWeekly: 40, doubleTimeAfter: 12, statutoryHolidayPay: 'As per Province Rules' },
      rounding: { hours: 'Nearest 0.25 hour', amounts: 'Nearest $0.01', minimumPayPerDay: 0, minimumPayPerPeriod: '0.00', roundOvertimeSeparately: true, roundTotalEarnings: true, applyRoundingToDeductions: false },
      payOptions: { defaultPaymentMethod: 'Direct Deposit', directDepositProvider: 'Manual / Bank Upload', allowMultipleBankAccounts: true, requireBankAccountForNewEmployees: true, generatePaystubsAutomatically: true, sendPaystubByEmail: true, allowManualPayroll: false, requireApprovalBeforeProcessing: true },
      additionalOptions: { defaultDepartment: 'Select Department', defaultPayGroup: 'Select Pay Group', includeZeroHourEmployees: false, allowRetroactivePayAdjustments: true, enableCosting: true, trackPto: true }
    },
    taxes: {
      configuration: { payProvince: province, craPayrollProgramAccountNumber: rp, fiscalYear: '2025', payrollType: 'Regular Payroll', useLatestCraTables: true },
      craTaxTables: { taxYear: '2025', province, lastUpdated: 'Jan 1, 2025' },
      additionalOptions: { applyBpa: true, applyProvincialCredits: true, applyCanadaEmploymentAmount: true, useTd1: true, allowAdditionalWithholding: true, enableQuebecTax: false },
      federal: { bpa: '$16,129.00', canadaEmploymentAmount: '$1,433.00', ageAmount: '$8,790.00', pensionIncomeAmount: '$2,000.00', disabilityAmount: '$9,428.00', caregiverAmount: '$2,616.00' },
      provincial: { bpa: '$22,125.00', lowIncomeTaxCredit: '$428.00', employmentAmount: '$1,463.00', pensionIncomeAmount: '$2,000.00', disabilityAmount: '$10,275.00', caregiverAmount: '$2,600.00' },
      cppEiQpip: [
        { item: 'CPP', employeeRate: '5.95%', employerRate: '5.95%', annualMaximum: '$71,300.00' },
        { item: 'EI', employeeRate: '1.66%', employerRate: '2.32%', annualMaximum: '$65,700.00' },
        { item: 'QPIP (QC)', employeeRate: '0.494%', employerRate: '0.692%', annualMaximum: '$94,000.00' },
        { item: 'QPP (QC)', employeeRate: '5.95%', employerRate: '5.95%', annualMaximum: '$71,300.00' }
      ]
    },
    timeAttendance: { defaults: { startTime: '9:00 AM', endTime: '5:00 PM', autoDeductBreak: 30, earlyClockIn: 10, lateClockOut: 10, managerApprovalForOt: true, trackGps: false, employeeEditTime: false } },
    paystubs: { template: 'Standard (Detailed)', title: 'Earnings Statement', payPeriodLabel: 'Pay Period', regularHourLabel: 'Regular Hours', overtimeHourLabel: 'Overtime Hours', doubleTimeHourLabel: 'Double Time Hours', rateDisplayFormat: 'Show $ per hour', showPayGroup: true, showDepartment: true, showJobTitle: true, showLocation: true, showEmployeeSin: false, maskSin: true, showHireDate: true, showAccruals: true, message: 'Thank you for your hard work!', disclaimer: 'This pay statement is for information purposes only. Please contact HR if you have any questions.', delivery: { availableInPortal: true, emailAutomatically: true, passwordProtectPdf: false, allowDownload: true, keepYears: '7 Years' } },
    payment: { methods: { defaultPaymentMethod: 'Direct Deposit', allowMultiplePaymentMethods: true, allowManualPayment: true, allowPaycard: false }, directDeposit: { timing: 'Same Day (on pay date)', fileFormat: 'EFT (Canadian NACHA) - .txt', uploadMethod: 'Manual Upload to Bank Portal', requirePreNote: true, allowForeignBankAccounts: true }, schedule: { day: 'Friday', time: '10:00 AM', daysBeforePayDate: 2, sendFileAutomatically: false, sendConfirmationEmail: true, includeZeroNetPay: false }, bank: { bankName: company?.banking?.bankName || 'Royal Bank of Canada (RBC)', accountHolderName: legalName, transitNumber: company?.banking?.transitNumber || '', institutionNumber: company?.banking?.institutionNumber || '', accountNumber: company?.banking?.accountNumber || '' }, notifications: { employeeConfirmations: true, adminConfirmations: true, failedPaymentAlerts: true, includePaystub: true, message: 'Your payroll has been processed. Please find your paystub attached.' }, security: { managerApproval: false, adminApproval: true, minimumApprovers: 1, editAfterApproval: false, lockAfterProcessing: true, twoFactor: true } },
    governmentFilings: { cra: { remittanceFrequency: 'Monthly (Regular)', nextRemittanceDueDate: '2025-05-15', remittanceMethod: 'EFT (My Business Account)', bankAccount: 'RBC Operating Account', generatePd7a: true, autofillFromPayrollRuns: true, validateBeforeSubmission: true }, provincial: { province, remittanceFrequency: 'Monthly', nextRemittanceDueDate: '2025-05-15', remittanceMethod: 'EFT (eTax Services)', generateProvincialReturn: true, autofillFromPayrollRuns: true }, yearEnd: { taxYear: '2025', filingMethod: 'CRA Web Forms / EFILE', autoGenerateT4: true, autoGenerateT4A: false, includeRl1: false, includeT4Summary: true, electronicFiling: true, createReleve1: false }, notifications: { dueReminder: true, daysBefore: 5, success: true, errors: true, summary: true, yearEnd: true, email: 'admin@abcsolutions.ca', recipients: 'hr@abcsolutions.ca, finance@abcsolutions.ca' }, advanced: { includeZeroAmountSlips: true, useYtdTotals: true, enableTestFiling: true, logActivities: true, retainYears: '7 Years', defaultContact: 'Company Admin' } },
    integrations: { api: { apiKey: '••••••••••••••••', apiSecret: '••••••••••••••••' }, webhooks: { enabled: true, url: '', events: ['Payroll Completed', 'Employee Added', 'Government Filing Submitted'] } },
    notifications: { preferences: { email: true, inApp: true, sms: false, digest: true, language: 'English (Canada)', timeZone: '(GMT-06:00) Saskatchewan' }, email: { fromName: 'Payhours Payroll', fromEmail: 'noreply@payhours.ca', replyTo: 'support@payhours.ca' }, recipients: { payroll: 'Admin Only', government: 'Admin & Accountant', system: 'Admin Only', employeeSelfService: 'Employees', failedPayment: 'Admin & Payroll Manager', security: 'Admin Only' }, reminders: { payrollApproval: 2, governmentFiling: 5, documentExpiry: 14, inactiveEmployee: 30 } }
  };
}

function mergeSettings(defaults: Record<string, unknown>, saved?: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...defaults };
  for (const [key, value] of Object.entries(saved || {})) {
    output[key] = value && typeof value === 'object' && !Array.isArray(value)
      ? mergeSettings((defaults[key] as Record<string, unknown>) || {}, value as Record<string, unknown>)
      : value;
  }
  return output;
}

function companyModuleDefaults(company: InstanceType<typeof Company>, employees: IEmployee[]) {
  const province = company.address?.province || 'SK';
  const city = company.address?.city || 'Yorkton';
  const legalName = company.legalName || 'ABC Solutions Inc.';
  const employeeCounts = employees.reduce<Record<string, number>>((counts, employee) => {
    const department = String(employee.adminProfile?.employment?.department || 'Operations');
    counts[department] = (counts[department] || 0) + 1;
    return counts;
  }, {});
  const departments = [
    ['Kitchen', 'KCH', 'All Locations', 18, 'Kitchen staff including cooks, prep staff and dishwashers.'],
    ['Front of House', 'FOH', 'All Locations', 22, 'Servers, cashiers and customer-facing team members.'],
    ['Management', 'MGT', 'All Locations', 8, 'Store and restaurant leadership team.'],
    ['Administration', 'ADM', 'Head Office', 5, 'Office administration and business support.'],
    ['Delivery', 'DLV', 'Medicine Hat, Yorkton', 12, 'Delivery drivers and logistics staff.'],
    ['Maintenance', 'MNT', 'All Locations', 3, 'Facilities and equipment maintenance.'],
    ['Human Resources', 'HR', 'Head Office', 4, 'Recruiting, onboarding and employee relations.'],
    ['Finance & Accounting', 'FIN', 'Head Office', 6, 'Payroll, accounting and financial operations.'],
    ['Marketing', 'MKT', 'Head Office', 3, 'Campaigns and local promotions.'],
    ['Purchasing', 'PUR', 'All Locations', 2, 'Procurement and vendor management.']
  ].map(([name, code, locations, fallbackEmployees, description], index) => ({
    id: code,
    index: index + 1,
    name,
    code,
    locations,
    employees: employeeCounts[String(name)] || Number(fallbackEmployees),
    status: 'Active',
    description
  }));
  const jobPositions = [
    ['Restaurant Manager', 'RM', 'Management', 'Hourly', '$32.00', 3],
    ['Assistant Manager', 'ASM', 'Management', 'Hourly', '$26.00', 5],
    ['Shift Supervisor', 'SUP', 'Front of House', 'Hourly', '$22.00', 4],
    ['Crew Member', 'CREW', 'Front of House', 'Hourly', '$17.50', 18],
    ['Kitchen Staff', 'KCH', 'Kitchen', 'Hourly', '$18.00', 10],
    ['Cashier', 'CSH', 'Front of House', 'Hourly', '$18.00', 6],
    ['Delivery Driver', 'DRV', 'Delivery', 'Hourly', '$19.00', 4],
    ['Maintenance Technician', 'MNT', 'Maintenance', 'Hourly', '$24.00', 2],
    ['Accountant', 'ACC', 'Finance & Accounting', 'Salary', '$65,000.00', 1],
    ['HR Coordinator', 'HR', 'Human Resources', 'Salary', '$55,000.00', 1]
  ].map(([title, code, department, payType, rate, count], index) => ({
    id: code,
    index: index + 1,
    title,
    code,
    department,
    payType,
    defaultPayRate: rate,
    employees: count,
    status: index === 9 ? 'Inactive' : 'Active',
    standardHours: 40,
    description: 'Oversee daily restaurant operations, manage staff, ensure customer satisfaction, maintain food safety standards, and achieve sales targets.'
  }));
  const paySchedules = [
    ['Bi-Weekly (SK)', 'Bi-Weekly', '14 days\nSun - Sat', 'Every 2nd Friday', 24],
    ['Weekly (Hourly)', 'Weekly', '7 days\nSun - Sat', 'Every Friday', 8],
    ['Semi-Monthly (Salary)', 'Semi-Monthly', '1st - 15th\n16th - EOM', '15th & Last day', 5],
    ['Monthly (Management)', 'Monthly', '1 month\n1st - EOM', 'Last business day', 0]
  ].map(([name, frequency, payPeriod, regularPayDays, count], index) => ({ id: String(index + 1), index: index + 1, name, frequency, payPeriod, regularPayDays, employees: count, status: 'Active' }));
  const holidays = [
    ['New Year’s Day', 'Jan 1, 2025', 'Wed', 'Statutory', 'All Locations'],
    ['Family Day', 'Feb 17, 2025', 'Mon', 'Statutory', 'Saskatchewan'],
    ['Good Friday', 'Apr 18, 2025', 'Fri', 'Statutory', 'All Locations'],
    ['Victoria Day', 'May 19, 2025', 'Mon', 'Statutory', 'All Locations'],
    ['Canada Day', 'Jul 1, 2025', 'Tue', 'Statutory', 'All Locations'],
    ['Civic Holiday', 'Aug 4, 2025', 'Mon', 'Statutory', 'Saskatchewan'],
    ['Labour Day', 'Sep 1, 2025', 'Mon', 'Statutory', 'All Locations'],
    ['National Day for Truth and Reconciliation', 'Sep 30, 2025', 'Tue', 'Statutory', 'All Locations'],
    ['Thanksgiving Day', 'Oct 13, 2025', 'Mon', 'Statutory', 'Saskatchewan'],
    ['Christmas Day', 'Dec 25, 2025', 'Thu', 'Statutory', 'All Locations'],
    ['Boxing Day', 'Dec 26, 2025', 'Fri', 'Statutory', 'All Locations'],
    ['Diwali', 'Oct 20, 2025', 'Mon', 'Custom', 'All Locations']
  ].map(([name, date, day, type, appliesTo], index) => ({ id: String(index + 1), index: index + 1, name, date, day, type, appliesTo, paidHours: '8.00', status: 'Active' }));
  const locations = [
    { id: 'head-office', index: 1, name: `${legalName.replace('ABC Solutions Inc.', 'McDonald’s')} ${city}`, address: '123 Broadway Street\nYorkton, SK\nS3N 2V8', city, province, employees: 18, status: 'Active', badge: 'Head Office' },
    { id: 'medicine-hat', index: 2, name: 'Pizza Hut Medicine Hat', address: '2005 Strachan Road SE\nMedicine Hat, AB\nT1B 4V2', city: 'Medicine Hat', province: 'AB', employees: 12, status: 'Active' },
    { id: 'winnipeg', index: 3, name: 'Chicken Delight Winnipeg', address: '123 Main Street\nWinnipeg, MB\nR2C 3A1', city: 'Winnipeg', province: 'MB', employees: 6, status: 'Active' },
    { id: 'langley', index: 4, name: 'Barburrito Langley', address: '456 Fraser Highway\nLangley, BC\nV3A 7N1', city: 'Langley', province: 'BC', employees: 1, status: 'Active' }
  ];
  return {
    profile: {
      legalName,
      operatingName: company.operatingName || legalName,
      industry: company.industry || 'Restaurant / Food Services',
      companySize: '1 - 50 Employees',
      businessNumber: company.businessNumber || '',
      payrollAccountNumber: company.craPayroll?.programAccountNumber || company.businessNumber || '',
      incorporationDate: '2020-01-15',
      primaryContactName: company.craPayroll?.primaryContactName || 'Anil Kumar',
      primaryContactEmail: company.craPayroll?.primaryContactEmail || 'admin@abcsolutions.ca',
      primaryContactPhone: company.customerCarePhone || '+1 306-555-0101',
      website: company.craPayroll?.website || 'https://www.abcsolutions.ca',
      addressLine1: company.address?.street || '123 Main Street',
      addressLine2: company.address?.line2 || 'Suite 100',
      city,
      province,
      postalCode: company.address?.postalCode || 'S3N 2V8',
      country: company.address?.country || 'Canada',
      currency: 'CAD - Canadian Dollar',
      language: 'English (Canada)',
      dateFormat: 'MMM DD, YYYY (Jan 15, 2025)',
      timeZone: '(GMT-06:00) Saskatchewan',
      plan: company.subscription?.plan || 'Pro',
      subscriptionStatus: 'Active',
      renewalDate: 'Dec 31, 2025',
      billingEmail: 'admin@abcsolutions.ca',
      hrEmail: 'hr@abcsolutions.ca',
      payrollEmail: 'payroll@abcsolutions.ca',
      apEmail: 'ap@abcsolutions.ca',
      infoEmail: 'info@abcsolutions.ca'
    },
    locations,
    departments,
    jobPositions,
    paySchedules,
    payRates: jobPositions.map((job, index) => ({ id: job.id, index: index + 1, jobPosition: job.title, department: job.department, payType: job.payType, payRate: job.payType === 'Salary' ? `${job.defaultPayRate} / year` : job.defaultPayRate, effectiveDate: index === 3 ? 'Mar 1, 2025' : 'Jan 1, 2025', status: 'Active' })),
    holidays,
    accruals: [
      { id: 'vac', index: 1, name: 'Vacation', type: 'Paid Time Off', method: 'Percentage', rate: '4%', eligibility: 'All Employees', status: 'Active' },
      { id: 'sick', index: 2, name: 'Sick Leave', type: 'Paid Leave', method: 'Hours Per Year', rate: '40 hours', eligibility: 'Full-Time', status: 'Active' },
      { id: 'pto', index: 3, name: 'Personal Time Off', type: 'Paid Time Off', method: 'Fixed Hours', rate: '24 hours', eligibility: 'After Probation', status: 'Active' }
    ],
    bankAccounts: [
      { id: 'payroll', index: 1, name: 'Payroll Account', bankName: company.banking?.bankName || 'RBC Royal Bank', accountType: 'Payroll', accountNumber: `****${String(company.banking?.accountNumber || '1234').slice(-4)}`, transitNumber: company.banking?.transitNumber || '01234', status: 'Active', notes: 'Main payroll account for employee direct deposits.' },
      { id: 'tax', index: 2, name: 'Tax Remittance', bankName: 'TD Canada Trust', accountType: 'Tax Payment', accountNumber: '****5678', transitNumber: '56789', status: 'Active' },
      { id: 'operating', index: 3, name: 'General Operating', bankName: 'Scotiabank', accountType: 'General', accountNumber: '****9012', transitNumber: '90123', status: 'Active' },
      { id: 'reimbursements', index: 4, name: 'Employee Reimbursements', bankName: 'BMO', accountType: 'Other', accountNumber: '****3456', transitNumber: '34567', status: 'Inactive' }
    ],
    settings: {
      general: { payrollYearStart: '2025-01-01', firstPayPeriodStart: '2025-01-01', fiscalYearEnd: '2025-12-31' },
      payroll: { defaultPaymentFrequency: company.payrollConfiguration?.payFrequency || 'Bi-Weekly', defaultTaxProvince: province },
      display: { country: 'Canada', province, timeZone: '(UTC-06:00) Saskatchewan', dateFormat: 'MMM dd, yyyy (Jan 15, 2025)', timeFormat: '12 Hour (1:00 PM)', currency: 'CAD - Canadian Dollar ($)', language: 'English (Canada)' }
    }
  };
}

function requireEmployer(req: AuthRequest, res: import('express').Response): string | undefined {
  const companyId = req.employerContext?.companyId;
  if (!companyId) {
    res.status(403).json({ message: 'Employer context is required' });
    return undefined;
  }
  return companyId;
}
function safeMoneyToNumber(value: MoneyValue | null | undefined): number {
  if (value === null || value === undefined) return 0;
  try {
    return moneyToNumber(value);
  } catch {
    return 0;
  }
}

function safeFormatMoney(value: MoneyValue | null | undefined): string {
  return formatMoney(safeMoneyToNumber(value));
}

function payrollLineGovernmentLiability(line: {
  cpp?: MoneyValue;
  cpp2?: MoneyValue;
  ei?: MoneyValue;
  federalTax?: MoneyValue;
  provincialTax?: MoneyValue;
}): MoneyValue {
  const cpp = sumMoney([line.cpp || 0, line.cpp2 || 0]);
  const ei = moneyToDecimal(line.ei || 0);
  return sumMoney([
    cpp,
    ei,
    line.federalTax || 0,
    line.provincialTax || 0,
    cpp,
    ei.times(1.4)
  ]);
}

type DisplayLine = {
  code?: string;
  description?: string;
  amount: MoneyValue | string;
  ytd?: string;
  currentUnits?: string;
  ytdUnits?: string;
  rate?: string;
};

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

function deductionTotalAmount(lines: Array<{ code?: string; amount?: MoneyValue | string }>): MoneyValue {
  const explicitTotal = lines.find((line) => line.code === 'TOTAL')?.amount;
  const lineTotal = sumMoney(
    lines
      .filter((line) => line.code !== 'TOTAL' && line.amount !== undefined)
      .map((line) => line.amount as MoneyValue)
  );
  if (explicitTotal === undefined || explicitTotal === null) return lineTotal;
  if (moneyToNumber(explicitTotal) === 0 && moneyToNumber(lineTotal) !== 0) {
    return lineTotal;
  }
  return explicitTotal;
}

function payrollRunIdForStatement(statement: { additionalInfo?: Array<{ key?: string; value?: string }> }) {
  return statement.additionalInfo?.find((line) => line.key === 'Payroll Run')?.value || '';
}

function statutoryDeductionsFromGross(
  grossPay: MoneyValue | string | undefined,
  province: string | undefined,
  payPeriods: number,
  preTaxDeductions: MoneyValue | string = 0,
  postTaxDeductions: MoneyValue | string = 0
) {
  const statutory = calculateStatutoryDeductions({
    grossPay: moneyToDecimal(grossPay || 0).minus(moneyToDecimal(preTaxDeductions)),
    province: employerPayrollProvince(province || 'AB'),
    payPeriods
  });
  const provincialTax = statutory.incomeTax.minus(statutory.federalTax);
  const deductionsTotal = sumMoney([statutory.totalDeductions, preTaxDeductions, postTaxDeductions]);
  return {
    cpp: decimalToMoney(statutory.cpp),
    cpp2: decimalToMoney(statutory.cpp2),
    ei: decimalToMoney(statutory.ei),
    federalTax: decimalToMoney(statutory.federalTax),
    provincialTax: decimalToMoney(provincialTax),
    deductionsTotal: decimalToMoney(deductionsTotal)
  };
}

function payrollRunDeductionsForStatement(
  statement: { employeeId: unknown; additionalInfo?: Array<{ key?: string; value?: string }> },
  runsById: Map<string, InstanceType<typeof PayrollRun>>,
  fallbackProvince?: string
) {
  const run = runsById.get(payrollRunIdForStatement(statement));
  if (!run) return undefined;
  const statementEmployeeId = String(
    (statement.employeeId as { _id?: unknown } | undefined)?._id || statement.employeeId
  );
  const line = run.lines.find((item) => String(item.employeeId) === statementEmployeeId);
  if (!line) return undefined;
  const payPeriods = payrollFrequencyRules[run.payFrequency || 'biweekly'].payPeriods;
  const statutoryDetailTotal = moneyToNumber(
    sumMoney([line.cpp || 0, line.cpp2 || 0, line.ei || 0, line.federalTax || 0, line.provincialTax || 0])
  );
  const lineDeductionsTotal = moneyToNumber(line.deductionsTotal || 0);
  const effectiveLine =
    statutoryDetailTotal === 0 && lineDeductionsTotal !== 0
      ? {
          ...line,
          ...statutoryDeductionsFromGross(
            line.grossPay,
            line.statePayProvince || fallbackProvince,
            payPeriods,
            line.preTaxDeductions,
            line.postTaxDeductions
          )
        }
      : line;
  return [
    { code: 'CPP', description: 'CPP', amount: effectiveLine.cpp },
    { code: 'CPP2', description: 'Additional CPP', amount: effectiveLine.cpp2 },
    { code: 'EI', description: 'EI', amount: effectiveLine.ei },
    { code: 'FTAX', description: 'Federal tax', amount: effectiveLine.federalTax },
    { code: 'PTAX', description: 'Provincial income tax', amount: effectiveLine.provincialTax },
    { code: 'PRE', description: 'Other pre-tax deductions', amount: effectiveLine.preTaxDeductions },
    { code: 'POST', description: 'Other post-tax deductions', amount: effectiveLine.postTaxDeductions },
    { code: 'TOTAL', description: 'Total deductions', amount: effectiveLine.deductionsTotal }
  ];
}

function effectiveStatementDeductions(
  statement: {
    employeeId: unknown;
    deductions: Array<{ code?: string; description?: string; amount?: MoneyValue | string }>;
    grossPay?: MoneyValue | string;
    grossEarnings?: Array<{ code?: string; amount?: MoneyValue | string }>;
    netPay?: MoneyValue | string;
    payDate?: Date;
    additionalInfo?: Array<{ key?: string; value?: string }>;
  },
  runsById: Map<string, InstanceType<typeof PayrollRun>>,
  fallbackProvince?: string,
  fallbackPayFrequency: keyof typeof payrollFrequencyRules = 'biweekly'
) {
  const currentTotal = moneyToNumber(deductionTotalAmount(statement.deductions));
  const grossPay =
    statement.grossPay || statement.grossEarnings?.find((line) => line.code === 'TOTAL')?.amount || 0;
  const inferredTotal = moneyToNumber(grossPay) - moneyToNumber(statement.netPay || 0);
  const effectiveTotal = currentTotal || (inferredTotal > 0 ? inferredTotal : 0);
  const statutoryDetailTotal = moneyToNumber(
    sumMoney(
      statement.deductions
        .filter((line) => ['CPP', 'CPP2', 'EI', 'FTAX', 'PTAX'].includes(String(line.code || '').toUpperCase()))
        .map((line) => line.amount || 0)
    )
  );
  if (currentTotal !== 0 && statutoryDetailTotal !== 0) return statement.deductions;
  const runDeductions = payrollRunDeductionsForStatement(statement, runsById, fallbackProvince);
  const runDeductionsTotal = runDeductions ? moneyToNumber(deductionTotalAmount(runDeductions)) : 0;
  const runDetailTotal = runDeductions
    ? moneyToNumber(
        sumMoney(
          runDeductions
            .filter((line) => ['CPP', 'CPP2', 'EI', 'FTAX', 'PTAX'].includes(String(line.code || '').toUpperCase()))
            .map((line) => line.amount || 0)
        )
      )
    : 0;
  if (runDeductions && runDeductionsTotal !== 0 && runDetailTotal !== 0) return runDeductions;
  if (effectiveTotal !== 0 && statutoryDetailTotal === 0) {
    const rebuilt = statutoryDeductionsFromGross(
      grossPay,
      fallbackProvince,
      payrollFrequencyRules[fallbackPayFrequency].payPeriods
    );
    return [
      { code: 'CPP', description: 'CPP', amount: rebuilt.cpp },
      { code: 'CPP2', description: 'Additional CPP', amount: rebuilt.cpp2 },
      { code: 'EI', description: 'EI', amount: rebuilt.ei },
      { code: 'FTAX', description: 'Federal tax', amount: rebuilt.federalTax },
      { code: 'PTAX', description: 'Provincial income tax', amount: rebuilt.provincialTax },
      { code: 'TOTAL', description: 'Total deductions', amount: rebuilt.deductionsTotal }
    ];
  }
  return statement.deductions;
}

function lineDescriptionIncludes(line: { description?: string }, values: string[]) {
  const description = normalizedDisplayText(line.description);
  return values.some((value) => description.includes(value));
}

function displayEarningLines<T extends DisplayLine>(lines: T[]) {
  return lines.filter((line) => {
    const code = String(line.code || '').toUpperCase();
    if (
      code === 'OT' &&
      moneyToNumber(line.amount) === 0 &&
      moneyToNumber(line.ytd || 0) === 0 &&
      Number(line.currentUnits || 0) === 0 &&
      Number(line.ytdUnits || 0) === 0
    ) {
      return false;
    }
    const optional =
      optionalEarningCodes.has(code) || lineDescriptionIncludes(line, optionalEarningDescriptions);
    return !optional || moneyToNumber(line.amount) !== 0;
  });
}

function displayDeductionLines<T extends DisplayLine>(lines: T[]) {
  return lines
    .filter((line) => {
      const code = String(line.code || '').toUpperCase();
      if (optionalZeroDeductionCodes.has(code) && moneyToNumber(line.amount) === 0) {
        return false;
      }
      if (code !== 'TOTAL' && !requiredStatutoryDeductionCodes.has(code) && moneyToNumber(line.amount) === 0) return false;
      return !hiddenDeductionCodes.has(code) && !lineDescriptionIncludes(line, hiddenDeductionDescriptions);
    })
    .map((line) => ({
      ...line,
      description: payrollDeductionLabel(line.code, line.description)
    }));
}

function dateLabel(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}
const bulletinSchema = z.object({
  title: z.string().trim().min(2).max(100),
  body: z.string().trim().min(2).max(1000)
});

router.get(
  '/bulletins',
  authenticate,
  requirePermission('bulletins.manage'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const [bulletins, platformNotifications, employeeCount] = await Promise.all([
      CompanyBulletin.find({ companyId }).sort({ postedAt: -1 }),
      PlatformNotification.find({ audience: { $in: ['employers', 'both'] } }).sort({ postedAt: -1 }),
      Employee.countDocuments({ companyId })
    ]);
    res.json({
      bulletins: bulletins.map((item) => ({
        id: String(item._id),
        title: item.title,
        body: item.body,
        postedAt: item.postedAt,
        postedBy: item.postedBy || 'Employer',
        readCount: item.readByEmployeeIds.length,
        employeeCount
      })),
      platformNotifications: platformNotifications.map((item) => ({
        id: String(item._id), title: item.title, body: item.body, audience: item.audience,
        postedAt: item.postedAt, postedBy: item.postedBy, source: 'platform',
        isRead: item.readByEmployerUserIds.some(
          (id) => String(id) === req.employerContext?.employerUserId
        )
      }))
    });
  }
);

router.post(
  '/platform-notifications/:id/read',
  authenticate,
  requirePermission('reports.view'),
  async (req: AuthRequest, res) => {
    const notification = await PlatformNotification.findOneAndUpdate(
      { _id: req.params.id, audience: { $in: ['employers', 'both'] } },
      { $addToSet: { readByEmployerUserIds: req.employerContext?.employerUserId } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json({ id: String(notification._id), isRead: true });
  }
);

router.post(
  '/bulletins',
  authenticate,
  requirePermission('bulletins.manage'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const parsed = bulletinSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: 'Invalid notification', issues: parsed.error.issues });
    const employer = await EmployerUser.findById(req.employerContext?.employerUserId);
    const bulletin = await CompanyBulletin.create({
      companyId,
      ...parsed.data,
      postedAt: new Date(),
      postedBy: employer?.name || 'Employer',
      readByEmployeeIds: []
    });
    await AuditLog.create({
      userId: req.employerContext?.employerUserId,
      companyId,
      eventType: 'COMPANY_NOTIFICATION_PUBLISHED',
      metadata: { bulletinId: String(bulletin._id), title: bulletin.title }
    });
    res.status(201).json({ id: String(bulletin._id) });
  }
);

router.delete(
  '/bulletins/:id',
  authenticate,
  requirePermission('bulletins.manage'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const bulletin = await CompanyBulletin.findOneAndDelete({ _id: req.params.id, companyId });
    if (!bulletin) return res.status(404).json({ message: 'Notification not found' });
    await AuditLog.create({
      userId: req.employerContext?.employerUserId,
      companyId,
      eventType: 'COMPANY_NOTIFICATION_DELETED',
      metadata: { bulletinId: String(bulletin._id), title: bulletin.title }
    });
    res.json({ success: true });
  }
);

router.get('/settings', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const [company, users, employees, deductions, filings, paystubs] = await Promise.all([
    Company.findById(companyId),
    EmployerUser.find({ $or: [{ companyId }, { companyIds: companyId }] }).sort({ name: 1 }),
    Employee.find({ companyId }).sort({ employeeNumber: 1 }).limit(20),
    DeductionType.find({ $or: [{ employerId: companyId }, { employerId: { $exists: false } }] }).sort({ mandatory: -1, name: 1 }),
    GovernmentFiling.find({ companyId }).sort({ dueDate: -1 }).limit(12),
    PayStatement.find({ companyId, supersededByStatementId: { $exists: false } }).sort({ payDate: -1 }).limit(1)
  ]);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  const settings = mergeSettings(settingDefaults(company), company.settings || {});
  const roleCounts = new Map<string, number>();
  users.forEach((user) => roleCounts.set(normalizeRole(user.role), (roleCounts.get(normalizeRole(user.role)) || 0) + 1));
  const roles = roleNames
    .filter((role) => role !== 'CyberNest Super Admin')
    .map((role, index) => ({
      id: role,
      index: index + 1,
      name: role === 'Company Owner' ? 'Super Admin' : role.replace('Payroll Administrator', 'Payroll Admin').replace('HR Administrator', 'HR Manager'),
      description: role === 'Company Owner' ? 'Full access to all modules' : role === 'Employee' ? 'Self service access' : `Manage ${role.toLowerCase()} access`,
      users: roleCounts.get(role) || 0,
      status: 'Active',
      permissions: rolePermissions[role]
    }));
  res.json({
    settings,
    company: {
      id: String(company._id),
      legalName: company.legalName,
      operatingName: company.operatingName,
      businessNumber: company.businessNumber,
      address: company.address,
      customerCarePhone: company.customerCarePhone
    },
    users: users.map((user, index) => ({
      id: String(user._id),
      index: index + 1,
      name: user.name,
      email: user.email,
      role: normalizeRole(user.role).replace('Payroll Administrator', 'Payroll Admin').replace('HR Administrator', 'HR Manager').replace('Company Owner', 'Super Admin'),
      status: user.isActive ? 'Active' : 'Inactive',
      lastLogin: user.lastLoginAt ? user.lastLoginAt.toISOString() : ''
    })),
    roles,
    employees: employees.map((employee) => ({
      id: String(employee._id),
      name: employeeDisplayName(employee),
      employeeNumber: employee.employeeNumber,
      department: employee.adminProfile?.employment?.department || 'Operations',
      jobTitle: employee.occupation || employee.adminProfile?.employment?.jobTitle || ''
    })),
    deductions: deductions.map((item, index) => ({
      id: String(item._id),
      index: index + 1,
      name: item.name,
      type: item.kind === 'statutory' ? 'Statutory' : item.customType === 'custom' ? 'Other' : 'Voluntary',
      calculationMethod: item.calculationMethod === 'fixed' ? 'Flat Amount' : item.calculationMethod === 'percentage' ? 'Percentage' : 'CRA Formula',
      defaultValue: item.value ? `$${item.value.toString()}` : item.kind === 'statutory' ? 'Auto' : 'Custom',
      appliesTo: item.employeeScope === 'all' || item.mandatory ? 'All Employees' : 'Selected',
      taxable: item.includeInCraReports ? 'Yes' : 'No',
      status: item.status === 'active'
    })),
    benefits: ((settings.deductionsBenefits as Record<string, unknown> | undefined)?.benefits as unknown[]) || [
      { name: 'Extended Health Care', type: 'Health', calculationMethod: 'Employer Paid', defaultValue: '$100.00/month', appliesTo: 'Selected', taxable: 'No', status: true },
      { name: 'Dental Care', type: 'Health', calculationMethod: 'Employer Paid', defaultValue: '$75.00/month', appliesTo: 'Selected', taxable: 'No', status: true },
      { name: 'RRSP Contribution', type: 'Retirement', calculationMethod: 'Percentage', defaultValue: '3%', appliesTo: 'Selected', taxable: 'Yes', status: true }
    ],
    filings: filings.map((filing) => ({
      id: String(filing._id),
      filingType: filing.title || filing.type,
      period: filing.period,
      dueDate: filing.dueDate,
      amount: safeFormatMoney(filing.amount),
      status: filing.status,
      referenceNumber: filing.reference || filing.confirmationNumber || ''
    })),
    samplePaystub: paystubs[0] ? { id: String(paystubs[0]._id), payDate: paystubs[0].payDate, netPay: safeFormatMoney(paystubs[0].netPay), grossPay: safeFormatMoney(paystubs[0].grossPay) } : undefined
  });
});

router.put('/settings', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const parsed = z.object({ settings: z.record(z.string(), z.unknown()) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid settings payload', issues: parsed.error.issues });
  const company = await Company.findById(companyId);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  company.settings = mergeSettings(company.settings || {}, parsed.data.settings);
  const general = (company.settings.general as Record<string, unknown> | undefined)?.companyInformation as Record<string, unknown> | undefined;
  const payment = (company.settings.payment as Record<string, unknown> | undefined)?.bank as Record<string, unknown> | undefined;
  const payroll = (company.settings.payroll as Record<string, unknown> | undefined)?.paySchedule as Record<string, unknown> | undefined;
  if (general) {
    company.legalName = String(general.legalCompanyName || company.legalName);
    company.operatingName = String(general.operatingName || company.operatingName || company.legalName);
    company.businessNumber = String(general.businessNumber || company.businessNumber || '');
    company.customerCarePhone = String(general.phone || company.customerCarePhone || '');
    company.address = { ...(company.address || {}), street: String(general.address || ''), city: String(general.city || ''), province: String(general.province || ''), postalCode: String(general.postalCode || ''), country: 'Canada' };
    company.craPayroll = { ...(company.craPayroll || {}), programAccountNumber: general.craProgramAccountNumber, email: general.email, website: general.website };
  }
  if (payment) company.banking = { ...(company.banking || {}), ...payment };
  if (payroll) company.payrollConfiguration = { ...(company.payrollConfiguration || {}), payFrequency: payroll.payFrequency };
  await company.save();
  await AuditLog.create({ userId: req.employerContext?.employerUserId, companyId, eventType: 'EMPLOYER_UPDATED', metadata: { action: 'Settings updated' } });
  res.json({ settings: mergeSettings(settingDefaults(company), company.settings || {}) });
});

router.get('/company-module', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const [company, employees] = await Promise.all([
    Company.findById(companyId),
    Employee.find({ companyId }).sort({ employeeNumber: 1 })
  ]);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  const defaults = companyModuleDefaults(company, employees);
  const saved = (company.settings?.companyModule || {}) as Record<string, unknown>;
  const module = mergeSettings(defaults, saved);
  res.json({
    companyModule: module,
    summary: {
      totalEmployees: employees.length,
      activeEmployees: employees.filter((employee) => employee.adminProfile?.employment?.employmentStatus !== 'Inactive').length,
      departments: Object.keys(employees.reduce<Record<string, true>>((acc, employee) => {
        acc[String(employee.adminProfile?.employment?.department || 'Operations')] = true;
        return acc;
      }, {})).length
    },
    employees: employees.map((employee) => ({
      id: String(employee._id),
      name: employeeDisplayName(employee),
      employeeNumber: employee.employeeNumber,
      department: employee.adminProfile?.employment?.department || 'Operations',
      jobTitle: employee.occupation || employee.adminProfile?.employment?.jobTitle || '',
      location: employee.adminProfile?.employment?.location || company.address?.city || ''
    }))
  });
});

router.put('/company-module', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const parsed = z.object({ companyModule: z.record(z.string(), z.unknown()) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid company payload', issues: parsed.error.issues });
  const company = await Company.findById(companyId);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  company.settings = {
    ...(company.settings || {}),
    companyModule: mergeSettings((company.settings?.companyModule || {}) as Record<string, unknown>, parsed.data.companyModule)
  };
  const profile = ((company.settings.companyModule as Record<string, unknown>).profile || {}) as Record<string, unknown>;
  company.legalName = String(profile.legalName || company.legalName);
  company.operatingName = String(profile.operatingName || company.operatingName || company.legalName);
  company.businessNumber = String(profile.businessNumber || company.businessNumber || '');
  company.industry = String(profile.industry || company.industry || '');
  company.customerCarePhone = String(profile.primaryContactPhone || company.customerCarePhone || '');
  company.address = {
    ...(company.address || {}),
    street: String(profile.addressLine1 || company.address?.street || ''),
    line2: String(profile.addressLine2 || company.address?.line2 || ''),
    city: String(profile.city || company.address?.city || ''),
    province: String(profile.province || company.address?.province || ''),
    postalCode: String(profile.postalCode || company.address?.postalCode || ''),
    country: String(profile.country || company.address?.country || 'Canada')
  };
  company.craPayroll = {
    ...(company.craPayroll || {}),
    programAccountNumber: profile.payrollAccountNumber,
    primaryContactName: profile.primaryContactName,
    primaryContactEmail: profile.primaryContactEmail,
    website: profile.website
  };
  await company.save();
  await AuditLog.create({ userId: req.employerContext?.employerUserId, companyId, eventType: 'EMPLOYER_UPDATED', metadata: { action: 'Company module updated' } });
  res.json({ companyModule: mergeSettings(companyModuleDefaults(company, []), (company.settings.companyModule || {}) as Record<string, unknown>) });
});

router.get('/documents', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const [company, employees, taxForms, roes, filings, paystubs] = await Promise.all([
    Company.findById(companyId),
    Employee.find({ companyId }).sort({ employeeNumber: 1 }),
    TaxFormDocument.find({ companyId }).sort({ generatedAt: -1 }),
    RoeDocument.find({ companyId }).sort({ generatedAt: -1 }),
    GovernmentFiling.find({ companyId }).sort({ dueDate: -1 }),
    PayStatement.find({ companyId, supersededByStatementId: { $exists: false } }).sort({ payDate: -1 }).limit(80)
  ]);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const savedDocuments = (((company.settings || {}).documents || []) as Array<Record<string, unknown>>).map((item, index) => ({
    id: String(item.id || `company-${index}`),
    fileName: String(item.fileName || item.name || 'Company document'),
    type: String(item.type || 'Policy'),
    category: String(item.category || 'Company'),
    relatedTo: String(item.relatedTo || 'Company'),
    employeeId: String(item.employeeId || ''),
    uploadDate: String(item.uploadDate || company.createdAt?.toISOString() || new Date().toISOString()),
    size: String(item.size || '0 KB'),
    status: String(item.status || 'Active'),
    uploadedBy: String(item.uploadedBy || 'Admin User'),
    description: String(item.description || ''),
    tags: Array.isArray(item.tags) ? item.tags : ['Company'],
    source: 'company'
  }));
  const taxDocuments = taxForms.map((document) => {
    const employee = employeeById.get(String(document.employeeId));
    const employeeName = employee ? employeeDisplayName(employee) : 'Employee';
    return {
      id: String(document._id),
      fileName: `${document.formType}_${document.taxYear}_${employeeName.replace(/\s+/g, '_')}.pdf`,
      type: document.formType,
      category: 'Government',
      relatedTo: employee ? `${employeeName} (${employee.employeeNumber})` : employeeName,
      employeeId: String(document.employeeId),
      taxYear: document.taxYear,
      uploadDate: document.generatedAt.toISOString(),
      size: '245 KB',
      status: 'Filed',
      uploadedBy: 'Admin User',
      description: `${document.formType} slip for tax year ${document.taxYear}`,
      tags: [document.formType, String(document.taxYear), 'CRA'],
      source: 'tax-form',
      downloadUrl: document.fileUrl || ''
    };
  });
  const roeDocuments = roes.map((document) => {
    const employee = employeeById.get(String(document.employeeId));
    const employeeName = employee ? employeeDisplayName(employee) : 'Employee';
    return {
      id: String(document._id),
      fileName: `ROE_${employeeName.replace(/\s+/g, '_')}.pdf`,
      type: 'ROE',
      category: 'Government',
      relatedTo: employee ? `${employeeName} (${employee.employeeNumber})` : employeeName,
      employeeId: String(document.employeeId),
      uploadDate: document.generatedAt.toISOString(),
      size: '180 KB',
      status: 'Filed',
      uploadedBy: 'Admin User',
      description: 'Record of Employment generated from payroll data',
      tags: ['ROE', 'Government'],
      source: 'roe'
    };
  });
  const filingDocuments = filings.flatMap((filing) =>
    (filing.documents || []).map((document, index) => ({
      id: `${filing._id}:${index}`,
      fileName: document.name,
      type: filing.type === 'CRA_REMITTANCE' ? 'PD7A' : filing.type.replace(/_/g, ' '),
      category: 'Government',
      relatedTo: 'Company',
      employeeId: '',
      uploadDate: (filing.filedAt || filing.preparedAt || filing.dueDate).toISOString(),
      size: '320 KB',
      status: filing.status === 'filed' ? 'Filed' : filing.status === 'prepared' ? 'Internal' : 'Pending',
      uploadedBy: 'Admin User',
      description: `${filing.title} document for ${filing.period}`,
      tags: [filing.type, String(filing.year)],
      source: 'government-filing'
    }))
  );
  const paystubDocuments = paystubs.map((statement) => {
    const employee = employeeById.get(String(statement.employeeId));
    const employeeName = employee ? employeeDisplayName(employee) : 'Employee';
    return {
      id: String(statement._id),
      fileName: `Paystub_${employeeName.replace(/\s+/g, '_')}_${statement.payDate.toISOString().slice(0, 10)}.pdf`,
      type: 'Paystub',
      category: 'Payroll',
      relatedTo: employee ? `${employeeName} (${employee.employeeNumber})` : employeeName,
      employeeId: String(statement.employeeId),
      uploadDate: statement.payDate.toISOString(),
      size: '190 KB',
      status: 'Active',
      uploadedBy: 'Payroll',
      description: 'Employee paystub generated from payroll run',
      tags: ['Paystub', String(statement.payPeriodYear)],
      source: 'paystub',
      downloadUrl: `/api/employer/paystubs/${statement._id}/download`
    };
  });
  const documents = [...taxDocuments, ...roeDocuments, ...filingDocuments, ...paystubDocuments, ...savedDocuments]
    .sort((left, right) => new Date(right.uploadDate).getTime() - new Date(left.uploadDate).getTime());
  const countBy = (predicate: (item: typeof documents[number]) => boolean) => documents.filter(predicate).length;
  res.json({
    documents,
    employees: employees.map((employee) => ({ id: String(employee._id), name: employeeDisplayName(employee), employeeNumber: employee.employeeNumber })),
    metrics: {
      totalDocuments: documents.length,
      payrollDocuments: countBy((item) => item.category === 'Payroll'),
      employeeDocuments: countBy((item) => Boolean(item.employeeId)),
      governmentDocuments: countBy((item) => item.category === 'Government'),
      companyDocuments: countBy((item) => item.category === 'Company'),
      pendingReviews: countBy((item) => ['Pending', 'Internal'].includes(item.status))
    }
  });
});

router.post('/auth/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid login request' });
  const employer = await EmployerUser.findOne({ email: parsed.data.email.toLowerCase() });
  const ok = employer ? await verifyPassword(parsed.data.password, employer.passwordHash) : false;
  await AuditLog.create({
    userId: employer?._id,
    companyId: employer?.companyId,
    eventType: ok ? 'EMPLOYER_LOGIN_SUCCESS' : 'EMPLOYER_LOGIN_FAILURE'
  });
  if (!employer || !ok || !employer.isActive)
    return res.status(401).json({ message: 'Invalid email or password' });
  employer.role = normalizeRole(employer.role);
  employer.lastLoginAt = new Date();
  const companyIds = Array.from(
    new Set([String(employer.companyId), ...(employer.companyIds || []).map(String)])
  );
  const companies = await Company.find({ _id: { $in: companyIds } }).sort({ legalName: 1 });
  const selectedCompany =
    companies.find((company) => String(company._id) === String(employer.lastSelectedCompanyId)) ||
    companies.find((company) => String(company._id) === String(employer.companyId)) ||
    companies[0];
  if (selectedCompany) employer.lastSelectedCompanyId = selectedCompany._id;
  await employer.save();
  res.json({
    token: selectedCompany
      ? signEmployerToken(String(employer._id), String(selectedCompany._id))
      : undefined,
    user: {
      id: String(employer._id),
      name: employer.name,
      email: employer.email,
      role: normalizeRole(employer.role)
    },
    company: selectedCompany
      ? {
          id: String(selectedCompany._id),
          legalName: selectedCompany.legalName,
          customerId: selectedCompany.customerId
        }
      : undefined,
    companies: companies.map((company) => ({
      id: String(company._id),
      legalName: company.legalName,
      customerId: company.customerId
    }))
  });
});

router.post(
  '/companies/switch',
  authenticate,
  requirePermission('reports.view'),
  async (req: AuthRequest, res) => {
    const parsed = z.object({ companyId: z.string() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Company is required' });
    const employer = await EmployerUser.findById(req.employerContext?.employerUserId);
    if (!employer) return res.status(401).json({ message: 'Employer user not found' });
    const allowedCompanyIds = Array.from(
      new Set([String(employer.companyId), ...(employer.companyIds || []).map(String)])
    );
    if (!allowedCompanyIds.includes(parsed.data.companyId))
      return res.status(403).json({ message: 'You do not have access to this company' });
    const company = await Company.findById(parsed.data.companyId);
    if (!company) return res.status(404).json({ message: 'Company not found' });
    employer.lastSelectedCompanyId = company._id;
    await employer.save();
    res.json({
      token: signEmployerToken(String(employer._id), String(company._id)),
      company: {
        id: String(company._id),
        legalName: company.legalName,
        customerId: company.customerId
      }
    });
  }
);

router.get(
  '/dashboard',
  authenticate,
  requirePermission('reports.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    await syncGovernmentFilings(companyId);
    const [company, employer, employeeCount, latestRun, statements, filings, actionRuns, recentLogs, payrollRuns] = await Promise.all([
      Company.findById(companyId),
      EmployerUser.findById(req.employerContext?.employerUserId),
      Employee.countDocuments({ companyId }),
      PayrollRun.findOne({ companyId, payDate: { $gte: now } }).sort({ payDate: 1 }),
      PayStatement.find({ companyId, supersededByStatementId: { $exists: false } }).sort({ payDate: 1 }),
      GovernmentFiling.find({ companyId, status: { $in: ['pending', 'prepared', 'overdue'] } }).sort({ dueDate: 1 }),
      PayrollRun.find({ companyId, status: { $in: ['draft', 'in_review', 'approved'] } }).sort({ payDate: 1 }),
      AuditLog.find({ companyId }).sort({ createdAt: -1 }).limit(5),
      PayrollRun.find({ companyId }).sort({ payDate: -1 })
    ]);
    const employerCompanyIds = employer
      ? Array.from(
          new Set([String(employer.companyId), ...(employer.companyIds || []).map(String)])
        )
      : [companyId];
    const employerCompanies = await Company.find({ _id: { $in: employerCompanyIds } }).sort({
      legalName: 1
    });

    const currentMonthStatements = statements.filter((statement) => {
      const payDate = new Date(statement.payDate);
      return payDate >= currentMonthStart && payDate < nextMonthStart;
    });
    const previousMonthStatements = statements.filter((statement) => {
      const payDate = new Date(statement.payDate);
      return payDate >= previousMonthStart && payDate < currentMonthStart;
    });
    const monthlyPayroll = sumMoney(currentMonthStatements.map((statement) => statement.netPay));
    const previousMonthlyPayroll = moneyToNumber(
      sumMoney(previousMonthStatements.map((statement) => statement.netPay))
    );
    const currentMonthlyPayroll = moneyToNumber(monthlyPayroll);
    const payrollDeltaPercent = previousMonthlyPayroll
      ? Number((((currentMonthlyPayroll - previousMonthlyPayroll) / previousMonthlyPayroll) * 100).toFixed(1))
      : 0;
    const chart = Array.from({ length: 6 }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
      const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);
      const amount = moneyToNumber(
        sumMoney(
          statements
            .filter((statement) => {
              const payDate = new Date(statement.payDate);
              return payDate >= month && payDate < nextMonth;
            })
            .map((statement) => statement.netPay)
        )
      );
      return {
        label: month.toLocaleString('en-CA', { month: 'short', year: 'numeric' }),
        amount
      };
    });
    const governmentLiabilities = filings
      .filter((filing) => filing.type === 'CRA_REMITTANCE' && filing.status !== 'filed')
      .reduce((total, filing) => total + moneyToNumber(filing.amount), 0);
    const requiredFilings = filings.filter((filing) => ['pending', 'overdue'].includes(filing.status));
    const actionRequired = requiredFilings.length + actionRuns.length;
    const relativeTime = (date: Date) => {
      const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000));
      if (minutes < 60) return `${minutes || 1} minute${minutes === 1 ? '' : 's'} ago`;
      const hours = Math.round(minutes / 60);
      if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
      const days = Math.round(hours / 24);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    };
    const activityLabel = (eventType: string) =>
      eventType
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase());
    const recentActivity = recentLogs.map((log) => [
      String(log.metadata?.action || activityLabel(log.eventType)),
      relativeTime(log.createdAt)
    ] as [string, string]);
    const alerts = [
      ...requiredFilings.map((filing) => [
        `${filing.title} due ${dateLabel(filing.dueDate)}${moneyToNumber(filing.amount) ? ` (${formatMoney(filing.amount)})` : ''}`,
        filing.status === 'overdue' ? 'Review' : 'View',
        filing.status === 'overdue' ? 'danger' : 'warning'
      ] as [string, string, string]),
      ...actionRuns.map((run) => [
        `Payroll run ${dateLabel(run.periodStart)} - ${dateLabel(run.periodEnd)} is ${run.status}`,
        'Open',
        run.status === 'draft' ? 'info' : 'warning'
      ] as [string, string, string])
    ];

    res.json({
      user: { name: employer?.name || 'Admin User', role: normalizeRole(employer?.role) },
      company: {
        id: String(company?._id || companyId),
        legalName: company?.legalName || 'ABC Solutions Inc.',
        customerId: company?.customerId || 'ABC001',
        address: addressLines(company?.address).join(', ')
      },
      companies: employerCompanies.map((item) => ({
        id: String(item._id),
        legalName: item.legalName,
        customerId: item.customerId,
        address: addressLines(item.address).join(', ')
      })),
      metrics: {
        totalEmployees: employeeCount,
        employeeDelta: employeeCount,
        monthlyPayroll: currentMonthlyPayroll,
        payrollDeltaPercent,
        governmentLiabilities,
        actionRequired
      },
      nextPayroll: latestRun && {
        periodStart: latestRun.periodStart,
        periodEnd: latestRun.periodEnd,
        payDate: latestRun.payDate,
        employeeCount: latestRun.employeeCount,
        totalHours: latestRun.totalHours,
        estimatedGross: moneyToNumber(latestRun.estimatedGross),
        status: latestRun.status
      },
      chart,
      recentActivity,
      alerts
    });
  }
);

router.get(
  '/reports',
  authenticate,
  requirePermission('reports.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const [payrollRuns, statements, employees, filings, deductionTypes, latestRun] = await Promise.all([
      PayrollRun.countDocuments({ companyId }),
      PayStatement.countDocuments({ companyId, supersededByStatementId: { $exists: false } }),
      Employee.countDocuments({ companyId }),
      GovernmentFiling.countDocuments({ companyId }),
      DeductionType.countDocuments({ employerId: companyId }),
      PayrollRun.findOne({ companyId }).sort({ payDate: -1 }).select('payDate')
    ]);
    const groups = [
      {
        title: 'Payroll Reports',
        description: 'Reports related to pay runs, hours, earnings and net pay.',
        tone: 'blue',
        reports: [
          ['Payroll Summary Report', 'Total hours, gross pay, deductions and net pay by pay period.'],
          ['Payroll Register', 'Detailed employee earnings and deductions.'],
          ['Pay Run Comparison', 'Compare payroll data across pay periods.'],
          ['Year to Date Summary', 'YTD earnings, hours and deductions.'],
          ['Payroll Variance Report', 'Changes between draft, approved and finalized runs.'],
          ['Paystub Audit Report', 'Pay statement delivery and revision history.']
        ]
      },
      {
        title: 'Employee Reports',
        description: 'Reports related to employee information and history.',
        tone: 'green',
        reports: [
          ['Employee List', 'Complete list of employees with key details.'],
          ['Employee Earnings Report', 'Earnings summary by employee and period.'],
          ['Employee Hours Report', 'Total hours by employee.'],
          ['Employee Deduction Report', 'All deductions by employee.'],
          ['Employee Status Report', 'Active, inactive and onboarding status.'],
          ['Employee Profile Audit', 'Recent employee profile changes.']
        ]
      },
      {
        title: 'Tax & Compliance Reports',
        description: 'Reports for CRA remittances and year-end requirements.',
        tone: 'yellow',
        reports: [
          ['Government Liabilities Report', 'Employee CPP, EI, income tax and employer CPP/EI by pay period.'],
          ['CRA Source Deductions Report', 'Total CPP, EI and income tax by period.'],
          ['T4 Summary Report', 'Year to date summary for T4 filing.'],
          ['T4 Detailed Report', 'Detailed T4 data by employee.'],
          ['RL-1 Summary Report (Quebec)', 'Year to date summary for RL-1.'],
          ['ROE Tracking Report', 'Record of Employment preparation and status.'],
          ['Compliance Calendar', 'Upcoming filing and remittance dates.']
        ]
      },
      {
        title: 'Benefits & Deductions Reports',
        description: 'Reports related to benefits, deductions and employer costs.',
        tone: 'purple',
        reports: [
          ['Deduction Summary Report', 'Total deductions by type and period.'],
          ['Benefits Summary Report', 'Employer and employee benefit costs.'],
          ['Employer Cost Report', 'Total employer costs including CPP and EI.'],
          ['Recurring Deductions Report', 'Active recurring deductions by employee.']
        ]
      },
      {
        title: 'Custom Reports',
        description: 'Create and save custom reports based on your requirements.',
        tone: 'pink',
        reports: [
          ['Create Custom Report', 'Build a custom report with your own filters and fields.'],
          ['Saved Custom Reports', 'View and run your saved custom reports.'],
          ['Report Templates', 'Use templates for common reporting needs.'],
          ['Manage Report Fields', 'Select and manage fields for custom reports.']
        ]
      },
      {
        title: 'Scheduled Reports',
        description: 'Automate report generation and delivery.',
        tone: 'cyan',
        reports: [
          ['Manage Schedules', 'Set up and manage automated report schedules.'],
          ['Scheduled Reports List', 'View all scheduled reports and status.'],
          ['Delivery History', 'Check delivery status and history.'],
          ['Create Schedule', 'Schedule a new report with custom filters.']
        ]
      }
    ];
    res.json({
      metrics: {
        totalReports: groups.reduce((total, group) => total + group.reports.length, 0),
        mostUsed: payrollRuns ? 'Payroll Summary' : 'Employee List',
        mostUsedCaption: latestRun
          ? `Last generated ${latestRun.payDate.toISOString().slice(0, 10)}`
          : `${employees} employees available`,
        scheduledReports: 0,
        reportsGenerated: payrollRuns + statements + filings + deductionTypes
      },
      groups: groups.map((group) => ({
        ...group,
        reports: group.reports.map(([name, description]) => ({
          name,
          description,
          formats: group.title === 'Custom Reports' || group.title === 'Scheduled Reports'
            ? []
            : ['PDF', 'Excel', 'CSV']
        }))
      }))
    });
  }
);

router.get(
  '/reports/payroll-summary',
  authenticate,
  requirePermission('reports.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const [runs, employees] = await Promise.all([
      PayrollRun.find({ companyId }).sort({ payDate: -1 }),
      Employee.find({ companyId }).select(
        'legalFirstName legalLastName employeeNumber occupation adminProfile.employment'
      )
    ]);
    const latestRun = runs[0];
    const fallbackStatements = latestRun && (latestRun.lines || []).length
      ? []
      : await PayStatement.find({
          companyId,
          supersededByStatementId: { $exists: false },
          ...(latestRun
            ? {
                periodStart: latestRun.periodStart,
                periodEnd: latestRun.periodEnd,
                payDate: latestRun.payDate
              }
            : {})
        }).sort({ payDate: -1, _id: -1 });
    const latestStatement = fallbackStatements[0];
    const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
    const rows = latestRun
      ? (latestRun.lines || []).map((line, index) => {
          const employee = employeeById.get(String(line.employeeId));
          const grossPay = safeMoneyToNumber(line.grossPay);
          const deductions = safeMoneyToNumber(line.deductionsTotal);
          const netPay = safeMoneyToNumber(line.netPay);
          const cpp = safeMoneyToNumber(line.cpp) + safeMoneyToNumber(line.cpp2);
          const ei = safeMoneyToNumber(line.ei);
          const employerCpp = cpp;
          const employerEi = Number((ei * 1.4).toFixed(2));
          const employerCosts = Number((employerCpp + employerEi).toFixed(2));
          return {
            index: index + 1,
            employeeName: employee
              ? `${employee.legalFirstName} ${employee.legalLastName}`.trim()
              : 'Unknown employee',
            employeeNumber: employee?.employeeNumber || '',
            department:
              String(employee?.adminProfile?.employment?.department || employee?.occupation || ''),
            hours: Number((Number(line.regularHours || 0) + Number(line.overtimeHours || 0) + Number(line.statePayHours || 0)).toFixed(2)),
            grossPay,
            deductions,
            netPay,
            employerCosts,
            payGroup: latestRun.payFrequency || 'biweekly',
            payDate: dateLabel(latestRun.payDate),
            status: latestRun.status,
            statementId: line.statementId ? String(line.statementId) : '',
            hourlyRate: safeMoneyToNumber(line.hourlyRate),
            regularHours: Number(line.regularHours || 0),
            overtimeHours: Number(line.overtimeHours || 0),
            statePayHours: Number(line.statePayHours || 0),
            vacationPay: safeMoneyToNumber(line.vacationPay),
            statePay: safeMoneyToNumber(line.statePay),
            otherEarnings: safeMoneyToNumber(line.otherEarnings),
            cpp,
            ei,
            federalTax: safeMoneyToNumber(line.federalTax),
            provincialTax: safeMoneyToNumber(line.provincialTax),
            preTaxDeductions: safeMoneyToNumber(line.preTaxDeductions),
            postTaxDeductions: safeMoneyToNumber(line.postTaxDeductions)
          };
        })
      : [];
    const statementRows = rows.length
      ? []
      : fallbackStatements
          .filter((statement) => {
            if (!latestRun && latestStatement) {
              return (
                dateLabel(statement.periodStart || statement.payDate) === dateLabel(latestStatement.periodStart || latestStatement.payDate) &&
                dateLabel(statement.periodEnd || statement.payDate) === dateLabel(latestStatement.periodEnd || latestStatement.payDate) &&
                dateLabel(statement.payDate) === dateLabel(latestStatement.payDate)
              );
            }
            return true;
          })
          .map((statement, index) => {
            const employee = employeeById.get(String(statement.employeeId));
            const grossPay = safeMoneyToNumber(
              statement.grossPay || statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0
            );
            const deductions = safeMoneyToNumber(deductionTotalAmount(statement.deductions));
            const netPay = safeMoneyToNumber(statement.netPay);
            const deductionByCode = (code: string) =>
              statement.deductions.find((line) => String(line.code || '').toUpperCase() === code)?.amount;
            const earningByDescription = (terms: string[]) =>
              statement.grossEarnings.find((line) => lineDescriptionIncludes(line, terms))?.amount;
            const cpp = safeMoneyToNumber(deductionByCode('CPP')) + safeMoneyToNumber(deductionByCode('CPP2'));
            const ei = safeMoneyToNumber(deductionByCode('EI'));
            const employerCosts = Number((cpp + ei * 1.4).toFixed(2));
            const regularHours = Number(statement.regularHours || 0);
            const overtimeHours = Number(statement.overtimeHours || 0);
            const statePayHours = Number(statement.statePayHours || 0);
            return {
              index: index + 1,
              employeeName: employee
                ? `${employee.legalFirstName} ${employee.legalLastName}`.trim()
                : 'Unknown employee',
              employeeNumber: employee?.employeeNumber || '',
              department:
                String(employee?.adminProfile?.employment?.department || employee?.occupation || ''),
              hours: Number((regularHours + overtimeHours + statePayHours).toFixed(2)),
              grossPay,
              deductions,
              netPay,
              employerCosts,
              payGroup: latestRun?.payFrequency || 'biweekly',
              payDate: dateLabel(statement.payDate),
              status: latestRun?.status || 'finalized',
              statementId: String(statement._id),
              hourlyRate: safeMoneyToNumber(statement.hourlyRate),
              regularHours,
              overtimeHours,
              statePayHours,
              vacationPay: safeMoneyToNumber(earningByDescription(['vacation'])),
              statePay: safeMoneyToNumber(earningByDescription(['statutory', 'holiday'])),
              otherEarnings: 0,
              cpp,
              ei,
              federalTax: safeMoneyToNumber(deductionByCode('FTAX')),
              provincialTax: safeMoneyToNumber(deductionByCode('PTAX')),
              preTaxDeductions: safeMoneyToNumber(deductionByCode('PRE')),
              postTaxDeductions: safeMoneyToNumber(deductionByCode('POST'))
            };
          });
    const reportRows = rows.length ? rows : statementRows;
    const reportPayDate = latestRun?.payDate || latestStatement?.payDate;
    const reportPeriodStart = latestRun?.periodStart || latestStatement?.periodStart || latestStatement?.payDate;
    const reportPeriodEnd = latestRun?.periodEnd || latestStatement?.periodEnd || latestStatement?.payDate;
    const payRunCount = runs.length || (latestStatement ? 1 : 0);
    const latestRunNumber = latestRun ? runs.length : latestStatement?.payPeriodNumber;
    const totals = reportRows.reduce(
      (sum, row) => ({
        hours: sum.hours + row.hours,
        grossPay: sum.grossPay + row.grossPay,
        deductions: sum.deductions + row.deductions,
        netPay: sum.netPay + row.netPay,
        employerCosts: sum.employerCosts + row.employerCosts
      }),
      { hours: 0, grossPay: 0, deductions: 0, netPay: 0, employerCosts: 0 }
    );
    const periodLabel = reportPayDate
      ? `${dateLabel(reportPeriodStart)} - ${dateLabel(reportPeriodEnd)} (#${latestRunNumber || payRunCount})`
      : '';
    res.json({
      metrics: {
        totalPayRuns: payRunCount,
        totalGrossPay: safeFormatMoney(totals.grossPay),
        totalEmployeesPaid: reportRows.length,
        lastPayRun: latestRunNumber || payRunCount ? `#${latestRunNumber || payRunCount}` : '-',
        lastPayRunDate: reportPayDate ? dateLabel(reportPayDate) : '-'
      },
      filters: {
        payPeriods: periodLabel ? [periodLabel] : [],
        departments: Array.from(new Set(['All Departments', ...reportRows.map((row) => row.department)])),
        employees: ['All Employees', ...reportRows.map((row) => row.employeeName)],
        payGroups: Array.from(new Set(['All Pay Groups', ...reportRows.map((row) => row.payGroup)]))
      },
      summary: {
        payPeriod: periodLabel,
        employeesPaid: reportRows.length,
        totalHours: Number(totals.hours.toFixed(2)),
        totalGrossPay: safeFormatMoney(totals.grossPay),
        totalDeductions: safeFormatMoney(totals.deductions),
        totalNetPay: safeFormatMoney(totals.netPay),
        totalEmployerCosts: safeFormatMoney(totals.employerCosts)
      },
      rows: reportRows
    });
  }
);

router.get('/reports/government-liabilities', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  await syncGovernmentFilings(companyId);
  const [runs, filings, employees] = await Promise.all([
    PayrollRun.find({ companyId, status: { $in: ['finalized', 'locked', 'adjusted'] } }).sort({ payDate: -1 }),
    GovernmentFiling.find({ companyId, type: 'CRA_REMITTANCE' }).sort({ dueDate: -1 }),
    Employee.find({ companyId }).select(
      'legalFirstName legalLastName employeeNumber occupation payGroup adminProfile.employment adminProfile.compensation'
    )
  ]);
  const filingByPeriod = new Map(filings.map((filing) => [filing.period, filing]));
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const rows = runs.flatMap((run) => {
    const remittancePeriod = run.payDate.toLocaleDateString('en-CA', {
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
    const filing = filingByPeriod.get(remittancePeriod);
    const status = filing?.status === 'filed' ? 'Paid' : 'Unpaid';
    const remittanceDueDate = filing?.dueDate ? dateLabel(filing.dueDate) : '';
    const payPeriod = `${dateLabel(run.periodStart)} - ${dateLabel(run.periodEnd)}`;
    return (run.lines || []).map((line, lineIndex) => {
      const employee = employeeById.get(String(line.employeeId));
      const employeeCpp = moneyToNumber(line.cpp) + moneyToNumber(line.cpp2);
      const employeeEi = moneyToNumber(line.ei);
      const incomeTax = moneyToNumber(line.federalTax) + moneyToNumber(line.provincialTax);
      const employerCpp = employeeCpp;
      const employerEi = Number((employeeEi * 1.4).toFixed(2));
      const governmentLiability = employeeCpp + employeeEi + incomeTax + employerCpp + employerEi;
      const grossPay = safeMoneyToNumber(line.grossPay);
      const deductions = safeMoneyToNumber(line.deductionsTotal);
      const netPay = safeMoneyToNumber(line.netPay);
      const employerCosts = Number((employerCpp + employerEi).toFixed(2));
      const department = String(employee?.adminProfile?.employment?.department || employee?.occupation || '');
      const payGroup = String(
        employee?.adminProfile?.compensation?.payFrequency ||
          employee?.payGroup ||
          run.payFrequency ||
          ''
      );
      return {
        index: 0,
        runId: String(run._id),
        employeeName: employee
          ? `${employee.legalFirstName} ${employee.legalLastName}`.trim()
          : 'Unknown employee',
        employeeNumber: employee?.employeeNumber || '',
        department,
        payGroup,
        hours: Number((Number(line.regularHours || 0) + Number(line.overtimeHours || 0) + Number(line.statePayHours || 0)).toFixed(2)),
        grossPay,
        deductions,
        netPay,
        employerCosts,
        payPeriod,
        payDate: dateLabel(run.payDate),
        remittancePeriod,
        remittanceDueDate,
        employeeCpp: Number(employeeCpp.toFixed(2)),
        employeeEi: Number(employeeEi.toFixed(2)),
        incomeTax: Number(incomeTax.toFixed(2)),
        employerCpp: Number(employerCpp.toFixed(2)),
        employerEi: Number(employerEi.toFixed(2)),
        totalLiability: Number(governmentLiability.toFixed(2)),
        outstandingLiability: status === 'Paid' ? 0 : Number(governmentLiability.toFixed(2)),
        status,
        rowKey: `${String(run._id)}-${String(line.employeeId)}-${lineIndex}`
      };
    });
  }).map((row, index) => ({ ...row, index: index + 1 }));
  const summary = rows.reduce((sum, row) => ({
    employeeCpp: sum.employeeCpp + row.employeeCpp,
    employeeEi: sum.employeeEi + row.employeeEi,
    incomeTax: sum.incomeTax + row.incomeTax,
    employerCpp: sum.employerCpp + row.employerCpp,
    employerEi: sum.employerEi + row.employerEi,
    totalLiability: sum.totalLiability + row.totalLiability,
    outstandingLiability: sum.outstandingLiability + row.outstandingLiability,
    hours: sum.hours + row.hours,
    grossPay: sum.grossPay + row.grossPay,
    deductions: sum.deductions + row.deductions,
    netPay: sum.netPay + row.netPay,
    employerCosts: sum.employerCosts + row.employerCosts
  }), { employeeCpp: 0, employeeEi: 0, incomeTax: 0, employerCpp: 0, employerEi: 0, totalLiability: 0, outstandingLiability: 0, hours: 0, grossPay: 0, deductions: 0, netPay: 0, employerCosts: 0 });
  const paidAmount = rows.filter((row) => row.status === 'Paid').reduce((sum, row) => sum + row.totalLiability, 0);
  const unpaidAmount = rows.filter((row) => row.status === 'Unpaid').reduce((sum, row) => sum + row.totalLiability, 0);
  res.json({
    metrics: {
      payPeriods: rows.length,
      totalLiabilities: formatMoney(summary.totalLiability),
      paidAmount: formatMoney(paidAmount),
      unpaidAmount: formatMoney(unpaidAmount),
      outstandingLiabilities: formatMoney(summary.outstandingLiability)
    },
    filters: {
      payPeriods: Array.from(new Set(rows.map((row) => row.payPeriod))),
      departments: Array.from(new Set(['All Departments', ...rows.map((row) => row.department).filter(Boolean)])),
      employees: ['All Employees', ...Array.from(new Set(rows.map((row) => row.employeeName)))],
      payGroups: Array.from(new Set(['All Pay Groups', ...rows.map((row) => row.payGroup).filter(Boolean)])),
      remittancePeriods: Array.from(new Set(['All Remittance Periods', ...rows.map((row) => row.remittancePeriod).filter(Boolean)])),
      statuses: ['All Statuses', 'Paid', 'Unpaid']
    },
    summary,
    rows
  });
});

router.get(
  '/reports/hours',
  authenticate,
  requirePermission('reports.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const [runs, employees] = await Promise.all([
      PayrollRun.find({ companyId }).sort({ payDate: -1 }),
      Employee.find({ companyId }).select(
        'legalFirstName legalLastName employeeNumber occupation payGroup adminProfile.employment adminProfile.compensation'
      )
    ]);
    const latestRun = runs[0];
    const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
    const rows = latestRun
      ? (latestRun.lines || []).map((line, index) => {
          const employee = employeeById.get(String(line.employeeId));
          const department = String(
            employee?.adminProfile?.employment?.department || employee?.occupation || ''
          );
          const payGroup = String(
            employee?.adminProfile?.compensation?.payFrequency ||
              employee?.payGroup ||
              latestRun.payFrequency ||
              ''
          );
          const employmentType = String(
            employee?.adminProfile?.employment?.employmentType || ''
          );
          const regularHours = Number(line.regularHours || 0);
          const overtimeHours = Number(line.overtimeHours || 0);
          const doubleTimeHours = 0;
          const ptoHours = 0;
          const statHolidayHours = Number(line.statePayHours || 0);
          const totalHours = Number(
            (regularHours + overtimeHours + doubleTimeHours + ptoHours + statHolidayHours).toFixed(2)
          );
          return {
            index: index + 1,
            employeeName: employee
              ? `${employee.legalFirstName} ${employee.legalLastName}`.trim()
              : 'Unknown employee',
            employeeNumber: employee?.employeeNumber || '',
            department,
            payGroup,
            employmentType,
            regularHours,
            overtimeHours,
            doubleTimeHours,
            ptoHours,
            statHolidayHours,
            totalHours
          };
        })
      : [];
    const totals = rows.reduce(
      (sum, row) => ({
        regularHours: sum.regularHours + row.regularHours,
        overtimeHours: sum.overtimeHours + row.overtimeHours,
        doubleTimeHours: sum.doubleTimeHours + row.doubleTimeHours,
        ptoHours: sum.ptoHours + row.ptoHours,
        statHolidayHours: sum.statHolidayHours + row.statHolidayHours,
        totalHours: sum.totalHours + row.totalHours
      }),
      {
        regularHours: 0,
        overtimeHours: 0,
        doubleTimeHours: 0,
        ptoHours: 0,
        statHolidayHours: 0,
        totalHours: 0
      }
    );
    const periodLabel = latestRun
      ? `${dateLabel(latestRun.periodStart)} - ${dateLabel(latestRun.periodEnd)} (#${runs.length})`
      : '';
    const fullTimeCount = employees.filter((employee) =>
      String(employee.adminProfile?.employment?.employmentType || '').toLowerCase().includes('full')
    ).length;
    res.json({
      metrics: {
        totalEmployees: rows.length,
        fullTime: fullTimeCount,
        partTime: Math.max(0, employees.length - fullTimeCount),
        totalHours: Number(totals.totalHours.toFixed(2)),
        regularHours: Number(totals.regularHours.toFixed(2)),
        overtimeHours: Number(totals.overtimeHours.toFixed(2)),
        averageHours: rows.length ? Number((totals.totalHours / rows.length).toFixed(2)) : 0,
        overtimePercent: totals.totalHours
          ? Number(((totals.overtimeHours / totals.totalHours) * 100).toFixed(1))
          : 0
      },
      filters: {
        payPeriods: latestRun ? [periodLabel] : [],
        departments: Array.from(new Set(['All Departments', ...rows.map((row) => row.department).filter(Boolean)])),
        payGroups: Array.from(new Set(['All Pay Groups', ...rows.map((row) => row.payGroup).filter(Boolean)])),
        employmentTypes: Array.from(new Set(['All Types', ...rows.map((row) => row.employmentType).filter(Boolean)]))
      },
      summary: {
        payPeriod: periodLabel,
        ...totals
      },
      rows
    });
  }
);

router.get(
  '/reports/earnings',
  authenticate,
  requirePermission('reports.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const [runs, employees] = await Promise.all([
      PayrollRun.find({ companyId }).sort({ payDate: -1 }),
      Employee.find({ companyId }).select(
        'legalFirstName legalLastName employeeNumber occupation payGroup adminProfile.employment adminProfile.compensation'
      )
    ]);
    const latestRun = runs[0];
    const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
    const sourceRows = latestRun
      ? (latestRun.lines || []).map((line, index) => {
          const employee = employeeById.get(String(line.employeeId));
          const department = String(
            employee?.adminProfile?.employment?.department || employee?.occupation || ''
          );
          const payGroup = String(
            employee?.adminProfile?.compensation?.payFrequency ||
              employee?.payGroup ||
              latestRun.payFrequency ||
              ''
          );
          const employmentType = String(employee?.adminProfile?.employment?.employmentType || '');
          const hourlyRate = moneyToNumber(line.hourlyRate);
          const regularAmount = Number((hourlyRate * Number(line.regularHours || 0)).toFixed(2));
          const overtimeRate = Number((hourlyRate * 1.5).toFixed(2));
          const overtimeAmount = Number((overtimeRate * Number(line.overtimeHours || 0)).toFixed(2));
          const entries = [
            {
              earningType: 'Regular Hours',
              rate: hourlyRate,
              hours: Number(line.regularHours || 0),
              amount: regularAmount
            },
            {
              earningType: 'Overtime Hours',
              rate: overtimeRate,
              hours: Number(line.overtimeHours || 0),
              amount: overtimeAmount
            },
            {
              earningType: 'Vacation Pay',
              rate: null,
              hours: null,
              amount: moneyToNumber(line.vacationPay)
            },
            {
              earningType: 'Statutory Holiday Pay',
              rate: null,
              hours: Number(line.statePayHours || 0),
              amount: moneyToNumber(line.statePay)
            },
            { earningType: 'Bonus', rate: null, hours: null, amount: moneyToNumber(line.bonus) },
            {
              earningType: 'Commissions',
              rate: null,
              hours: null,
              amount: moneyToNumber(line.commission)
            },
            {
              earningType: 'Other Earnings',
              rate: null,
              hours: null,
              amount: moneyToNumber(line.otherEarnings)
            }
          ].filter((entry) => entry.amount || entry.hours);
          return {
            index: index + 1,
            employeeName: employee
              ? `${employee.legalFirstName} ${employee.legalLastName}`.trim()
              : 'Unknown employee',
            employeeNumber: employee?.employeeNumber || '',
            department,
            payGroup,
            employmentType,
            totalHours:
              Number(line.regularHours || 0) +
              Number(line.overtimeHours || 0) +
              Number(line.statePayHours || 0),
            totalEarnings: moneyToNumber(line.grossPay),
            entries
          };
        })
      : [];
    const rows = sourceRows.flatMap((row) =>
      row.entries.map((entry, entryIndex) => ({
        index: entryIndex === 0 ? row.index : null,
        employeeName: entryIndex === 0 ? row.employeeName : '',
        employeeNumber: entryIndex === 0 ? row.employeeNumber : '',
        department: entryIndex === 0 ? row.department : '',
        payGroup: row.payGroup,
        employmentType: row.employmentType,
        earningType: entry.earningType,
        rate: entry.rate,
        hours: entry.hours,
        amount: entry.amount
      }))
    );
    const totals = sourceRows.reduce(
      (sum, row) => ({
        totalHours: sum.totalHours + row.totalHours,
        totalEarnings: sum.totalEarnings + row.totalEarnings
      }),
      { totalHours: 0, totalEarnings: 0 }
    );
    const periodLabel = latestRun
      ? `${dateLabel(latestRun.periodStart)} - ${dateLabel(latestRun.periodEnd)} (#${runs.length})`
      : '';
    const fullTimeCount = employees.filter((employee) =>
      String(employee.adminProfile?.employment?.employmentType || '').toLowerCase().includes('full')
    ).length;
    res.json({
      metrics: {
        totalEmployees: sourceRows.length,
        fullTime: fullTimeCount,
        partTime: Math.max(0, employees.length - fullTimeCount),
        totalEarnings: formatMoney(totals.totalEarnings),
        totalHours: Number(totals.totalHours.toFixed(2)),
        regularHours: Number(
          sourceRows.reduce((sum, row) => sum + (row.entries.find((entry) => entry.earningType === 'Regular Hours')?.hours || 0), 0).toFixed(2)
        ),
        overtimeHours: Number(
          sourceRows.reduce((sum, row) => sum + (row.entries.find((entry) => entry.earningType === 'Overtime Hours')?.hours || 0), 0).toFixed(2)
        ),
        averageHourlyRate: totals.totalHours ? Number((totals.totalEarnings / totals.totalHours).toFixed(2)) : 0
      },
      filters: {
        payPeriods: latestRun ? [periodLabel] : [],
        departments: Array.from(new Set(['All Departments', ...sourceRows.map((row) => row.department).filter(Boolean)])),
        payGroups: Array.from(new Set(['All Pay Groups', ...sourceRows.map((row) => row.payGroup).filter(Boolean)])),
        employmentTypes: Array.from(new Set(['All Types', ...sourceRows.map((row) => row.employmentType).filter(Boolean)]))
      },
      summary: { payPeriod: periodLabel, ...totals },
      rows
    });
  }
);

router.get(
  '/reports/employees',
  authenticate,
  requirePermission('reports.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const employees = await Employee.find({ companyId }).sort({ employeeNumber: 1 });
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const rows = employees.map((employee, index) => {
      const employment = employee.adminProfile?.employment || {};
      const compensation = employee.adminProfile?.compensation || {};
      const status = String(employment.employmentStatus || 'Active');
      const hireDateValue = employment.hireDate || employee.startDate;
      const terminationDateValue = employment.terminationDate || employment.endDate;
      const hireDate = hireDateValue ? new Date(String(hireDateValue)) : undefined;
      const terminationDate = terminationDateValue ? new Date(String(terminationDateValue)) : undefined;
      return {
        index: index + 1,
        employeeName: `${employee.legalFirstName} ${employee.legalLastName}`.trim(),
        initials: `${employee.legalFirstName?.[0] || ''}${employee.legalLastName?.[0] || ''}`.toUpperCase(),
        employeeNumber: employee.employeeNumber,
        department: String(employment.department || employee.occupation || ''),
        position: String(employment.jobTitle || employee.occupation || ''),
        employmentType: String(employment.employmentType || ''),
        payGroup: String(compensation.payFrequency || employee.payGroup || ''),
        hireDate: hireDate && !Number.isNaN(hireDate.getTime()) ? hireDate.toISOString().slice(0, 10) : '',
        status,
        email: employee.companyEmail || employee.personalEmail || '',
        phone: employee.phones?.[0]?.number || '',
        terminationDate:
          terminationDate && !Number.isNaN(terminationDate.getTime())
            ? terminationDate.toISOString().slice(0, 10)
            : '',
        yearsOfService:
          hireDate && !Number.isNaN(hireDate.getTime())
            ? Number(((now.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1))
            : 0
      };
    });
    const activeCount = rows.filter((row) => row.status.toLowerCase() === 'active').length;
    const leaveCount = rows.filter((row) => row.status.toLowerCase().includes('leave')).length;
    const newHires = rows.filter((row) => {
      if (!row.hireDate) return false;
      const hireDate = new Date(row.hireDate);
      return hireDate >= yearStart && hireDate <= now;
    });
    const terminated = rows.filter((row) => {
      if (!row.terminationDate && !row.status.toLowerCase().includes('terminat')) return false;
      if (!row.terminationDate) return true;
      const terminationDate = new Date(row.terminationDate);
      return terminationDate >= yearStart && terminationDate <= now;
    });
    const fullTime = rows.filter((row) => row.employmentType.toLowerCase().includes('full')).length;
    res.json({
      metrics: {
        totalEmployees: rows.length,
        fullTime,
        partTime: Math.max(0, rows.length - fullTime),
        activeEmployees: activeCount,
        onLeave: leaveCount,
        newHires: newHires.length,
        newHireDateRange: newHires.length
          ? `${newHires[0].hireDate} - ${newHires[newHires.length - 1].hireDate}`
          : '',
        terminated: terminated.length,
        terminatedAsOf: now.toISOString().slice(0, 10)
      },
      filters: {
        statuses: Array.from(new Set(['All Statuses', ...rows.map((row) => row.status).filter(Boolean)])),
        departments: Array.from(new Set(['All Departments', ...rows.map((row) => row.department).filter(Boolean)])),
        employmentTypes: Array.from(new Set(['All Types', ...rows.map((row) => row.employmentType).filter(Boolean)])),
        payGroups: Array.from(new Set(['All Pay Groups', ...rows.map((row) => row.payGroup).filter(Boolean)]))
      },
      rows
    });
  }
);

router.get(
  '/reports/employee-details',
  authenticate,
  requirePermission('reports.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const [runs, employees] = await Promise.all([
      PayrollRun.find({ companyId }).sort({ payDate: -1 }),
      Employee.find({ companyId }).sort({ employeeNumber: 1 })
    ]);
    const latestRun = runs[0];
    const selectedEmployeeId =
      typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
    const line =
      latestRun?.lines.find((item) => String(item.employeeId) === selectedEmployeeId) ||
      latestRun?.lines[0];
    const employee =
      employees.find((item) => String(item._id) === String(line?.employeeId)) || employees[0];
    if (!employee) {
      return res.json({
        employees: [],
        payPeriods: [],
        employee: undefined,
        current: undefined,
        ytd: undefined
      });
    }
    const serializedRun = latestRun ? serializePayrollRun(latestRun) : undefined;
    const serializedLine = serializedRun?.lines.find(
      (item) => item.employeeId === String(employee._id)
    );
    const statements = await PayStatement.find({
      companyId,
      employeeId: employee._id,
      supersededByStatementId: { $exists: false }
    }).sort({ payDate: 1 });
    const employment = employee.adminProfile?.employment || {};
    const compensation = employee.adminProfile?.compensation || {};
    const hireDateValue = employment.hireDate || employee.startDate;
    const hireDate = hireDateValue ? new Date(String(hireDateValue)) : undefined;
    const currentGross = serializedLine ? moneyToNumber(serializedLine.grossPay) : 0;
    const currentDeductions = serializedLine ? moneyToNumber(serializedLine.deductionsTotal) : 0;
    const currentNet = serializedLine ? moneyToNumber(serializedLine.netPay) : 0;
    const currentHours = serializedLine
      ? Number(
          (
            serializedLine.regularHours +
            serializedLine.overtimeHours +
            serializedLine.statePayHours
          ).toFixed(2)
        )
      : 0;
    const ytdGross = sumMoney(
      statements.map((statement) =>
        statement.grossPay || statement.grossEarnings.find((item) => item.code === 'TOTAL')?.amount || 0
      )
    );
    const ytdDeductions = sumMoney(
      statements.map((statement) => deductionTotalAmount(statement.deductions))
    );
    const ytdNet = sumMoney(statements.map((statement) => statement.netPay));
    const ytdHours = statements.reduce(
      (total, statement) =>
        total + Number(statement.regularHours || 0) + Number(statement.overtimeHours || 0) + Number(statement.statePayHours || 0),
      0
    );
    const deductionRows = serializedLine
      ? [
          ['CPP', moneyToNumber(serializedLine.cpp) + moneyToNumber(serializedLine.cpp2), moneyToNumber(serializedLine.cpp) + moneyToNumber(serializedLine.cpp2)],
          ['EI', moneyToNumber(serializedLine.ei), Number((moneyToNumber(serializedLine.ei) * 1.4).toFixed(2))],
          ['Income Tax (Federal)', moneyToNumber(serializedLine.federalTax), 0],
          ['Income Tax (Provincial)', moneyToNumber(serializedLine.provincialTax), 0],
          ['Pre-tax Deductions', moneyToNumber(serializedLine.preTaxDeductions), 0],
          ['Post-tax Deductions', moneyToNumber(serializedLine.postTaxDeductions), 0]
        ].map(([name, employeeAmount, employerAmount]) => ({ name, employeeAmount, employerAmount }))
      : [];
    res.json({
      employees: employees.map((item) => ({
        id: String(item._id),
        label: `${item.employeeNumber} - ${item.legalFirstName} ${item.legalLastName}`.trim()
      })),
      payPeriods: latestRun
        ? [
            {
              id: String(latestRun._id),
              label: `${dateLabel(latestRun.periodStart)} - ${dateLabel(latestRun.periodEnd)} (#${runs.length})`
            }
          ]
        : [],
      employee: {
        id: String(employee._id),
        name: `${employee.legalFirstName} ${employee.legalLastName}`.trim(),
        initials: `${employee.legalFirstName?.[0] || ''}${employee.legalLastName?.[0] || ''}`.toUpperCase(),
        employeeNumber: employee.employeeNumber,
        status: String(employment.employmentStatus || 'Active'),
        position: String(employment.jobTitle || employee.occupation || ''),
        department: String(employment.department || employee.occupation || ''),
        employmentType: String(employment.employmentType || ''),
        hireDate: hireDate && !Number.isNaN(hireDate.getTime()) ? hireDate.toISOString().slice(0, 10) : '',
        email: employee.companyEmail || employee.personalEmail || '',
        phone: employee.phones?.[0]?.number || '',
        location: String(employment.location || employee.addresses?.[0]?.city || ''),
        payGroup: String(compensation.payFrequency || employee.payGroup || latestRun?.payFrequency || ''),
        standardHours: String(employment.standardHours || employment.standardWeeklyHours || ''),
        hourlyRate: serializedLine ? moneyToNumber(serializedLine.hourlyRate) : 0
      },
      current: serializedLine && latestRun
        ? {
            payPeriod: `${dateLabel(latestRun.periodStart)} - ${dateLabel(latestRun.periodEnd)} (#${runs.length})`,
            hours: currentHours,
            regularHours: serializedLine.regularHours,
            overtimeHours: serializedLine.overtimeHours,
            grossPay: currentGross,
            deductions: currentDeductions,
            netPay: currentNet,
            statementId: serializedLine.statementId,
            earnings: [
              ['Regular Hours', moneyToNumber(serializedLine.hourlyRate), serializedLine.regularHours, moneyToNumber(serializedLine.hourlyRate) * serializedLine.regularHours],
              ['Overtime Hours', moneyToNumber(serializedLine.hourlyRate) * 1.5, serializedLine.overtimeHours, moneyToNumber(serializedLine.hourlyRate) * 1.5 * serializedLine.overtimeHours],
              ['Vacation Pay', null, 0, moneyToNumber(serializedLine.vacationPay)],
              ['Statutory Holiday Pay', null, serializedLine.statePayHours, moneyToNumber(serializedLine.statePay)],
              ['Other Earnings', null, 0, moneyToNumber(serializedLine.otherEarnings)]
            ].map(([name, rate, hours, amount]) => ({ name, rate, hours, amount })),
            deductionsRows: deductionRows
          }
        : undefined,
      ytd: {
        hours: Number(ytdHours.toFixed(2)),
        grossPay: moneyToNumber(ytdGross),
        deductions: moneyToNumber(ytdDeductions),
        netPay: moneyToNumber(ytdNet)
      },
      payHistory: statements
        .slice()
        .sort((a, b) => String(b.payDate).localeCompare(String(a.payDate)))
        .map((statement) => {
          const periodStart = statement.periodStart ? dateLabel(statement.periodStart) : '';
          const periodEnd = statement.periodEnd ? dateLabel(statement.periodEnd) : '';
          const period = periodStart && periodEnd
            ? `${periodStart} - ${periodEnd} (#${statement.payPeriodNumber})`
            : `Pay period #${statement.payPeriodNumber}`;
          const deductionsTotal = deductionTotalAmount(statement.deductions);
          return {
            id: String(statement._id),
            payDate: dateLabel(statement.payDate),
            payPeriod: period,
            grossPay: moneyToNumber(statement.grossPay || statement.grossEarnings.find((item) => item.code === 'TOTAL')?.amount || 0),
            deductions: moneyToNumber(deductionsTotal),
            netPay: moneyToNumber(statement.netPay),
            statementId: String(statement._id)
          };
        })
    });
  }
);

router.get('/reports/deductions-summary', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const [runs, employees] = await Promise.all([
    PayrollRun.find({ companyId }).sort({ payDate: -1 }),
    Employee.find({ companyId }).select('legalFirstName legalLastName employeeNumber occupation payGroup adminProfile.employment adminProfile.compensation')
  ]);
  const latestRun = runs[0];
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const rows = latestRun ? (latestRun.lines || []).map((line, index) => {
    const employee = employeeById.get(String(line.employeeId));
    const cpp = moneyToNumber(line.cpp) + moneyToNumber(line.cpp2);
    const ei = moneyToNumber(line.ei);
    const federalTax = moneyToNumber(line.federalTax);
    const provincialTax = moneyToNumber(line.provincialTax);
    const otherDeductions = moneyToNumber(line.preTaxDeductions) + moneyToNumber(line.postTaxDeductions);
    const totalDeductions = moneyToNumber(line.deductionsTotal);
    return {
      index: index + 1,
      employeeName: employee ? `${employee.legalFirstName} ${employee.legalLastName}`.trim() : 'Unknown employee',
      employeeNumber: employee?.employeeNumber || '',
      department: String(employee?.adminProfile?.employment?.department || employee?.occupation || ''),
      payGroup: String(employee?.adminProfile?.compensation?.payFrequency || employee?.payGroup || latestRun.payFrequency || ''),
      employmentType: String(employee?.adminProfile?.employment?.employmentType || ''),
      grossPay: moneyToNumber(line.grossPay),
      cpp,
      ei,
      federalTax,
      provincialTax,
      otherDeductions,
      totalDeductions
    };
  }) : [];
  const totals = rows.reduce((sum, row) => ({
    grossPay: sum.grossPay + row.grossPay,
    cpp: sum.cpp + row.cpp,
    ei: sum.ei + row.ei,
    federalTax: sum.federalTax + row.federalTax,
    provincialTax: sum.provincialTax + row.provincialTax,
    otherDeductions: sum.otherDeductions + row.otherDeductions,
    totalDeductions: sum.totalDeductions + row.totalDeductions
  }), { grossPay: 0, cpp: 0, ei: 0, federalTax: 0, provincialTax: 0, otherDeductions: 0, totalDeductions: 0 });
  const periodLabel = latestRun ? `${dateLabel(latestRun.periodStart)} - ${dateLabel(latestRun.periodEnd)} (#${runs.length})` : '';
  const fullTime = employees.filter((employee) => String(employee.adminProfile?.employment?.employmentType || '').toLowerCase().includes('full')).length;
  res.json({
    metrics: {
      totalEmployees: rows.length,
      fullTime,
      partTime: Math.max(0, employees.length - fullTime),
      totalDeductions: formatMoney(totals.totalDeductions),
      averageDeductions: rows.length ? formatMoney(totals.totalDeductions / rows.length) : formatMoney(0),
      employeeDeductionsPercent: totals.grossPay ? Number(((totals.totalDeductions / totals.grossPay) * 100).toFixed(1)) : 0
    },
    filters: {
      payPeriods: latestRun ? [periodLabel] : [],
      departments: Array.from(new Set(['All Departments', ...rows.map((row) => row.department).filter(Boolean)])),
      payGroups: Array.from(new Set(['All Pay Groups', ...rows.map((row) => row.payGroup).filter(Boolean)])),
      employmentTypes: Array.from(new Set(['All Types', ...rows.map((row) => row.employmentType).filter(Boolean)]))
    },
    summary: { payPeriod: periodLabel, ...totals },
    rows
  });
});

router.get('/reports/employee-history', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const employees = await Employee.find({ companyId }).sort({ employeeNumber: 1 });
  const now = new Date();
  const rows = employees.map((employee, index) => {
    const employment = employee.adminProfile?.employment || {};
    const compensation = employee.adminProfile?.compensation || {};
    const hireDateValue = employment.hireDate || employee.startDate;
    const hireDate = hireDateValue ? new Date(String(hireDateValue)) : undefined;
    const status = String(employment.employmentStatus || 'Active');
    const position = String(employment.jobTitle || employee.occupation || '');
    const department = String(employment.department || employee.occupation || '');
    const employmentType = String(employment.employmentType || '');
    const rate = String(compensation.hourlyRate || compensation.salary || '');
    const changes = [
      {
        effectiveDate: hireDate && !Number.isNaN(hireDate.getTime()) ? hireDate.toISOString().slice(0, 10) : '',
        changeType: 'Hire',
        details: position ? `Hired as ${position}` : 'Employee hired',
        previousValue: '',
        newValue: [employmentType, rate].filter(Boolean).join(' | '),
        updatedBy: 'System'
      },
      ...(department ? [{
        effectiveDate: hireDate && !Number.isNaN(hireDate.getTime()) ? hireDate.toISOString().slice(0, 10) : '',
        changeType: 'Department',
        details: 'Current department on employee profile',
        previousValue: '',
        newValue: department,
        updatedBy: 'System'
      }] : []),
      ...(status && status !== 'Active' ? [{
        effectiveDate: String(employment.statusEffectiveDate || employment.terminationDate || employment.endDate || ''),
        changeType: 'Status',
        details: 'Current employment status on employee profile',
        previousValue: 'Active',
        newValue: status,
        updatedBy: 'System'
      }] : [])
    ].filter((change) => change.effectiveDate || change.changeType === 'Hire');
    return {
      index: index + 1,
      employeeName: `${employee.legalFirstName} ${employee.legalLastName}`.trim(),
      initials: `${employee.legalFirstName?.[0] || ''}${employee.legalLastName?.[0] || ''}`.toUpperCase(),
      employeeNumber: employee.employeeNumber,
      department,
      employmentType,
      payGroup: String(compensation.payFrequency || employee.payGroup || ''),
      status,
      tenureYears: hireDate && !Number.isNaN(hireDate.getTime()) ? Number(((now.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1)) : 0,
      changes
    };
  });
  const fullTime = rows.filter((row) => row.employmentType.toLowerCase().includes('full')).length;
  const active = rows.filter((row) => row.status.toLowerCase() === 'active').length;
  const avgTenure = rows.length ? Number((rows.reduce((sum, row) => sum + row.tenureYears, 0) / rows.length).toFixed(1)) : 0;
  res.json({
    metrics: {
      totalEmployees: rows.length,
      fullTime,
      partTime: Math.max(0, rows.length - fullTime),
      currentlyActive: active,
      onLeave: rows.filter((row) => row.status.toLowerCase().includes('leave')).length,
      totalPositionChanges: rows.reduce((sum, row) => sum + row.changes.length, 0),
      averageTenure: avgTenure,
      asOf: now.toISOString().slice(0, 10)
    },
    filters: {
      employees: ['All Employees', ...rows.map((row) => row.employeeName)],
      departments: Array.from(new Set(['All Departments', ...rows.map((row) => row.department).filter(Boolean)])),
      employmentTypes: Array.from(new Set(['All Types', ...rows.map((row) => row.employmentType).filter(Boolean)])),
      payGroups: Array.from(new Set(['All Pay Groups', ...rows.map((row) => row.payGroup).filter(Boolean)])),
      statuses: Array.from(new Set(['All Statuses', ...rows.map((row) => row.status).filter(Boolean)]))
    },
    rows
  });
});

const employeePayload = z.object({
  personal: z.record(z.string(), z.unknown()).default({}),
  employment: z.record(z.string(), z.unknown()).default({}),
  compensation: z.record(z.string(), z.unknown()).default({}),
  tax: z.record(z.string(), z.unknown()).default({}),
  vacation: z.record(z.string(), z.unknown()).default({}),
  benefits: z.record(z.string(), z.unknown()).default({}),
  banking: z.record(z.string(), z.unknown()).default({})
});

const createPayrollRunSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  payDate: z.coerce.date(),
  runType: z.enum(['regular', 'off_cycle', 'adjustment']).default('regular'),
  originalRunId: z.string().optional()
});

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function validatePayDateAfterLatestPayrollRun(
  companyId: string,
  payDate: Date,
  excludeRunId?: string
) {
  const filter: Record<string, unknown> = {
    companyId,
    status: { $ne: 'reversed' }
  };
  if (excludeRunId) filter._id = { $ne: new mongoose.Types.ObjectId(excludeRunId) };
  const latestRun = await PayrollRun.findOne(filter).sort({ payDate: -1, _id: -1 }).select('payDate');
  if (!latestRun || payDate.getTime() > latestRun.payDate.getTime()) return;
  throw new Error(
    `Pay date must be after the last payroll date (${dateOnly(latestRun.payDate)}).`
  );
}

function valueOrDefault<T extends Record<string, unknown>>(
  values: T,
  key: string,
  fallback: string
) {
  return text(values[key], fallback);
}

function payrollReadyProfile(
  profile: z.infer<typeof employeePayload>,
  company?: { address?: { province?: string }; payrollConfiguration?: Record<string, unknown> }
) {
  const companyProvince = company?.address?.province || 'Alberta';
  const vacationDefaults =
    company?.payrollConfiguration?.vacation &&
    typeof company.payrollConfiguration.vacation === 'object'
      ? (company.payrollConfiguration.vacation as Record<string, unknown>)
      : vacationPolicyForProvince(companyProvince);
  return {
    ...profile,
    employment: {
      ...profile.employment,
      employmentStatus: valueOrDefault(profile.employment, 'employmentStatus', 'Active'),
      employmentType: valueOrDefault(profile.employment, 'employmentType', 'Full-Time'),
      provinceOfEmployment: valueOrDefault(
        profile.employment,
        'provinceOfEmployment',
        companyProvince
      ),
      standardWeeklyHours: valueOrDefault(profile.employment, 'standardWeeklyHours', '44'),
      standardDailyHours: valueOrDefault(profile.employment, 'standardDailyHours', '8')
    },
    compensation: {
      ...profile.compensation,
      payType: valueOrDefault(profile.compensation, 'payType', 'Hourly'),
      hourlyRate: valueOrDefault(profile.compensation, 'hourlyRate', '25.00'),
      standardHoursPerWeek: valueOrDefault(profile.compensation, 'standardHoursPerWeek', '44'),
      standardHoursPerDay: valueOrDefault(profile.compensation, 'standardHoursPerDay', '8'),
      overtimeEligible: valueOrDefault(profile.compensation, 'overtimeEligible', 'Yes'),
      overtimeAfter: valueOrDefault(profile.compensation, 'overtimeAfter', '44'),
      overtimeRateMultiplier: valueOrDefault(profile.compensation, 'overtimeRateMultiplier', '1.5x'),
      payFrequency: valueOrDefault(profile.compensation, 'payFrequency', 'Biweekly')
    },
    tax: {
      ...profile.tax,
      provinceOfResidence: valueOrDefault(profile.tax, 'provinceOfResidence', companyProvince),
      residencyStatus: valueOrDefault(profile.tax, 'residencyStatus', 'Resident of Canada'),
      craTd1Form: valueOrDefault(profile.tax, 'craTd1Form', 'Completed'),
      claimPersonalAmount: valueOrDefault(profile.tax, 'claimPersonalAmount', 'Yes (Standard)'),
      additionalTaxToDeduct: valueOrDefault(profile.tax, 'additionalTaxToDeduct', '0.00'),
      cppExempt: valueOrDefault(profile.tax, 'cppExempt', 'No'),
      eiExempt: valueOrDefault(profile.tax, 'eiExempt', 'No')
    },
    vacation: {
      ...vacationDefaults,
      ...profile.vacation
    }
  };
}

const hoursEarningsSchema = z.object({
  lines: z
    .array(
      z.object({
        employeeId: z.string(),
        regularHours: z.coerce.number().min(0).default(0),
        overtimeHours: z.coerce.number().min(0).default(0),
        statePayHours: z.coerce.number().min(0).default(0),
        statePayBaseHours: z.coerce.number().min(0).optional(),
        statePayRegularDay: z.boolean().optional().default(true),
        statePayAlternativeDayOff: z.boolean().optional().default(false),
        hourlyRate: z.union([z.string(), z.number()]).default('0'),
        bonus: z.coerce.number().min(0).default(0),
        commission: z.coerce.number().min(0).default(0),
        vacationPay: z.coerce.number().min(0).optional(),
        otherEarnings: z.coerce.number().min(0).default(0),
        reimbursement: z.coerce.number().min(0).default(0),
        preTaxDeductions: z.coerce.number().min(0).default(0),
        postTaxDeductions: z.coerce.number().min(0).default(0),
        note: z.string().max(500).optional().default('')
      })
    )
    .min(1)
});

function employerPayrollProvince(companyProvince?: string): 'AB' | 'BC' | 'MB' | 'SK' | 'ON' {
  if (!companyProvince) {
    throw new Error('Set the company province before calculating payroll deductions');
  }
  const value = normalizeProvince(companyProvince);
  const provinces: Record<string, 'AB' | 'BC' | 'MB' | 'SK' | 'ON'> = {
    AB: 'AB',
    ALBERTA: 'AB',
    BC: 'BC',
    'BRITISH COLUMBIA': 'BC',
    MB: 'MB',
    MANITOBA: 'MB',
    ON: 'ON',
    ONTARIO: 'ON',
    SK: 'SK',
    SASKATCHEWAN: 'SK'
  };
  const province = provinces[value];
  if (!province)
    throw new Error(`Payroll tax configuration is not available for province "${value}"`);
  return province;
}

async function calculateCompanyPayrollLines(
  companyId: string | mongoose.Types.ObjectId,
  lines: z.infer<typeof hoursEarningsSchema>['lines'],
  periodStart: Date,
  periodEnd: Date,
  payFrequency: 'weekly' | 'biweekly' | 'monthly' = 'biweekly'
) {
  const [company, employees] = await Promise.all([
    Company.findById(companyId).select('address.province payrollConfiguration'),
    Employee.find({
      companyId,
      _id: { $in: lines.map((line) => line.employeeId) }
    }).select('taxProvince adminProfile.employment adminProfile.tax adminProfile.compensation')
  ]);
  const statePayConfig = company?.payrollConfiguration?.statePay as
    | { enabled?: boolean; dates?: string[]; holidays?: Array<{ name: string; date: string }> }
    | undefined;
  const defaultHoursPerDay = Number(company?.payrollConfiguration?.defaultHoursPerDay || 8);
  const configuredStatePayDates = statePayConfig?.holidays?.length
    ? statePayConfig.holidays.map((holiday) => holiday.date)
    : statePayConfig?.dates || [];
  const eligibleDates = statePayConfig?.enabled
    ? configuredStatePayDates.filter((date) => {
        const value = new Date(`${date}T00:00:00.000Z`);
        return value >= periodStart && value <= periodEnd;
      })
    : [];
  const vacationConfig = company?.payrollConfiguration?.vacation as
    | { vacationAccrualRate?: string | number }
    | undefined;
  const vacationAccrualRate =
    vacationConfig?.vacationAccrualRate ||
    vacationPolicyForProvince(company?.address?.province).vacationAccrualRate;
  const province = employerPayrollProvince(company?.address?.province);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  return lines.map((line) => {
    const employee = employeeById.get(line.employeeId);
    const hourlyRate =
      Number(line.hourlyRate || 0) > 0
        ? line.hourlyRate
        : text(employee?.adminProfile?.compensation?.hourlyRate, '25.00');
    return (
    calculatePayrollLine({
      ...line,
      hourlyRate,
      statePayHours: eligibleDates.length ? line.statePayHours : 0,
      statePayBaseHours: eligibleDates.length
        ? line.statePayBaseHours ?? eligibleDates.length * defaultHoursPerDay
        : 0,
      vacationAccrualRate,
      payFrequency,
      province
    })
    );
  });
}

const statePaySettingsSchema = z.object({
  holidays: z
    .array(
      z.object({
        name: z.string().trim().min(2).max(100),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
      })
    )
    .default([])
});

router.get('/company/state-pay', authenticate, requirePermission('payroll.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  res.setHeader('Cache-Control', 'no-store');
  const company = await Company.findById(companyId).select(
    'legalName customerId payrollConfiguration'
  );
  const statePay = company?.payrollConfiguration?.statePay as
    | { enabled?: boolean; dates?: string[]; holidays?: Array<{ name: string; date: string }> }
    | undefined;
  const holidays = statePay?.holidays?.length
    ? statePay.holidays
    : (statePay?.dates || []).map((date) => ({ name: 'Statutory holiday', date }));
  res.json({
    company: company
      ? { id: String(company._id), legalName: company.legalName, customerId: company.customerId }
      : undefined,
    payFrequency: z.enum(['weekly', 'biweekly', 'monthly']).catch('biweekly').parse(
      String(company?.payrollConfiguration?.payFrequency || 'biweekly').toLowerCase()
    ),
    statePay: {
      enabled: Boolean(statePay?.enabled),
      holidays,
      defaultHoursPerDay: Number(company?.payrollConfiguration?.defaultHoursPerDay || 8)
    }
  });
});

router.put('/company/state-pay', authenticate, requirePermission('payroll.prepare'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const parsed = statePaySettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid state pay settings', issues: parsed.error.issues });
  const company = await Company.findById(companyId);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  const currentStatePay = company.payrollConfiguration?.statePay as
    | { enabled?: boolean }
    | undefined;
  const holidays = [...parsed.data.holidays]
    .filter((holiday, index, values) => values.findIndex((item) => item.date === holiday.date) === index)
    .sort((left, right) => left.date.localeCompare(right.date));
  company.payrollConfiguration = {
    ...(company.payrollConfiguration || {}),
    statePay: {
      enabled: Boolean(currentStatePay?.enabled),
      holidays,
      dates: holidays.map((holiday) => holiday.date),
      overtimeMultiplier: 1.5
    }
  };
  company.markModified('payrollConfiguration');
  await company.save();
  res.json({ statePay: company.payrollConfiguration.statePay });
});

function text(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sinDigits(value: unknown) {
  return text(value).replace(/\D/g, '');
}

function employeeNotificationEmail(employee?: IEmployee | null) {
  if (!employee) return undefined;
  return employee.notificationEmailPreference === 'company'
    ? employee.companyEmail
    : employee.personalEmail || employee.companyEmail;
}

function employeeDisplayName(employee: IEmployee) {
  return (
    employee.preferredFirstName ||
    employee.legalFirstName ||
    `${employee.legalFirstName || ''} ${employee.legalLastName || ''}`.trim() ||
    'there'
  );
}

function moneyLinesForEmail(
  lines: Array<{ description?: string; code?: string; amount?: mongoose.Types.Decimal128 }>
) {
  return lines
    .filter((line) => line.code !== 'TOTAL' || moneyToNumber(line.amount || 0) !== 0)
    .map((line) => `${line.description || line.code || 'Amount'}: ${formatMoney(line.amount || 0)}`);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function emailList(items: string[]) {
  return items.length ? items.map((item) => `- ${item}`) : ['- None'];
}

function htmlList(items: string[]) {
  const rows = (items.length ? items : ['None'])
    .map((item) => {
      const cleanItem = item.replace(/^- /, '');
      const separatorIndex = cleanItem.indexOf(':');
      const label = separatorIndex >= 0 ? cleanItem.slice(0, separatorIndex) : '';
      const value = separatorIndex >= 0 ? cleanItem.slice(separatorIndex + 1).trim() : cleanItem;
      return [
        '<tr>',
        `<td style="padding:8px 12px;border:1px solid #dbe4f0;background:#f8fafc;font-weight:700;color:#1e3a8a;">${escapeHtml(label || 'Item')}</td>`,
        `<td style="padding:8px 12px;border:1px solid #dbe4f0;color:#111827;">${escapeHtml(value)}</td>`,
        '</tr>'
      ].join('');
    })
    .join('');
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:680px;margin:8px 0 18px;font-size:14px;">${rows}</table>`;
}

async function sendPayStatementNotificationEmail(input: {
  employee: IEmployee;
  statement: {
    payDate: Date;
    netPay: mongoose.Types.Decimal128;
    grossPay?: mongoose.Types.Decimal128;
    grossEarnings: Array<{ description?: string; code?: string; amount?: mongoose.Types.Decimal128 }>;
    deductions: Array<{ description?: string; code?: string; amount?: mongoose.Types.Decimal128 }>;
    additionalInfo: Array<{ key?: string; value?: string }>;
    regularHours?: number;
    overtimeHours?: number;
    statePayHours?: number;
  };
  periodStart: Date;
  periodEnd: Date;
  companyName?: string;
  isRevision?: boolean;
  changes?: string[];
}) {
  const email = employeeNotificationEmail(input.employee);
  if (!email || input.employee.payStatementPreference?.emailStatement === false) return false;

  const heading = input.isRevision ? 'REVISED PAYSLIP GENERATED' : 'PAYSLIP GENERATED';
  const subjectPrefix = input.isRevision ? 'Revised payslip generated' : 'Payslip generated';
  const earnings = moneyLinesForEmail(input.statement.grossEarnings);
  const deductions = moneyLinesForEmail(input.statement.deductions);
  const info = input.statement.additionalInfo
    .filter((item) => item.key && item.value)
    .map((item) => `${item.key}: ${item.value}`);
  const changes = input.changes?.length ? input.changes : [];
  const hours = [
    `Regular hours: ${input.statement.regularHours || 0}`,
    `Overtime hours: ${input.statement.overtimeHours || 0}`,
    `Stat holiday hours: ${input.statement.statePayHours || 0}`
  ];
  const summary = [
    `Company: ${input.companyName || 'Your employer'}`,
    `Employee number: ${input.employee.employeeNumber}`,
    `Pay period: ${dateOnly(input.periodStart)} to ${dateOnly(input.periodEnd)}`,
    `Pay date: ${dateOnly(input.statement.payDate)}`,
    `Gross pay: ${formatMoney(input.statement.grossPay || 0)}`,
    `Total deductions: ${formatMoney(deductionTotalAmount(input.statement.deductions))}`,
    `Net pay: ${formatMoney(input.statement.netPay)}`
  ];
  const body = [
    `Hello ${employeeDisplayName(input.employee)},`,
    '',
    heading,
    '',
    'Your payslip has been generated and is available in Payhours. Key details are below.',
    '',
    ...summary,
    '',
    'Hours',
    ...emailList(hours),
    '',
    'Earnings',
    ...emailList(earnings),
    '',
    'Deductions',
    ...emailList(deductions),
    ...(changes.length ? ['', 'Changes', ...emailList(changes)] : []),
    '',
    'Additional details',
    ...emailList(info),
    '',
    `Sign in to view the full payslip: ${env.portalUrl}`
  ].join('\n');
  const html = [
    `<h1 style="font-size:22px;margin:0 0 12px;color:#0f172a;">${heading}</h1>`,
    `<p>Hello ${escapeHtml(employeeDisplayName(input.employee))},</p>`,
    '<p>Your payslip has been generated and is available in Payhours. Key details are below.</p>',
    `<h2 style="font-size:16px;">Summary</h2>${htmlList(summary)}`,
    `<h2 style="font-size:16px;">Hours</h2>${htmlList(hours)}`,
    `<h2 style="font-size:16px;">Earnings</h2>${htmlList(earnings)}`,
    `<h2 style="font-size:16px;">Deductions</h2>${htmlList(deductions)}`,
    changes.length ? `<h2 style="font-size:16px;">Changes</h2>${htmlList(changes)}` : '',
    `<h2 style="font-size:16px;">Additional details</h2>${htmlList(info)}`,
    `<p><a href="${escapeHtml(env.portalUrl)}">Sign in to view the full payslip</a></p>`
  ].join('');

  await emailService.send({
    to: email,
    subject: `${subjectPrefix} for ${dateOnly(input.statement.payDate)}`,
    body,
    html
  });
  return true;
}

function employeeFieldsFromProfile(
  profile: z.infer<typeof employeePayload>,
  companyId: string,
  userId: mongoose.Types.ObjectId,
  employeeNumber: string,
  email: string,
  company?: { address?: { province?: string }; payrollConfiguration?: Record<string, unknown> }
) {
  profile = payrollReadyProfile(profile, company);
  const personal = profile.personal;
  const employment = profile.employment;
  const tax = profile.tax;
  const compensation = profile.compensation;
  const banking = profile.banking;
  const companyVacation =
    company?.payrollConfiguration?.vacation &&
    typeof company.payrollConfiguration.vacation === 'object'
      ? (company.payrollConfiguration.vacation as Record<string, unknown>)
      : vacationPolicyForProvince(company?.address?.province);
  const companyBenefits =
    company?.payrollConfiguration?.benefits &&
    typeof company.payrollConfiguration.benefits === 'object'
      ? (company.payrollConfiguration.benefits as Record<string, unknown>)
      : {};
  return {
    userId,
    companyId,
    employeeNumber,
    legalFirstName: text(personal.firstName, 'New'),
    middleName: text(personal.middleName),
    legalLastName: text(personal.lastName, 'Employee'),
    preferredFirstName: text(personal.preferredName, text(personal.firstName)),
    sinEncrypted: encryptSin(
      text(personal.sin, text(tax.sin, '000000000')).replace(/\D/g, '').padEnd(9, '0').slice(0, 9)
    ),
    birthDate: text(personal.birthDate) ? new Date(text(personal.birthDate)) : undefined,
    addresses: [
      {
        street: text(personal.address),
        city: text(personal.city),
        province: text(personal.province),
        postalCode: text(personal.postalCode)
      }
    ],
    phones: [{ type: 'Mobile' as const, number: text(personal.phoneNumber) }],
    personalEmail: email.toLowerCase(),
    notificationEmailPreference: 'personal' as const,
    emergencyContacts: [],
    occupation: text(employment.jobTitle),
    startDate: text(employment.hireDate) ? new Date(text(employment.hireDate)) : undefined,
    seniorityDate: text(employment.originalHireDate)
      ? new Date(text(employment.originalHireDate))
      : undefined,
    primaryEarningCode: text(compensation.payType, 'Hourly'),
    payGroup: text(compensation.payFrequency, 'Biweekly'),
    taxProvince: text(
      tax.provinceOfResidence,
      text(employment.provinceOfEmployment, company?.address?.province || '')
    ),
    payStatementPreference: { emailStatement: true, language: 'English' as const },
    adminProfile: {
      ...profile,
      vacation: { ...companyVacation, ...profile.vacation },
      benefits: { ...companyBenefits, ...profile.benefits },
      banking: { ...banking, accountNumber: text(banking.accountNumber) }
    }
  };
}

router.get(
  '/employees',
  authenticate,
  requirePermission('employee.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const company = await Company.findById(companyId);
    const employees = await Employee.find({ companyId }).sort({
      employeeNumber: 1,
      legalLastName: 1
    });
    res.json({
      employees: employees.map((employee) => serializeEmployee(employee, company || undefined))
    });
  }
);

router.get(
  '/employees/:employeeId',
  authenticate,
  requirePermission('employee.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const [company, employee] = await Promise.all([
      Company.findById(companyId),
      Employee.findOne({ _id: req.params.employeeId, companyId })
    ]);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    res.json({ employee: serializeEmployee(employee, company || undefined) });
  }
);

router.patch(
  '/employees/:employeeId/banking',
  authenticate,
  requirePermission('bank.edit'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const banking = z.record(z.string(), z.unknown()).safeParse(req.body);
    if (!banking.success) return res.status(400).json({ message: 'Invalid banking payload' });
    const employee = await Employee.findOneAndUpdate(
      { _id: req.params.employeeId, companyId },
      { $set: { 'adminProfile.banking': banking.data } },
      { new: true }
    );
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    await AuditLog.create({
      userId: req.user?.id,
      employeeId: employee._id,
      companyId,
      eventType: 'EMPLOYEE_UPSERT',
      metadata: { section: 'banking' }
    });
    res.json({ employee: serializeEmployee(employee) });
  }
);

router.get(
  '/employees/:employeeId/sin',
  authenticate,
  requirePermission('employee.sin.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const employee = await Employee.findOne({ _id: req.params.employeeId, companyId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (!employee.sinEncrypted) return res.status(404).json({ message: 'SIN not found' });
    await AuditLog.create({
      userId: req.user?.id,
      employeeId: employee._id,
      companyId,
      eventType: 'SIN_UNMASK'
    });
    res.json({ employeeId: String(employee._id), sin: decryptSin(employee.sinEncrypted) });
  }
);

router.get(
  '/payroll-runs',
  authenticate,
  requirePermission('payroll.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const [runs, company] = await Promise.all([
      PayrollRun.find({ companyId }).sort({ payDate: -1 }),
      Company.findById(companyId).select('address.province payrollConfiguration')
    ]);
    const vacationConfig = company?.payrollConfiguration?.vacation as
      | { vacationAccrualRate?: string | number }
      | undefined;
    const vacationAccrualRate = String(
      vacationConfig?.vacationAccrualRate ||
        vacationPolicyForProvince(company?.address?.province).vacationAccrualRate
    );
    const employees = await Employee.find({ companyId }).select(
      'legalFirstName legalLastName employeeNumber'
    );
    const employeeNames = new Map(
      employees.map((employee) => [
        String(employee._id),
        {
          employeeName: `${employee.legalFirstName} ${employee.legalLastName}`.trim(),
          employeeNumber: employee.employeeNumber
        }
      ])
    );
    res.json({
      runs: runs.map((run) => ({
        ...serializePayrollRun(run),
        lines: serializePayrollRun(run).lines.map((line) => ({
          ...line,
          ...employeeNames.get(line.employeeId)
        })),
        canEditFinalized:
          run.status === 'finalized' &&
          !runs.some(
            (otherRun) =>
              otherRun.status !== 'reversed' && otherRun.payDate.getTime() > run.payDate.getTime()
          ),
        vacationAccrualRate,
        estimatedGross: formatMoney(run.estimatedGross)
      }))
    });
  }
);

async function loadPayrollRun(req: AuthRequest, res: import('express').Response) {
  const companyId = requireEmployer(req, res);
  if (!companyId) return undefined;
  const run = await PayrollRun.findOne({ _id: req.params.id, companyId });
  if (!run) {
    res.status(404).json({ message: 'Payroll run not found' });
    return undefined;
  }
  return run;
}

async function auditPayroll(
  req: AuthRequest,
  run: { _id: unknown; companyId: unknown },
  action: string,
  before?: string,
  after?: string
) {
  await AuditLog.create({
    userId: req.user?.id,
    companyId: run.companyId as mongoose.Types.ObjectId,
    eventType: before && after ? 'PAYROLL_STATUS_CHANGED' : 'PAYROLL_UPDATED',
    metadata: { action, payrollRunId: String(run._id), before, after }
  });
}

function transitionRun(
  run: Awaited<ReturnType<typeof PayrollRun.findOne>> extends infer T ? NonNullable<T> : never,
  req: AuthRequest,
  to: typeof run.status,
  note?: string
) {
  const from = run.status;
  assertPayrollTransition(from, to);
  const actor = new mongoose.Types.ObjectId(req.employerContext!.employerUserId);
  run.status = to;
  run.statusHistory.push({ from, to, changedBy: actor, changedAt: new Date(), note });
  if (to === 'in_review') run.preparedBy = actor;
  if (to === 'approved') run.approvedBy = actor;
  if (to === 'finalized') run.finalizedBy = actor;
  if (to === 'locked') run.lockedBy = actor;
  if (to === 'reversed') run.reversedBy = actor;
  if (to === 'adjusted') run.adjustedBy = actor;
  return { from, to };
}

router.post(
  '/payroll-runs',
  authenticate,
  requirePermission('payroll.prepare'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const parsed = createPayrollRunSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: 'Invalid payroll run payload', issues: parsed.error.issues });
    const company = await Company.findById(companyId).select('payrollConfiguration.payFrequency');
    if (!company) return res.status(404).json({ message: 'Company not found' });
    const configuredFrequency = String(company.payrollConfiguration?.payFrequency || 'biweekly').toLowerCase();
    const payFrequency = z.enum(['weekly', 'biweekly', 'monthly']).catch('biweekly').parse(configuredFrequency);
    try {
      await validatePayDateAfterLatestPayrollRun(companyId, parsed.data.payDate);
    } catch (error) {
      return res.status(409).json({ message: error instanceof Error ? error.message : 'Invalid pay date' });
    }
    const run = await PayrollRun.create({
      companyId,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      payDate: parsed.data.payDate,
      runType: parsed.data.runType,
      payFrequency,
      originalRunId: parsed.data.originalRunId,
      employeeCount: 0,
      totalHours: 0,
      estimatedGross: decimalToMoney('0'),
      totalDeductions: decimalToMoney('0'),
      totalNetPay: decimalToMoney('0'),
      status: 'draft',
      preparedBy: req.employerContext!.employerUserId,
      lines: [],
      statusHistory: [
        {
          to: 'draft',
          changedBy: new mongoose.Types.ObjectId(req.employerContext!.employerUserId),
          changedAt: new Date(),
          note: 'created'
        }
      ]
    });
    await auditPayroll(req, run, 'created', undefined, 'draft');
    res.status(201).json({ run: serializePayrollRun(run) });
  }
);

router.put(
  '/payroll-runs/:id',
  authenticate,
  requirePermission('payroll.prepare'),
  async (req: AuthRequest, res) => {
    const run = await loadPayrollRun(req, res);
    if (!run) return;
    if (run.status !== 'draft')
      return res.status(409).json({ message: `Cannot edit a ${run.status} payroll run` });
    const parsed = createPayrollRunSchema.safeParse({
      ...req.body,
      runType: req.body.runType || run.runType || 'regular'
    });
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: 'Invalid payroll run payload', issues: parsed.error.issues });
    try {
      await validatePayDateAfterLatestPayrollRun(
        String(run.companyId),
        parsed.data.payDate,
        String(run._id)
      );
    } catch (error) {
      return res.status(409).json({ message: error instanceof Error ? error.message : 'Invalid pay date' });
    }
    run.periodStart = parsed.data.periodStart;
    run.periodEnd = parsed.data.periodEnd;
    run.payDate = parsed.data.payDate;
    await run.save();
    await auditPayroll(req, run, 'draft_updated');
    res.json({ run: serializePayrollRun(run) });
  }
);

router.put(
  '/payroll-runs/:id/hours-earnings',
  authenticate,
  requirePermission('payroll.prepare'),
  async (req: AuthRequest, res) => {
    const run = await loadPayrollRun(req, res);
    if (!run) return;
    if (['finalized', 'locked', 'reversed'].includes(run.status))
      return res.status(409).json({ message: `Cannot edit a ${run.status} payroll run` });
    const parsed = hoursEarningsSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: 'Invalid hours and earnings payload', issues: parsed.error.issues });
    const calculatedLines = await calculateCompanyPayrollLines(
      run.companyId,
      parsed.data.lines,
      run.periodStart,
      run.periodEnd,
      run.payFrequency || 'biweekly'
    );
    const pendingAdjustments = await PayrollCarryForward.find({
      companyId: run.companyId,
      employeeId: { $in: calculatedLines.map((line) => line.employeeId) },
      status: 'pending'
    });
    run.lines = calculatedLines.map((line) => {
      const employeeAdjustments = pendingAdjustments.filter(
        (adjustment) => String(adjustment.employeeId) === String(line.employeeId)
      );
      const carryForwardAdjustment = sumMoney(
        employeeAdjustments.map((adjustment) => adjustment.amount)
      );
      return {
        ...line,
        carryForwardAdjustment: decimalToMoney(carryForwardAdjustment),
        carryForwardAdjustmentIds: employeeAdjustments.map(
          (adjustment) => adjustment._id as mongoose.Types.ObjectId
        ),
        netPay: decimalToMoney(sumMoney([line.netPay, carryForwardAdjustment]))
      };
    });
    Object.assign(run, summarizePayrollLines(run.lines));
    await run.save();
    await auditPayroll(req, run, 'hours_earnings_updated');
    res.json({ run: serializePayrollRun(run) });
  }
);

router.post(
  '/payroll-runs/:id/submit-for-review',
  authenticate,
  requirePermission('payroll.prepare'),
  async (req: AuthRequest, res) => {
    const run = await loadPayrollRun(req, res);
    if (!run) return;
    if (!run.lines.length)
      return res
        .status(400)
        .json({ message: 'Enter hours and earnings before submitting for review' });
    try {
      const transition = transitionRun(run, req, 'in_review');
      await run.save();
      await auditPayroll(req, run, 'submitted_for_review', transition.from, transition.to);
      res.json({ run: serializePayrollRun(run) });
    } catch (error) {
      res
        .status(409)
        .json({ message: error instanceof Error ? error.message : 'Invalid payroll transition' });
    }
  }
);

router.post(
  '/payroll-runs/:id/approve',
  authenticate,
  requirePermission('payroll.approve'),
  async (req: AuthRequest, res) => {
    const run = await loadPayrollRun(req, res);
    if (!run) return;
    try {
      const transition = transitionRun(run, req, 'approved');
      await run.save();
      await auditPayroll(req, run, 'approved', transition.from, transition.to);
      res.json({
        run: serializePayrollRun(run),
        separationOfDuties:
          'No explicit product rule was available, so same-user prepare/approve is currently allowed.'
      });
    } catch (error) {
      res
        .status(409)
        .json({ message: error instanceof Error ? error.message : 'Invalid payroll transition' });
    }
  }
);

router.post(
  '/payroll-runs/:id/reject',
  authenticate,
  requirePermission('payroll.approve'),
  async (req: AuthRequest, res) => {
    const run = await loadPayrollRun(req, res);
    if (!run) return;
    if (run.status !== 'in_review' && run.status !== 'approved') {
      return res.status(409).json({ message: 'Only payroll under review or approved can be rejected' });
    }
    const parsed = z
      .object({ reason: z.string().trim().min(3, 'Enter a reason for rejecting payroll').max(500) })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: 'A rejection reason is required',
        issues: parsed.error.issues
      });
    }
    try {
      const transition = transitionRun(run, req, 'draft', `Rejected: ${parsed.data.reason}`);
      run.approvedBy = undefined;
      await run.save();
      await auditPayroll(
        req,
        run,
        `rejected: ${parsed.data.reason}`,
        transition.from,
        transition.to
      );
      res.json({
        run: serializePayrollRun(run),
        message: 'Payroll rejected and returned to draft for correction.'
      });
    } catch (error) {
      res
        .status(409)
        .json({ message: error instanceof Error ? error.message : 'Payroll rejection failed' });
    }
  }
);

router.post(
  '/payroll-runs/:id/finalize',
  authenticate,
  requirePermission('payroll.approve'),
  async (req: AuthRequest, res) => {
    const run = await loadPayrollRun(req, res);
    if (!run) return;
    try {
      const transition = transitionRun(run, req, 'finalized');
      const periodNumber = Number(
        `${run.periodEnd.getMonth() + 1}${String(run.periodEnd.getDate()).padStart(2, '0')}`
      );
      const [company, employees] = await Promise.all([
        Company.findById(run.companyId).select('legalName address.province'),
        Employee.find({ _id: { $in: run.lines.map((line) => line.employeeId) } })
      ]);
      const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
      const emailErrors: string[] = [];
      for (const line of run.lines) {
        const statement = await PayStatement.create({
          employeeId: line.employeeId,
          companyId: run.companyId,
          payDate: run.payDate,
          payPeriodNumber: periodNumber,
          payPeriodYear: run.payDate.getFullYear(),
          type:
            run.runType === 'regular'
              ? 'Regular'
              : run.runType === 'off_cycle'
                ? 'Off-cycle'
                : 'Adjustment',
          netPay: line.netPay,
          yearToDateNetPay: line.netPay,
          grossEarnings: [
            {
              code: 'REG',
              description: 'Regular earnings',
              amount: decimalToMoney(moneyToNumber(line.hourlyRate) * line.regularHours),
              currentUnits: String(line.regularHours || 0),
              rate: formatMoney(line.hourlyRate)
            },
            {
              code: 'OT',
              description: 'Overtime earnings',
              amount: decimalToMoney(moneyToNumber(line.hourlyRate) * line.overtimeHours * 1.5),
              currentUnits: String(line.overtimeHours || 0),
              rate: line.overtimeHours ? formatMoney(moneyToNumber(line.hourlyRate) * 1.5) : ''
            },
            ...(moneyToNumber(line.statePay || 0) > 0
              ? [
                  {
                    code: 'STATE',
                    description: 'Statutory holiday pay',
                    amount: line.statePay,
                    currentUnits: String(
                      Number(line.statePayBaseHours || 0) + Number(line.statePayHours || 0)
                    ),
                    rate: formatMoney(line.hourlyRate)
                  }
                ]
              : []),
            { code: 'BONUS', description: 'Bonus', amount: line.bonus },
            { code: 'COMM', description: 'Commission', amount: line.commission },
            { code: 'VAC', description: 'Vacation pay', amount: line.vacationPay },
            { code: 'OTHER', description: 'Other earnings', amount: line.otherEarnings },
            ...(moneyToNumber(line.carryForwardAdjustment || 0) !== 0
              ? [
                  {
                    code: 'ADJ',
                    description: 'Prior payroll net adjustment (non-taxable)',
                    amount: line.carryForwardAdjustment
                  }
                ]
              : []),
            { code: 'TOTAL', description: 'Total gross pay', amount: line.grossPay }
          ],
          deductions: [
            { code: 'CPP', description: 'CPP', amount: line.cpp },
            { code: 'CPP2', description: 'Additional CPP', amount: line.cpp2 },
            { code: 'EI', description: 'EI', amount: line.ei },
            { code: 'FTAX', description: 'Federal tax', amount: line.federalTax },
            { code: 'PTAX', description: 'Provincial income tax', amount: line.provincialTax },
            { code: 'PRE', description: 'Other pre-tax deductions', amount: line.preTaxDeductions },
            {
              code: 'POST',
              description: 'Other post-tax deductions',
              amount: line.postTaxDeductions
            },
            { code: 'TOTAL', description: 'Total deductions', amount: line.deductionsTotal }
          ],
          additionalInfo: [
            { key: 'Payroll Run', value: String(run._id) },
            {
              key: 'Pay Period',
              value: `${run.periodStart.toISOString().slice(0, 10)} to ${run.periodEnd.toISOString().slice(0, 10)}`
            },
            ...(moneyToNumber(line.statePay || 0) > 0 && line.statePayExplanation
              ? [{ key: 'State Holiday Pay Rule', value: line.statePayExplanation }]
              : moneyToNumber(line.statePay || 0) > 0
                ? [{ key: 'State Holiday Pay Rule', value: stateHolidayPayRule2026(line.statePayProvince || company?.address?.province) }]
              : []),
            { key: 'Reimbursement', value: formatMoney(line.reimbursement || 0) },
            ...(moneyToNumber(line.carryForwardAdjustment || 0) !== 0
              ? [
                  {
                    key: 'Prior Payroll Adjustment',
                    value: `${formatMoney(line.carryForwardAdjustment)} applied from a previously revised payroll`
                  }
                ]
              : []),
            ...(line.note ? [{ key: 'Payroll Note', value: line.note }] : [])
          ],
          periodStart: run.periodStart,
          periodEnd: run.periodEnd,
          regularHours: Number(line.regularHours || 0),
          overtimeHours: Number(line.overtimeHours || 0),
          statePayHours: Number(line.statePayHours || 0),
          statePayBaseHours: line.statePayBaseHours,
          statePayProvince: line.statePayProvince,
          statePayExplanation: line.statePayExplanation,
          hourlyRate: line.hourlyRate,
          grossPay: line.grossPay,
          revision: 1,
          changeSummary: [],
          isUnread: true
        });
        line.statementId = statement._id as mongoose.Types.ObjectId;
        const employee = employeeById.get(String(line.employeeId));
        if (employee) {
          try {
            await sendPayStatementNotificationEmail({
              employee,
              statement,
              periodStart: run.periodStart,
              periodEnd: run.periodEnd,
              companyName: company?.legalName
            });
          } catch (error) {
            emailErrors.push(
              `${employee.employeeNumber}: ${error instanceof Error ? error.message : 'email failed'}`
            );
          }
        }
        if (line.carryForwardAdjustmentIds?.length) {
          await PayrollCarryForward.updateMany(
            { _id: { $in: line.carryForwardAdjustmentIds }, status: 'pending' },
            { $set: { status: 'applied', appliedPayrollRunId: run._id, appliedAt: new Date() } }
          );
        }
      }
      await run.save();
      await auditPayroll(req, run, 'finalized', transition.from, transition.to);
      res.json({
        run: serializePayrollRun(run),
        message: emailErrors.length
          ? `Payroll finalized and payslips generated. Some email notifications failed: ${emailErrors.join('; ')}`
          : 'Payroll finalized, payslips generated and employees notified.'
      });
    } catch (error) {
      res
        .status(409)
        .json({ message: error instanceof Error ? error.message : 'Invalid payroll transition' });
    }
  }
);

router.put(
  '/payroll-runs/:id/revise-finalized',
  authenticate,
  requirePermission('payroll.prepare'),
  async (req: AuthRequest, res) => {
    const run = await loadPayrollRun(req, res);
    if (!run) return;
    if (run.status !== 'finalized')
      return res.status(409).json({ message: 'Only a finalized payroll can be revised' });
    const newerRun = await PayrollRun.exists({
      companyId: run.companyId,
      status: { $ne: 'reversed' },
      payDate: { $gt: run.payDate }
    });
    if (newerRun)
      return res.status(409).json({
        message:
          'This payroll can no longer be edited because the next payroll has already been created'
      });
    const parsed = hoursEarningsSchema
      .extend({
        periodStart: z.coerce.date().optional(),
        periodEnd: z.coerce.date().optional(),
        payDate: z.coerce.date().optional(),
        reason: z.string().trim().min(3, 'Enter a reason for editing payroll').max(500)
      })
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: 'Invalid revised payroll details', issues: parsed.error.issues });

    const oldLines = run.lines.map((line) => ({
      employeeId: String(line.employeeId),
      regularHours: Number(line.regularHours || 0),
      overtimeHours: Number(line.overtimeHours || 0),
      statePayHours: line.statePayHours || 0,
      statePayBaseHours: line.statePayBaseHours || 0,
      hourlyRate: formatMoney(line.hourlyRate),
      grossPay: formatMoney(line.grossPay),
      bonus: formatMoney(line.bonus || 0),
      commission: formatMoney(line.commission || 0),
      vacationPay: formatMoney(line.vacationPay || 0),
      statePay: formatMoney(line.statePay || 0),
      otherEarnings: formatMoney(line.otherEarnings || 0),
      reimbursement: formatMoney(line.reimbursement || 0),
      preTaxDeductions: formatMoney(line.preTaxDeductions || 0),
      postTaxDeductions: formatMoney(line.postTaxDeductions || 0),
      note: line.note || '',
      deductionsTotal: formatMoney(line.deductionsTotal),
      netPay: formatMoney(line.netPay),
      statementId: line.statementId
    }));
    const oldPeriodStart = run.periodStart.toISOString().slice(0, 10);
    const oldPeriodEnd = run.periodEnd.toISOString().slice(0, 10);
    const oldPayDate = run.payDate.toISOString().slice(0, 10);
    if (parsed.data.payDate) {
      try {
        await validatePayDateAfterLatestPayrollRun(
          String(run.companyId),
          parsed.data.payDate,
          String(run._id)
        );
      } catch (error) {
        return res.status(409).json({ message: error instanceof Error ? error.message : 'Invalid pay date' });
      }
    }
    if (parsed.data.periodStart) run.periodStart = parsed.data.periodStart;
    if (parsed.data.periodEnd) run.periodEnd = parsed.data.periodEnd;
    if (parsed.data.payDate) run.payDate = parsed.data.payDate;
    const recalculatedLines = await calculateCompanyPayrollLines(
      run.companyId,
      parsed.data.lines,
      run.periodStart,
      run.periodEnd,
      run.payFrequency || 'biweekly'
    );
    const revisedLines = recalculatedLines.map((line) => ({
      ...line,
      statementId: undefined as mongoose.Types.ObjectId | undefined
    }));
    const [company, employees] = await Promise.all([
      Company.findById(run.companyId).select('legalName address.province'),
      Employee.find({
        _id: { $in: revisedLines.map((line) => line.employeeId) }
      })
    ]);
    const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
    const periodNumber = Number(
      `${run.periodEnd.getMonth() + 1}${String(run.periodEnd.getDate()).padStart(2, '0')}`
    );
    const emailErrors: string[] = [];

    for (const line of revisedLines) {
      const priorLine = oldLines.find((item) => item.employeeId === String(line.employeeId));
      const priorStatement = priorLine?.statementId
        ? await PayStatement.findById(priorLine.statementId)
        : await PayStatement.findOne({
            employeeId: line.employeeId,
            companyId: run.companyId,
            payDate: {
              $gte: new Date(`${oldPayDate}T00:00:00.000Z`),
              $lte: new Date(`${oldPayDate}T23:59:59.999Z`)
            },
            supersededByStatementId: { $exists: false }
          }).sort({ revision: -1, _id: -1 });
      const changes: string[] = [];
      const compare = (label: string, before: string | number, after: string | number) => {
        if (String(before) !== String(after)) changes.push(`${label}: ${before} -> ${after}`);
      };
      if (priorLine) {
        compare('Regular hours', priorLine.regularHours, line.regularHours);
        compare('Overtime hours', priorLine.overtimeHours, line.overtimeHours);
        compare('State holiday hours', priorLine.statePayHours, line.statePayHours);
        compare('State holiday base hours', priorLine.statePayBaseHours, line.statePayBaseHours);
        compare('Hourly rate', priorLine.hourlyRate, formatMoney(line.hourlyRate));
        compare('Bonus', priorLine.bonus, formatMoney(line.bonus));
        compare('Commission', priorLine.commission, formatMoney(line.commission));
        compare('Vacation pay', priorLine.vacationPay, formatMoney(line.vacationPay));
        compare('State holiday pay', priorLine.statePay, formatMoney(line.statePay));
        compare('Other earnings', priorLine.otherEarnings, formatMoney(line.otherEarnings));
        compare('Reimbursement', priorLine.reimbursement, formatMoney(line.reimbursement));
        compare(
          'Pre-tax deductions',
          priorLine.preTaxDeductions,
          formatMoney(line.preTaxDeductions)
        );
        compare(
          'Post-tax deductions',
          priorLine.postTaxDeductions,
          formatMoney(line.postTaxDeductions)
        );
        compare('Note', priorLine.note, line.note || '');
        compare('Gross pay', priorLine.grossPay, formatMoney(line.grossPay));
        compare('Deductions', priorLine.deductionsTotal, formatMoney(line.deductionsTotal));
        compare('Net pay', priorLine.netPay, formatMoney(line.netPay));
        const originalLine = run.lines.find((item) => String(item.employeeId) === String(line.employeeId));
        if (originalLine) {
          compare('State holiday regular day', String(originalLine.statePayRegularDay), String(line.statePayRegularDay));
          compare('State holiday alternative day off', String(originalLine.statePayAlternativeDayOff), String(line.statePayAlternativeDayOff));
          compare('State holiday province', originalLine.statePayProvince || '', line.statePayProvince || '');
          compare('State holiday rule', originalLine.statePayExplanation || '', line.statePayExplanation || '');
          compare('CPP', formatMoney(originalLine.cpp), formatMoney(line.cpp));
          compare('Additional CPP', formatMoney(originalLine.cpp2), formatMoney(line.cpp2));
          compare('EI', formatMoney(originalLine.ei), formatMoney(line.ei));
          compare('Federal tax', formatMoney(originalLine.federalTax), formatMoney(line.federalTax));
          compare('Provincial tax', formatMoney(originalLine.provincialTax), formatMoney(line.provincialTax));
          compare('Carry-forward adjustment', formatMoney(originalLine.carryForwardAdjustment), formatMoney(line.carryForwardAdjustment));
        }
      } else {
        changes.push('Employee added to revised payroll');
      }
      compare('Pay period start', oldPeriodStart, run.periodStart.toISOString().slice(0, 10));
      compare('Pay period end', oldPeriodEnd, run.periodEnd.toISOString().slice(0, 10));
      compare('Pay date', oldPayDate, run.payDate.toISOString().slice(0, 10));
      if (priorLine && changes.length === 0) {
        line.statementId = priorLine.statementId;
        continue;
      }
      const ytdOther = await PayStatement.find({
        employeeId: line.employeeId,
        companyId: run.companyId,
        payPeriodYear: run.payDate.getFullYear(),
        payDate: { $lte: run.payDate },
        supersededByStatementId: { $exists: false },
        _id: { $ne: priorStatement?._id }
      });
      const ytdNet = sumMoney([
        ...ytdOther
          .filter((statement) =>
            isInPayStatementYtd(statement, {
              payDate: run.payDate,
              payPeriodYear: run.payDate.getFullYear(),
              payPeriodNumber: periodNumber
            })
          )
          .map((statement) => statement.netPay),
        line.netPay
      ]);
      const revision = (priorStatement?.revision || 1) + 1;
      changes.unshift(`Reason for revision: ${parsed.data.reason}`);
      const afterPaymentDate = new Date().toISOString().slice(0, 10) > oldPayDate;
      const netDifference = priorLine ? moneyToNumber(line.netPay) - Number(priorLine.netPay) : 0;
      let carryForwardMessage = '';
      if (afterPaymentDate && priorLine && Math.abs(netDifference) >= 0.005) {
        const existingCarryForward = await PayrollCarryForward.findOne({
          companyId: run.companyId,
          employeeId: line.employeeId,
          sourcePayrollRunId: run._id,
          status: 'pending'
        });
        const cumulativeAmount = moneyToNumber(existingCarryForward?.amount || 0) + netDifference;
        if (Math.abs(cumulativeAmount) < 0.005) {
          if (existingCarryForward) await existingCarryForward.deleteOne();
          changes.push(
            'Carry-forward adjustment cleared because the paid amount difference was fully reversed'
          );
        } else {
          const carryForward = await PayrollCarryForward.findOneAndUpdate(
            { companyId: run.companyId, employeeId: line.employeeId, sourcePayrollRunId: run._id },
            {
              $set: {
                sourceStatementId: priorStatement?._id,
                amount: decimalToMoney(cumulativeAmount),
                reason: `Net pay changed from ${priorLine.netPay} to ${formatMoney(line.netPay)} after payment date ${oldPayDate}`,
                status: 'pending'
              },
              $unset: { appliedPayrollRunId: 1, appliedAt: 1 }
            },
            { upsert: true, new: true }
          );
          carryForwardMessage = `${formatMoney(carryForward.amount)} will be applied to the next payroll`;
          changes.push(`Carry-forward adjustment: ${carryForwardMessage}`);
        }
      }
      const statement = await PayStatement.create({
        employeeId: line.employeeId,
        companyId: run.companyId,
        payDate: run.payDate,
        payPeriodNumber: periodNumber,
        payPeriodYear: run.payDate.getFullYear(),
        type: 'Revised Regular',
        netPay: line.netPay,
        yearToDateNetPay: decimalToMoney(ytdNet),
        grossEarnings: [
          {
            code: 'REG',
            description: 'Regular earnings',
            amount: decimalToMoney(moneyToNumber(line.hourlyRate) * line.regularHours),
            currentUnits: String(line.regularHours || 0),
            rate: formatMoney(line.hourlyRate)
          },
          {
            code: 'OT',
            description: 'Overtime earnings',
            amount: decimalToMoney(moneyToNumber(line.hourlyRate) * line.overtimeHours * 1.5),
            currentUnits: String(line.overtimeHours || 0),
            rate: line.overtimeHours ? formatMoney(moneyToNumber(line.hourlyRate) * 1.5) : ''
          },
          ...(moneyToNumber(line.statePay || 0) > 0
            ? [
                {
                  code: 'STATE',
                  description: 'Statutory holiday pay',
                  amount: line.statePay,
                  currentUnits: String(
                    Number(line.statePayBaseHours || 0) + Number(line.statePayHours || 0)
                  ),
                  rate: formatMoney(line.hourlyRate)
                }
              ]
            : []),
          { code: 'BONUS', description: 'Bonus', amount: line.bonus },
          { code: 'COMM', description: 'Commission', amount: line.commission },
          { code: 'VAC', description: 'Vacation pay', amount: line.vacationPay },
          { code: 'OTHER', description: 'Other earnings', amount: line.otherEarnings },
          { code: 'TOTAL', description: 'Total gross pay', amount: line.grossPay }
        ],
        deductions: [
          { code: 'CPP', description: 'CPP', amount: line.cpp },
          { code: 'CPP2', description: 'Additional CPP', amount: line.cpp2 },
          { code: 'EI', description: 'EI', amount: line.ei },
          { code: 'FTAX', description: 'Federal tax', amount: line.federalTax },
          { code: 'PTAX', description: 'Provincial income tax', amount: line.provincialTax },
          { code: 'PRE', description: 'Other pre-tax deductions', amount: line.preTaxDeductions },
          {
            code: 'POST',
            description: 'Other post-tax deductions',
            amount: line.postTaxDeductions
          },
          { code: 'TOTAL', description: 'Total deductions', amount: line.deductionsTotal }
        ],
        additionalInfo: [
          { key: 'Payroll Run', value: String(run._id) },
          {
            key: 'Pay Period',
            value: `${run.periodStart.toISOString().slice(0, 10)} to ${run.periodEnd.toISOString().slice(0, 10)}`
          },
          ...(moneyToNumber(line.statePay || 0) > 0 && line.statePayExplanation
            ? [{ key: 'State Holiday Pay Rule', value: line.statePayExplanation }]
            : moneyToNumber(line.statePay || 0) > 0
              ? [{ key: 'State Holiday Pay Rule', value: stateHolidayPayRule2026(line.statePayProvince || company?.address?.province) }]
            : []),
          { key: 'Revision', value: String(revision) },
          { key: 'Revision Reason', value: parsed.data.reason },
          { key: 'Reimbursement', value: formatMoney(line.reimbursement) },
          ...(carryForwardMessage
            ? [{ key: 'Next Payroll Adjustment', value: carryForwardMessage }]
            : []),
          ...(line.note ? [{ key: 'Payroll Note', value: line.note }] : []),
          ...changes.map((change, index) => ({ key: `Change ${index + 1}`, value: change }))
        ],
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        regularHours: Number(line.regularHours || 0),
        overtimeHours: Number(line.overtimeHours || 0),
        statePayHours: Number(line.statePayHours || 0),
        statePayBaseHours: line.statePayBaseHours,
        statePayProvince: line.statePayProvince,
        statePayExplanation: line.statePayExplanation,
        hourlyRate: line.hourlyRate,
        grossPay: line.grossPay,
        revision,
        supersedesStatementId: priorStatement?._id,
        changeSummary: changes,
        isUnread: true
      });
      if (priorStatement) {
        priorStatement.supersededByStatementId = statement._id as mongoose.Types.ObjectId;
        await priorStatement.save();
      }
      line.statementId = statement._id as mongoose.Types.ObjectId;

      const employee = employeeById.get(String(line.employeeId));
      if (employee) {
        try {
          await sendPayStatementNotificationEmail({
            employee,
            statement,
            periodStart: run.periodStart,
            periodEnd: run.periodEnd,
            companyName: company?.legalName,
            isRevision: true,
            changes: changes.length ? changes : ['Payroll details were regenerated.']
          });
        } catch (error) {
          emailErrors.push(
            `${employee.employeeNumber}: ${error instanceof Error ? error.message : 'email failed'}`
          );
        }
      }
    }

    run.lines = revisedLines;
    Object.assign(run, summarizePayrollLines(run.lines));
    run.statusHistory.push({
      from: 'finalized',
      to: 'finalized',
      changedBy: new mongoose.Types.ObjectId(req.employerContext!.employerUserId),
      changedAt: new Date(),
      note: `Finalized payroll revised: ${parsed.data.reason}`
    });
    await run.save();
    await auditPayroll(req, run, 'finalized_payroll_revised');
    res.json({
      run: serializePayrollRun(run),
      message: emailErrors.length
        ? `Payroll revised. Some email notifications failed: ${emailErrors.join('; ')}`
        : 'Payroll revised. Only employees with changed payslips were notified.'
    });
  }
);

router.post(
  '/payroll-runs/:id/lock',
  authenticate,
  requirePermission('payroll.approve'),
  async (req: AuthRequest, res) => {
    const run = await loadPayrollRun(req, res);
    if (!run) return;
    try {
      const transition = transitionRun(run, req, 'locked');
      await run.save();
      await auditPayroll(req, run, 'locked', transition.from, transition.to);
      res.json({ run: serializePayrollRun(run) });
    } catch (error) {
      res
        .status(409)
        .json({ message: error instanceof Error ? error.message : 'Invalid payroll transition' });
    }
  }
);

router.post(
  '/payroll-runs/:id/reverse',
  authenticate,
  requirePermission('payroll.reverse'),
  async (req: AuthRequest, res) => {
    const run = await loadPayrollRun(req, res);
    if (!run) return;
    try {
      const transition = transitionRun(run, req, 'reversed');
      const reversal = await PayrollRun.create({
        companyId: run.companyId,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        payDate: new Date(),
        runType: 'adjustment',
        originalRunId: run._id,
        employeeCount: run.employeeCount,
        totalHours: 0,
        estimatedGross: decimalToMoney('0'),
        totalDeductions: decimalToMoney('0'),
        totalNetPay: decimalToMoney('0'),
        status: 'finalized',
        reversedBy: req.employerContext!.employerUserId,
        lines: [],
        statusHistory: [
          {
            to: 'finalized',
            changedBy: new mongoose.Types.ObjectId(req.employerContext!.employerUserId),
            changedAt: new Date(),
            note: 'reversal record'
          }
        ]
      });
      run.reversedRunId = reversal._id as mongoose.Types.ObjectId;
      await run.save();
      await auditPayroll(req, run, 'reversed', transition.from, transition.to);
      res.json({ run: serializePayrollRun(run), reversal: serializePayrollRun(reversal) });
    } catch (error) {
      res
        .status(409)
        .json({ message: error instanceof Error ? error.message : 'Invalid payroll transition' });
    }
  }
);

router.post(
  '/payroll-adjustments',
  authenticate,
  requirePermission('payroll.prepare'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const parsed = createPayrollRunSchema
      .extend({ originalRunId: z.string().min(1) })
      .safeParse({ ...req.body, runType: 'adjustment' });
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: 'Invalid payroll adjustment payload', issues: parsed.error.issues });
    const original = await PayrollRun.findOne({ _id: parsed.data.originalRunId, companyId });
    if (!original) return res.status(404).json({ message: 'Original payroll run not found' });
    try {
      await validatePayDateAfterLatestPayrollRun(companyId, parsed.data.payDate);
    } catch (error) {
      return res.status(409).json({ message: error instanceof Error ? error.message : 'Invalid pay date' });
    }
    const run = await PayrollRun.create({
      companyId,
      periodStart: parsed.data.periodStart,
      periodEnd: parsed.data.periodEnd,
      payDate: parsed.data.payDate,
      runType: 'adjustment',
      payFrequency: original.payFrequency || 'biweekly',
      originalRunId: original._id,
      employeeCount: 0,
      totalHours: 0,
      estimatedGross: decimalToMoney('0'),
      totalDeductions: decimalToMoney('0'),
      totalNetPay: decimalToMoney('0'),
      status: 'draft',
      adjustedBy: req.employerContext!.employerUserId,
      lines: [],
      statusHistory: [
        {
          to: 'draft',
          changedBy: new mongoose.Types.ObjectId(req.employerContext!.employerUserId),
          changedAt: new Date(),
          note: 'adjustment created'
        }
      ]
    });
    const originalStatus = original.status;
    original.status = 'adjusted';
    original.adjustmentRunIds.push(run._id as mongoose.Types.ObjectId);
    original.statusHistory.push({
      from: originalStatus,
      to: 'adjusted',
      changedBy: new mongoose.Types.ObjectId(req.employerContext!.employerUserId),
      changedAt: new Date(),
      note: 'adjustment linked'
    });
    await original.save();
    await auditPayroll(req, run, 'adjustment_created', undefined, 'draft');
    res.status(201).json({ run: serializePayrollRun(run) });
  }
);

router.get(
  '/paystubs',
  authenticate,
  requirePermission('payroll.view'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const [company, employeeCount, statements] = await Promise.all([
      Company.findById(companyId),
      Employee.countDocuments({ companyId }),
      PayStatement.find({
      companyId,
      supersededByStatementId: { $exists: false }
    })
      .sort({ payDate: -1 })
      .populate('employeeId')
    ]);
    const payrollRunIds = Array.from(
      new Set(statements.map(payrollRunIdForStatement).filter((id) => mongoose.isValidObjectId(id)))
    );
    const payrollRuns = payrollRunIds.length
      ? await PayrollRun.find({ _id: { $in: payrollRunIds }, companyId })
      : [];
    const payrollRunsById = new Map(payrollRuns.map((run) => [String(run._id), run]));
    const fallbackPayFrequency = z
      .enum(['weekly', 'biweekly', 'monthly'])
      .catch('biweekly')
      .parse(String(company?.payrollConfiguration?.payFrequency || 'biweekly').toLowerCase());
    res.json({
      companyName: company?.legalName || '',
      employeeCount,
      paystubs: statements.map((statement) => {
        const deductions = effectiveStatementDeductions(
          statement,
          payrollRunsById,
          company?.address?.province,
          fallbackPayFrequency
        );
        const employee = statement.employeeId as unknown as {
          legalFirstName?: string;
          legalLastName?: string;
          occupation?: string;
          employeeNumber?: string;
        };
        const statementEmployeeId = String((statement.employeeId as unknown as { _id?: mongoose.Types.ObjectId })?._id || statement.employeeId);
        const ytdStatements = statements.filter(
          (item) =>
            String((item.employeeId as unknown as { _id?: mongoose.Types.ObjectId })?._id || item.employeeId) ===
              statementEmployeeId && isInPayStatementYtd(item, statement)
        );
        const ytdFor = (kind: 'grossEarnings' | 'deductions', code: string) => {
          const targetCodes =
            kind === 'deductions' && String(code || '').toUpperCase() === 'CPP'
              ? ['CPP', 'CPP2']
              : [String(code || '').toUpperCase()];
          return formatMoney(sumMoney(
            ytdStatements.flatMap((item) => {
              const lines = kind === 'deductions'
                ? effectiveStatementDeductions(
                    item,
                    payrollRunsById,
                    company?.address?.province,
                    fallbackPayFrequency
                  )
                : item[kind];
              return lines
                .filter((line) =>
                  kind === 'deductions'
                    ? targetCodes.includes(canonicalDeductionCode(line.code, line.description))
                    : targetCodes.includes(String(line.code || '').toUpperCase())
                )
                .map((line) => line.amount || 0);
            })
          ));
        };
        return {
          id: String(statement._id),
          employeeName: `${employee?.legalFirstName || ''} ${employee?.legalLastName || ''}`.trim(),
          employeeNumber: employee?.employeeNumber,
          position: employee?.occupation,
          employeeId: String((statement.employeeId as unknown as { _id?: mongoose.Types.ObjectId })?._id || ''),
          payFrequency: String(company?.payrollConfiguration?.payFrequency || 'Biweekly'),
          periodStart: statement.periodStart,
          periodEnd: statement.periodEnd,
          payDate: statement.payDate,
          grossPay: formatMoney(
            statement.grossPay ||
              statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount ||
              0
          ),
          netPay: formatMoney(statement.netPay),
          yearToDateNetPay: formatMoney(sumMoney(ytdStatements.map((item) => item.netPay))),
          yearToDateGrossPay: formatMoney(sumMoney(ytdStatements.map((item) =>
            item.grossPay || item.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0
          ))),
          deductionsTotal: formatMoney(deductionTotalAmount(deductions)),
          deductionsTotalYtd: formatMoney(sumMoney(ytdStatements.map((item) =>
            deductionTotalAmount(
              effectiveStatementDeductions(
                item,
                payrollRunsById,
                company?.address?.province,
                fallbackPayFrequency
              )
            )
          ))),
          regularHours: statement.regularHours || 0,
          overtimeHours: statement.overtimeHours || 0,
          regularHoursYtd: ytdStatements.reduce((total, item) => total + (item.regularHours || 0), 0),
          overtimeHoursYtd: ytdStatements.reduce((total, item) => total + (item.overtimeHours || 0), 0),
          hourlyRate: formatMoney(statement.hourlyRate || 0),
          earnings: displayEarningLines(
            statement.grossEarnings
              .filter((line) => line.code !== 'TOTAL')
              .map((line) => ({
                code: line.code || '',
                description: line.description || '',
                amount: formatMoney(line.amount || 0),
                ytd: ytdFor('grossEarnings', line.code || '')
              }))
          ),
          deductions: displayDeductionLines(
            deductions
              .filter((line) => line.code !== 'TOTAL')
              .map((line) => ({
                code: line.code || '',
                description: line.description || '',
                amount: formatMoney(line.amount || 0),
                ytd: ytdFor('deductions', line.code || '')
              }))
          ),
          vacationPay: formatMoney(
            statement.grossEarnings.find((line) => line.code === 'VAC')?.amount || 0
          ),
          statePay: formatMoney(
            statement.grossEarnings.find((line) => line.code === 'STATE')?.amount || 0
          ),
          statePayHours: statement.statePayHours || 0,
          statePayExplanation:
            statement.statePayExplanation ||
            statement.additionalInfo.find((line) => line.key === 'State Holiday Pay Rule')?.value ||
            '',
          status: statement.payDate.getTime() <= Date.now() ? 'Paid' : 'Pending'
        };
      })
    });
  }
);

const filingTitles: Record<GovernmentFilingType, string> = {
  CRA_REMITTANCE: 'CRA Remittance (Wages, CPP, EI, Income Tax)',
  PD7A: 'PD7A - Statement of Account',
  T4_SLIPS: 'T4 Slips - Employee',
  T4_SUMMARY: 'T4 Summary',
  ROE: 'ROE Filing'
};

async function syncGovernmentFilings(companyId: string): Promise<void> {
  const runs = await PayrollRun.find({
    companyId,
    status: { $in: ['finalized', 'locked', 'adjusted'] }
  }).sort({ payDate: 1 });
  const monthly = new Map<string, { year: number; month: number; amount: MoneyValue[] }>();
  for (const run of runs) {
    const year = run.payDate.getUTCFullYear();
    const month = run.payDate.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const bucket = monthly.get(key) || { year, month, amount: [] };
    bucket.amount.push(...run.lines.map(payrollLineGovernmentLiability));
    monthly.set(key, bucket);
  }
  const operations: Parameters<typeof GovernmentFiling.bulkWrite>[0] = [];
  for (const [key, bucket] of monthly) {
    const periodDate = new Date(Date.UTC(bucket.year, bucket.month, 1));
    const period = periodDate.toLocaleDateString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    const dueDate = new Date(Date.UTC(bucket.year, bucket.month + 1, 15));
    const amount = formatMoney(sumMoney(bucket.amount));
    for (const type of ['CRA_REMITTANCE', 'PD7A'] as const) {
      operations.push({ updateOne: {
        filter: { companyId, filingKey: `${type}:${key}` },
        update: {
          $set: { title: filingTitles[type], year: bucket.year, period, dueDate, amount },
          $setOnInsert: { companyId, filingKey: `${type}:${key}`, type, status: 'pending', documents: [{ name: `${type.toLowerCase()}-${key}.csv`, kind: 'data' }] }
        },
        upsert: true
      } });
    }
  }
  for (const year of new Set(runs.map((run) => run.payDate.getUTCFullYear()))) {
    const dueDate = new Date(Date.UTC(year + 1, 2, 0));
    for (const type of ['T4_SLIPS', 'T4_SUMMARY'] as const) {
      operations.push({ updateOne: {
        filter: { companyId, filingKey: `${type}:${year}` },
        update: {
          $set: { title: filingTitles[type], year, period: String(year), dueDate },
          $setOnInsert: { companyId, filingKey: `${type}:${year}`, type, status: 'pending', amount: '0.00', documents: [{ name: `${type.toLowerCase()}-${year}.csv`, kind: 'data' }] }
        },
        upsert: true
      } });
    }
  }
  if (operations.length) await GovernmentFiling.bulkWrite(operations);
  await GovernmentFiling.updateMany(
    { companyId, status: { $in: ['pending', 'prepared'] }, dueDate: { $lt: new Date() } },
    { $set: { status: 'overdue' } }
  );
}

function serializeGovernmentFiling(filing: InstanceType<typeof GovernmentFiling>) {
  return {
    id: String(filing._id),
    type: filing.type,
    title: filing.title,
    year: filing.year,
    period: filing.period,
    dueDate: filing.dueDate,
    status: filing.status,
    amount: formatMoney(filing.amount),
    reference: filing.reference || '',
    confirmationNumber: filing.confirmationNumber || '',
    preparedAt: filing.preparedAt,
    filedAt: filing.filedAt,
    submittedBy: filing.submittedBy ? String(filing.submittedBy) : '',
    documents: filing.documents
  };
}

router.get('/government-filings', authenticate, requirePermission('payroll.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  await syncGovernmentFilings(companyId);
  const filings = await GovernmentFiling.find({ companyId }).sort({ dueDate: -1, type: 1 });
  res.json({ filings: filings.map(serializeGovernmentFiling) });
});

router.post('/government-filings/:id/prepare', authenticate, requirePermission('payroll.prepare'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid filing' });
  const filing = await GovernmentFiling.findOneAndUpdate(
    { _id: req.params.id, companyId, status: { $in: ['pending', 'overdue'] } },
    { $set: { status: 'prepared', preparedAt: new Date() } },
    { new: true }
  );
  if (!filing) return res.status(404).json({ message: 'Filing not found or already filed' });
  res.json({ filing: serializeGovernmentFiling(filing) });
});

router.post('/government-filings/:id/file', authenticate, requirePermission('payroll.prepare'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid filing' });
  const now = new Date();
  const filing = await GovernmentFiling.findOneAndUpdate(
    { _id: req.params.id, companyId, status: { $ne: 'filed' } },
    { $set: {
      status: 'filed',
      filedAt: now,
      submittedBy: req.employerContext!.employerUserId,
      reference: `FIL-${now.getUTCFullYear()}-${String(now.getTime()).slice(-8)}`,
      confirmationNumber: `CRA${String(now.getTime()).slice(-10)}`
    } },
    { new: true }
  );
  if (!filing) return res.status(404).json({ message: 'Filing not found or already filed' });
  res.json({ filing: serializeGovernmentFiling(filing) });
});

router.get('/government-filings/:id/view', authenticate, requirePermission('payroll.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid filing' });
  const filing = await GovernmentFiling.findOne({ _id: req.params.id, companyId });
  if (!filing) return res.status(404).json({ message: 'Filing not found' });

  if (filing.type === 'T4_SLIPS') {
    const documents = await TaxFormDocument.find({ companyId, taxYear: filing.year, formType: 'T4' });
    if (!documents.length) return res.status(404).json({ message: 'No generated T4 slips are available for this year.' });
    const employees = await Employee.find({ companyId, _id: { $in: documents.map((item) => item.employeeId) } });
    const statements = await PayStatement.find({ companyId, payPeriodYear: filing.year, employeeId: { $in: documents.map((item) => item.employeeId) }, supersededByStatementId: { $exists: false } });
    const company = await Company.findById(companyId);
    const forms: T4PdfData[] = employees.map((employee) => {
      const employeeStatements = statements.filter((item) => String(item.employeeId) === String(employee._id));
      const deduction = (...codes: string[]) => formatMoney(sumMoney(employeeStatements.flatMap((item) => item.deductions.filter((line) => codes.includes(line.code || '')).map((line) => line.amount))));
      const address = employee.addresses?.[0];
      return {
        employerName: company?.legalName || '', year: filing.year,
        employerAddress: addressLines(company?.address),
        sin: employee.sinEncrypted ? decryptSin(employee.sinEncrypted) : '',
        lastName: employee.legalLastName, firstName: employee.legalFirstName, initial: employee.middleName?.charAt(0) || '',
        address: address ? [address.street, `${address.city}, ${address.province}`, address.postalCode] : [],
        province: normalizeProvince(company?.address?.province || 'AB'),
        employmentIncome: formatMoney(sumMoney(employeeStatements.map((item) =>
          item.grossPay || item.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0
        ))),
        incomeTax: deduction('TAX', 'FTAX', 'PTAX'), cppContributions: deduction('CPP'), eiPremiums: deduction('EI')
      };
    });
    return res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="T4-${filing.year}.pdf"`).send(t4sPdf(forms));
  }

  if (filing.type === 'ROE') {
    const document = await RoeDocument.findOne({ companyId, 'data.lastDayPaid': { $regex: `^${filing.year}` } }).sort({ generatedAt: -1 });
    if (!document) return res.status(404).json({ message: 'No generated ROE is available for this year.' });
    return res.type('application/pdf').setHeader('Content-Disposition', `inline; filename="ROE-${filing.year}.pdf"`).send(roePdf(document.data));
  }

  return res.status(409).json({ message: 'A document preview is not available for this filing type.' });
});

router.get('/government-filings/:id/download', authenticate, requirePermission('payroll.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid filing' });
  const filing = await GovernmentFiling.findOne({ _id: req.params.id, companyId });
  if (!filing) return res.status(404).json({ message: 'Filing not found' });
  const csv = [
    ['Filing Type', 'Period', 'Due Date', 'Status', 'Amount', 'Reference', 'Confirmation'],
    [filing.title, filing.period, filing.dueDate.toISOString().slice(0, 10), filing.status, formatMoney(filing.amount), filing.reference || '', filing.confirmationNumber || '']
  ].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
  res.type('text/csv').setHeader('Content-Disposition', `attachment; filename="filing-${filing.filingKey.replace(':', '-')}.csv"`).send(csv);
});

router.get('/deductions', authenticate, requirePermission('payroll.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const [company, employees, statements, customDeductionTypes] = await Promise.all([
    Company.findById(companyId).select('payrollConfiguration.statutoryDeductionCodes payrollConfiguration.statutoryDeductionSettings address.province'),
    Employee.find({ companyId }).select('employeeNumber legalFirstName legalLastName occupation startDate adminProfile.employment adminProfile.benefits'),
    PayStatement.find({ companyId, supersededByStatementId: { $exists: false } }).sort({ payDate: -1, _id: -1 }),
    DeductionType.find({ employerId: companyId, kind: 'custom' }).sort({ name: 1 })
  ]);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const statutoryCodes = new Set(['CPP', 'CPP2', 'EI', 'FTAX', 'PTAX']);
  res.json({
    employeeCount: employees.length,
    configuredStatutoryDeductions: Array.isArray(company?.payrollConfiguration?.statutoryDeductionCodes)
      ? company.payrollConfiguration.statutoryDeductionCodes
      : [],
    statutoryDeductionSettings: company?.payrollConfiguration?.statutoryDeductionSettings || {},
    defaultProvince: normalizeProvince(company?.address?.province || 'AB'),
    customDeductionTypes: customDeductionTypes.map((item) => ({
      id: String(item._id), code: item.code, name: item.name, description: item.description || '',
      provinces: item.provinces, calculationMethod: item.calculationMethod,
      value: item.value ? item.value.toString() : '', status: item.status
    })),
    records: statements.map((statement) => {
      const employee = employeeById.get(String(statement.employeeId));
      const lines = statement.deductions.filter((line) => line.code !== 'TOTAL' && moneyToNumber(line.amount || 0) !== 0).map((line) => ({
        code: line.code || '',
        description: line.description || line.code || 'Deduction',
        type: statutoryCodes.has(line.code || '') ? 'Statutory' : 'Voluntary',
        amount: formatMoney(line.amount || 0)
      }));
      const statutory = sumMoney(lines.filter((line) => line.type === 'Statutory').map((line) => line.amount));
      const voluntary = sumMoney(lines.filter((line) => line.type === 'Voluntary').map((line) => line.amount));
      return {
        id: String(statement._id),
        employeeId: String(statement.employeeId),
        employeeNumber: employee?.employeeNumber || '',
        employeeName: employeeDisplayName(employee || ({ employeeNumber: 'Unknown employee' } as IEmployee)),
        employmentType: String(employee?.adminProfile?.employment?.employmentType || 'Not recorded'),
        jobTitle: employee?.occupation || String(employee?.adminProfile?.employment?.jobTitle || ''),
        deductionStartDate: String(employee?.adminProfile?.benefits?.deductionsStartDate || ''),
        startDate: employee?.startDate,
        periodStart: statement.periodStart,
        periodEnd: statement.periodEnd,
        payDate: statement.payDate,
        total: formatMoney(deductionTotalAmount(statement.deductions)),
        statutory: formatMoney(statutory),
        voluntary: formatMoney(voluntary),
        lines
      };
    })
  });
});

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

function payrollAccountNumber(company: {
  customerId?: string;
  businessNumber?: string;
  craPayroll?: Record<string, unknown>;
}): string {
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
  return company.customerId || '';
}

async function employerPayslipData(statement: InstanceType<typeof PayStatement>, employee: IEmployee, company: { legalName: string; customerId?: string; businessNumber?: string; craPayroll?: Record<string, unknown>; address?: { street?: string; line2?: string; city?: string; province?: string; postalCode?: string }; payrollConfiguration?: Record<string, unknown> }): Promise<PayslipPdfData> {
  const history = (await PayStatement.find({
    employeeId: statement.employeeId,
    companyId: statement.companyId,
    payPeriodYear: statement.payPeriodYear,
    payDate: { $lte: statement.payDate },
    supersededByStatementId: { $exists: false }
  })).filter((item) => isInPayStatementYtd(item, statement));
  const payrollRunIds = Array.from(
    new Set(history.map(payrollRunIdForStatement).filter((id) => mongoose.isValidObjectId(id)))
  );
  const payrollRuns = payrollRunIds.length
    ? await PayrollRun.find({ _id: { $in: payrollRunIds }, companyId: statement.companyId })
    : [];
  const payrollRunsById = new Map(payrollRuns.map((run) => [String(run._id), run]));
  const fallbackPayFrequency = z
    .enum(['weekly', 'biweekly', 'monthly'])
    .catch('biweekly')
    .parse(String(company.payrollConfiguration?.payFrequency || 'biweekly').toLowerCase());
  const statementDeductions = effectiveStatementDeductions(
    statement,
    payrollRunsById,
    company.address?.province,
    fallbackPayFrequency
  );
  const ytdFor = (kind: 'grossEarnings' | 'deductions', code: string) => {
    const targetCodes =
      kind === 'deductions' && String(code || '').toUpperCase() === 'CPP'
        ? ['CPP', 'CPP2']
        : [String(code || '').toUpperCase()];
    return formatMoney(sumMoney(
      history.flatMap((item) => {
        const lines = kind === 'deductions'
          ? effectiveStatementDeductions(
              item,
              payrollRunsById,
              company.address?.province,
              fallbackPayFrequency
            )
          : item[kind];
        return lines
          .filter((line) =>
            kind === 'deductions'
              ? targetCodes.includes(canonicalDeductionCode(line.code, line.description))
              : targetCodes.includes(String(line.code || '').toUpperCase())
          )
          .map((line) => line.amount || 0);
      })
    ));
  };
  const regularHoursYtd = history.reduce((total, item) => total + (item.regularHours || 0), 0);
  const overtimeHoursYtd = history.reduce((total, item) => total + (item.overtimeHours || 0), 0);
  const statePayUnits = Number(statement.statePayBaseHours || 0) + Number(statement.statePayHours || 0);
  const statePayUnitsYtd = history.reduce(
    (total, item) => total + Number(item.statePayBaseHours || 0) + Number(item.statePayHours || 0),
    0
  );
  const deductionsTotalYtd = formatMoney(sumMoney(history.map((item) =>
    deductionTotalAmount(
      effectiveStatementDeductions(
        item,
        payrollRunsById,
        company.address?.province,
        fallbackPayFrequency
      )
    )
  )));
  const grossTotalYtd = formatMoney(sumMoney(history.map((item) =>
    item.grossPay || item.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0
  )));
  const earningRows = statement.grossEarnings.map((line) => ({
    code: line.code,
    description: line.description || '',
    amount: formatMoney(line.amount || 0),
    currentUnits:
      line.currentUnits ||
      (line.code === 'REG'
        ? String(statement.regularHours || 0)
        : line.code === 'OT'
          ? String(statement.overtimeHours || 0)
          : line.code === 'STATE'
            ? String(statePayUnits)
            : ''),
    ytdUnits:
      line.code === 'REG'
        ? String(regularHoursYtd)
        : line.code === 'OT'
          ? String(overtimeHoursYtd)
          : line.code === 'STATE'
            ? String(statePayUnitsYtd)
            : '',
    rate:
      line.rate ||
      (line.code === 'REG'
        ? (statement.regularHours || 0) > 0
          ? formatMoney(statement.hourlyRate || 0)
          : ''
        : line.code === 'OT'
          ? (statement.overtimeHours || 0) > 0
            ? formatMoney(moneyToNumber(line.amount || 0) / (statement.overtimeHours || 1))
            : ''
          : line.code === 'STATE'
            ? formatMoney(statement.hourlyRate || 0)
            : ''),
    ytd: line.code === 'TOTAL' ? grossTotalYtd : ytdFor('grossEarnings', line.code || '')
  }));
  if (!earningRows.some((line) => line.code === 'OT') && (moneyToNumber(ytdFor('grossEarnings', 'OT')) > 0 || overtimeHoursYtd > 0)) {
    earningRows.splice(Math.max(1, earningRows.findIndex((line) => line.code === 'TOTAL')), 0, {
      code: 'OT',
      description: 'Overtime earnings',
      amount: '0.00',
      currentUnits: '0',
      ytdUnits: String(overtimeHoursYtd),
      rate: formatMoney(moneyToNumber(statement.hourlyRate || 0) * 1.5),
      ytd: ytdFor('grossEarnings', 'OT')
    });
  }
  if (!earningRows.some((line) => line.code === 'STATE') && (moneyToNumber(ytdFor('grossEarnings', 'STATE')) > 0 || statePayUnitsYtd > 0)) {
    earningRows.splice(Math.max(1, earningRows.findIndex((line) => line.code === 'TOTAL')), 0, {
      code: 'STATE',
      description: 'Statutory holiday pay',
      amount: '0.00',
      currentUnits: '0',
      ytdUnits: String(statePayUnitsYtd),
      rate: formatMoney(statement.hourlyRate || 0),
      ytd: ytdFor('grossEarnings', 'STATE')
    });
  }
  const earnings = displayEarningLines(earningRows);
  const deductions = displayDeductionLines(statementDeductions.map((line) => ({
    code: line.code,
    description: line.description || '',
    amount: formatMoney(line.code === 'TOTAL' ? deductionTotalAmount(statementDeductions) : line.amount || 0),
    ytd: line.code === 'TOTAL' ? deductionsTotalYtd : ytdFor('deductions', line.code || '')
  })));
  const deductionsTotal = formatMoney(deductionTotalAmount(statementDeductions));
  const payslipDeductions =
    deductions.some((line) => line.code !== 'TOTAL' && moneyToNumber(line.amount) > 0) ||
    moneyToNumber(deductionsTotal) === 0
      ? deductions
      : displayDeductionLines(
          [
            ...Object.entries(
              statutoryDeductionsFromGross(
                statement.grossPay ||
                  statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount ||
                  0,
                company.address?.province,
                payrollFrequencyRules[fallbackPayFrequency].payPeriods
              )
            )
              .filter(([key]) => key !== 'deductionsTotal')
              .map(([key, amount]) => ({
                code:
                  key === 'cpp'
                    ? 'CPP'
                    : key === 'cpp2'
                      ? 'CPP2'
                      : key === 'ei'
                        ? 'EI'
                        : key === 'federalTax'
                          ? 'FTAX'
                          : 'PTAX',
                description:
                  key === 'cpp'
                    ? 'CPP'
                    : key === 'cpp2'
                      ? 'Additional CPP'
                      : key === 'ei'
                        ? 'EI'
                        : key === 'federalTax'
                          ? 'Federal tax'
                          : 'Provincial income tax',
                amount: formatMoney(amount),
                ytd: formatMoney(amount)
              })),
            { code: 'TOTAL', description: 'Total deductions', amount: deductionsTotal, ytd: deductionsTotalYtd }
          ]
        );
  const accountNumber = String(employee.adminProfile?.banking?.accountNumber || '');
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
  const periodNumber = displayPeriodNumber(
    statement.payPeriodNumber,
    statement.periodEnd,
    String(company.payrollConfiguration?.payFrequency || employee.payGroup || fallbackPayFrequency)
  );
  const hasStatePay = moneyToNumber(statement.grossEarnings.find((line) => line.code === 'STATE')?.amount || 0) > 0;
  const existingStateRule = statement.additionalInfo.find((line) => line.key === 'State Holiday Pay Rule')?.value;
  const stateRuleInfo =
    hasStatePay && !existingStateRule
      ? [{ key: 'State Holiday Pay Rule', value: stateHolidayPayRule2026(statement.statePayProvince || company.address?.province) }]
      : [];
  return {
    companyName: company.legalName,
    companyAddress: [company.address?.street, company.address?.line2, [company.address?.city, company.address?.province, company.address?.postalCode].filter(Boolean).join(', ')].filter(Boolean) as string[],
    employeeName: employeeDisplayName(employee),
    employeeCode: employee.employeeNumber,
    payGroup: String(company.payrollConfiguration?.payFrequency || employee.payGroup || 'Biweekly'),
    employeeAddress: [],
    payDate: statement.payDate.toISOString().slice(0, 10),
    netPay: formatMoney(statement.netPay),
    yearToDateNetPay: formatMoney(sumMoney(history.map((item) => item.netPay))),
    grossPay: formatMoney(statement.grossPay || statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0),
    deductionsTotal,
    grossEarnings: earnings,
    deductions: payslipDeductions,
    additionalInfo: [
      ...(statement.periodStart && statement.periodEnd ? [{ key: 'Pay Period', value: `${statement.periodStart.toISOString().slice(0, 10)} to ${statement.periodEnd.toISOString().slice(0, 10)}` }] : []),
      { key: 'Period Number', value: periodNumber },
      { key: 'Payroll Number', value: payrollAccountNumber(company) },
      { key: 'Employee Number', value: employee.employeeNumber },
      ...(accountNumber ? [{ key: 'Deposit Account', value: 'XX [hidden]' }] : []),
      { key: 'Sequence Number', value: `${employee.employeeNumber}-${statement.payPeriodYear}-${periodNumber}` },
      { key: 'Province of Employment', value: company.address?.province || '' },
      { key: 'Payslip Revision', value: String(statement.revision || 1) },
      ...stateRuleInfo,
      ...statement.additionalInfo.filter((line) =>
        line.key !== 'Payroll Run' && !canonicalInfoKeys.has(line.key)
      )
    ].filter((line) => line.value)
  };
}

router.get('/paystubs/:id/download', authenticate, requirePermission('payroll.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const statement = await PayStatement.findOne({ _id: req.params.id, companyId, supersededByStatementId: { $exists: false } });
  if (!statement) return res.status(404).json({ message: 'Paystub not found' });
  const [employee, company] = await Promise.all([Employee.findById(statement.employeeId), Company.findById(companyId)]);
  if (!employee || !company) return res.status(404).json({ message: 'Employee or company not found' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="paystub-${statement._id}.pdf"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(payslipPdf(await employerPayslipData(statement, employee, company)));
});

router.get('/paystubs/download-all', authenticate, requirePermission('payroll.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const [statements, company] = await Promise.all([
    PayStatement.find({ companyId, supersededByStatementId: { $exists: false } }).sort({ payDate: -1, _id: -1 }),
    Company.findById(companyId)
  ]);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  if (!statements.length) return res.status(404).json({ message: 'No paystubs found' });
  const employees = await Employee.find({ _id: { $in: statements.map((statement) => statement.employeeId) }, companyId });
  const byId = new Map(employees.map((employee) => [String(employee._id), employee]));
  if (statements.some((statement) => !byId.has(String(statement.employeeId)))) {
    return res.status(404).json({ message: 'Employee not found for a paystub' });
  }
  const pages = await Promise.all(statements.map((statement) =>
    employerPayslipData(statement, byId.get(String(statement.employeeId))!, company)
  ));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="all-paystubs.pdf"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(payslipsPdf(pages));
});

router.post('/paystubs/download-selected', authenticate, requirePermission('payroll.view'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const parsed = z.object({ ids: z.array(z.string()).min(1).max(500) }).safeParse(req.body);
  if (!parsed.success || parsed.data.ids.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Select valid paystubs' });
  const [statements, company] = await Promise.all([
    PayStatement.find({ _id: { $in: parsed.data.ids }, companyId, supersededByStatementId: { $exists: false } }).sort({ payDate: -1 }),
    Company.findById(companyId)
  ]);
  if (!company || statements.length !== new Set(parsed.data.ids).size) return res.status(404).json({ message: 'Paystub not found' });
  const employees = await Employee.find({ _id: { $in: statements.map((statement) => statement.employeeId) }, companyId });
  const byId = new Map(employees.map((employee) => [String(employee._id), employee]));
  if (statements.some((statement) => !byId.has(String(statement.employeeId)))) return res.status(404).json({ message: 'Employee not found' });
  const pages = await Promise.all(statements.map((statement) => employerPayslipData(statement, byId.get(String(statement.employeeId))!, company)));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="paystubs.pdf"');
  res.setHeader('Cache-Control', 'no-store');
  res.send(payslipsPdf(pages));
});

router.post('/paystubs/send-selected', authenticate, requirePermission('payroll.prepare'), async (req: AuthRequest, res) => {
  const companyId = requireEmployer(req, res);
  if (!companyId) return;
  const parsed = z.object({ ids: z.array(z.string()).min(1).max(500) }).safeParse(req.body);
  if (!parsed.success || parsed.data.ids.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: 'Select valid paystubs' });
  const [statements, company] = await Promise.all([
    PayStatement.find({ _id: { $in: parsed.data.ids }, companyId, supersededByStatementId: { $exists: false } }),
    Company.findById(companyId)
  ]);
  if (!company || statements.length !== new Set(parsed.data.ids).size) return res.status(404).json({ message: 'Paystub not found' });
  const employees = await Employee.find({ _id: { $in: statements.map((statement) => statement.employeeId) }, companyId });
  const byId = new Map(employees.map((employee) => [String(employee._id), employee]));
  let sent = 0;
  const errors: string[] = [];
  for (const statement of statements) {
    const employee = byId.get(String(statement.employeeId));
    if (!employee) continue;
    try {
      const delivered = await sendPayStatementNotificationEmail({ employee, statement, periodStart: statement.periodStart || statement.payDate, periodEnd: statement.periodEnd || statement.payDate, companyName: company.legalName, isRevision: statement.revision > 1, changes: statement.changeSummary });
      if (delivered) sent += 1;
    } catch (error) {
      errors.push(`${employee.employeeNumber}: ${error instanceof Error ? error.message : 'send failed'}`);
    }
  }
  res.json({ sent, errors });
});

router.post(
  '/employees',
  authenticate,
  requirePermission('employee.create'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const parsed = employeePayload.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid employee profile' });

    const profile = parsed.data;
    const personal = profile.personal;
    const employment = profile.employment;
    const [company, employeeCount] = await Promise.all([
      Company.findById(companyId),
      Employee.countDocuments({ companyId })
    ]);
    const employeeNumber = text(
      employment.employeeNumber,
      `EMP-${String(employeeCount + 1).padStart(4, '0')}`
    );
    const email = text(personal.emailAddress, `${employeeNumber.toLowerCase()}@example.com`);
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    const temporaryPassword = generateTemporaryPassword();
    const user = await User.findOneAndUpdate(
      { email: email.toLowerCase() },
      {
        email: email.toLowerCase(),
        passwordHash: existingUser?.passwordHash || (await hashPassword(temporaryPassword)),
        mustChangePassword: true,
        isActive: true
      },
      { new: true, upsert: true }
    );

    const employee = await Employee.findOneAndUpdate(
      { companyId, employeeNumber },
      employeeFieldsFromProfile(
        profile,
        companyId,
        user._id,
        employeeNumber,
        email,
        company || undefined
      ),
      { new: true, upsert: true }
    );

    user.lastSelectedEmployeeId = employee._id;
    await user.save();
    let emailSent = false;
    let emailError: string | undefined;
    if (!existingUser) {
      try {
        await sendEmployeeCredentialsEmail(
          String(user._id),
          String(employee._id),
          temporaryPassword
        );
        emailSent = true;
      } catch (error) {
        emailError =
          error instanceof Error ? error.message : 'Unable to send employee welcome email';
        console.error('Employee credentials email failed:', error);
      }
    }
    await AuditLog.create({
      userId: req.user?.id,
      employeeId: employee._id,
      companyId,
      eventType: 'EMPLOYEE_UPSERT'
    });
    res.status(201).json({
      employee: serializeEmployee(employee, company || undefined),
      temporaryPassword: existingUser ? undefined : temporaryPassword,
      emailSent,
      emailError
    });
  }
);

router.post(
  '/employees/:employeeId/reset-password',
  authenticate,
  requirePermission('employee.edit'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;

    const [employee, company] = await Promise.all([
      Employee.findOne({ _id: req.params.employeeId, companyId }),
      Company.findById(companyId)
    ]);
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const temporaryPassword = generateTemporaryPassword();
    const user = await User.findByIdAndUpdate(
      employee.userId,
      {
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        isActive: true,
        lastSelectedEmployeeId: employee._id
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: 'Employee login not found' });

    let emailSent = false;
    let emailError: string | undefined;
    try {
      await sendEmployeeCredentialsEmail(String(user._id), String(employee._id), temporaryPassword);
      emailSent = true;
    } catch (error) {
      emailError =
        error instanceof Error ? error.message : 'Unable to send employee welcome email';
      console.error('Employee credentials email failed:', error);
    }

    await AuditLog.create({
      userId: req.user?.id,
      employeeId: employee._id,
      companyId,
      eventType: 'USER_UPDATED',
      metadata: { action: 'Employee password reset' }
    });

    res.json({
      employee: serializeEmployee(employee, company || undefined),
      temporaryPassword,
      emailSent,
      emailError
    });
  }
);

router.put(
  '/employees/:employeeId',
  authenticate,
  requirePermission('employee.edit'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const parsed = employeePayload.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: 'Invalid employee profile' });

    const employee = await Employee.findOne({ _id: req.params.employeeId, companyId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const profile = parsed.data;
    const employeeNumber = text(profile.employment.employeeNumber, employee.employeeNumber);
    const email = text(
      profile.personal.emailAddress,
      employee.personalEmail || `${employeeNumber.toLowerCase()}@example.com`
    ).toLowerCase();
    const existingUserWithEmail = await User.findOne({ email, _id: { $ne: employee.userId } });
    if (existingUserWithEmail)
      return res.status(409).json({ message: 'Another user already uses that email address' });

    const company = await Company.findById(companyId);
    const fields = employeeFieldsFromProfile(
      profile,
      companyId,
      employee.userId,
      employeeNumber,
      email,
      company || undefined
    );
    const submittedSinDigits = sinDigits(profile.personal.sin) || sinDigits(profile.tax.sin);
    if (submittedSinDigits.length !== 9 && employee.sinEncrypted) {
      fields.sinEncrypted = employee.sinEncrypted;
      fields.adminProfile.personal = {
        ...fields.adminProfile.personal,
        sin: text(employee.adminProfile?.personal?.sin, text(profile.personal.sin))
      };
      fields.adminProfile.tax = {
        ...fields.adminProfile.tax,
        sin: text(employee.adminProfile?.tax?.sin, text(profile.tax.sin))
      };
    }

    Object.assign(employee, fields);
    await employee.save();
    await User.findByIdAndUpdate(employee.userId, { email, isActive: true });
    await AuditLog.create({
      userId: req.user?.id,
      employeeId: employee._id,
      companyId,
      eventType: 'EMPLOYEE_UPSERT',
      metadata: { action: 'updated' }
    });

    res.json({ employee: serializeEmployee(employee, company || undefined) });
  }
);

router.delete(
  '/employees/:employeeId',
  authenticate,
  requirePermission('employee.edit'),
  async (req: AuthRequest, res) => {
    const companyId = requireEmployer(req, res);
    if (!companyId) return;
    const employee = await Employee.findOne({ _id: req.params.employeeId, companyId });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });

    const userId = employee.userId;
    await Employee.deleteOne({ _id: employee._id, companyId });
    if (userId && !(await Employee.exists({ userId }))) {
      await User.deleteOne({ _id: userId });
    }
    await AuditLog.create({
      userId: req.user?.id,
      employeeId: employee._id,
      companyId,
      eventType: 'EMPLOYEE_DELETED',
      metadata: {
        employeeNumber: employee.employeeNumber,
        employeeName: `${employee.legalFirstName} ${employee.legalLastName}`.trim()
      }
    });
    res.json({ deleted: true, employeeId: req.params.employeeId });
  }
);

export default router;

import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { PayStatement } from '../models/PayStatement';
import { EmployerUser } from '../models/EmployerUser';
import { AccessRole } from '../models/AccessRole';
import { EmployerReport, EmployerReportRun, EmployerReportSchedule, IReportDefinition, IReportSchedule } from '../models/EmployerReport';
import { moneyToNumber, sumMoney } from '../utils/money';
import { customReportPdf } from '../utils/pdf';
import { emailService } from './email.service';
import { permissionsForRole } from '../security/rbac';
import { employerPermissionOverride } from './employerRoles.service';
import { employerRolePermissions } from '../middleware/auth';

const legacyReportFields = {
  employees: { employeeNumber: 'Employee ID', employeeName: 'Employee Name', email: 'Company Email', department: 'Department', jobTitle: 'Job Title', province: 'Province', startDate: 'Start Date' },
  payroll: { employeeNumber: 'Employee ID', employeeName: 'Employee Name', payDate: 'Pay Date', grossPay: 'Gross Pay', deductions: 'Total Deductions', netPay: 'Net Pay' },
  deductions: { employeeNumber: 'Employee ID', employeeName: 'Employee Name', payDate: 'Pay Date', code: 'Deduction Code', description: 'Deduction', amount: 'Amount' }
};
export const customReportFields: Record<string, string> = {
  ...legacyReportFields.employees, ...legacyReportFields.payroll, ...legacyReportFields.deductions,
  employmentType: 'Employment Type', payGroup: 'Pay Group', status: 'Employment Status', phone: 'Phone', terminationDate: 'Termination Date', yearsOfService: 'Years of Service',
  payPeriod: 'Pay Period', regularHours: 'Regular Hours', overtimeHours: 'Overtime Hours', statHolidayHours: 'Statutory Holiday Hours', hours: 'Total Hours', hourlyRate: 'Hourly Rate',
  earningCode: 'Earning Code', earningType: 'Earning Type', rate: 'Rate', earningHours: 'Earning Hours', earningAmount: 'Earning Amount',
  cpp: 'Employee CPP', cpp2: 'Additional CPP', ei: 'Employee EI', federalTax: 'Income Tax (Federal)', provincialTax: 'Income Tax (Provincial)', incomeTax: 'Income Tax', otherDeductions: 'Other Deductions', employerCpp: 'Employer CPP', employerEi: 'Employer EI', employerCosts: 'Employer Costs', totalLiability: 'Total Liability'
};
export const reportFields = { ...legacyReportFields, custom: customReportFields };
export function reportDateFilter(report: Pick<IReportDefinition, 'dateRange' | 'fromDate' | 'toDate'>, now = new Date()) {
  let from = report.fromDate; let to = report.toDate;
  if (report.dateRange === 'all') return undefined;
  if (report.dateRange === 'last30') { const date = new Date(now); date.setUTCDate(date.getUTCDate() - 29); from = date.toISOString().slice(0, 10); to = now.toISOString().slice(0, 10); }
  if (report.dateRange === 'year') { from = `${now.getUTCFullYear()}-01-01`; to = now.toISOString().slice(0, 10); }
  return { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) };
}
export async function buildReport(report: IReportDefinition) {
  const profileOnly = report.source === 'employees' || (report.source === 'custom' && report.fields.every((field) => Object.prototype.hasOwnProperty.call(legacyReportFields.employees, field) || ['employmentType', 'payGroup', 'status', 'phone', 'terminationDate', 'yearsOfService'].includes(field)));
  const companyId = report.companyId;
  const range = reportDateFilter(report);
  const statements = profileOnly ? [] : await PayStatement.find({ companyId, supersededByStatementId: { $exists: false }, ...(report.employeeIds.length ? { employeeId: { $in: report.employeeIds } } : {}), ...(range ? { payDate: range } : {}) }).sort({ payDate: -1, _id: 1 }).limit(5001);
  if (statements.length > 5000) throw new Error('Report exceeds 5,000 rows. Narrow the date range or employee filter.');
  const selectedIds = profileOnly ? report.employeeIds : [...new Set(statements.map((statement) => String(statement.employeeId)))];
  const employees = await Employee.find({ companyId, ...(!profileOnly || selectedIds.length ? { _id: { $in: selectedIds } } : {}), ...(profileOnly && range ? { startDate: range } : {}) })
    .select('employeeNumber legalFirstName legalLastName companyEmail occupation taxProvince startDate adminProfile.employment adminProfile.compensation payGroup phones').sort({ employeeNumber: 1 }).limit(5001);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const basic = (employee: typeof employees[number] | undefined) => ({
    email: employee?.companyEmail || '', department: String(employee?.adminProfile?.employment?.department || ''), jobTitle: String(employee?.adminProfile?.employment?.jobTitle || employee?.occupation || ''), province: employee?.taxProvince || '', startDate: employee?.startDate?.toISOString().slice(0, 10) || '',
    employmentType: String(employee?.adminProfile?.employment?.employmentType || ''), payGroup: String(employee?.adminProfile?.compensation?.payFrequency || employee?.payGroup || ''), status: String(employee?.adminProfile?.employment?.employmentStatus || 'Active'), phone: employee?.phones?.[0]?.number || '', terminationDate: String(employee?.adminProfile?.employment?.terminationDate || employee?.adminProfile?.employment?.endDate || ''), yearsOfService: employee?.startDate ? Number(((Date.now() - employee.startDate.getTime()) / (365.25 * 86400000)).toFixed(1)) : 0,
    employeeNumber: employee?.employeeNumber || '', employeeName: employee ? `${employee.legalFirstName} ${employee.legalLastName}`.trim() : 'Unknown employee'
  });
  let rows: Array<Record<string, string | number>>;
  if (profileOnly) {
    rows = employees.filter((employee) => !range || (employee.startDate && employee.startDate >= range.$gte && employee.startDate <= range.$lte)).map((employee) => ({
      ...basic(employee), email: employee.companyEmail || '', department: String(employee.adminProfile?.employment?.department || ''),
      jobTitle: employee.occupation || '', province: employee.taxProvince || '', startDate: employee.startDate?.toISOString().slice(0, 10) || ''
    }));
  } else {
    rows = statements.flatMap<Record<string, string | number>>((statement) => {
      const identity = { ...basic(employeeById.get(String(statement.employeeId))), payDate: statement.payDate.toISOString().slice(0, 10) };
      if (report.source === 'deductions') return statement.deductions.filter((line) => line.code !== 'TOTAL').map((line) => ({ ...identity, code: line.code || '', description: line.description, amount: moneyToNumber(line.amount) }));
      const tax = (codes: string[]) => moneyToNumber(sumMoney(statement.deductions.filter((line) => codes.includes(line.code)).map((line) => line.amount)));
      const cpp = tax(['CPP']); const cpp2 = tax(['CPP2']); const ei = tax(['EI']); const federalTax = tax(['FTAX']); const provincialTax = tax(['PTAX']);
      const employerCpp = cpp + cpp2; const employerEi = Number((ei * 1.4).toFixed(2));
      const earningLines = statement.grossEarnings.filter((line) => line.code !== 'TOTAL');
      const deductionLines = statement.deductions.filter((line) => line.code !== 'TOTAL');
      return [{ ...identity, cpp, cpp2, ei, federalTax, provincialTax, incomeTax: Number((federalTax + provincialTax).toFixed(2)), employerCpp, employerEi, employerCosts: Number((employerCpp + employerEi).toFixed(2)), totalLiability: Number((cpp + cpp2 + ei + federalTax + provincialTax + employerCpp + employerEi).toFixed(2)), otherDeductions: moneyToNumber(sumMoney(deductionLines.filter((line) => !['CPP', 'CPP2', 'EI', 'FTAX', 'PTAX'].includes(line.code)).map((line) => line.amount))),
        regularHours: statement.regularHours || 0, overtimeHours: statement.overtimeHours || 0, statHolidayHours: statement.statePayHours || 0, hours: (statement.regularHours || 0) + (statement.overtimeHours || 0) + (statement.statePayHours || 0), hourlyRate: moneyToNumber(statement.hourlyRate || 0), payPeriod: statement.periodStart && statement.periodEnd ? `${statement.periodStart.toISOString().slice(0, 10)} - ${statement.periodEnd.toISOString().slice(0, 10)}` : String(statement.payPeriodNumber || ''),
        code: deductionLines.map((line) => line.code).join('; '), description: deductionLines.map((line) => line.description).join('; '), amount: moneyToNumber(sumMoney(deductionLines.map((line) => line.amount))), earningCode: earningLines.map((line) => line.code).join('; '), earningType: earningLines.map((line) => line.description).join('; '), rate: earningLines.map((line) => line.rate || '').join('; '), earningHours: earningLines.map((line) => line.currentUnits || '').join('; '), earningAmount: moneyToNumber(sumMoney(earningLines.map((line) => line.amount))), grossPay: moneyToNumber(statement.grossPay || statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0),
        deductions: moneyToNumber(sumMoney(statement.deductions.filter((line) => line.code !== 'TOTAL').map((line) => line.amount))), netPay: moneyToNumber(statement.netPay) }];
    });
  }
  if (rows.length > 5000 || employees.length > 5000) throw new Error('Report exceeds 5,000 rows. Narrow the date range or employee filter.');
  const labels = reportFields[report.source] as Record<string, string>;
  return { columns: report.fields.map((key) => ({ key, label: report.fieldLabels?.[key] || labels[key] })), rows };
}
export function csvCell(value: string | number) {
  const safe = typeof value === 'string' && /^[\s]*[=+\-@]/.test(value) ? `'${value}` : String(value);
  return `"${safe.replace(/"/g, '""')}"`;
}
export function reportFile(name: string, format: 'csv' | 'excel' | 'pdf', columns: Array<{ key: string; label: string }>, rows: Array<Record<string, string | number>>, companyName: string) {
  const filename = `${name.replace(/[^a-z\d_-]/gi, '-').slice(0, 70) || 'report'}.${format === 'excel' ? 'xls' : format}`;
  if (format === 'pdf') return { file: customReportPdf(name, companyName, columns.map((column) => column.label), rows.map((row) => columns.map((column) => String(row[column.key] ?? '')))), filename, contentType: 'application/pdf' };
  if (format === 'excel') {
    const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
    const html = `<html><head><meta charset="utf-8"></head><body><h1>${escape(name)}</h1><p>${escape(companyName)}</p><table><tr>${columns.map((column) => `<th>${escape(column.label)}</th>`).join('')}</tr>${rows.map((row) => `<tr>${columns.map((column) => `<td style="mso-number-format:'\\@'">${escape(row[column.key])}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
    return { file: Buffer.from(html), filename, contentType: 'application/vnd.ms-excel' };
  }
  return { file: Buffer.from('\uFEFF' + [columns.map((column) => csvCell(column.label)).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column.key] ?? '')).join(','))].join('\r\n')), filename, contentType: 'text/csv; charset=utf-8' };
}
export function scheduledDefinition(schedule: IReportSchedule): IReportDefinition | undefined {
  if (!schedule.reportType) return undefined;
  const presets = {
    employee: ['employeeNumber', 'employeeName', 'email', 'department', 'jobTitle', 'province', 'startDate'],
    payroll: ['employeeNumber', 'employeeName', 'payDate', 'payPeriod', 'hours', 'grossPay', 'deductions', 'netPay'],
    tax: ['employeeNumber', 'employeeName', 'payDate', 'cpp', 'cpp2', 'ei', 'federalTax', 'provincialTax', 'employerCpp', 'employerEi', 'totalLiability'],
    deductions: ['employeeNumber', 'employeeName', 'payDate', 'code', 'description', 'amount']
  };
  return { companyId: schedule.companyId, name: schedule.name, description: '', source: schedule.reportType === 'deductions' ? 'deductions' : 'custom', fields: presets[schedule.reportType], dateRange: schedule.dateRange || 'all', fromDate: schedule.fromDate, toDate: schedule.toDate, employeeIds: [] };
}
export async function runReport(reportId: unknown, companyId: unknown, format: 'csv' | 'excel' | 'pdf', scheduleId?: unknown, recipients: string[] = [], definition?: IReportDefinition) {
  const report = definition || await EmployerReport.findOne({ _id: String(reportId), companyId: String(companyId) });
  if (!report) throw new Error('Saved report not found.');
  const run = await EmployerReportRun.create({ companyId: String(companyId), reportId: String(reportId), scheduleId: scheduleId ? String(scheduleId) : undefined, reportName: report.name, format, status: 'running' });
  try {
    const company = await Company.findById(report.companyId);
    if (!company) throw new Error('Employer not found.');
    const { columns, rows } = await buildReport(report);
    const file = reportFile(report.name, format, columns, rows, company.legalName);
    Object.assign(run, file, { rowCount: rows.length, status: 'completed' });
    await run.save();
    if (recipients.length) {
      try { await emailService.send({ to: recipients.join(','), subject: report.name, body: `Your scheduled report "${report.name}" is attached.`, attachments: [{ filename: file.filename, content: file.file, contentType: file.contentType }] }); run.delivery = 'sent'; }
      catch (error) { run.delivery = 'failed'; run.deliveryError = error instanceof Error ? error.message : 'Email delivery failed'; }
      await run.save();
    }
    return run;
  } catch (error) {
    run.status = 'failed'; run.error = error instanceof Error ? error.message : 'Report generation failed'; await run.save(); throw error;
  }
}
export function nextReportRun(schedule: Pick<IReportSchedule, 'nextRunAt' | 'frequency' | 'anchorDay'>, now = new Date()) {
  const next = new Date(schedule.nextRunAt);
  do {
    if (schedule.frequency === 'monthly') { const month = next.getUTCMonth() + 1; next.setUTCDate(1); next.setUTCMonth(month); const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate(); next.setUTCDate(Math.min(schedule.anchorDay || schedule.nextRunAt.getUTCDate(), last)); }
    else next.setUTCDate(next.getUTCDate() + (schedule.frequency === 'weekly' ? 7 : 1));
  } while (next <= now);
  return next;
}
let processing = false;
export async function processReportSchedules() {
  if (processing) return; processing = true;
  try {
    for (let count = 0; count < 20; count++) {
      const now = new Date();
      const schedule = await EmployerReportSchedule.findOneAndUpdate({ enabled: true, nextRunAt: { $lte: now }, $or: [{ leaseUntil: { $exists: false } }, { leaseUntil: { $lte: now } }] }, { $set: { leaseUntil: new Date(now.getTime() + 600000) } }, { new: true });
      if (!schedule) break;
      if (schedule.untilDate && now > new Date(`${schedule.untilDate}T23:59:59.999Z`)) {
        await EmployerReportSchedule.updateOne({ _id: schedule._id, leaseUntil: schedule.leaseUntil }, { $set: { enabled: false }, $unset: { leaseUntil: '' } });
        continue;
      }
      let error = '';
      let generationStarted = false;
      try {
        const [actor, company] = await Promise.all([EmployerUser.findOne({ _id: schedule.createdBy, isActive: true, $or: [{ companyId: schedule.companyId }, { companyIds: schedule.companyId }] }), Company.findById(schedule.companyId)]);
        if (!actor || !company) throw new Error('The schedule owner no longer has access to this employer.');
        const custom = await AccessRole.findOne({ name: actor.role, userType: 'employer' });
        const permissions = employerPermissionOverride(company.settings, actor.role) ?? (custom ? custom.status === 'Active' ? employerRolePermissions(custom.permissions) : [] : permissionsForRole(actor.role));
        if (!permissions.includes('reports.export')) throw new Error('The schedule owner no longer has report export permission.');
        generationStarted = true;
        const run = await runReport(schedule.reportId || schedule._id, schedule.companyId, schedule.format, schedule._id, schedule.recipients, scheduledDefinition(schedule));
        error = run.deliveryError || '';
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Scheduled report failed';
        if (!generationStarted) await EmployerReportRun.create({ companyId: schedule.companyId, reportId: schedule.reportId || schedule._id, scheduleId: schedule._id, reportName: schedule.name, format: schedule.format, status: 'failed', error });
      }
      const nextRunAt = nextReportRun(schedule);
      await EmployerReportSchedule.updateOne({ _id: schedule._id, leaseUntil: schedule.leaseUntil }, { $set: { nextRunAt, lastRunAt: now, lastError: error, ...(schedule.untilDate && nextRunAt > new Date(`${schedule.untilDate}T23:59:59.999Z`) ? { enabled: false } : {}) }, $unset: { leaseUntil: '' } });
    }
  } finally { processing = false; }
}
export function startReportScheduler() {
  const tick = () => { void processReportSchedules().catch((error) => console.error('Report scheduler failed:', error.message)); };
  tick(); const timer = setInterval(tick, 60000); timer.unref(); return timer;
}

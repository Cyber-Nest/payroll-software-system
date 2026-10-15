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

export const reportFields = {
  employees: { employeeNumber: 'Employee ID', employeeName: 'Employee Name', email: 'Company Email', department: 'Department', jobTitle: 'Job Title', province: 'Province', startDate: 'Start Date' },
  payroll: { employeeNumber: 'Employee ID', employeeName: 'Employee Name', payDate: 'Pay Date', grossPay: 'Gross Pay', deductions: 'Total Deductions', netPay: 'Net Pay' },
  deductions: { employeeNumber: 'Employee ID', employeeName: 'Employee Name', payDate: 'Pay Date', code: 'Deduction Code', description: 'Deduction', amount: 'Amount' }
};
export function reportDateFilter(report: Pick<IReportDefinition, 'dateRange' | 'fromDate' | 'toDate'>, now = new Date()) {
  let from = report.fromDate; let to = report.toDate;
  if (report.dateRange === 'all') return undefined;
  if (report.dateRange === 'last30') { const date = new Date(now); date.setUTCDate(date.getUTCDate() - 29); from = date.toISOString().slice(0, 10); to = now.toISOString().slice(0, 10); }
  if (report.dateRange === 'year') { from = `${now.getUTCFullYear()}-01-01`; to = now.toISOString().slice(0, 10); }
  return { $gte: new Date(`${from}T00:00:00.000Z`), $lte: new Date(`${to}T23:59:59.999Z`) };
}
export async function buildReport(report: IReportDefinition) {
  const companyId = report.companyId;
  const range = reportDateFilter(report);
  const statements = report.source === 'employees' ? [] : await PayStatement.find({ companyId, supersededByStatementId: { $exists: false }, ...(report.employeeIds.length ? { employeeId: { $in: report.employeeIds } } : {}), ...(range ? { payDate: range } : {}) }).sort({ payDate: -1, _id: 1 }).limit(5001);
  if (statements.length > 5000) throw new Error('Report exceeds 5,000 rows. Narrow the date range or employee filter.');
  const selectedIds = report.source === 'employees' ? report.employeeIds : [...new Set(statements.map((statement) => String(statement.employeeId)))];
  const employees = await Employee.find({ companyId, ...(report.source !== 'employees' || selectedIds.length ? { _id: { $in: selectedIds } } : {}), ...(report.source === 'employees' && range ? { startDate: range } : {}) })
    .select('employeeNumber legalFirstName legalLastName companyEmail occupation taxProvince startDate adminProfile.employment').sort({ employeeNumber: 1 }).limit(5001);
  const employeeById = new Map(employees.map((employee) => [String(employee._id), employee]));
  const basic = (employee: typeof employees[number] | undefined) => ({
    employeeNumber: employee?.employeeNumber || '', employeeName: employee ? `${employee.legalFirstName} ${employee.legalLastName}`.trim() : 'Unknown employee'
  });
  let rows: Array<Record<string, string | number>>;
  if (report.source === 'employees') {
    rows = employees.filter((employee) => !range || (employee.startDate && employee.startDate >= range.$gte && employee.startDate <= range.$lte)).map((employee) => ({
      ...basic(employee), email: employee.companyEmail || '', department: String(employee.adminProfile?.employment?.department || ''),
      jobTitle: employee.occupation || '', province: employee.taxProvince || '', startDate: employee.startDate?.toISOString().slice(0, 10) || ''
    }));
  } else {
    rows = statements.flatMap<Record<string, string | number>>((statement) => {
      const identity = { ...basic(employeeById.get(String(statement.employeeId))), payDate: statement.payDate.toISOString().slice(0, 10) };
      if (report.source === 'deductions') return statement.deductions.filter((line) => line.code !== 'TOTAL').map((line) => ({ ...identity, code: line.code || '', description: line.description, amount: moneyToNumber(line.amount) }));
      return [{ ...identity, grossPay: moneyToNumber(statement.grossPay || statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0),
        deductions: moneyToNumber(sumMoney(statement.deductions.filter((line) => line.code !== 'TOTAL').map((line) => line.amount))), netPay: moneyToNumber(statement.netPay) }];
    });
  }
  if (rows.length > 5000 || employees.length > 5000) throw new Error('Report exceeds 5,000 rows. Narrow the date range or employee filter.');
  const labels = reportFields[report.source] as Record<string, string>;
  return { columns: report.fields.map((key) => ({ key, label: labels[key] })), rows };
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
export async function runReport(reportId: unknown, companyId: unknown, format: 'csv' | 'excel' | 'pdf', scheduleId?: unknown, recipients: string[] = []) {
  const report = await EmployerReport.findOne({ _id: String(reportId), companyId: String(companyId) });
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
      let error = '';
      let generationStarted = false;
      try {
        const [actor, company] = await Promise.all([EmployerUser.findOne({ _id: schedule.createdBy, isActive: true, $or: [{ companyId: schedule.companyId }, { companyIds: schedule.companyId }] }), Company.findById(schedule.companyId)]);
        if (!actor || !company) throw new Error('The schedule owner no longer has access to this employer.');
        const custom = await AccessRole.findOne({ name: actor.role, userType: 'employer' });
        const permissions = employerPermissionOverride(company.settings, actor.role) ?? (custom ? custom.status === 'Active' ? employerRolePermissions(custom.permissions) : [] : permissionsForRole(actor.role));
        if (!permissions.includes('reports.export')) throw new Error('The schedule owner no longer has report export permission.');
        generationStarted = true;
        const run = await runReport(schedule.reportId, schedule.companyId, schedule.format, schedule._id, schedule.recipients);
        error = run.deliveryError || '';
      } catch (cause) {
        error = cause instanceof Error ? cause.message : 'Scheduled report failed';
        if (!generationStarted) await EmployerReportRun.create({ companyId: schedule.companyId, reportId: schedule.reportId, scheduleId: schedule._id, reportName: schedule.name, format: schedule.format, status: 'failed', error });
      }
      await EmployerReportSchedule.updateOne({ _id: schedule._id, leaseUntil: schedule.leaseUntil }, { $set: { nextRunAt: nextReportRun(schedule), lastRunAt: now, lastError: error }, $unset: { leaseUntil: '' } });
    }
  } finally { processing = false; }
}
export function startReportScheduler() {
  const tick = () => { void processReportSchedules().catch((error) => console.error('Report scheduler failed:', error.message)); };
  tick(); const timer = setInterval(tick, 60000); timer.unref(); return timer;
}

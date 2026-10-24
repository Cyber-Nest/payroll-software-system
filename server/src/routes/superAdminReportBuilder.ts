import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, AuthRequest, requirePermission } from '../middleware/auth';
import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { EmployerReport, EmployerReportRun, EmployerReportSchedule, EmployerReportTemplate } from '../models/EmployerReport';
import { PayrollRun } from '../models/PayrollRun';
import { PayStatement } from '../models/PayStatement';
import { GovernmentFiling } from '../models/GovernmentFiling';
import { SuperAdmin } from '../models/SuperAdmin';
import { buildReport, reportFields, reportFile, runReport } from '../services/employerReports.service';
import { reportDefinitionSchema, reportScheduleSchema } from './employerReportBuilder';

const router = Router();
router.use(authenticate, requirePermission('reports.view'), (req: AuthRequest, res, next) => req.superAdminContext ? next() : res.status(403).json({ message: 'Super admin access required.' }));
const id = z.string().regex(/^[a-f\d]{24}$/i);
const scope = async (req: AuthRequest, res: import('express').Response) => {
  const parsed = id.safeParse(req.query.companyId);
  if (!parsed.success) { res.status(400).json({ message: 'Choose a valid company.' }); return undefined; }
  const company = await Company.findById(parsed.data).select('legalName operatingName customerId');
  if (!company) { res.status(404).json({ message: 'Company not found.' }); return undefined; }
  return company;
};
const serialize = (value: { _id: unknown; toObject(): any }) => { const { _id, __v, file, snapshot, leaseUntil, ...data } = value.toObject(); return { ...data, id: String(_id) }; };
router.get('/options', async (_req, res) => {
  const companies = await Company.find({ status: { $ne: 'suspended' } }).select('legalName operatingName customerId').sort({ legalName: 1 });
  res.json({ fields: reportFields, employees: [], emailConfigured: false, companies: companies.map(company => ({ id: String(company._id), name: company.operatingName || company.legalName, customerId: company.customerId })) });
});
router.get('/export', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  const section = z.enum(['Overview', 'Payroll Reports', 'Financial', 'Employees', 'Tax (CRA)', 'Compliance', 'Scheduled Reports']).safeParse(req.query.section);
  const format = z.enum(['pdf', 'excel', 'csv']).safeParse(req.query.format);
  if (!section.success || !format.success) return res.status(400).json({ message: 'Choose a report section and PDF, Excel or CSV format.' });
  let companyId: mongoose.Types.ObjectId | undefined;
  if (req.query.companyId !== undefined) { const parsed = id.safeParse(req.query.companyId); if (!parsed.success) return res.status(400).json({ message: 'Choose a valid company.' }); companyId = new mongoose.Types.ObjectId(parsed.data); if (!await Company.exists({ _id: companyId })) return res.status(404).json({ message: 'Company not found.' }); }
  const companies = await Company.find(companyId ? { _id: companyId } : {}).select('legalName operatingName customerId businessNumber address').sort({ legalName: 1 });
  const companyMap = new Map(companies.map(company => [String(company._id), company]));
  const money = (value: unknown) => Number((value as { toString?: () => string } | null)?.toString?.() || 0);
  const columns: Array<{ key: string; label: string }> = [];
  const rows: Array<Record<string, string | number>> = [];
  const title = `${section.data} Report`;
  const date = (value: Date | string | undefined) => value ? new Date(value).toISOString().slice(0, 10) : '';
  if (['Overview', 'Payroll Reports', 'Financial'].includes(section.data)) {
    columns.push(...[['company', 'Company'], ['customerId', 'Account ID'], ['period', 'Pay Period'], ['payDate', 'Pay Date'], ['employees', 'Employees'], ['gross', 'Gross Pay'], ['deductions', 'Deductions'], ['net', 'Net Pay'], ['status', 'Status']].map(([key, label]) => ({ key, label })));
    const runs = await PayrollRun.find({ ...(companyId ? { companyId } : {}) }).sort({ payDate: -1 }).limit(5000);
    rows.push(...runs.map(run => ({ company: companyMap.get(String(run.companyId))?.operatingName || companyMap.get(String(run.companyId))?.legalName || 'Unknown company', customerId: companyMap.get(String(run.companyId))?.customerId || '', period: `${date(run.periodStart)} – ${date(run.periodEnd)}`, payDate: date(run.payDate), employees: run.employeeCount, gross: money(run.estimatedGross), deductions: money(run.totalDeductions), net: money(run.totalNetPay), status: run.status })));
  } else if (section.data === 'Employees') {
    if (req.query.source === 'super-admin') {
      columns.push(...[['employeeNumber', 'Employee ID'], ['employeeName', 'Employee Name'], ['email', 'Email'], ['role', 'Role'], ['employer', 'Employer'], ['status', 'Status'], ['createdAt', 'Added Date']].map(([key, label]) => ({ key, label })));
      const current = await SuperAdmin.findById(req.superAdminContext!.superAdminId).select('staffOwnerId');
      const ownerId = current?.staffOwnerId || req.superAdminContext!.superAdminId;
      const staff = await SuperAdmin.find({ staffOwnerId: ownerId }).sort({ createdAt: -1 }).limit(10000);
      rows.push(...staff.map(person => ({ employeeNumber: person.staffProfile?.employeeNumber || '', employeeName: person.name || [person.staffProfile?.firstName, person.staffProfile?.lastName].filter(Boolean).join(' ') || 'Super Admin', email: person.email, role: person.role || 'Super Admin', employer: 'Payhours Inc.', status: person.isActive ? 'Active' : 'Inactive', createdAt: date(person.createdAt) })));
    } else {
      columns.push(...[['company', 'Company'], ['employeeNumber', 'Employee ID'], ['employeeName', 'Employee Name'], ['email', 'Email'], ['department', 'Department'], ['jobTitle', 'Job Title'], ['province', 'Province'], ['startDate', 'Start Date']].map(([key, label]) => ({ key, label })));
      const employees = await Employee.find({ ...(companyId ? { companyId } : {}) }).select('companyId employeeNumber legalFirstName legalLastName companyEmail occupation taxProvince startDate adminProfile').sort({ employeeNumber: 1 }).limit(10000);
      rows.push(...employees.map(employee => ({ company: companyMap.get(String(employee.companyId))?.operatingName || companyMap.get(String(employee.companyId))?.legalName || 'Unknown company', employeeNumber: employee.employeeNumber, employeeName: `${employee.legalFirstName} ${employee.legalLastName}`.trim(), email: employee.companyEmail || '', department: String(employee.adminProfile?.employment?.department || ''), jobTitle: employee.occupation || '', province: employee.taxProvince || '', startDate: date(employee.startDate) })));
    }
  } else if (section.data === 'Tax (CRA)' || section.data === 'Compliance') {
    columns.push(...[['company', 'Company'], ['filing', 'Filing'], ['period', 'Period'], ['year', 'Year'], ['dueDate', 'Due Date'], ['amount', 'Amount'], ['status', 'Status'], ['reference', 'Reference']].map(([key, label]) => ({ key, label })));
    const filings = await GovernmentFiling.find({ ...(companyId ? { companyId } : {}) }).sort({ dueDate: 1 }).limit(10000);
    rows.push(...filings.map(filing => ({ company: companyMap.get(String(filing.companyId))?.operatingName || companyMap.get(String(filing.companyId))?.legalName || 'Unknown company', filing: filing.title, period: filing.period, year: filing.year, dueDate: date(filing.dueDate), amount: money(filing.amount), status: filing.status, reference: filing.reference || filing.confirmationNumber || '' })));
  } else {
    columns.push(...[['name', 'Schedule'], ['report', 'Report Type'], ['frequency', 'Frequency'], ['nextRunAt', 'Next Run'], ['recipients', 'Recipients'], ['status', 'Status']].map(([key, label]) => ({ key, label })));
    const schedules = await EmployerReportSchedule.find({ ...(companyId ? { companyId } : {}) }).sort({ nextRunAt: 1 }).limit(10000);
    rows.push(...schedules.map(schedule => ({ name: schedule.name, report: schedule.reportType || String(schedule.reportId || 'Custom Report'), frequency: schedule.frequency, nextRunAt: date(schedule.nextRunAt), recipients: schedule.recipients.join('; '), status: schedule.enabled ? 'Active' : 'Paused' })));
  }
  const employer = companyId ? (companies[0]?.operatingName || companies[0]?.legalName || 'Employer') : 'Payhours Inc.';
  const details: string[] = companyId ? [companies[0]?.address?.street || '', [companies[0]?.address?.city, companies[0]?.address?.province, companies[0]?.address?.postalCode].filter(Boolean).join(', '), companies[0]?.businessNumber ? `Business Number: ${companies[0].businessNumber}` : '', `Account: ${companies[0]?.customerId || ''}`].filter((value): value is string => Boolean(value)) : ['Platform wide report across all companies', `${companies.length} employer accounts`];
  const output = reportFile(title, format.data, columns, rows, employer, details);
  res.type(output.contentType).setHeader('Cache-Control', 'no-store').setHeader('Content-Disposition', `attachment; filename="${output.filename}"`).send(output.file);
});
router.get('/definitions', async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; res.json({ reports: (await EmployerReport.find({ companyId: company._id }).sort({ name: 1 })).map(serialize) }); });
router.get('/templates', async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; res.json({ templates: (await EmployerReportTemplate.find({ companyId: company._id }).sort({ name: 1 })).map(serialize) }); });
router.get('/schedules', async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; res.json({ schedules: (await EmployerReportSchedule.find({ companyId: company._id }).sort({ nextRunAt: 1 })).map(serialize) }); });
router.get('/runs', async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; res.json({ runs: (await EmployerReportRun.find({ companyId: company._id }).sort({ createdAt: -1 }).limit(100)).map(serialize) }); });
router.post('/preview', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  const company = await scope(req, res); if (!company) return;
  const parsed = reportDefinitionSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
  try { const result = await buildReport({ ...parsed.data, companyId: company._id, employeeIds: [] }); res.json({ ...result, rows: result.rows.slice(0, 100), totalRows: result.rows.length }); }
  catch (error) { res.status(400).json({ message: (error as Error).message }); }
});
async function save(req: AuthRequest, res: import('express').Response, model: typeof EmployerReport | typeof EmployerReportTemplate) {
  const company = await scope(req, res); if (!company) return;
  const parsed = reportDefinitionSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
  const value = { ...parsed.data, employeeIds: [] };
  const result = req.params.id ? await model.findOneAndUpdate({ _id: req.params.id, companyId: company._id }, { $set: value }, { new: true, runValidators: true }) : await model.create({ ...value, companyId: company._id });
  if (!result) return res.status(404).json({ message: 'Saved report not found.' }); res.status(req.params.id ? 200 : 201).json({ report: serialize(result) });
}
router.post('/definitions', requirePermission('reports.export'), (req, res) => save(req, res, EmployerReport));
router.put('/definitions/:id', requirePermission('reports.export'), (req, res) => save(req, res, EmployerReport));
router.post('/templates', requirePermission('reports.export'), (req, res) => save(req, res, EmployerReportTemplate));
router.put('/templates/:id', requirePermission('reports.export'), (req, res) => save(req, res, EmployerReportTemplate));
router.delete('/definitions/:id', requirePermission('reports.export'), async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; if (await EmployerReportSchedule.exists({ companyId: company._id, reportId: req.params.id })) return res.status(409).json({ message: 'Delete this report’s schedules before deleting it.' }); if (!await EmployerReport.findOneAndDelete({ _id: req.params.id, companyId: company._id })) return res.status(404).json({ message: 'Saved report not found.' }); res.json({ deleted: true }); });
router.delete('/templates/:id', requirePermission('reports.export'), async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; if (!await EmployerReportTemplate.findOneAndDelete({ _id: req.params.id, companyId: company._id })) return res.status(404).json({ message: 'Template not found.' }); res.json({ deleted: true }); });
router.post('/definitions/:id/run', requirePermission('reports.export'), async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; const format = z.enum(['csv', 'excel', 'pdf']).safeParse(req.body.format); if (!format.success) return res.status(400).json({ message: 'Choose CSV, Excel or PDF.' }); try { res.json({ run: serialize(await runReport(req.params.id, company._id, format.data)) }); } catch (error) { res.status(400).json({ message: (error as Error).message }); } });
router.post('/schedules', requirePermission('reports.export'), async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; const parsed = reportScheduleSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message }); if (parsed.data.reportId && !await EmployerReport.exists({ _id: parsed.data.reportId, companyId: company._id })) return res.status(404).json({ message: 'Saved report not found for this company.' }); const schedule = await EmployerReportSchedule.create({ ...parsed.data, companyId: company._id, createdBy: req.superAdminContext!.superAdminId, nextRunAt: new Date(parsed.data.nextRunAt), anchorDay: parsed.data.anchorDay || new Date(parsed.data.nextRunAt).getUTCDate() }); res.status(201).json({ schedule: serialize(schedule) }); });
router.put('/schedules/:id', requirePermission('reports.export'), async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; const parsed = reportScheduleSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message }); const schedule = await EmployerReportSchedule.findOneAndUpdate({ _id: req.params.id, companyId: company._id }, { $set: { ...parsed.data, nextRunAt: new Date(parsed.data.nextRunAt) } }, { new: true, runValidators: true }); if (!schedule) return res.status(404).json({ message: 'Schedule not found.' }); res.json({ schedule: serialize(schedule) }); });
router.patch('/schedules/:id/status', requirePermission('reports.export'), async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: 'Invalid schedule status.' }); const schedule = await EmployerReportSchedule.findOneAndUpdate({ _id: req.params.id, companyId: company._id }, { $set: parsed.data }, { new: true }); if (!schedule) return res.status(404).json({ message: 'Schedule not found.' }); res.json({ schedule: serialize(schedule) }); });
router.delete('/schedules/:id', requirePermission('reports.export'), async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; if (!await EmployerReportSchedule.findOneAndDelete({ _id: req.params.id, companyId: company._id })) return res.status(404).json({ message: 'Schedule not found.' }); res.json({ deleted: true }); });
router.post('/schedules/:id/run', requirePermission('reports.export'), async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; const format = z.enum(['csv', 'excel', 'pdf']).optional().safeParse(req.body.format); if (!format.success) return res.status(400).json({ message: 'Choose CSV, Excel or PDF.' }); const schedule = await EmployerReportSchedule.findOne({ _id: req.params.id, companyId: company._id }); if (!schedule) return res.status(404).json({ message: 'Schedule not found.' }); try { res.json({ run: serialize(await runReport(schedule.reportId || schedule._id, company._id, format.data || schedule.format, schedule._id, schedule.recipients)) }); } catch (error) { res.status(400).json({ message: (error as Error).message }); } });
router.get('/runs/:id/download', requirePermission('reports.export'), async (req: AuthRequest, res) => { const company = await scope(req, res); if (!company) return; const format = z.enum(['csv', 'excel', 'pdf']).optional().safeParse(req.query.format); if (!format.success) return res.status(400).json({ message: 'Choose CSV, Excel or PDF.' }); const run = await EmployerReportRun.findOne({ _id: req.params.id, companyId: company._id, status: 'completed' }).select('+file +snapshot'); if (!run?.file) return res.status(404).json({ message: 'Generated report not found.' }); if (format.data && format.data !== run.format) { if (!run.snapshot) return res.status(409).json({ message: 'Run this report again to enable downloads in all formats.' }); const output = reportFile(run.reportName, format.data, run.snapshot.columns, run.snapshot.rows, run.snapshot.companyName, run.snapshot.employerDetails); return res.type(output.contentType).setHeader('Cache-Control', 'no-store').setHeader('Content-Disposition', `attachment; filename="${output.filename}"`).send(output.file); } res.type(run.contentType || 'application/octet-stream').setHeader('Cache-Control', 'no-store').setHeader('Content-Disposition', `attachment; filename="${run.filename}"`).send(run.file); });
export default router;

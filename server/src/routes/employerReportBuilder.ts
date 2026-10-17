import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, AuthRequest, requirePermission } from '../middleware/auth';
import { Employee } from '../models/Employee';
import { EmployerReport, EmployerReportTemplate, EmployerReportRun, EmployerReportSchedule } from '../models/EmployerReport';
import { buildReport, reportFields, runReport, scheduledDefinition } from '../services/employerReports.service';
import { env } from '../config/env';

const router = Router();
router.use(authenticate, requirePermission('reports.view'), (req: AuthRequest, res, next) => {
  if (!req.employerContext) return res.status(403).json({ message: 'Employer access required.' }); next();
});
const id = z.string().regex(/^[a-f\d]{24}$/i);
export const reportDefinitionSchema = z.object({
  name: z.string().trim().min(2).max(90), description: z.string().trim().max(500).default(''),
  source: z.enum(['employees', 'payroll', 'deductions', 'custom']).default('custom'), fields: z.array(z.string()).min(1).max(Object.keys(reportFields.custom).length),
  dateRange: z.enum(['all', 'last30', 'year', 'custom']).default('all'), fromDate: z.iso.date().optional(), toDate: z.iso.date().optional(),
  employeeIds: z.array(id).max(5000).default([]), fieldLabels: z.record(z.string(), z.string().trim().min(1).max(60)).optional()
}).refine((value) => value.fields.every((field) => Object.prototype.hasOwnProperty.call(reportFields[value.source], field)) && new Set(value.fields).size === value.fields.length, { message: 'Select valid, unique fields for the report source.' })
  .refine((value) => value.dateRange !== 'custom' || Boolean(value.fromDate && value.toDate && value.fromDate <= value.toDate), { message: 'Select a valid start and end date.' })
  .refine((value) => Object.keys(value.fieldLabels || {}).every((field) => Object.prototype.hasOwnProperty.call(reportFields[value.source], field)), { message: 'Column headings must belong to the selected data source.' });
export const reportScheduleSchema = z.object({
  name: z.string().trim().min(2).max(90), reportId: id.optional(), reportType: z.enum(['employee', 'payroll', 'tax', 'deductions']).optional(), frequency: z.enum(['daily', 'weekly', 'monthly']),
  anchorDay: z.number().int().min(1).max(31).optional(), untilDate: z.iso.date().optional(),
  dateRange: z.enum(['all', 'last30', 'year', 'custom']).optional(), fromDate: z.iso.date().optional(), toDate: z.iso.date().optional(),
  format: z.enum(['csv', 'excel', 'pdf']), nextRunAt: z.iso.datetime(), enabled: z.boolean().default(true),
  recipients: z.array(z.string().email()).max(10).default([])
}).refine((value) => Boolean(value.reportType || value.reportId), { message: 'Choose a report type.' })
  .refine((value) => value.dateRange !== 'custom' || Boolean(value.fromDate && value.toDate && value.fromDate <= value.toDate), { message: 'Select a valid report date range.' })
  .refine((value) => !value.untilDate || value.frequency === 'monthly' || value.nextRunAt.slice(0, 10) <= value.untilDate, { message: 'Until date must be on or after the first run.' });
const serialize = (value: { _id: unknown; toObject(): any }) => { const { _id, __v, file, leaseUntil, ...data } = value.toObject(); return { ...data, id: String(_id) }; };
router.param('id', (_req, res, next, value) => { if (!mongoose.isValidObjectId(value)) { res.status(400).json({ message: 'Invalid report ID.' }); return; } next(); });
router.get('/options', async (req: AuthRequest, res) => {
  const employees = await Employee.find({ companyId: req.employerContext!.companyId }).select('employeeNumber legalFirstName legalLastName').sort({ employeeNumber: 1 });
  res.json({ fields: reportFields, emailConfigured: Boolean(env.smtpUser && env.smtpPass), employees: employees.map((employee) => ({ id: String(employee._id), name: `${employee.legalFirstName} ${employee.legalLastName}`, employeeNumber: employee.employeeNumber })) });
});
router.get('/definitions', async (req: AuthRequest, res) => { res.json({ reports: (await EmployerReport.find({ companyId: req.employerContext!.companyId }).sort({ name: 1 })).map(serialize) }); });
router.post('/preview', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  const parsed = reportDefinitionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
  try { const result = await buildReport({ ...parsed.data, companyId: new mongoose.Types.ObjectId(req.employerContext!.companyId), employeeIds: parsed.data.employeeIds.map((value) => new mongoose.Types.ObjectId(value)) }); res.json({ ...result, rows: result.rows.slice(0, 100), totalRows: result.rows.length }); }
  catch (error) { res.status(400).json({ message: (error as Error).message }); }
});
router.post('/definitions', requirePermission('reports.export'), (req, res) => saveDefinition(req, res));
router.put('/definitions/:id', requirePermission('reports.export'), (req, res) => saveDefinition(req, res));
router.get('/templates', async (req: AuthRequest, res) => { res.json({ templates: (await EmployerReportTemplate.find({ companyId: req.employerContext!.companyId }).sort({ name: 1 })).map(serialize) }); });
router.post('/templates', requirePermission('reports.export'), (req, res) => saveDefinition(req, res, true));
router.put('/templates/:id', requirePermission('reports.export'), (req, res) => saveDefinition(req, res, true));
router.delete('/templates/:id', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  if (!await EmployerReportTemplate.findOneAndDelete({ _id: req.params.id, companyId: req.employerContext!.companyId })) return res.status(404).json({ message: 'Template not found.' });
  res.json({ deleted: true });
});
async function saveDefinition(req: AuthRequest, res: import('express').Response, template = false) {
  const parsed = reportDefinitionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
  const companyId = req.employerContext!.companyId;
  if (parsed.data.employeeIds.length && await Employee.countDocuments({ companyId, _id: { $in: [...new Set(parsed.data.employeeIds)] } }) !== new Set(parsed.data.employeeIds).size) return res.status(400).json({ message: 'Choose employees from this employer only.' });
  const model = template ? EmployerReportTemplate : EmployerReport;
  const report = req.params.id ? await model.findOneAndUpdate({ _id: req.params.id, companyId }, { $set: parsed.data }, { new: true, runValidators: true }) : await model.create({ ...parsed.data, companyId });
  if (!report) return res.status(404).json({ message: template ? 'Template not found.' : 'Saved report not found.' });
  res.status(req.params.id ? 200 : 201).json({ report: serialize(report) });
}
router.delete('/definitions/:id', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  const companyId = req.employerContext!.companyId;
  if (await EmployerReportSchedule.exists({ companyId, reportId: req.params.id })) return res.status(409).json({ message: 'Delete this report’s schedules before deleting the report.' });
  if (!await EmployerReport.findOneAndDelete({ _id: req.params.id, companyId })) return res.status(404).json({ message: 'Saved report not found.' });
  res.json({ deleted: true });
});
router.post('/definitions/:id/run', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  const format = z.enum(['csv', 'excel', 'pdf']).safeParse(req.body.format);
  if (!format.success) return res.status(400).json({ message: 'Choose CSV, Excel or PDF.' });
  try { const run = await runReport(req.params.id, req.employerContext!.companyId, format.data); res.json({ run: serialize(run) }); }
  catch (error) { res.status(400).json({ message: (error as Error).message }); }
});
router.get('/schedules', async (req: AuthRequest, res) => { res.json({ schedules: (await EmployerReportSchedule.find({ companyId: req.employerContext!.companyId }).sort({ nextRunAt: 1 })).map(serialize) }); });
router.post('/schedules', requirePermission('reports.export'), saveSchedule);
router.put('/schedules/:id', requirePermission('reports.export'), saveSchedule);
async function saveSchedule(req: AuthRequest, res: import('express').Response) {
  const parsed = reportScheduleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0].message });
  const companyId = req.employerContext!.companyId;
  const firstRun = new Date(parsed.data.nextRunAt);
  if (parsed.data.frequency === 'monthly' && parsed.data.anchorDay) {
    const lastDay = new Date(Date.UTC(firstRun.getUTCFullYear(), firstRun.getUTCMonth() + 1, 0)).getUTCDate();
    firstRun.setUTCDate(Math.min(parsed.data.anchorDay, lastDay));
  }
  if (firstRun <= new Date()) return res.status(400).json({ message: 'Choose a future first run month, day and time (UTC).' });
  if (parsed.data.untilDate && firstRun > new Date(`${parsed.data.untilDate}T23:59:59.999Z`)) return res.status(400).json({ message: 'Until date must be on or after the first run.' });
  if (parsed.data.recipients.length && !(env.smtpUser && env.smtpPass)) return res.status(400).json({ message: 'Email is not configured. Leave recipients empty for in-app delivery.' });
  if (!parsed.data.reportType && !await EmployerReport.exists({ _id: parsed.data.reportId, companyId })) return res.status(404).json({ message: 'Saved report not found for this employer.' });
  const payload = { ...parsed.data, nextRunAt: firstRun, createdBy: req.employerContext!.employerUserId, anchorDay: parsed.data.anchorDay || firstRun.getUTCDate() };
  const unset = Object.fromEntries(['untilDate', 'fromDate', 'toDate'].filter((key) => !parsed.data[key as 'untilDate' | 'fromDate' | 'toDate']).map((key) => [key, '']));
  const schedule = req.params.id ? await EmployerReportSchedule.findOneAndUpdate({ _id: req.params.id, companyId }, { $set: payload, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { new: true, runValidators: true }) : await EmployerReportSchedule.create({ ...payload, companyId });
  if (!schedule) return res.status(404).json({ message: 'Schedule not found.' });
  res.status(req.params.id ? 200 : 201).json({ schedule: serialize(schedule) });
}
router.patch('/schedules/:id/status', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid schedule status.' });
  const schedule = await EmployerReportSchedule.findOneAndUpdate({ _id: req.params.id, companyId: req.employerContext!.companyId }, { $set: { enabled: parsed.data.enabled } }, { new: true });
  if (!schedule) return res.status(404).json({ message: 'Schedule not found.' }); res.json({ schedule: serialize(schedule) });
});
router.delete('/schedules/:id', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  if (!await EmployerReportSchedule.findOneAndDelete({ _id: req.params.id, companyId: req.employerContext!.companyId })) return res.status(404).json({ message: 'Schedule not found.' }); res.json({ deleted: true });
});
router.post('/schedules/:id/run', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  const schedule = await EmployerReportSchedule.findOne({ _id: req.params.id, companyId: req.employerContext!.companyId });
  if (!schedule) return res.status(404).json({ message: 'Schedule not found.' });
  try { const run = await runReport(schedule.reportId || schedule._id, schedule.companyId, schedule.format, schedule._id, schedule.recipients, scheduledDefinition(schedule)); res.json({ run: serialize(run) }); }
  catch (error) { res.status(400).json({ message: (error as Error).message }); }
});
router.get('/runs', async (req: AuthRequest, res) => { res.json({ runs: (await EmployerReportRun.find({ companyId: req.employerContext!.companyId }).sort({ createdAt: -1 }).limit(100)).map(serialize) }); });
router.get('/runs/:id/download', requirePermission('reports.export'), async (req: AuthRequest, res) => {
  const run = await EmployerReportRun.findOne({ _id: req.params.id, companyId: req.employerContext!.companyId, status: 'completed' }).select('+file');
  if (!run?.file) return res.status(404).json({ message: 'Generated report not found.' });
  res.type(run.contentType || 'application/octet-stream').setHeader('Cache-Control', 'no-store').setHeader('Content-Disposition', `attachment; filename="${run.filename}"`).send(run.file);
});
export default router;

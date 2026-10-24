import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, AuthRequest, requirePermission } from '../middleware/auth';
import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { EmployerReport, EmployerReportRun, EmployerReportSchedule, EmployerReportTemplate } from '../models/EmployerReport';
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

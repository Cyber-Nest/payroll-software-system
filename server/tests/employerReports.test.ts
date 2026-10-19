import express from 'express';
import http from 'http';
import mongoose from 'mongoose';
import routes, { reportDefinitionSchema, reportScheduleSchema } from '../src/routes/employerReportBuilder';
import { EmployerReport, EmployerReportTemplate, EmployerReportRun, EmployerReportSchedule } from '../src/models/EmployerReport';
import { EmployerUser } from '../src/models/EmployerUser';
import { Employee } from '../src/models/Employee';
import { Company } from '../src/models/Company';
import { AccessRole } from '../src/models/AccessRole';
import { PayStatement } from '../src/models/PayStatement';
import { signEmployerToken } from '../src/middleware/auth';
import { buildReport, csvCell, nextReportRun, processReportSchedules, reportDateFilter, reportFields, reportFile, runReport } from '../src/services/employerReports.service';
import { emailService } from '../src/services/email.service';

const companyId = '64b7f8f8f8f8f8f8f8f8f8f1';
const userId = '64b7f8f8f8f8f8f8f8f8f8f2';
const reportId = '64b7f8f8f8f8f8f8f8f8f8f3';
const runId = '64b7f8f8f8f8f8f8f8f8f8f4';
const definition = { name: 'Employee directory', description: '', source: 'employees' as const, fields: ['employeeNumber', 'employeeName'], dateRange: 'all' as const, employeeIds: [] };
const doc = (value: any) => ({ ...value, save: jest.fn().mockResolvedValue(undefined), toObject() { return { ...this }; } });
const query = (value: any) => ({ select() { return this; }, sort() { return this; }, limit: jest.fn().mockResolvedValue(value), then(resolve: (value: any) => unknown) { return Promise.resolve(value).then(resolve); } });

describe('Employer custom and scheduled reports', () => {
  let server: http.Server; let base: string; let role: string; let generated: any;
  beforeAll((done) => {
    const app = express(); app.use(express.json()); app.use('/reports', routes);
    server = app.listen(0, () => { const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test address'); base = `http://127.0.0.1:${address.port}/reports`; done(); });
  });
  afterAll((done) => { server.close(done); });
  beforeEach(() => {
    jest.restoreAllMocks(); role = 'Company Owner';
    jest.spyOn(EmployerUser, 'findOne').mockImplementation((async () => ({ _id: userId, isActive: true, role })) as never);
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue(null);
    jest.spyOn(Company, 'findById').mockResolvedValue({ _id: companyId, legalName: 'Test employer', settings: {} } as never);
    jest.spyOn(Employee, 'find').mockReturnValue(query([{ _id: new mongoose.Types.ObjectId(userId), employeeNumber: 'E001', legalFirstName: 'Jane', legalLastName: 'Sample', startDate: new Date('2025-01-01'), adminProfile: {} }]) as never);
    jest.spyOn(EmployerReport, 'findOne').mockResolvedValue(doc({ ...definition, _id: reportId, companyId: new mongoose.Types.ObjectId(companyId) }) as never);
    jest.spyOn(EmployerReportRun, 'create').mockImplementation((async (value: any) => { generated = doc({ ...value, _id: runId, delivery: 'not_requested' }); return generated; }) as never);
  });
  const request = (path: string, body?: unknown, method = body ? 'POST' : 'GET') => fetch(base + path, { method, headers: { Authorization: `Bearer ${signEmployerToken(userId, companyId)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });

  it('validates fields, date ranges, duplicate fields, and schedule settings', () => {
    for (const fields of [['sin'], ['__proto__'], ['employeeName', 'employeeName']]) expect(reportDefinitionSchema.safeParse({ ...definition, fields }).success).toBe(false);
    expect(reportDefinitionSchema.safeParse({ ...definition, dateRange: 'custom', fromDate: '2026-02-01', toDate: '2026-01-01' }).success).toBe(false);
    expect(reportScheduleSchema.safeParse({ name: 'Schedule', reportId, nextRunAt: 'invalid', frequency: 'daily', format: 'csv' }).success).toBe(false);
    expect(reportDefinitionSchema.safeParse({ ...definition, fieldLabels: { employeeName: 'Staff Member' } }).success).toBe(true);
    expect(reportDefinitionSchema.safeParse({ ...definition, fieldLabels: { grossPay: 'Invalid source field' } }).success).toBe(false);
    expect(reportDefinitionSchema.safeParse({ ...definition, fieldLabels: { employeeName: '' } }).success).toBe(false);
    expect(reportDefinitionSchema.safeParse({ ...definition, fieldLabels: { employeeName: 'a'.repeat(61) } }).success).toBe(false);
  });
  it('accepts the complete unique catalog without a data source and combines profile, payroll and tax values', async () => {
    const fields = Object.keys(reportFields.custom);
    expect(fields.length).toBeGreaterThan(7);
    const parsed = reportDefinitionSchema.safeParse({ ...definition, source: undefined, fields });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.source).toBe('custom');
    const amount = (value: string) => mongoose.Types.Decimal128.fromString(value);
    jest.spyOn(PayStatement, 'find').mockReturnValue(query([{ employeeId: new mongoose.Types.ObjectId(userId), payDate: new Date('2026-01-15'), grossPay: amount('100'), grossEarnings: [{ code: 'REG', description: 'Regular', amount: amount('100'), currentUnits: '5', rate: '20' }], netPay: amount('85'), regularHours: 5, deductions: [{ code: 'FTAX', description: 'Federal tax', amount: amount('15') }, { code: 'TOTAL', description: 'Total', amount: amount('15') }] }]) as never);
    const result = await buildReport({ ...parsed.data, companyId: new mongoose.Types.ObjectId(companyId), employeeIds: [] });
    expect(result.columns.map((column) => column.key)).toEqual(fields);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ employeeName: 'Jane Sample', grossPay: 100, federalTax: 15, hours: 5, earningCode: 'REG', code: 'FTAX', amount: 15, earningAmount: 100 });
    expect(result.columns.every((column) => Boolean(column.label))).toBe(true);
  });
  it('preserves chosen column order and custom headings in report previews and exports', async () => {
    const result = await buildReport({ ...definition, companyId: new mongoose.Types.ObjectId(companyId), fields: ['employeeName', 'employeeNumber'], employeeIds: [], fieldLabels: { employeeName: 'Staff Member' } });
    expect(result.columns).toEqual([{ key: 'employeeName', label: 'Staff Member' }, { key: 'employeeNumber', label: 'Employee ID' }]);
    expect(result.rows[0].employeeName).toBe('Jane Sample');
    const csv = reportFile('Directory', 'csv', result.columns, result.rows, 'Test employer').file.toString();
    expect(csv).toContain('"Staff Member","Employee ID"');
    expect(csv).toContain('"Jane Sample","E001"');
  });
  it('creates and updates definitions with the employer scope enforced', async () => {
    const create = jest.spyOn(EmployerReport, 'create').mockResolvedValue(doc({ ...definition, _id: reportId }) as never);
    expect((await request('/definitions', { ...definition, companyId: userId })).status).toBe(201);
    expect(create).toHaveBeenCalledWith({ ...definition, companyId });
    const update = jest.spyOn(EmployerReport, 'findOneAndUpdate').mockResolvedValue(doc({ ...definition, _id: reportId }) as never);
    expect((await request('/definitions/' + reportId, definition, 'PUT')).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ _id: reportId, companyId }, expect.anything(), expect.anything());
    update.mockResolvedValue(null);
    expect((await request('/definitions/' + reportId, definition, 'PUT')).status).toBe(404);
  });
  it('saves and deletes templates with employer ownership and permissions enforced', async () => {
    const create = jest.spyOn(EmployerReportTemplate, 'create').mockResolvedValue(doc({ ...definition, _id: reportId }) as never);
    expect((await request('/templates', { ...definition, companyId: userId })).status).toBe(201);
    expect(create).toHaveBeenCalledWith({ ...definition, companyId });
    const find = jest.spyOn(EmployerReportTemplate, 'find').mockReturnValue(query([doc({ ...definition, _id: reportId })]) as never);
    expect((await request('/templates')).status).toBe(200);
    expect(find).toHaveBeenCalledWith({ companyId });
    const update = jest.spyOn(EmployerReportTemplate, 'findOneAndUpdate').mockResolvedValue(doc({ ...definition, _id: reportId }) as never);
    expect((await request('/templates/' + reportId, definition, 'PUT')).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ _id: reportId, companyId }, expect.anything(), expect.anything());
    update.mockResolvedValue(null);
    expect((await request('/templates/' + reportId, definition, 'PUT')).status).toBe(404);
    const remove = jest.spyOn(EmployerReportTemplate, 'findOneAndDelete').mockResolvedValue(doc({ _id: reportId }) as never);
    expect((await request('/templates/' + reportId, undefined, 'DELETE')).status).toBe(200);
    expect(remove).toHaveBeenCalledWith({ _id: reportId, companyId });
    remove.mockResolvedValue(null);
    expect((await request('/templates/' + reportId, undefined, 'DELETE')).status).toBe(404);
    expect((await request('/templates', { ...definition, fields: ['sin'] })).status).toBe(400);
    jest.spyOn(Employee, 'countDocuments').mockResolvedValue(0);
    expect((await request('/templates', { ...definition, employeeIds: [userId] })).status).toBe(400);
    role = 'Manager';
    expect((await request('/templates', definition)).status).toBe(403);
    expect((await request('/templates/' + reportId, undefined, 'DELETE')).status).toBe(403);
  });
  it('previews company data and creates downloadable snapshots', async () => {
    const preview = await request('/preview', definition);
    expect(preview.status).toBe(200); expect((await preview.json() as any).rows[0].employeeName).toBe('Jane Sample');
    const response = await request(`/definitions/${reportId}/run`, { format: 'csv' });
    expect(response.status).toBe(200); expect(generated.status).toBe('completed');
    expect(generated.file.toString()).toContain('Jane Sample');
    const find = jest.spyOn(EmployerReportRun, 'findOne').mockReturnValue({ select: jest.fn().mockResolvedValue(generated) } as never);
    const download = await request(`/runs/${runId}/download`);
    expect(download.headers.get('content-disposition')).toContain('attachment');
    expect(await download.text()).toContain('Jane Sample');
    for (const format of ['pdf', 'excel', 'csv']) {
      const exported = await request(`/runs/${runId}/download?format=${format}`);
      expect(exported.status).toBe(200);
      const content = await exported.text();
      expect(content).toContain('Jane Sample');
      if (format === 'pdf') { expect(content).toContain('%PDF'); expect(content).toContain('Payhours'); }
    }
    expect((await request(`/runs/${runId}/download?format=invalid`)).status).toBe(400);
    generated.snapshot = undefined;
    expect((await request(`/runs/${runId}/download?format=pdf`)).status).toBe(409);
    expect(find).toHaveBeenCalledWith({ _id: runId, companyId, status: 'completed' });
  });
  it('allows a scheduled run format override without changing the saved schedule', async () => {
    const schedule = doc({ _id: runId, companyId: new mongoose.Types.ObjectId(companyId), reportId, format: 'csv', recipients: [] });
    jest.spyOn(EmployerReportSchedule, 'findOne').mockResolvedValue(schedule as never);
    expect((await request(`/schedules/${runId}/run`, { format: 'pdf' })).status).toBe(200);
    expect(generated.format).toBe('pdf');
    expect(generated.file.toString()).toContain('Payhours');
    expect(schedule.format).toBe('csv');
    expect((await request(`/schedules/${runId}/run`, { format: 'invalid' })).status).toBe(400);
  });
  it('rejects employees outside the employer and read-only users', async () => {
    jest.spyOn(Employee, 'countDocuments').mockResolvedValue(0);
    expect((await request('/definitions', { ...definition, employeeIds: [userId] })).status).toBe(400);
    role = 'Manager';
    expect((await request('/definitions', definition)).status).toBe(403);
  });
  it('blocks deleting reports with schedules and scopes schedule edits to the employer', async () => {
    jest.spyOn(EmployerReportSchedule, 'exists').mockResolvedValue({ _id: runId } as never);
    expect((await request('/definitions/' + reportId, undefined, 'DELETE')).status).toBe(409);
    const update = jest.spyOn(EmployerReportSchedule, 'findOneAndUpdate').mockResolvedValue(null);
    expect((await request(`/schedules/${runId}/status`, { enabled: false }, 'PATCH')).status).toBe(404);
    expect(update).toHaveBeenCalledWith({ _id: runId, companyId }, { $set: { enabled: false } }, { new: true });
  });
  it('creates schedules for owned reports and rejects past start times', async () => {
    jest.spyOn(EmployerReport, 'exists').mockResolvedValue({ _id: reportId } as never);
    const create = jest.spyOn(EmployerReportSchedule, 'create').mockImplementation((async (data: any) => doc({ ...data, _id: runId })) as never);
    const schedule = { name: 'Monthly directory', reportId, nextRunAt: new Date(Date.now() + 86400000).toISOString(), frequency: 'monthly', format: 'csv', recipients: [] };
    expect((await request('/schedules', schedule)).status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ companyId, createdBy: userId, reportId }));
    expect((await request('/schedules', { ...schedule, nextRunAt: '2000-01-01T00:00:00Z' })).status).toBe(400);
  });
  it('retains a downloadable report when email delivery fails', async () => {
    jest.spyOn(emailService, 'send').mockRejectedValue(new Error('SMTP unavailable'));
    const result = await runReport(reportId, companyId, 'csv', runId, ['reports@example.com']);
    expect(result.status).toBe('completed'); expect(result.delivery).toBe('failed'); expect(result.deliveryError).toBe('SMTP unavailable'); expect(result.file).toBeInstanceOf(Buffer);
  });
  it('saves each built-in report type with a monthly day and inclusive end date', async () => {
    const create = jest.spyOn(EmployerReportSchedule, 'create').mockImplementation((async (data: any) => doc({ ...data, _id: runId })) as never);
    const exists = jest.spyOn(EmployerReport, 'exists');
    const settings = { name: 'Monthly report', frequency: 'monthly', format: 'csv', anchorDay: 31, nextRunAt: '2096-02-01T09:30:00Z', untilDate: '2096-12-31', dateRange: 'last30' };
    for (const reportType of ['employee', 'payroll', 'tax', 'deductions']) {
      expect((await request('/schedules', { ...settings, reportType })).status).toBe(201);
    }
    expect(exists).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ anchorDay: 31, nextRunAt: new Date('2096-02-29T09:30:00Z'), untilDate: '2096-12-31' }));
    for (const invalid of [{ anchorDay: 32 }, { anchorDay: 0 }, { untilDate: '2096-01-01' }, { dateRange: 'custom', fromDate: '2096-03-01', toDate: '2096-02-01' }]) {
      expect((await request('/schedules', { ...settings, reportType: 'tax', ...invalid })).status).toBe(400);
    }
  });
  it('disables expired schedules without generating a report', async () => {
    const schedule = doc({ _id: runId, companyId, reportType: 'employee', untilDate: '2000-01-31', nextRunAt: new Date('2000-01-31'), leaseUntil: new Date(), frequency: 'monthly' });
    jest.spyOn(EmployerReportSchedule, 'findOneAndUpdate').mockResolvedValueOnce(schedule as never).mockResolvedValue(null);
    const update = jest.spyOn(EmployerReportSchedule, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    await processReportSchedules();
    expect(update).toHaveBeenCalledWith(expect.anything(), { $set: { enabled: false }, $unset: { leaseUntil: '' } });
    expect(EmployerReportRun.create).not.toHaveBeenCalled();
  });
  it('generates the final employee report on the until date and disables future runs', async () => {
    const now = new Date();
    const schedule = doc({ _id: runId, companyId: new mongoose.Types.ObjectId(companyId), createdBy: userId, reportType: 'employee', name: 'Monthly employees', dateRange: 'all', untilDate: now.toISOString().slice(0, 10), nextRunAt: new Date(now.getTime() - 60000), anchorDay: now.getUTCDate(), leaseUntil: new Date(now.getTime() + 600000), frequency: 'monthly', format: 'csv', recipients: [] });
    jest.spyOn(EmployerReportSchedule, 'findOneAndUpdate').mockResolvedValueOnce(schedule as never).mockResolvedValue(null);
    const update = jest.spyOn(EmployerReportSchedule, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    await processReportSchedules();
    expect(generated.status).toBe('completed');
    expect(generated.file.toString()).toContain('Jane Sample');
    expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $set: expect.objectContaining({ enabled: false }) }));
  });
  it('filters payroll by pay date and excludes total rows from deduction detail', async () => {
    const amount = (value: string) => mongoose.Types.Decimal128.fromString(value);
    const find = jest.spyOn(PayStatement, 'find').mockReturnValue(query([{ employeeId: new mongoose.Types.ObjectId(userId), payDate: new Date('2026-01-15'), grossPay: amount('100.00'), grossEarnings: [], netPay: amount('99.70'), deductions: [{ code: 'CPP', description: 'CPP', amount: amount('0.10') }, { code: 'EI', description: 'EI', amount: amount('0.20') }, { code: 'TOTAL', description: 'Total', amount: amount('0.30') }] }]) as never);
    const definitionWithScope = { ...definition, companyId: new mongoose.Types.ObjectId(companyId), source: 'payroll' as const, fields: ['grossPay', 'deductions'], dateRange: 'custom' as const, fromDate: '2026-01-01', toDate: '2026-01-31' };
    const payroll = await buildReport(definitionWithScope);
    expect(payroll.rows[0].deductions).toBe(0.3); expect(payroll.rows[0].employeeName).toBe('Jane Sample');
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ companyId: definitionWithScope.companyId, payDate: { $gte: new Date('2026-01-01T00:00:00.000Z'), $lte: new Date('2026-01-31T23:59:59.999Z') } }));
    const deductions = await buildReport({ ...definitionWithScope, source: 'deductions', fields: ['code', 'amount'] });
    expect(deductions.rows.map((row) => row.code)).toEqual(['CPP', 'EI']);
  });
  it('records generation failures and denies scheduled exports after access is revoked', async () => {
    jest.spyOn(Employee, 'find').mockImplementation(() => { throw new Error('Source unavailable'); });
    await expect(runReport(reportId, companyId, 'csv')).rejects.toThrow('Source unavailable');
    expect(generated.status).toBe('failed'); expect(generated.error).toBe('Source unavailable');
    role = 'Manager';
    const schedule = doc({ _id: runId, companyId, reportId, createdBy: userId, name: 'Daily directory', nextRunAt: new Date(Date.now() - 3600000), anchorDay: 1, frequency: 'daily', format: 'csv', recipients: [] });
    jest.spyOn(EmployerReportSchedule, 'findOneAndUpdate').mockResolvedValueOnce(schedule as never).mockResolvedValue(null);
    jest.spyOn(EmployerReportSchedule, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    await processReportSchedules();
    expect(generated.status).toBe('failed'); expect(generated.error).toContain('no longer has report export permission');
  });
  it('claims due schedules, generates their reports, and advances the next run', async () => {
    const due = new Date(Date.now() - 3600000);
    const schedule = doc({ _id: runId, companyId: new mongoose.Types.ObjectId(companyId), reportId: new mongoose.Types.ObjectId(reportId), createdBy: new mongoose.Types.ObjectId(userId), name: 'Daily directory', nextRunAt: due, anchorDay: due.getUTCDate(), leaseUntil: new Date(Date.now() + 600000), frequency: 'daily', format: 'csv', recipients: [] });
    const claim = jest.spyOn(EmployerReportSchedule, 'findOneAndUpdate').mockResolvedValueOnce(schedule as never).mockResolvedValue(null);
    const update = jest.spyOn(EmployerReportSchedule, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    await processReportSchedules();
    expect(claim).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, nextRunAt: { $lte: expect.any(Date) } }), expect.anything(), { new: true });
    expect(generated.status).toBe('completed');
    const payload = (update.mock.calls[0][1] as any).$set;
    expect(payload.nextRunAt.getTime()).toBeGreaterThan(Date.now()); expect(payload.lastError).toBe('');
  });
});

describe('Report dates and exports', () => {
  it('uses UTC rolling date ranges and correctly handles leap years and month-end schedules', () => {
    const filter = reportDateFilter({ dateRange: 'last30' }, new Date('2026-03-01T12:00:00Z'))!;
    expect(filter.$gte.toISOString()).toBe('2026-01-31T00:00:00.000Z');
    const next = nextReportRun({ nextRunAt: new Date('2024-01-31T08:00:00Z'), frequency: 'monthly', anchorDay: 31 }, new Date('2024-02-01'));
    expect(next.toISOString()).toBe('2024-02-29T08:00:00.000Z');
    expect(nextReportRun({ nextRunAt: next, frequency: 'monthly', anchorDay: 31 }, new Date('2024-03-01')).toISOString()).toBe('2024-03-31T08:00:00.000Z');
  });
  it('escapes spreadsheet formulas and generates CSV, Excel, and paginated PDF files', () => {
    expect(csvCell('=SUM(A1)')).toBe('"\'=SUM(A1)"');
    expect(csvCell(-12)).toBe('"-12"');
    const columns = [{ key: 'name', label: 'Employee' }]; const rows = Array.from({ length: 25 }, (_, index) => ({ name: `Employee ${index}` }));
    expect(reportFile('Directory', 'csv', columns, rows, 'Company').file.toString()).toContain('Employee 24');
    expect(reportFile('Directory', 'excel', columns, [{ name: '<script>' }], 'Company').file.toString()).toContain('&lt;script&gt;');
    const pdf = reportFile('Directory', 'pdf', columns, rows, 'Company').file.toString();
    expect(pdf).toContain('%PDF-1.4'); expect((pdf.match(/\/Type \/Page\b/g) || []).length).toBe(2);
  });
});

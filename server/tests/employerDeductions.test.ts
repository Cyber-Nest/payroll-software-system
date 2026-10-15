import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import routes, { employerDeductionSchema } from '../src/routes/employerDeductions';
import { EmployerUser } from '../src/models/EmployerUser';
import { Employee } from '../src/models/Employee';
import { AccessRole } from '../src/models/AccessRole';
import { DeductionType, IDeductionType } from '../src/models/DeductionType';
import { AuditLog } from '../src/models/AuditLog';
import { signEmployerToken } from '../src/middleware/auth';
import { applicableCustomDeductions } from '../src/services/customDeductions.service';

const companyId = '64b7f8f8f8f8f8f8f8f8f8f1';
const employeeId = '64b7f8f8f8f8f8f8f8f8f8f2';
const deductionId = '64b7f8f8f8f8f8f8f8f8f8f3';
const fields = { code: 'HEALTH', name: 'Health plan', description: '', calculationMethod: 'fixed', value: 25, employeeScope: 'all', employeeIds: [], effectivePayDate: '2026-11-01', status: 'active' };
const rule = (changes: Partial<IDeductionType> = {}) => ({ ...fields, kind: 'custom', provinces: [], mandatory: false, ...changes }) as unknown as IDeductionType;

describe('Employer deduction setup', () => {
  let server: http.Server;
  let base: string;
  beforeAll((done) => {
    const app = express(); app.use(express.json()); app.use('/deductions', routes);
    server = app.listen(0, () => {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test address');
      base = `http://127.0.0.1:${address.port}/deductions`; done();
    });
  });
  afterAll((done) => { server.close(done); });
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(EmployerUser, 'findOne').mockResolvedValue({ _id: employeeId, role: 'Company Owner', isActive: true } as never);
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue(null);
    jest.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
  });
  const request = (path: string, body: unknown, method = 'POST') => fetch(base + path, { method,
    headers: { Authorization: `Bearer ${signEmployerToken(employeeId, companyId)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  it('creates an all-employee deduction and stores its applicable pay date', async () => {
    const create = jest.spyOn(DeductionType, 'create').mockImplementation(async (payload: any) => ({ ...payload, _id: deductionId }) as never);
    const response = await request('', { ...fields, employeeIds: [employeeId] });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ employerId: companyId, employeeScope: 'all', employeeIds: [], effectivePayDate: '2026-11-01' }));
  });
  it('validates selected employees against the current employer', async () => {
    jest.spyOn(Employee, 'countDocuments').mockResolvedValue(0);
    expect((await request('', { ...fields, employeeScope: 'selected', employeeIds: [employeeId] })).status).toBe(400);
    expect(Employee.countDocuments).toHaveBeenCalledWith({ companyId, _id: { $in: [employeeId] } });
  });
  it('edits only the current employer’s custom deductions', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const find = jest.spyOn(DeductionType, 'findOne').mockResolvedValue({ ...rule(), _id: deductionId, save } as never);
    const response = await request('/' + deductionId, { ...fields, value: 30 }, 'PATCH');
    expect(response.status).toBe(200); expect(save).toHaveBeenCalled();
    expect(find).toHaveBeenCalledWith({ _id: deductionId, employerId: companyId, kind: 'custom' });
    find.mockResolvedValue(null);
    expect((await request('/' + deductionId, fields, 'PATCH')).status).toBe(404);
  });
  it('rejects missing employee choices, invalid dates, percentages and statutory codes', async () => {
    expect(employerDeductionSchema.safeParse({ ...fields, employeeScope: 'selected' }).success).toBe(false);
    expect(employerDeductionSchema.safeParse({ ...fields, effectivePayDate: '2026-02-30' }).success).toBe(false);
    expect(employerDeductionSchema.safeParse({ ...fields, calculationMethod: 'percentage', value: 101 }).success).toBe(false);
    expect((await request('', { ...fields, code: 'CPP' })).status).toBe(400);
  });
  it('returns a clear error for duplicate deduction codes', async () => {
    jest.spyOn(DeductionType, 'create').mockRejectedValue({ code: 11000 });
    expect((await request('', fields)).status).toBe(409);
  });
});

describe('Deduction eligibility and amounts', () => {
  it('starts on the chosen pay date and continues for later pay dates', () => {
    const rules = [rule()];
    expect(applicableCustomDeductions(rules, employeeId, new Date('2026-10-31'), 1000, 'AB', 'biweekly')).toHaveLength(0);
    for (const date of ['2026-11-01', '2026-11-15']) {
      expect(applicableCustomDeductions(rules, employeeId, new Date(date), 1000, 'AB', 'biweekly')[0].amount.toString()).toBe('25.00');
    }
  });
  it('applies to selected employees only and calculates percentages of gross pay', () => {
    const rules = [rule({ employeeScope: 'selected', employeeIds: [new mongoose.Types.ObjectId(employeeId)], calculationMethod: 'percentage', value: mongoose.Types.Decimal128.fromString('2.5') })];
    expect(applicableCustomDeductions(rules, employeeId, new Date('2026-11-01'), 1000, 'AB', 'biweekly')[0].amount.toString()).toBe('25.00');
    expect(applicableCustomDeductions(rules, deductionId, new Date('2026-11-01'), 1000, 'AB', 'biweekly')).toHaveLength(0);
  });
  it('excludes inactive rules and respects existing eligibility filters', () => {
    expect(applicableCustomDeductions([rule({ status: 'inactive' }), rule({ effectivePayDate: undefined }), rule({ provinces: ['ON'] }), rule({ payFrequency: 'weekly' })], employeeId, new Date('2026-11-01'), 1000, 'AB', 'biweekly')).toHaveLength(0);
  });
});

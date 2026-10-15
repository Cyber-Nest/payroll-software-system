import http from 'http';
import express from 'express';
import routes from '../src/routes/employerBenefits';
import { Employee } from '../src/models/Employee';
import { EmployerUser } from '../src/models/EmployerUser';
import { AccessRole } from '../src/models/AccessRole';
import { EmployerBenefit } from '../src/models/EmployerBenefit';
import { AuditLog } from '../src/models/AuditLog';
import { signEmployerToken } from '../src/middleware/auth';
import { employeeBenefitRows, hasBenefit } from '../src/services/employerBenefits.service';

const companyId = '64b7f8f8f8f8f8f8f8f8f8f1';
const employeeId = '64b7f8f8f8f8f8f8f8f8f8f2';
const benefitId = '64b7f8f8f8f8f8f8f8f8f8f3';
const draft = { name: 'Dental coverage', type: 'Health', coverageOrValue: 'Family coverage', description: '', employeeScope: 'all', employeeIds: [], applicableFrom: '2026-11-01', status: 'active' };

describe('Employer benefits', () => {
  let server: http.Server;
  let base: string;
  beforeAll((done) => {
    const app = express(); app.use(express.json()); app.use('/benefits', routes);
    server = app.listen(0, () => {
      const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test address');
      base = `http://127.0.0.1:${address.port}/benefits`; done();
    });
  });
  afterAll((done) => { server.close(done); });
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(EmployerUser, 'findOne').mockResolvedValue({ _id: employeeId, role: 'Company Owner', isActive: true } as never);
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue(null);
    jest.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
  });
  const request = (path = '', body?: unknown, method = body ? 'POST' : 'GET') => fetch(base + path, {
    method, headers: { Authorization: `Bearer ${signEmployerToken(employeeId, companyId)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {})
  });
  it('returns no benefits when plans and real enrollments do not exist', async () => {
    const find = jest.spyOn(EmployerBenefit, 'find').mockReturnValue({ sort: jest.fn().mockResolvedValue([]) } as never);
    jest.spyOn(Employee, 'find').mockReturnValue({ select: jest.fn().mockReturnValue({ sort: jest.fn().mockResolvedValue([{ _id: employeeId, legalFirstName: 'Jane', legalLastName: 'Sample', adminProfile: { benefits: { dentalCare: 'Not Enrolled', parking: false, rrspContribution: '0' } } }]) }) } as never);
    const response = await request();
    expect((await response.json() as any).benefits).toEqual([]);
    expect(find).toHaveBeenCalledWith({ companyId });
  });
  it('creates a benefit for all employees with a starting date', async () => {
    const create = jest.spyOn(EmployerBenefit, 'create').mockImplementation(async (data: any) => ({ ...data, _id: benefitId }) as never);
    const response = await request('', { ...draft, employeeIds: [employeeId] });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith({ ...draft, employeeIds: [], companyId });
    expect((await response.json() as any).benefit.applicableFrom).toBe('2026-11-01');
  });
  it('validates selected employees and dates before saving', async () => {
    expect((await request('', { ...draft, employeeScope: 'selected' })).status).toBe(400);
    expect((await request('', { ...draft, applicableFrom: '2026-02-30' })).status).toBe(400);
    expect((await request('', { ...draft, coverageOrValue: 'Not enrolled' })).status).toBe(400);
    const count = jest.spyOn(Employee, 'countDocuments').mockResolvedValue(0);
    expect((await request('', { ...draft, employeeScope: 'selected', employeeIds: [employeeId] })).status).toBe(400);
    expect(count).toHaveBeenCalledWith({ companyId, _id: { $in: [employeeId] } });
  });
  it('edits only a benefit owned by the current employer', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const item = { ...draft, _id: benefitId, save };
    const find = jest.spyOn(EmployerBenefit, 'findOne').mockResolvedValue(item as never);
    expect((await request('/' + benefitId, { ...draft, coverageOrValue: '$500 annually' }, 'PATCH')).status).toBe(200);
    expect(find).toHaveBeenCalledWith({ _id: benefitId, companyId });
    expect(save).toHaveBeenCalled(); expect(item.coverageOrValue).toBe('$500 annually');
    find.mockResolvedValue(null);
    expect((await request('/' + benefitId, draft, 'PATCH')).status).toBe(404);
  });
  it('edits an existing employee enrollment without overwriting other benefits', async () => {
    jest.spyOn(Employee, 'countDocuments').mockResolvedValue(1);
    const employee = { _id: employeeId, adminProfile: { benefits: { dentalCare: 'Single', parking: 'Included' } }, markModified: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(Employee, 'findOne').mockResolvedValue(employee as never);
    const response = await request(`/legacy:${employeeId}:dentalCare`, { ...draft, employeeScope: 'selected', employeeIds: [employeeId] }, 'PATCH');
    expect(response.status).toBe(200);
    expect(employee.adminProfile.benefits.dentalCare).toBe('Family coverage');
    expect(employee.adminProfile.benefits.parking).toBe('Included');
    expect((await response.json() as any).benefit.applicableFrom).toBe('2026-11-01');
    expect(employee.save).toHaveBeenCalled();
  });
  it('deletes plans only within the current employer', async () => {
    const remove = jest.spyOn(EmployerBenefit, 'findOneAndDelete').mockResolvedValue({ name: draft.name } as never);
    expect((await request('/' + benefitId, undefined, 'DELETE')).status).toBe(200);
    expect(remove).toHaveBeenCalledWith({ _id: benefitId, companyId });
    remove.mockResolvedValue(null);
    expect((await request('/' + benefitId, undefined, 'DELETE')).status).toBe(404);
    expect((await request('/invalid', undefined, 'DELETE')).status).toBe(400);
  });
  it('removes only the selected employee benefit and its metadata', async () => {
    jest.spyOn(Employee, 'findOne').mockResolvedValue({ _id: employeeId, adminProfile: { benefits: { dentalCare: 'Single', parking: 'Included' } } } as never);
    const update = jest.spyOn(Employee, 'updateOne').mockResolvedValue({ matchedCount: 1 } as never);
    expect((await request(`/legacy:${employeeId}:dentalCare`, undefined, 'DELETE')).status).toBe(200);
    expect(update).toHaveBeenCalledWith({ _id: employeeId, companyId }, { $unset: {
      'adminProfile.benefits.dentalCare': '', 'adminProfile.benefits.benefitDetails.dentalCare': ''
    } });
    jest.spyOn(Employee, 'findOne').mockResolvedValue(null);
    expect((await request(`/legacy:${employeeId}:dentalCare`, undefined, 'DELETE')).status).toBe(404);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('Benefit presence', () => {
  it.each([undefined, null, '', ' ', false, 0, '0', '0.00', 'No', 'none', 'Not Enrolled', 'N/A'])('does not treat %s as an enrollment', (value) => {
    expect(hasBenefit(value)).toBe(false);
  });
  it('returns meaningful enrollments with their saved metadata only', () => {
    const employee = { _id: employeeId, adminProfile: { benefits: { dentalCare: 'Family', parking: 'No', benefitDetails: { dentalCare: { name: 'Dental plan', applicableFrom: '2026-11-01', status: 'inactive' } } } } };
    const rows = employeeBenefitRows([employee as never]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Dental plan', applicableFrom: '2026-11-01', status: 'inactive', employeeIds: [employeeId] });
  });
});

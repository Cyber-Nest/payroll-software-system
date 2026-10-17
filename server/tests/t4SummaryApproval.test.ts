import express from 'express';
import http from 'http';
import routes, { t4ApprovalSchema } from '../src/routes/employer';
import { Company } from '../src/models/Company';
import { EmployerUser } from '../src/models/EmployerUser';
import { AccessRole } from '../src/models/AccessRole';
import { signEmployerToken } from '../src/middleware/auth';

const companyId = '64b7f8f8f8f8f8f8f8f8f8f1';
const userId = '64b7f8f8f8f8f8f8f8f8f8f2';
describe('T4 summary approval details', () => {
  let server: http.Server; let base: string;
  beforeAll((done) => {
    const app = express(); app.use(express.json()); app.use('/employer', routes);
    server = app.listen(0, () => { const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing address'); base = `http://127.0.0.1:${address.port}/employer`; done(); });
  });
  afterAll((done) => { server.close(done); });
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(EmployerUser, 'findOne').mockResolvedValue({ _id: userId, role: 'Company Owner', isActive: true } as never);
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue(null);
    jest.spyOn(Company, 'findById').mockResolvedValue({ _id: companyId, settings: {} } as never);
  });
  const request = (body: unknown, year = '2025') => fetch(`${base}/reports/t4-summary/approval/${year}`, { method: 'PUT', headers: { Authorization: `Bearer ${signEmployerToken(userId, companyId)}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  it('defaults to blanks and validates dates', () => {
    expect(t4ApprovalSchema.parse({})).toEqual({ submissionNumber: '', receivedDate: '', processedDate: '' });
    expect(t4ApprovalSchema.safeParse({ receivedDate: '2026-02-30' }).success).toBe(false);
  });
  it('requires processing strictly after receipt and allows blank processing dates', () => {
    expect(t4ApprovalSchema.safeParse({ receivedDate: '2026-02-03', processedDate: '2026-02-03' }).success).toBe(false);
    expect(t4ApprovalSchema.safeParse({ receivedDate: '2026-02-03', processedDate: '2026-02-04' }).success).toBe(true);
    expect(t4ApprovalSchema.safeParse({ receivedDate: '2026-02-03' }).success).toBe(true);
    expect(t4ApprovalSchema.safeParse({ processedDate: '2026-02-03' }).success).toBe(false);
  });
  it('rejects processing before receipt without saving', async () => {
    const update = jest.spyOn(Company, 'findByIdAndUpdate').mockResolvedValue({ _id: companyId } as never);
    const response = await request({ receivedDate: '2026-03-01', processedDate: '2026-02-28' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: 'Processed date should be after received date only.' });
    expect(update).not.toHaveBeenCalled();
  });
  it('loads employee role choices from current company settings and excludes inactive roles', async () => {
    jest.spyOn(Company, 'findById').mockResolvedValue({ _id: companyId, settings: { usersRoles: { customRoles: [{ id: 'custom-active', name: 'Team Lead', status: 'Active' }, { id: 'custom-inactive', name: 'Retired Role', status: 'Inactive' }], deletedRoleIds: ['Manager'] } } } as never);
    const response = await fetch(`${base}/employee-role-options`, { headers: { Authorization: `Bearer ${signEmployerToken(userId, companyId)}` } });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const result = await response.json() as { roles: Array<{ id: string; name: string }> };
    expect(result.roles).toContainEqual({ id: 'custom-active', name: 'Team Lead' });
    expect(result.roles.some((role) => role.id === 'Manager' || role.id === 'custom-inactive')).toBe(false);
  });
  it('saves and clears values for the authenticated employer and selected year', async () => {
    const update = jest.spyOn(Company, 'findByIdAndUpdate').mockResolvedValue({ _id: companyId } as never);
    const approval = { submissionNumber: 'CRA-123', receivedDate: '2026-02-01', processedDate: '2026-02-03' };
    const response = await request(approval);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ approval });
    expect(update).toHaveBeenCalledWith(companyId, { $set: { 'settings.t4SummaryApprovals.2025': approval } }, { new: true });
    expect((await request({})).status).toBe(200);
    expect(update).toHaveBeenLastCalledWith(companyId, { $set: { 'settings.t4SummaryApprovals.2025': t4ApprovalSchema.parse({}) } }, { new: true });
    expect((await request(approval, '2025.bad')).status).toBe(400);
  });
  it('denies saving to users without report export permission', async () => {
    jest.spyOn(EmployerUser, 'findOne').mockResolvedValue({ _id: userId, role: 'Manager', isActive: true } as never);
    expect((await request({})).status).toBe(403);
  });
});

import { authenticate, AuthRequest, signSuperAdminToken } from '../src/middleware/auth';
import { SuperAdmin } from '../src/models/SuperAdmin';
import { AccessRole } from '../src/models/AccessRole';
import { Response } from 'express';

const id = '64b7f8f8f8f8f8f8f8f8f8f5';
describe('Super admin staff access', () => {
  afterEach(() => jest.restoreAllMocks());
  async function check(path: string, sections: string[], method = 'GET', body = {}) {
    jest.spyOn(SuperAdmin, 'findOne').mockResolvedValue({ staffOwnerId: id, role: 'Platform Employee', sectionPermissions: sections } as never);
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue(null);
    const req = { headers: { authorization: `Bearer ${signSuperAdminToken(id)}` }, query: {}, originalUrl: path, method, body } as AuthRequest;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await authenticate(req, res as unknown as Response, next);
    return { res, next };
  }
  it('allows an assigned section', async () => {
    expect((await check('/api/super-admin/notifications', ['Notifications'])).next).toHaveBeenCalled();
  });
  it('denies an unchecked section', async () => {
    expect((await check('/api/super-admin/employers', ['Notifications'])).res.status).toHaveBeenCalledWith(403);
  });
  it('allows session discovery without any permissions', async () => {
    expect((await check('/api/super-admin/session', [])).next).toHaveBeenCalled();
  });
  it('denies employer portal access', async () => {
    expect((await check('/api/employer/employees', ['Employees'])).res.status).toHaveBeenCalledWith(403);
  });
  it('prevents privilege escalation through platform roles', async () => {
    expect((await check('/api/super-admin/access/users', ['Users & Access'], 'POST')).res.status).toHaveBeenCalledWith(403);
  });
  it('prevents granting sections outside own access', async () => {
    expect((await check('/api/super-admin/employees', ['Employees'], 'POST', { sections: ['Employers'] })).res.status).toHaveBeenCalledWith(403);
  });
  it('checks banking separately from account list access', async () => {
    expect((await check('/api/super-admin/payroll-accounts/123/banking', ['All Payroll Accounts'], 'PATCH')).res.status).toHaveBeenCalledWith(403);
  });
});

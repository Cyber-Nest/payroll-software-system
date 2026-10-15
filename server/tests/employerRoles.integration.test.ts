import http from 'http';
import express from 'express';
import routes from '../src/routes/employerRoles';
import { authenticate, requirePermission, signEmployerToken } from '../src/middleware/auth';
import { EmployerUser } from '../src/models/EmployerUser';
import { Company } from '../src/models/Company';
import { AccessRole } from '../src/models/AccessRole';
import { AuditLog } from '../src/models/AuditLog';
import { employerRoles, employerPermissionOverride } from '../src/services/employerRoles.service';

const companyId = '64b7f8f8f8f8f8f8f8f8f8f1';
const userId = '64b7f8f8f8f8f8f8f8f8f8f2';
const draft = { name: 'Manager', fullForm: 'Operations Manager', description: 'Updated manager role', status: 'Active', permissions: ['employee.view', 'reports.view'] };

describe('Employer role actions', () => {
  let server: http.Server;
  let base: string;
  let company: { _id: string; settings: Record<string, any>; save: jest.Mock };
  let users: Array<{ role: string }>;
  let actorRole: string;
  beforeAll((done) => {
    const app = express();
    app.use(express.json()); app.use('/roles', routes);
    app.get('/can-edit', authenticate, requirePermission('employee.edit'), (_req, res) => { res.json({ allowed: true }); });
    server = app.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test address');
      base = `http://127.0.0.1:${address.port}`; done();
    });
  });
  afterAll((done) => { server.close(done); });
  beforeEach(() => {
    jest.restoreAllMocks();
    company = { _id: companyId, settings: {}, save: jest.fn().mockResolvedValue(undefined) };
    users = [{ role: 'Company Owner' }]; actorRole = 'Company Owner';
    jest.spyOn(Company, 'findById').mockImplementation((async (id: unknown) => String(id) === companyId ? company : { _id: String(id), settings: {} }) as never);
    jest.spyOn(EmployerUser, 'findOne').mockImplementation((async () => ({ _id: userId, isActive: true, role: actorRole })) as never);
    jest.spyOn(EmployerUser, 'find').mockImplementation((async () => users) as never);
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue(null);
    jest.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
  });
  const request = (path: string, method = 'GET', body?: unknown, scope = companyId) => fetch(base + path, {
    method, headers: { Authorization: `Bearer ${signEmployerToken(userId, scope)}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });

  it('views a role and persists edited details and permissions across reloads', async () => {
    expect((await request('/roles/Manager')).status).toBe(200);
    const response = await request('/roles/Manager', 'PUT', draft);
    expect(response.status).toBe(200);
    expect(company.save).toHaveBeenCalledTimes(1);
    const reloaded = await (await request('/roles/Manager')).json() as any;
    expect(reloaded.role).toMatchObject(draft);
    expect(employerPermissionOverride(company.settings, 'Manager')).toEqual(draft.permissions);
  });

  it('creates a role, shows it in the list, and deletes it from the company', async () => {
    const response = await request('/roles', 'POST', { ...draft, name: 'Custom Viewer' });
    expect(response.status).toBe(201);
    const body = await response.json() as any;
    const created = body.roles.find((role: any) => role.name === 'Custom Viewer');
    expect(created.id).toMatch(/^custom-role-/);
    expect((await request('/roles/' + created.id, 'DELETE')).status).toBe(200);
    expect((await request('/roles/' + created.id)).status).toBe(404);
    expect(employerRoles(company.settings).some((role) => role.id === created.id)).toBe(false);
  });

  it('deletes an unused built-in role without changing other employers', async () => {
    expect((await request('/roles/Manager', 'DELETE')).status).toBe(200);
    expect((await request('/roles/Manager')).status).toBe(404);
    expect((await request('/roles/Manager', 'GET', undefined, userId)).status).toBe(200);
  });

  it('rejects deleting assigned roles and protects the company owner', async () => {
    users.push({ role: 'Manager' });
    expect((await request('/roles/Manager', 'DELETE')).status).toBe(400);
    expect((await request('/roles/Company%20Owner', 'DELETE')).status).toBe(400);
    expect((await request('/roles/Company%20Owner', 'PUT', { ...draft, name: 'Super Admin', status: 'Inactive' })).status).toBe(400);
    expect(company.save).not.toHaveBeenCalled();
  });

  it('rejects invalid data and duplicate role names', async () => {
    expect((await request('/roles', 'POST', { ...draft, permissions: ['invalid.permission'] })).status).toBe(400);
    expect((await request('/roles', 'POST', draft)).status).toBe(409);
    expect((await request('/roles/unknown')).status).toBe(404);
  });

  it('applies company role permission changes on the next authenticated request', async () => {
    expect((await request('/roles/Manager', 'PUT', { ...draft, permissions: ['employee.edit'] })).status).toBe(200);
    actorRole = 'Manager';
    expect((await request('/can-edit')).status).toBe(200);
    company.settings.usersRoles.roleOverrides.Manager.status = 'Inactive';
    expect((await request('/can-edit')).status).toBe(403);
    expect((await request('/can-edit', 'GET', undefined, userId)).status).toBe(403);
  });

  it('keeps custom roles separate from built-in roles when counting users and resolving aliases', () => {
    const settings = { usersRoles: { customRoles: [{ ...draft, id: 'custom-role-test', name: 'Owner', permissions: [] }] } };
    const rows = employerRoles(settings, [{ role: 'Owner' }]);
    expect(rows.find((role) => role.id === 'custom-role-test')?.users).toBe(1);
    expect(rows.find((role) => role.id === 'Company Owner')?.users).toBe(0);
    expect(employerPermissionOverride(settings, 'Owner')).toEqual([]);
  });
});

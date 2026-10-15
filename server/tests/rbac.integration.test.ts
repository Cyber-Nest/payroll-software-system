import http from 'http';
import mongoose from 'mongoose';
import express from 'express';
import authRoutes from '../src/routes/auth';
import employeeRoutes from '../src/routes/employee';
import employerRoutes from '../src/routes/employer';
import superAdminRoutes from '../src/routes/superAdmin';
import { Employee } from '../src/models/Employee';
import { EmployerUser } from '../src/models/EmployerUser';
import { SuperAdmin } from '../src/models/SuperAdmin';
import { User } from '../src/models/User';
import { Company } from '../src/models/Company';
import { AuditLog } from '../src/models/AuditLog';
import { AccessRole } from '../src/models/AccessRole';
import { PayStatement } from '../src/models/PayStatement';
import { signEmployerToken, signSuperAdminToken, signToken } from '../src/middleware/auth';
import { RoleName } from '../src/security/rbac';
import { encryptSin } from '../src/utils/security';

const companyId = '64b7f8f8f8f8f8f8f8f8f8f1';
const employeeId = '64b7f8f8f8f8f8f8f8f8f8f2';
const userId = '64b7f8f8f8f8f8f8f8f8f8f3';
const employerUserId = '64b7f8f8f8f8f8f8f8f8f8f4';
const superAdminId = '64b7f8f8f8f8f8f8f8f8f8f5';

describe('RBAC route enforcement', () => {
  let server: http.Server;
  let baseUrl: string;
  let employerRole: RoleName = 'Company Owner';

  beforeAll((done) => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/auth', authRoutes);
    testApp.use('/api/employee', employeeRoutes);
    testApp.use('/api/employer', employerRoutes);
    testApp.use('/api/super-admin', superAdminRoutes);

    server = testApp.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Unable to bind test server');
      baseUrl = `http://127.0.0.1:${address.port}/api`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue(null);
    jest.spyOn(AccessRole, 'exists').mockResolvedValue(null);
    employerRole = 'Company Owner';
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: userId, isActive: true } as never);
    jest.spyOn(Employee, 'exists').mockResolvedValue({ _id: employeeId } as never);
    jest.spyOn(EmployerUser, 'findOne').mockImplementation((() => Promise.resolve({ _id: employerUserId, companyId, isActive: true, role: employerRole })) as never);
    jest.spyOn(SuperAdmin, 'findOne').mockResolvedValue({ _id: superAdminId, isActive: true } as never);
    jest.spyOn(Company, 'findById').mockResolvedValue(null);
    jest.spyOn(Employee, 'findOne').mockResolvedValue({
      _id: employeeId,
      companyId: new mongoose.Types.ObjectId(companyId),
      employeeNumber: 'E001',
      legalFirstName: 'Test',
      legalLastName: 'Employee',
      sinEncrypted: encryptSin('123456789')
    } as never);
    jest.spyOn(Employee, 'find').mockReturnValue({ sort: jest.fn().mockResolvedValue([]) } as never);
    jest.spyOn(Employee, 'findOneAndUpdate').mockResolvedValue({
      _id: employeeId,
      companyId: new mongoose.Types.ObjectId(companyId),
      employeeNumber: 'E001',
      legalFirstName: 'Test',
      legalLastName: 'Employee',
      sinEncrypted: encryptSin('123456789')
    } as never);
    jest.spyOn(PayStatement, 'find').mockReturnValue({ sort: jest.fn().mockResolvedValue([]) } as never);
    jest.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
  });

  function employeeToken() {
    return signToken(userId, employeeId, companyId);
  }

  it('creates employer users in the employer collection with a company and temporary password', async () => {
    jest.spyOn(Company, 'findById').mockResolvedValue({ _id: companyId, legalName: 'Test Company' } as never);
    jest.spyOn(EmployerUser, 'exists').mockResolvedValue(null);
    const create = jest.spyOn(EmployerUser, 'create').mockImplementation(async (data: any) => ({ ...data, _id: employerUserId, createdAt: new Date() }) as never);
    const adminCreate = jest.spyOn(SuperAdmin, 'create');
    const response = await request('/super-admin/access/users', signSuperAdminToken(superAdminId), {
      method: 'POST', body: JSON.stringify({ userType: 'employer', companyId, name: 'Employer Test', email: 'employer@example.com', role: 'Manager' })
    });
    expect(response.status).toBe(201);
    const body = await response.json() as any;
    expect(body.user.id).toBe('employer:' + employerUserId);
    expect(body.temporaryPassword).toBeTruthy();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ companyId, role: 'Manager', mustChangePassword: true }));
    expect(adminCreate).not.toHaveBeenCalled();
  });

  it('rejects employer creation without a company and rejects platform roles for employer users', async () => {
    const create = jest.spyOn(EmployerUser, 'create');
    for (const data of [{ role: 'Manager' }, { companyId, role: 'CyberNest Super Admin' }]) {
      const response = await request('/super-admin/access/users', signSuperAdminToken(superAdminId), {
        method: 'POST', body: JSON.stringify({ userType: 'employer', name: 'Test User', email: 'test@example.com', ...data })
      });
      expect(response.status).toBe(400);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('looks up employer custom roles only in the employer scope', async () => {
    await request('/employer/employees', employerToken('Manager'));
    expect(AccessRole.findOne).toHaveBeenCalledWith({ name: 'Manager', userType: 'employer' });
  });

  it('stores the selected user type when creating a role and blocks platform modules on employer roles', async () => {
    const create = jest.spyOn(AccessRole, 'create').mockImplementation(async (data: any) => ({ ...data, _id: superAdminId, createdAt: new Date(), updatedAt: new Date() }) as never);
    const response = await request('/super-admin/roles', signSuperAdminToken(superAdminId), {
      method: 'POST', body: JSON.stringify({ userType: 'employer', name: 'Employer Viewer', type: 'Custom', permissions: { Employees: ['View employees'] } })
    });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ userType: 'employer', name: 'Employer Viewer' }));
    const invalid = await request('/super-admin/roles', signSuperAdminToken(superAdminId), {
      method: 'POST', body: JSON.stringify({ userType: 'employer', name: 'Invalid Employer', permissions: { Employers: ['Delete employers'] } })
    });
    expect(invalid.status).toBe(400);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('does not grant write permissions from an employer role with view-only access', async () => {
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue({ status: 'Active', permissions: { Employees: ['View employees'] } } as never);
    const token = employerToken('Manager');
    expect((await request('/employer/employees', token)).status).toBe(200);
    expect((await request(`/employer/employees/${employeeId}/banking`, token, { method: 'PATCH', body: '{}' })).status).toBe(403);
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue({ status: 'Inactive', permissions: { Employees: ['View employees'] } } as never);
    expect((await request('/employer/employees', token)).status).toBe(403);
  });

  function employerToken(role: RoleName) {
    employerRole = role;
    return signEmployerToken(employerUserId, companyId);
  }

  async function request(path: string, token: string, init: RequestInit = {}) {
    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...init.headers
      }
    });
  }

  it('rejects an Employee token on employer routes server-side', async () => {
    const response = await request('/employer/employees', employeeToken());
    expect(response.status).toBe(403);
  });

  it('rejects Employee and Employer tokens on super-admin routes server-side', async () => {
    await expect(request('/super-admin/access', employeeToken()).then((response) => response.status)).resolves.toBe(403);
    await expect(request('/super-admin/access', employerToken('Company Owner')).then((response) => response.status)).resolves.toBe(403);
  });

  it.each([
    ['Company Owner', 200],
    ['Payroll Administrator', 200],
    ['Payroll Approver', 403],
    ['HR Administrator', 200],
    ['Manager', 200],
    ['Accountant', 403],
    ['Auditor', 200]
  ] as Array<[RoleName, number]>)('enforces employee.view on employer employee list for %s', async (role, expectedStatus) => {
    const response = await request('/employer/employees', employerToken(role));
    expect(response.status).toBe(expectedStatus);
  });

  it.each([
    ['Company Owner', 200],
    ['HR Administrator', 200],
    ['Payroll Administrator', 403],
    ['Manager', 403],
    ['Accountant', 403],
    ['Auditor', 403]
  ] as Array<[RoleName, number]>)('enforces bank.edit on employer banking updates for %s', async (role, expectedStatus) => {
    const response = await request(`/employer/employees/${employeeId}/banking`, employerToken(role), {
      method: 'PATCH',
      body: JSON.stringify({ bankInstitution: 'RBC', accountNumber: '1234567' })
    });
    expect(response.status).toBe(expectedStatus);
  });

  it('requires employee.sin.view before the employee SIN endpoint handler can run', async () => {
    const response = await request('/employee/sin/unmask', employeeToken());
    expect(response.status).toBe(403);
    expect(AuditLog.create).not.toHaveBeenCalledWith(expect.objectContaining({ eventType: 'SIN_UNMASK' }));
  });

  it.each([
    ['Company Owner', 200],
    ['HR Administrator', 200],
    ['Payroll Administrator', 403],
    ['Payroll Approver', 403],
    ['Manager', 403],
    ['Accountant', 403],
    ['Auditor', 403]
  ] as Array<[RoleName, number]>)('enforces employee.sin.view on employer SIN view for %s', async (role, expectedStatus) => {
    const response = await request(`/employer/employees/${employeeId}/sin`, employerToken(role));
    expect(response.status).toBe(expectedStatus);
  });

  it('rejects non-super-admin tax configuration calls and reserves the route for CyberNest Super Admin', async () => {
    await expect(request('/super-admin/tax-config/versions', employeeToken(), { method: 'POST', body: '{}' }).then((response) => response.status)).resolves.toBe(403);
    await expect(request('/super-admin/tax-config/versions', employerToken('Company Owner'), { method: 'POST', body: '{}' }).then((response) => response.status)).resolves.toBe(403);
    await expect(request('/super-admin/tax-config/versions', signSuperAdminToken(superAdminId), { method: 'POST', body: '{}' }).then((response) => response.status)).resolves.toBe(501);
  });
});

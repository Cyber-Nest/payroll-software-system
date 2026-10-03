import http from 'http';
import express from 'express';
import mongoose from 'mongoose';
import employerRoutes from '../src/routes/employer';
import employeeRoutes from '../src/routes/employee';
import { EmployerUser } from '../src/models/EmployerUser';
import { Company } from '../src/models/Company';
import { User } from '../src/models/User';
import { Employee } from '../src/models/Employee';
import { PayStatement } from '../src/models/PayStatement';
import { PayrollRun } from '../src/models/PayrollRun';
import { PayrollCarryForward } from '../src/models/PayrollCarryForward';
import { AuditLog } from '../src/models/AuditLog';
import { signEmployerToken, signToken } from '../src/middleware/auth';
import { encryptSin } from '../src/utils/security';
import { decimalToMoney } from '../src/utils/money';
import { RoleName } from '../src/security/rbac';
import { emailService } from '../src/services/email.service';

const companyId = new mongoose.Types.ObjectId('64b7f8f8f8f8f8f8f8f8f8f1');
const employeeId = new mongoose.Types.ObjectId('64b7f8f8f8f8f8f8f8f8f8f2');
const userId = new mongoose.Types.ObjectId('64b7f8f8f8f8f8f8f8f8f8f3');
const employerUserId = new mongoose.Types.ObjectId('64b7f8f8f8f8f8f8f8f8f8f4');

jest.setTimeout(30000);

describe('payroll workflow integration', () => {
  let server: http.Server;
  let baseUrl: string;
  let employerRole: RoleName = 'Company Owner';
  let runs: any[] = [];
  let statements: any[] = [];

  beforeAll((done) => {
    const testApp = express();
    testApp.use(express.json());
    testApp.use('/api/employer', employerRoutes);
    testApp.use('/api/employee', employeeRoutes);
    server = testApp.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Unable to bind test server');
      baseUrl = `http://127.0.0.1:${address.port}/api`;
      done();
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });

  beforeEach(() => {
    jest.restoreAllMocks();
    employerRole = 'Company Owner';
    runs = [];
    statements = [];
    jest.spyOn(EmployerUser, 'findOne').mockImplementation((() => Promise.resolve({ _id: employerUserId, companyId, isActive: true, role: employerRole })) as never);
    jest.spyOn(Company, 'findById').mockImplementation((() => ({
      select: jest.fn().mockResolvedValue({
        _id: companyId,
        legalName: 'Test Company',
        address: { province: 'AB' },
        payrollConfiguration: { payFrequency: 'biweekly' }
      })
    })) as never);
    jest.spyOn(User, 'findById').mockResolvedValue({ _id: userId, isActive: true } as never);
    jest.spyOn(Employee, 'exists').mockResolvedValue({ _id: employeeId } as never);
    jest.spyOn(Employee, 'findOne').mockResolvedValue({
      _id: employeeId,
      userId,
      companyId,
      employeeNumber: 'E001',
      legalFirstName: 'Test',
      legalLastName: 'Employee',
      sinEncrypted: encryptSin('123456789')
    } as never);
    jest.spyOn(Employee, 'findById').mockResolvedValue({ _id: employeeId, legalFirstName: 'Test', legalLastName: 'Employee', companyId } as never);
    jest.spyOn(Employee, 'find').mockImplementation((() => {
      const employees = [{
        _id: employeeId,
        companyId,
        employeeNumber: 'E001',
        legalFirstName: 'Test',
        legalLastName: 'Employee',
        taxProvince: 'AB',
        adminProfile: {}
      }];
      return {
        select: jest.fn().mockResolvedValue(employees),
        then: (resolve: (value: typeof employees) => unknown) => resolve(employees)
      };
    }) as never);
    jest.spyOn(PayrollCarryForward, 'find').mockResolvedValue([] as never);
    jest.spyOn(AuditLog, 'create').mockResolvedValue({} as never);
    jest.spyOn(PayStatement, 'create').mockImplementation((async (payload: any) => {
      const statement = { ...payload, _id: new mongoose.Types.ObjectId() };
      statements.push(statement);
      return statement;
    }) as never);
    jest.spyOn(PayStatement, 'find').mockImplementation(((filter: any) => ({
      sort: jest.fn().mockResolvedValue(statements.filter((statement) => String(statement.employeeId) === String(filter.employeeId) && String(statement.companyId) === String(filter.companyId)))
    })) as never);
    jest.spyOn(PayStatement, 'distinct').mockResolvedValue([2026] as never);
    jest.spyOn(emailService, 'send').mockResolvedValue(undefined);
    jest.spyOn(PayrollRun, 'create').mockImplementation((async (payload: any) => {
      const run = new PayrollRun(payload);
      run._id = new mongoose.Types.ObjectId();
      run.save = jest.fn(async () => run) as never;
      runs.push(run);
      return run;
    }) as never);
    jest.spyOn(PayrollRun, 'findOne').mockImplementation(((filter: any) => ({
      sort: jest.fn().mockResolvedValue(runs.find((run) => String(run.companyId) === String(filter.companyId)) || null),
      then: (resolve: (value: any) => unknown) => resolve(runs.find((run) => String(run._id) === String(filter._id) && String(run.companyId) === String(filter.companyId)) || null)
    })) as never);
  });

  function employerToken(role: RoleName) {
    employerRole = role;
    return signEmployerToken(String(employerUserId), String(companyId));
  }

  function employeeToken() {
    return signToken(String(userId), String(employeeId), String(companyId));
  }

  async function request(path: string, token: string, init: RequestInit = {}) {
    return fetch(`${baseUrl}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init.headers } });
  }

  it('creates, calculates, approves, finalizes, and exposes a statement in ESS', async () => {
    const token = employerToken('Company Owner');
    const created = await request('/employer/payroll-runs', token, {
      method: 'POST',
      body: JSON.stringify({ periodStart: '2026-01-01', periodEnd: '2026-01-15', payDate: '2026-01-20' })
    });
    expect(created.status).toBe(201);
    const createBody = await created.json() as { run: { id: string } };
    const runId = createBody.run.id;

    await expect(request(`/employer/payroll-runs/${runId}/hours-earnings`, token, {
      method: 'PUT',
      body: JSON.stringify({ lines: [{ employeeId: String(employeeId), regularHours: 80, overtimeHours: 0, hourlyRate: '25.00' }] })
    }).then((response) => response.status)).resolves.toBe(200);
    await expect(request(`/employer/payroll-runs/${runId}/submit-for-review`, token, { method: 'POST' }).then((response) => response.status)).resolves.toBe(200);
    await expect(request(`/employer/payroll-runs/${runId}/approve`, token, { method: 'POST' }).then((response) => response.status)).resolves.toBe(200);
    await expect(request(`/employer/payroll-runs/${runId}/finalize`, token, { method: 'POST' }).then((response) => response.status)).resolves.toBe(200);

    const ess = await request('/employee/pay-statements?year=2026', employeeToken());
    expect(ess.status).toBe(200);
    const essBody = await ess.json() as { statements: Array<{ netPay: string; grossPay: string }> };
    expect(essBody.statements).toEqual(expect.arrayContaining([expect.objectContaining({ netPay: '1672.40', grossPay: '2080.00' })]));
  });

  it('enforces approve/reverse permissions and locked mutation rules', async () => {
    const ownerToken = employerToken('Company Owner');
    const created = await request('/employer/payroll-runs', ownerToken, {
      method: 'POST',
      body: JSON.stringify({ periodStart: '2026-02-01', periodEnd: '2026-02-15', payDate: '2026-02-20' })
    });
    const runId = ((await created.json()) as { run: { id: string } }).run.id;
    await request(`/employer/payroll-runs/${runId}/hours-earnings`, ownerToken, {
      method: 'PUT',
      body: JSON.stringify({ lines: [{ employeeId: String(employeeId), regularHours: 10, overtimeHours: 0, hourlyRate: '10.00' }] })
    });
    await request(`/employer/payroll-runs/${runId}/submit-for-review`, ownerToken, { method: 'POST' });
    await expect(request(`/employer/payroll-runs/${runId}/approve`, employerToken('Payroll Administrator'), { method: 'POST' }).then((response) => response.status)).resolves.toBe(403);
    await request(`/employer/payroll-runs/${runId}/approve`, employerToken('Company Owner'), { method: 'POST' });
    await request(`/employer/payroll-runs/${runId}/finalize`, employerToken('Company Owner'), { method: 'POST' });
    await request(`/employer/payroll-runs/${runId}/lock`, employerToken('Company Owner'), { method: 'POST' });
    await expect(request(`/employer/payroll-runs/${runId}/hours-earnings`, employerToken('Company Owner'), {
      method: 'PUT',
      body: JSON.stringify({ lines: [{ employeeId: String(employeeId), regularHours: 11, overtimeHours: 0, hourlyRate: '10.00' }] })
    }).then((response) => response.status)).resolves.toBe(409);
    await expect(request(`/employer/payroll-runs/${runId}/reverse`, employerToken('Payroll Administrator'), { method: 'POST' }).then((response) => response.status)).resolves.toBe(403);
    await expect(request(`/employer/payroll-runs/${runId}/reverse`, employerToken('Company Owner'), { method: 'POST' }).then((response) => response.status)).resolves.toBe(200);
  });
});

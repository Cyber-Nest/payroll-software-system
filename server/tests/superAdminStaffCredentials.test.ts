import express from 'express';
import http from 'http';
import routes from '../src/routes/superAdmin';
import { SuperAdmin } from '../src/models/SuperAdmin';
import { AccessRole } from '../src/models/AccessRole';
import { signSuperAdminToken } from '../src/middleware/auth';
import * as welcome from '../src/services/employerWelcome.service';
import { emailService } from '../src/services/email.service';
import { hashPassword, verifyPassword } from '../src/utils/security';

const ownerId = '64b7f8f8f8f8f8f8f8f8f8f5';
describe('Super admin employee onboarding email', () => {
  let server: http.Server;
  let baseUrl: string;
  beforeAll(done => {
    const app = express();
    app.use(express.json());
    app.use('/api/super-admin', routes);
    server = app.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing server address');
      baseUrl = `http://127.0.0.1:${address.port}/api/super-admin`;
      done();
    });
  });
  afterAll(done => { server.close(done); });
  afterEach(() => jest.restoreAllMocks());
  function mockCreation() {
    jest.spyOn(SuperAdmin, 'findOne').mockResolvedValue({ _id: ownerId, isActive: true } as never);
    jest.spyOn(AccessRole, 'findOne').mockResolvedValue(null);
    jest.spyOn(AccessRole, 'find').mockResolvedValue([{ name: 'Support', userType: 'superAdmin', status: 'Active' }] as never);
    jest.spyOn(SuperAdmin, 'exists').mockResolvedValue(null);
    return jest.spyOn(SuperAdmin, 'create').mockImplementation((async (data: object) => ({ ...data, _id: 'staff-id' })) as never);
  }
  async function createStaff() {
    return fetch(`${baseUrl}/employees`, {
      method: 'POST', headers: { Authorization: `Bearer ${signSuperAdminToken(ownerId)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName: 'Jane', lastName: 'Smith', employeeNumber: 'STAFF-01', email: 'jane@example.com', role: 'Support', sections: ['Reports'] })
    });
  }
  it('emails credentials after creating a password-change-required staff account', async () => {
    const create = mockCreation();
    const send = jest.spyOn(welcome, 'sendSuperAdminEmployeeCredentialsEmail').mockResolvedValue();
    const response = await createStaff();
    const result = await response.json() as { emailSent: boolean; temporaryPassword: string };
    expect(response.status).toBe(201);
    expect(result.emailSent).toBe(true);
    const data = create.mock.calls[0][0] as unknown as { passwordHash: string; mustChangePassword: boolean };
    expect(data.mustChangePassword).toBe(true);
    expect(await verifyPassword(result.temporaryPassword, data.passwordHash)).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ email: 'jane@example.com' }), result.temporaryPassword);
  });
  it('reports email failures without losing the created account', async () => {
    mockCreation();
    jest.spyOn(welcome, 'sendSuperAdminEmployeeCredentialsEmail').mockRejectedValue(new Error('SMTP unavailable'));
    const response = await createStaff();
    const result = await response.json() as { emailSent: boolean; emailError: string; temporaryPassword: string };
    expect(response.status).toBe(201);
    expect(result.emailSent).toBe(false);
    expect(result.emailError).toBe('SMTP unavailable');
    expect(result.temporaryPassword).toBeTruthy();
  });
  it('includes the login email, temporary password and super admin sign-in link', async () => {
    const send = jest.spyOn(emailService, 'send').mockResolvedValue();
    await welcome.sendSuperAdminEmployeeCredentialsEmail({ name: 'Jane <Smith>', email: 'jane@example.com' }, 'Temporary123!');
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'jane@example.com', body: expect.stringContaining('Temporary password: Temporary123!'), html: expect.stringContaining('Jane &lt;Smith&gt;') }));
    expect(send.mock.calls[0][0].body).toContain('/payhours-admin');
    expect(send.mock.calls[0][0].body).toContain('Login email: jane@example.com');
  });
  it('replaces the temporary password and clears the first-login requirement', async () => {
    mockCreation();
    const admin = { passwordHash: await hashPassword('Temporary123!'), mustChangePassword: true, save: jest.fn().mockResolvedValue(undefined) };
    jest.spyOn(SuperAdmin, 'findById').mockResolvedValue(admin as never);
    const response = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST', headers: { Authorization: `Bearer ${signSuperAdminToken(ownerId)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'Temporary123!', newPassword: 'NewPassword456!' })
    });
    expect(response.status).toBe(200);
    expect(admin.mustChangePassword).toBe(false);
    expect(admin.save).toHaveBeenCalled();
    expect(await verifyPassword('Temporary123!', admin.passwordHash)).toBe(false);
    expect(await verifyPassword('NewPassword456!', admin.passwordHash)).toBe(true);
  });
  it('does not replace a password when the current password is incorrect', async () => {
    mockCreation();
    const admin = { passwordHash: await hashPassword('Temporary123!'), mustChangePassword: true, save: jest.fn() };
    jest.spyOn(SuperAdmin, 'findById').mockResolvedValue(admin as never);
    const response = await fetch(`${baseUrl}/auth/change-password`, {
      method: 'POST', headers: { Authorization: `Bearer ${signSuperAdminToken(ownerId)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'WrongPassword!', newPassword: 'NewPassword456!' })
    });
    expect(response.status).toBe(400);
    expect(admin.mustChangePassword).toBe(true);
    expect(admin.save).not.toHaveBeenCalled();
  });
});

import { Router } from 'express';
import { z } from 'zod';
import { AuditLog } from '../models/AuditLog';
import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { User } from '../models/User';
import { authenticate, AuthRequest, requirePermission, signToken } from '../middleware/auth';
import { requestPasswordReset, resetPassword } from '../services/passwordReset.service';
import { hashPassword, validatePasswordRules, verifyPassword } from '../utils/security';

const router = Router();

async function employeeChoices(userId: string) {
  const employees = await Employee.find({ userId }).populate('companyId').sort({ employeeNumber: 1 });
  return employees.map((employee) => {
    const company = employee.companyId as never as { _id: unknown; legalName: string; customerId: string };
    return {
      employeeId: String(employee._id),
      employeeNumber: employee.employeeNumber,
      companyId: String(company._id),
      companyName: company.legalName,
      customerId: company.customerId
    };
  });
}

router.post('/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid login request' });
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  await AuditLog.create({ userId: user?._id, eventType: ok ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE', metadata: { method: 'email' } });
  if (!user || !ok || !user.isActive) return res.status(401).json({ message: 'Invalid email or password' });

  user.lastLoginAt = new Date();
  await user.save();
  const companies = await employeeChoices(String(user._id));
  const selected = companies.find((choice) => choice.employeeId === String(user.lastSelectedEmployeeId)) || companies[0];
  res.json({
    mustChangePassword: user.mustChangePassword,
    companies,
    token: selected ? signToken(String(user._id), selected.employeeId, selected.companyId) : undefined,
    selectedEmployeeId: selected?.employeeId
  });
});

router.post('/login-customer-id', async (req, res) => {
  const parsed = z.object({ customerId: z.string(), employeeNumber: z.string(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid login request' });
  const company = await Company.findOne({ customerId: parsed.data.customerId.toUpperCase() });
  const employee = company ? await Employee.findOne({ companyId: company._id, employeeNumber: parsed.data.employeeNumber }) : null;
  const user = employee ? await User.findById(employee.userId) : null;
  const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  await AuditLog.create({ userId: user?._id, employeeId: employee?._id, companyId: company?._id, eventType: ok ? 'LOGIN_SUCCESS' : 'LOGIN_FAILURE', metadata: { method: 'customerId' } });
  if (!company || !employee || !user || !ok || !user.isActive) return res.status(401).json({ message: 'Invalid Customer ID, employee number, or password' });
  user.lastLoginAt = new Date();
  user.lastSelectedEmployeeId = employee._id;
  await user.save();
  res.json({
    mustChangePassword: user.mustChangePassword,
    companies: await employeeChoices(String(user._id)),
    token: signToken(String(user._id), String(employee._id), String(company._id)),
    selectedEmployeeId: String(employee._id)
  });
});

router.post('/forgot-password', async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a valid email address.' });
  const sent = await requestPasswordReset(parsed.data.email);
  if (!sent) return res.status(404).json({ message: 'No active Payhours account uses that email address.' });
  res.json({ message: 'Password reset link sent. Check your email.' });
});

router.post('/reset-password', async (req, res) => {
  const parsed = z.object({ token: z.string().min(20), newPassword: z.string(), confirmPassword: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid password reset request' });
  if (parsed.data.newPassword !== parsed.data.confirmPassword) return res.status(400).json({ message: 'Your two passwords are incorrect, please correct them.' });
  const failures = validatePasswordRules(parsed.data.newPassword, '');
  if (failures.length) return res.status(400).json({ message: 'Password does not meet Payhours rules', failures });
  const ok = await resetPassword(parsed.data.token, parsed.data.newPassword);
  if (!ok) return res.status(400).json({ message: 'Reset link is invalid or expired' });
  res.json({ message: 'Password reset complete' });
});

router.post('/change-password', authenticate, requirePermission('self.security.edit'), async (req: AuthRequest, res) => {
  const parsed = z.object({ currentPassword: z.string(), newPassword: z.string(), confirmPassword: z.string() }).safeParse(req.body);
  if (!parsed.success || parsed.data.newPassword !== parsed.data.confirmPassword) return res.status(400).json({ message: 'Invalid password change request' });
  const user = await User.findById(req.user?.id);
  const employee = await Employee.findById(req.employeeContext?.employeeId);
  if (!user || !employee) return res.status(401).json({ message: 'Invalid session' });
  if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) return res.status(401).json({ message: 'Current password is incorrect' });
  const failures = validatePasswordRules(parsed.data.newPassword, employee.employeeNumber);
  if (failures.length) return res.status(400).json({ message: 'Password does not meet Payhours rules', failures });
  user.passwordHash = await hashPassword(parsed.data.newPassword);
  user.mustChangePassword = false;
  await user.save();
  await AuditLog.create({ userId: user._id, employeeId: employee._id, companyId: employee.companyId, eventType: 'PASSWORD_CHANGE' });
  res.json({ message: 'Password changed' });
});

export default router;

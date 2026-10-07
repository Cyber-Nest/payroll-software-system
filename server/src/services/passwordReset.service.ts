import crypto from 'crypto';
import { Types } from 'mongoose';
import { env } from '../config/env';
import { EmployerUser } from '../models/EmployerUser';
import { PasswordResetToken, ResetAccountType } from '../models/PasswordResetToken';
import { SuperAdmin } from '../models/SuperAdmin';
import { User } from '../models/User';
import { hashPassword } from '../utils/security';
import { emailService } from './email.service';

type ResetAccount = { accountType: ResetAccountType; accountId: Types.ObjectId; email: string; name: string };

function tokenHash(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function findResetAccount(email: string): Promise<ResetAccount | undefined> {
  const normalized = email.toLowerCase();
  const [employee, employer, superAdmin] = await Promise.all([
    User.findOne({ email: normalized, isActive: true }),
    EmployerUser.findOne({ email: normalized, isActive: true }),
    SuperAdmin.findOne({ email: normalized, isActive: true })
  ]);
  if (employee) return { accountType: 'employee', accountId: employee._id as Types.ObjectId, email: employee.email, name: employee.email };
  if (employer) return { accountType: 'employer', accountId: employer._id as Types.ObjectId, email: employer.email, name: employer.name };
  if (superAdmin) return { accountType: 'super-admin', accountId: superAdmin._id as Types.ObjectId, email: superAdmin.email, name: superAdmin.name };
  return undefined;
}

export async function requestPasswordReset(email: string): Promise<boolean> {
  const account = await findResetAccount(email);
  if (!account) return false;
  await PasswordResetToken.updateMany({ accountType: account.accountType, accountId: account.accountId, usedAt: undefined }, { usedAt: new Date() });
  const token = crypto.randomBytes(32).toString('hex');
  await PasswordResetToken.create({
    accountType: account.accountType,
    accountId: account.accountId,
    email: account.email,
    tokenHash: tokenHash(token),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000)
  });
  const resetUrl = `${env.portalUrl}/reset-password?token=${encodeURIComponent(token)}`;
  await emailService.send({
    to: account.email,
    subject: 'Reset your Payhours password',
    body: [
      `Hello ${account.name},`,
      '',
      'Use the link below to reset your Payhours password. This link expires in 1 hour.',
      resetUrl,
      '',
      'If you did not request this, you can ignore this email.'
    ].join('\n')
  });
  return true;
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const reset = await PasswordResetToken.findOne({ tokenHash: tokenHash(token), usedAt: undefined, expiresAt: { $gt: new Date() } });
  if (!reset) return false;
  const passwordHash = await hashPassword(newPassword);
  if (reset.accountType === 'employee') {
    await User.findByIdAndUpdate(reset.accountId, { passwordHash, mustChangePassword: false });
  } else if (reset.accountType === 'employer') {
    await EmployerUser.findByIdAndUpdate(reset.accountId, { passwordHash, mustChangePassword: false });
  } else {
    await SuperAdmin.findByIdAndUpdate(reset.accountId, { passwordHash });
  }
  reset.usedAt = new Date();
  await reset.save();
  return true;
}

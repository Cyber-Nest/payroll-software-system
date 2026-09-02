import { Employee } from '../models/Employee';
import { Company } from '../models/Company';
import { User } from '../models/User';
import { env } from '../config/env';
import { emailService } from './email.service';
import { generateTemporaryPassword, hashPassword } from '../utils/security';

export async function sendWelcomeEmail(employeeId: string): Promise<{ temporaryPassword: string }> {
  const employee = await Employee.findById(employeeId);
  if (!employee) throw new Error('Employee not found');
  const [user, company] = await Promise.all([User.findById(employee.userId), Company.findById(employee.companyId)]);
  if (!user || !company) throw new Error('Employee account is incomplete');

  const temporaryPassword = generateTemporaryPassword();
  user.passwordHash = await hashPassword(temporaryPassword);
  user.mustChangePassword = true;
  await user.save();

  await emailService.send({
    to: user.email,
    subject: 'Welcome to Payhours',
    body: [
      `Portal URL: ${env.portalUrl}`,
      `Company Customer ID: ${company.customerId}`,
      `Employee Number: ${employee.employeeNumber}`,
      `Temporary Password: ${temporaryPassword}`
    ].join('\n')
  });

  return { temporaryPassword };
}

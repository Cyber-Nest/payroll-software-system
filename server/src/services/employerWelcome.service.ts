import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { EmployerUser } from '../models/EmployerUser';
import { User } from '../models/User';
import { env } from '../config/env';
import { emailService } from './email.service';

export async function sendEmployerCredentialsEmail(employerUserId: string, temporaryPassword: string): Promise<void> {
  const employer = await EmployerUser.findById(employerUserId);
  if (!employer) throw new Error('Employer user not found');
  const company = await Company.findById(employer.companyId);
  await emailService.send({
    to: employer.email,
    subject: 'Your Payhours employer account is ready',
    body: [
      `Hello ${employer.name},`,
      '',
      `Your Payhours employer account${company ? ` for ${company.legalName}` : ''} has been created.`,
      `Login email: ${employer.email}`,
      `Temporary password: ${temporaryPassword}`,
      '',
      `Sign in: ${env.portalUrl}`,
      'Please sign in and change your password after your first login.'
    ].join('\n')
  });
}

export async function sendEmployeeCredentialsEmail(userId: string, employeeId: string, temporaryPassword: string): Promise<void> {
  const [user, employee] = await Promise.all([User.findById(userId), Employee.findById(employeeId)]);
  if (!user || !employee) throw new Error('Employee user not found');
  const company = await Company.findById(employee.companyId);
  await emailService.send({
    to: user.email,
    subject: 'Your Payhours employee account is ready',
    body: [
      `Hello ${employee.preferredFirstName || employee.legalFirstName},`,
      '',
      `Your Payhours employee account${company ? ` for ${company.legalName}` : ''} has been created.`,
      `Customer ID: ${company?.customerId || ''}`,
      `Employee number: ${employee.employeeNumber}`,
      `Login email: ${user.email}`,
      `Temporary password: ${temporaryPassword}`,
      '',
      `Sign in: ${env.portalUrl}`,
      'Please sign in and change your password after your first login.'
    ].join('\n')
  });
}

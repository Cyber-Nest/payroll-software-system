import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { EmployerUser } from '../models/EmployerUser';
import { User } from '../models/User';
import { env } from '../config/env';
import { emailService } from './email.service';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function detailsTable(rows: Array<[string, string]>) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:640px;margin:16px 0;font-size:14px;">${rows
    .map(([label, value]) => [
      '<tr>',
      `<td style="padding:10px 12px;border:1px solid #dbe4f0;background:#f8fafc;font-weight:700;color:#1e3a8a;">${escapeHtml(label)}</td>`,
      `<td style="padding:10px 12px;border:1px solid #dbe4f0;color:#111827;">${escapeHtml(value)}</td>`,
      '</tr>'
    ].join(''))
    .join('')}</table>`;
}

function emailShell(title: string, greeting: string, intro: string, rows: Array<[string, string]>) {
  return [
    `<h1 style="font-size:22px;margin:0 0 12px;color:#0f172a;">${escapeHtml(title)}</h1>`,
    `<p>Hello ${escapeHtml(greeting)},</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    detailsTable(rows),
    `<p><a href="${escapeHtml(env.portalUrl)}" style="display:inline-block;background:#1677d2;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:700;">Sign in to Payhours</a></p>`,
    '<p>Please sign in and change your password after your first login.</p>'
  ].join('');
}

export async function sendEmployerCredentialsEmail(employerUserId: string, temporaryPassword: string): Promise<void> {
  const employer = await EmployerUser.findById(employerUserId);
  if (!employer) throw new Error('Employer user not found');
  const company = await Company.findById(employer.companyId);
  const rows: Array<[string, string]> = [
    ['Company', company?.legalName || 'Your company'],
    ['Login email', employer.email],
    ['Temporary password', temporaryPassword],
    ['Sign in URL', env.portalUrl]
  ];
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
    ].join('\n'),
    html: emailShell(
      'PAYHOURS EMPLOYER ACCOUNT READY',
      employer.name,
      `Your Payhours employer account${company ? ` for ${company.legalName}` : ''} has been created.`,
      rows
    )
  });
}

export async function sendEmployeeCredentialsEmail(userId: string, employeeId: string, temporaryPassword: string): Promise<void> {
  const [user, employee] = await Promise.all([User.findById(userId), Employee.findById(employeeId)]);
  if (!user || !employee) throw new Error('Employee user not found');
  const company = await Company.findById(employee.companyId);
  const greeting = employee.preferredFirstName || employee.legalFirstName || 'there';
  const rows: Array<[string, string]> = [
    ['Company', company?.legalName || 'Your employer'],
    ['Customer ID', company?.customerId || ''],
    ['Employee number', employee.employeeNumber],
    ['Login email', user.email],
    ['Temporary password', temporaryPassword],
    ['Sign in URL', env.portalUrl]
  ];
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
    ].join('\n'),
    html: emailShell(
      'PAYHOURS EMPLOYEE ACCOUNT READY',
      greeting,
      `Your Payhours employee account${company ? ` for ${company.legalName}` : ''} has been created.`,
      rows
    )
  });
}

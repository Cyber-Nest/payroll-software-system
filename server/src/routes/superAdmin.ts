import express from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { AuditLog } from '../models/AuditLog';
import { AccessRole } from '../models/AccessRole';
import { Company } from '../models/Company';
import { EmployerUser } from '../models/EmployerUser';
import { Employee } from '../models/Employee';
import { PayrollRun } from '../models/PayrollRun';
import { PayStatement } from '../models/PayStatement';
import { GovernmentFiling } from '../models/GovernmentFiling';
import { TaxFormDocument } from '../models/TaxFormDocument';
import { RoeDocument } from '../models/RoeDocument';
import { PlatformNotification } from '../models/PlatformNotification';
import { DeductionType } from '../models/DeductionType';
import { PaystubTemplate } from '../models/PaystubTemplate';
import { SuperAdmin } from '../models/SuperAdmin';
import { accessRoles, permissionModules, superAdminAccessPayload } from '../data/superAdminAccess';
import { authenticate, AuthRequest, requirePermission, signSuperAdminToken } from '../middleware/auth';
import { decryptSin, generateTemporaryPassword, hashPassword, verifyPassword } from '../utils/security';
import { sendEmployerCredentialsEmail, sendSuperAdminEmployeeCredentialsEmail } from '../services/employerWelcome.service';
import { normalizeProvince, withVacationPolicy } from '../services/vacationPolicy.service';
import { roleNames, permissionsForRole } from '../security/rbac';
import { auditEvent } from '../utils/audit';
import { formatMoney, moneyToDecimal, sumMoney, MoneyValue } from '../utils/money';
import { decimalToMoney } from '../utils/money';
import { roePdf, t4sPdf, T4PdfData } from '../utils/pdf';
import t4FormatRoutes from './t4Formats';
import { selectedT4Format } from '../services/t4Format.service';

const router = express.Router();

const staffSections = ["Dashboard","Employers","Employees","Payroll Runs","Payroll Accounts","All Payroll Accounts","Add Payroll Account","CRA Remittances","Banking & Funding","Remittance Schedule","Reports","Compliance & Tax","Deduction Types","Paystub Templates","T4 Formats","Year End (T4)","ROE","Notifications","Users & Access","Settings"];
router.get('/session', authenticate, async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const admin = await SuperAdmin.findById(req.superAdminContext!.superAdminId);
  res.json({ sections: admin?.staffOwnerId ? admin.sectionPermissions || [] : staffSections, mustChangePassword: Boolean(admin?.mustChangePassword) });
});
router.post('/auth/change-password', authenticate, async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter your current password and a new password of at least 8 characters.' });
  const admin = await SuperAdmin.findById(req.superAdminContext!.superAdminId);
  if (!admin || !(await verifyPassword(parsed.data.currentPassword, admin.passwordHash))) return res.status(400).json({ message: 'Current password is incorrect.' });
  if (await verifyPassword(parsed.data.newPassword, admin.passwordHash)) return res.status(400).json({ message: 'Choose a different password from your temporary password.' });
  admin.passwordHash = await hashPassword(parsed.data.newPassword);
  admin.mustChangePassword = false;
  await admin.save();
  res.json({ changed: true });
});
async function activeStaffRoles(): Promise<string[]> {
  // Use the same saved roles and initial defaults as Users & Roles.
  const savedRoles = await AccessRole.find({});
  const roles = savedRoles.length ? savedRoles : accessRoles;
  return roles.filter(role => role.userType !== 'employer' && role.status === 'Active').map(role => role.name);
}
const staffSchema = z.object({ firstName: z.string().trim().min(1), lastName: z.string().trim().min(1), employeeNumber: z.string().trim().min(1), email: z.string().email(), role: z.string().trim().min(1), location: z.string().default(''), sections: z.array(z.string()).refine(items => items.every(item => staffSections.includes(item))) });
router.get('/employees', authenticate, requirePermission('employee.view'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const employees = await SuperAdmin.find({ staffOwnerId: req.superAdminContext!.superAdminId });
  res.json({ sections: staffSections, roles: await activeStaffRoles(), employees: employees.map(item => ({ ...item.staffProfile, id: String(item._id), email: item.email, role: item.role || '', sections: item.sectionPermissions || [] })) });
});
router.post('/employees', authenticate, requirePermission('employee.create'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = staffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter valid employee details.' });
  const data = parsed.data;
  if (!(await activeStaffRoles()).includes(data.role)) return res.status(400).json({ message: 'Choose an active super admin role.' });
  if (await SuperAdmin.exists({ email: data.email.toLowerCase() })) return res.status(409).json({ message: 'Email already exists.' });
  if (await SuperAdmin.exists({ staffOwnerId: req.superAdminContext!.superAdminId, 'staffProfile.employeeNumber': data.employeeNumber })) return res.status(409).json({ message: 'Employee number already exists.' });
  const temporaryPassword = generateTemporaryPassword();
  const { sections, ...profile } = data;
  const employee = await SuperAdmin.create({ staffOwnerId: req.superAdminContext!.superAdminId, staffProfile: profile, sectionPermissions: sections, name: data.firstName + ' ' + data.lastName, email: data.email, role: data.role, passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true, isActive: true });
  let emailSent = false;
  let emailError: string | undefined;
  try {
    await sendSuperAdminEmployeeCredentialsEmail(employee, temporaryPassword);
    emailSent = true;
  } catch (error) {
    emailError = error instanceof Error ? error.message : 'Could not send login details.';
  }
  res.status(201).json({ id: String(employee._id), temporaryPassword, emailSent, emailError });
});
router.put('/employees/:id', authenticate, requirePermission('employee.edit'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = staffSchema.safeParse(req.body);
  if (!parsed.success || !mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid employee.' });
  const data = parsed.data;
  if (!(await activeStaffRoles()).includes(data.role)) return res.status(400).json({ message: 'Choose an active super admin role.' });
  if (await SuperAdmin.exists({ _id: { $ne: req.params.id }, email: data.email.toLowerCase() })) return res.status(409).json({ message: 'Email already exists.' });
  if (await SuperAdmin.exists({ _id: { $ne: req.params.id }, staffOwnerId: req.superAdminContext!.superAdminId, 'staffProfile.employeeNumber': data.employeeNumber })) return res.status(409).json({ message: 'Employee number already exists.' });
  const { sections, ...profile } = data;
  const employee = await SuperAdmin.findOneAndUpdate({ _id: req.params.id, staffOwnerId: req.superAdminContext!.superAdminId }, { staffProfile: profile, sectionPermissions: sections, role: data.role, name: data.firstName + ' ' + data.lastName, email: data.email.toLowerCase() }, { new: true });
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  res.json({ saved: true });
});
router.delete('/employees/:id', authenticate, requirePermission('employee.edit'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid employee.' });
  const employee = await SuperAdmin.findOneAndDelete({ _id: req.params.id, staffOwnerId: req.superAdminContext!.superAdminId });
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  res.json({ deleted: true });
});
router.use('/t4-formats', t4FormatRoutes);


const supportedProvinces = ['AB', 'BC', 'MB', 'SK', 'ON'] as const;
const statutoryDeductionTypes = [
  { code: 'CPP', name: 'Canada Pension Plan', calculationMethod: 'cra_rules', description: 'Mandatory CPP contribution calculated using CRA annual limits.' },
  { code: 'EI', name: 'Employment Insurance', calculationMethod: 'cra_rules', description: 'Mandatory EI premium calculated using CRA annual limits.' },
  { code: 'FTAX', name: 'Federal Income Tax', calculationMethod: 'tax_table', description: 'Mandatory federal income tax calculated from CRA tax tables and TD1 claims.' },
  { code: 'PTAX', name: 'Provincial Income Tax', calculationMethod: 'tax_table', description: 'Mandatory provincial income tax calculated using the employee province and TD1 claim.' }
] as const;

function addressLines(address?: {
  street?: string;
  line2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
}): string[] {
  if (!address) return [];
  return [
    address.street,
    address.line2,
    [address.city, address.province, address.postalCode].filter(Boolean).join(', ')
  ].filter(Boolean) as string[];
}

async function ensureStatutoryDeductionTypes() {
  await Promise.all(statutoryDeductionTypes.map((item) => DeductionType.findOneAndUpdate(
    { code: item.code, kind: 'statutory', employerId: { $exists: false } },
    { ...item, kind: 'statutory', provinces: [...supportedProvinces], mandatory: true, status: 'active' },
    { upsert: true }
  )));
}

function serializeDeductionType(item: InstanceType<typeof DeductionType>) {
  return {
    id: String(item._id), code: item.code, name: item.name, description: item.description || '',
    kind: item.kind, employerId: item.employerId ? String(item.employerId) : '',
    provinces: item.provinces, mandatory: item.mandatory,
    calculationMethod: item.calculationMethod,
    value: item.value ? item.value.toString() : '', status: item.status,
    customType: item.customType || 'voluntary', category: item.category || 'Other',
    employmentType: item.employmentType || 'all', payFrequency: item.payFrequency || 'all',
    employeeScope: item.employeeScope || 'all', defaultForNewEmployees: Boolean(item.defaultForNewEmployees),
    showOnPaystub: item.showOnPaystub !== false, includeInCraReports: Boolean(item.includeInCraReports),
    updatedAt: item.updatedAt
  };
}

const standardPaystubTemplate = {
  name: 'Standard',
  code: 'STANDARD',
  description: 'Default Payhours paystub template used for generated earnings statements.',
  status: 'active' as const,
  isSystem: true,
  layout: 'standard' as const,
  title: 'Earnings Statement',
  payPeriodLabel: 'Pay Period',
  regularHourLabel: 'Regular Hours',
  overtimeHourLabel: 'Overtime Hours',
  doubleTimeHourLabel: 'Double Time Hours',
  rateDisplayFormat: 'Show $ per hour',
  showPayGroup: true,
  showDepartment: true,
  showJobTitle: true,
  showLocation: true,
  showEmployeeSin: false,
  maskSin: true,
  showHireDate: true,
  showAccruals: true,
  message: 'Thank you for your hard work!',
  disclaimer: 'This pay statement is for information purposes only. Please contact HR if you have any questions.',
  delivery: {
    availableInPortal: true,
    emailAutomatically: true,
    passwordProtectPdf: false,
    allowDownload: true,
    keepYears: '7 Years'
  }
};

async function ensurePaystubTemplates() {
  await PaystubTemplate.findOneAndUpdate(
    { code: standardPaystubTemplate.code },
    { $setOnInsert: standardPaystubTemplate },
    { upsert: true }
  );
}

function serializePaystubTemplate(template: InstanceType<typeof PaystubTemplate>) {
  return {
    id: String(template._id),
    name: template.name,
    code: template.code,
    description: template.description || '',
    status: template.status,
    isSystem: template.isSystem,
    layout: template.layout,
    title: template.title,
    payPeriodLabel: template.payPeriodLabel,
    regularHourLabel: template.regularHourLabel,
    overtimeHourLabel: template.overtimeHourLabel,
    doubleTimeHourLabel: template.doubleTimeHourLabel,
    rateDisplayFormat: template.rateDisplayFormat,
    showPayGroup: template.showPayGroup,
    showDepartment: template.showDepartment,
    showJobTitle: template.showJobTitle,
    showLocation: template.showLocation,
    showEmployeeSin: template.showEmployeeSin,
    maskSin: template.maskSin,
    showHireDate: template.showHireDate,
    showAccruals: template.showAccruals,
    message: template.message || '',
    disclaimer: template.disclaimer || '',
    delivery: template.delivery,
    updatedAt: template.updatedAt
  };
}

const paystubTemplateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  description: z.string().trim().max(300).optional(),
  status: z.enum(['active', 'inactive']).default('active'),
  layout: z.enum(['standard', 'compact']).default('standard'),
  title: z.string().trim().min(2).max(80),
  payPeriodLabel: z.string().trim().min(1).max(60),
  regularHourLabel: z.string().trim().min(1).max(60),
  overtimeHourLabel: z.string().trim().min(1).max(60),
  doubleTimeHourLabel: z.string().trim().min(1).max(60),
  rateDisplayFormat: z.string().trim().min(1).max(60),
  showPayGroup: z.boolean().default(true),
  showDepartment: z.boolean().default(true),
  showJobTitle: z.boolean().default(true),
  showLocation: z.boolean().default(true),
  showEmployeeSin: z.boolean().default(false),
  maskSin: z.boolean().default(true),
  showHireDate: z.boolean().default(true),
  showAccruals: z.boolean().default(true),
  message: z.string().trim().max(500).optional(),
  disclaimer: z.string().trim().max(1000).optional(),
  delivery: z.object({
    availableInPortal: z.boolean().default(true),
    emailAutomatically: z.boolean().default(true),
    passwordProtectPdf: z.boolean().default(false),
    allowDownload: z.boolean().default(true),
    keepYears: z.string().trim().min(1).max(30).default('7 Years')
  })
});

router.get('/paystub-templates', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  await ensurePaystubTemplates();
  const templates = await PaystubTemplate.find().sort({ isSystem: -1, name: 1 });
  res.json({ templates: templates.map(serializePaystubTemplate) });
});

router.post('/paystub-templates', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = paystubTemplateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid paystub template', issues: parsed.error.issues });
  try {
    const template = await PaystubTemplate.create({
      ...parsed.data,
      code: parsed.data.code.toUpperCase(),
      isSystem: false,
      createdBy: req.superAdminContext!.superAdminId
    });
    await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'PAYSTUB_TEMPLATE_CREATED', metadata: { templateId: template._id, code: template.code } });
    res.status(201).json({ template: serializePaystubTemplate(template) });
  } catch (error: unknown) {
    if (typeof error === 'object' && error && 'code' in error && (error as { code?: number }).code === 11000) {
      return res.status(409).json({ message: 'Template code already exists.' });
    }
    throw error;
  }
});

router.put('/paystub-templates/:id', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = paystubTemplateSchema.partial({ code: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid paystub template', issues: parsed.error.issues });
  const template = await PaystubTemplate.findById(req.params.id);
  if (!template) return res.status(404).json({ message: 'Template not found' });
  const data = parsed.data;
  if (data.name !== undefined) template.name = data.name;
  if (!template.isSystem && data.code !== undefined) template.code = data.code.toUpperCase();
  if (data.description !== undefined) template.description = data.description;
  if (data.status !== undefined) template.status = data.status;
  if (data.layout !== undefined) template.layout = data.layout;
  if (data.title !== undefined) template.title = data.title;
  if (data.payPeriodLabel !== undefined) template.payPeriodLabel = data.payPeriodLabel;
  if (data.regularHourLabel !== undefined) template.regularHourLabel = data.regularHourLabel;
  if (data.overtimeHourLabel !== undefined) template.overtimeHourLabel = data.overtimeHourLabel;
  if (data.doubleTimeHourLabel !== undefined) template.doubleTimeHourLabel = data.doubleTimeHourLabel;
  if (data.rateDisplayFormat !== undefined) template.rateDisplayFormat = data.rateDisplayFormat;
  if (data.showPayGroup !== undefined) template.showPayGroup = data.showPayGroup;
  if (data.showDepartment !== undefined) template.showDepartment = data.showDepartment;
  if (data.showJobTitle !== undefined) template.showJobTitle = data.showJobTitle;
  if (data.showLocation !== undefined) template.showLocation = data.showLocation;
  if (data.showEmployeeSin !== undefined) template.showEmployeeSin = data.showEmployeeSin;
  if (data.maskSin !== undefined) template.maskSin = data.maskSin;
  if (data.showHireDate !== undefined) template.showHireDate = data.showHireDate;
  if (data.showAccruals !== undefined) template.showAccruals = data.showAccruals;
  if (data.message !== undefined) template.message = data.message;
  if (data.disclaimer !== undefined) template.disclaimer = data.disclaimer;
  if (data.delivery !== undefined) template.delivery = data.delivery;
  await template.save();
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'PAYSTUB_TEMPLATE_UPDATED', metadata: { templateId: template._id, code: template.code } });
  res.json({ template: serializePaystubTemplate(template) });
});

router.delete('/paystub-templates/:id', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const template = await PaystubTemplate.findById(req.params.id);
  if (!template) return res.status(404).json({ message: 'Template not found' });
  if (template.isSystem) return res.status(400).json({ message: 'Standard template cannot be deleted.' });
  await PaystubTemplate.deleteOne({ _id: template._id });
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'PAYSTUB_TEMPLATE_DELETED', metadata: { templateId: template._id, code: template.code } });
  res.json({ deleted: true, templateId: req.params.id });
});

router.get('/deduction-types', authenticate, requirePermission('tax.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  await ensureStatutoryDeductionTypes();
  const [types, employers] = await Promise.all([
    DeductionType.find().sort({ kind: -1, name: 1 }),
    Company.find().select('legalName customerId address.province').sort({ legalName: 1 })
  ]);
  res.json({
    deductionTypes: types.map(serializeDeductionType),
    employers: employers.map((company) => ({ id: String(company._id), name: company.legalName, customerId: company.customerId, province: company.address?.province || '' })),
    supportedProvinces
  });
});

const customDeductionSchema = z.object({
  code: z.string().trim().min(2).max(15).regex(/^[A-Za-z0-9_-]+$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).optional(),
  employerId: z.string().refine((value) => /^[a-f\d]{24}$/i.test(value)),
  provinces: z.array(z.enum(supportedProvinces)).min(1),
  calculationMethod: z.enum(['fixed', 'percentage']),
  value: z.coerce.number().min(0),
  customType: z.enum(['voluntary', 'custom']).default('voluntary'),
  category: z.string().trim().min(2).max(80),
  employmentType: z.enum(['all', 'full_time', 'part_time', 'contract', 'seasonal']).default('all'),
  payFrequency: z.enum(['all', 'weekly', 'biweekly', 'monthly']).default('all'),
  employeeScope: z.enum(['all']).default('all'),
  defaultForNewEmployees: z.boolean().default(false),
  showOnPaystub: z.boolean().default(true),
  includeInCraReports: z.boolean().default(false),
  status: z.enum(['active', 'inactive']).default('active')
});

router.post('/deduction-types', authenticate, requirePermission('tax.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = customDeductionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter valid custom deduction settings', issues: parsed.error.issues });
  const employer = await Company.findById(parsed.data.employerId);
  if (!employer) return res.status(404).json({ message: 'Employer not found' });
  try {
    const item = await DeductionType.create({
      ...parsed.data, code: parsed.data.code.toUpperCase(), kind: 'custom', mandatory: false,
      value: decimalToMoney(parsed.data.value), createdBy: req.superAdminContext!.superAdminId
    });
    res.status(201).json({ deductionType: serializeDeductionType(item) });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return res.status(409).json({ message: 'That deduction code already exists for this employer' });
    throw error;
  }
});

router.patch('/deduction-types/:id', authenticate, requirePermission('tax.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = customDeductionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter valid custom deduction settings', issues: parsed.error.issues });
  const item = await DeductionType.findOneAndUpdate(
    { _id: req.params.id, kind: 'custom' },
    { ...parsed.data, code: parsed.data.code.toUpperCase(), value: decimalToMoney(parsed.data.value) },
    { new: true }
  );
  if (!item) return res.status(404).json({ message: 'Custom deduction type not found' });
  res.json({ deductionType: serializeDeductionType(item) });
});

router.get('/t4/options', authenticate, requirePermission('tax.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const currentYear = new Date().getUTCFullYear();
  const [companies, statements] = await Promise.all([
    Company.find().select('legalName customerId').sort({ legalName: 1 }),
    PayStatement.find({ payPeriodYear: { $lt: currentYear }, supersededByStatementId: { $exists: false } }).select('companyId employeeId payPeriodYear')
  ]);
  const employeeIds = [...new Set(statements.map((item) => String(item.employeeId)))];
  const employees = await Employee.find({ _id: { $in: employeeIds } })
    .select('companyId legalFirstName legalLastName employeeNumber')
    .sort({ legalFirstName: 1, legalLastName: 1 });
  const yearsByEmployee = new Map<string, Set<number>>();
  statements.forEach((item) => {
    const key = String(item.employeeId);
    if (!yearsByEmployee.has(key)) yearsByEmployee.set(key, new Set());
    yearsByEmployee.get(key)!.add(item.payPeriodYear);
  });
  res.json({
    employers: companies.map((company) => ({ id: String(company._id), name: company.legalName, customerId: company.customerId })),
    employees: employees.map((employee) => ({
      id: String(employee._id), companyId: String(employee.companyId),
      name: `${employee.legalFirstName} ${employee.legalLastName}`.trim(), employeeNumber: employee.employeeNumber,
      years: [...(yearsByEmployee.get(String(employee._id)) || [])].sort((a, b) => b - a)
    }))
  });
});

const superAdminT4Schema = z.object({
  companyId: z.string().regex(/^[a-f\d]{24}$/i),
  year: z.number().int().min(2000).max(2100),
  employeeId: z.union([z.literal('all'), z.string().regex(/^[a-f\d]{24}$/i)])
});

router.post('/t4/generate', authenticate, requirePermission('tax.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = superAdminT4Schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Select a valid employer, year and employee.' });
  const { companyId, year, employeeId } = parsed.data;
  if (year >= new Date().getUTCFullYear()) {
    return res.status(400).json({ message: 'T4 forms can only be generated after the selected calendar year has ended.' });
  }
  const statements = await PayStatement.find({
    companyId, payPeriodYear: year, supersededByStatementId: { $exists: false },
    ...(employeeId === 'all' ? {} : { employeeId })
  });
  if (!statements.length) return res.status(404).json({ message: 'No payslips found for that selection.' });
  const employeeIds = [...new Set(statements.map((item) => String(item.employeeId)))];
  const [company, employees] = await Promise.all([
    Company.findById(companyId), Employee.find({ companyId, _id: { $in: employeeIds } })
  ]);
  if (!company) return res.status(404).json({ message: 'Employer not found.' });
  const forms: T4PdfData[] = employees.map((employee) => {
    const employeeStatements = statements.filter((item) => String(item.employeeId) === String(employee._id));
    const deduction = (...codes: string[]) => formatMoney(sumMoney(employeeStatements.flatMap((item) =>
      item.deductions.filter((line) => codes.includes(line.code || '')).map((line) => line.amount)
    )));
    const address = employee.addresses?.[0];
    return {
      employerName: company.legalName, year,
      employerAddress: addressLines(company.address),
      sin: employee.sinEncrypted ? decryptSin(employee.sinEncrypted) : '',
      lastName: employee.legalLastName, firstName: employee.legalFirstName,
      initial: employee.middleName?.charAt(0) || '',
      address: address ? [address.street, `${address.city}, ${address.province}`, address.postalCode] : [],
      province: normalizeProvince(employee.taxProvince || address?.province || company.address?.province || 'AB'),
      employmentIncome: formatMoney(sumMoney(employeeStatements.map((item) =>
        item.grossPay || item.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0
      ))),
      incomeTax: deduction('TAX', 'FTAX', 'PTAX'), cppContributions: deduction('CPP'), eiPremiums: deduction('EI')
    };
  });
  await Promise.all(employees.map((employee) => TaxFormDocument.findOneAndUpdate(
    { employeeId: employee._id, companyId, taxYear: year, formType: 'T4' },
    { employeeId: employee._id, companyId, taxYear: year, formType: 'T4', generatedAt: new Date() },
    { upsert: true }
  )));
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId, eventType: 'T4_GENERATED', metadata: { year, employeeCount: employees.length } });
  res.type('application/pdf').setHeader('Content-Disposition', `attachment; filename="T4-${year}-${employeeId === 'all' ? 'all-employees' : employees[0].employeeNumber}.pdf"`).send(t4sPdf(forms, await selectedT4Format(company.settings)));
});

const roeSchema = z.object({
  companyId: z.string().regex(/^[a-f\d]{24}$/i),
  employeeId: z.string().regex(/^[a-f\d]{24}$/i),
  lastDayPaid: z.string().date(),
  finalPayPeriodEnd: z.string().date(),
  reasonCode: z.string().trim().min(1).max(3),
  reasonDescription: z.string().trim().min(2).max(100)
}).refine((value) => value.finalPayPeriodEnd >= value.lastDayPaid, {
  path: ['finalPayPeriodEnd'], message: 'Box 12 cannot be earlier than box 11'
});

router.post('/roe/generate', authenticate, requirePermission('tax.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = roeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Complete ROE boxes 11, 12 and 16.' });
  const { companyId, employeeId, lastDayPaid, finalPayPeriodEnd, reasonCode, reasonDescription } = parsed.data;
  const [company, employee, issuer, statements] = await Promise.all([
    Company.findById(companyId),
    Employee.findOne({ _id: employeeId, companyId }),
    EmployerUser.findOne({ companyId }).sort({ role: 1 }),
    PayStatement.find({ companyId, employeeId, supersededByStatementId: { $exists: false }, payDate: { $lte: new Date(`${finalPayPeriodEnd}T23:59:59.999Z`) } }).sort({ payDate: -1 }).limit(53)
  ]);
  if (!company || !employee) return res.status(404).json({ message: 'Employer or employee not found.' });
  if (!statements.length) return res.status(404).json({ message: 'No payroll records found for this employee.' });
  const companyAddress = company.address;
  const employeeAddress = employee.addresses?.[0];
  const cra = asRecord(company.craPayroll);
  const grossFor = (statement: typeof statements[number]) => formatMoney(statement.grossPay || statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0);
  const hoursFor = (statement: typeof statements[number]) => (statement.regularHours || 0) + (statement.overtimeHours || 0) + (statement.statePayHours || 0);
  const totalHours = statements.reduce((total, statement) => total + hoursFor(statement), 0);
  const totalEarnings = formatMoney(sumMoney(statements.map((statement) => statement.grossPay || statement.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || 0)));
  const dateOnly = (value?: Date) => value ? value.toISOString().slice(0, 10) : '';
  const payrollAccount = textValue(cra.payrollAccount, `${company.businessNumber || ''}RP${textValue(cra.accountSuffix, '0001')}`);
  const roeData = {
    payrollReference: employee.employeeNumber,
    employerName: company.legalName,
    employerAddress: [companyAddress?.street, companyAddress?.line2, [companyAddress?.city, companyAddress?.province].filter(Boolean).join(', ')].filter(Boolean) as string[],
    postalCode: companyAddress?.postalCode || '', craPayrollAccount: payrollAccount,
    payPeriodType: String(company.payrollConfiguration?.payFrequency || employee.payGroup || 'Biweekly'),
    sin: employee.sinEncrypted ? decryptSin(employee.sinEncrypted) : '',
    employeeName: `${employee.legalFirstName} ${employee.middleName || ''} ${employee.legalLastName}`.replace(/\s+/g, ' ').trim(),
    employeeAddress: employeeAddress ? [employeeAddress.street, `${employeeAddress.city}, ${employeeAddress.province}`, employeeAddress.postalCode] : [],
    firstDayWorked: dateOnly(employee.startDate), lastDayPaid, finalPayPeriodEnd,
    occupation: employee.occupation || textValue(asRecord(employee.adminProfile?.employment).jobTitle),
    expectedRecall: 'Unknown', totalInsurableHours: totalHours.toFixed(2), totalInsurableEarnings: totalEarnings,
    reasonCode, reasonDescription,
    issuerName: issuer?.name || 'Payroll Administrator',
    issuerPhone: issuer?.phone || company.customerCarePhone || '', issueDate: new Date().toISOString().slice(0, 10),
    payPeriods: statements.map((statement) => ({ endDate: dateOnly(statement.periodEnd || statement.payDate), earnings: grossFor(statement), hours: hoursFor(statement).toFixed(2) }))
  };
  const file = roePdf(roeData);
  await RoeDocument.create({ companyId, employeeId: employee._id, generatedBy: req.superAdminContext!.superAdminId, generatedAt: new Date(), data: roeData });
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId, employeeId: employee._id, eventType: 'ROE_GENERATED', metadata: { lastDayPaid, finalPayPeriodEnd, reasonCode } });
  res.type('application/pdf').setHeader('Content-Disposition', `attachment; filename="ROE-${employee.employeeNumber}-${lastDayPaid}.pdf"`).send(file);
});

const platformNotificationSchema = z.object({
  title: z.string().trim().min(2).max(100),
  body: z.string().trim().min(2).max(1000),
  audience: z.enum(['employers', 'employees', 'both'])
});

router.get('/notifications', authenticate, requirePermission('users.manage'), async (_req, res) => {
  const notifications = await PlatformNotification.find().sort({ postedAt: -1 });
  res.json({
    notifications: notifications.map((item) => ({
      id: String(item._id), title: item.title, body: item.body, audience: item.audience,
      postedAt: item.postedAt, postedBy: item.postedBy,
      employeeReadCount: item.readByEmployeeIds.length,
      employerReadCount: item.readByEmployerUserIds.length
    }))
  });
});

router.post('/notifications', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  const parsed = platformNotificationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid notification', issues: parsed.error.issues });
  const admin = await SuperAdmin.findById(req.superAdminContext?.superAdminId);
  const notification = await PlatformNotification.create({
    ...parsed.data, postedAt: new Date(), postedBy: admin?.name || 'Super Admin',
    readByEmployeeIds: [], readByEmployerUserIds: []
  });
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'PLATFORM_NOTIFICATION_PUBLISHED', metadata: { notificationId: String(notification._id), audience: notification.audience } });
  res.status(201).json({ id: String(notification._id) });
});

router.delete('/notifications/:id', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  const notification = await PlatformNotification.findByIdAndDelete(req.params.id);
  if (!notification) return res.status(404).json({ message: 'Notification not found' });
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'PLATFORM_NOTIFICATION_DELETED', metadata: { notificationId: String(notification._id) } });
  res.json({ success: true });
});

function requireSuperAdmin(req: AuthRequest, res: express.Response): boolean {
  if (!req.superAdminContext?.superAdminId) {
    res.status(403).json({ message: 'Super admin access is required' });
    return false;
  }
  return true;
}

function formatDateTime(value?: Date) {
  return value ? value.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }) : '-';
}

function formatDate(value?: Date) {
  return value ? value.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function rpAccount(company: { businessNumber?: string; craPayroll?: Record<string, unknown> }) {
  const cra = asRecord(company.craPayroll);
  return textValue(cra.payrollAccount, `${company.businessNumber || '000000000'}RP${textValue(cra.accountSuffix, '0001')}`);
}

function remittanceFrequencyFromCra(cra: Record<string, unknown>) {
  const frequency = textValue(cra.remittanceFrequency, textValue(cra.frequency));
  if (frequency) return frequency;
  const remitterType = textValue(cra.remitterType, 'Regular');
  return remitterType.toLowerCase().includes('quarter')
    ? 'Quarterly'
    : remitterType.toLowerCase().includes('accelerated')
      ? 'Weekly'
      : 'Monthly';
}

function nextRemittanceDate(frequencyOrRemitterType: string) {
  const date = new Date();
  date.setMonth(
    date.getMonth() + (frequencyOrRemitterType.toLowerCase().includes('quarter') ? 3 : 1),
    15
  );
  return date;
}

function payrollLineGovernmentLiability(line: {
  cpp?: MoneyValue;
  cpp2?: MoneyValue;
  ei?: MoneyValue;
  federalTax?: MoneyValue;
  provincialTax?: MoneyValue;
}): MoneyValue {
  const cpp = sumMoney([line.cpp || 0, line.cpp2 || 0]);
  const ei = moneyToDecimal(line.ei || 0);
  return sumMoney([
    cpp,
    ei,
    line.federalTax || 0,
    line.provincialTax || 0,
    cpp,
    ei.times(1.4)
  ]);
}

function monthlyRemittanceDueDate(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 15));
}

function remittancePeriodLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString('en-CA', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  });
}

async function syncCompanyCraRemittancesFromRuns(companyId: mongoose.Types.ObjectId | string) {
  const runs = await PayrollRun.find({
    companyId,
    status: { $in: ['finalized', 'locked', 'adjusted'] }
  }).sort({ payDate: 1 });
  const monthly = new Map<string, { year: number; month: number; amounts: MoneyValue[] }>();
  for (const run of runs) {
    const year = run.payDate.getUTCFullYear();
    const month = run.payDate.getUTCMonth();
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    const bucket = monthly.get(key) || { year, month, amounts: [] };
    bucket.amounts.push(...run.lines.map(payrollLineGovernmentLiability));
    monthly.set(key, bucket);
  }
  const operations: Parameters<typeof GovernmentFiling.bulkWrite>[0] = [];
  for (const [key, bucket] of monthly) {
    const dueDate = monthlyRemittanceDueDate(bucket.year, bucket.month);
    operations.push({
      updateOne: {
        filter: { companyId, filingKey: `CRA_REMITTANCE:${key}` },
        update: {
          $set: {
            title: 'CRA Remittance (Wages, CPP, EI, Income Tax)',
            year: bucket.year,
            period: remittancePeriodLabel(bucket.year, bucket.month),
            dueDate,
            amount: formatMoney(sumMoney(bucket.amounts))
          },
          $setOnInsert: {
            companyId,
            filingKey: `CRA_REMITTANCE:${key}`,
            type: 'CRA_REMITTANCE',
            status: 'pending',
            documents: [{ name: `cra_remittance-${key}.csv`, kind: 'data' }]
          }
        },
        upsert: true
      }
    });
  }
  if (operations.length) await GovernmentFiling.bulkWrite(operations);
  await GovernmentFiling.updateMany(
    { companyId, type: 'CRA_REMITTANCE', status: { $in: ['pending', 'prepared'] }, dueDate: { $lt: new Date() } },
    { $set: { status: 'overdue' } }
  );
}

function normalizedCraPayroll(value: unknown) {
  const cra = asRecord(value);
  const frequency = remittanceFrequencyFromCra(cra);
  return {
    ...cra,
    remitterType: textValue(
      cra.remitterType,
      frequency === 'Monthly' ? 'Regular' : frequency
    ),
    remittanceFrequency: frequency,
    frequency
  };
}

async function buildPayrollAccountsPayload() {
  const companies = await Company.find().sort({ legalName: 1 });
  await Promise.all(companies.map((company) => syncCompanyCraRemittancesFromRuns(company._id)));
  const [runs, filings] = await Promise.all([
    PayrollRun.find({ status: { $in: ['finalized', 'locked', 'adjusted'] } }).sort({ payDate: -1 }),
    GovernmentFiling.find({ type: 'CRA_REMITTANCE' }).sort({ dueDate: 1 })
  ]);
  const filingsByCompany = new Map<string, typeof filings>();
  for (const filing of filings) {
    const key = String(filing.companyId);
    filingsByCompany.set(key, [...(filingsByCompany.get(key) || []), filing]);
  }
  const runsByCompany = new Map<string, typeof runs>();
  for (const run of runs) {
    const key = String(run.companyId);
    runsByCompany.set(key, [...(runsByCompany.get(key) || []), run]);
  }
  const accounts = companies.map((company) => {
    const cra = asRecord(company.craPayroll);
    const banking = asRecord(company.banking);
    const remitterType = textValue(cra.remitterType, textValue(cra.remittanceFrequency, 'Regular'));
    const frequency = remittanceFrequencyFromCra(cra);
    const companyRuns = runsByCompany.get(String(company._id)) || [];
    const payments = Array.isArray(cra.payments) ? cra.payments : [];
    const companyFilings = filingsByCompany.get(String(company._id)) || [];
    const unpaidFilings = companyFilings.filter((filing) => filing.status !== 'filed');
    const legacyPaidAmount = payments
      .filter((payment) => {
        const record = asRecord(payment);
        return !record.filingId && !Array.isArray(record.appliedFilingIds);
      })
      .reduce((sum, payment) => sum + Number(asRecord(payment).amount || 0), 0);
    const grossLiability = unpaidFilings.length
      ? Number(formatMoney(sumMoney(unpaidFilings.map((filing) => filing.amount))))
      : Number(textValue(cra.currentLiability, '0.00'));
    const liability = Math.max(0, grossLiability - legacyPaidAmount).toFixed(2);
    const nextUnpaidFiling = unpaidFilings[0];
    const due = nextUnpaidFiling
      ? formatDate(nextUnpaidFiling.dueDate)
      : textValue(cra.nextRemittanceDue) || formatDate(nextRemittanceDate(frequency));
    return {
      id: String(company._id),
      employer: company.legalName,
      location: [company.address?.city, company.address?.province].filter(Boolean).join(', '),
      businessNumber: company.businessNumber || '',
      rpAccountNumber: rpAccount(company),
      remitterType,
      frequency,
      nextRemittanceDue: due,
      currentCraLiability: liability,
      status: textValue(cra.accountStatus, company.status === 'active' ? 'Active' : 'Setup Required'),
      province: company.address?.province || textValue(cra.province, ''),
      lastUpdated: formatDate(company.createdAt),
      bankInstitution: textValue(banking.bankName, '-'),
      accountType: textValue(banking.accountType, 'Business Chequing'),
      accountNumber: textValue(banking.accountNumber) ? `****${textValue(banking.accountNumber).slice(-4)}` : '-',
      usedFor: textValue(banking.usedFor, 'Payroll, CRA'),
      verificationStatus: textValue(banking.verificationStatus, textValue(banking.accountNumber) ? 'Verified' : 'Pending'),
      bankStatus: textValue(banking.status, textValue(banking.accountNumber) ? 'Active' : 'Pending'),
      payments,
      notes: Array.isArray(cra.notes) ? cra.notes : [],
      remitterHistory: Array.isArray(cra.remitterHistory) ? cra.remitterHistory : [{ remitterType, effectiveDate: 'Jan 1, 2026', changedBy: 'System' }],
      payrollRuns: companyRuns.slice(0, 8).map((run) => ({ id: String(run._id), period: `${formatDate(run.periodStart)} - ${formatDate(run.periodEnd)}`, payDate: formatDate(run.payDate), totalDeductions: formatMoney(run.totalDeductions), status: run.status }))
    };
  });
  return {
    metrics: {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter((account) => account.status === 'Active').length,
      actionRequired: accounts.filter((account) => account.status !== 'Active').length,
      dueSoon: accounts.length,
      totalOutstanding: accounts.reduce((sum, account) => sum + Number(account.currentCraLiability || 0), 0)
    },
    accounts
  };
}

function splitAccessUserKey(userKey: string) {
  const [kind, id] = decodeURIComponent(userKey).split(':');
  return { kind, id };
}

router.post('/auth/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid login request' });
  const email = parsed.data.email.trim().toLowerCase();
  const admin = await SuperAdmin.findOne({ email });
  const ok = admin ? await verifyPassword(parsed.data.password, admin.passwordHash) : false;
  await auditEvent(req, { userId: admin?._id, eventType: ok ? 'SUPER_ADMIN_LOGIN_SUCCESS' : 'SUPER_ADMIN_LOGIN_FAILURE' });
  if (!admin || !ok || !admin.isActive) return res.status(401).json({ message: 'Invalid email or password. Check that you selected Super Admin login and entered the account email and current password.' });
  admin.lastLoginAt = new Date();
  await admin.save();
  res.json({ token: signSuperAdminToken(String(admin._id)), user: { id: String(admin._id), name: admin.name, email: admin.email, mustChangePassword: Boolean(admin.mustChangePassword) } });
});

router.get('/dashboard', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const [companies, employerUsers, employeeCounts] = await Promise.all([
    Company.find().sort({ createdAt: -1 }),
    EmployerUser.find().sort({ createdAt: 1 }),
    Employee.aggregate<{ _id: unknown; count: number }>([
      { $group: { _id: '$companyId', count: { $sum: 1 } } }
    ])
  ]);
  const primaryByCompany = new Map<string, (typeof employerUsers)[number]>();
  for (const user of employerUsers) {
    const companyIds = [user.companyId, ...(user.companyIds || [])];
    for (const companyId of companyIds) {
      const key = String(companyId);
      const current = primaryByCompany.get(key);
      if (!current || (user.role === 'Company Owner' && current.role !== 'Company Owner')) {
        primaryByCompany.set(key, user);
      }
    }
  }
  const employeeCountByCompany = new Map(
    employeeCounts.map((entry) => [String(entry._id), entry.count])
  );
  res.json({
    user: { name: 'Super Admin', organization: 'Payhours Inc.' },
    metrics: {
      employers: companies.length,
      activeEmployers: companies.filter((company) => (company.status || 'active') === 'active').length,
      pendingActivation: companies.filter((company) => company.status === 'pending_activation').length,
      draftEmployers: companies.filter((company) => company.status === 'draft').length
    },
    employers: companies.map((company) => {
      const primary = primaryByCompany.get(String(company._id));
      return {
        id: String(company._id),
        legalName: company.legalName,
        operatingName: company.operatingName,
        customerId: company.customerId,
        status: company.status || 'active',
        businessNumber: company.businessNumber,
        employeeCount: employeeCountByCompany.get(String(company._id)) || 0,
        plan: company.subscription?.plan || 'Standard',
        primaryContact: primary ? { name: primary.name, email: primary.email } : undefined,
        createdAt: company.createdAt
      };
    })
  });
});

router.get('/payroll-runs', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const [runs, companies] = await Promise.all([
    PayrollRun.find().sort({ payDate: -1 }).limit(250),
    Company.find().select('legalName customerId')
  ]);
  const companyById = new Map(companies.map((company) => [String(company._id), company]));
  const rows = runs.map((run) => {
    const company = companyById.get(String(run.companyId));
    return {
      id: String(run._id),
      employerId: String(run.companyId),
      employer: company?.legalName || 'Unknown Employer',
      customerId: company?.customerId || '-',
      periodStart: formatDate(run.periodStart),
      periodEnd: formatDate(run.periodEnd),
      payDate: formatDate(run.payDate),
      employeeCount: run.employeeCount,
      totalHours: run.totalHours,
      grossPay: formatMoney(run.estimatedGross),
      deductions: formatMoney(run.totalDeductions),
      netPay: formatMoney(run.totalNetPay),
      status: run.status
    };
  });
  res.json({
    metrics: {
      totalRuns: rows.length,
      inProgress: rows.filter((run) => ['draft', 'in_review', 'approved'].includes(run.status)).length,
      completed: rows.filter((run) => ['finalized', 'locked', 'adjusted'].includes(run.status)).length,
      actionRequired: rows.filter((run) => ['draft', 'in_review', 'reversed'].includes(run.status)).length
    },
    runs: rows
  });
});

router.get('/access', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const [superAdmins, employerUsers, companies, persistedRoles, recentLogs, companyList] = await Promise.all([
    SuperAdmin.find().sort({ createdAt: 1 }),
    EmployerUser.find().sort({ createdAt: 1 }),
    Company.countDocuments(),
    AccessRole.find().sort({ createdAt: 1 }),
    AuditLog.find().sort({ createdAt: -1 }).limit(50),
    Company.find().select('legalName operatingName')
  ]);
  const companiesById = new Map(companyList.map((company) => [String(company._id), company.operatingName || company.legalName]));
  const accessUsers = [
    ...superAdmins.map((admin) => ({
      id: `superAdmin:${String(admin._id)}`,
      name: admin.name,
      email: admin.email,
      role: admin.role || 'CyberNest Super Admin',
      employer: 'Payhours Inc.',
      status: admin.isActive ? 'Active' : 'Inactive',
      lastLogin: formatDateTime(admin.lastLoginAt),
      createdDate: formatDate(admin.createdAt),
      phone: admin.phone || '-',
      department: admin.department || 'Platform Administration',
      permissions: admin.permissions || {},
      timeZone: 'Mountain Time (MT)',
      twoFactor: 'Not configured',
      loginMethod: 'Email & Password'
    })),
    ...employerUsers.map((user) => ({
      id: `employer:${String(user._id)}`,
      name: user.name,
      email: user.email,
      role: user.role,
      employer: Array.from(new Set([String(user.companyId), ...(user.companyIds || []).map(String)]))
        .map((companyId) => companiesById.get(companyId))
        .filter(Boolean)
        .join(', ') || 'Unknown employer',
      status: user.isActive ? 'Active' : 'Inactive',
      lastLogin: formatDateTime(user.lastLoginAt),
      createdDate: formatDate(user.createdAt),
      phone: user.phone || '-',
      department: user.jobTitle || 'Employer User',
      timeZone: 'Company default',
      twoFactor: 'Not configured',
      loginMethod: 'Email & Password'
    }))
  ];
  const activeUsers = accessUsers.filter((user) => user.status === 'Active').length;
  const payload = superAdminAccessPayload({ totalUsers: accessUsers.length, activeUsers, employers: companies });
  payload.users = accessUsers;
  payload.metrics.totalUsers = accessUsers.length;
  payload.metrics.activeUsers = activeUsers;
  payload.metrics.inactiveUsers = accessUsers.length - activeUsers;
  payload.metrics.pendingInvitations = accessUsers.filter((user) => user.status === 'Pending').length;
  payload.metrics.userRoles = new Set(accessUsers.map((user) => user.role)).size;
  payload.metrics.activities = recentLogs.length;
  payload.metrics.activeActivityUsers = new Set(recentLogs.map((log) => String(log.userId || 'System'))).size;
  payload.metrics.employersWithActivity = new Set(recentLogs.filter((log) => log.companyId).map((log) => String(log.companyId))).size;
  payload.metrics.securityIssues = 0;
  if (persistedRoles.length) {
    payload.roles = persistedRoles.map((role) => ({
      id: String(role._id),
      userType: role.userType || 'superAdmin',
      name: role.name,
      type: role.type,
      description: role.description,
      users: role.users,
      status: role.status,
      createdDate: role.createdAt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }),
      lastUpdated: role.updatedAt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }),
      permissions: role.permissions
    }));
    payload.metrics.totalRoles = payload.roles.length;
    payload.metrics.activeRoles = payload.roles.filter((role) => role.status === 'Active').length;
    payload.metrics.inactiveRoles = payload.roles.filter((role) => role.status !== 'Active').length;
    payload.metrics.usersAssigned = payload.roles.reduce((sum, role) => sum + role.users, 0);
  }
  payload.activityLogs = recentLogs.map((log) => ({
    id: String(log._id),
    userType: log.metadata?.userType || (superAdmins.some((admin) => String(admin._id) === String(log.userId)) || log.eventType.startsWith('SUPER_ADMIN') ? 'superAdmin' : 'employer'),
    dateTime: log.createdAt.toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' }),
    user: log.metadata?.actorName ? String(log.metadata.actorName) : String(log.userId || 'System'),
    employer: log.companyId ? companiesById.get(String(log.companyId)) || 'Unknown employer' : 'Payhours',
    role: log.eventType.startsWith('SUPER_ADMIN') ? 'CyberNest Super Admin' : 'Employer User',
    action: log.eventType.replace(/_/g, ' '),
    module: String(log.metadata?.module || 'Audit'),
    details: String(log.metadata?.action || log.metadata?.details || log.eventType),
    status: 'Success',
    ipAddress: log.ipAddress || '-',
    referenceId: String(log._id).slice(-8).toUpperCase(),
    device: log.userAgent || '-',
    location: '-'
  }));
  const employerModules = permissionModules.filter((module) => !['Employers', 'System Administration', 'Billing & Subscriptions'].includes(module.name));
  const employerRoles = roleNames.filter((name) => name !== 'CyberNest Super Admin').map((name) => ({
    id: 'employer-role:' + name, userType: 'employer' as const, name, type: 'System' as const,
    description: 'Built-in ' + name + ' role', users: employerUsers.filter((user) => user.role === name).length,
    status: 'Active' as const, createdDate: '-', lastUpdated: '-', permissions: { 'Built-in permissions': permissionsForRole(name) }
  }));
  payload.roles = [...payload.roles, ...accessRoles.filter((role) => !payload.roles.some((item) => item.userType !== 'employer' && item.name === role.name)), ...employerRoles.filter((role) => !payload.roles.some((item) => item.userType === 'employer' && item.name === role.name))];
  payload.roles = payload.roles.map((role) => ({ ...role, users: accessUsers.filter((user) => user.role === role.name && user.id.startsWith((role.userType || 'superAdmin') + ':')).length }));
  res.json({ ...payload, companies: companyList.map((company) => ({ id: String(company._id), name: company.operatingName || company.legalName })), employerModules });
});

const updateAccessUserSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  role: z.string().optional(),
  phone: z.string().optional(),
  department: z.string().optional(),
  permissions: z.record(z.string(), z.array(z.string())).optional(),
  status: z.enum(['Active', 'Inactive']).optional()
});

const createAccessUserSchema = z.object({
  userType: z.enum(['superAdmin', 'employer']).default('superAdmin'),
  companyId: z.string().optional(),
  name: z.string().min(2),
  email: z.string().email(),
  role: z.string().min(2).default('CyberNest Super Admin'),
  phone: z.string().optional(),
  department: z.string().optional(),
  permissions: z.record(z.string(), z.array(z.string())).default({}),
  status: z.enum(['Active', 'Inactive']).default('Active')
});

function serializeSuperAdminAccessUser(user: InstanceType<typeof SuperAdmin>) {
  return {
    id: `superAdmin:${String(user._id)}`,
    name: user.name,
    email: user.email,
    role: user.role || 'CyberNest Super Admin',
    employer: 'Payhours Inc.',
    status: user.isActive ? 'Active' : 'Inactive',
    lastLogin: formatDateTime(user.lastLoginAt),
    createdDate: formatDate(user.createdAt),
    phone: user.phone || '-',
    department: user.department || 'Platform Administration',
    permissions: user.permissions || {},
    timeZone: 'Mountain Time (MT)',
    twoFactor: 'Not configured',
    loginMethod: 'Email & Password'
  };
}

router.post('/access/users', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = createAccessUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid user details', issues: parsed.error.issues });
  const data = parsed.data;
  const email = data.email.toLowerCase();
  if (!(await validAccessRole(data.role, data.userType))) return res.status(400).json({ message: 'Choose an active role for this user type.' });
  if (data.userType === 'employer') {
    if (!data.companyId || !mongoose.isValidObjectId(data.companyId)) return res.status(400).json({ message: 'Choose an employer.' });
    const company = await Company.findById(data.companyId);
    if (!company) return res.status(400).json({ message: 'Employer not found.' });
    if (await EmployerUser.exists({ email })) return res.status(409).json({ message: 'An employer user already exists with that email.' });
    const temporaryPassword = generateTemporaryPassword();
    const user = await EmployerUser.create({ name: data.name, email, role: data.role, companyId: company._id, companyIds: [company._id], phone: data.phone, jobTitle: data.department, passwordHash: await hashPassword(temporaryPassword), isActive: data.status === 'Active', mustChangePassword: true });
    await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: company._id, eventType: 'USER_UPDATED', metadata: { userType: 'employer', action: 'Created employer user ' + email, module: 'Users & Access' } });
    return res.status(201).json({ user: { id: 'employer:' + user._id, name: user.name, email, role: user.role, employer: company.operatingName || company.legalName, status: user.isActive ? 'Active' : 'Inactive', phone: user.phone || '-', department: user.jobTitle || 'Employer User', createdDate: formatDate(user.createdAt), lastLogin: '-', timeZone: 'Company default', twoFactor: 'Not configured', loginMethod: 'Email & Password' }, temporaryPassword });
  }
  const existing = await SuperAdmin.findOne({ email });
  if (existing) return res.status(409).json({ message: 'A Super Admin user already exists with that email.' });
  const temporaryPassword = generateTemporaryPassword();
  const user = await SuperAdmin.create({
    name: data.name,
    email,
    role: data.role,
    phone: data.phone || '',
    department: data.department || 'Platform Administration',
    permissions: data.permissions || {},
    passwordHash: await hashPassword(temporaryPassword),
    isActive: data.status === 'Active'
  });
  await auditEvent(req, {
    userId: req.superAdminContext!.superAdminId,
    eventType: 'USER_UPDATED',
    metadata: { action: `Created platform user ${user.email}`, module: 'Users & Access', role: user.role }
  });
  res.status(201).json({ user: serializeSuperAdminAccessUser(user), temporaryPassword });
});

router.put('/access/users/:userKey', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = updateAccessUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid user details', issues: parsed.error.issues });
  const { kind, id } = splitAccessUserKey(String(req.params.userKey));
  const data = parsed.data;
  if (data.role && !(await validAccessRole(data.role, kind))) return res.status(400).json({ message: 'Choose an active role for this user type.' });

  if (kind === 'superAdmin') {
    const user = await SuperAdmin.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (data.name !== undefined) user.name = data.name;
    if (data.email !== undefined) user.email = data.email.toLowerCase();
    if (data.role !== undefined) user.role = data.role;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.department !== undefined) user.department = data.department;
    if (data.permissions !== undefined) user.permissions = data.permissions;
    if (data.status !== undefined) user.isActive = data.status === 'Active';
    await user.save();
    await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'USER_UPDATED', metadata: { action: `Updated platform user ${user.email}`, module: 'Users & Access' } });
    return res.json({ user: serializeSuperAdminAccessUser(user) });
  }

  if (kind === 'employer') {
    const user = await EmployerUser.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (data.name !== undefined) user.name = data.name;
    if (data.email !== undefined) user.email = data.email.toLowerCase();
    if (data.role !== undefined) user.role = data.role;
    if (data.phone !== undefined) user.phone = data.phone;
    if (data.department !== undefined) user.jobTitle = data.department;
    if (data.status !== undefined) user.isActive = data.status === 'Active';
    await user.save();
    const company = await Company.findById(user.companyId);
    await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: user.companyId, eventType: 'EMPLOYER_UPDATED', metadata: { action: `Updated user ${user.email}`, module: 'Users & Access' } });
    return res.json({ user: { id: `employer:${String(user._id)}`, name: user.name, email: user.email, role: user.role, employer: company?.operatingName || company?.legalName || 'Unknown employer', status: user.isActive ? 'Active' : 'Inactive', lastLogin: formatDateTime(user.lastLoginAt), createdDate: formatDate(user.createdAt), phone: user.phone || '-', department: user.jobTitle || 'Employer User', timeZone: 'Company default', twoFactor: 'Not configured', loginMethod: 'Email & Password' } });
  }

  return res.status(400).json({ message: 'Unsupported user type' });
});

router.delete('/access/users/:userKey', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const { kind, id } = splitAccessUserKey(String(req.params.userKey));
  if (kind === 'superAdmin') {
    const remainingAdmins = await SuperAdmin.countDocuments({ isActive: true, _id: { $ne: id } });
    if (remainingAdmins < 1) return res.status(400).json({ message: 'At least one active super admin must remain' });
    const user = await SuperAdmin.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'USER_DELETED', metadata: { action: `Deleted platform user ${user.email}`, module: 'Users & Access' } });
    return res.json({ deleted: true, userId: req.params.userKey });
  }
  if (kind === 'employer') {
    const user = await EmployerUser.findByIdAndDelete(id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: user.companyId, eventType: 'EMPLOYER_DELETED', metadata: { action: `Deleted employer user ${user.email}`, module: 'Users & Access' } });
    return res.json({ deleted: true, userId: req.params.userKey });
  }
  return res.status(400).json({ message: 'Unsupported user type' });
});

async function validAccessRole(name: string, userType: string) {
  if (userType === 'employer' && roleNames.some((role) => role === name && role !== 'CyberNest Super Admin')) return true;
  if (userType === 'superAdmin' && (name === 'CyberNest Super Admin' || accessRoles.some((role) => role.name === name && role.status === 'Active'))) return true;
  return Boolean(await AccessRole.exists({ name, status: 'Active', ...(userType === 'employer' ? { userType } : { userType: { $ne: 'employer' } }) }));
}

const createRoleSchema = z.object({
  userType: z.enum(['superAdmin', 'employer']).default('superAdmin'),
  name: z.string().min(2),
  type: z.enum(['System', 'Custom']).default('System'),
  description: z.string().max(250).optional(),
  status: z.enum(['Active', 'Inactive']).default('Active'),
  permissions: z.record(z.string(), z.array(z.string())).default({})
});

const updateRoleSchema = createRoleSchema.omit({ userType: true }).partial();

function serializeAccessRole(role: InstanceType<typeof AccessRole>) {
  return {
    id: String(role._id),
    userType: role.userType || 'superAdmin',
    name: role.name,
    type: role.type,
    description: role.description,
    users: role.users,
    status: role.status,
    createdDate: role.createdAt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }),
    lastUpdated: role.updatedAt.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }),
    permissions: role.permissions
  };
}

router.post('/roles', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid role details', issues: parsed.error.issues });
  if (await AccessRole.exists({ name: parsed.data.name })) return res.status(409).json({ message: 'A role already exists with that name.' });
  if (roleNames.some((name) => name === parsed.data.name)) return res.status(409).json({ message: 'This name is reserved for a built-in role.' });
  if (parsed.data.userType === 'employer' && Object.keys(parsed.data.permissions).some((name) => ['Employers', 'System Administration', 'Billing & Subscriptions'].includes(name))) return res.status(400).json({ message: 'Employer roles cannot include platform administration modules.' });
  const persistedRole = await AccessRole.create({
    userType: parsed.data.userType,
    name: parsed.data.name,
    type: parsed.data.type,
    description: parsed.data.description || 'No description added yet.',
    users: 0,
    status: parsed.data.status,
    permissions: parsed.data.permissions
  });
  const role = serializeAccessRole(persistedRole);
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'ROLE_CREATED', metadata: { userType: role.userType, roleName: role.name, modules: Object.keys(role.permissions) } });
  res.status(201).json({ role, modules: permissionModules });
});

router.put('/roles/:id', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = updateRoleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid role details', issues: parsed.error.issues });
  const role = await AccessRole.findById(req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (parsed.data.name !== undefined && parsed.data.name !== role.name) {
    return res.status(400).json({ message: 'Role names cannot be changed after creation.' });
  }
  if (role.userType === 'employer' && parsed.data.permissions && Object.keys(parsed.data.permissions).some((name) => ['Employers', 'System Administration', 'Billing & Subscriptions'].includes(name))) return res.status(400).json({ message: 'Employer roles cannot include platform administration modules.' });
  if (parsed.data.type !== undefined) role.type = parsed.data.type;
  if (parsed.data.description !== undefined) role.description = parsed.data.description || 'No description added yet.';
  if (parsed.data.status !== undefined) role.status = parsed.data.status;
  if (parsed.data.permissions !== undefined) role.permissions = parsed.data.permissions;
  await role.save();
  const serialized = serializeAccessRole(role);
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'ROLE_UPDATED', metadata: { userType: role.userType, action: `Updated role ${role.name}`, module: 'Users & Access' } });
  res.json({ role: serialized });
});

router.delete('/roles/:id', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const role = await AccessRole.findById(req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found' });
  if (role.type === 'System') return res.status(400).json({ message: 'System roles cannot be deleted. Deactivate them instead.' });
  const assigned = role.userType === 'employer' ? await EmployerUser.countDocuments({ role: role.name }) : await SuperAdmin.countDocuments({ role: role.name });
  if (assigned > 0) return res.status(400).json({ message: 'Cannot delete a role while users are assigned to it.' });
  await AccessRole.deleteOne({ _id: role._id });
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, eventType: 'ROLE_DELETED', metadata: { userType: role.userType, action: `Deleted role ${role.name}`, module: 'Users & Access' } });
  res.json({ deleted: true, roleId: req.params.id });
});

const createEmployerSchema = z.object({
  legalName: z.string().min(2),
  operatingName: z.string().optional(),
  businessNumber: z.string().min(3),
  businessType: z.string().optional(),
  industry: z.string().optional(),
  naicsCode: z.string().optional(),
  employeeCount: z.coerce.number().min(0).default(0),
  address: z.object({
    street: z.string().optional(),
    line2: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional()
  }).optional(),
  primaryContact: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
    jobTitle: z.string().optional()
  }),
  craPayroll: z.record(z.string(), z.unknown()).optional(),
  payrollConfiguration: z.record(z.string(), z.unknown()).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
  banking: z.record(z.string(), z.unknown()).optional(),
  subscription: z.object({
    plan: z.string().optional(),
    billingFrequency: z.string().optional(),
    startDate: z.string().optional()
  }).optional(),
  features: z.record(z.string(), z.boolean()).optional(),
  sendEmail: z.boolean().default(true),
  status: z.enum(['draft', 'pending_activation', 'active']).default('pending_activation')
});

const updateEmployerSchema = createEmployerSchema.partial().extend({
  businessNumber: z.string().optional(),
  primaryContact: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.union([z.literal(''), z.string().email()]).optional(),
      phone: z.string().optional(),
      jobTitle: z.string().optional()
    })
    .optional(),
  status: z.enum(['draft', 'pending_activation', 'active', 'suspended']).optional()
});

router.post('/employers', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = createEmployerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid employer details', issues: parsed.error.issues });
  const data = parsed.data;
  const customerId = `PH${Date.now().toString().slice(-6)}`;
  const temporaryPassword = generateTemporaryPassword();
  const company = await Company.create({
    legalName: data.legalName,
    operatingName: data.operatingName,
    customerId,
    businessNumber: data.businessNumber,
    businessType: data.businessType,
    industry: data.industry,
    naicsCode: data.naicsCode,
    employeeCount: data.employeeCount,
    address: data.address,
    craPayroll: normalizedCraPayroll(data.craPayroll),
    payrollConfiguration: withVacationPolicy(data.payrollConfiguration, data.address?.province),
    settings: data.settings,
    banking: data.banking,
    subscription: data.subscription,
    features: data.features,
    status: data.status
  });
  const employer = await EmployerUser.create({
    companyId: company._id,
    name: `${data.primaryContact.firstName} ${data.primaryContact.lastName}`,
    email: data.primaryContact.email.toLowerCase(),
    phone: data.primaryContact.phone,
    jobTitle: data.primaryContact.jobTitle,
    passwordHash: await hashPassword(temporaryPassword),
    role: 'Company Owner',
    isActive: true,
    mustChangePassword: true
  });
  let emailSent = false;
  let emailError: string | undefined;
  if (data.sendEmail) {
    try {
      await sendEmployerCredentialsEmail(String(employer._id), temporaryPassword);
      emailSent = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : 'Unable to send employer email';
      console.error('Employer credentials email failed:', error);
    }
  }
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: company._id, eventType: 'EMPLOYER_CREATED', metadata: { employerUserId: employer._id } });
  res.status(201).json({
    employer: { id: String(company._id), legalName: company.legalName, customerId, primaryContactEmail: employer.email },
    temporaryPassword,
    emailSent,
    emailError
  });
});

router.get('/employers/:id', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const [company, linkedEmployers, employeeCount] = await Promise.all([
    Company.findById(req.params.id),
    EmployerUser.find({
      $or: [{ companyId: req.params.id }, { companyIds: req.params.id }]
    }).sort({ createdAt: 1 }),
    Employee.countDocuments({ companyId: req.params.id })
  ]);
  if (!company) return res.status(404).json({ message: 'Employer not found' });
  const employer =
    linkedEmployers.find((user) => user.role === 'Company Owner') || linkedEmployers[0];
  const [firstName = '', ...lastNameParts] = (employer?.name || '').split(' ');
  res.json({
    employer: {
      id: String(company._id),
      legalName: company.legalName,
      operatingName: company.operatingName || '',
      customerId: company.customerId,
      businessNumber: company.businessNumber || '',
      businessType: company.businessType || '',
      industry: company.industry || '',
      naicsCode: company.naicsCode || '',
      employeeCount,
      status: company.status || 'active',
      address: company.address || {},
      craPayroll: company.craPayroll || {},
      payrollConfiguration: company.payrollConfiguration || {},
      settings: company.settings || {},
      banking: company.banking || {},
      subscription: company.subscription || {},
      features: company.features || {},
      primaryContact: employer ? {
        firstName,
        lastName: lastNameParts.join(' '),
        email: employer.email,
        phone: employer.phone || '',
        jobTitle: employer.jobTitle || ''
      } : undefined
    }
  });
});

router.put('/employers/:id', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = updateEmployerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid employer details', issues: parsed.error.issues });

  const data = parsed.data;
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ message: 'Employer not found' });

  if (data.legalName !== undefined) company.legalName = data.legalName;
  if (data.operatingName !== undefined) company.operatingName = data.operatingName;
  if (data.businessNumber !== undefined) company.businessNumber = data.businessNumber;
  if (data.businessType !== undefined) company.businessType = data.businessType;
  if (data.industry !== undefined) company.industry = data.industry;
  if (data.naicsCode !== undefined) company.naicsCode = data.naicsCode;
  if (data.employeeCount !== undefined) company.employeeCount = data.employeeCount;
  if (data.address !== undefined) company.address = data.address;
  if (data.craPayroll !== undefined) company.craPayroll = normalizedCraPayroll(data.craPayroll);
  if (data.payrollConfiguration !== undefined || data.address?.province !== undefined) {
    company.payrollConfiguration = withVacationPolicy(
      data.payrollConfiguration || company.payrollConfiguration,
      data.address?.province || company.address?.province
    );
  }
  if (data.settings !== undefined) company.settings = data.settings;
  if (data.banking !== undefined) company.banking = data.banking;
  if (data.subscription !== undefined) company.subscription = data.subscription;
  if (data.features !== undefined) company.features = data.features;
  if (data.status !== undefined) company.status = data.status;
  await company.save();

  if (data.primaryContact) {
    const employer = await EmployerUser.findOne({ companyId: company._id }).sort({ createdAt: 1 });
    if (employer) {
      employer.name = `${data.primaryContact.firstName || employer.name.split(' ')[0] || ''} ${data.primaryContact.lastName || employer.name.split(' ').slice(1).join(' ') || ''}`.trim();
      if (data.primaryContact.email) employer.email = data.primaryContact.email.toLowerCase();
      employer.phone = data.primaryContact.phone;
      employer.jobTitle = data.primaryContact.jobTitle;
      await employer.save();
    }
  }

  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: company._id, eventType: 'EMPLOYER_UPDATED', metadata: { action: `Updated ${company.legalName}` } });
  res.json({ employer: { id: String(company._id), legalName: company.legalName, operatingName: company.operatingName, customerId: company.customerId, status: company.status, employeeCount: company.employeeCount || 0, plan: company.subscription?.plan || 'Standard' } });
});

router.post('/employers/:id/resend-activation', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ message: 'Employer not found' });

  const employer = await EmployerUser.findOne({ companyId: company._id }).sort({ createdAt: 1 });
  if (!employer) return res.status(404).json({ message: 'Employer login not found' });

  const temporaryPassword = generateTemporaryPassword();
  employer.passwordHash = await hashPassword(temporaryPassword);
  employer.isActive = true;
  employer.mustChangePassword = true;
  employer.companyId = company._id;
  employer.companyIds = Array.from(new Set([String(company._id), ...(employer.companyIds || []).map(String)]))
    .map((id) => new mongoose.Types.ObjectId(id));
  employer.lastSelectedCompanyId = company._id;
  await employer.save();

  let emailSent = false;
  let emailError: string | undefined;
  try {
    await sendEmployerCredentialsEmail(String(employer._id), temporaryPassword);
    emailSent = true;
  } catch (error) {
    emailError = error instanceof Error ? error.message : 'Unable to send employer email';
    console.error('Employer activation email failed:', error);
  }

  await auditEvent(req, {
    userId: req.superAdminContext!.superAdminId,
    companyId: company._id,
    eventType: 'EMPLOYER_UPDATED',
    metadata: { action: 'Activation email resent', employerUserId: employer._id, emailSent }
  });

  res.json({
    employer: {
      id: String(company._id),
      legalName: company.legalName,
      customerId: company.customerId,
      primaryContactEmail: employer.email
    },
    temporaryPassword,
    emailSent,
    emailError
  });
});

router.delete('/employers/:id', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ message: 'Employer not found' });

  await EmployerUser.deleteMany({ companyId: company._id });
  await Company.deleteOne({ _id: company._id });
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: company._id, eventType: 'EMPLOYER_DELETED', metadata: { action: `Deleted ${company.legalName}` } });
  res.json({ deleted: true, employerId: req.params.id });
});

router.get('/payroll-accounts', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  res.json(await buildPayrollAccountsPayload());
});

const payrollAccountSchema = z.object({
  companyId: z.string().optional(),
  legalName: z.string().min(2).optional(),
  operatingName: z.string().optional(),
  businessNumber: z.string().min(9),
  province: z.string().optional(),
  payrollAccount: z.string().min(10),
  remitterType: z.string().default('Regular'),
  frequency: z.string().default('Monthly'),
  nextRemittanceDue: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional()
});

router.post('/payroll-accounts', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = payrollAccountSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payroll account details', issues: parsed.error.issues });
  const data = parsed.data;
  let company = data.companyId ? await Company.findById(data.companyId) : undefined;
  if (!company) {
    company = await Company.create({
      legalName: data.legalName || 'New Employer',
      operatingName: data.operatingName,
      customerId: `PH${Date.now().toString().slice(-6)}`,
      businessNumber: data.businessNumber,
      address: { province: data.province, country: 'Canada' },
      payrollConfiguration: withVacationPolicy(undefined, data.province),
      status: 'pending_activation'
    });
  }
  const cra = asRecord(company.craPayroll);
  if (data.legalName) company.legalName = data.legalName;
  company.operatingName = data.operatingName || company.operatingName;
  company.businessNumber = data.businessNumber;
  company.address = { ...(company.address || {}), province: data.province || company.address?.province };
  company.payrollConfiguration = withVacationPolicy(
    company.payrollConfiguration,
    data.province || company.address?.province
  );
  company.craPayroll = {
    ...cra,
    payrollAccount: data.payrollAccount,
    accountSuffix: data.payrollAccount.slice(-4),
    remitterType: data.remitterType,
    frequency: data.frequency,
    remittanceFrequency: data.frequency,
    nextRemittanceDue: data.nextRemittanceDue,
    province: data.province,
    accountStatus: 'Active',
    contact: { name: data.contactName, phone: data.phone, email: data.email },
    remitterHistory: [...(Array.isArray(cra.remitterHistory) ? cra.remitterHistory : []), { remitterType: data.remitterType, effectiveDate: new Date().toISOString().slice(0, 10), changedBy: 'Super Admin' }]
  };
  await company.save();
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: company._id, eventType: 'PAYROLL_ACCOUNT_UPDATED', metadata: { action: 'Payroll account saved', module: 'Payroll Accounts' } });
  res.status(201).json({ account: (await buildPayrollAccountsPayload()).accounts.find((account) => account.id === String(company._id)) });
});

router.patch('/payroll-accounts/:id/banking', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = z.object({ bankName: z.string().optional(), accountType: z.string().optional(), accountNumber: z.string().optional(), usedFor: z.string().optional(), verificationStatus: z.string().optional(), status: z.string().optional(), isDefault: z.boolean().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid banking details', issues: parsed.error.issues });
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ message: 'Employer not found' });
  company.banking = { ...asRecord(company.banking), ...parsed.data };
  await company.save();
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: company._id, eventType: 'BANKING_UPDATED', metadata: { action: 'Updated payroll banking', module: 'Payroll Accounts' } });
  res.json({ account: (await buildPayrollAccountsPayload()).accounts.find((account) => account.id === String(company._id)) });
});

router.post('/payroll-accounts/:id/remittance-payment', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = z.object({ amount: z.coerce.number().min(0), paymentDate: z.string(), referenceNumber: z.string().min(1), method: z.string().default('Online banking'), documentName: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid payment details', issues: parsed.error.issues });
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ message: 'Employer not found' });
  await syncCompanyCraRemittancesFromRuns(company._id);
  const remittances = await GovernmentFiling.find({
    companyId: company._id,
    type: 'CRA_REMITTANCE',
    status: { $ne: 'filed' }
  }).sort({ dueDate: 1 });
  let remaining = moneyToDecimal(parsed.data.amount);
  const appliedFilingIds: string[] = [];
  for (const filing of remittances) {
    if (remaining.lessThan(moneyToDecimal(filing.amount))) continue;
    const now = new Date();
    filing.status = 'filed';
    filing.filedAt = new Date(parsed.data.paymentDate);
    filing.reference = parsed.data.referenceNumber;
    filing.confirmationNumber = `CRA${String(now.getTime()).slice(-10)}`;
    await filing.save();
    appliedFilingIds.push(String(filing._id));
    remaining = remaining.minus(moneyToDecimal(filing.amount));
  }
  const cra = asRecord(company.craPayroll);
  const payments = Array.isArray(cra.payments) ? cra.payments : [];
  company.craPayroll = {
    ...cra,
    payments: [
      ...payments,
      {
        ...parsed.data,
        appliedFilingIds,
        unappliedAmount: remaining.toFixed(2),
        recordedAt: new Date().toISOString(),
        recordedBy: 'Super Admin'
      }
    ],
    currentLiability: (await GovernmentFiling.find({
      companyId: company._id,
      type: 'CRA_REMITTANCE',
      status: { $ne: 'filed' }
    })).reduce((sum, filing) => sum + Number(formatMoney(filing.amount)), 0).toFixed(2)
  };
  await company.save();
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: company._id, eventType: 'REMITTANCE_PAYMENT_RECORDED', metadata: { action: `Recorded CRA payment ${parsed.data.referenceNumber}`, module: 'Payroll Accounts' } });
  res.status(201).json({ account: (await buildPayrollAccountsPayload()).accounts.find((account) => account.id === String(company._id)) });
});

router.post('/payroll-accounts/:id/remitter-type', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = z.object({ remitterType: z.string().min(1), effectiveDate: z.string().min(1), note: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid remitter type details', issues: parsed.error.issues });
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ message: 'Employer not found' });
  const cra = asRecord(company.craPayroll);
  company.craPayroll = {
    ...cra,
    remitterType: parsed.data.remitterType,
    remittanceFrequency:
      parsed.data.remitterType === 'Regular' ? 'Monthly' : parsed.data.remitterType,
    frequency: parsed.data.remitterType === 'Regular' ? 'Monthly' : parsed.data.remitterType,
    remitterHistory: [
      ...(Array.isArray(cra.remitterHistory) ? cra.remitterHistory : []),
      { ...parsed.data, changedAt: new Date().toISOString(), changedBy: 'Super Admin' }
    ]
  };
  await company.save();
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: company._id, eventType: 'REMITTER_TYPE_CHANGED', metadata: { action: `Changed remitter type effective ${parsed.data.effectiveDate}`, module: 'Payroll Accounts' } });
  res.json({ account: (await buildPayrollAccountsPayload()).accounts.find((account) => account.id === String(company._id)) });
});

router.post('/payroll-accounts/:id/note', authenticate, requirePermission('users.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const parsed = z.object({ note: z.string().min(1), documentName: z.string().optional(), documentType: z.string().optional(), documentData: z.string().max(4_500_000).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid note', issues: parsed.error.issues });
  const company = await Company.findById(req.params.id);
  if (!company) return res.status(404).json({ message: 'Employer not found' });
  const cra = asRecord(company.craPayroll);
  company.craPayroll = { ...cra, notes: [...(Array.isArray(cra.notes) ? cra.notes : []), { ...parsed.data, createdAt: new Date().toISOString(), createdBy: 'Super Admin' }] };
  await company.save();
  await auditEvent(req, { userId: req.superAdminContext!.superAdminId, companyId: company._id, eventType: 'PAYROLL_ACCOUNT_NOTE_ADDED', metadata: { action: 'Added internal payroll account note', module: 'Payroll Accounts' } });
  res.status(201).json({ account: (await buildPayrollAccountsPayload()).accounts.find((account) => account.id === String(company._id)) });
});

router.get('/payroll-accounts/:id/audit', authenticate, requirePermission('reports.view'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  const company = await Company.findById(req.params.id).select('_id');
  if (!company) return res.status(404).json({ message: 'Employer not found' });
  const logs = await AuditLog.find({ companyId: company._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ logs: logs.map((log) => ({ id: String(log._id), eventType: log.eventType, action: textValue(asRecord(log.metadata).action, log.eventType), module: textValue(asRecord(log.metadata).module, 'Payroll Accounts'), createdAt: log.createdAt.toISOString(), ipAddress: log.ipAddress || '-', userAgent: log.userAgent || '-' })) });
});

router.post('/tax-config/versions', authenticate, requirePermission('tax.manage'), async (req: AuthRequest, res) => {
  if (!requireSuperAdmin(req, res)) return;
  res.status(501).json({ message: 'Tax configuration versioning is not implemented yet' });
});

export default router;





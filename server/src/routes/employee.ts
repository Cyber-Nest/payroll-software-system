import { Router } from 'express';
import { z } from 'zod';
import { AuditLog } from '../models/AuditLog';
import { Company } from '../models/Company';
import { CompanyBulletin } from '../models/CompanyBulletin';
import { Employee } from '../models/Employee';
import { PayStatement } from '../models/PayStatement';
import { TaxFormDocument } from '../models/TaxFormDocument';
import { User } from '../models/User';
import { authenticate, AuthRequest, signToken } from '../middleware/auth';
import { serializeEmployee, serializeMoney } from '../utils/serializers';
import { employeeCompanyScope } from '../utils/scope';
import { textPdf } from '../utils/pdf';

const router = Router();
router.use(authenticate);

async function loadContext(req: AuthRequest) {
  const employee = await Employee.findOne({ _id: req.employeeContext?.employeeId, userId: req.user?.id });
  const company = employee ? await Company.findById(employee.companyId) : null;
  if (!employee || !company) throw new Error('Missing employee context');
  return { employee, company };
}

function payDto(statement: unknown) {
  const s = statement as {
    _id: unknown;
    payDate: Date;
    payPeriodNumber: number;
    payPeriodYear: number;
    type?: string;
    netPay: unknown;
    yearToDateNetPay: unknown;
    grossEarnings: Array<{ code: string; description: string; amount: unknown }>;
    deductions: Array<{ code: string; description: string; amount: unknown }>;
    additionalInfo: Array<{ key: string; value: string }>;
    isUnread: boolean;
  };
  const grossTotal = s.grossEarnings.find((line) => line.code === 'TOTAL')?.amount || s.grossEarnings.reduce((sum, line) => Number(sum) + Number(serializeMoney(line.amount)), 0);
  const deductionsTotal = s.deductions.find((line) => line.code === 'TOTAL')?.amount || s.deductions.reduce((sum, line) => Number(sum) + Number(serializeMoney(line.amount)), 0);
  return {
    id: String(s._id),
    payDate: s.payDate,
    payPeriodNumber: s.payPeriodNumber,
    payPeriodYear: s.payPeriodYear,
    type: s.type || '',
    grossPay: serializeMoney(grossTotal),
    netPay: serializeMoney(s.netPay),
    yearToDateNetPay: serializeMoney(s.yearToDateNetPay),
    deductionsTotal: serializeMoney(deductionsTotal),
    grossEarnings: s.grossEarnings.map((line) => ({ ...line, amount: serializeMoney(line.amount) })),
    deductions: s.deductions.map((line) => ({ ...line, amount: serializeMoney(line.amount) })),
    additionalInfo: s.additionalInfo,
    isUnread: s.isUnread
  };
}

router.get('/context', async (req: AuthRequest, res) => {
  const { employee, company } = await loadContext(req);
  const employees = await Employee.find({ userId: req.user?.id }).populate('companyId');
  res.json({
    employee: serializeEmployee(employee, company),
    companies: employees.map((item) => {
      const itemCompany = item.companyId as never as { _id: unknown; legalName: string; customerId: string };
      return { employeeId: String(item._id), companyId: String(itemCompany._id), companyName: itemCompany.legalName, customerId: itemCompany.customerId };
    })
  });
});

router.post('/context/:employeeId', async (req: AuthRequest, res) => {
  const employee = await Employee.findOne({ _id: req.params.employeeId, userId: req.user?.id });
  if (!employee) return res.status(403).json({ message: 'Employee context is not available to this user' });
  await User.findByIdAndUpdate(req.user?.id, { lastSelectedEmployeeId: employee._id });
  res.json({ token: signToken(req.user!.id, String(employee._id), String(employee.companyId)) });
});

router.get('/profile', async (req: AuthRequest, res) => {
  const { employee, company } = await loadContext(req);
  res.json(serializeEmployee(employee, company));
});

router.patch('/profile', async (req: AuthRequest, res) => {
  const parsed = z
    .object({
      legalFirstName: z.string().optional(),
      middleName: z.string().optional(),
      legalLastName: z.string().optional(),
      salutation: z.string().optional(),
      preferredFirstName: z.string().optional(),
      preferredLastName: z.string().optional(),
      citizenship: z.string().optional(),
      addresses: z.array(z.object({ street: z.string(), city: z.string(), province: z.string(), postalCode: z.string() })).optional(),
      phones: z.array(z.object({ type: z.enum(['Home', 'Mobile', 'Work']), number: z.string() })).optional(),
      personalEmail: z.string().email().optional(),
      notificationEmailPreference: z.enum(['company', 'personal']).optional(),
      emergencyContacts: z.array(z.object({ name: z.string(), relationship: z.string(), phone: z.string() })).optional(),
      payStatementPreference: z.object({ emailStatement: z.boolean(), language: z.enum(['English', 'French']) }).optional()
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid profile payload' });
  const employee = await Employee.findOneAndUpdate({ _id: req.employeeContext?.employeeId, userId: req.user?.id }, parsed.data, { new: true });
  const company = employee ? await Company.findById(employee.companyId) : null;
  if (!employee || !company) return res.status(404).json({ message: 'Profile not found' });
  res.json(serializeEmployee(employee, company));
});

router.patch('/two-factor', async (req: AuthRequest, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Invalid two-factor payload' });
  const user = await User.findByIdAndUpdate(req.user?.id, { twoFactorEnabled: parsed.data.enabled }, { new: true });
  res.json({ twoFactorEnabled: Boolean(user?.twoFactorEnabled) });
});

router.get('/pay-statements', async (req: AuthRequest, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const filter = { ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId), ...(year ? { payPeriodYear: year } : {}) };
  const statements = await PayStatement.find(filter).sort({ payDate: -1 });
  const allYears = await PayStatement.distinct('payPeriodYear', employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId));
  res.json({ years: allYears.sort((a, b) => b - a), statements: statements.map(payDto) });
});

router.get('/pay-statements/:id', async (req: AuthRequest, res) => {
  const statement = await PayStatement.findOne({ _id: req.params.id, ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId) });
  if (!statement) return res.status(404).json({ message: 'Pay statement not found' });
  res.json(payDto(statement));
});

router.post('/pay-statements/:id/read', async (req: AuthRequest, res) => {
  await PayStatement.updateOne({ _id: req.params.id, ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId) }, { isUnread: false });
  res.json({ message: 'Marked read' });
});

router.get('/pay-statements/:id/download', async (req: AuthRequest, res) => {
  const statement = await PayStatement.findOne({ _id: req.params.id, ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId) });
  if (!statement) return res.status(404).json({ message: 'Pay statement not found' });
  const employee = await Employee.findById(statement.employeeId);
  const company = await Company.findById(statement.companyId);
  const dto = payDto(statement);
  const payDate = new Date(dto.payDate).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  const lines = [
    `${company?.legalName || 'Employer'} | 1277 Trans Canada Way SE, Medicine Hat, Alberta, T1B1H9`,
    `${employee?.legalFirstName || ''} ${employee?.middleName || ''} ${employee?.legalLastName || ''}`,
    '370 NORTHLANDS POINTE NE, MEDICINE HAT, Alberta, T1C0C4',
    `PAY DATE: ${payDate}`,
    `NET PAY: $ ${dto.netPay}`,
    `YEAR TO DATE: $ ${dto.yearToDateNetPay}`,
    `Gross Earnings: $ ${dto.grossPay}`,
    ...dto.grossEarnings.map((line) => `  ${line.description}: $ ${line.amount}`),
    `Deductions: $ ${dto.deductionsTotal}`,
    ...dto.deductions.map((line) => `  ${line.description}: $ ${line.amount}`),
    'Additional Statement Information',
    ...dto.additionalInfo.map((line) => `  ${line.key}: ${line.value}`)
  ];
  res
    .type('application/pdf')
    .setHeader('Content-Disposition', `attachment; filename="payhours-payslip-${statement.payPeriodYear}-${statement.payPeriodNumber}.pdf"`)
    .send(textPdf('Payhours Pay Statement', lines));
});

router.get('/tax-forms/:id/download', async (req: AuthRequest, res) => {
  const form = await TaxFormDocument.findOne({ _id: req.params.id, ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId) });
  if (!form) return res.status(404).json({ message: 'Tax form not found' });
  const employee = await Employee.findById(form.employeeId);
  const company = await Company.findById(form.companyId);
  const lines = [
    `Employer's name - Nom de l'employeur: ${company?.legalName || ''}`,
    `Year / Annee: ${form.taxYear}`,
    'T4 - Statement of Remuneration Paid / Etat de la remuneration payee',
    'Social insurance number: 973263007',
    `Employee: ${employee?.legalLastName || ''}, ${employee?.legalFirstName || ''} ${employee?.middleName || ''}`,
    'Address: 370 NORTHLANDS POINTE NE, MEDICINEHAT, AB, T1C0C4',
    'Box 14 Employment income: 23585.12',
    'Box 22 Income tax deducted: 3625.43',
    'Box 16 Employee CPP contributions: 1315.19',
    'Box 24 EI insurable earnings: 23585.12',
    'Box 26 CPP pensionable earnings: 23585.12',
    'Box 18 Employee EI premiums: 391.51',
    'Box 10 Province of employment: AB',
    'T4 (23)'
  ];
  res
    .type('application/pdf')
    .setHeader('Content-Disposition', `attachment; filename="payhours-${form.formType}-${form.taxYear}.pdf"`)
    .send(textPdf(`Payhours ${form.formType}`, lines));
});

router.get('/tax-forms', async (req: AuthRequest, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const filter = { ...employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId), ...(year ? { taxYear: year } : {}) };
  const forms = await TaxFormDocument.find(filter).sort({ taxYear: -1 });
  const years = await TaxFormDocument.distinct('taxYear', employeeCompanyScope(req.employeeContext!.employeeId, req.employeeContext!.companyId));
  res.json({ years: years.sort((a, b) => b - a), forms: forms.map((form) => ({ id: String(form._id), taxYear: form.taxYear, formType: form.formType, generatedAt: form.generatedAt })) });
});

router.get('/bulletins', async (req: AuthRequest, res) => {
  const bulletins = await CompanyBulletin.find({ companyId: req.employeeContext?.companyId }).sort({ postedAt: -1 });
  res.json(bulletins.map((item) => ({ id: String(item._id), title: item.title, body: item.body, postedAt: item.postedAt, postedBy: item.postedBy })));
});

router.get('/sin/unmask', async (req: AuthRequest, res) => {
  await AuditLog.create({ userId: req.user?.id, employeeId: req.employeeContext?.employeeId, companyId: req.employeeContext?.companyId, eventType: 'SIN_UNMASK' });
  res.status(403).json({ message: 'SIN unmask is not available in the employee portal' });
});

export default router;

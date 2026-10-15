import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, AuthRequest, requirePermission } from '../middleware/auth';
import { DeductionType } from '../models/DeductionType';
import { Employee } from '../models/Employee';
import { decimalToMoney } from '../utils/money';
import { auditEvent } from '../utils/audit';

const router = Router();
router.use(authenticate, (req: AuthRequest, res, next) => {
  if (!req.employerContext) return res.status(403).json({ message: 'Employer access required.' });
  next();
});
export const employerDeductionSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[a-z\d_-]+$/i).transform((value) => value.toUpperCase()),
  name: z.string().trim().min(2).max(100), description: z.string().trim().max(500).default(''),
  calculationMethod: z.enum(['fixed', 'percentage']), value: z.coerce.number().finite().min(0),
  employeeScope: z.enum(['all', 'selected']), employeeIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]),
  effectivePayDate: z.iso.date(), status: z.enum(['active', 'inactive']).default('active')
}).refine((data) => data.calculationMethod !== 'percentage' || data.value <= 100, { message: 'Percentage must be between 0 and 100.' })
  .refine((data) => data.employeeScope !== 'selected' || data.employeeIds.length > 0, { message: 'Choose at least one employee.' });

export function serializeEmployerDeduction(item: InstanceType<typeof DeductionType>) {
  return {
    id: String(item._id), code: item.code, name: item.name, description: item.description || '',
    kind: item.kind, calculationMethod: item.calculationMethod, value: item.value?.toString() || '0',
    employeeScope: item.employeeScope || 'all', employeeIds: (item.employeeIds || []).map(String),
    effectivePayDate: item.effectivePayDate || '', status: item.status
  };
}
router.get('/', requirePermission('payroll.view'), async (req: AuthRequest, res) => {
  const companyId = req.employerContext!.companyId;
  const [items, employees] = await Promise.all([
    DeductionType.find({ $or: [{ employerId: companyId }, { employerId: { $exists: false }, kind: 'statutory' }] }).sort({ mandatory: -1, name: 1 }),
    Employee.find({ companyId }).select('employeeNumber legalFirstName legalLastName').sort({ legalFirstName: 1, legalLastName: 1 })
  ]);
  res.json({ deductions: items.map(serializeEmployerDeduction), employees: employees.map((employee) => ({ id: String(employee._id), name: `${employee.legalFirstName} ${employee.legalLastName}`.trim(), employeeNumber: employee.employeeNumber })) });
});

router.post('/', requirePermission('users.manage'), saveDeduction);
router.patch('/:id', requirePermission('users.manage'), saveDeduction);
async function saveDeduction(req: AuthRequest, res: import('express').Response) {
  const companyId = req.employerContext!.companyId;
  const parsed = employerDeductionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Enter valid deduction details.' });
  const data = parsed.data;
  if (['CPP', 'CPP2', 'EI', 'FTAX', 'PTAX', 'TAX', 'TOTAL', 'PRE', 'POST'].includes(data.code)) return res.status(400).json({ message: 'This code is reserved for payroll deductions.' });
  if (data.employeeScope === 'selected') {
    const ids = [...new Set(data.employeeIds)];
    if (await Employee.countDocuments({ companyId, _id: { $in: ids } }) !== ids.length) return res.status(400).json({ message: 'Choose employees from this employer only.' });
  }
  const id = req.params.id;
  if (id && !mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid deduction ID.' });
  const item = id ? await DeductionType.findOne({ _id: id, employerId: companyId, kind: 'custom' }) : undefined;
  if (id && !item) return res.status(404).json({ message: 'Editable deduction not found for this employer.' });
  const payload = { ...data, employeeIds: data.employeeScope === 'all' ? [] : [...new Set(data.employeeIds)], value: decimalToMoney(data.value) };
  try {
    const saved = item ? Object.assign(item, payload) : await DeductionType.create({ ...payload, kind: 'custom', employerId: companyId, mandatory: false, provinces: [] });
    if (item) await saved.save();
    await auditEvent(req, { userId: req.employerContext!.employerUserId, companyId, eventType: 'EMPLOYER_UPDATED', metadata: { module: 'Deductions', action: `${id ? 'Updated' : 'Created'} deduction ${data.code}` } });
    res.status(id ? 200 : 201).json({ deduction: serializeEmployerDeduction(saved) });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return res.status(409).json({ message: 'This deduction code already exists for the employer.' });
    throw error;
  }
}
export default router;

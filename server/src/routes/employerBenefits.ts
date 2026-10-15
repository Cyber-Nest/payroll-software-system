import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { authenticate, AuthRequest, requirePermission } from '../middleware/auth';
import { Employee } from '../models/Employee';
import { EmployerBenefit } from '../models/EmployerBenefit';
import { benefitFields, employeeBenefitRows, hasBenefit } from '../services/employerBenefits.service';
import { auditEvent } from '../utils/audit';

const router = Router();
router.use(authenticate, (req: AuthRequest, res, next) => {
  if (!req.employerContext) return res.status(403).json({ message: 'Employer access required.' });
  next();
});
export const benefitSchema = z.object({
  name: z.string().trim().min(2).max(100), type: z.enum(['Health', 'Insurance', 'Wellness', 'Retirement', 'Deduction', 'Taxable Benefit', 'Other']),
  coverageOrValue: z.string().trim().min(1).max(200).refine(hasBenefit, { message: 'Enter benefit coverage or value. Use Inactive to disable an enrollment.' }), description: z.string().trim().max(500).default(''),
  employeeScope: z.enum(['all', 'selected']), employeeIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).default([]),
  applicableFrom: z.iso.date(), status: z.enum(['active', 'inactive']).default('active')
}).refine((value) => value.employeeScope === 'all' || value.employeeIds.length > 0, { message: 'Choose at least one employee.' });
const serialize = (item: InstanceType<typeof EmployerBenefit>) => ({
  id: String(item._id), source: 'plan', name: item.name, type: item.type, coverageOrValue: item.coverageOrValue,
  description: item.description || '', employeeScope: item.employeeScope, employeeIds: item.employeeIds.map(String), applicableFrom: item.applicableFrom, status: item.status
});
router.get('/', requirePermission('reports.view'), async (req: AuthRequest, res) => {
  const companyId = req.employerContext!.companyId;
  const [plans, employees] = await Promise.all([
    EmployerBenefit.find({ companyId }).sort({ name: 1 }),
    Employee.find({ companyId }).select('employeeNumber legalFirstName legalLastName adminProfile.benefits').sort({ legalFirstName: 1 })
  ]);
  res.json({ benefits: [...plans.map(serialize), ...employeeBenefitRows(employees)], employees: employees.map((employee) => ({ id: String(employee._id), name: `${employee.legalFirstName} ${employee.legalLastName}`.trim(), employeeNumber: employee.employeeNumber })) });
});
router.post('/', requirePermission('users.manage'), save);
router.patch('/:id', requirePermission('users.manage'), save);
router.delete('/:id', requirePermission('users.manage'), async (req: AuthRequest, res) => {
  const companyId = req.employerContext!.companyId;
  const id = String(req.params.id);
  let name: string;
  if (id.startsWith('legacy:')) {
    const [, employeeId, key] = id.split(':');
    if (!mongoose.isValidObjectId(employeeId) || !benefitFields.some(([field]) => field === key)) return res.status(400).json({ message: 'Invalid employee benefit.' });
    const employee = await Employee.findOne({ _id: employeeId, companyId });
    const benefit = employee && employeeBenefitRows([employee]).find((item) => item.id === id);
    if (!benefit) return res.status(404).json({ message: 'Employee benefit not found.' });
    name = benefit.name;
    await Employee.updateOne({ _id: employeeId, companyId }, { $unset: {
      [`adminProfile.benefits.${key}`]: '', [`adminProfile.benefits.benefitDetails.${key}`]: ''
    } });
  } else {
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid benefit ID.' });
    const benefit = await EmployerBenefit.findOneAndDelete({ _id: id, companyId });
    if (!benefit) return res.status(404).json({ message: 'Benefit not found for this employer.' });
    name = benefit.name;
  }
  await auditEvent(req, { userId: req.employerContext!.employerUserId, companyId, eventType: 'EMPLOYER_UPDATED', metadata: { module: 'Benefits', action: `Deleted benefit ${name}`, benefitId: id } });
  res.json({ deleted: true, id });
});
async function save(req: AuthRequest, res: import('express').Response) {
  const parsed = benefitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message || 'Enter valid benefit details.' });
  const companyId = req.employerContext!.companyId;
  const data = parsed.data;
  const ids = data.employeeScope === 'all' ? [] : [...new Set(data.employeeIds)];
  if (ids.length && await Employee.countDocuments({ companyId, _id: { $in: ids } }) !== ids.length) return res.status(400).json({ message: 'Choose employees from this employer only.' });
  const id = String(req.params.id || '');
  if (id.startsWith('legacy:')) {
    const [, employeeId, key] = id.split(':');
    if (!mongoose.isValidObjectId(employeeId) || !benefitFields.some(([field]) => field === key)) return res.status(400).json({ message: 'Invalid employee benefit.' });
    if (data.employeeScope !== 'selected' || ids.length !== 1 || ids[0] !== employeeId) return res.status(400).json({ message: 'This enrollment belongs to one employee. Add a new benefit to cover other employees.' });
    const employee = await Employee.findOne({ _id: employeeId, companyId });
    if (!employee || !employeeBenefitRows([employee]).some((item) => item.id === id)) return res.status(404).json({ message: 'Employee benefit not found.' });
    const previous = employee.adminProfile?.benefits || {};
    employee.adminProfile = { ...employee.adminProfile, benefits: { ...previous, [key]: data.coverageOrValue, benefitDetails: {
      ...((previous.benefitDetails || {}) as Record<string, unknown>), [key]: { name: data.name, type: data.type, applicableFrom: data.applicableFrom, description: data.description, status: data.status }
    } } };
    employee.markModified('adminProfile.benefits');
    await employee.save();
    await auditEvent(req, { userId: req.employerContext!.employerUserId, companyId, eventType: 'EMPLOYER_UPDATED', metadata: { module: 'Benefits', action: `Updated employee benefit ${data.name}` } });
    return res.json({ benefit: employeeBenefitRows([employee]).find((item) => item.id === id) || { ...data, id, source: 'employee' } });
  }
  if (id && !mongoose.isValidObjectId(id)) return res.status(400).json({ message: 'Invalid benefit ID.' });
  const plan = id ? await EmployerBenefit.findOne({ _id: id, companyId }) : undefined;
  if (id && !plan) return res.status(404).json({ message: 'Benefit not found for this employer.' });
  const payload = { ...data, employeeIds: ids };
  const item = plan ? Object.assign(plan, payload) : await EmployerBenefit.create({ ...payload, companyId });
  if (plan) await item.save();
  await auditEvent(req, { userId: req.employerContext!.employerUserId, companyId, eventType: 'EMPLOYER_UPDATED', metadata: { module: 'Benefits', action: `${id ? 'Updated' : 'Created'} benefit ${data.name}` } });
  res.status(id ? 200 : 201).json({ benefit: serialize(item) });
}
export default router;

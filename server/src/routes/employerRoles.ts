import { Router } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { authenticate, AuthRequest, requirePermission } from '../middleware/auth';
import { Company } from '../models/Company';
import { EmployerUser } from '../models/EmployerUser';
import { permissions, roleNames } from '../security/rbac';
import { employerRoles, employerRoleSettings } from '../services/employerRoles.service';
import { auditEvent } from '../utils/audit';

const router = Router();
router.use(authenticate, requirePermission('users.manage'));
router.use((req: AuthRequest, res, next) => {
  if (!req.employerContext) return res.status(403).json({ message: 'Employer access required.' });
  next();
});
const schema = z.object({
  name: z.string().trim().min(2).max(80), fullForm: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''), status: z.enum(['Active', 'Inactive']),
  permissions: z.array(z.enum(permissions))
});

async function context(req: AuthRequest) {
  const companyId = req.employerContext!.companyId;
  const [company, users] = await Promise.all([
    Company.findById(companyId), EmployerUser.find({ $or: [{ companyId }, { companyIds: companyId }] })
  ]);
  return { company, users, roles: employerRoles(company?.settings, users) };
}
router.get('/', async (req: AuthRequest, res) => {
  const { company, roles } = await context(req);
  if (!company) return res.status(404).json({ message: 'Company not found.' });
  res.json({ roles });
});
router.get('/:id', async (req: AuthRequest, res) => {
  const { company, roles } = await context(req);
  if (!company) return res.status(404).json({ message: 'Company not found.' });
  const role = roles.find((item) => item.id === req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found.' });
  res.json({ role });
});
router.post('/', async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a role name, full form, status and valid permissions.' });
  const { company, users, roles } = await context(req);
  if (!company) return res.status(404).json({ message: 'Company not found.' });
  if ([...roles, ...employerRoles({})].some((role) => role.name.toLowerCase() === parsed.data.name.toLowerCase()) || roleNames.some((name) => name.toLowerCase() === parsed.data.name.toLowerCase())) return res.status(409).json({ message: 'A role with this name already exists.' });
  const saved = employerRoleSettings(company.settings);
  const role = { ...parsed.data, id: `custom-role-${randomUUID()}` };
  company.settings = { ...company.settings, usersRoles: { ...saved, customRoles: [...(saved.customRoles || []), role] } };
  await company.save();
  await auditEvent(req, { userId: req.employerContext!.employerUserId, companyId: company._id, eventType: 'ROLE_CREATED', metadata: { roleName: role.name, module: 'Users & Roles' } });
  res.status(201).json({ roles: employerRoles(company.settings, users) });
});
router.put('/:id', async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Enter a role name, full form, status and valid permissions.' });
  const { company, users, roles } = await context(req);
  if (!company) return res.status(404).json({ message: 'Company not found.' });
  const role = roles.find((item) => item.id === req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found.' });
  if (parsed.data.name !== role.name && (role.users || roleNames.some((name) => name === role.id))) return res.status(400).json({ message: 'Assigned and built-in role names cannot be changed.' });
  if (roles.some((item) => item.id !== role.id && item.name.toLowerCase() === parsed.data.name.toLowerCase()) || (parsed.data.name !== role.name && roleNames.some((name) => name.toLowerCase() === parsed.data.name.toLowerCase()))) return res.status(409).json({ message: 'A role with this name already exists.' });
  if (role.id === 'Company Owner' && (parsed.data.status !== 'Active' || [...new Set(parsed.data.permissions)].sort().join() !== [...role.permissions].sort().join())) return res.status(400).json({ message: 'The Super Admin role must remain active with its existing permissions.' });
  const saved = employerRoleSettings(company.settings);
  company.settings = { ...company.settings, usersRoles: { ...saved, roleOverrides: { ...saved.roleOverrides, [role.id]: parsed.data } } };
  await company.save();
  await auditEvent(req, { userId: req.employerContext!.employerUserId, companyId: company._id, eventType: 'ROLE_UPDATED', metadata: { roleName: role.name, module: 'Users & Roles' } });
  res.json({ roles: employerRoles(company.settings, users) });
});
router.delete('/:id', async (req: AuthRequest, res) => {
  const { company, users, roles } = await context(req);
  if (!company) return res.status(404).json({ message: 'Company not found.' });
  const role = roles.find((item) => item.id === req.params.id);
  if (!role) return res.status(404).json({ message: 'Role not found.' });
  if (role.id === 'Company Owner') return res.status(400).json({ message: 'The Super Admin role cannot be deleted.' });
  if (role.users) return res.status(400).json({ message: 'Reassign all users from this role before deleting it.' });
  const saved = employerRoleSettings(company.settings);
  if ((saved.customRoles || []).some((item) => item.id === role.id)) {
    const overrides = { ...saved.roleOverrides };
    delete overrides[role.id];
    company.settings = { ...company.settings, usersRoles: { ...saved, customRoles: saved.customRoles!.filter((item) => item.id !== role.id), roleOverrides: overrides } };
  } else {
    company.settings = { ...company.settings, usersRoles: { ...saved, deletedRoleIds: [...new Set([...(saved.deletedRoleIds || []), role.id])] } };
  }
  await company.save();
  await auditEvent(req, { userId: req.employerContext!.employerUserId, companyId: company._id, eventType: 'ROLE_DELETED', metadata: { roleName: role.name, module: 'Users & Roles' } });
  res.json({ roles: employerRoles(company.settings, users) });
});
export default router;

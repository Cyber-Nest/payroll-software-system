import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { Employee } from '../models/Employee';
import { EmployerUser } from '../models/EmployerUser';
import { SuperAdmin } from '../models/SuperAdmin';
import { User } from '../models/User';
import { AccessRole } from '../models/AccessRole';
import { Permission, permissionsForRole } from '../security/rbac';
import { accessRoles } from '../data/superAdminAccess';
import { Company } from '../models/Company';
import { employerPermissionOverride } from '../services/employerRoles.service';

export interface AuthRequest extends Request {
  user?: { id: string };
  employeeContext?: { employeeId: string; companyId: string; role: string; permissions: Permission[] };
  employerContext?: { employerUserId: string; companyId: string; role: string; permissions: Permission[] };
  superAdminContext?: { superAdminId: string; role: string; permissions: Permission[] };
}

export function signToken(userId: string, employeeId: string, companyId: string): string {
  return jwt.sign({ sub: userId, employeeId, companyId }, env.jwtSecret, { expiresIn: '8h' });
}

export function signEmployerToken(employerUserId: string, companyId: string): string {
  return jwt.sign({ sub: employerUserId, companyId, portal: 'employer' }, env.jwtSecret, { expiresIn: '8h' });
}

export function signSuperAdminToken(superAdminId: string): string {
  return jwt.sign({ sub: superAdminId, portal: 'super-admin' }, env.jwtSecret, { expiresIn: '8h' });
}

function permissionsFromAccessRole(rolePermissions: Record<string, string[]>): Permission[] {
  const granted = new Set<Permission>();
  const add = (...permissions: Permission[]) => permissions.forEach((permission) => granted.add(permission));
  Object.entries(rolePermissions).forEach(([moduleName, permissions]) => {
    if (!permissions.length) return;
    if (moduleName === 'Users & Access') add('users.manage', 'audit.view');
    if (moduleName === 'Employees') add('employee.view', 'employee.create', 'employee.edit', 'employee.sin.view', 'employee.compensation.view');
    if (moduleName === 'Payroll') add('payroll.view', 'payroll.prepare', 'payroll.approve', 'payroll.reverse');
    if (moduleName === 'Compliance & Tax') add('tax.view', 'tax.manage');
    if (moduleName === 'Reports') add('reports.view', 'reports.export');
    if (moduleName === 'System Administration') add('audit.view', 'bulletins.manage', 'users.manage');
    if (moduleName === 'Employers' || moduleName === 'Settings') add('users.manage');
    if (moduleName === 'Billing & Subscriptions') add('reports.view');
  });
  return Array.from(granted);
}

function employerRolePermissions(rolePermissions: Record<string, string[]>): Permission[] {
  const actions: Record<string, Record<string, Permission[]>> = {
    Employees: { 'View employees': ['employee.view'], 'Add / edit employees': ['employee.create', 'employee.edit'], 'Import employees': ['employee.create'], 'Terminate employees': ['employee.edit'], 'View employee documents': ['employee.view'] },
    Payroll: { 'Run payroll': ['payroll.prepare'], 'View payroll data': ['payroll.view'], 'Edit payroll entries': ['payroll.prepare'], 'Approve / finalize payroll': ['payroll.approve'], 'Void payroll': ['payroll.reverse'], 'View payroll reports': ['reports.view'] },
    'Users & Access': { 'View users': ['audit.view'], 'Create users': ['users.manage'], 'Edit users': ['users.manage'], 'Assign roles': ['users.manage'], 'Reset passwords': ['users.manage'], 'View user activity logs': ['audit.view'] },
    'Compliance & Tax': { 'View tax configurations': ['tax.view'], 'Edit tax configurations': ['tax.manage'], 'Submit CRA payroll filings': ['tax.manage'], 'View compliance reports': ['reports.view'], 'Access year-end (T4)': ['tax.view'], 'Manage ROE submissions': ['tax.manage'] },
    Reports: { 'View all reports': ['reports.view'], 'Export data': ['reports.export'], 'Customize reports': ['reports.view'], 'Schedule reports': ['reports.export'] }
  };
  return Array.from(new Set(Object.entries(rolePermissions).flatMap(([module, selected]) => selected.flatMap((action) => actions[module]?.[action] || []))));
}

export async function authenticate(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;
  if (!token) {
    res.status(401).json({ message: 'Missing bearer token' });
    return;
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; employeeId?: string; companyId?: string; portal?: string };
    if (payload.portal === 'super-admin') {
      const superAdmin = await SuperAdmin.findOne({ _id: payload.sub, isActive: true });
      if (!superAdmin) {
        res.status(401).json({ message: 'Inactive account' });
        return;
      }
      req.user = { id: payload.sub };
      const role = superAdmin.role || 'CyberNest Super Admin';
      const customRole = await AccessRole.findOne({ name: role, status: 'Active', userType: { $ne: 'employer' } });
      req.superAdminContext = {
        superAdminId: payload.sub,
        role,
        permissions: customRole ? permissionsFromAccessRole(customRole.permissions) : accessRoles.some((item) => item.name === role) ? permissionsFromAccessRole(accessRoles.find((item) => item.name === role)!.permissions) : permissionsForRole(role)
      };
      next();
      return;
    }

    if (payload.portal === 'employer' && payload.companyId) {
      const employer = await EmployerUser.findOne({
        _id: payload.sub,
        isActive: true,
        $or: [{ companyId: payload.companyId }, { companyIds: new mongoose.Types.ObjectId(payload.companyId) }]
      });
      if (!employer) {
        res.status(401).json({ message: 'Inactive account' });
        return;
      }
      req.user = { id: payload.sub };
      const customRole = await AccessRole.findOne({ name: employer.role, userType: 'employer' });
      const company = employer.role === 'Company Owner' ? undefined : await Company.findById(payload.companyId);
      const companyPermissions = employerPermissionOverride(company?.settings, employer.role);
      req.employerContext = { employerUserId: payload.sub, companyId: payload.companyId, role: employer.role, permissions: companyPermissions ?? (customRole ? (customRole.status === 'Active' ? employerRolePermissions(customRole.permissions) : []) : permissionsForRole(employer.role)) };
      next();
      return;
    }

    const user = await User.findById(payload.sub);
    if (!user?.isActive) {
      res.status(401).json({ message: 'Inactive account' });
      return;
    }
    req.user = { id: payload.sub };
    if (payload.employeeId && payload.companyId) {
      const ownsEmployee = await Employee.exists({
        _id: new mongoose.Types.ObjectId(payload.employeeId),
        userId: new mongoose.Types.ObjectId(payload.sub),
        companyId: new mongoose.Types.ObjectId(payload.companyId)
      });
      if (!ownsEmployee) {
        res.status(403).json({ message: 'Employee context is not available to this user' });
        return;
      }
      req.employeeContext = { employeeId: payload.employeeId, companyId: payload.companyId, role: 'Employee', permissions: permissionsForRole('Employee') };
    }
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

export function requirePermission(permission: Permission) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const granted = req.superAdminContext?.permissions || req.employerContext?.permissions || req.employeeContext?.permissions || [];
    if (!granted.includes(permission)) {
      res.status(403).json({ message: `Missing permission: ${permission}` });
      return;
    }
    next();
  };
}

import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { Employee } from '../models/Employee';
import { EmployerUser } from '../models/EmployerUser';
import { SuperAdmin } from '../models/SuperAdmin';
import { User } from '../models/User';
import { Permission, permissionsForRole } from '../security/rbac';

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
      req.superAdminContext = { superAdminId: payload.sub, role: 'CyberNest Super Admin', permissions: permissionsForRole('CyberNest Super Admin') };
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
      req.employerContext = { employerUserId: payload.sub, companyId: payload.companyId, role: employer.role, permissions: permissionsForRole(employer.role) };
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

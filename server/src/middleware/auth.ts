import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { Employee } from '../models/Employee';
import { User } from '../models/User';

export interface AuthRequest extends Request {
  user?: { id: string };
  employeeContext?: { employeeId: string; companyId: string };
}

export function signToken(userId: string, employeeId: string, companyId: string): string {
  return jwt.sign({ sub: userId, employeeId, companyId }, env.jwtSecret, { expiresIn: '8h' });
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
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; employeeId?: string; companyId?: string };
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
      req.employeeContext = { employeeId: payload.employeeId, companyId: payload.companyId };
    }
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

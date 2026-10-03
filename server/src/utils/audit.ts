import { Request } from 'express';
import { AuditLog, IAuditLog } from '../models/AuditLog';

type AuditEventInput = Omit<Partial<IAuditLog>, 'createdAt' | 'userId' | 'employeeId' | 'companyId'> &
  Pick<IAuditLog, 'eventType'> & {
    userId?: unknown;
    employeeId?: unknown;
    companyId?: unknown;
  };

export function requestIp(req: Request) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return (forwarded?.split(',')[0] || req.ip || req.socket.remoteAddress || '').replace(/^::ffff:/, '') || '-';
}

export function auditEvent(req: Request, data: AuditEventInput) {
  const payload = {
    ...data,
    ipAddress: data.ipAddress || requestIp(req),
    userAgent: data.userAgent || req.get('user-agent') || '-'
  };
  return AuditLog.create(payload as never);
}

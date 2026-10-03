import mongoose, { Schema } from 'mongoose';

export interface IAuditLog {
  userId?: mongoose.Types.ObjectId;
  employeeId?: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  eventType: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'EMPLOYER_LOGIN_SUCCESS' | 'EMPLOYER_LOGIN_FAILURE' | 'SUPER_ADMIN_LOGIN_SUCCESS' | 'SUPER_ADMIN_LOGIN_FAILURE' | 'PASSWORD_CHANGE' | 'SIN_UNMASK' | 'EMPLOYEE_UPSERT' | 'EMPLOYEE_DELETED' | 'EMPLOYER_CREATED' | 'EMPLOYER_UPDATED' | 'EMPLOYER_DELETED' | 'USER_UPDATED' | 'USER_DELETED' | 'ROLE_CREATED' | 'ROLE_UPDATED' | 'ROLE_DELETED' | 'PAYROLL_STATUS_CHANGED' | 'PAYROLL_UPDATED' | 'PAYROLL_ACCOUNT_UPDATED' | 'BANKING_UPDATED' | 'REMITTANCE_PAYMENT_RECORDED' | 'REMITTER_TYPE_CHANGED' | 'PAYROLL_ACCOUNT_NOTE_ADDED' | 'COMPANY_NOTIFICATION_PUBLISHED' | 'COMPANY_NOTIFICATION_DELETED' | 'PLATFORM_NOTIFICATION_PUBLISHED' | 'PLATFORM_NOTIFICATION_DELETED' | 'T4_GENERATED' | 'ROE_GENERATED';
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    eventType: { type: String, required: true },
    ipAddress: String,
    userAgent: String,
    metadata: Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

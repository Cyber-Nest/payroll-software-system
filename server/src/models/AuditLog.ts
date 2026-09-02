import mongoose, { Schema } from 'mongoose';

export interface IAuditLog {
  userId?: mongoose.Types.ObjectId;
  employeeId?: mongoose.Types.ObjectId;
  companyId?: mongoose.Types.ObjectId;
  eventType: 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'PASSWORD_CHANGE' | 'SIN_UNMASK';
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee' },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    eventType: { type: String, required: true },
    metadata: Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);

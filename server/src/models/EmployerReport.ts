import mongoose, { Schema } from 'mongoose';

export interface IReportDefinition {
  companyId: mongoose.Types.ObjectId; name: string; description: string;
  source: 'employees' | 'payroll' | 'deductions'; fields: string[];
  dateRange: 'all' | 'last30' | 'year' | 'custom'; fromDate?: string; toDate?: string;
  employeeIds: mongoose.Types.ObjectId[];
}
export const EmployerReport = mongoose.model<IReportDefinition>('EmployerReport', new Schema<IReportDefinition>({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true }, name: { type: String, required: true }, description: { type: String, default: '' },
  source: { type: String, enum: ['employees', 'payroll', 'deductions'], required: true }, fields: [String],
  dateRange: { type: String, enum: ['all', 'last30', 'year', 'custom'], default: 'all' }, fromDate: String, toDate: String,
  employeeIds: [{ type: Schema.Types.ObjectId, ref: 'Employee' }]
}, { timestamps: true }));

export interface IReportSchedule {
  companyId: mongoose.Types.ObjectId; reportId: mongoose.Types.ObjectId; createdBy: mongoose.Types.ObjectId;
  name: string; frequency: 'daily' | 'weekly' | 'monthly'; format: 'csv' | 'excel' | 'pdf';
  nextRunAt: Date; anchorDay: number; enabled: boolean; recipients: string[]; leaseUntil?: Date; lastRunAt?: Date; lastError?: string;
}
const scheduleSchema = new Schema<IReportSchedule>({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true }, reportId: { type: Schema.Types.ObjectId, ref: 'EmployerReport', required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'EmployerUser', required: true }, name: { type: String, required: true },
  frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], required: true }, format: { type: String, enum: ['csv', 'excel', 'pdf'], default: 'csv' },
  nextRunAt: { type: Date, required: true }, anchorDay: Number, enabled: { type: Boolean, default: true }, recipients: [String],
  leaseUntil: Date, lastRunAt: Date, lastError: String
}, { timestamps: true });
scheduleSchema.index({ enabled: 1, nextRunAt: 1, leaseUntil: 1 });
export const EmployerReportSchedule = mongoose.model<IReportSchedule>('EmployerReportSchedule', scheduleSchema);

export interface IReportRun {
  companyId: mongoose.Types.ObjectId; reportId: mongoose.Types.ObjectId; scheduleId?: mongoose.Types.ObjectId;
  reportName: string; status: 'running' | 'completed' | 'failed'; format: 'csv' | 'excel' | 'pdf';
  rowCount: number; file?: Buffer; filename?: string; contentType?: string; error?: string;
  delivery: 'not_requested' | 'sent' | 'failed'; deliveryError?: string; createdAt: Date;
}
export const EmployerReportRun = mongoose.model<IReportRun>('EmployerReportRun', new Schema<IReportRun>({
  companyId: { type: Schema.Types.ObjectId, required: true, index: true }, reportId: { type: Schema.Types.ObjectId, required: true },
  scheduleId: Schema.Types.ObjectId, reportName: String, status: { type: String, enum: ['running', 'completed', 'failed'], default: 'running' },
  format: String, rowCount: { type: Number, default: 0 }, file: { type: Buffer, select: false }, filename: String, contentType: String,
  error: String, delivery: { type: String, default: 'not_requested' }, deliveryError: String
}, { timestamps: true }));

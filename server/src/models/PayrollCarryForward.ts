import mongoose, { Schema } from 'mongoose';

export interface IPayrollCarryForward {
  companyId: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  sourcePayrollRunId: mongoose.Types.ObjectId;
  sourceStatementId?: mongoose.Types.ObjectId;
  appliedPayrollRunId?: mongoose.Types.ObjectId;
  amount: mongoose.Types.Decimal128;
  reason: string;
  status: 'pending' | 'applied';
  appliedAt?: Date;
}

const payrollCarryForwardSchema = new Schema<IPayrollCarryForward>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    sourcePayrollRunId: { type: Schema.Types.ObjectId, ref: 'PayrollRun', required: true },
    sourceStatementId: { type: Schema.Types.ObjectId, ref: 'PayStatement' },
    appliedPayrollRunId: { type: Schema.Types.ObjectId, ref: 'PayrollRun' },
    amount: { type: Schema.Types.Decimal128, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['pending', 'applied'], default: 'pending', index: true },
    appliedAt: Date
  },
  { timestamps: true }
);

payrollCarryForwardSchema.index(
  { companyId: 1, employeeId: 1, sourcePayrollRunId: 1 },
  { unique: true }
);

export const PayrollCarryForward = mongoose.model<IPayrollCarryForward>(
  'PayrollCarryForward',
  payrollCarryForwardSchema
);

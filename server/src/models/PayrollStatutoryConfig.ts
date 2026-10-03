import mongoose, { Schema } from 'mongoose';

export type PayrollStatutoryStatus = 'draft' | 'validated' | 'tested' | 'published' | 'rolled_back';

export interface IPayrollStatutoryConfig {
  status: PayrollStatutoryStatus;
  effectiveFrom: Date;
  effectiveTo?: Date;
  cpp: {
    ympe: mongoose.Types.Decimal128;
    basicExemption: mongoose.Types.Decimal128;
    rate: mongoose.Types.Decimal128;
    maxContribution: mongoose.Types.Decimal128;
  };
  cpp2: {
    yampe: mongoose.Types.Decimal128;
    rate: mongoose.Types.Decimal128;
    maxContribution: mongoose.Types.Decimal128;
  };
  ei: {
    maxInsurableEarnings: mongoose.Types.Decimal128;
    employeeRate: mongoose.Types.Decimal128;
    employerRate: mongoose.Types.Decimal128;
    maxPremium: mongoose.Types.Decimal128;
  };
  sourceYear: number;
  source: string;
  verified: boolean;
  verificationNote?: string;
  publishedAt?: Date;
  rolledBackAt?: Date;
  createdBy?: mongoose.Types.ObjectId;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const money = { type: Schema.Types.Decimal128, required: true };

const payrollStatutoryConfigSchema = new Schema<IPayrollStatutoryConfig>(
  {
    status: { type: String, enum: ['draft', 'validated', 'tested', 'published', 'rolled_back'], default: 'draft', index: true },
    effectiveFrom: { type: Date, required: true, index: true },
    effectiveTo: Date,
    cpp: {
      ympe: money,
      basicExemption: money,
      rate: money,
      maxContribution: money
    },
    cpp2: {
      yampe: money,
      rate: money,
      maxContribution: money
    },
    ei: {
      maxInsurableEarnings: money,
      employeeRate: money,
      employerRate: money,
      maxPremium: money
    },
    sourceYear: { type: Number, required: true },
    source: { type: String, required: true },
    verified: { type: Boolean, required: true, default: false },
    verificationNote: String,
    publishedAt: Date,
    rolledBackAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'SuperAdmin' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'SuperAdmin' }
  },
  { timestamps: true }
);

payrollStatutoryConfigSchema.index({ effectiveFrom: 1, status: 1 });

export const PayrollStatutoryConfig = mongoose.model<IPayrollStatutoryConfig>('PayrollStatutoryConfig', payrollStatutoryConfigSchema);

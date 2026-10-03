import mongoose, { Schema } from 'mongoose';

export type PayrollRunStatus =
  'draft' | 'in_review' | 'approved' | 'finalized' | 'locked' | 'reversed' | 'adjusted';
export type PayrollRunType = 'regular' | 'off_cycle' | 'adjustment';
export type PayrollFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface IPayrollRunLine {
  employeeId: mongoose.Types.ObjectId;
  regularHours: number;
  overtimeHours: number;
  statePayHours: number;
  statePayBaseHours: number;
  statePayRegularDay: boolean;
  statePayAlternativeDayOff: boolean;
  statePayProvince?: string;
  statePayExplanation?: string;
  hourlyRate: mongoose.Types.Decimal128;
  bonus: mongoose.Types.Decimal128;
  commission: mongoose.Types.Decimal128;
  vacationPay: mongoose.Types.Decimal128;
  statePay: mongoose.Types.Decimal128;
  otherEarnings: mongoose.Types.Decimal128;
  reimbursement: mongoose.Types.Decimal128;
  preTaxDeductions: mongoose.Types.Decimal128;
  postTaxDeductions: mongoose.Types.Decimal128;
  cpp: mongoose.Types.Decimal128;
  cpp2: mongoose.Types.Decimal128;
  ei: mongoose.Types.Decimal128;
  federalTax: mongoose.Types.Decimal128;
  provincialTax: mongoose.Types.Decimal128;
  carryForwardAdjustment: mongoose.Types.Decimal128;
  carryForwardAdjustmentIds: mongoose.Types.ObjectId[];
  note?: string;
  grossPay: mongoose.Types.Decimal128;
  deductionsTotal: mongoose.Types.Decimal128;
  netPay: mongoose.Types.Decimal128;
  statementId?: mongoose.Types.ObjectId;
}

export interface IPayrollStatusHistory {
  from?: PayrollRunStatus;
  to: PayrollRunStatus;
  changedBy: mongoose.Types.ObjectId;
  changedAt: Date;
  note?: string;
}

export interface IPayrollRun {
  companyId: mongoose.Types.ObjectId;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  runType: PayrollRunType;
  payFrequency: PayrollFrequency;
  originalRunId?: mongoose.Types.ObjectId;
  employeeCount: number;
  totalHours: number;
  estimatedGross: mongoose.Types.Decimal128;
  totalDeductions: mongoose.Types.Decimal128;
  totalNetPay: mongoose.Types.Decimal128;
  status: PayrollRunStatus;
  preparedBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  finalizedBy?: mongoose.Types.ObjectId;
  lockedBy?: mongoose.Types.ObjectId;
  reversedBy?: mongoose.Types.ObjectId;
  adjustedBy?: mongoose.Types.ObjectId;
  reversedRunId?: mongoose.Types.ObjectId;
  adjustmentRunIds: mongoose.Types.ObjectId[];
  lines: IPayrollRunLine[];
  statusHistory: IPayrollStatusHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const payrollRunLineSchema = new Schema<IPayrollRunLine>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    regularHours: { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },
    statePayHours: { type: Number, default: 0 },
    statePayBaseHours: { type: Number, default: 0 },
    statePayRegularDay: { type: Boolean, default: true },
    statePayAlternativeDayOff: { type: Boolean, default: false },
    statePayProvince: String,
    statePayExplanation: String,
    hourlyRate: { type: Schema.Types.Decimal128, required: true },
    bonus: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    commission: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    vacationPay: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    statePay: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    otherEarnings: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    reimbursement: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    preTaxDeductions: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    postTaxDeductions: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    cpp: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    cpp2: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    ei: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    federalTax: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    provincialTax: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    carryForwardAdjustment: {
      type: Schema.Types.Decimal128,
      default: () => mongoose.Types.Decimal128.fromString('0.00')
    },
    carryForwardAdjustmentIds: [{ type: Schema.Types.ObjectId, ref: 'PayrollCarryForward' }],
    note: String,
    grossPay: { type: Schema.Types.Decimal128, required: true },
    deductionsTotal: { type: Schema.Types.Decimal128, required: true },
    netPay: { type: Schema.Types.Decimal128, required: true },
    statementId: { type: Schema.Types.ObjectId, ref: 'PayStatement' }
  },
  { _id: false }
);

const statusHistorySchema = new Schema<IPayrollStatusHistory>(
  {
    from: {
      type: String,
      enum: ['draft', 'in_review', 'approved', 'finalized', 'locked', 'reversed', 'adjusted']
    },
    to: {
      type: String,
      enum: ['draft', 'in_review', 'approved', 'finalized', 'locked', 'reversed', 'adjusted'],
      required: true
    },
    changedBy: { type: Schema.Types.ObjectId, ref: 'EmployerUser', required: true },
    changedAt: { type: Date, default: Date.now },
    note: String
  },
  { _id: false }
);

const payrollRunSchema = new Schema<IPayrollRun>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    payDate: { type: Date, required: true },
    runType: {
      type: String,
      enum: ['regular', 'off_cycle', 'adjustment'],
      default: 'regular',
      index: true
    },
    payFrequency: {
      type: String,
      enum: ['weekly', 'biweekly', 'monthly'],
      default: 'biweekly'
    },
    originalRunId: { type: Schema.Types.ObjectId, ref: 'PayrollRun' },
    employeeCount: { type: Number, required: true, default: 0 },
    totalHours: { type: Number, required: true, default: 0 },
    estimatedGross: { type: Schema.Types.Decimal128, required: true },
    totalDeductions: { type: Schema.Types.Decimal128, required: true },
    totalNetPay: { type: Schema.Types.Decimal128, required: true },
    status: {
      type: String,
      enum: ['draft', 'in_review', 'approved', 'finalized', 'locked', 'reversed', 'adjusted'],
      default: 'draft',
      index: true
    },
    preparedBy: { type: Schema.Types.ObjectId, ref: 'EmployerUser' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'EmployerUser' },
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'EmployerUser' },
    lockedBy: { type: Schema.Types.ObjectId, ref: 'EmployerUser' },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'EmployerUser' },
    adjustedBy: { type: Schema.Types.ObjectId, ref: 'EmployerUser' },
    reversedRunId: { type: Schema.Types.ObjectId, ref: 'PayrollRun' },
    adjustmentRunIds: [{ type: Schema.Types.ObjectId, ref: 'PayrollRun' }],
    lines: [payrollRunLineSchema],
    statusHistory: [statusHistorySchema]
  },
  { timestamps: true }
);

payrollRunSchema.index({ companyId: 1, payDate: -1 });
payrollRunSchema.index({ companyId: 1, originalRunId: 1 });

export const PayrollRun = mongoose.model<IPayrollRun>('PayrollRun', payrollRunSchema);

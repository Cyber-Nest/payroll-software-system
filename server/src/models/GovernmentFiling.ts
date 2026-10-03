import mongoose, { Schema } from 'mongoose';

export type GovernmentFilingType = 'CRA_REMITTANCE' | 'PD7A' | 'T4_SLIPS' | 'T4_SUMMARY' | 'ROE';
export type GovernmentFilingStatus = 'pending' | 'prepared' | 'filed' | 'overdue';

export interface IGovernmentFiling {
  companyId: mongoose.Types.ObjectId;
  filingKey: string;
  type: GovernmentFilingType;
  title: string;
  year: number;
  period: string;
  dueDate: Date;
  status: GovernmentFilingStatus;
  amount: mongoose.Types.Decimal128;
  reference?: string;
  confirmationNumber?: string;
  preparedAt?: Date;
  filedAt?: Date;
  submittedBy?: mongoose.Types.ObjectId;
  documents: Array<{ name: string; kind: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const governmentFilingSchema = new Schema<IGovernmentFiling>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    filingKey: { type: String, required: true },
    type: {
      type: String,
      enum: ['CRA_REMITTANCE', 'PD7A', 'T4_SLIPS', 'T4_SUMMARY', 'ROE'],
      required: true
    },
    title: { type: String, required: true },
    year: { type: Number, required: true, index: true },
    period: { type: String, required: true },
    dueDate: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'prepared', 'filed', 'overdue'], default: 'pending' },
    amount: { type: Schema.Types.Decimal128, default: () => mongoose.Types.Decimal128.fromString('0.00') },
    reference: String,
    confirmationNumber: String,
    preparedAt: Date,
    filedAt: Date,
    submittedBy: { type: Schema.Types.ObjectId, ref: 'EmployerUser' },
    documents: [{ _id: false, name: { type: String, required: true }, kind: { type: String, required: true } }]
  },
  { timestamps: true }
);

governmentFilingSchema.index({ companyId: 1, filingKey: 1 }, { unique: true });

export const GovernmentFiling = mongoose.model<IGovernmentFiling>('GovernmentFiling', governmentFilingSchema);

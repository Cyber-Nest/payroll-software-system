import mongoose, { Schema } from 'mongoose';

export type TaxJurisdiction = 'FEDERAL' | 'AB' | 'BC' | 'MB' | 'SK' | 'ON';
export type TaxConfigStatus = 'draft' | 'validated' | 'tested' | 'published' | 'rolled_back';

export interface ITaxBracket {
  threshold: mongoose.Types.Decimal128;
  rate: mongoose.Types.Decimal128;
  constant: mongoose.Types.Decimal128;
}

export interface ITaxConfigVersion {
  jurisdiction: TaxJurisdiction;
  status: TaxConfigStatus;
  effectiveFrom: Date;
  effectiveTo?: Date;
  brackets: ITaxBracket[];
  basicPersonalAmount: mongoose.Types.Decimal128;
  basicPersonalAmountMax?: mongoose.Types.Decimal128;
  basicPersonalAmountPhaseOutStart?: mongoose.Types.Decimal128;
  basicPersonalAmountPhaseOutEnd?: mongoose.Types.Decimal128;
  canadaEmploymentAmount?: mongoose.Types.Decimal128;
  supplementalCreditThreshold?: mongoose.Types.Decimal128;
  supplementalCreditRate?: mongoose.Types.Decimal128;
  bpaClawbackStart?: mongoose.Types.Decimal128;
  bpaClawbackEnd?: mongoose.Types.Decimal128;
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

const decimalField = { type: Schema.Types.Decimal128, required: true };
const optionalDecimalField = { type: Schema.Types.Decimal128 };

const taxBracketSchema = new Schema<ITaxBracket>(
  {
    threshold: decimalField,
    rate: decimalField,
    constant: decimalField
  },
  { _id: false }
);

const taxConfigVersionSchema = new Schema<ITaxConfigVersion>(
  {
    jurisdiction: {
      type: String,
      enum: ['FEDERAL', 'AB', 'BC', 'MB', 'SK', 'ON'],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ['draft', 'validated', 'tested', 'published', 'rolled_back'],
      default: 'draft',
      index: true
    },
    effectiveFrom: { type: Date, required: true, index: true },
    effectiveTo: Date,
    brackets: { type: [taxBracketSchema], default: [] },
    basicPersonalAmount: decimalField,
    basicPersonalAmountMax: optionalDecimalField,
    basicPersonalAmountPhaseOutStart: optionalDecimalField,
    basicPersonalAmountPhaseOutEnd: optionalDecimalField,
    canadaEmploymentAmount: optionalDecimalField,
    supplementalCreditThreshold: optionalDecimalField,
    supplementalCreditRate: optionalDecimalField,
    bpaClawbackStart: optionalDecimalField,
    bpaClawbackEnd: optionalDecimalField,
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

taxConfigVersionSchema.index({ jurisdiction: 1, effectiveFrom: 1, status: 1 });

export const TaxConfigVersion = mongoose.model<ITaxConfigVersion>(
  'TaxConfigVersion',
  taxConfigVersionSchema
);

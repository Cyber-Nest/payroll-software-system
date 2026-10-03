import mongoose, { Schema } from 'mongoose';

export type DeductionCalculationMethod = 'tax_table' | 'cra_rules' | 'fixed' | 'percentage';

export interface IDeductionType {
  code: string;
  name: string;
  description?: string;
  kind: 'statutory' | 'custom';
  employerId?: mongoose.Types.ObjectId;
  provinces: string[];
  mandatory: boolean;
  calculationMethod: DeductionCalculationMethod;
  value?: mongoose.Types.Decimal128;
  customType?: 'voluntary' | 'custom';
  category?: string;
  employmentType?: string;
  payFrequency?: string;
  employeeScope?: string;
  defaultForNewEmployees?: boolean;
  showOnPaystub?: boolean;
  includeInCraReports?: boolean;
  status: 'active' | 'inactive';
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const deductionTypeSchema = new Schema<IDeductionType>(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: String,
    kind: { type: String, enum: ['statutory', 'custom'], required: true, index: true },
    employerId: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    provinces: [{ type: String, enum: ['AB', 'BC', 'MB', 'SK', 'ON'] }],
    mandatory: { type: Boolean, default: false },
    calculationMethod: {
      type: String,
      enum: ['tax_table', 'cra_rules', 'fixed', 'percentage'],
      required: true
    },
    value: Schema.Types.Decimal128,
    customType: { type: String, enum: ['voluntary', 'custom'], default: 'voluntary' },
    category: String,
    employmentType: { type: String, default: 'all' },
    payFrequency: { type: String, default: 'all' },
    employeeScope: { type: String, default: 'all' },
    defaultForNewEmployees: { type: Boolean, default: false },
    showOnPaystub: { type: Boolean, default: true },
    includeInCraReports: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'SuperAdmin' }
  },
  { timestamps: true }
);

deductionTypeSchema.index({ code: 1, employerId: 1 }, { unique: true });

export const DeductionType = mongoose.model<IDeductionType>('DeductionType', deductionTypeSchema);

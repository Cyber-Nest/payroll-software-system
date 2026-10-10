import mongoose, { Schema } from 'mongoose';

export interface ICompany {
  legalName: string;
  operatingName?: string;
  customerId: string;
  businessNumber?: string;
  businessType?: string;
  industry?: string;
  naicsCode?: string;
  employeeCount?: number;
  customerCarePhone?: string;
  status?: 'draft' | 'pending_activation' | 'active' | 'suspended';
  address?: {
    street?: string;
    line2?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    country?: string;
  };
  craPayroll?: Record<string, unknown>;
  payrollConfiguration?: Record<string, unknown>;
  banking?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  subscription?: { plan?: string; billingFrequency?: string; startDate?: string };
  features?: Record<string, boolean>;
  createdAt: Date;
}

const companySchema = new Schema<ICompany>(
  {
    legalName: { type: String, required: true },
    operatingName: String,
    customerId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    businessNumber: String,
    businessType: String,
    industry: String,
    naicsCode: String,
    employeeCount: { type: Number, default: 0 },
    customerCarePhone: String,
    status: { type: String, enum: ['draft', 'pending_activation', 'active', 'suspended'], default: 'active' },
    address: {
      street: String,
      line2: String,
      city: String,
      province: String,
      postalCode: String,
      country: { type: String, default: 'Canada' }
    },
    craPayroll: Schema.Types.Mixed,
    payrollConfiguration: Schema.Types.Mixed,
    banking: Schema.Types.Mixed,
    settings: Schema.Types.Mixed,
    subscription: {
      plan: String,
      billingFrequency: String,
      startDate: String
    },
    features: Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Company = mongoose.model<ICompany>('Company', companySchema);

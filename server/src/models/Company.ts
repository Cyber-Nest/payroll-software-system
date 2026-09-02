import mongoose, { Schema } from 'mongoose';

export interface ICompany {
  legalName: string;
  operatingName?: string;
  customerId: string;
  address?: {
    street?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    country?: string;
  };
  createdAt: Date;
}

const companySchema = new Schema<ICompany>(
  {
    legalName: { type: String, required: true },
    operatingName: String,
    customerId: { type: String, required: true, unique: true, uppercase: true, trim: true },
    address: {
      street: String,
      city: String,
      province: String,
      postalCode: String,
      country: { type: String, default: 'Canada' }
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Company = mongoose.model<ICompany>('Company', companySchema);

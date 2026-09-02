import mongoose, { Schema } from 'mongoose';

export interface IEmployee {
  userId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  employeeNumber: string;
  legalFirstName: string;
  middleName?: string;
  legalLastName: string;
  salutation?: string;
  preferredFirstName?: string;
  preferredLastName?: string;
  citizenship?: string;
  sinEncrypted?: string;
  birthDate?: Date;
  addresses: Array<{ street: string; city: string; province: string; postalCode: string }>;
  phones: Array<{ type: 'Home' | 'Mobile' | 'Work'; number: string }>;
  companyEmail?: string;
  personalEmail?: string;
  notificationEmailPreference: 'company' | 'personal';
  emergencyContacts: Array<{ name: string; relationship: string; phone: string }>;
  occupation?: string;
  startDate?: Date;
  seniorityDate?: Date;
  primaryEarningCode?: string;
  payGroup?: string;
  taxProvince?: string;
  wcbNumber?: string;
  personalTaxCredits?: { federalClaimAmount: mongoose.Types.Decimal128; provincialClaimAmount: mongoose.Types.Decimal128 };
  payStatementPreference: { emailStatement: boolean; language: 'English' | 'French' };
}

const employeeSchema = new Schema<IEmployee>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  employeeNumber: { type: String, required: true, trim: true },
  legalFirstName: { type: String, required: true },
  middleName: String,
  legalLastName: { type: String, required: true },
  salutation: String,
  preferredFirstName: String,
  preferredLastName: String,
  citizenship: String,
  sinEncrypted: String,
  birthDate: Date,
  addresses: [{ street: String, city: String, province: String, postalCode: String }],
  phones: [{ type: { type: String, enum: ['Home', 'Mobile', 'Work'] }, number: String }],
  companyEmail: String,
  personalEmail: String,
  notificationEmailPreference: { type: String, enum: ['company', 'personal'], default: 'personal' },
  emergencyContacts: [{ name: String, relationship: String, phone: String }],
  occupation: String,
  startDate: Date,
  seniorityDate: Date,
  primaryEarningCode: String,
  payGroup: String,
  taxProvince: String,
  wcbNumber: String,
  personalTaxCredits: {
    federalClaimAmount: Schema.Types.Decimal128,
    provincialClaimAmount: Schema.Types.Decimal128
  },
  payStatementPreference: {
    emailStatement: { type: Boolean, default: true },
    language: { type: String, enum: ['English', 'French'], default: 'English' }
  }
});

employeeSchema.index({ companyId: 1, employeeNumber: 1 }, { unique: true });
employeeSchema.index({ userId: 1, companyId: 1 }, { unique: true });

export const Employee = mongoose.model<IEmployee>('Employee', employeeSchema);

import mongoose, { Schema } from 'mongoose';
import { RoleName, roleNames } from '../security/rbac';

export interface IEmployerUser {
  companyId: mongoose.Types.ObjectId;
  companyIds?: mongoose.Types.ObjectId[];
  lastSelectedCompanyId?: mongoose.Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  passwordHash: string;
  role: RoleName;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

const employerUserSchema = new Schema<IEmployerUser>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    companyIds: [{ type: Schema.Types.ObjectId, ref: 'Company', index: true }],
    lastSelectedCompanyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: String,
    jobTitle: String,
    passwordHash: { type: String, required: true },
    role: { type: String, enum: roleNames, default: 'Company Owner' },
    isActive: { type: Boolean, default: true },
    mustChangePassword: { type: Boolean, default: true },
    lastLoginAt: Date
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

employerUserSchema.index({ companyId: 1, role: 1 });

export const EmployerUser = mongoose.model<IEmployerUser>('EmployerUser', employerUserSchema);

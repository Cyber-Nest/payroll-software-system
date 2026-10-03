import mongoose, { Schema } from 'mongoose';

export interface ISuperAdmin {
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

const superAdminSchema = new Schema<ISuperAdmin>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const SuperAdmin = mongoose.model<ISuperAdmin>('SuperAdmin', superAdminSchema);

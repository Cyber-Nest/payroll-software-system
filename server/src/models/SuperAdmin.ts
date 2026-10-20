import mongoose, { Schema } from 'mongoose';

export interface ISuperAdmin {
  staffOwnerId?: mongoose.Types.ObjectId;
  staffProfile?: Record<string, string>;
  sectionPermissions?: string[];
  name: string;
  email: string;
  role?: string;
  phone?: string;
  department?: string;
  permissions?: Record<string, string[]>;
  passwordHash: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
}

const superAdminSchema = new Schema<ISuperAdmin>(
  {
    staffOwnerId: { type: Schema.Types.ObjectId, ref: 'SuperAdmin', index: true },
    staffProfile: Schema.Types.Mixed,
    sectionPermissions: { type: [String], default: undefined },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    role: { type: String, default: 'CyberNest Super Admin' },
    phone: String,
    department: String,
    permissions: { type: Schema.Types.Mixed, default: {} },
    passwordHash: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const SuperAdmin = mongoose.model<ISuperAdmin>('SuperAdmin', superAdminSchema);

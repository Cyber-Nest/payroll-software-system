import mongoose, { Schema } from 'mongoose';

export interface IUser {
  email: string;
  passwordHash: string;
  mustChangePassword: boolean;
  isActive: boolean;
  lastLoginAt?: Date;
  twoFactorEnabled: boolean;
  lastSelectedEmployeeId?: mongoose.Types.ObjectId;
  createdAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    mustChangePassword: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
    twoFactorEnabled: { type: Boolean, default: false },
    lastSelectedEmployeeId: { type: Schema.Types.ObjectId, ref: 'Employee' }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const User = mongoose.model<IUser>('User', userSchema);

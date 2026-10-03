import mongoose, { Schema } from 'mongoose';

export type ResetAccountType = 'employee' | 'employer' | 'super-admin';

export interface IPasswordResetToken {
  accountType: ResetAccountType;
  accountId: mongoose.Types.ObjectId;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    accountType: { type: String, enum: ['employee', 'employer', 'super-admin'], required: true, index: true },
    accountId: { type: Schema.Types.ObjectId, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: Date
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

passwordResetTokenSchema.index({ accountType: 1, accountId: 1, usedAt: 1 });

export const PasswordResetToken = mongoose.model<IPasswordResetToken>('PasswordResetToken', passwordResetTokenSchema);

import mongoose, { Schema } from 'mongoose';

export interface IAccessRole {
  name: string;
  type: 'System' | 'Custom';
  description: string;
  users: number;
  status: 'Active' | 'Inactive';
  permissions: Record<string, string[]>;
  createdAt: Date;
  updatedAt: Date;
}

const accessRoleSchema = new Schema<IAccessRole>(
  {
    name: { type: String, required: true, trim: true, unique: true },
    type: { type: String, enum: ['System', 'Custom'], default: 'Custom' },
    description: { type: String, default: 'No description added yet.' },
    users: { type: Number, default: 0 },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    permissions: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

export const AccessRole = mongoose.model<IAccessRole>('AccessRole', accessRoleSchema);

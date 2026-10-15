import mongoose, { Schema } from 'mongoose';

export interface IEmployerBenefit {
  companyId: mongoose.Types.ObjectId;
  name: string;
  type: string;
  coverageOrValue: string;
  description: string;
  employeeScope: 'all' | 'selected';
  employeeIds: mongoose.Types.ObjectId[];
  applicableFrom: string;
  status: 'active' | 'inactive';
}
const schema = new Schema<IEmployerBenefit>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  name: { type: String, required: true, trim: true }, type: { type: String, required: true },
  coverageOrValue: { type: String, required: true }, description: { type: String, default: '' },
  employeeScope: { type: String, enum: ['all', 'selected'], required: true },
  employeeIds: [{ type: Schema.Types.ObjectId, ref: 'Employee' }],
  applicableFrom: { type: String, required: true }, status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });
export const EmployerBenefit = mongoose.model<IEmployerBenefit>('EmployerBenefit', schema);

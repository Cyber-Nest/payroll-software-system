import mongoose, { Schema } from 'mongoose';

export interface ITaxFormDocument {
  employeeId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  taxYear: number;
  formType: string;
  fileUrl?: string;
  generatedAt: Date;
}

const taxFormDocumentSchema = new Schema<ITaxFormDocument>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  taxYear: { type: Number, required: true },
  formType: { type: String, required: true },
  fileUrl: String,
  generatedAt: { type: Date, default: Date.now }
});

export const TaxFormDocument = mongoose.model<ITaxFormDocument>('TaxFormDocument', taxFormDocumentSchema);

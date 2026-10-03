import mongoose, { Schema } from 'mongoose';
import { RoePdfData } from '../utils/pdf';

export interface IRoeDocument {
  companyId: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId;
  generatedBy: mongoose.Types.ObjectId;
  generatedAt: Date;
  data: RoePdfData;
}

const roeDocumentSchema = new Schema<IRoeDocument>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  generatedBy: { type: Schema.Types.ObjectId, ref: 'SuperAdmin', required: true },
  generatedAt: { type: Date, default: Date.now, index: true },
  data: { type: Schema.Types.Mixed, required: true }
});

export const RoeDocument = mongoose.model<IRoeDocument>('RoeDocument', roeDocumentSchema);

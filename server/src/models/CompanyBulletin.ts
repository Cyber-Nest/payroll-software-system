import mongoose, { Schema } from 'mongoose';

export interface ICompanyBulletin {
  companyId: mongoose.Types.ObjectId;
  title: string;
  body: string;
  postedAt: Date;
  postedBy?: string;
  readByEmployeeIds: mongoose.Types.ObjectId[];
}

const companyBulletinSchema = new Schema<ICompanyBulletin>({
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  postedAt: { type: Date, default: Date.now },
  postedBy: String,
  readByEmployeeIds: [{ type: Schema.Types.ObjectId, ref: 'Employee' }]
});

export const CompanyBulletin = mongoose.model<ICompanyBulletin>('CompanyBulletin', companyBulletinSchema);

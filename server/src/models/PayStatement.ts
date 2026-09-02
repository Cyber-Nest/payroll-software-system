import mongoose, { Schema } from 'mongoose';

const moneyLineSchema = new Schema(
  { code: String, description: String, amount: Schema.Types.Decimal128 },
  { _id: false }
);

export interface IPayStatement {
  employeeId: mongoose.Types.ObjectId;
  companyId: mongoose.Types.ObjectId;
  payDate: Date;
  payPeriodNumber: number;
  payPeriodYear: number;
  type?: string;
  netPay: mongoose.Types.Decimal128;
  yearToDateNetPay: mongoose.Types.Decimal128;
  grossEarnings: Array<{ code: string; description: string; amount: mongoose.Types.Decimal128 }>;
  deductions: Array<{ code: string; description: string; amount: mongoose.Types.Decimal128 }>;
  additionalInfo: Array<{ key: string; value: string }>;
  isUnread: boolean;
  pdfUrl?: string;
}

const payStatementSchema = new Schema<IPayStatement>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  payDate: { type: Date, required: true },
  payPeriodNumber: { type: Number, required: true },
  payPeriodYear: { type: Number, required: true },
  type: String,
  netPay: { type: Schema.Types.Decimal128, required: true },
  yearToDateNetPay: { type: Schema.Types.Decimal128, required: true },
  grossEarnings: [moneyLineSchema],
  deductions: [moneyLineSchema],
  additionalInfo: [{ key: String, value: String }],
  isUnread: { type: Boolean, default: false },
  pdfUrl: String
});

export const PayStatement = mongoose.model<IPayStatement>('PayStatement', payStatementSchema);

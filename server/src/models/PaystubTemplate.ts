import mongoose, { Schema } from 'mongoose';

export interface IPaystubTemplate {
  name: string;
  code: string;
  description?: string;
  status: 'active' | 'inactive';
  isSystem: boolean;
  layout: 'standard' | 'compact';
  title: string;
  payPeriodLabel: string;
  regularHourLabel: string;
  overtimeHourLabel: string;
  doubleTimeHourLabel: string;
  rateDisplayFormat: string;
  showPayGroup: boolean;
  showDepartment: boolean;
  showJobTitle: boolean;
  showLocation: boolean;
  showEmployeeSin: boolean;
  maskSin: boolean;
  showHireDate: boolean;
  showAccruals: boolean;
  message?: string;
  disclaimer?: string;
  delivery: {
    availableInPortal: boolean;
    emailAutomatically: boolean;
    passwordProtectPdf: boolean;
    allowDownload: boolean;
    keepYears: string;
  };
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const paystubTemplateSchema = new Schema<IPaystubTemplate>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true, unique: true },
    description: String,
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    isSystem: { type: Boolean, default: false },
    layout: { type: String, enum: ['standard', 'compact'], default: 'standard' },
    title: { type: String, default: 'Earnings Statement' },
    payPeriodLabel: { type: String, default: 'Pay Period' },
    regularHourLabel: { type: String, default: 'Regular Hours' },
    overtimeHourLabel: { type: String, default: 'Overtime Hours' },
    doubleTimeHourLabel: { type: String, default: 'Double Time Hours' },
    rateDisplayFormat: { type: String, default: 'Show $ per hour' },
    showPayGroup: { type: Boolean, default: true },
    showDepartment: { type: Boolean, default: true },
    showJobTitle: { type: Boolean, default: true },
    showLocation: { type: Boolean, default: true },
    showEmployeeSin: { type: Boolean, default: false },
    maskSin: { type: Boolean, default: true },
    showHireDate: { type: Boolean, default: true },
    showAccruals: { type: Boolean, default: true },
    message: { type: String, default: 'Thank you for your hard work!' },
    disclaimer: {
      type: String,
      default: 'This pay statement is for information purposes only. Please contact HR if you have any questions.'
    },
    delivery: {
      availableInPortal: { type: Boolean, default: true },
      emailAutomatically: { type: Boolean, default: true },
      passwordProtectPdf: { type: Boolean, default: false },
      allowDownload: { type: Boolean, default: true },
      keepYears: { type: String, default: '7 Years' }
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'SuperAdmin' }
  },
  { timestamps: true }
);

export const PaystubTemplate = mongoose.model<IPaystubTemplate>('PaystubTemplate', paystubTemplateSchema);

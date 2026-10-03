import mongoose, { Schema } from 'mongoose';

export type PlatformNotificationAudience = 'employers' | 'employees' | 'both';

export interface IPlatformNotification {
  title: string;
  body: string;
  audience: PlatformNotificationAudience;
  postedAt: Date;
  postedBy: string;
  readByEmployeeIds: mongoose.Types.ObjectId[];
  readByEmployerUserIds: mongoose.Types.ObjectId[];
}

const platformNotificationSchema = new Schema<IPlatformNotification>({
  title: { type: String, required: true },
  body: { type: String, required: true },
  audience: { type: String, enum: ['employers', 'employees', 'both'], required: true, index: true },
  postedAt: { type: Date, default: Date.now, index: true },
  postedBy: { type: String, required: true },
  readByEmployeeIds: [{ type: Schema.Types.ObjectId, ref: 'Employee' }],
  readByEmployerUserIds: [{ type: Schema.Types.ObjectId, ref: 'EmployerUser' }]
});

export const PlatformNotification = mongoose.model<IPlatformNotification>(
  'PlatformNotification',
  platformNotificationSchema
);

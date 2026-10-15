import mongoose, { Schema } from 'mongoose';
import { T4FormatOptions } from '../utils/pdf';

export interface IT4Format extends T4FormatOptions {
  name: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

const schema = new Schema<IT4Format>({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, default: '', maxlength: 250 },
  headerTitle: { type: String, default: 'T4 STATEMENT', maxlength: 32 },
  accentColor: { type: String, default: '#0D1F33' },
  showLogo: { type: Boolean, default: false },
  footerText: { type: String, default: '', maxlength: 120 },
  headerStyle: { type: String, enum: ['plain', 'band'], default: 'plain' }
}, { timestamps: true });

export const T4Format = mongoose.model<IT4Format>('T4Format', schema);

// A single selection document makes selecting a default atomic.
const selectionSchema = new Schema({
  _id: { type: String, default: 'platform' },
  formatId: { type: String, required: true }
});
export const T4FormatSelection = mongoose.model('T4FormatSelection', selectionSchema);

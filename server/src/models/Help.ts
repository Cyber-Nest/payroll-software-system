import mongoose, { Schema } from 'mongoose';

export interface IHelp {
  key: string;
  brandName: string;
  heroTitle: string;
  searchPlaceholder: string;
  frequentlyAskedTitle: string;
  frequentlyAsked: Array<{ title: string }>;
  topicsTitle: string;
  topics: Array<{ title: string; icon: string; description: string }>;
  formTitle: string;
  formFields: Array<{ label: string; placeholder?: string; disabled?: boolean; options: string[] }>;
  resourcesTitle: string;
  resources: Array<{ title: string; description: string; icon: string; href?: string }>;
  contactTitle: string;
  contactLines: string[];
}

const helpSchema = new Schema<IHelp>(
  {
    key: { type: String, required: true, unique: true, index: true },
    brandName: { type: String, required: true },
    heroTitle: { type: String, required: true },
    searchPlaceholder: { type: String, required: true },
    frequentlyAskedTitle: { type: String, required: true },
    frequentlyAsked: [{ title: { type: String, required: true } }],
    topicsTitle: { type: String, required: true },
    topics: [
      {
        title: { type: String, required: true },
        icon: { type: String, required: true },
        description: { type: String, required: true }
      }
    ],
    formTitle: { type: String, required: true },
    formFields: [
      {
        label: { type: String, required: true },
        placeholder: String,
        disabled: { type: Boolean, default: false },
        options: [{ type: String }]
      }
    ],
    resourcesTitle: { type: String, required: true },
    resources: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
        icon: { type: String, required: true },
        href: String
      }
    ],
    contactTitle: { type: String, required: true },
    contactLines: [{ type: String, required: true }]
  },
  { timestamps: true, collection: 'help' }
);

export const Help = mongoose.model<IHelp>('Help', helpSchema);

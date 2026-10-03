export const defaultHelpContent = {
  key: 'employee-help',
  brandName: 'Payhours',
  heroTitle: 'How can we help?',
  searchPlaceholder: 'Search for a subject',
  frequentlyAskedTitle: 'Frequently asked',
  frequentlyAsked: [
    { title: 'Video: How do I use the ESS payroll application? (D)' },
    { title: 'How do I convert my account to log in with my email address?' },
    { title: 'Two-Factor Authentication' }
  ],
  topicsTitle: 'Find your solution by topic',
  topics: [
    { title: 'General Information', icon: 'i', description: 'General information on using the application and settings' },
    { title: 'Pay', icon: '$', description: 'Information on pay statements and tax forms' },
    { title: 'Time', icon: 'time', description: 'Time off, Availability, Available shifts, Web time, Timesheets, Holiday Calendar' },
    { title: 'Calendar', icon: 'calendar', description: 'Schedules, Available shifts, Time off requests, and more.' },
    { title: 'Documents', icon: 'documents', description: 'Communications from your employer.' },
    { title: 'Profile', icon: 'profile', description: 'Managing personal information, log-in & password' },
    { title: 'Two-Factor Authentication', icon: 'security', description: 'Information about Two-Factor Authentication (2FA)' },
    { title: 'Product Bulletins', icon: 'bulletins', description: "Stay on top of what's new and next." }
  ],
  formTitle: 'Get the right help',
  formFields: [
    { label: 'What can we help you with?', placeholder: 'Choose a topic', disabled: false, options: ['Payroll and tax forms', 'Profile and security', 'Time and calendar'] },
    { label: 'Tell us about your inquiry:', disabled: true, options: [] },
    { label: 'Choose a subject', disabled: true, options: [] }
  ],
  resourcesTitle: 'Resources',
  resources: [{ title: 'E-Book: Security best practices', description: 'Resources to keep your personal information safe.', icon: 'security' }],
  contactTitle: 'Still need help?',
  contactLines: ['If you still have unanswered questions', 'please contact your payroll administrator', 'or your manager.']
};

export type AccessRole = {
  id: string;
  name: string;
  type: 'System' | 'Custom';
  description: string;
  users: number;
  status: 'Active' | 'Inactive';
  createdDate: string;
  lastUpdated: string;
  permissions: Record<string, string[]>;
};

export const permissionModules = [
  { name: 'Employers', caption: 'Manage employer accounts and onboarding', permissions: ['View employers', 'Create employers', 'Edit employer information', 'Activate / suspend employers', 'Delete employers', 'View employer documents', 'Manage employer plans', 'View employer activity'] },
  { name: 'Users & Access', caption: 'Manage users, roles and access', permissions: ['View users', 'Create users', 'Edit users', 'Assign roles', 'Reset passwords', 'View user activity logs'] },
  { name: 'Employees', caption: 'Manage employee information', permissions: ['View employees', 'Add / edit employees', 'Import employees', 'Terminate employees', 'View employee documents'] },
  { name: 'Payroll', caption: 'Manage payroll runs and data', permissions: ['Run payroll', 'View payroll data', 'Edit payroll entries', 'Approve / finalize payroll', 'Void payroll', 'View payroll reports'] },
  { name: 'Time & Attendance', caption: 'Manage time, attendance and approvals', permissions: ['View timesheets', 'Approve time', 'Edit time entries', 'Manage schedules'] },
  { name: 'Compliance & Tax', caption: 'Manage tax settings and compliance', permissions: ['View tax configurations', 'Edit tax configurations', 'Submit CRA payroll filings', 'View compliance reports', 'Access year-end (T4)', 'Manage ROE submissions'] },
  { name: 'Billing & Subscriptions', caption: 'Manage subscriptions and invoices', permissions: ['View subscriptions', 'Create / edit subscriptions', 'View invoices', 'Manage payment method', 'View billing reports', 'Apply credits / discounts'] },
  { name: 'Reports', caption: 'Access and export reports', permissions: ['View all reports', 'Export data', 'Customize reports', 'Schedule reports'] },
  { name: 'Settings', caption: 'Manage platform settings', permissions: ['View system settings', 'Edit system settings', 'Manage integration settings', 'Manage email templates', 'Manage company branding'] },
  { name: 'System Administration', caption: 'Advanced system access', permissions: ['View audit logs', 'Manage system alerts', 'Access database tools', 'Manage API access', 'Perform system maintenance'] }
];

export const accessRoles: AccessRole[] = [
  { id: 'role-super-admin', name: 'Super Admin', type: 'System', description: 'Full access to all features and settings across the platform.', users: 2, status: 'Active', createdDate: 'Jan 1, 2026', lastUpdated: 'Jan 1, 2026', permissions: Object.fromEntries(permissionModules.map((module) => [module.name, module.permissions])) },
  { id: 'role-admin', name: 'Admin', type: 'System', description: 'Manage employers, users, payroll and most settings.', users: 4, status: 'Active', createdDate: 'Jan 1, 2026', lastUpdated: 'Sep 2, 2026', permissions: Object.fromEntries(permissionModules.slice(0, 8).map((module) => [module.name, module.permissions.slice(0, 4)])) },
  { id: 'role-support', name: 'Support', type: 'System', description: 'View and assist employers, limited administrative access.', users: 3, status: 'Active', createdDate: 'Jan 1, 2026', lastUpdated: 'Aug 20, 2026', permissions: { Employers: ['View employers', 'View employer documents'], 'Users & Access': ['View users', 'Reset passwords'], Reports: ['View all reports'] } },
  { id: 'role-compliance', name: 'Compliance Officer', type: 'Custom', description: 'Access to compliance, tax configuration and reports only.', users: 2, status: 'Active', createdDate: 'Apr 12, 2026', lastUpdated: 'Sep 1, 2026', permissions: { 'Compliance & Tax': permissionModules[5].permissions, Reports: ['View all reports', 'Export data'] } },
  { id: 'role-billing', name: 'Billing Manager', type: 'Custom', description: 'Manage subscriptions, billing and invoices.', users: 1, status: 'Active', createdDate: 'May 3, 2026', lastUpdated: 'Aug 14, 2026', permissions: { 'Billing & Subscriptions': permissionModules[6].permissions } },
  { id: 'role-hr', name: 'HR Specialist', type: 'Custom', description: 'Manage employee data, time & attendance and reports.', users: 0, status: 'Inactive', createdDate: 'Jun 18, 2026', lastUpdated: 'Jul 8, 2026', permissions: { Employees: permissionModules[2].permissions, Reports: ['View all reports'] } }
];

export const accessUsers = [
  { id: 'user-js', name: 'John Smith', email: 'john.smith@payhours.ca', role: 'Super Admin', employer: 'Payhours Inc.', status: 'Active', lastLogin: 'Sep 9, 2026 10:15 AM', createdDate: 'Jan 12, 2025', phone: '(403) 555-1234', department: 'Operations', timeZone: 'Mountain Time (MT)', twoFactor: 'Enabled', loginMethod: 'Email & Password' },
  { id: 'user-ps', name: 'Priya Shah', email: 'priya.shah@payhours.ca', role: 'Admin', employer: 'Payhours Inc.', status: 'Active', lastLogin: 'Sep 9, 2026 09:42 AM', createdDate: 'Mar 3, 2025', phone: '(416) 555-0188', department: 'Platform', timeZone: 'Eastern Time (ET)', twoFactor: 'Enabled', loginMethod: 'Email & Password' },
  { id: 'user-mb', name: 'Mike Brown', email: 'mike.brown@payhours.ca', role: 'Support', employer: 'Payhours Inc.', status: 'Active', lastLogin: 'Sep 8, 2026 04:21 PM', createdDate: 'Mar 15, 2025', phone: '(587) 555-1100', department: 'Support', timeZone: 'Mountain Time (MT)', twoFactor: 'Enabled', loginMethod: 'Email & Password' },
  { id: 'user-sk', name: 'Simran Kaur', email: 'simran@maplefoods.ca', role: 'Employer Admin', employer: 'Maple Foods Inc.', status: 'Active', lastLogin: 'Sep 9, 2026 08:12 AM', createdDate: 'Apr 10, 2025', phone: '(604) 555-7744', department: 'Payroll', timeZone: 'Pacific Time (PT)', twoFactor: 'Enabled', loginMethod: 'Email & Password' },
  { id: 'user-rd', name: 'Rahul Desai', email: 'rahul@spicehub.ca', role: 'Manager', employer: 'Spice Hub Restaurant', status: 'Active', lastLogin: 'Sep 8, 2026 06:35 PM', createdDate: 'May 2, 2025', phone: '(403) 555-9292', department: 'Operations', timeZone: 'Mountain Time (MT)', twoFactor: 'Disabled', loginMethod: 'Email & Password' },
  { id: 'user-lc', name: 'Linda Chen', email: 'linda@tastybites.ca', role: 'Employer Admin', employer: 'Tasty Bites Inc.', status: 'Active', lastLogin: 'Sep 9, 2026 09:05 AM', createdDate: 'May 18, 2025', phone: '(647) 555-4100', department: 'Finance', timeZone: 'Eastern Time (ET)', twoFactor: 'Enabled', loginMethod: 'Email & Password' },
  { id: 'user-as', name: 'Aman Singh', email: 'aman@urbanpizza.ca', role: 'Manager', employer: 'Urban Pizza Co.', status: 'Active', lastLogin: 'Sep 7, 2026 11:22 AM', createdDate: 'Jun 1, 2025', phone: '(780) 555-2190', department: 'Store', timeZone: 'Mountain Time (MT)', twoFactor: 'Enabled', loginMethod: 'Email & Password' },
  { id: 'user-pm', name: 'Pooja Mehta', email: 'pooja@lakeviewgrill.ca', role: 'Employee', employer: 'Lakeview Grill', status: 'Active', lastLogin: 'Sep 7, 2026 07:18 PM', createdDate: 'Jun 10, 2025', phone: '(905) 555-0134', department: 'Kitchen', timeZone: 'Eastern Time (ET)', twoFactor: 'Disabled', loginMethod: 'Email & Password' },
  { id: 'user-dk', name: 'David Kim', email: 'david@freshfoods.ca', role: 'Manager', employer: 'Fresh Foods Co.', status: 'Inactive', lastLogin: 'Aug 28, 2026 02:11 PM', createdDate: 'Jun 15, 2025', phone: '(236) 555-7676', department: 'Operations', timeZone: 'Pacific Time (PT)', twoFactor: 'Disabled', loginMethod: 'Email & Password' },
  { id: 'user-sa', name: 'Sara Ali', email: 'sara@payhours.ca', role: 'Support', employer: 'Payhours Inc.', status: 'Active', lastLogin: 'Sep 9, 2026 01:30 PM', createdDate: 'Jul 3, 2025', phone: '(403) 555-8844', department: 'Support', timeZone: 'Mountain Time (MT)', twoFactor: 'Enabled', loginMethod: 'Email & Password' }
];

export const activityLogs = [
  { id: 'act-1', dateTime: 'Sep 9, 2026 2:14 PM', user: 'John Smith', employer: 'Maple Foods Inc.', role: 'Payroll Admin', action: 'Finalize Payroll', module: 'Payroll', details: 'Payroll Run PR-000231 (CAD $48,620.15)', status: 'Success', ipAddress: '24.112.56.78', referenceId: 'PR-000231', device: 'Windows / Chrome 140.0', location: 'Calgary, AB, Canada' },
  { id: 'act-2', dateTime: 'Sep 9, 2026 1:42 PM', user: 'Priya Kaur', employer: 'Tasty Bites Inc.', role: 'HR Manager', action: 'Add Employee', module: 'Employees', details: 'Added employee Amanpreet Singh', status: 'Success', ipAddress: '70.33.21.115', referenceId: 'EMP-00421', device: 'macOS / Safari', location: 'Toronto, ON, Canada' },
  { id: 'act-3', dateTime: 'Sep 9, 2026 12:31 PM', user: 'Rahul Desai', employer: 'Spice Hub Restaurant', role: 'Owner', action: 'Update Company', module: 'Settings', details: 'Updated company contact information', status: 'Success', ipAddress: '99.84.12.66', referenceId: 'CO-112', device: 'Windows / Edge', location: 'Calgary, AB, Canada' },
  { id: 'act-4', dateTime: 'Sep 9, 2026 11:18 AM', user: 'Simran Kaur', employer: 'Urban Pizza Co.', role: 'Manager', action: 'View Report', module: 'Reports', details: 'Viewed Payroll Summary Report', status: 'Success', ipAddress: '24.112.56.78', referenceId: 'RPT-908', device: 'ChromeOS / Chrome', location: 'Vancouver, BC, Canada' },
  { id: 'act-5', dateTime: 'Sep 9, 2026 10:05 AM', user: 'Mike Brown', employer: 'Payhours Inc.', role: 'Support', action: 'Login', module: 'System', details: 'User logged in', status: 'Success', ipAddress: '142.66.33.10', referenceId: 'AUTH-672', device: 'Windows / Chrome', location: 'Ottawa, ON, Canada' },
  { id: 'act-6', dateTime: 'Sep 9, 2026 5:47 PM', user: 'Linda Chen', employer: 'Golden Grill Ltd.', role: 'Payroll Admin', action: 'Edit Employee', module: 'Employees', details: 'Updated employee hourly rate', status: 'Success', ipAddress: '24.112.56.78', referenceId: 'EMP-00128', device: 'Windows / Chrome', location: 'Calgary, AB, Canada' },
  { id: 'act-7', dateTime: 'Sep 8, 2026 3:20 PM', user: 'Aman Singh', employer: 'Maple Foods Inc.', role: 'Manager', action: 'Approve Time', module: 'Time & Attendance', details: 'Approved 12 time entries', status: 'Success', ipAddress: '70.33.21.115', referenceId: 'TIME-455', device: 'iOS / Safari', location: 'Mississauga, ON, Canada' },
  { id: 'act-8', dateTime: 'Sep 8, 2026 1:15 PM', user: 'Pooja Mehta', employer: 'Lakeview Grill', role: 'Billing Admin', action: 'Update Subscription', module: 'Billing', details: 'Changed plan to Professional', status: 'Success', ipAddress: '99.84.12.66', referenceId: 'SUB-321', device: 'Windows / Firefox', location: 'Toronto, ON, Canada' },
  { id: 'act-9', dateTime: 'Sep 8, 2026 11:03 AM', user: 'John Smith', employer: 'Payhours Inc.', role: 'Super Admin', action: 'Create User', module: 'Users & Access', details: 'Created user: support@payhours.ca', status: 'Success', ipAddress: '24.112.56.78', referenceId: 'USR-887', device: 'Windows / Chrome 140.0', location: 'Calgary, AB, Canada' },
  { id: 'act-10', dateTime: 'Sep 8, 2026 9:18 AM', user: 'David Kim', employer: 'Fresh Foods Co.', role: 'View Only', action: 'View Tax Report', module: 'Compliance & Tax', details: 'Viewed T4 Summary', status: 'Success', ipAddress: '172.31.44.21', referenceId: 'TAX-2026', device: 'Android / Chrome', location: 'Vancouver, BC, Canada' }
];

export const permissionMatrix = {
  role: { name: 'Payroll Manager', type: 'Custom', description: 'Manages payroll and employee data.', status: 'Active', totalPermissions: 28, modulesConfigured: '6 / 9', createdDate: 'Sep 9, 2026', lastUpdated: '-' },
  primaryModule: 'Employers',
  actions: ['View', 'Create', 'Edit', 'Delete', 'Approve'],
  rows: [
    { permission: 'View Employers', description: 'View list of all employers and details', grants: ['View'] },
    { permission: 'Create Employers', description: 'Create new employer accounts', grants: ['Create'] },
    { permission: 'Edit Employer Information', description: 'Edit employer company details', grants: ['View', 'Edit'] },
    { permission: 'Activate / Suspend', description: 'Activate or suspend employer accounts', grants: ['View', 'Edit'] },
    { permission: 'Delete Employers', description: 'Permanently delete employer accounts', grants: ['Delete'] },
    { permission: 'View Employer Documents', description: 'View uploaded documents (business, CRA, etc.)', grants: ['View'] },
    { permission: 'Manage Employer Plans', description: 'Assign or change subscription plans', grants: ['View', 'Edit'] },
    { permission: 'View Employer Activity', description: 'View activity logs for employer accounts', grants: ['View'] }
  ],
  subModuleActions: ['View', 'Create', 'Edit', 'Delete'],
  subModules: [
    { name: 'Employer Contacts', description: 'Manage employer contact persons', grants: ['View', 'Edit'] },
    { name: 'Employer Locations', description: 'Manage multiple locations per employer', grants: ['View', 'Create', 'Edit'] },
    { name: 'Employer Banking', description: 'View and manage banking information', grants: ['View'] },
    { name: 'Employer Notes', description: 'Add and view internal notes', grants: ['View', 'Create'] },
    { name: 'Employer Audit Log', description: 'View audit logs for this employer', grants: ['View'] }
  ],
  configuredModules: ['Employers (8 permissions)', 'Users & Access (6 permissions)', 'Employees (5 permissions)', 'Payroll (8 permissions)', 'Reports (2 permissions)', 'Settings (4 permissions)'],
  nextSteps: ['Configure remaining modules (optional)', 'Review all permissions', 'Save the role and assign to users']
};

export function superAdminAccessPayload(overrides: { totalUsers?: number; activeUsers?: number; employers?: number } = {}) {
  const totalUsers = overrides.totalUsers || 86;
  const activeUsers = overrides.activeUsers || 78;
  return {
    metrics: {
      totalRoles: accessRoles.length,
      activeRoles: accessRoles.filter((role) => role.status === 'Active').length,
      inactiveRoles: accessRoles.filter((role) => role.status === 'Inactive').length,
      usersAssigned: accessRoles.reduce((sum, role) => sum + role.users, 0),
      totalUsers,
      activeUsers,
      inactiveUsers: totalUsers - activeUsers,
      userRoles: 6,
      pendingInvitations: 5,
      activities: 12458,
      activeActivityUsers: 892,
      employersWithActivity: overrides.employers || 48,
      securityIssues: 0
    },
    modules: permissionModules,
    roles: accessRoles,
    users: accessUsers,
    activityLogs,
    permissionMatrix
  };
}

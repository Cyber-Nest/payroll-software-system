export const permissions = [
  'employee.view',
  'employee.create',
  'employee.edit',
  'employee.sin.view',
  'employee.compensation.view',
  'payroll.view',
  'payroll.prepare',
  'payroll.approve',
  'payroll.reverse',
  'tax.view',
  'tax.manage',
  'reports.view',
  'reports.export',
  'bank.view',
  'bank.edit',
  'users.manage',
  'audit.view',
  'bulletins.manage',
  'self.context.view',
  'self.context.switch',
  'self.profile.view',
  'self.profile.edit',
  'self.security.edit',
  'self.pay.view',
  'self.tax.view',
  'self.bulletins.view'
] as const;

export type Permission = typeof permissions[number];

export const roleNames = [
  'Company Owner',
  'Payroll Administrator',
  'Payroll Approver',
  'HR Administrator',
  'Manager',
  'Accountant',
  'Employee',
  'Auditor',
  'CyberNest Super Admin'
] as const;

export type RoleName = typeof roleNames[number];

export const rolePermissions: Record<RoleName, Permission[]> = {
  'Company Owner': permissions.filter((permission) => permission !== 'tax.manage' && !permission.startsWith('self.')),
  'Payroll Administrator': [
    'employee.view',
    'employee.compensation.view',
    'payroll.view',
    'payroll.prepare',
    'reports.view',
    'reports.export',
    'bank.view',
    'tax.view',
    'bulletins.manage'
  ],
  'Payroll Approver': ['payroll.view', 'payroll.approve', 'payroll.reverse', 'reports.view', 'audit.view'],
  'HR Administrator': ['employee.view', 'employee.create', 'employee.edit', 'employee.sin.view', 'employee.compensation.view', 'bank.view', 'bank.edit', 'users.manage', 'bulletins.manage'],
  Manager: ['employee.view', 'payroll.view', 'reports.view'],
  Accountant: ['payroll.view', 'tax.view', 'reports.view', 'reports.export', 'bank.view'],
  // ESS permissions are deliberately self-scoped. An Employee can read/edit their own
  // portal profile without receiving the company-level employee.edit permission.
  Employee: ['employee.view', 'bank.view', 'self.context.view', 'self.context.switch', 'self.profile.view', 'self.profile.edit', 'self.security.edit', 'self.pay.view', 'self.tax.view', 'self.bulletins.view'],
  Auditor: ['employee.view', 'payroll.view', 'tax.view', 'reports.view', 'reports.export', 'audit.view'],
  'CyberNest Super Admin': [...permissions]
};

const legacyRoleMap: Record<string, RoleName> = {
  admin: 'Company Owner',
  payroll_manager: 'Payroll Administrator',
  'Super Admin': 'CyberNest Super Admin',
  Admin: 'CyberNest Super Admin',
  Support: 'Auditor',
  'Employer Admin': 'Company Owner',
  Owner: 'Company Owner',
  'Payroll Admin': 'Payroll Administrator',
  'HR Manager': 'HR Administrator'
};

export function normalizeRole(role?: string): RoleName {
  if (!role) return 'Employee';
  if ((roleNames as readonly string[]).includes(role)) return role as RoleName;
  return legacyRoleMap[role] || 'Employee';
}

export function permissionsForRole(role?: string): Permission[] {
  return rolePermissions[normalizeRole(role)] || [];
}

export function roleHasPermission(role: string | undefined, permission: Permission): boolean {
  return permissionsForRole(role).includes(permission);
}

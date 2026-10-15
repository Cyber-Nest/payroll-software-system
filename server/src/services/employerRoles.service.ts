import { Permission, permissions, normalizeRole, roleNames, rolePermissions } from '../security/rbac';

export type EmployerRole = {
  id: string; name: string; fullForm: string; description: string;
  status: 'Active' | 'Inactive'; permissions: Permission[]; users: number; index: number;
};
export type EmployerRoleSettings = {
  customRoles?: Array<Partial<EmployerRole> & { name: string }>;
  roleOverrides?: Record<string, Partial<EmployerRole>>;
  deletedRoleIds?: string[];
};
export function employerRoleSettings(settings?: Record<string, unknown>): EmployerRoleSettings {
  return (settings?.usersRoles || {}) as EmployerRoleSettings;
}
export function employerRoles(settings: Record<string, unknown> | undefined, users: Array<{ role: string }> = []): EmployerRole[] {
  const saved = employerRoleSettings(settings);
  const customNames = new Set((saved.customRoles || []).map((role) => saved.roleOverrides?.[role.id || '']?.name || role.name));
  const builtins = roleNames.filter((name) => name !== 'CyberNest Super Admin').map((name) => ({
    id: name, name: name === 'Company Owner' ? 'Super Admin' : name.replace('Payroll Administrator', 'Payroll Admin').replace('HR Administrator', 'HR Manager'),
    fullForm: name === 'Company Owner' ? 'Super Administrator' : name === 'HR Administrator' ? 'Human Resources Manager' : name === 'Employee' ? 'Employee Self-Service User' : name,
    description: name === 'Company Owner' ? 'Full access to all modules' : name === 'Employee' ? 'Self service access' : `Manage ${name.toLowerCase()} access`,
    status: 'Active', permissions: rolePermissions[name]
  }));
  return [...builtins, ...(saved.customRoles || [])]
    .filter((role) => role.id && !saved.deletedRoleIds?.includes(role.id))
    .map((role, index) => {
      const override = saved.roleOverrides?.[role.id!] || {};
      const merged = role.id === 'Company Owner'
        ? { ...role, ...override, name: role.name, status: 'Active', permissions: role.permissions }
        : { ...role, ...override };
      const status = (merged.status as unknown) === false || merged.status === 'Inactive' ? 'Inactive' : 'Active';
      return {
        ...merged, id: role.id!, name: merged.name || '', fullForm: merged.fullForm || merged.name || '', description: merged.description || '',
        status, permissions: (merged.permissions || []).filter((item) => permissions.includes(item)),
        users: users.filter((user) => user.role === merged.name || user.role === role.id || (!customNames.has(user.role) && (normalizeRole(user.role) !== 'Employee' || user.role === 'Employee') && normalizeRole(user.role) === role.id)).length,
        index: index + 1
      } as EmployerRole;
    });
}

export function employerPermissionOverride(settings: Record<string, unknown> | undefined, roleName: string): Permission[] | undefined {
  const saved = employerRoleSettings(settings);
  const key = normalizeRole(roleName);
  const custom = saved.customRoles?.find((role) => (saved.roleOverrides?.[role.id || '']?.name || role.name) === roleName);
  if (!custom && key === 'Company Owner') return undefined;
  if (!custom && saved.deletedRoleIds?.includes(key)) return [];
  if (!custom && key === 'Employee' && roleName !== 'Employee') return undefined;
  if (custom && saved.deletedRoleIds?.includes(custom.id || '')) return [];
  const override = custom ? saved.roleOverrides?.[custom.id || ''] || custom : saved.roleOverrides?.[key];
  if (!override) return undefined;
  if (override.status === 'Inactive' || (override.status as unknown) === false) return [];
  return (override.permissions || []).filter((item) => permissions.includes(item));
}

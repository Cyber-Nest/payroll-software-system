import { permissionsForRole, roleHasPermission } from '../src/security/rbac';

describe('rbac defaults', () => {
  it('grants expected permissions to the new employer role set', () => {
    expect(roleHasPermission('Company Owner', 'users.manage')).toBe(true);
    expect(roleHasPermission('Payroll Administrator', 'payroll.prepare')).toBe(true);
  });

  it('keeps company users away from tax management', () => {
    expect(roleHasPermission('Company Owner', 'tax.manage')).toBe(false);
    expect(roleHasPermission('Payroll Administrator', 'tax.manage')).toBe(false);
  });

  it('allows only CyberNest Super Admin to manage tax configuration by default', () => {
    expect(permissionsForRole('CyberNest Super Admin')).toContain('tax.manage');
  });
});

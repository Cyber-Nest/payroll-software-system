import { employeeCompanyScope } from '../src/utils/scope';
import { maskSin, validatePasswordRules } from '../src/utils/security';
import { encryptSin } from '../src/utils/security';

describe('Payhours employee security rules', () => {
  it('enforces the exact server-side password exclusions and strength categories', () => {
    expect(validatePasswordRules('Short1!', '0006')).toEqual([]);
    expect(validatePasswordRules('abc', '0006')).toContain('Seven characters.');
    expect(validatePasswordRules('lowercaseonly', '0006').join(' ')).toContain('Must have (3)');
    expect(validatePasswordRules('Good0006!', '0006')).toContain('Your username.');
    expect(validatePasswordRules('GoodPass1<', '0006')).toContain('The left angle-bracket character ("<").');
    expect(validatePasswordRules('GoodPass1|', '0006')).toContain('The pipe character (|).');
    expect(validatePasswordRules('GoodPass1"', '0006')).toContain('Single or double quotes.');
  });

  it('builds pay/profile/tax queries with both employee and company scope for IDOR protection', () => {
    expect(employeeCompanyScope('employee-a', 'company-a')).toEqual({
      employeeId: 'employee-a',
      companyId: 'company-a'
    });
  });

  it('never exposes a raw SIN through the employee-facing mask helper', () => {
    const masked = maskSin(encryptSin('123456123'));
    expect(masked).toBe('XXX XXX 123');
    expect(masked).not.toContain('123456123');
  });
});

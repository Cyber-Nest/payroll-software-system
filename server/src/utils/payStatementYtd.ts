export type PayStatementYtdAnchor = {
  payDate: Date;
  payPeriodYear: number;
  payPeriodNumber: number;
};

export function isInPayStatementYtd(
  statement: PayStatementYtdAnchor,
  current: PayStatementYtdAnchor
): boolean {
  if (statement.payPeriodYear !== current.payPeriodYear) return false;

  const statementPayDate = statement.payDate.getTime();
  const currentPayDate = current.payDate.getTime();
  if (statementPayDate < currentPayDate) return true;
  if (statementPayDate > currentPayDate) return false;

  return statement.payPeriodNumber <= current.payPeriodNumber;
}

import mongoose from 'mongoose';
import { env } from '../config/env';
import { configureDns } from '../config/dns';
import { Company } from '../models/Company';
import { Employee } from '../models/Employee';
import { EmployerUser } from '../models/EmployerUser';
import { PayStatement } from '../models/PayStatement';
import { EmployerReport, EmployerReportTemplate, EmployerReportSchedule, EmployerReportRun } from '../models/EmployerReport';
import { runReport } from '../services/employerReports.service';

async function main() {
  configureDns();
  await mongoose.connect(env.mongoUri, { family: 4, serverSelectionTimeoutMS: 15000 });
  if (process.argv.includes('--list')) {
    for (const company of await Company.find().select('customerId legalName').sort({ legalName: 1 })) {
      const [employees, statements, reports, schedules, templates, completedDownloads] = await Promise.all([
        Employee.countDocuments({ companyId: company._id }), PayStatement.countDocuments({ companyId: company._id }),
        EmployerReport.countDocuments({ companyId: company._id }), EmployerReportSchedule.countDocuments({ companyId: company._id }),
        EmployerReportTemplate.countDocuments({ companyId: company._id }), EmployerReportRun.countDocuments({ companyId: company._id, status: 'completed' })
      ]);
      console.log(JSON.stringify({ customerId: company.customerId, name: company.legalName, employees, statements, reports, schedules, templates, completedDownloads }));
    }
    return;
  }
  const customerId = process.argv.find((value) => value.startsWith('--company='))?.slice('--company='.length);
  if (!customerId) throw new Error('Specify --company=CUSTOMER_ID or --list.');
  const company = await Company.findOne({ customerId: customerId.toUpperCase() });
  if (!company) throw new Error('Employer not found.');
  const owner = await EmployerUser.findOne({ isActive: true, role: 'Company Owner', $or: [{ companyId: company._id }, { companyIds: company._id }] });
  if (!owner) throw new Error('An active Company Owner is required to own example schedules.');
  const samples = [
    { name: '[Sample] Employee Directory', source: 'employees' as const, fields: ['employeeNumber', 'employeeName', 'email', 'department', 'jobTitle', 'province', 'startDate'], frequency: 'monthly' as const, format: 'csv' as const },
    { name: '[Sample] Payroll Register', source: 'payroll' as const, fields: ['employeeNumber', 'employeeName', 'payDate', 'grossPay', 'deductions', 'netPay'], frequency: 'weekly' as const, format: 'excel' as const },
    { name: '[Sample] Deduction Detail', source: 'deductions' as const, fields: ['employeeNumber', 'employeeName', 'payDate', 'code', 'description', 'amount'], frequency: 'daily' as const, format: 'pdf' as const }
  ];
  for (const sample of samples) {
    const { frequency, format, ...definition } = sample;
    const key = { companyId: company._id, name: sample.name };
    const payload = { ...key, ...definition, description: 'Example configuration using existing employer records. Edit filters and fields to explore the report builder.', dateRange: 'all', employeeIds: [] };
    const report = await EmployerReport.findOneAndUpdate(key, { $setOnInsert: payload }, { upsert: true, new: true, runValidators: true });
    await EmployerReportTemplate.findOneAndUpdate(key, { $setOnInsert: payload }, { upsert: true, runValidators: true });
    const nextRunAt = new Date(); nextRunAt.setUTCDate(nextRunAt.getUTCDate() + 7); nextRunAt.setUTCHours(14, 0, 0, 0);
    const schedule = await EmployerReportSchedule.findOneAndUpdate(key, { $setOnInsert: { ...key, reportId: report._id, createdBy: owner._id, frequency, format, enabled: true, nextRunAt, anchorDay: nextRunAt.getUTCDate(), recipients: [] } }, { upsert: true, new: true, runValidators: true });
    let run = await EmployerReportRun.findOne({ companyId: company._id, reportId: report._id, scheduleId: schedule._id, status: 'completed' });
    if (!run) run = await runReport(report._id, company._id, format, schedule._id, []);
    await EmployerReportSchedule.updateOne({ _id: schedule._id, lastRunAt: { $exists: false } }, { $set: { lastRunAt: run.createdAt } });
    console.log(JSON.stringify({ employer: company.legalName, report: report.name, format, rows: run.rowCount, schedule: frequency, delivery: 'In-app only', nextRunAt: schedule.nextRunAt }));
  }
}
main().catch(() => { console.error('Report example seed failed. Check database connectivity, employer ID and active owner.'); process.exitCode = 1; }).finally(() => mongoose.disconnect());

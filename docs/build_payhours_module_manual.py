from html import escape
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

OUTPUT = Path("docs/Payhours Employer and Super Admin Module Manual.docx")


def t(text):
    return escape(str(text), quote=False)


def p(text="", style=None, align=None):
    props = []
    if style:
        props.append(f'<w:pStyle w:val="{style}"/>')
    if align:
        props.append(f'<w:jc w:val="{align}"/>')
    ppr = f"<w:pPr>{''.join(props)}</w:pPr>" if props else ""
    return f"<w:p>{ppr}<w:r><w:t xml:space=\"preserve\">{t(text)}</w:t></w:r></w:p>"


def bullet(text):
    return (
        '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>'
        f'<w:r><w:t xml:space="preserve">{t(text)}</w:t></w:r></w:p>'
    )


def page_break():
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'


def cell(text, header=False, width=2500):
    fill = '<w:shd w:fill="D9EAF7"/>' if header else ""
    bold1, bold2 = ("<w:b/>", "<w:b/>") if header else ("", "")
    return (
        f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{fill}'
        '<w:vAlign w:val="center"/></w:tcPr>'
        f'<w:p><w:pPr><w:spacing w:after="40"/></w:pPr><w:r><w:rPr>{bold1}'
        '<w:sz w:val="17"/></w:rPr>'
        f'<w:t xml:space="preserve">{t(text)}</w:t></w:r></w:p></w:tc>'
    )


def table(headers, rows, widths=None):
    widths = widths or [2400] * len(headers)
    grid = "".join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    out = [
        '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/>'
        '<w:tblBorders><w:top w:val="single" w:sz="4" w:color="D9D9D9"/>'
        '<w:left w:val="single" w:sz="4" w:color="D9D9D9"/>'
        '<w:bottom w:val="single" w:sz="4" w:color="D9D9D9"/>'
        '<w:right w:val="single" w:sz="4" w:color="D9D9D9"/>'
        '<w:insideH w:val="single" w:sz="4" w:color="D9D9D9"/>'
        '<w:insideV w:val="single" w:sz="4" w:color="D9D9D9"/></w:tblBorders>'
        '<w:tblCellMar><w:top w:w="80" w:type="dxa"/><w:left w:w="90" w:type="dxa"/>'
        '<w:bottom w:w="80" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr>',
        f"<w:tblGrid>{grid}</w:tblGrid>",
        "<w:tr>" + "".join(cell(h, True, widths[i]) for i, h in enumerate(headers)) + "</w:tr>",
    ]
    for row in rows:
        out.append("<w:tr>" + "".join(cell(row[i], False, widths[i]) for i in range(len(headers))) + "</w:tr>")
    out.append("</w:tbl>")
    out.append(p())
    return "".join(out)


parts = []
parts.append(p("Payhours Employer and Super Admin Module Manual", "Title", "center"))
parts.append(p("Functional documentation for workflows tabs fields reports APIs permissions and operational behavior", None, "center"))
parts.append(p())
parts.append(p("This manual documents how the Employer module and Super Admin module currently work in the Payhours payroll software system. It is written for product owners QA testers developers and support staff who need to understand the full journey from login through setup payroll operations documents government filings reporting settings and administrative oversight."))
parts.append(p("The documentation is based on the current application code in the client and server modules. It covers visible navigation important fields actions data sources backend endpoints permissions and expected behavior. Where a feature is a placeholder or front end only the manual names that behavior so it can be tracked during implementation planning."))


def h1(text): parts.append(p(text, "Heading1"))
def h2(text): parts.append(p(text, "Heading2"))
def para(text): parts.append(p(text))
def tbl(headers, rows, widths=None): parts.append(table(headers, rows, widths))
def bullets(items):
    for item in items:
        parts.append(bullet(item))


h1("1 System Entry Points")
tbl(["Area", "Entry", "Purpose", "Authentication"], [
    ["Employer portal", "Employer login route and dashboard shell", "Allows employer users to manage employees payroll paystubs filings documents reports company configuration settings and notifications.", "Employer JWT issued by /employer/auth/login."],
    ["Employee portal", "Employee login and self service pages", "Used by employees for pay statements and profile access. It is adjacent to the employer module but not the focus of this manual.", "Employee JWT."],
    ["Super Admin portal", "/payhours-admin or /super-admin-login", "Allows Payhours internal staff to manage employers platform users payroll accounts remittances T4 ROE notifications deduction types and audit information.", "Super Admin JWT issued by /super-admin/auth/login."],
], [1500, 2500, 4200, 2500])

h1("2 Roles and Permission Model")
para("The backend uses route guards with authenticate and requirePermission. Employer users receive permissions based on their employer role. Super admin users receive platform permissions based on the CyberNest Super Admin role and persisted role configuration.")
tbl(["Permission", "Used For", "Examples"], [
    ["reports.view", "Read dashboards reports documents account summaries audit lists and module data.", "Employer reports employer settings read company module read super admin dashboard payroll accounts audit."],
    ["users.manage", "Create or update organization level setup and access settings.", "Employer settings save company module save super admin employer CRUD access users roles payroll account setup."],
    ["payroll.view", "Read payroll data paystubs filings and state pay settings.", "Paystubs deductions government filings state pay read."],
    ["payroll.prepare", "Prepare revise file send or process payroll related records.", "Payroll runs paystub email actions government filing prepare and file state pay save."],
    ["tax.manage", "Manage statutory tax deduction T4 ROE and tax configuration records.", "Super admin deduction types T4 generation ROE generation tax config versions."],
], [1500, 3700, 5200])

h1("3 Employer Module Overview")
para("The active employer shell is a left navigation application. The main navigation includes Dashboard Employees Payroll Paystubs Benefits Deductions Government Filings Reports Documents Notifications Company and Settings. Reports has nested subnavigation when a report page is active.")
tbl(["Navigation Item", "Primary Purpose", "Important Behavior"], [
    ["Dashboard", "Shows employer level metrics payroll chart tasks next payroll notifications and quick links.", "Cards and dashboard alerts route users to Payroll or Government Filings depending on the item."],
    ["Employees", "Manage employee records and employee profile workflows.", "Supports add edit delete admin profile sections tax banking vacation benefits and employment fields."],
    ["Payroll", "Prepare approve finalize revise lock reverse and review payroll runs.", "Finalizing payroll creates pay statements and can send employee notifications."],
    ["Paystubs", "View generated pay statements download one or many PDFs and send selected paystubs.", "Downloads use the same PDF generator used by the Paystub settings preview."],
    ["Benefits", "Benefits surface in employer navigation and settings but detailed benefit administration is grouped with deductions and employee profile data.", "Benefits are listed in Deductions and Benefits settings and employee profile benefits."],
    ["Deductions", "Manage deduction records and view deduction reporting.", "Uses employer deductions endpoint and super admin deduction type definitions."],
    ["Government Filings", "Prepare file view and download CRA remittance PD7A T4 summary T4 slips and ROE filing records.", "Includes tabs for All Filings Remittance Schedule T4 Slips and Summary PD7A Filing and ROE Filings."],
    ["Reports", "Generates payroll employee tax compliance deduction custom and scheduled report views.", "Report rows redirect to their corresponding detail pages or filing sections."],
    ["Documents", "Aggregates tax documents ROE filings paystub documents and saved documents.", "Uses source specific download URLs and document categorization."],
    ["Notifications", "Shows employer notifications and broadcast messages.", "Unread counts appear in the employer top bar."],
    ["Company", "Manages company profile locations departments job positions pay schedules pay rates holidays accruals bank accounts and company settings.", "Master detail layout with save inline update and delete behavior."],
    ["Settings", "Manages cross module employer settings such as payroll tax paystub payment government filing users and roles integrations and notifications.", "General and Payroll settings have no visible edit button values are changed directly and saved."],
], [1700, 3600, 5100])

h1("4 Employer Login and Session Flow")
para("Employer authentication posts credentials to /employer/auth/login. On success the backend validates an active EmployerUser sets the last login timestamp signs an employer portal token and returns the user and company context. The frontend stores the token enters the employer dashboard and all employer API calls include Authorization Bearer token headers.")
bullets([
    "Missing token returns a 401 response. The auth middleware also accepts a token query parameter for authenticated document links.",
    "Inactive employer users cannot log in.",
    "Employer permissions are derived from role based access control and route guards enforce permissions server side.",
])

h1("5 Employer Dashboard")
para("The employer dashboard is the operational landing page after login. It summarizes payroll status employer identity pay chart values current tasks notification counts upcoming liabilities and quick links.")
tbl(["Dashboard Area", "Data Source", "Behavior"], [
    ["Company and user header", "Employer dashboard API and token context", "Shows user name company legal name search notification button help button and logout."],
    ["Metrics", "Payroll runs employees pay statements filings", "Shows payroll activity employee counts outstanding items and document totals."],
    ["Chart", "Dashboard payroll chart values", "Visualizes payroll amount trends."],
    ["Next payroll", "Latest schedule or run state", "Displays next payroll date and supports payroll navigation."],
    ["Tasks and alerts", "Payroll and filing records", "Clicking payroll tasks opens Payroll filing tasks open Government Filings."],
], [2200, 3200, 5000])

h1("6 Employer Employees")
para("The employee area manages employee records and is the foundation for payroll reporting paystubs government forms and documents. Employee data connects to User Employee PayrollRun PayStatement T4 ROE and audit records.")
tbl(["Section", "Fields and Controls", "Notes"], [
    ["List", "Employee name employee number email department status position pay group quick actions.", "Supports selecting employees for edit or delete. Delete preserves payroll history but removes active employee login records."],
    ["Add Employee", "Personal employment compensation tax vacation benefits banking and admin profile fields.", "Creates an employee and user relationship for the employer company."],
    ["Edit Employee", "Same profile sections as add flow with existing values restored.", "Changes can affect payroll calculations reports paystub labels and government forms."],
    ["Admin profile", "Personal employment compensation tax vacation benefits banking.", "Structured data is stored under employee adminProfile sections."],
    ["Validation", "Required names email employee number tax and compensation fields where applicable.", "Frontend validates key fields backend validates persistence and object ownership."],
], [1900, 4200, 4300])

h1("7 Employer Payroll")
para("The Payroll module handles payroll run preparation and lifecycle actions. It reads employees company settings deduction data state pay rules carry forward adjustments and prior pay statements. Finalizing a run creates pay statements and links statement IDs to payroll run lines.")
tbl(["Workflow Step", "Action", "System Result"], [
    ["Create or prepare run", "User enters pay period pay date pay frequency and employee line values.", "Draft or prepared payroll run stores lines with hours rates earnings deductions taxes gross pay net pay and notes."],
    ["Approve", "Authorized user approves payroll run.", "Status history records the approval action."],
    ["Finalize", "Authorized user finalizes run.", "Pay statements are created for each line year to date values are calculated statement IDs are attached and notifications may be sent."],
    ["Revise", "User revises generated payroll where allowed.", "New statement revisions supersede earlier pay statements and preserve change summary."],
    ["Lock", "User locks a finalized run.", "Further changes are restricted."],
    ["Reverse or adjust", "User reverses or creates adjustment run.", "Original and adjustment run relationships are stored for audit and reporting."],
], [1900, 3600, 4900])

h1("8 Employer Paystubs")
para("The Paystubs module lists generated pay statements and provides PDF operations. Individual download download all selected download and send selected actions use backend paystub routes. The PDF generator is server side so downloaded documents are consistent across employer employee and settings preview contexts.")
tbl(["Control", "Purpose", "Endpoint or Behavior"], [
    ["Filters", "Search and narrow paystubs by employee status date and related values.", "Frontend filtering over paystub list returned by /employer/paystubs."],
    ["Select rows", "Choose paystubs for batch download or email.", "Selected IDs are posted to download selected or send selected."],
    ["Download one", "Open a single paystub PDF.", "GET /employer/paystubs/:id/download returns inline PDF."],
    ["Download all", "Generate one PDF containing all company paystubs.", "GET /employer/paystubs/download-all."],
    ["Send selected", "Email selected paystubs to employees.", "POST /employer/paystubs/send-selected requires payroll.prepare."],
    ["Settings preview", "Shows exact PDF output for a sample paystub.", "Frontend fetches the paystub PDF with bearer token creates a local blob URL and embeds it."],
], [1800, 3700, 4900])

h1("9 Employer Government Filings")
para("Government Filings manages statutory filing records generated from payroll and year end data. The page has tabs for All Filings Remittance Schedule T4 Slips and Summary PD7A Filing and ROE Filings. Filing actions are permission protected and audited through backend records.")
tbl(["Tab", "Records", "Actions"], [
    ["All Filings", "CRA remittance PD7A T4 slips T4 summary and ROE records.", "Filter by type status year period and search text."],
    ["Remittance Schedule", "CRA remittance filings.", "Prepare mark paid filed view and download related records."],
    ["T4 Slips and Summary", "T4 slips and T4 summary records.", "Prepare file download where available."],
    ["PD7A Filing", "PD7A statement records.", "Prepare file download where available."],
    ["ROE Filings", "Record of Employment records.", "Prepare file download where available."],
], [2000, 4100, 4300])

h1("10 Employer Reports")
para("Reports are grouped into Payroll Reports Employee Reports Tax and Compliance Reports Benefits and Deductions Reports Custom Reports and Scheduled Reports. Report cards show DOC badges descriptions available formats and arrow actions. Some rows open real report pages while custom and scheduled items are currently listed without detailed generation flows.")
tbl(["Report Group", "Reports", "Destination"], [
    ["Payroll Reports", "Payroll Summary Payroll Register Pay Run Comparison Year to Date Summary Payroll Variance Report Paystub Audit Report.", "Payroll Reports page with tabs for Payroll Summary Payroll Details Pay Run Comparison Earnings Deductions Net Pay and YTD Summary."],
    ["Employee Reports", "Employee List Earnings Hours Deduction Status Profile Audit.", "Employee Reports page Hours Report Earnings Report Deductions Report Employee Details Employee History."],
    ["Tax and Compliance", "Government Liabilities CRA Source Deductions T4 Summary T4 Detailed RL 1 Summary ROE Tracking Compliance Calendar.", "Government Liabilities page Remittance Schedule tab T4 Summary page or listing only for items not implemented."],
    ["Benefits and Deductions", "Deduction Summary Benefits Summary Employer Cost Recurring Deductions.", "Deductions Summary report and listing rows."],
    ["Custom Reports", "Custom report builder entries.", "Listed but not fully backed by custom report generation in current module."],
    ["Scheduled Reports", "Manage schedules delivery history create schedule.", "Listed but scheduled report CRUD is not fully implemented in current module."],
], [1900, 4700, 3800])

h1("11 Employer Report Detail Pages")
tbl(["Page", "Fields and Filters", "Output"], [
    ["Payroll Reports", "Department employee pay group active tab pagination expanded payroll detail.", "Summary metrics payroll detail table earnings deductions net pay YTD data export buttons."],
    ["Hours Report", "Pay period department pay group employment type.", "Regular overtime double time PTO stat holiday style hours from payroll records."],
    ["Earnings Report", "Pay period department pay group employment type.", "Earning type rate hours amount rows by employee."],
    ["Employee Reports", "Status department employment type pay group tab selection.", "Employee list turnover metrics and routing to employee details or related reports."],
    ["Employee Details", "Employee and pay period selectors tabs for Overview Earnings and Hours Deductions Taxes Employer Contributions Pay History YTD Summary Time Off Documents.", "Single employee detail report with paystub download links."],
    ["Deductions Report", "Pay period department pay group employment type.", "CPP EI federal tax provincial tax other deductions total deductions."],
    ["Government Liabilities", "Pay period department employee pay group remittance period status.", "Employee CPP EI income tax employer CPP EI liabilities remittance status."],
    ["T4 Summary", "Tax year selector.", "Employee grouped T4 year to date totals from pay statements."],
    ["Employee History", "Employee department employment type pay group status.", "Employment change records and profile audit rows."],
], [1900, 4700, 3800])

h1("12 Employer Documents")
para("Documents aggregates generated and saved records. Tax documents ROE documents government filing documents paystub documents and saved company documents are merged into a single list. Tabs categorize documents as All Payroll Employee Government Company and Templates.")
tbl(["Document Type", "Source", "Download Behavior"], [
    ["Paystub", "PayStatement records", "Download URL points to /api/employer/paystubs/:id/download."],
    ["T4 and tax forms", "Tax document collections", "Displayed under government or employee categories depending on source metadata."],
    ["ROE", "RoeDocument records", "Government or employee document grouping."],
    ["Government filing", "GovernmentFiling records", "View download endpoints for filing document data."],
    ["Saved documents", "Company saved document records", "Displayed with saved metadata and category."],
], [2100, 4100, 4200])

h1("13 Employer Company Module")
para("The Company module is a master detail administration area for employer owned company data. It contains tabs for Company Profile Locations Departments Job Positions Pay Schedules Pay Rates Holidays Accruals Bank Accounts and Settings.")
tbl(["Tab", "Important Fields", "Behavior"], [
    ["Company Profile", "Legal name industry logo operating name company size business number payroll account number primary contact incorporation date phone website.", "Profile data feeds settings paystubs reports and government forms."],
    ["Locations", "Name address city province postal code status.", "Used for employee location and company structure."],
    ["Departments", "Department name code manager status.", "Used by employee profile reports and filters."],
    ["Job Positions", "Position title department pay band status.", "Used for employee position and reporting."],
    ["Pay Schedules", "Name frequency period start pay day status.", "Supports payroll schedule configuration."],
    ["Pay Rates", "Rate name earning type rate effective date.", "Supports payroll preparation and rate defaults."],
    ["Holidays", "Holiday name date province status.", "Used for statutory holiday handling."],
    ["Accruals", "Accrual name type method rate or amount eligibility show on paystub.", "Feeds vacation accrual display and paystub settings."],
    ["Bank Accounts", "Account name type bank transit number institution number account number payroll default tax default notes.", "Supports payroll payment and government remittance settings."],
    ["Settings", "General company settings payroll year settings display and localization logo upload placeholder.", "Central company preference form."],
], [1800, 5300, 3300])

h1("14 Employer Settings")
para("Settings is the employer wide configuration area. Users edit values inline and save with Save Settings. Reset to Defaults restores the server returned settings object. General and Payroll sections do not show row edit buttons in tables.")
tbl(["Settings Tab", "Cards and Fields"], [
    ["General", "Company Information legal name operating name BN CRA account address city province postal code phone email website. Logo and Branding logo preview upload remove placeholders. Payroll Settings pay frequency first pay period start date. System Preferences date format time format currency items per page dark mode language. Year End Settings tax year end generate T4 automatically generate ROE automatically."],
    ["Payroll", "Pay Schedule and Periods pay day yearly reset pay period numbering current pay period pay date offset. Payroll Calculation Settings work hours per week daily hours overtime daily overtime weekly double time after statutory holiday pay rounding. Earning Rules table. Pay Options default payment method direct deposit provider multiple bank accounts require bank account generate paystubs email paystub off cycle manual payroll approval before processing."],
    ["Taxes", "Tax Configuration pay province CRA RP account fiscal year payroll type use latest CRA tables. CRA Tax Tables tax year province last updated update button. Additional Tax Options BPA provincial credits Canada employment amount TD1 additional withholding Quebec tax. Federal Tax Settings BPA Canada employment amount age pension income disability caregiver. CPP EI QPIP table. Province and Territory Tax Rates table."],
    ["Deductions and Benefits", "Deduction Types table Benefit Types table Additional Options toggles for statutory deductions prorating CRA limits negative net pay employer benefits on paystubs YTD statutory limits."],
    ["Paystubs", "Paystub Template and Layout template selector Standard or Compact. Paystub PDF Preview embeds the actual generated PDF when sample paystub exists otherwise uses a fallback mock. Messages and Notes default message and disclaimer legal text."],
    ["Payment", "Payment Methods Direct Deposit Settings Payment Schedule Bank Account Information Payment Notifications."],
    ["Government Filings", "CRA Remittance Settings Year End Filings T4 T4A Other Government Filings table Advanced Options."],
    ["Users and Roles", "Add Role form with role name full form description status permissions. Roles table with full form. Users table. Module Permissions table."],
    ["Integrations", "Featured integrations and API Webhook fields."],
    ["Notifications", "Notification preferences email settings notification recipients reminder settings."],
], [2200, 8200])

parts.append(page_break())
h1("15 Super Admin Module Overview")
para("The Super Admin module is the Payhours internal administration console. It controls employer setup platform access payroll account operations remittance oversight tax and compliance tools notifications deduction type definitions and audit activity.")
tbl(["Navigation Item", "Purpose"], [
    ["Dashboard", "Platform overview with employer metrics and employer list."],
    ["Employers", "View create edit delete and resend activation for employers."],
    ["Employees", "Navigation placeholder for cross employer employee operations."],
    ["Payroll Runs", "Read all payroll runs across employers and inspect run details."],
    ["Payroll Accounts", "Parent for All Payroll Accounts Add Payroll Account CRA Remittances Banking and Funding Remittance Schedule."],
    ["Reports", "Platform reporting entry point currently represented through dashboard and payroll run account data."],
    ["Compliance and Tax", "Parent area for Deduction Types Year End T4 and ROE tools."],
    ["Deduction Types", "Create and manage global deduction type definitions available to employers."],
    ["Year End T4", "Generate T4 PDFs for selected employer and tax year."],
    ["ROE", "Generate Record of Employment PDF for selected employer and employee."],
    ["Notifications", "Publish and delete platform notifications."],
    ["Users and Access", "All users role management permission settings create role and activity logs."],
    ["Settings", "Placeholder for broader platform settings."],
], [2400, 8000])

h1("16 Super Admin Employer Management")
para("Employer management is the starting point for onboarding new employer companies. The create and edit employer flows use a multi step form. Tax Config and Paystub Template are configured inside the add edit employer flow not as standalone super admin sections.")
tbl(["Step or Field Group", "Fields"], [
    ["Basic employer identity", "Legal name operating name customer ID status business number plan industry company size address and contact data."],
    ["Primary contact and admin", "Primary contact name email phone employer admin email password or activation information."],
    ["Payroll account and CRA data", "Payroll program account number PD7A RC1 CRA remitter type frequency default tax province fiscal year end pay frequency."],
    ["Tax Config", "Tax year or config selection such as 2025 or 2026 for employer specific payroll tax configuration."],
    ["Paystub Template", "Standard or Compact template selection that writes employer paystub settings."],
    ["Modules and access", "Enabled module selections and role defaults."],
    ["Create behavior", "Creates Company and EmployerUser records saves settings sends or prepares activation and writes audit event EMPLOYER_CREATED."],
    ["Edit behavior", "Loads employer detail merges updated profile CRA payroll settings and audit event EMPLOYER_UPDATED."],
    ["Delete behavior", "Deletes employer company record through super admin route and writes audit event EMPLOYER_DELETED."],
], [2600, 7800])

h1("17 Super Admin Users and Access")
para("Users and Access consolidates super admins employer users role management permissions and activity logs. The access API combines SuperAdmin EmployerUser Company persisted role and audit log data into one access payload.")
tbl(["Mode", "Purpose", "Important Controls"], [
    ["All Users", "Lists platform and employer users.", "Search filters active user detail edit delete status employer role last login."],
    ["Role Management", "Shows roles and role metadata.", "Role list role status module permissions role actions."],
    ["Permission Settings", "Shows module permission matrix.", "Permission modules from superAdminAccess data."],
    ["Create Role", "Creates a persisted role.", "Role name description permissions by module submit to /super-admin/roles."],
    ["Activity Logs", "Shows audit events.", "Event type actor role employer action module timestamp IP user agent."],
], [1800, 3700, 4900])

h1("18 Super Admin Payroll Accounts")
para("Payroll Accounts is a suite for CRA payroll account and banking oversight. The same component handles All Payroll Accounts Add Payroll Account CRA Remittances Banking and Funding and Remittance Schedule modes.")
tbl(["Mode", "What It Shows", "Actions"], [
    ["All Payroll Accounts", "Employer RP accounts remitter type CRA liability status notes current setup.", "Search filter view edit add note audit."],
    ["Add Payroll Account", "Employer selector payroll account number remitter type remittance frequency default province banking data.", "Creates or updates payroll account data on company record."],
    ["CRA Remittances", "Employer liabilities due dates paid unpaid overdue status.", "Record payment view remittance schedule inspect account."],
    ["Banking and Funding", "Bank account details bank status account usage funding information.", "Update banking funding settings."],
    ["Remittance Schedule", "Remitter type calendar due soon and overdue indicators.", "Change remitter type view CRA remittance context."],
], [2000, 4600, 3800])

h1("19 Super Admin Compliance and Tax Tools")
tbl(["Tool", "Fields and Behavior"], [
    ["Deduction Types", "Lists global deduction types by name code category calculation method value taxability status employer scope. Create and edit saves via /super-admin/deduction-types."],
    ["Year End T4", "Loads employer and year options. User selects employer and tax year then generates T4 PDFs for employees with eligible payslips. Backend records T4_GENERATED audit event."],
    ["ROE", "User selects employer and employee enters last day paid final pay period end reason code issuer data and generates ROE PDF. Backend records ROE_GENERATED audit event."],
    ["Tax Config versions", "Backend route accepts tax configuration versions for super admin tax management. Employer create edit stores employer selected tax config in company settings."],
], [2400, 8000])

h1("20 Super Admin Notifications")
para("Notifications allow Payhours staff to publish platform messages to employers or targeted audiences. Notifications include posted date posted by content fields and audience metadata. Delete removes a notification and writes a platform notification deleted audit event.")
tbl(["Action", "Endpoint", "Permission"], [
    ["List notifications", "GET /super-admin/notifications", "users.manage"],
    ["Publish notification", "POST /super-admin/notifications", "users.manage"],
    ["Delete notification", "DELETE /super-admin/notifications/:id", "users.manage"],
], [2500, 5200, 2700])

h1("21 Backend Endpoint Map")
para("The following endpoint map is useful for QA and developer handoff. It lists the most important active employer and super admin routes.")
tbl(["Module", "Endpoints"], [
    ["Employer settings and company", "GET PUT /employer/settings. GET PUT /employer/company-module. PUT DELETE /employer/company-module/:section/:id. GET PUT /employer/company/state-pay."],
    ["Employer auth and dashboard", "POST /employer/auth/login plus dashboard and notification routes around employer dashboard data."],
    ["Employer reports", "GET /employer/reports /reports/payroll-summary /reports/t4-summary /reports/government-liabilities /reports/hours /reports/earnings /reports/employees /reports/employee-details /reports/deductions-summary /reports/employee-history."],
    ["Employer payroll and paystubs", "Payroll run create update delete approve finalize revise lock reverse routes. GET /employer/paystubs. GET /employer/paystubs/:id/download. GET /download-all. POST /download-selected. POST /send-selected."],
    ["Employer filings and deductions", "GET /employer/government-filings. POST /:id/prepare. POST /:id/file. GET /:id/view. GET /:id/download. GET /employer/deductions."],
    ["Super admin auth and dashboard", "POST /super-admin/auth/login. GET /super-admin/dashboard. GET /super-admin/payroll-runs."],
    ["Super admin employers", "POST /super-admin/employers. GET PUT DELETE /super-admin/employers/:id. POST /super-admin/employers/:id/resend-activation."],
    ["Super admin access", "GET /super-admin/access. PUT DELETE /access/users/:userKey. POST PUT DELETE /roles."],
    ["Super admin payroll accounts", "GET POST /payroll-accounts. POST /payroll-accounts/:id/remittance-payment. POST /:id/remitter-type. POST /:id/note. GET /:id/audit."],
    ["Super admin compliance", "GET POST /deduction-types. GET /t4/options. POST /t4/generate. POST /roe/generate. POST /tax-config/versions."],
    ["Super admin notifications", "GET POST /notifications. DELETE /notifications/:id."],
], [2500, 7900])

h1("22 Data Flow Summary")
tbl(["Flow", "Start", "Data Written", "Downstream Use"], [
    ["Employer onboarding", "Super admin creates employer.", "Company EmployerUser company settings including tax config and paystub template.", "Employer login settings reports payroll account paystub template."],
    ["Employee setup", "Employer adds employee.", "User and Employee profile including adminProfile sections.", "Payroll runs reports paystubs T4 ROE."],
    ["Payroll finalization", "Employer finalizes payroll run.", "PayrollRun status PayStatement records statement revision data.", "Paystub PDFs YTD reporting T4 summary government liabilities."],
    ["Paystub PDF", "Employer or employee opens paystub.", "No new business data for view generated from PayStatement and company employee data.", "Downloads selected downloads settings preview."],
    ["Government filing", "Employer prepares files filing or super admin generates T4 ROE.", "GovernmentFiling T4 ROE document records audit events.", "Documents filings tabs reports."],
    ["Remittance oversight", "Super admin payroll account action.", "Company craPayroll banking payment history notes remitter history.", "CRA Remittances Remittance Schedule employer tax setup."],
    ["Access management", "Super admin updates users or roles.", "SuperAdmin EmployerUser persisted roles audit logs.", "Permissions login access activity logs."],
], [2100, 2300, 3300, 2700])

h1("23 Current Implementation Notes and Gaps")
bullets([
    "Time and Attendance has been removed from employer visible areas and setup defaults based on recent changes.",
    "Tax Config and Paystub Template are configured inside Super Admin employer add edit not as separate active navigation sections.",
    "Standalone SuperAdminPaystubTemplate and SuperAdminTaxConfig components still exist in the client file but are not active navigation destinations.",
    "Some report rows are listing entries only. Active implemented report pages include payroll summary detail hours earnings employees employee details deductions government liabilities T4 summary and employee history.",
    "The Paystub settings preview embeds the actual generated PDF if a sample paystub exists. If no sample paystub exists it uses a fallback mock preview.",
    "Custom Reports and Scheduled Reports are listed in the reports index but do not yet have complete create manage workflows.",
    "Logo upload and remove controls in settings are visible as UI controls but file upload persistence should be confirmed before production release.",
])

h1("24 QA Checklist")
tbl(["Area", "Checks"], [
    ["Employer login", "Valid login succeeds inactive login fails top bar shows correct company logout clears session."],
    ["Employer settings", "Each tab loads fields save reset restores server settings Paystubs preview loads PDF blob when sample paystub exists."],
    ["Payroll", "Draft approve finalize revise lock reverse paths enforce permissions and preserve history."],
    ["Paystubs", "Single all and selected downloads produce matching PDF format send selected records notification status."],
    ["Reports", "Each implemented report opens from report cards filters work export buttons render printable output."],
    ["Government filings", "Prepare file view download actions work and status labels are consistent."],
    ["Company module", "Master detail rows create update delete within allowed sections and do not affect unrelated sections."],
    ["Super admin employers", "Create edit includes Tax Config and Paystub Template resend activation works delete records audit."],
    ["Super admin access", "User edits deletes role create update delete and activity logs work with permissions."],
    ["Super admin payroll accounts", "Account setup banking updates remittance payment remitter type change notes and audit all persist."],
    ["T4 and ROE", "Generation validates employer year employee inputs and returns PDF with audit event."],
    ["Security", "All protected routes reject missing or invalid tokens role permissions block unauthorized actions."],
], [2200, 8200])

h1("25 Suggested Operating Sequence")
para("A complete Payhours setup normally follows this order. Super Admin creates employer chooses tax config and paystub template configures payroll account and remitter settings. Employer logs in completes company and settings data adds employees prepares payroll finalizes payroll reviews paystubs handles government filings and uses reports and documents for reconciliation and compliance.")

parts.append(page_break())
h1("Appendix A Section and Tab Quick Reference")
tbl(["Module", "Tabs or Modes"], [
    ["Employer Settings", "General Payroll Taxes Deductions and Benefits Paystubs Payment Government Filings Users and Roles Integrations Notifications."],
    ["Employer Company", "Company Profile Locations Departments Job Positions Pay Schedules Pay Rates Holidays Accruals Bank Accounts Settings."],
    ["Employer Documents", "All Documents Payroll Documents Employee Documents Government Documents Company Documents Templates."],
    ["Employer Reports", "All Reports Payroll Reports Employee Reports Tax and Compliance Benefits and Deductions Custom Reports Scheduled Reports."],
    ["Employer Employee Details Report", "Overview Earnings and Hours Deductions Taxes Employer Contributions Pay History YTD Summary Time Off Documents."],
    ["Super Admin Users and Access", "All Users Role Management Permission Settings Create Role Activity Logs."],
    ["Super Admin Payroll Accounts", "All Payroll Accounts Add Payroll Account CRA Remittances Banking and Funding Remittance Schedule."],
    ["Super Admin Compliance and Tax", "Deduction Types Year End T4 ROE backend tax config versions."],
], [3000, 7400])


document_xml = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    {''.join(parts)}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="360" w:footer="360" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>'''

styles_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:after="120" w:line="240" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="19"/><w:color w:val="000000"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
    <w:pPr><w:spacing w:before="120" w:after="160"/></w:pPr>
    <w:rPr><w:b/><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:sz w:val="44"/><w:color w:val="000000"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:keepNext/><w:spacing w:before="260" w:after="100"/><w:outlineLvl w:val="0"/></w:pPr>
    <w:rPr><w:b/><w:rFonts w:ascii="Aptos Display" w:hAnsi="Aptos Display"/><w:sz w:val="30"/><w:color w:val="000000"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>
    <w:pPr><w:keepNext/><w:spacing w:before="180" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="000000"/></w:rPr>
  </w:style>
</w:styles>'''

numbering_xml = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>'''

content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>'''

rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''

doc_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>'''

core = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Payhours Employer and Super Admin Module Manual</dc:title>
  <dc:creator>Payhours Documentation</dc:creator>
  <dc:subject>Functional documentation</dc:subject>
</cp:coreProperties>'''

app = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Payhours Documentation Builder</Application>
</Properties>'''

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(OUTPUT, "w", ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/_rels/document.xml.rels", doc_rels)
    z.writestr("word/document.xml", document_xml)
    z.writestr("word/styles.xml", styles_xml)
    z.writestr("word/numbering.xml", numbering_xml)
    z.writestr("docProps/core.xml", core)
    z.writestr("docProps/app.xml", app)

print(OUTPUT)

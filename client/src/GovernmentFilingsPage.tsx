import { useEffect, useMemo, useState } from 'react';

type FilingType = 'CRA_REMITTANCE' | 'PD7A' | 'T4_SLIPS' | 'T4_SUMMARY' | 'ROE';
type FilingStatus = 'pending' | 'prepared' | 'filed' | 'overdue';
type Filing = {
  id: string;
  type: FilingType;
  title: string;
  year: number;
  period: string;
  dueDate: string;
  status: FilingStatus;
  amount: string;
  reference: string;
  confirmationNumber: string;
  preparedAt?: string;
  filedAt?: string;
  submittedBy?: string;
  documents: Array<{ name: string; kind: string }>;
};

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const appTimeZone = () =>
  localStorage.getItem('payhours-timezone') ||
  Intl.DateTimeFormat().resolvedOptions().timeZone ||
  'UTC';
const date = (value?: string) =>
  value
    ? (() => {
        const civilDate = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/);
        const parsed = civilDate
          ? new Date(Date.UTC(Number(civilDate[1]), Number(civilDate[2]) - 1, Number(civilDate[3])))
          : new Date(value);
        return parsed.toLocaleDateString('en-CA', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
          timeZone: civilDate ? 'UTC' : appTimeZone()
        });
      })()
    : '-';
const money = (value: string) => `$${Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const statusLabel = (status: FilingStatus) => status.charAt(0).toUpperCase() + status.slice(1);
const tabTypes: Record<string, FilingType[]> = {
  'All Filings': ['CRA_REMITTANCE', 'PD7A', 'T4_SLIPS', 'T4_SUMMARY', 'ROE'],
  'Remittance Schedule': ['CRA_REMITTANCE'],
  'T4 Slips & Summary': ['T4_SLIPS', 'T4_SUMMARY'],
  'PD7A Filing': ['PD7A'],
  'ROE Filings': ['ROE']
};

export default function GovernmentFilingsPage({ token }: { token: string }) {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState('All Filings');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [periodFilter, setPeriodFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');

  const load = async () => {
    try {
      const response = await fetch(`${apiBase}/employer/government-filings`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json() as { filings?: Filing[]; message?: string };
      if (!response.ok) throw new Error(result.message || 'Could not load government filings');
      const next = result.filings || [];
      setFilings(next);
      setSelectedId((current) => next.some((item) => item.id === current) ? current : next[0]?.id || '');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load government filings');
    }
  };

  useEffect(() => { void load(); }, [token]);

  const years = useMemo(() => Array.from(new Set(filings.map((item) => item.year))).sort((a, b) => b - a), [filings]);
  const periods = useMemo(() => Array.from(new Set(filings.map((item) => item.period))), [filings]);
  const filtered = filings.filter((item) =>
    tabTypes[tab].includes(item.type) &&
    (!typeFilter || item.type === typeFilter) &&
    (!statusFilter || item.status === statusFilter) &&
    (!yearFilter || item.year === Number(yearFilter)) &&
    (!periodFilter || item.period === periodFilter) &&
    `${item.title} ${item.period} ${item.reference}`.toLowerCase().includes(search.toLowerCase())
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const actualPage = Math.min(page, pages);
  const visible = filtered.slice((actualPage - 1) * pageSize, actualPage * pageSize);
  const selected = selectedId === '__closed__' ? undefined : filtered.find((item) => item.id === selectedId) || visible[0];
  const now = Date.now();
  const lastYear = now - 365 * 24 * 60 * 60 * 1000;
  const recent = filings.filter((item) => new Date(item.dueDate).getTime() >= lastYear);
  const filed = recent.filter((item) => item.status === 'filed');
  const upcoming = filings.filter((item) => ['pending', 'prepared'].includes(item.status) && new Date(item.dueDate).getTime() >= now);
  const overdue = filings.filter((item) => item.status === 'overdue');

  const runAction = async (filing: Filing, action: 'prepare' | 'file') => {
    setBusy(filing.id);
    setError('');
    try {
      const response = await fetch(`${apiBase}/employer/government-filings/${filing.id}/${action}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json() as { filing?: Filing; message?: string };
      if (!response.ok || !result.filing) throw new Error(result.message || `Could not ${action} filing`);
      setFilings((items) => items.map((item) => item.id === filing.id ? result.filing! : item));
      setNotice(action === 'prepare' ? 'Filing prepared successfully.' : 'Filing marked as filed successfully.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${action} filing`);
    } finally {
      setBusy('');
    }
  };

  const download = async (filing: Filing) => {
    setBusy(filing.id);
    try {
      const response = await fetch(`${apiBase}/employer/government-filings/${filing.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Could not download filing document');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = filing.documents[0]?.name || `filing-${filing.id}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not download filing document');
    } finally {
      setBusy('');
    }
  };

  const viewDocument = async (filing: Filing) => {
    setSelectedId(filing.id);
    if (filing.type !== 'T4_SLIPS' && filing.type !== 'ROE') {
      setNotice('Filing details are open. Use Download Documents for the filing record.');
      setError('');
      return;
    }
    const previewWindow = window.open('about:blank', '_blank');
    if (!previewWindow) {
      setError('Allow pop-ups to view the filing document.');
      return;
    }
    previewWindow.opener = null;
    setBusy(filing.id);
    setError('');
    try {
      const response = await fetch(`${apiBase}/employer/government-filings/${filing.id}/view`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => undefined) as { message?: string } | undefined;
        throw new Error(detail?.message || 'Could not open filing document');
      }
      const url = URL.createObjectURL(await response.blob());
      previewWindow.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (cause) {
      previewWindow.close();
      setError(cause instanceof Error ? cause.message : 'Could not open filing document');
    } finally {
      setBusy('');
    }
  };

  const clearFilters = () => { setTypeFilter(''); setStatusFilter(''); setYearFilter(''); setPeriodFilter(''); setSearch(''); setPage(1); };

  return <section className="module-page filings-page">
    <header className="filings-title"><h1>Government Filings</h1><p>Track and manage your government remittances, filings and reports.</p></header>
    {error && <p className="filings-message error" role="alert">{error}</p>}
    {notice && <p className="filings-message success" role="status">{notice}</p>}
    <div className="filings-metrics">
      <article><span>DOC</span><div><small>Total Filings</small><strong>{recent.length}</strong><small>Last 12 months</small></div></article>
      <article><span>OK</span><div><small>Filed On Time</small><strong>{filed.filter((item) => new Date(item.filedAt || 0) <= new Date(item.dueDate)).length}</strong><small>{filed.length ? Math.round(filed.filter((item) => new Date(item.filedAt || 0) <= new Date(item.dueDate)).length / filed.length * 100) : 100}% compliance</small></div></article>
      <article><span>DUE</span><div><small>Upcoming Filings</small><strong>{upcoming.length}</strong><small>{upcoming[0] ? `Next due: ${date(upcoming.sort((a, b) => +new Date(a.dueDate) - +new Date(b.dueDate))[0].dueDate)}` : 'Nothing due'}</small></div></article>
      <article><span>!</span><div><small>Overdue</small><strong>{overdue.length}</strong><small>{overdue.length ? 'Action required' : 'All up to date'}</small></div></article>
    </div>
    <nav className="filings-tabs" aria-label="Government filing views">{Object.keys(tabTypes).map((name) => <button key={name} className={tab === name ? 'active' : ''} onClick={() => { setTab(name); setPage(1); }}>{name}</button>)}</nav>
    <div className="filings-filters">
      <label>Filing Type<select value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(1); }}><option value="">All Types</option><option value="CRA_REMITTANCE">CRA Remittance</option><option value="PD7A">PD7A</option><option value="T4_SLIPS">T4 Slips</option><option value="T4_SUMMARY">T4 Summary</option><option value="ROE">ROE</option></select></label>
      <label>Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">All Statuses</option><option value="pending">Pending</option><option value="prepared">Prepared</option><option value="filed">Filed</option><option value="overdue">Overdue</option></select></label>
      <label>Year<select value={yearFilter} onChange={(event) => { setYearFilter(event.target.value); setPage(1); }}><option value="">All Years</option>{years.map((year) => <option key={year}>{year}</option>)}</select></label>
      <label>Period<select value={periodFilter} onChange={(event) => { setPeriodFilter(event.target.value); setPage(1); }}><option value="">All Periods</option>{periods.map((period) => <option key={period}>{period}</option>)}</select></label>
      <label className="filings-search">Search<input aria-label="Search filings" placeholder="Search by filing type, period or reference..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>
      <button type="button" onClick={clearFilters}>Clear Filters</button>
    </div>
    <div className="filings-layout">
      <div className="filings-table-wrap"><table><thead><tr><th>#</th><th>Filing Type</th><th>Period</th><th>Due Date</th><th>Filed Date</th><th>Status</th><th>Reference #</th><th>Actions</th></tr></thead><tbody>{visible.map((filing, index) => <tr key={filing.id} className={selected?.id === filing.id ? 'selected' : ''}><td>{(actualPage - 1) * pageSize + index + 1}</td><td><b>{filing.title}</b></td><td>{filing.period}</td><td>{date(filing.dueDate)}</td><td>{date(filing.filedAt)}</td><td><span className={`filing-status ${filing.status}`}>{statusLabel(filing.status)}</span></td><td>{filing.reference || '-'}</td><td><button type="button" disabled={busy === filing.id} onClick={() => void viewDocument(filing)}>View</button>{filing.status !== 'filed' && <button type="button" disabled={busy === filing.id} onClick={() => void runAction(filing, filing.status === 'prepared' ? 'file' : 'prepare')}>{filing.status === 'prepared' ? 'File' : 'Prepare'}</button>}</td></tr>)}{!visible.length && <tr><td colSpan={8}>No government filings match these filters.</td></tr>}</tbody></table></div>
      {selected && <aside className="filing-detail"><header><div><span>DOC</span><div><h2>{selected.title}</h2><p>{selected.period} · {statusLabel(selected.status)}</p></div></div><button type="button" aria-label="Close filing details" onClick={() => setSelectedId('__closed__')}>×</button></header><div className="filing-detail-tabs"><b>Details</b><span>Documents ({selected.documents.length})</span></div>{selected.status === 'filed' && <p className="filing-success"><b>Filed Successfully</b><span>This filing was submitted {new Date(selected.filedAt || 0) <= new Date(selected.dueDate) ? 'on time.' : 'after its due date.'}</span></p>}<dl><dt>Filing Type</dt><dd>{selected.title}</dd><dt>Period</dt><dd>{selected.period}</dd><dt>Due Date</dt><dd>{date(selected.dueDate)}</dd><dt>Filed Date</dt><dd>{date(selected.filedAt)}</dd><dt>Reference #</dt><dd>{selected.reference || '-'}</dd><dt>Status</dt><dd><span className={`filing-status ${selected.status}`}>{statusLabel(selected.status)}</span></dd><dt>Amount Remitted</dt><dd>{money(selected.amount)}</dd><dt>Confirmation #</dt><dd>{selected.confirmationNumber || '-'}</dd></dl><footer><button type="button" disabled={busy === selected.id} onClick={() => void download(selected)}>Download Documents</button>{selected.status !== 'filed' && <button type="button" disabled={busy === selected.id} onClick={() => void runAction(selected, selected.status === 'prepared' ? 'file' : 'prepare')}>{selected.status === 'prepared' ? 'Mark as Filed' : 'Prepare Filing'}</button>}</footer></aside>}
    </div>
    <footer className="filings-pagination"><span>Showing {filtered.length ? (actualPage - 1) * pageSize + 1 : 0} - {Math.min(actualPage * pageSize, filtered.length)} of {filtered.length} filings</span><div><button disabled={actualPage <= 1} onClick={() => setPage(actualPage - 1)}>‹</button><span>{actualPage} / {pages}</span><button disabled={actualPage >= pages} onClick={() => setPage(actualPage + 1)}>›</button><select aria-label="Filings per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10 / page</option><option value={25}>25 / page</option><option value={50}>50 / page</option></select></div></footer>
  </section>;
}

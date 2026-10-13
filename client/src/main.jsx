import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertCircle, ArrowUpRight, BarChart3, Building2, CheckCircle2, ClipboardList, Download, FilePlus2, LayoutDashboard, LoaderCircle, LogOut, Menu, MessageSquare, Search, Settings, ShieldCheck, Users, Wrench, X } from 'lucide-react';
import './styles.css';

const API = 'http://localhost:4000/api';
const statuses = ['All', 'Pending', 'In Progress', 'Resolved'];
const categories = ['All', 'Plumbing', 'Electrical', 'Furniture', 'HVAC', 'Cleaning', 'Other'];

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { credentials: 'include', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function LoginPage({ onLogin, initialError }) {
  const [role, setRole] = useState('Student');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError || '');
  const [saving, setSaving] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await onLogin({ role, username, password }); }
    catch (loginError) { setError(loginError.message || 'Unable to sign in.'); }
    finally { setSaving(false); }
  };
  return <main className="auth-screen"><form className="panel login-card" onSubmit={submit}><div className="brand-mark login-mark"><Wrench size={22} /></div><p className="eyebrow accent">CampusFix</p><h1>Sign in</h1><p className="muted">Use your college project account to continue.</p><label>Role<select value={role} onChange={(event) => setRole(event.target.value)}><option>Student</option><option>Admin</option></select></label><label>Username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label><label>Password<input autoComplete="current-password" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <p className="login-error" role="alert">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? 'Signing in…' : 'Sign in'}</button></form></main>;
}

function App() {
  const [page, setPage] = useState('Dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const [dashboard, setDashboard] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: 'All', category: 'All' });
  const [loading, setLoading] = useState(true);

  const load = async (clearFilters = false) => {
    if (!user) return;
    setLoading(true);
    try {
      const activeFilters = clearFilters ? { search: '', status: 'All', category: 'All' } : filters;
      if (clearFilters) setFilters(activeFilters);
      const query = new URLSearchParams(Object.fromEntries(Object.entries(activeFilters).filter(([, value]) => value && value !== 'All')));
      const [summary, items, team] = await Promise.all([api('/dashboard'), api(`/complaints?${query}`), user.role === 'Admin' ? api('/workers') : Promise.resolve([])]);
      setDashboard(summary); setComplaints(items); setWorkers(team);
    } catch (error) { setToast({ type: 'error', message: error.message }); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    api('/auth/session').then((result) => { if (active) setUser(result.user); }).catch((error) => { if (active) setAuthError(error.message); }).finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { if (user) load(); }, [user, filters.search, filters.status, filters.category]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(null), 3500); return () => clearTimeout(timer); } }, [toast]);

  const navigate = (next) => { if (user?.role === 'Student' && !['Dashboard', 'Submit Request', 'My Requests'].includes(next)) return; setPage(next); setMobileOpen(false); };
  const login = async (credentials) => {
    const result = await api('/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials) });
    setFilters({ search: '', status: 'All', category: 'All' }); setUser(result.user); setPage('Dashboard');
  };
  const logout = async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch (error) { setToast({ type: 'error', message: error.message }); }
    setUser(null); setPage('Dashboard'); setComplaints([]); setDashboard(null); setWorkers([]);
  };
  const updateComplaint = async (id, changes) => {
    try { await api(`/complaints/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) }); setToast({ type: 'success', message: 'Complaint updated successfully.' }); await load(); }
    catch (error) { setToast({ type: 'error', message: error.message }); }
  };

  if (authLoading) return <div className="auth-screen"><Loading /></div>;
  if (!user) return <LoginPage onLogin={login} initialError={authError} />;

  return <div className="app-shell">
    <Sidebar page={page} role={user.role} navigate={navigate} open={mobileOpen} close={() => setMobileOpen(false)} />
    <main className="main-content">
      <header className="topbar"><button className="icon-button menu-button" onClick={() => setMobileOpen(true)}><Menu size={21} /></button><div><p className="eyebrow">{user.role === 'Admin' ? 'Operations center' : 'Student portal'}</p><h1>{page}</h1></div><div className="topbar-actions"><div className="user-chip"><span className="avatar">{user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.role}</small></span></div><button className="logout-button" onClick={logout}><LogOut size={16} /><span>Sign out</span></button></div></header>
      {toast && <div className={`toast ${toast.type}`}><span>{toast.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}</span>{toast.message}<button onClick={() => setToast(null)}><X size={15} /></button></div>}
      {page === 'Dashboard' && (user.role === 'Admin' ? <Dashboard dashboard={dashboard} complaints={complaints} loading={loading} navigate={navigate} /> : <StudentDashboard dashboard={dashboard} complaints={complaints} loading={loading} user={user} navigate={navigate} />)}
      {page === 'All Requests' && <Requests complaints={complaints} filters={filters} setFilters={setFilters} loading={loading} workers={workers} updateComplaint={updateComplaint} />}
      {page === 'Submit Request' && <Submit navigate={navigate} setToast={setToast} refresh={() => load(true)} user={user} />}
      {page === 'My Requests' && <MyRequests complaints={user.role === 'Student' ? complaints : complaints.filter((item) => item.submittedById === user.username || item.submittedBy === 'Admin Staff' || item.submittedBy === 'Aarav Mehta')} navigate={navigate} />}
      {page === 'Team' && <Team workers={workers} complaints={complaints} />}
      {page === 'Reports' && user.role === 'Admin' && <Reports />}
    </main>
  </div>;
}

function Sidebar({ page, role, navigate, open, close }) { const items = role === 'Admin' ? [['Dashboard', LayoutDashboard], ['All Requests', ClipboardList], ['Submit Request', FilePlus2], ['My Requests', MessageSquare], ['Team', Users]] : [['Dashboard', LayoutDashboard], ['Submit Request', FilePlus2], ['My Requests', MessageSquare]]; return <><div className={`sidebar-overlay ${open ? 'visible' : ''}`} onClick={close} /><aside className={`sidebar ${open ? 'open' : ''}`}><div className="brand"><div className="brand-mark"><Wrench size={21} /></div><div><strong>Campus<span>Fix</span></strong><small>Maintenance tracker</small></div><button className="icon-button close-sidebar" onClick={close}><X size={18} /></button></div><div className="workspace"><span className="workspace-icon"><Building2 size={16} /></span><div><small>Workspace</small><strong>Northbridge Campus</strong></div><ArrowUpRight size={14} /></div><nav>{items.map(([label, Icon]) => <button key={label} className={page === label ? 'active' : ''} onClick={() => navigate(label)}><Icon size={18} /><span>{label}</span>{label === 'All Requests' && <em>12</em>}</button>)}</nav><div className="sidebar-bottom">{role === 'Admin' && <><button className={page === 'Reports' ? 'active' : ''} onClick={() => navigate('Reports')}><BarChart3 size={18} />Reports</button><button><Settings size={18} />Settings</button></>}<div className="help-card"><ShieldCheck size={19} /><div><strong>Need help?</strong><small>Contact campus support</small></div></div><div className="sidebar-footer">CampusFix v1.0 <span>•</span> <span>© 2026</span></div></div></aside></>; }

function StudentDashboard({ dashboard, complaints, loading, user, navigate }) { if (loading && !dashboard) return <Loading />; const cards = [['My requests', dashboard?.total ?? 0, 'All requests you submitted', 'neutral', ClipboardList], ['Pending', dashboard?.pending ?? 0, 'Awaiting review', 'amber', AlertCircle], ['In progress', dashboard?.inProgress ?? 0, 'Being worked on', 'blue', Wrench], ['Resolved', dashboard?.resolved ?? 0, 'Completed requests', 'green', CheckCircle2]]; return <div className="page-body"><div className="welcome-row"><div><p className="eyebrow accent">Student dashboard</p><h2>Welcome, {user.name}</h2><p className="muted">Submit a campus issue and follow its status here.</p></div><button className="primary-button" onClick={() => navigate('Submit Request')}><FilePlus2 size={17} /> New complaint</button></div><section className="stats-grid">{cards.map(([label, value, sub, tone, Icon]) => <div className="stat-card" key={label}><span className={`stat-icon ${tone}`}><Icon size={19} /></span><strong>{value}</strong><p>{label}</p><small>{sub}</small></div>)}</section><section className="panel recent-panel"><div className="panel-heading"><div><h3>My recent complaints</h3><p className="muted">Only requests submitted by your account are shown.</p></div><button className="text-button" onClick={() => navigate('My Requests')}>View all</button></div>{complaints.length ? <RequestTable complaints={complaints.slice(0, 5)} compact /> : <EmptyState />}</section></div>; }

function Dashboard({ dashboard, complaints, loading, navigate }) { if (loading && !dashboard) return <Loading />; const cards = [['Total complaints', dashboard?.total, 'All submitted requests', 'neutral', ClipboardList], ['Pending', dashboard?.pending, 'Awaiting assignment', 'amber', AlertCircle], ['In progress', dashboard?.inProgress, 'Currently being worked on', 'blue', Wrench], ['Resolved', dashboard?.resolved, 'Successfully completed', 'green', CheckCircle2]]; return <div className="page-body"><div className="welcome-row"><div><p className="eyebrow accent">Tuesday, October 11, 2026</p><h2>Good morning, Admin <span>👋</span></h2><p className="muted">Here’s what’s happening around campus today.</p></div><button className="primary-button" onClick={() => navigate('Submit Request')}><FilePlus2 size={17} /> New request</button></div><section className="stats-grid">{cards.map(([label, value, sub, tone, Icon]) => <div className="stat-card" key={label}><div className="stat-card-top"><span className={`stat-icon ${tone}`}><Icon size={19} /></span><span className={`trend ${tone}`}>+{label === 'Total complaints' ? '8.2' : label === 'Resolved' ? '12.5' : '4.1'}%</span></div><strong>{value}</strong><div><p>{label}</p><small>{sub}</small></div></div>)}</section><div className="content-grid"><section className="panel recent-panel"><div className="panel-heading"><div><h3>Recent requests</h3><p className="muted">Latest maintenance activity across campus</p></div><button className="text-button" onClick={() => navigate('All Requests')}>View all <ArrowUpRight size={15} /></button></div><RequestTable complaints={complaints.slice(0, 4)} compact /></section><section className="panel activity-panel"><div className="panel-heading"><div><h3>Activity overview</h3><p className="muted">Request volume by status</p></div></div><div className="donut-wrap"><div className="donut" style={{ '--progress': `${dashboard?.resolved / Math.max(dashboard?.total, 1) * 100}%` }}><div><strong>{Math.round((dashboard?.resolved / Math.max(dashboard?.total, 1)) * 100)}%</strong><small>resolved</small></div></div><div className="legend"><Legend color="green" label="Resolved" value={dashboard?.resolved} /><Legend color="blue" label="In progress" value={dashboard?.inProgress} /><Legend color="amber" label="Pending" value={dashboard?.pending} /></div></div><div className="insight"><span>✦</span><p><strong>Great progress!</strong><br />Your team resolved {dashboard?.resolved} of {dashboard?.total} reported issues.</p></div></section></div></div>; }
function Legend({ color, label, value }) { return <div><span className={`legend-dot ${color}`} />{label}<strong>{value}</strong></div>; }

function Reports() {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReport = async () => {
    setLoading(true);
    setError('');
    try {
      const results = await api('/reports');
      if (!Array.isArray(results)) throw new Error('The server returned an invalid requests list.');
      setComplaints(results);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load report data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadReport(); }, []);

  const statusCounts = [
    { label: 'Pending', tone: 'amber' },
    { label: 'In Progress', tone: 'blue' },
    { label: 'Resolved', tone: 'green' },
  ].map((status) => ({ ...status, value: complaints.filter((item) => item.status === status.label).length }));
  const unlistedStatuses = [...new Set(complaints.map((item) => item.status).filter((status) => status && !statusCounts.some((item) => item.label === status)))];
  unlistedStatuses.forEach((label) => statusCounts.push({ label, tone: 'neutral', value: complaints.filter((item) => item.status === label).length }));
  const categoryCounts = complaints.reduce((counts, item) => {
    const category = item.category || 'Uncategorized';
    counts[category] = (counts[category] || 0) + 1;
    return counts;
  }, {});
  const maxCategory = Math.max(...Object.values(categoryCounts), 1);

  const exportCsv = () => {
    const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = [
      ['Report', 'CampusFix request summary'],
      ['Total requests', complaints.length],
      ...statusCounts.map(({ label, value }) => [`Status: ${label}`, value]),
      ...Object.entries(categoryCounts).sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => [`Category: ${label}`, value]),
    ];
    const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `campusfix-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (loading) return <div className="page-body"><Loading /></div>;
  if (error) return <div className="page-body"><div className="panel report-error"><AlertCircle size={28} /><h3>Unable to load reports</h3><p>{error}</p><button className="secondary-button" onClick={loadReport}>Try again</button></div></div>;

  return <div className="page-body"><div className="page-title-row"><div><p className="eyebrow accent">Operations analytics</p><h2>Reports</h2><p className="muted">A live summary of maintenance requests across campus.</p></div><button className="primary-button" onClick={exportCsv} disabled={!complaints.length}><Download size={17} /> Export CSV</button></div><section className="stats-grid report-stats">{[['Total requests', complaints.length, 'neutral'], ...statusCounts.map(({ label, value, tone }) => [label, value, tone])].map(([label, value, tone]) => <div className="stat-card report-stat" key={label}><span className={`stat-icon ${tone}`}>{tone === 'green' ? <CheckCircle2 size={19} /> : tone === 'blue' ? <Wrench size={19} /> : tone === 'amber' ? <AlertCircle size={19} /> : <ClipboardList size={19} />}</span><strong>{value}</strong><p>{label}</p></div>)}</section>{complaints.length === 0 ? <div className="panel report-empty"><ClipboardList size={30} /><h3>No requests to report yet</h3><p>Submitted requests will appear here with totals and status breakdowns.</p></div> : <div className="report-grid"><section className="panel report-panel"><div className="panel-heading"><div><h3>Requests by status</h3><p className="muted">Current workflow distribution</p></div></div><div className="report-status-list">{statusCounts.map(({ label, value, tone }) => <div className="report-status-row" key={label}><div><span className={`legend-dot ${tone}`} /><strong>{label}</strong></div><span className="report-bar"><i className={tone} style={{ width: `${complaints.length ? (value / complaints.length) * 100 : 0}%` }} /></span><b>{value}</b></div>)}</div></section><section className="panel report-panel"><div className="panel-heading"><div><h3>Requests by category</h3><p className="muted">Categories represented in submitted requests</p></div></div><div className="category-list">{Object.entries(categoryCounts).sort(([, a], [, b]) => b - a).map(([category, value]) => <div className="category-row" key={category}><div><strong>{category}</strong><small>{value} request{value === 1 ? '' : 's'}</small></div><span className="category-bar"><i style={{ width: `${(value / maxCategory) * 100}%` }} /></span></div>)}</div></section></div>}</div>;
}

function Requests({ complaints, filters, setFilters, loading, workers, updateComplaint }) { return <div className="page-body"><div className="page-title-row"><div><h2>Maintenance requests</h2><p className="muted">Review, assign, and track all campus issues.</p></div><button className="primary-button"><FilePlus2 size={17} /> Export report</button></div><section className="panel requests-panel"><div className="filter-bar"><div className="search-box"><Search size={17} /><input value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search requests..." /></div><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>{statuses.map((item) => <option key={item} value={item}>{item === 'All' ? 'All statuses' : item}</option>)}</select><select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>{categories.map((item) => <option key={item} value={item}>{item === 'All' ? 'All categories' : item}</option>)}</select></div>{loading ? <Loading /> : complaints.length ? <RequestTable complaints={complaints} workers={workers} updateComplaint={updateComplaint} /> : <EmptyState />}</section></div>; }

function RequestTable({ complaints, workers, updateComplaint, compact }) { return <div className="table-wrap"><table><thead><tr><th>Request</th><th>Location</th><th>Category</th><th>Priority</th><th>Status</th>{!compact && <th>Assigned to</th>}<th><span className="sr-only">Actions</span></th></tr></thead><tbody>{complaints.map((item) => <tr key={item.id}><td><div className="request-name"><span className="request-symbol">{item.category === 'Electrical' ? '⚡' : item.category === 'Plumbing' ? '💧' : item.category === 'HVAC' ? '❄' : '🔧'}</span><div><strong>{item.title}</strong><small>{item.id} · {formatDate(item.createdAt)}</small></div></div></td><td><strong>{item.building}</strong><small>Room {item.roomNumber}</small></td><td><span className="category-text">{item.category}</span></td><td><span className={`priority ${item.priority.toLowerCase()}`}><i />{item.priority}</span></td><td>{!compact && updateComplaint ? <select className="assign-select" aria-label={`Status for ${item.id}`} value={item.status} onChange={(e) => updateComplaint(item.id, { status: e.target.value })}><option>Pending</option><option>In Progress</option><option>Resolved</option></select> : <Status status={item.status} />}</td>{!compact && <td>{workers ? <select className="assign-select" value={item.assignedTo || ''} onChange={(e) => updateComplaint(item.id, { assignedTo: e.target.value || null, status: e.target.value && item.status === 'Pending' ? 'In Progress' : item.status })}><option value="">Unassigned</option>{workers.map((worker) => <option key={worker.id} value={worker.name}>{worker.name}</option>)}</select> : item.assignedTo || '—'}</td>}{!compact && updateComplaint && <td><button className="row-action" onClick={() => updateComplaint(item.id, { status: item.status === 'Resolved' ? 'Pending' : 'Resolved' })}>{item.status === 'Resolved' ? 'Reopen' : 'Resolve'}</button></td>}</tr>)}</tbody></table></div>; }
function Status({ status }) { return <span className={`status ${status.toLowerCase().replace(' ', '-')}`}><i />{status}</span>; }
function formatDate(date) { return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(new Date(date)); }

function Submit({ navigate, setToast, refresh, user }) { const [form, setForm] = useState({ title: '', description: '', building: '', roomNumber: '', category: 'Plumbing', priority: 'Medium', submittedBy: user.name }); const [image, setImage] = useState(null); const [saving, setSaving] = useState(false); const change = (field, value) => setForm({ ...form, [field]: value }); const submit = async (event) => { event.preventDefault(); setSaving(true); try { const data = new FormData(); Object.entries(form).forEach(([key, value]) => data.append(key, value)); if (image) data.append('image', image); await api('/complaints', { method: 'POST', body: data }); await refresh(); setToast({ type: 'success', message: 'Maintenance request submitted.' }); navigate('My Requests'); } catch (error) { setToast({ type: 'error', message: error.message }); } finally { setSaving(false); } }; return <div className="page-body form-page"><div className="page-title-row"><div><p className="eyebrow accent">Submit a ticket</p><h2>Report a maintenance issue</h2><p className="muted">Give the facilities team the details they need to fix it quickly.</p></div></div><form className="panel complaint-form" onSubmit={submit}><div className="form-section"><h3>Issue details</h3><p className="muted">Describe what needs attention.</p><div className="form-grid"><label className="full">Issue title <input required value={form.title} onChange={(e) => change('title', e.target.value)} placeholder="e.g. Broken light in corridor" /></label><label className="full">Description <textarea required minLength="10" value={form.description} onChange={(e) => change('description', e.target.value)} placeholder="Tell us what happened and where..." /></label><label>Building <select required value={form.building} onChange={(e) => change('building', e.target.value)}><option value="">Select building</option><option>Science Block</option><option>Main Academic Block</option><option>Central Library</option><option>Student Residence</option></select></label><label>Room / area <input required value={form.roomNumber} onChange={(e) => change('roomNumber', e.target.value)} placeholder="e.g. 204" /></label><label>Category <select value={form.category} onChange={(e) => change('category', e.target.value)}>{categories.slice(1).map((item) => <option key={item}>{item}</option>)}</select></label><label>Priority <select value={form.priority} onChange={(e) => change('priority', e.target.value)}><option>Low</option><option>Medium</option><option>High</option></select></label><label className="full">Photo attachment <div className="upload-box"><input type="file" accept="image/*" onChange={(e) => setImage(e.target.files[0])} /><span>Click to upload <small>PNG, JPG up to 4MB</small></span>{image && <strong>{image.name}</strong>}</div></label></div></div><div className="form-actions"><button type="button" className="secondary-button" onClick={() => navigate('Dashboard')}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? <LoaderCircle className="spin" size={17} /> : <FilePlus2 size={17} />} {saving ? 'Submitting...' : 'Submit request'}</button></div></form></div>; }

function MyRequests({ complaints, navigate }) { return <div className="page-body"><div className="page-title-row"><div><p className="eyebrow accent">Student portal</p><h2>My requests</h2><p className="muted">Follow the progress of issues you have reported.</p></div><button className="primary-button" onClick={() => navigate('Submit Request')}><FilePlus2 size={17} /> Report issue</button></div><section className="panel requests-panel"><RequestTable complaints={complaints} compact /></section></div>; }
function Team({ workers, complaints }) { return <div className="page-body"><div className="page-title-row"><div><h2>Maintenance team</h2><p className="muted">Assign work to the right specialist.</p></div></div><div className="team-grid">{workers.map((worker) => <div className="panel worker-card" key={worker.id}><div className="worker-avatar">{worker.name.split(' ').map((name) => name[0]).join('')}</div><h3>{worker.name}</h3><p>{worker.specialty}</p><div className="worker-meta"><span><strong>{complaints.filter((item) => item.assignedTo === worker.name && item.status !== 'Resolved').length}</strong> active jobs</span><span className="available"><i />Available</span></div></div>)}</div></div>; }
function Loading() { return <div className="loading"><LoaderCircle className="spin" size={24} /> Loading campus data...</div>; }
function EmptyState() { return <div className="empty"><ClipboardList size={32} /><h3>No requests found</h3><p>Try adjusting your search or filters.</p></div>; }
createRoot(document.getElementById('root')).render(<App />);

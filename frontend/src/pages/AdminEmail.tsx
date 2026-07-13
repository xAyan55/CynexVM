import React, { useState, useEffect } from 'react';
import {
  Mail, Settings, FileText, BarChart3, Palette, Server, Plus, Trash2,
  Send, Save, Play, RotateCcw, Search, Download, AlertTriangle, CheckCircle,
  Clock, RefreshCw, Eye, Edit3, X, Copy, ChevronLeft, ChevronRight,
  Activity, Loader, Zap, Shield, Globe
} from 'lucide-react';

type TabType = 'smtp' | 'templates' | 'logs' | 'analytics' | 'branding';

const api = async (path: string, options?: RequestInit) => {
  const token = localStorage.getItem('accessToken');
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options?.headers
    }
  });
  return res;
};

export const AdminEmail: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('smtp');

  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'smtp', label: 'SMTP Config', icon: <Server size={14} /> },
    { key: 'templates', label: 'Templates', icon: <FileText size={14} /> },
    { key: 'logs', label: 'Email Logs', icon: <Send size={14} /> },
    { key: 'analytics', label: 'Analytics', icon: <BarChart3 size={14} /> },
    { key: 'branding', label: 'Branding', icon: <Palette size={14} /> },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-6 lg:px-8 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center pt-5 justify-between gap-4">
        <div>
          <h1 className="text-base font-medium text-neutral-800 dark:text-white">Email Delivery System</h1>
          <p className="mt-0.5 text-sm text-neutral-500">Configure SMTP servers, manage templates, monitor delivery</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition shrink-0 ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'smtp' && <SmtpConfigSection />}
      {activeTab === 'templates' && <TemplatesSection />}
      {activeTab === 'logs' && <EmailLogsSection />}
      {activeTab === 'analytics' && <AnalyticsSection />}
      {activeTab === 'branding' && <BrandingSection />}
    </div>
  );
};

// ============================================================
// SMTP Configuration Section
// ============================================================

function SmtpConfigSection() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ id: string; success: boolean; message: string } | null>(null);
  const [sendingTest, setSendingTest] = useState<string | null>(null);
  const [testSendEmail, setTestSendEmail] = useState('');

  const [form, setForm] = useState({
    name: '', host: '', port: 587, username: '', password: '',
    encryption: 'starttls', senderName: '', senderEmail: '', replyTo: '', isDefault: false
  });

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await api('/api/v1/email/smtp-configs');
      if (res.ok) setConfigs(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchConfigs(); }, []);

  const resetForm = () => {
    setForm({ name: '', host: '', port: 587, username: '', password: '', encryption: 'starttls', senderName: '', senderEmail: '', replyTo: '', isDefault: false });
    setEditing(null);
    setShowForm(false);
    setTestResult(null);
  };

  const openEdit = (c: any) => {
    setForm({ name: c.name, host: c.host, port: c.port, username: c.username, password: '', encryption: c.encryption, senderName: c.senderName, senderEmail: c.senderEmail, replyTo: c.replyTo || '', isDefault: c.isDefault });
    setEditing(c);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editing ? `/api/v1/email/smtp-configs/${editing.id}` : '/api/v1/email/smtp-configs';
      const method = editing ? 'PUT' : 'POST';
      const body: any = { ...form };
      if (editing && !form.password) delete body.password;
      const res = await api(url, { method, body: JSON.stringify(body) });
      if (res.ok) {
        resetForm();
        fetchConfigs();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save');
      }
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this SMTP configuration?')) return;
    await api(`/api/v1/email/smtp-configs/${id}`, { method: 'DELETE' });
    fetchConfigs();
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    try {
      const res = await api(`/api/v1/email/smtp-configs/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResult({ id, success: data.success, message: data.message || data.error });
    } catch {}
    setTesting(null);
  };

  const handleTestSend = async (id: string) => {
    if (!testSendEmail) { alert('Enter a recipient email'); return; }
    setSendingTest(id);
    try {
      const res = await api(`/api/v1/email/smtp-configs/${id}/test-send`, {
        method: 'POST',
        body: JSON.stringify({ to: testSendEmail })
      });
      const data = await res.json();
      if (data.success) {
        alert('Test email sent successfully!');
      } else {
        alert('Failed: ' + (data.error || 'Unknown error'));
      }
    } catch {}
    setSendingTest(null);
  };

  if (loading) return <div className="p-12 text-center text-neutral-500 text-xs">Loading SMTP configurations...</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-neutral-500">{configs.length} SMTP configuration(s)</p>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition">
          <Plus size={14} /> Add SMTP Server
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">{editing ? 'Edit SMTP Config' : 'New SMTP Configuration'}</h3>
            <button onClick={resetForm} className="text-neutral-500 hover:text-white"><X size={16} /></button>
          </div>
          <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
            <div><label className="block text-neutral-400 mb-1">Name</label>
              <input type="text" className="w-full al-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="My SMTP" /></div>
            <div><label className="block text-neutral-400 mb-1">Host *</label>
              <input type="text" className="w-full al-input" value={form.host} onChange={e => setForm({...form, host: e.target.value})} placeholder="smtp.example.com" required /></div>
            <div><label className="block text-neutral-400 mb-1">Port *</label>
              <input type="number" className="w-full al-input" value={form.port} onChange={e => setForm({...form, port: parseInt(e.target.value) || 587})} required /></div>
            <div><label className="block text-neutral-400 mb-1">Username *</label>
              <input type="text" className="w-full al-input" value={form.username} onChange={e => setForm({...form, username: e.target.value})} required /></div>
            <div><label className="block text-neutral-400 mb-1">Password {editing && '(leave blank to keep)'} *</label>
              <input type="password" className="w-full al-input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={!editing} /></div>
            <div><label className="block text-neutral-400 mb-1">Encryption</label>
              <select className="w-full al-input" value={form.encryption} onChange={e => setForm({...form, encryption: e.target.value})}>
                <option value="none">None</option>
                <option value="starttls">STARTTLS</option>
                <option value="tls">TLS/SSL</option>
              </select></div>
            <div><label className="block text-neutral-400 mb-1">Sender Name *</label>
              <input type="text" className="w-full al-input" value={form.senderName} onChange={e => setForm({...form, senderName: e.target.value})} placeholder="CynexVM" required /></div>
            <div><label className="block text-neutral-400 mb-1">Sender Email *</label>
              <input type="email" className="w-full al-input" value={form.senderEmail} onChange={e => setForm({...form, senderEmail: e.target.value})} placeholder="noreply@example.com" required /></div>
            <div><label className="block text-neutral-400 mb-1">Reply-To</label>
              <input type="email" className="w-full al-input" value={form.replyTo} onChange={e => setForm({...form, replyTo: e.target.value})} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isDefault" checked={form.isDefault} onChange={e => setForm({...form, isDefault: e.target.checked})} />
              <label htmlFor="isDefault" className="text-neutral-400">Set as default</label>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold">
                <Save size={14} className="inline mr-1" /> {editing ? 'Update' : 'Save'}
              </button>
              <button type="button" onClick={resetForm} className="px-4 py-2 border border-neutral-700 text-neutral-400 rounded-xl text-xs">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {configs.map(c => (
          <div key={c.id} className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-white">{c.name}</span>
                  {c.isDefault && <span className="px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded text-[10px] font-semibold">Default</span>}
                  {c.isVerified && <span className="px-1.5 py-0.5 bg-emerald-600/20 text-emerald-400 rounded text-[10px] font-semibold">Verified</span>}
                </div>
                <div className="text-xs text-neutral-500 space-y-0.5">
                  <p><span className="text-neutral-400">Server:</span> {c.host}:{c.port} ({c.encryption})</p>
                  <p><span className="text-neutral-400">Auth:</span> {c.username}</p>
                  <p><span className="text-neutral-400">Sender:</span> {c.senderName} &lt;{c.senderEmail}&gt;{c.replyTo ? ` (Reply: ${c.replyTo})` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {testResult && testResult.id === c.id && (
                  <span className={`text-[10px] ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                    {testResult.success ? 'OK' : 'Fail'}
                  </span>
                )}
                <button onClick={() => handleTest(c.id)} disabled={testing === c.id} className="p-1.5 text-neutral-500 hover:text-blue-400 transition" title="Test Connection">
                  {testing === c.id ? <Loader size={14} className="animate-spin" /> : <Zap size={14} />}
                </button>
                <button onClick={() => setTestSendEmail(c.id === testResult?.id ? '' : c.id)} className="p-1.5 text-neutral-500 hover:text-emerald-400 transition" title="Send Test Email">
                  <Send size={14} />
                </button>
                <button onClick={() => openEdit(c)} className="p-1.5 text-neutral-500 hover:text-white transition"><Edit3 size={14} /></button>
                <button onClick={() => handleDelete(c.id)} className="p-1.5 text-neutral-500 hover:text-red-400 transition"><Trash2 size={14} /></button>
              </div>
            </div>
            {testSendEmail === c.id && (
              <div className="mt-3 flex gap-2">
                <input type="email" placeholder="recipient@example.com" className="flex-1 al-input text-xs" value={testSendEmail === c.id ? '' : testSendEmail}
                  onChange={e => setTestSendEmail(e.target.value)} />
                <button onClick={() => handleTestSend(c.id)} disabled={sendingTest === c.id} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold">
                  {sendingTest === c.id ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            )}
          </div>
        ))}
        {configs.length === 0 && (
          <div className="p-12 text-center text-neutral-500 text-xs border border-dashed border-neutral-700 rounded-xl">
            No SMTP configurations yet. Add one to start sending emails.
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Templates Section
// ============================================================

function TemplatesSection() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [preview, setPreview] = useState<{ name: string; subject: string; html: string; plainText: string } | null>(null);
  const [previewVars, setPreviewVars] = useState('{}');
  const [filter, setFilter] = useState('');

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await api('/api/v1/email/templates');
      if (res.ok) setTemplates(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchTemplates(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      const { id, ...data } = editing;
      const res = await api(`/api/v1/email/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      if (res.ok) {
        setEditing(null);
        fetchTemplates();
      } else {
        alert('Failed to save template');
      }
    } catch {}
  };

  const handleRestore = async (name: string) => {
    if (!confirm(`Restore builtin template "${name}"? This will overwrite current edits.`)) return;
    await api(`/api/v1/email/templates/${name}/restore`, { method: 'POST' });
    fetchTemplates();
  };

  const handlePreview = async (tpl: any) => {
    setPreview(null);
    let vars: Record<string, any> = {};
    try { vars = JSON.parse(previewVars); } catch {}
    const res = await api(`/api/v1/email/templates/${tpl.name}/preview`, {
      method: 'POST',
      body: JSON.stringify({ variables: vars })
    });
    if (res.ok) {
      const data = await res.json();
      setPreview({ name: tpl.name, ...data });
    }
  };

  const filtered = templates.filter(t =>
    !filter || t.name.toLowerCase().includes(filter.toLowerCase()) || t.category?.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) return <div className="p-12 text-center text-neutral-500 text-xs">Loading templates...</div>;

  if (editing) {
    return (
      <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white">Edit Template: {editing.name}</h3>
          <button onClick={() => setEditing(null)} className="text-neutral-500 hover:text-white"><X size={16} /></button>
        </div>
        <form onSubmit={handleSave} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-neutral-400 mb-1">Name</label>
              <input type="text" className="w-full al-input" value={editing.name} onChange={e => setEditing({...editing, name: e.target.value})} /></div>
            <div><label className="block text-neutral-400 mb-1">Category</label>
              <select className="w-full al-input" value={editing.category} onChange={e => setEditing({...editing, category: e.target.value})}>
                <option value="system">System</option>
                <option value="transactional">Transactional</option>
                <option value="marketing">Marketing</option>
              </select></div>
          </div>
          <div><label className="block text-neutral-400 mb-1">Description</label>
            <input type="text" className="w-full al-input" value={editing.description || ''} onChange={e => setEditing({...editing, description: e.target.value})} /></div>
          <div><label className="block text-neutral-400 mb-1">Subject *</label>
            <input type="text" className="w-full al-input" value={editing.subject} onChange={e => setEditing({...editing, subject: e.target.value})} required /></div>
          <div>
            <label className="block text-neutral-400 mb-1">HTML Body *</label>
            <div className="flex justify-between mb-1">
              <span className="text-[10px] text-neutral-500">Use <code className="text-blue-400">{'{{variable}}'}</code> for dynamic content, <code className="text-blue-400">{'{{#var}}...{{/var}}'}</code> for conditionals</span>
              <span className="text-[10px] text-neutral-500">{editing.htmlBody?.length || 0} chars</span>
            </div>
            <textarea className="w-full al-input font-mono text-xs resize-y" rows={16} value={editing.htmlBody} onChange={e => setEditing({...editing, htmlBody: e.target.value})} required />
          </div>
          <div><label className="block text-neutral-400 mb-1">Plain Text (optional)</label>
            <textarea className="w-full al-input font-mono text-xs resize-y" rows={6} value={editing.plainText || ''} onChange={e => setEditing({...editing, plainText: e.target.value})} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive" checked={editing.isActive !== false} onChange={e => setEditing({...editing, isActive: e.target.checked})} />
            <label htmlFor="isActive" className="text-neutral-400">Active</label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"><Save size={14} className="inline mr-1" /> Save</button>
            <button type="button" onClick={() => setEditing(null)} className="px-4 py-2 border border-neutral-700 text-neutral-400 rounded-xl">Cancel</button>
            {editing.isBuiltin && (
              <button type="button" onClick={() => handleRestore(editing.name)} className="px-4 py-2 border border-amber-700 text-amber-400 rounded-xl ml-auto">
                <RotateCcw size={14} className="inline mr-1" /> Restore Builtin
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input type="text" placeholder="Search templates..." className="w-full al-input pl-8 text-xs" value={filter} onChange={e => setFilter(e.target.value)} />
        </div>
        <span className="text-xs text-neutral-500">{filtered.length} of {templates.length}</span>
      </div>

      {/* Template Editor buttons for each template */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(t => (
          <div key={t.id} className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-4 hover:border-neutral-600 transition">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-sm font-semibold text-white">{t.name}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  t.category === 'system' ? 'bg-blue-600/20 text-blue-400' :
                  t.category === 'transactional' ? 'bg-purple-600/20 text-purple-400' :
                  'bg-amber-600/20 text-amber-400'
                }`}>{t.category}</span>
                {t.isBuiltin && <span className="ml-1 text-[10px] text-neutral-500">builtin</span>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => handlePreview(t)} className="p-1 text-neutral-500 hover:text-blue-400" title="Preview"><Eye size={14} /></button>
                <button onClick={() => setEditing(t)} className="p-1 text-neutral-500 hover:text-white" title="Edit"><Edit3 size={14} /></button>
              </div>
            </div>
            <p className="text-xs text-neutral-500 truncate mb-1">{t.subject}</p>
            <p className="text-[10px] text-neutral-600 truncate">{t.description || 'No description'}</p>
            {!t.isActive && <span className="inline-block mt-1 px-1.5 py-0.5 bg-red-600/20 text-red-400 rounded text-[10px]">Inactive</span>}
          </div>
        ))}
      </div>

      {/* Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}>
          <div className="bg-[#1a1a1a] rounded-xl border border-white/10 max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-sm font-medium text-white">Preview: {preview.name}</h3>
              <button onClick={() => setPreview(null)} className="text-neutral-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-2 items-center">
                <span className="text-xs text-neutral-500">Subject:</span>
                <span className="text-xs text-white">{preview.subject}</span>
              </div>
              <div className="flex gap-2 mb-2">
                <input type="text" placeholder='{"username": "test", "panel_name": "CynexVM"}' className="flex-1 al-input text-xs font-mono"
                  value={previewVars} onChange={e => setPreviewVars(e.target.value)} />
                <button onClick={() => handlePreview(templates.find(t => t.name === preview.name)!)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs"><RefreshCw size={14} className="inline mr-1" /> Reload</button>
              </div>
              <div className="border border-white/10 rounded-xl overflow-hidden bg-white">
                <iframe srcDoc={preview.html} className="w-full h-[400px]" title="Email Preview" />
              </div>
              <details className="text-xs">
                <summary className="text-neutral-400 cursor-pointer">Plain text version</summary>
                <pre className="mt-2 p-3 bg-neutral-900 rounded-xl text-neutral-300 whitespace-pre-wrap">{preview.plainText}</pre>
              </details>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Email Logs Section
// ============================================================

function EmailLogsSection() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);

  const limit = 25;

  const fetchLogs = async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(limit) });
      if (statusFilter) params.set('status', statusFilter);
      if (search) params.set('q', search);
      const res = await api(`/api/v1/email/logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.items);
        setTotal(data.total);
        setTotalPages(data.totalPages);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchLogs(page); }, [page, statusFilter]);

  const handleResend = async (id: string) => {
    const res = await api(`/api/v1/email/logs/${id}/resend`, { method: 'POST' });
    if (res.ok) alert('Email requeued for delivery');
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'sent': return 'text-emerald-400 bg-emerald-600/10';
      case 'failed': return 'text-red-400 bg-red-600/10';
      case 'queued': return 'text-amber-400 bg-amber-600/10';
      case 'sending': return 'text-blue-400 bg-blue-600/10';
      case 'bounced': return 'text-purple-400 bg-purple-600/10';
      default: return 'text-neutral-400 bg-neutral-600/10';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
          <input type="text" placeholder="Search by email, subject..." className="w-full al-input pl-8 text-xs"
            value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchLogs(1)} />
        </div>
        <select className="al-input text-xs w-auto" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
          <option value="">All Status</option>
          <option value="queued">Queued</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="bounced">Bounced</option>
        </select>
        <button onClick={() => fetchLogs(page)} className="p-2 text-neutral-500 hover:text-white"><RefreshCw size={14} /></button>
        <span className="text-xs text-neutral-500">{total} total</span>
      </div>

      <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-400">
              <tr>
                <th className="p-3">Recipient</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Template</th>
                <th className="p-3">Status</th>
                <th className="p-3">Attempts</th>
                <th className="p-3">Sent</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-neutral-500">Loading...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-neutral-500">No email logs found</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-neutral-800/10 transition cursor-pointer" onClick={() => setSelected(log)}>
                  <td className="p-3 font-medium text-white">{log.to}</td>
                  <td className="p-3 max-w-[200px] truncate">{log.subject}</td>
                  <td className="p-3 text-neutral-500">{log.templateName || '-'}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusColor(log.status)}`}>{log.status}</span></td>
                  <td className="p-3 text-neutral-500">{log.retryCount}/{log.maxRetries}</td>
                  <td className="p-3 text-neutral-500">{log.sentAt ? new Date(log.sentAt).toLocaleString() : '-'}</td>
                  <td className="p-3 text-right">
                    <button onClick={(e) => { e.stopPropagation(); handleResend(log.id); }} className="p-1 text-neutral-500 hover:text-blue-400" title="Resend"><RotateCcw size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="p-1.5 text-neutral-500 hover:text-white disabled:opacity-30"><ChevronLeft size={14} /></button>
          <span className="text-neutral-400">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 text-neutral-500 hover:text-white disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <div className="bg-[#1a1a1a] rounded-xl border border-white/10 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10">
              <h3 className="text-sm font-medium text-white">Email Details</h3>
              <button onClick={() => setSelected(null)} className="text-neutral-500 hover:text-white"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div><span className="text-neutral-500">To:</span> <span className="text-white">{selected.to}</span></div>
                <div><span className="text-neutral-500">Status:</span> <span className={`${statusColor(selected.status)} px-1.5 py-0.5 rounded`}>{selected.status}</span></div>
                <div className="col-span-2"><span className="text-neutral-500">Subject:</span> <span className="text-white">{selected.subject}</span></div>
                {selected.templateName && <div className="col-span-2"><span className="text-neutral-500">Template:</span> <span className="text-white">{selected.templateName}</span></div>}
                <div><span className="text-neutral-500">Attempts:</span> <span className="text-white">{selected.retryCount}/{selected.maxRetries}</span></div>
                <div><span className="text-neutral-500">Message ID:</span> <span className="text-white font-mono text-[10px]">{selected.messageId || '-'}</span></div>
                {selected.error && <div className="col-span-2"><span className="text-neutral-500">Error:</span> <span className="text-red-400">{selected.error}</span></div>}
                {selected.sentAt && <div className="col-span-2"><span className="text-neutral-500">Sent at:</span> <span className="text-white">{new Date(selected.sentAt).toLocaleString()}</span></div>}
                <div className="col-span-2"><span className="text-neutral-500">Created:</span> <span className="text-white">{new Date(selected.createdAt).toLocaleString()}</span></div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => { handleResend(selected.id); setSelected(null); }} className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold">
                  <RotateCcw size={14} className="inline mr-1" /> Resend
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Analytics Section
// ============================================================

function AnalyticsSection() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  const fetchAnalytics = async (d: number) => {
    setLoading(true);
    try {
      const res = await api(`/api/v1/email/analytics?days=${d}`);
      if (res.ok) setData(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchAnalytics(days); }, [days]);

  if (loading && !data) return <div className="p-12 text-center text-neutral-500 text-xs">Loading analytics...</div>;

  const summary = data?.summary || {};
  const queue = data?.queue || {};
  const dailyStats = data?.dailyStats || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <select className="al-input text-xs w-auto" value={days} onChange={e => setDays(parseInt(e.target.value))}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button onClick={() => fetchAnalytics(days)} className="p-1.5 text-neutral-500 hover:text-white"><RefreshCw size={14} /></button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        {[
          { label: 'Sent (Period)', value: summary.totalSent, icon: <Send size={16} />, color: 'text-emerald-400' },
          { label: 'Failed', value: summary.totalFailed, icon: <AlertTriangle size={16} />, color: 'text-red-400' },
          { label: 'Bounced', value: summary.totalBounced, icon: <AlertTriangle size={16} />, color: 'text-purple-400' },
          { label: 'Delivery Rate', value: `${(summary.deliveryRate || 0).toFixed(1)}%`, icon: <Activity size={16} />, color: 'text-blue-400' },
          { label: 'Today Sent', value: queue.sentToday || 0, icon: <Zap size={16} />, color: 'text-amber-400' },
          { label: 'Queue', value: (queue.queued || 0) + (queue.sending || 0), icon: <Clock size={16} />, color: 'text-neutral-400' },
        ].map(card => (
          <div key={card.label} className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{card.label}</span>
              <span className={card.color}>{card.icon}</span>
            </div>
            <p className="text-lg font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Daily Stats Chart */}
      {dailyStats.length > 0 && (
        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5">
          <h3 className="text-sm font-medium text-white mb-4">Daily Delivery (Last {days} days)</h3>
          <div className="space-y-1">
            {dailyStats.slice(-14).map((d: any) => {
              const max = Math.max(...dailyStats.map((x: any) => x.sent + x.failed), 1);
              const total = d.sent + d.failed + d.bounced;
              const sentPct = max > 0 ? (d.sent / max) * 100 : 0;
              const failedPct = max > 0 ? (d.failed / max) * 100 : 0;
              return (
                <div key={d.date} className="flex items-center gap-3 text-xs">
                  <span className="w-24 text-neutral-500 shrink-0">{d.date.slice(5)}</span>
                  <div className="flex-1 h-4 bg-neutral-800 rounded-full overflow-hidden flex">
                    {d.sent > 0 && <div className="h-full bg-emerald-500 transition-all" style={{ width: `${sentPct}%` }} title={`Sent: ${d.sent}`} />}
                    {d.failed > 0 && <div className="h-full bg-red-500 transition-all" style={{ width: `${failedPct}%` }} title={`Failed: ${d.failed}`} />}
                  </div>
                  <span className="w-20 text-right text-neutral-500 shrink-0">{total}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Template Stats */}
      {data?.templateStats?.length > 0 && (
        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5">
          <h3 className="text-sm font-medium text-white mb-4">Template Usage</h3>
          <div className="space-y-2 text-xs">
            {data.templateStats.map((t: any) => (
              <div key={t.template} className="flex items-center justify-between">
                <span className="text-neutral-300">{t.template}</span>
                <span className="text-neutral-500">{t.count} emails</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Recipients */}
      {data?.topRecipients?.length > 0 && (
        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5">
          <h3 className="text-sm font-medium text-white mb-4">Top Recipients</h3>
          <div className="space-y-2 text-xs">
            {data.topRecipients.map((r: any) => (
              <div key={r.email} className="flex items-center justify-between">
                <span className="text-neutral-300">{r.email}</span>
                <span className="text-neutral-500">{r.count} emails</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Branding Section
// ============================================================

function BrandingSection() {
  const [branding, setBranding] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const fetchBranding = async () => {
    setLoading(true);
    try {
      const res = await api('/api/v1/email/branding');
      if (res.ok) setBranding(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchBranding(); }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api('/api/v1/email/branding', {
        method: 'PUT',
        body: JSON.stringify(branding)
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      }
    } catch {}
    setSaving(false);
  };

  if (loading) return <div className="p-12 text-center text-neutral-500 text-xs">Loading branding...</div>;

  return (
    <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5">
      <form onSubmit={handleSave} className="space-y-4 text-xs">
        {success && <p className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl font-semibold">Branding saved!</p>}

        <h3 className="text-sm font-medium text-white">Email Branding</h3>
        <p className="text-xs text-neutral-500">Customize the appearance of all outgoing emails. The branding wrapper is applied to all emails automatically.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-neutral-400 mb-1">Logo URL</label>
            <input type="url" className="w-full al-input" value={branding.logoUrl || ''} onChange={e => setBranding({...branding, logoUrl: e.target.value})} placeholder="https://example.com/logo.png" /></div>
          <div><label className="block text-neutral-400 mb-1">Primary Color</label>
            <div className="flex gap-2">
              <input type="color" className="h-9 w-12 rounded-lg cursor-pointer bg-transparent border border-neutral-700" value={branding.primaryColor || '#2563eb'} onChange={e => setBranding({...branding, primaryColor: e.target.value})} />
              <input type="text" className="flex-1 al-input" value={branding.primaryColor || '#2563eb'} onChange={e => setBranding({...branding, primaryColor: e.target.value})} />
            </div></div>
          <div><label className="block text-neutral-400 mb-1">Company Name</label>
            <input type="text" className="w-full al-input" value={branding.companyName || ''} onChange={e => setBranding({...branding, companyName: e.target.value})} /></div>
          <div><label className="block text-neutral-400 mb-1">Company Address</label>
            <input type="text" className="w-full al-input" value={branding.companyAddress || ''} onChange={e => setBranding({...branding, companyAddress: e.target.value})} /></div>
          <div className="sm:col-span-2"><label className="block text-neutral-400 mb-1">Footer Text (HTML allowed)</label>
            <textarea className="w-full al-input resize-none" rows={2} value={branding.footerHtml || branding.footerText || ''} onChange={e => setBranding({...branding, footerHtml: e.target.value})} placeholder="Copyright 2026 Your Company. All rights reserved." /></div>
          <div className="sm:col-span-2"><label className="block text-neutral-400 mb-1">Unsubscribe Message</label>
            <textarea className="w-full al-input resize-none" rows={2} value={branding.unsubscribeText || ''} onChange={e => setBranding({...branding, unsubscribeText: e.target.value})} /></div>
        </div>

        <h4 className="text-xs font-medium text-neutral-400 pt-2">Social Links (optional)</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-neutral-400 mb-1">Twitter URL</label>
            <input type="url" className="w-full al-input" value={branding.twitterUrl || ''} onChange={e => setBranding({...branding, twitterUrl: e.target.value})} /></div>
          <div><label className="block text-neutral-400 mb-1">Facebook URL</label>
            <input type="url" className="w-full al-input" value={branding.facebookUrl || ''} onChange={e => setBranding({...branding, facebookUrl: e.target.value})} /></div>
          <div><label className="block text-neutral-400 mb-1">LinkedIn URL</label>
            <input type="url" className="w-full al-input" value={branding.linkedinUrl || ''} onChange={e => setBranding({...branding, linkedinUrl: e.target.value})} /></div>
          <div><label className="block text-neutral-400 mb-1">GitHub URL</label>
            <input type="url" className="w-full al-input" value={branding.githubUrl || ''} onChange={e => setBranding({...branding, githubUrl: e.target.value})} /></div>
        </div>

        <button type="submit" disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs">
          <Save size={14} className="inline mr-1" /> {saving ? 'Saving...' : 'Save Branding'}
        </button>
      </form>
    </div>
  );
}

export default AdminEmail;

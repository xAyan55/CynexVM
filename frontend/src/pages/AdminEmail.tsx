import React, { useState, useEffect } from 'react';
import {
  Mail, FileText, BarChart3, Palette, Server, Plus, Trash2,
  Send, Save, RotateCcw, Search, AlertTriangle, CheckCircle,
  Clock, RefreshCw, Eye, Edit3, X, ChevronLeft, ChevronRight,
  Activity, Loader, Zap, Shield, Globe, Terminal, Smartphone, Tablet as TabletIcon, Monitor, Moon, Sun, HelpCircle, Check, Play, Pause
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
    <div className="space-y-6 max-w-7xl mx-auto px-6 lg:px-8 pb-12 text-neutral-800 dark:text-neutral-100">
      <div className="flex flex-col sm:flex-row sm:items-center pt-5 justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-800 dark:text-white flex items-center gap-2">
            <Mail className="text-blue-500" /> Email Delivery System
          </h1>
          <p className="mt-0.5 text-xs text-neutral-500">Configure SMTP servers, verify deliverability, manage templates, and monitor queue analytics.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-neutral-100 dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition shrink-0 ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white shadow'
                : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-white hover:bg-neutral-200 dark:hover:bg-white/5'
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
  
  // Verification states
  const [runningVerify, setRunningVerify] = useState(false);
  const [verifyPassed, setVerifyPassed] = useState(false);
  const [runningTestSend, setRunningTestSend] = useState(false);
  const [testSendPassed, setTestSendPassed] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  
  // Diagnostic Modal
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [diagnosticReport, setDiagnosticReport] = useState<any>(null);

  const [form, setForm] = useState({
    name: '', host: '', port: 587, username: '', password: '',
    encryption: 'starttls', senderName: '', senderEmail: '', replyTo: '',
    isDefault: false, enableIpv6: false
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

  // SMTP Auto-Discovery
  const handleEmailOrUserChange = async (val: string, field: 'username' | 'senderEmail') => {
    const updatedForm = { ...form, [field]: val };
    setForm(updatedForm);

    const checkVal = field === 'senderEmail' ? val : (val.includes('@') ? val : '');
    if (checkVal && checkVal.includes('@') && !editing) {
      try {
        const res = await api('/api/v1/email/smtp-configs/autodiscover', {
          method: 'POST',
          body: JSON.stringify({ email: checkVal })
        });
        if (res.ok) {
          const data = await res.json();
          if (data.suggestion) {
            setForm(prev => ({
              ...prev,
              host: prev.host || data.suggestion.host,
              port: prev.port === 587 && data.suggestion.port !== 587 ? data.suggestion.port : prev.port,
              encryption: prev.encryption === 'starttls' && data.suggestion.encryption !== 'starttls' ? data.suggestion.encryption : prev.encryption,
              name: prev.name || `${data.suggestion.provider} SMTP`
            }));
          }
        }
      } catch {}
    }
  };

  const resetForm = () => {
    setForm({
      name: '', host: '', port: 587, username: '', password: '',
      encryption: 'starttls', senderName: '', senderEmail: '', replyTo: '',
      isDefault: false, enableIpv6: false
    });
    setEditing(null);
    setShowForm(false);
    setVerifyPassed(false);
    setTestSendPassed(false);
    setTestRecipient('');
  };

  const openEdit = (c: any) => {
    setForm({
      name: c.name, host: c.host, port: c.port, username: c.username, password: '',
      encryption: c.encryption, senderName: c.senderName, senderEmail: c.senderEmail,
      replyTo: c.replyTo || '', isDefault: c.isDefault, enableIpv6: !!c.enableIpv6
    });
    setEditing(c);
    setShowForm(true);
    setVerifyPassed(false);
    setTestSendPassed(false);
  };

  // Run Connection Diagnostics Check (Wizard Step 1)
  const handleVerifySettings = async () => {
    setRunningVerify(true);
    setDiagnosticReport(null);
    try {
      const res = await api('/api/v1/email/smtp-configs/test', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      const data = await res.json();
      setDiagnosticReport(data);
      if (res.ok && data.success) {
        setVerifyPassed(true);
      } else {
        setVerifyPassed(false);
        alert(`Connection verification failed: ${data.error || 'Check details in diagnostic console'}`);
        setShowDiagnostics(true);
      }
    } catch (err: any) {
      alert('Verification failed: ' + err.message);
    }
    setRunningVerify(false);
  };

  // Send Test Email Check (Wizard Step 2)
  const handleSendTestWizard = async () => {
    if (!testRecipient) {
      alert('Please enter a recipient email address to send the test.');
      return;
    }
    setRunningTestSend(true);
    try {
      const res = await api('/api/v1/email/smtp-configs/test-send', {
        method: 'POST',
        body: JSON.stringify({ ...form, to: testRecipient })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestSendPassed(true);
        alert('Test email successfully delivered!');
      } else {
        setTestSendPassed(false);
        alert(`Test send failed: ${data.error || 'Check details in diagnostics'}`);
      }
      // Populate test logs for debugging
      if (data.logs) {
        setDiagnosticReport((prev: any) => ({
          ...prev,
          logs: data.logs,
          error: data.error
        }));
        setShowDiagnostics(true);
      }
    } catch (err: any) {
      alert('Test send failed: ' + err.message);
    }
    setRunningTestSend(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPassed || !testSendPassed) {
      alert('You must pass the Connection Verification and Test Send checks before saving.');
      return;
    }

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
        alert(data.error || 'Failed to save configuration');
      }
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this SMTP configuration?')) return;
    await api(`/api/v1/email/smtp-configs/${id}`, { method: 'DELETE' });
    fetchConfigs();
  };

  // Diagnostic drawer/modal view on saved card
  const inspectDiagnostics = async (id: string) => {
    setDiagnosticReport(null);
    setShowDiagnostics(true);
    try {
      const res = await api(`/api/v1/email/smtp-configs/${id}/test`, { method: 'POST' });
      const data = await res.json();
      setDiagnosticReport(data);
      fetchConfigs();
    } catch {}
  };

  return (
    <div className="space-y-4">
      {/* Queue control panel and actions */}
      <QueueControlsCard />

      <div className="flex justify-between items-center">
        <p className="text-xs text-neutral-500 font-medium">{configs.length} SMTP configuration(s) configured</p>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition">
          <Plus size={14} /> Add SMTP Server
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-neutral-200 dark:border-white/5 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-neutral-800 dark:text-white">
              {editing ? `Edit SMTP Configuration: ${editing.name}` : 'New SMTP Server Wizard'}
            </h3>
            <button onClick={resetForm} className="text-neutral-500 hover:text-neutral-800 dark:hover:text-white transition"><X size={16} /></button>
          </div>
          
          <form onSubmit={handleSave} className="space-y-5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1">Friendly Name</label>
                <input type="text" className="w-full al-input" value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Company Mailer" />
              </div>
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1">SMTP Host *</label>
                <input type="text" className="w-full al-input" value={form.host} onChange={e => setForm({...form, host: e.target.value})} placeholder="smtp.gmail.com" required />
              </div>
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1">SMTP Port *</label>
                <input type="number" className="w-full al-input" value={form.port} onChange={e => setForm({...form, port: parseInt(e.target.value) || 587})} required />
              </div>
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1">Username (Email) *</label>
                <input type="text" className="w-full al-input" value={form.username} onChange={e => handleEmailOrUserChange(e.target.value, 'username')} placeholder="user@gmail.com" required />
              </div>
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1">Password * {editing && '(leave empty to keep)'}</label>
                <input type="password" className="w-full al-input" value={form.password} onChange={e => setForm({...form, password: e.target.value})} required={!editing} />
              </div>
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1">Encryption Protocol</label>
                <select className="w-full al-input" value={form.encryption} onChange={e => setForm({...form, encryption: e.target.value})}>
                  <option value="none">None (Plain / Port 25)</option>
                  <option value="starttls">STARTTLS (Port 587)</option>
                  <option value="tls">TLS/SSL (Port 465)</option>
                </select>
              </div>
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1">Sender Name *</label>
                <input type="text" className="w-full al-input" value={form.senderName} onChange={e => setForm({...form, senderName: e.target.value})} placeholder="Billing System" required />
              </div>
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1">Sender Email *</label>
                <input type="email" className="w-full al-input" value={form.senderEmail} onChange={e => handleEmailOrUserChange(e.target.value, 'senderEmail')} placeholder="noreply@domain.com" required />
              </div>
              <div>
                <label className="block text-neutral-500 dark:text-neutral-400 font-medium mb-1">Reply-To Address</label>
                <input type="email" className="w-full al-input" value={form.replyTo} onChange={e => setForm({...form, replyTo: e.target.value})} placeholder="support@domain.com" />
              </div>
              <div className="flex items-center gap-4 py-2 col-span-1 sm:col-span-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.isDefault} onChange={e => setForm({...form, isDefault: e.target.checked})} className="rounded bg-neutral-200 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700" />
                  <span className="text-neutral-600 dark:text-neutral-400">Set as default mail provider</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.enableIpv6} onChange={e => setForm({...form, enableIpv6: e.target.checked})} className="rounded bg-neutral-200 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700" />
                  <span className="text-neutral-600 dark:text-neutral-400">Prefer/Enable IPv6</span>
                </label>
              </div>
            </div>

            {/* PRE-SAVE WIZARD CHECKLIST */}
            <div className="bg-neutral-50 dark:bg-white/5 rounded-xl p-4 border border-neutral-200 dark:border-white/5 space-y-3">
              <h4 className="text-xs font-bold text-neutral-800 dark:text-white">Validation Wizard Checklist</h4>
              <div className="space-y-2">
                {/* Step 1 */}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    {verifyPassed ? <CheckCircle size={16} className="text-emerald-500" /> : <Clock size={16} className="text-neutral-400" />}
                    <span className={verifyPassed ? 'text-emerald-400 font-semibold' : 'text-neutral-400'}>1. Verification Check (DNS, TCP, TLS and SMTP Greetings)</span>
                  </span>
                  <button type="button" onClick={handleVerifySettings} disabled={runningVerify} className="px-2.5 py-1 bg-neutral-200 dark:bg-white/10 hover:bg-blue-600 hover:text-white rounded text-[10px] font-semibold transition flex items-center gap-1">
                    {runningVerify ? <Loader size={10} className="animate-spin" /> : <Zap size={10} />}
                    Verify Server Connection
                  </button>
                </div>
                {/* Step 2 */}
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <span className="flex items-center gap-2">
                    {testSendPassed ? <CheckCircle size={16} className="text-emerald-500" /> : <Clock size={16} className="text-neutral-400" />}
                    <span className={testSendPassed ? 'text-emerald-400 font-semibold' : 'text-neutral-400'}>2. Deliverability Verification (Receive Test Mail)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <input type="email" placeholder="recipient@domain.com" value={testRecipient} onChange={e => setTestRecipient(e.target.value)} className="al-input py-0.5 text-[10px] w-40" />
                    <button type="button" onClick={handleSendTestWizard} disabled={!verifyPassed || runningTestSend} className="px-2.5 py-1 bg-neutral-200 dark:bg-white/10 hover:bg-emerald-600 hover:text-white disabled:opacity-30 rounded text-[10px] font-semibold transition">
                      {runningTestSend ? 'Sending...' : 'Send Test Mail'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Form actions */}
            <div className="flex items-center gap-2 pt-2 justify-end">
              <button type="submit" disabled={!verifyPassed || !testSendPassed} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 disabled:hover:bg-blue-600 text-white rounded-xl font-semibold flex items-center gap-1 transition">
                <Save size={14} /> {editing ? 'Update Server Settings' : 'Create SMTP Server'}
              </button>
              <button type="button" onClick={resetForm} className="px-4 py-2 border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-800 dark:hover:text-white rounded-xl transition">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Cards list */}
      <div className="space-y-3">
        {configs.map(c => {
          const status = c.isVerified ? 'verified' : 'offline';
          return (
            <div key={c.id} className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-sm font-bold text-neutral-800 dark:text-white">{c.name}</span>
                    {c.isDefault && <span className="px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded text-[10px] font-bold">Default</span>}
                    
                    {/* Live connection badge */}
                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                      c.isVerified
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${c.isVerified ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                      {c.isVerified ? 'Connected' : 'Offline / Verification Failed'}
                    </span>
                    {c.enableIpv6 && <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[10px] font-medium">IPv6 Prefer</span>}
                  </div>
                  <div className="text-xs text-neutral-500 space-y-0.5">
                    <p><span className="text-neutral-400 font-medium">SMTP Server:</span> {c.host}:{c.port} ({c.encryption})</p>
                    <p><span className="text-neutral-400 font-medium">Username:</span> {c.username}</p>
                    <p><span className="text-neutral-400 font-medium">Sender:</span> {c.senderName} &lt;{c.senderEmail}&gt;{c.replyTo ? ` (Reply: ${c.replyTo})` : ''}</p>
                  </div>
                </div>
                
                {/* Card Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => inspectDiagnostics(c.id)} className="px-2 py-1.5 bg-neutral-100 hover:bg-blue-600 dark:bg-white/5 hover:text-white text-neutral-400 rounded-lg text-xs font-semibold transition flex items-center gap-1" title="Diagnostics Check">
                    <Zap size={12} /> Diagnostics
                  </button>
                  <button onClick={() => openEdit(c)} className="p-1.5 text-neutral-400 hover:text-blue-500 dark:hover:text-white transition"><Edit3 size={14} /></button>
                  <button onClick={() => handleDelete(c.id)} className="p-1.5 text-neutral-400 hover:text-red-500 transition"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          );
        })}
        {configs.length === 0 && !showForm && (
          <div className="p-12 text-center text-neutral-400 text-xs border border-dashed border-neutral-300 dark:border-neutral-700 rounded-xl">
            No SMTP configurations yet. Click "Add SMTP Server" to configure one using the validation wizard.
          </div>
        )}
      </div>

      {/* DIAGNOSTIC DRAWER / MODAL */}
      {showDiagnostics && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm" onClick={() => setShowDiagnostics(false)}>
          <div className="bg-[#18181b] border-l border-neutral-800 w-full max-w-2xl h-full flex flex-col shadow-2xl overflow-y-auto text-neutral-300" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Terminal className="text-blue-500" /> SMTP Diagnostics Console
              </h3>
              <button onClick={() => setShowDiagnostics(false)} className="text-neutral-400 hover:text-white"><X size={18} /></button>
            </div>

            {!diagnosticReport ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 gap-3">
                <Loader size={32} className="animate-spin text-blue-500" />
                <span className="text-xs text-neutral-400">Auditing DNS, TCP, and TLS settings. Please wait...</span>
              </div>
            ) : (
              <div className="p-5 space-y-5 flex-1 overflow-y-auto text-xs">
                {/* Summary bar */}
                <div className={`p-4 rounded-xl flex items-center justify-between border ${
                  diagnosticReport.success 
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}>
                  <span className="font-semibold text-xs">Result: {diagnosticReport.success ? 'PASSED (SMTP Ready)' : 'FAILED'}</span>
                  <span>{diagnosticReport.success ? '🟢 Ready' : '🔴 Connection Failed'}</span>
                </div>

                {/* Provider Badge and Latency */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                    <span className="text-[10px] text-neutral-500 uppercase block mb-1">Detected Provider</span>
                    <span className="font-bold text-white text-xs">{diagnosticReport.provider || 'Custom SMTP'}</span>
                  </div>
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3">
                    <span className="text-[10px] text-neutral-500 uppercase block mb-1">Response Latency</span>
                    <span className="font-bold text-white text-xs">{diagnosticReport.latency || 0}ms</span>
                  </div>
                </div>

                {/* Connection Stages Checklist */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
                  <h4 className="font-bold text-white text-xs">Connection Stages</h4>
                  <div className="space-y-2">
                    {[
                      { key: 'dnsLookup', label: '1. DNS Resolution' },
                      { key: 'tcpConnection', label: '2. TCP Handshake' },
                      { key: 'tlsNegotiation', label: '3. TLS Handshake Upgrade' },
                      { key: 'serverGreeting', label: '4. Server Banner greeting' },
                      { key: 'authentication', label: '5. SMTP Authentication check' }
                    ].map(stage => {
                      const data = diagnosticReport[stage.key];
                      const details = typeof data?.details === 'object' 
                        ? `Protocol: ${data.details.version || 'none'} (${data.details.cipher || 'none'})`
                        : (data?.details || 'Pending...');
                      return (
                        <div key={stage.key} className="flex items-start justify-between gap-4 border-b border-neutral-800/50 pb-2">
                          <div>
                            <span className="font-semibold block text-neutral-300">{stage.label}</span>
                            <span className="text-[10px] text-neutral-500">{details}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                            data?.status === 'passed' ? 'bg-emerald-500/10 text-emerald-400' :
                            data?.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                            'bg-neutral-800 text-neutral-500'
                          }`}>
                            {data?.status === 'passed' ? 'PASSED' : data?.status === 'failed' ? 'FAILED' : 'WAITING'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* TLS metadata if passed */}
                {diagnosticReport.tlsNegotiation?.status === 'passed' && diagnosticReport.tlsNegotiation.details && (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
                    <h4 className="font-bold text-white text-xs">Secure TLS Handshake Certificate Information</h4>
                    <div className="grid grid-cols-2 gap-3 text-[11px]">
                      <div><span className="text-neutral-500">Protocol:</span> <span className="text-neutral-300 font-mono">{diagnosticReport.tlsNegotiation.details.version}</span></div>
                      <div><span className="text-neutral-500">Cipher Suite:</span> <span className="text-neutral-300 font-mono">{diagnosticReport.tlsNegotiation.details.cipher}</span></div>
                      <div><span className="text-neutral-500">Certificate Expiry:</span> <span className="text-neutral-300">{diagnosticReport.tlsNegotiation.details.expiryDays} days remaining</span></div>
                      <div><span className="text-neutral-500">Hostname Matches Certificate:</span> <span className="text-emerald-400">Yes (Authorized)</span></div>
                    </div>
                  </div>
                )}

                {/* Deliverability checklist */}
                {diagnosticReport.deliverability && (
                  <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
                    <h4 className="font-bold text-white text-xs flex items-center gap-1">
                      <Shield size={14} className="text-blue-400" /> Deliverability DNS Checklist
                    </h4>
                    <div className="space-y-2 text-[11px]">
                      {[
                        { key: 'spf', label: 'SPF (Sender Policy Framework)' },
                        { key: 'dmarc', label: 'DMARC Record check' },
                        { key: 'reverseDns', label: 'rDNS Reverse Pointer (PTR)' },
                        { key: 'senderDomainMismatch', label: 'Domain Authentication Alignment' }
                      ].map(check => {
                        const data = diagnosticReport.deliverability[check.key];
                        return (
                          <div key={check.key} className="flex justify-between items-start gap-4">
                            <div>
                              <span className="font-medium text-neutral-300 block">{check.label}</span>
                              <span className="text-[10px] text-neutral-500">{data?.details}</span>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                              data?.status === 'passed' ? 'bg-emerald-500/10 text-emerald-400' :
                              data?.status === 'failed' ? 'bg-red-500/10 text-red-400' :
                              'bg-amber-500/10 text-amber-400'
                            }`}>
                              {data?.status?.toUpperCase()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Raw Transaction Terminal logs */}
                <div className="space-y-1">
                  <span className="text-neutral-400 font-bold block">Raw Nodemailer Smtp Transaction logs:</span>
                  <div className="bg-neutral-950 font-mono text-[10px] p-3 rounded-xl overflow-x-auto max-h-60 border border-neutral-850 space-y-0.5 text-neutral-400">
                    {diagnosticReport.logs && diagnosticReport.logs.map((log: string, idx: number) => (
                      <p key={idx} className={
                        log.startsWith('[Error]') || log.includes('verify=failed') ? 'text-red-400' :
                        log.startsWith('[Diagnostic]') ? 'text-blue-400' : 'text-neutral-400'
                      }>{log}</p>
                    ))}
                    {(!diagnosticReport.logs || diagnosticReport.logs.length === 0) && <p className="text-neutral-500">No logs collected.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Queue actions card component
function QueueControlsCard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await api('/api/v1/email/queue/stats');
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = async (action: string) => {
    setLoading(true);
    try {
      const res = await api(`/api/v1/email/queue/${action}`, { method: 'POST' });
      if (res.ok) {
        alert('Queue action completed successfully.');
        fetchStats();
      } else {
        const data = await res.json();
        alert(data.error || 'Action failed');
      }
    } catch (err: any) {
      alert('Action failed: ' + err.message);
    }
    setLoading(false);
  };

  if (!stats) return null;

  return (
    <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/5 rounded-xl p-5 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 dark:border-white/5 pb-4">
        <div>
          <h3 className="text-sm font-bold text-neutral-800 dark:text-white flex items-center gap-2">
            <Clock className="text-blue-500" /> Queue Operations Controller
          </h3>
          <p className="text-[11px] text-neutral-500">Monitor and manage email retry backoff queues, cancel pending actions, or retry dead letters.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
            stats.isPaused ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
          }`}>
            Queue State: {stats.isPaused ? '🔴 Paused' : '🟢 Active'}
          </span>
          <button onClick={() => handleAction(stats.isPaused ? 'resume' : 'pause')} disabled={loading} className="px-3 py-1 bg-neutral-200 dark:bg-white/10 hover:bg-blue-600 hover:text-white rounded-lg text-xs font-semibold transition flex items-center gap-1">
            {stats.isPaused ? <Play size={12} /> : <Pause size={12} />}
            {stats.isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
        <div className="bg-neutral-50 dark:bg-white/5 p-3 rounded-lg">
          <span className="text-neutral-500 block mb-0.5">Pending</span>
          <span className="text-lg font-bold text-white">{stats.pending || 0}</span>
        </div>
        <div className="bg-neutral-50 dark:bg-white/5 p-3 rounded-lg">
          <span className="text-neutral-500 block mb-0.5">Processing</span>
          <span className="text-lg font-bold text-white">{stats.processing || 0}</span>
        </div>
        <div className="bg-neutral-50 dark:bg-white/5 p-3 rounded-lg">
          <span className="text-neutral-500 block mb-0.5">Retrying (Failed)</span>
          <span className="text-lg font-bold text-white">{stats.failed || 0}</span>
        </div>
        <div className="bg-neutral-50 dark:bg-white/5 p-3 rounded-lg">
          <span className="text-neutral-500 block mb-0.5">Dead Letter (DLQ)</span>
          <span className="text-lg font-bold text-white">{stats.deadLetter || 0}</span>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap text-[11px] pt-1">
        <button onClick={() => handleAction('retry-dead')} disabled={loading || stats.deadLetter === 0} className="px-2.5 py-1.5 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white disabled:opacity-30 rounded-xl transition font-medium">
          Retry Dead Letters
        </button>
        <button onClick={() => handleAction('retry-all')} disabled={loading || stats.failed === 0} className="px-2.5 py-1.5 border border-amber-500/30 text-amber-400 hover:bg-amber-600 hover:text-white disabled:opacity-30 rounded-xl transition font-medium">
          Retry Failed
        </button>
        <button onClick={() => handleAction('cancel-pending')} disabled={loading || stats.pending === 0} className="px-2.5 py-1.5 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white disabled:opacity-30 rounded-xl transition font-medium">
          Cancel Pending
        </button>
        <button onClick={() => handleAction('purge')} disabled={loading || (stats.pending + stats.failed + stats.processing === 0)} className="px-2.5 py-1.5 bg-red-600/15 border border-red-500/20 text-red-400 hover:bg-red-600 hover:text-white disabled:opacity-30 rounded-xl transition font-medium">
          Purge Queue
        </button>
        <button onClick={() => handleAction('clear-dead')} disabled={loading || stats.deadLetter === 0} className="px-2.5 py-1.5 border border-neutral-700 text-neutral-400 hover:bg-neutral-700 rounded-xl transition font-medium">
          Clear DLQ Logs
        </button>
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

  // Responsive device width state
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');

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
        const d = await res.json();
        alert(d.error || 'Failed to save template');
      }
    } catch (err: any) {
      alert('Save failed: ' + err.message);
    }
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
    // Merge branding variables for live preview
    const brandingRes = await api('/api/v1/email/branding/variables');
    if (brandingRes.ok) {
      const brandingVars = await brandingRes.json();
      vars = { ...vars, branding: brandingVars };
    }
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
          <h3 className="text-sm font-semibold text-white">Edit Template: {editing.name}</h3>
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
            <textarea className="w-full al-input font-mono text-xs resize-y" rows={16} value={editing.htmlBody} onChange={e => setEditing({...editing, htmlBody: e.target.value})} required />
          </div>
          <div><label className="block text-neutral-400 mb-1">Plain Text (optional)</label>
            <textarea className="w-full al-input font-mono text-xs resize-y" rows={6} value={editing.plainText || ''} onChange={e => setEditing({...editing, plainText: e.target.value})} /></div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="isActive" checked={editing.isActive !== false} onChange={e => setEditing({...editing, isActive: e.target.checked})} className="rounded" />
            <label htmlFor="isActive" className="text-neutral-400">Active</label>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold"><Save size={14} className="inline mr-1" /> Save Template</button>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map(t => (
          <div key={t.id} className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-4 hover:border-neutral-600 transition">
            <div className="flex items-start justify-between mb-2">
              <div>
                <span className="text-sm font-bold text-white">{t.name}</span>
                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                  t.category === 'system' ? 'bg-blue-600/20 text-blue-400' :
                  t.category === 'transactional' ? 'bg-purple-600/20 text-purple-400' :
                  'bg-amber-600/20 text-amber-400'
                }`}>{t.category}</span>
              </div>
              <div className="flex gap-1">
                <button onClick={() => handlePreview(t)} className="p-1 text-neutral-500 hover:text-blue-455" title="Preview"><Eye size={14} /></button>
                <button onClick={() => setEditing(t)} className="p-1 text-neutral-500 hover:text-white" title="Edit"><Edit3 size={14} /></button>
              </div>
            </div>
            <p className="text-xs text-neutral-450 truncate mb-1">{t.subject}</p>
            <p className="text-[10px] text-neutral-600 truncate">{t.description || 'No description'}</p>
            {!t.isActive && <span className="inline-block mt-1 px-1.5 py-0.5 bg-red-600/20 text-red-400 rounded text-[10px]">Inactive</span>}
          </div>
        ))}
      </div>

      {/* Responsive Preview Modal */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreview(null)}>
          <div className="bg-[#1a1a1a] rounded-xl border border-white/10 max-w-4xl w-full max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
              <h3 className="text-sm font-bold text-white">Live Client Preview: {preview.name}</h3>
              
              {/* Responsive Layout Controls */}
              <div className="flex items-center gap-3 bg-neutral-900 rounded-lg p-1 text-neutral-400">
                <button onClick={() => setPreviewDevice('desktop')} className={`p-1.5 rounded transition ${previewDevice === 'desktop' ? 'bg-blue-600 text-white' : 'hover:text-white'}`} title="Desktop View"><Monitor size={14} /></button>
                <button onClick={() => setPreviewDevice('tablet')} className={`p-1.5 rounded transition ${previewDevice === 'tablet' ? 'bg-blue-600 text-white' : 'hover:text-white'}`} title="Tablet View"><TabletIcon size={14} /></button>
                <button onClick={() => setPreviewDevice('mobile')} className={`p-1.5 rounded transition ${previewDevice === 'mobile' ? 'bg-blue-600 text-white' : 'hover:text-white'}`} title="Mobile View"><Smartphone size={14} /></button>
                <div className="w-[1px] h-4 bg-neutral-800" />
                <button onClick={() => setPreviewTheme(previewTheme === 'light' ? 'dark' : 'light')} className="p-1.5 rounded hover:text-white transition" title="Toggle Reader Theme">
                  {previewTheme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
                </button>
              </div>

              <button onClick={() => setPreview(null)} className="text-neutral-500 hover:text-white"><X size={16} /></button>
            </div>
            
            <div className="p-4 space-y-4 flex-1 overflow-y-auto">
              <div className="flex gap-2 items-center text-xs">
                <span className="text-neutral-500 font-medium">Subject:</span>
                <span className="text-white font-semibold">{preview.subject}</span>
              </div>
              <div className="flex gap-2 mb-2">
                <input type="text" placeholder='Variables: {"username": "John"}' className="flex-1 al-input text-xs font-mono"
                  value={previewVars} onChange={e => setPreviewVars(e.target.value)} />
                <button onClick={() => handlePreview(templates.find(t => t.name === preview.name)!)}
                  className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-semibold"><RefreshCw size={14} className="inline mr-1" /> Reload</button>
              </div>

              {/* Centered screen container with layout width mapping */}
              <div className="flex justify-center bg-neutral-900 border border-white/5 rounded-xl p-6 overflow-x-auto min-h-[350px]">
                <div className="transition-all duration-300 shadow-xl overflow-hidden bg-white border border-neutral-200"
                  style={{
                    width: previewDevice === 'mobile' ? '375px' : previewDevice === 'tablet' ? '768px' : '100%',
                    filter: previewTheme === 'dark' ? 'invert(0.9) hue-rotate(180deg)' : 'none' // simulates reader dark mode filter
                  }}>
                  <iframe srcDoc={preview.html} className="w-full h-[400px]" title="Client Frame View" />
                </div>
              </div>
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
    if (res.ok) {
      alert('Email requeued for delivery');
      fetchLogs(page);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'sent': return 'text-emerald-400 bg-emerald-600/10 border border-emerald-500/20';
      case 'dead_letter': return 'text-rose-500 bg-rose-500/10 border border-rose-500/20';
      case 'failed': return 'text-amber-500 bg-amber-600/10 border border-amber-500/20';
      case 'pending': return 'text-blue-400 bg-blue-600/10 border border-blue-500/20';
      case 'processing': return 'text-cyan-400 bg-cyan-600/10 border border-cyan-500/20';
      default: return 'text-neutral-400 bg-neutral-600/10 border border-neutral-500/20';
    }
  };

  const formatStatus = (s: string) => {
    if (s === 'dead_letter') return 'Dead Letter';
    return s.charAt(0).toUpperCase() + s.slice(1);
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
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed (Retrying)</option>
          <option value="dead_letter">Dead Letter (DLQ)</option>
        </select>
        <button onClick={() => fetchLogs(page)} className="p-2 text-neutral-500 hover:text-white"><RefreshCw size={14} /></button>
        <span className="text-xs text-neutral-500 font-semibold">{total} logs total</span>
      </div>

      <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-400 font-semibold">
              <tr>
                <th className="p-3">Recipient</th>
                <th className="p-3">Subject</th>
                <th className="p-3">Template</th>
                <th className="p-3">Status</th>
                <th className="p-3">Retries</th>
                <th className="p-3">Sent At</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
              {loading ? (
                <tr><td colSpan={7} className="p-8 text-center text-neutral-500">Loading log records...</td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-neutral-500 font-medium">No email logs match the criteria</td></tr>
              ) : logs.map(log => (
                <tr key={log.id} className="hover:bg-neutral-800/10 transition cursor-pointer" onClick={() => setSelected(log)}>
                  <td className="p-3 font-semibold text-white">{log.to}</td>
                  <td className="p-3 max-w-[200px] truncate">{log.subject}</td>
                  <td className="p-3 text-neutral-500 font-medium">{log.templateName || '-'}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusColor(log.status)}`}>{formatStatus(log.status)}</span></td>
                  <td className="p-3 text-neutral-500">{log.retryCount}/{log.maxRetries}</td>
                  <td className="p-3 text-neutral-500">{log.sentAt ? new Date(log.sentAt).toLocaleString() : '-'}</td>
                  <td className="p-3 text-right">
                    <button onClick={(e) => { e.stopPropagation(); handleResend(log.id); }} className="p-1 text-neutral-500 hover:text-blue-400" title="Resend Email"><RotateCcw size={14} /></button>
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
          <span className="text-neutral-400 font-semibold">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="p-1.5 text-neutral-500 hover:text-white disabled:opacity-30"><ChevronRight size={14} /></button>
        </div>
      )}

      {/* Detail Modal showing SMTP connection logs / detailed trace */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <div className="bg-[#1a1a1a] rounded-xl border border-white/10 max-w-lg w-full overflow-hidden text-xs text-neutral-300" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-neutral-900">
              <h3 className="font-bold text-white">Log Record Details</h3>
              <button onClick={() => setSelected(null)} className="text-neutral-500 hover:text-white"><X size={16} /></button>
            </div>
            
            <div className="p-4 space-y-3 overflow-y-auto max-h-[75vh]">
              <div className="grid grid-cols-2 gap-2 border-b border-white/5 pb-2">
                <div><span className="text-neutral-500 block">Recipient</span><span className="text-white font-bold">{selected.to}</span></div>
                <div><span className="text-neutral-500 block">Status</span><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusColor(selected.status)}`}>{formatStatus(selected.status)}</span></div>
              </div>
              <div><span className="text-neutral-500 block">Subject</span><span className="text-white font-medium">{selected.subject}</span></div>
              {selected.templateName && <div><span className="text-neutral-500 block">Template Name</span><span className="text-white font-medium">{selected.templateName}</span></div>}
              
              {/* Detailed connection statistics metadata */}
              {selected.metadata && (() => {
                try {
                  const meta = JSON.parse(selected.metadata);
                  return (
                    <div className="bg-neutral-900 rounded-xl p-3 border border-white/5 space-y-2">
                      <h4 className="font-bold text-white text-[11px] border-b border-white/5 pb-1">SMTP Transaction Metrics</h4>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div><span className="text-neutral-500">IP Used:</span> <span className="text-white font-mono">{meta.ipUsed || '-'}</span></div>
                        <div><span className="text-neutral-500">TLS Version:</span> <span className="text-white font-mono">{meta.tlsVersion || '-'}</span></div>
                        <div><span className="text-neutral-500">SMTP Response:</span> <span className="text-emerald-400 font-mono">{meta.smtpResponse || '-'}</span></div>
                        <div><span className="text-neutral-500">Attempts Count:</span> <span className="text-white">{selected.retryCount}</span></div>
                        <div><span className="text-neutral-500">Connection Time:</span> <span className="text-white">{meta.connectionTimeMs || 0}ms</span></div>
                        <div><span className="text-neutral-500">Auth Time:</span> <span className="text-white">{meta.authTimeMs || 0}ms</span></div>
                        <div><span className="text-neutral-500">Transmission Latency:</span> <span className="text-white">{meta.sendTimeMs || 0}ms</span></div>
                        <div><span className="text-neutral-500">Total Delay:</span> <span className="text-white">{meta.elapsedTimeMs || 0}ms</span></div>
                      </div>
                    </div>
                  );
                } catch { return null; }
              })()}

              {selected.error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-xl space-y-1">
                  <span className="font-bold block">Error Trace:</span>
                  <p className="font-mono text-[10px] whitespace-pre-wrap">{selected.error}</p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => { handleResend(selected.id); setSelected(null); }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold flex items-center gap-1 transition">
                  <RotateCcw size={12} /> Re-queue Delivery
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
  const client = data?.clientBreakdown || { gmail: 0, outlook: 0, yahoo: 0, others: 0 };

  return (
    <div className="space-y-6 text-xs text-neutral-300">
      <div className="flex items-center gap-3">
        <select className="al-input text-xs w-auto" value={days} onChange={e => setDays(parseInt(e.target.value))}>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button onClick={() => fetchAnalytics(days)} className="p-1.5 text-neutral-500 hover:text-white"><RefreshCw size={14} /></button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Delivered (Sent)', value: summary.totalSent, icon: <Check size={16} />, color: 'text-emerald-400' },
          { label: 'Transient Failures', value: summary.totalFailed, icon: <AlertTriangle size={16} />, color: 'text-amber-400' },
          { label: 'Dead Letters (DLQ)', value: summary.totalDeadLetter, icon: <AlertTriangle size={16} />, color: 'text-rose-500' },
          { label: 'Delivery Success Rate', value: `${(summary.deliveryRate || 0).toFixed(1)}%`, icon: <Activity size={16} />, color: 'text-blue-400' },
          { label: 'Avg Transmission', value: `${summary.averageSendTimeMs || 0}ms`, icon: <Zap size={16} />, color: 'text-yellow-400' },
          { label: 'Total Queue Retries', value: summary.totalRetries || 0, icon: <Clock size={16} />, color: 'text-neutral-400' },
        ].map(card => (
          <div key={card.label} className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">{card.label}</span>
              <span className={card.color}>{card.icon}</span>
            </div>
            <p className="text-lg font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Grid for charts / breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Daily Stats Chart (2 cols) */}
        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5 shadow-sm lg:col-span-2">
          <h3 className="text-sm font-bold text-white mb-4">Delivery History Bar</h3>
          {dailyStats.length > 0 ? (
            <div className="space-y-1.5">
              {dailyStats.slice(-10).map((d: any) => {
                const max = Math.max(...dailyStats.map((x: any) => x.sent + x.failed + x.deadLetter), 1);
                const total = d.sent + d.failed + d.deadLetter;
                const sentPct = (d.sent / max) * 100;
                const failedPct = (d.failed / max) * 100;
                const dlqPct = (d.deadLetter / max) * 100;

                return (
                  <div key={d.date} className="flex items-center gap-3">
                    <span className="w-20 text-neutral-500 font-semibold shrink-0">{d.date}</span>
                    <div className="flex-1 h-5 bg-neutral-800 rounded overflow-hidden flex">
                      {d.sent > 0 && <div className="h-full bg-emerald-500 transition-all" style={{ width: `${sentPct}%` }} title={`Sent: ${d.sent}`} />}
                      {d.failed > 0 && <div className="h-full bg-amber-500 transition-all" style={{ width: `${failedPct}%` }} title={`Failed: ${d.failed}`} />}
                      {d.deadLetter > 0 && <div className="h-full bg-rose-600 transition-all" style={{ width: `${dlqPct}%` }} title={`DLQ: ${d.deadLetter}`} />}
                    </div>
                    <span className="w-16 text-right text-neutral-500 font-bold shrink-0">{total}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center text-neutral-500">No delivery logs recorded for this period</div>
          )}
        </div>

        {/* Client domains breakdown */}
        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-white">Client Domain Breakdown</h3>
          <div className="space-y-3">
            {[
              { label: 'Google Workspace (Gmail)', percent: client.gmail, color: 'bg-emerald-500' },
              { label: 'Microsoft 365 (Outlook)', percent: client.outlook, color: 'bg-blue-500' },
              { label: 'Yahoo Mail', percent: client.yahoo, color: 'bg-purple-500' },
              { label: 'Others / Custom Domains', percent: client.others, color: 'bg-neutral-600' }
            ].map(item => (
              <div key={item.label} className="space-y-1">
                <div className="flex justify-between text-[11px] font-semibold text-neutral-300">
                  <span>{item.label}</span>
                  <span>{item.percent}%</span>
                </div>
                <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                  <div className={`h-full ${item.color}`} style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Template Stats and Top Domains */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-white mb-4">Top templates sent</h3>
          {data?.templateStats?.length > 0 ? (
            <div className="space-y-2">
              {data.templateStats.map((t: any) => (
                <div key={t.template} className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-neutral-300 font-semibold">{t.template}</span>
                  <span className="text-neutral-500">{t.count} emails delivered</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 text-center py-6">No template statistics gathered.</p>
          )}
        </div>

        <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5 shadow-sm">
          <h3 className="text-sm font-bold text-white mb-4">Top Destination Domains</h3>
          {data?.topDomains?.length > 0 ? (
            <div className="space-y-2">
              {data.topDomains.map((r: any) => (
                <div key={r.domain} className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-neutral-300 font-semibold font-mono">{r.domain}</span>
                  <span className="text-neutral-500">{r.count} emails delivered</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 text-center py-6">No destination domain records found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Branding Section (Unchanged placeholder representation)
// ============================================================

function BrandingSection() {
  const [branding, setBranding] = useState<any>({
    panelName: '', logoUrl: '', faviconUrl: '', primaryColor: '#2563eb', secondaryColor: '#6b7280', borderRadius: '8px'
  });
  const [loading, setLoading] = useState(true);

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
    const res = await api('/api/v1/email/branding', {
      method: 'PUT',
      body: JSON.stringify(branding)
    });
    if (res.ok) alert('Branding settings updated!');
  };

  if (loading) return <div className="p-12 text-center text-neutral-500 text-xs">Loading branding...</div>;

  return (
    <div className="bg-white dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/5 p-5 shadow-sm max-w-2xl">
      <h3 className="text-sm font-bold text-white mb-4">Email White-Label Branding System</h3>
      <form onSubmit={handleSave} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="block text-neutral-400 mb-1">Panel Name</label>
            <input type="text" className="w-full al-input" value={branding.panelName || ''} onChange={e => setBranding({...branding, panelName: e.target.value})} /></div>
          <div><label className="block text-neutral-400 mb-1">Support Email</label>
            <input type="email" className="w-full al-input" value={branding.supportEmail || ''} onChange={e => setBranding({...branding, supportEmail: e.target.value})} /></div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div><label className="block text-neutral-400 mb-1">Primary Color</label>
            <input type="color" className="w-full h-8 bg-neutral-900 border border-neutral-700 rounded p-1" value={branding.primaryColor || '#2563eb'} onChange={e => setBranding({...branding, primaryColor: e.target.value})} /></div>
          <div><label className="block text-neutral-400 mb-1">Secondary Color</label>
            <input type="color" className="w-full h-8 bg-neutral-900 border border-neutral-700 rounded p-1" value={branding.secondaryColor || '#6b7280'} onChange={e => setBranding({...branding, secondaryColor: e.target.value})} /></div>
          <div><label className="block text-neutral-400 mb-1">Border Radius</label>
            <input type="text" className="w-full al-input" value={branding.borderRadius || '8px'} onChange={e => setBranding({...branding, borderRadius: e.target.value})} /></div>
        </div>
        <div><label className="block text-neutral-400 mb-1">Copyright Footer Text</label>
          <input type="text" className="w-full al-input" value={branding.copyrightText || ''} onChange={e => setBranding({...branding, copyrightText: e.target.value})} /></div>
        
        <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition flex items-center gap-1">
          <Save size={14} /> Save Branding Settings
        </button>
      </form>
    </div>
  );
}

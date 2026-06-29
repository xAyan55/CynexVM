import React, { useState, useEffect } from 'react';
import { RefreshCw, Search } from 'lucide-react';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('');
  
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchLogs();
  }, [page, severity]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('accessToken');
      const query = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        search,
        severity
      });

      const res = await fetch(`/api/v1/audit-logs?${query.toString()}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalPages(data.pagination.totalPages);
      }
    } catch (_) {}
    setLoading(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-wide">Audit Logs</h1>
          <p className="text-xs text-gray-400">Security event streams and system operations logs.</p>
        </div>
        <button 
          onClick={fetchLogs}
          className="p-2 text-gray-400 hover:text-white bg-white/5 border border-borderSubtle rounded-btn transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Filter and search bar */}
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-3 items-end text-xs max-w-2xl">
        <div className="flex-1 relative min-w-[200px]">
          <Search className="absolute left-3 top-3 text-gray-500" size={14} />
          <input 
            type="text" placeholder="Search by username, action or details..."
            className="w-full al-input pl-9"
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div>
          <select 
            className="al-input"
            value={severity} onChange={e => setSeverity(e.target.value)}
          >
            <option value="">All Severities</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
        </div>
        <button type="submit" className="al-btn al-btn-primary px-4 py-2">
          Search
        </button>
      </form>

      {/* Audit table */}
      <div className="al-card overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 text-sm">Loading security logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-500 text-xs">No audit logs found.</div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-white/5 border-b border-borderSubtle text-gray-400">
                <th className="p-3">Timestamp</th>
                <th className="p-3">Action</th>
                <th className="p-3">Severity</th>
                <th className="p-3">Account</th>
                <th className="p-3">IP Address</th>
                <th className="p-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borderSubtle font-mono text-gray-300">
              {logs.map(log => (
                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                  <td className="p-3 text-[10px] text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3 font-semibold text-blue-400">{log.action}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${
                      log.severity === 'critical' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                      log.severity === 'warning' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                      'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                    }`}>{log.severity}</span>
                  </td>
                  <td className="p-3 text-gray-400 font-sans">{log.username}</td>
                  <td className="p-3 text-gray-500">{log.ipAddress || 'system'}</td>
                  <td className="p-3 text-gray-400 font-sans truncate max-w-xs" title={log.details}>
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination control */}
      {totalPages > 1 && (
        <div className="flex justify-end gap-2 text-xs">
          <button 
            disabled={page === 1} onClick={() => setPage(page - 1)}
            className="al-btn al-btn-secondary"
          >
            Prev
          </button>
          <span className="px-3 py-2 text-gray-500">Page {page} of {totalPages}</span>
          <button 
            disabled={page === totalPages} onClick={() => setPage(page + 1)}
            className="al-btn al-btn-secondary"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};
export default AuditLogs;

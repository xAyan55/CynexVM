import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, Download, Eye, EyeOff, Search } from 'lucide-react';

interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  sortable?: boolean;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchField?: keyof T;
  bulkActions?: {
    label: string;
    action: (selectedItems: T[]) => void;
  }[];
}

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  searchPlaceholder = 'Search...',
  searchField,
  bulkActions
}: DataTableProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof T | null; direction: 'asc' | 'desc' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(10);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(columns.map(c => c.header))
  );
  const [showColDropdown, setShowColDropdown] = useState(false);

  // Filter
  const filteredData = useMemo(() => {
    if (!searchQuery || !searchField) return data;
    return data.filter(row => {
      const val = row[searchField];
      if (val === null || val === undefined) return false;
      return String(val).toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [data, searchQuery, searchField]);

  // Sort
  const sortedData = useMemo(() => {
    if (!sortConfig || !sortConfig.key) return filteredData;
    const sorted = [...filteredData];
    sorted.sort((a, b) => {
      const aVal = a[sortConfig.key!];
      const bVal = b[sortConfig.key!];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredData, sortConfig]);

  // Paginate
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  const handleSort = (key: keyof T) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const ids = new Set<string | number>(paginatedData.map(d => d.id));
      setSelectedIds(ids);
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectItem = (id: string | number, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    setSelectedIds(next);
  };

  const handleExportCSV = () => {
    if (sortedData.length === 0) return;
    const headers = columns.map(c => c.header).join(',');
    const rows = sortedData.map(row => 
      columns.map(c => {
        if (typeof c.accessor === 'function') {
          return '';
        }
        return `"${String(row[c.accessor] || '')}"`;
      }).join(',')
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "exported_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const selectedItems = useMemo(() => {
    return data.filter(d => selectedIds.has(d.id));
  }, [data, selectedIds]);

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {searchField && (
          <div className="relative text-xs">
            <Search className="absolute left-3 top-3 text-neutral-500" size={14} />
            <input 
              type="text" 
              placeholder={searchPlaceholder} 
              className="al-input pl-9 w-64"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
            />
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          {/* Column selector */}
          <div className="relative">
            <button 
              type="button" 
              onClick={() => setShowColDropdown(!showColDropdown)}
              className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition"
            >
              Columns
            </button>
            {showColDropdown && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1a1a1a] border border-neutral-800 rounded-xl p-2 shadow-lg z-50 space-y-1">
                {columns.map(c => {
                  const visible = visibleColumns.has(c.header);
                  return (
                    <label key={c.header} className="flex items-center gap-2 p-1.5 hover:bg-white/5 rounded cursor-pointer text-white">
                      <input 
                        type="checkbox" 
                        checked={visible} 
                        onChange={() => {
                          const next = new Set(visibleColumns);
                          if (visible) next.delete(c.header);
                          else next.add(c.header);
                          setVisibleColumns(next);
                        }}
                      />
                      <span>{c.header}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <button 
            type="button" 
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 dark:border-neutral-700 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-600 dark:text-neutral-300 transition"
          >
            <Download size={14} /> Export CSV
          </button>

          {/* Bulk actions */}
          {bulkActions && selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-neutral-500">{selectedIds.size} selected</span>
              {bulkActions.map(action => (
                <button
                  key={action.label}
                  onClick={() => action.action(selectedItems)}
                  className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto shadow-sm rounded-xl border border-neutral-200 dark:border-neutral-800/40 bg-white dark:bg-neutral-800/20">
        <table className="min-w-full divide-y divide-neutral-200 dark:divide-white/10 text-xs">
          <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-800 dark:text-white">
            <tr>
              {bulkActions && (
                <th className="p-3 text-left w-10">
                  <input 
                    type="checkbox" 
                    onChange={handleSelectAll} 
                    checked={paginatedData.length > 0 && paginatedData.every(d => selectedIds.has(d.id))} 
                  />
                </th>
              )}
              {columns.map(c => {
                if (!visibleColumns.has(c.header)) return null;
                return (
                  <th 
                    key={c.header} 
                    className="p-3 text-left font-medium select-none cursor-pointer"
                    onClick={() => c.sortable && typeof c.accessor !== 'function' && handleSort(c.accessor as keyof T)}
                  >
                    <div className="flex items-center gap-1.5">
                      {c.header}
                      {c.sortable && typeof c.accessor !== 'function' && (
                        sortConfig && sortConfig.key === c.accessor ? (
                          sortConfig.direction === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
                        ) : (
                          <ChevronDown size={12} className="opacity-30" />
                        )
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/5 text-neutral-600 dark:text-neutral-400">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (bulkActions ? 1 : 0)} className="p-8 text-center text-neutral-500">
                  No records matching options
                </td>
              </tr>
            ) : (
              paginatedData.map((row) => (
                <tr key={row.id} className="hover:bg-neutral-50 dark:hover:bg-white/[0.05] transition-colors">
                  {bulkActions && (
                    <td className="p-3">
                      <input 
                        type="checkbox" 
                        checked={selectedIds.has(row.id)}
                        onChange={(e) => handleSelectItem(row.id, e.target.checked)}
                      />
                    </td>
                  )}
                  {columns.map(c => {
                    if (!visibleColumns.has(c.header)) return null;
                    return (
                      <td key={c.header} className="p-3 font-medium text-neutral-800 dark:text-white">
                        {typeof c.accessor === 'function' ? (
                          c.accessor(row)
                        ) : (
                          String(row[c.accessor] || '')
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-end gap-2 text-xs">
          <button 
            disabled={currentPage === 1} 
            onClick={() => setCurrentPage(currentPage - 1)}
            className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10 text-neutral-700 dark:text-gray-300 rounded-xl transition disabled:opacity-50"
          >
            Prev
          </button>
          <span className="px-3 py-1.5 text-neutral-500">Page {currentPage} of {totalPages}</span>
          <button 
            disabled={currentPage === totalPages} 
            onClick={() => setCurrentPage(currentPage + 1)}
            className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-white/5 dark:hover:bg-white/10 text-neutral-700 dark:text-gray-300 rounded-xl transition disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

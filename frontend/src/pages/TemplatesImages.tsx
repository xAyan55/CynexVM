import React, { useState } from 'react';
import { Upload, HardDrive, Trash2 } from 'lucide-react';

export const TemplatesImages: React.FC = () => {
  const [templates, setTemplates] = useState([
    { id: '1', name: 'ubuntu-22.04-standard_22.04-1_amd64.tar.zst', size: '124 MB', type: 'LXC Template', storage: 'local' },
    { id: '2', name: 'debian-12-standard_12.2-1_amd64.tar.zst', size: '118 MB', type: 'LXC Template', storage: 'local' },
    { id: '3', name: 'alpine-3.19-default_20231215_amd64.tar.gz', size: '3.8 MB', type: 'LXC Template', storage: 'local' }
  ]);

  const [uploading, setUploading] = useState(false);

  const handleUpload = () => {
    setUploading(true);
    setTimeout(() => {
      setUploading(false);
      setTemplates([...templates, {
        id: Math.random().toString(),
        name: 'ubuntu-24.04-minimal_amd64.tar.zst',
        size: '142 MB',
        type: 'LXC Template',
        storage: 'local'
      }]);
    }, 1500);
  };

  return (
    <div className="space-y-6">
      <div className="px-8 pt-5">
        <h1 className="text-base font-medium text-neutral-800 dark:text-white">OS Templates & Images</h1>
        <p className="mt-0.5 text-sm text-neutral-500">Manage hypervisor LXC templates and distribution images.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mx-8">
        {/* Upload card */}
        <div className="bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">Upload OS Template</h3>
          <p className="text-xs text-neutral-500 leading-relaxed">
            Drag and drop or select an LXC bootstrap template file (.tar.zst, .tar.gz) to transfer to Proxmox local storages.
          </p>
          <div className="border border-dashed border-neutral-700 rounded-xl p-8 text-center cursor-pointer hover:bg-white/5 transition">
            <Upload className="mx-auto text-neutral-500 mb-2" size={24} />
            <span className="text-xs text-neutral-400">Click to select files</span>
          </div>
          <button 
            type="button" 
            onClick={handleUpload}
            disabled={uploading}
            className="w-full al-btn al-btn-primary"
          >
            {uploading ? 'Uploading...' : 'Upload Template'}
          </button>
        </div>

        {/* Templates registry list */}
        <div className="lg:col-span-2 bg-white dark:bg-white/5 rounded-xl p-6 border border-neutral-300 dark:border-neutral-800/20 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <HardDrive size={18} /> OS Registry Files
          </h3>

          <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-800/50 text-neutral-800 dark:text-white">
                <tr>
                  <th className="p-3">Filename</th>
                  <th className="p-3">Volume Storage</th>
                  <th className="p-3">Capacity Size</th>
                  <th className="p-3 text-right">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800 text-neutral-300">
                {templates.map(t => (
                  <tr key={t.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-3 font-mono text-neutral-900 dark:text-white">{t.name}</td>
                    <td className="p-3 uppercase font-medium">{t.storage}</td>
                    <td className="p-3 text-neutral-400">{t.size}</td>
                    <td className="p-3 text-right">
                      <button 
                        onClick={() => setTemplates(templates.filter(x => x.id !== t.id))}
                        className="text-red-500 hover:text-red-400"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
export default TemplatesImages;

import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useSocket } from '../context/SocketContext';
import { Play, Square, RotateCcw, Skull } from 'lucide-react';

interface ConsoleProps {
  instanceId: string;
  status: string;
  onPowerAction: (action: string) => Promise<void>;
  actionLoading?: string | null;
}

export const Console: React.FC<ConsoleProps> = ({ instanceId, status, onPowerAction, actionLoading }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const socket = useSocket();
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);

  // Initialize terminal and auto-connect
  useEffect(() => {
    if (!terminalRef.current || !socket) return;

    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#09090B',
        foreground: '#F3F4F6',
        cursor: '#3B82F6',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
      },
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      fontSize: 14,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Auto-connect via lxc exec (no credentials needed)
    if (!connectedRef.current) {
      connectedRef.current = true;
      socket.emit('terminal.init', { instanceId });
    }

    // Listen for terminal output
    const handleData = (data: string) => {
      term.write(data);
    };
    const handleLog = (log: string) => {
      term.write(log);
    };

    socket.on('terminal.data', handleData);
    socket.on('terminal.log', handleLog);

    // Relay keystrokes to backend
    term.onData((data) => {
      socket.emit('terminal.input', data);
    });

    term.onResize((size) => {
      socket.emit('terminal.resize', size);
    });

    // Handle terminal resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (_) {}
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      socket.off('terminal.data', handleData);
      socket.off('terminal.log', handleLog);
      term.dispose();
      resizeObserver.disconnect();
      connectedRef.current = false;
    };
  }, [socket, instanceId]);

  return (
    <div className="space-y-4">
      {/* Power Control Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-secondaryBg/20 border border-borderSubtle rounded-btn">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">State:</span>
          <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
            status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
            status === 'stopped' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>{status}</span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => onPowerAction('start')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-btn text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={status === 'running' || actionLoading === 'start'}
          >
            <Play size={14} /> {actionLoading === 'start' ? 'Starting...' : 'Start'}
          </button>
          <button 
            onClick={() => onPowerAction('stop')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-btn text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={status === 'stopped' || actionLoading === 'stop'}
          >
            <Square size={14} /> {actionLoading === 'stop' ? 'Stopping...' : 'Stop'}
          </button>
          <button 
            onClick={() => onPowerAction('reboot')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-btn text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={status !== 'running' || actionLoading === 'reboot'}
          >
            <RotateCcw size={14} /> {actionLoading === 'reboot' ? 'Rebooting...' : 'Reboot'}
          </button>
          <button 
            onClick={() => onPowerAction('kill')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-800 hover:bg-rose-900 text-white rounded-btn text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            disabled={status === 'stopped' || actionLoading === 'kill'}
          >
            <Skull size={14} /> {actionLoading === 'kill' ? 'Killing...' : 'Kill'}
          </button>
        </div>
      </div>

      {/* Terminal Viewport - always visible, auto-connected */}
      <div className="al-card p-2 bg-[#09090B]">
        <div ref={terminalRef} className="h-96 min-h-[380px]" />
      </div>
    </div>
  );
};
export default Console;

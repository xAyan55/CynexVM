import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useSocket } from '../context/SocketContext';
import { Play, Square, RotateCcw } from 'lucide-react';

interface ConsoleProps {
  instanceId: string;
  status: string;
  onPowerAction: (action: string) => void;
}

export const Console: React.FC<ConsoleProps> = ({ instanceId, status, onPowerAction }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const socket = useSocket();
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [credentials, setCredentials] = useState({ host: '', username: 'root', password: '' });
  const [connected, setConnected] = useState(false);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      theme: {
        background: '#09090B',
        foreground: '#F3F4F6',
        cursor: '#3B82F6',
        selectionBackground: 'rgba(59, 130, 246, 0.3)',
      },
      fontFamily: 'ui-monospace, monospace',
      fontSize: 14,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.write('CynexVM SSH Terminal Interface\r\nConfigure credentials and click Connect.\r\n');

    // Handle terminal resize observer
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch (_) {}
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      term.dispose();
      resizeObserver.disconnect();
    };
  }, []);

  // Listen to socket connections
  useEffect(() => {
    if (!socket || !xtermRef.current) return;

    const term = xtermRef.current;

    const handleData = (data: string) => {
      term.write(data);
    };

    const handleLog = (log: string) => {
      term.write(log);
    };

    socket.on('terminal.data', handleData);
    socket.on('terminal.log', handleLog);

    // Pipe keyboard keystrokes to websocket
    term.onData((data) => {
      if (connected) {
        socket.emit('terminal.input', data);
      }
    });

    // Resize notifications
    term.onResize((size) => {
      if (connected) {
        socket.emit('terminal.resize', size);
      }
    });

    return () => {
      socket.off('terminal.data', handleData);
      socket.off('terminal.log', handleLog);
    };
  }, [socket, connected]);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket) return;
    setConnected(true);
    socket.emit('terminal.init', {
      instanceId,
      host: credentials.host || undefined,
      username: credentials.username,
      password: credentials.password || undefined
    });
  };

  return (
    <div className="space-y-4">
      {/* Power Control Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-white/5 border border-borderSubtle rounded-btn">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">VM State:</span>
          <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${
            status === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
            status === 'stopped' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
            'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>{status}</span>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => onPowerAction('start')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-btn text-xs font-medium transition-all hover:scale-[1.02]"
            disabled={status === 'running'}
          >
            <Play size={14} /> Start
          </button>
          <button 
            onClick={() => onPowerAction('stop')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-btn text-xs font-medium transition-all hover:scale-[1.02]"
            disabled={status === 'stopped'}
          >
            <Square size={14} /> Stop
          </button>
          <button 
            onClick={() => onPowerAction('reboot')} 
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-btn text-xs font-medium transition-all hover:scale-[1.02]"
            disabled={status !== 'running'}
          >
            <RotateCcw size={14} /> Reboot
          </button>
        </div>
      </div>

      {/* Connection Credentials Form */}
      {!connected && (
        <form onSubmit={handleConnect} className="glass-panel p-4 rounded-btn border border-borderSubtle space-y-4 max-w-md mx-auto">
          <h3 className="text-sm font-semibold text-white">Establish SSH Console session</h3>
          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-gray-400 block mb-1">Target Host IP (optional, overrides default)</label>
              <input 
                type="text" 
                placeholder="10.0.0.x" 
                className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none"
                value={credentials.host}
                onChange={e => setCredentials({...credentials, host: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Username</label>
                <input 
                  type="text" 
                  className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none"
                  value={credentials.username}
                  onChange={e => setCredentials({...credentials, username: e.target.value})}
                  required
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-400 block mb-1">Password</label>
                <input 
                  type="password" 
                  className="w-full bg-white/5 border border-borderSubtle rounded-btn px-3 py-2 text-xs text-white focus:border-blue-600 focus:outline-none"
                  value={credentials.password}
                  onChange={e => setCredentials({...credentials, password: e.target.value})}
                />
              </div>
            </div>
          </div>
          <button type="submit" className="w-full glass-button-primary py-2 text-xs text-white font-semibold">
            Connect Console
          </button>
        </form>
      )}

      {/* Terminal Viewport */}
      <div className={`glass-panel p-2 rounded-card border border-borderSubtle bg-[#09090B] ${connected ? 'block' : 'hidden'}`}>
        <div ref={terminalRef} className="h-96 min-h-[380px]" />
      </div>
    </div>
  );
};
export default Console;

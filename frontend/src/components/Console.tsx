import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import 'xterm/css/xterm.css';
import { useSocket } from '../context/SocketContext';

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
      convertEol: true,
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

    // Auto-connect via lxc exec passing the accessToken
    if (!connectedRef.current) {
      connectedRef.current = true;
      const token = localStorage.getItem('accessToken') || undefined;
      socket.emit('terminal.init', { instanceId, token });
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
    <div className="al-card p-2 bg-[#09090B]">
      <div ref={terminalRef} className="h-[500px] min-h-[500px]" />
    </div>
  );
};
export default Console;

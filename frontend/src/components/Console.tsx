import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebglAddon } from 'xterm-addon-webgl';
import { SearchAddon } from 'xterm-addon-search';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { Unicode11Addon } from 'xterm-addon-unicode11';
import { SerializeAddon } from 'xterm-addon-serialize';
import 'xterm/css/xterm.css';
import { useSocket } from '../context/SocketContext';
import {
  Maximize2, Minimize2,
  Download, Search as SearchIcon, X, RefreshCw,
  Terminal as TerminalIcon, Plus, AlertCircle, Wifi, WifiOff,
  Clock, Copy, Check,
} from 'lucide-react';

interface TermInstance {
  term: Terminal;
  fitAddon: FitAddon;
  searchAddon: SearchAddon;
  sessionId?: string;
  containerName?: string;
  dataUnsub?: () => void;
  resizeUnsub?: () => void;
}

interface TabInfo {
  id: string;
  label: string;
  containerName?: string;
}

// ─── Terminal CSS normalization ──────────────────────────────────────────────
// Only prevents external spacing inheritance. Does NOT override xterm's
// own inline row heights (controlled by lineHeight: 1.0 in Terminal options).
const TERMINAL_CSS = `
  .xterm { height: 100%; }
  .xterm-rows { letter-spacing: 0 !important; }
  .xterm-rows > div { padding: 0 !important; margin: 0 !important; }
  .xterm-rows span { padding: 0 !important; margin: 0 !important; vertical-align: baseline !important; }
`;
const styleSheet = document.createElement('style');
styleSheet.textContent = TERMINAL_CSS;
document.head.appendChild(styleSheet);

const fitAll = (insts: Map<string, TermInstance>) => {
  requestAnimationFrame(() => {
    insts.forEach(inst => {
      try { inst.fitAddon.fit(); } catch (_) {}
    });
  });
};

interface ConsoleProps {
  instanceId: string;
  status: string;
  onPowerAction: (action: string) => Promise<void>;
  actionLoading?: string | null;
}

const TERM_THEME = {
  background: '#0a0a0b',
  foreground: '#e4e4e7',
  cursor: '#a1a1aa',
  cursorAccent: '#0a0a0b',
  selectionBackground: '#3b82f680',
  selectionForeground: '#ffffff',
  black: '#18181b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#eab308',
  blue: '#3b82f6',
  magenta: '#a855f7',
  cyan: '#06b6d4',
  white: '#e4e4e7',
  brightBlack: '#52525b',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#fafafa',
};

const getToken = () => localStorage.getItem('accessToken');

export const Console: React.FC<ConsoleProps> = ({ instanceId, status, onPowerAction, actionLoading }) => {
  const socket = useSocket();

  const [tabs, setTabs] = useState<TabInfo[]>([{ id: 'main', label: 'Terminal 1' }]);
  const [activeTab, setActiveTab] = useState('main');
  const activeTabRef = useRef(activeTab);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  const terminalRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const xtermInstances = useRef<Map<string, TermInstance>>(new Map());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchRegex, setSearchRegex] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [latency, setLatency] = useState(0);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [copied, setCopied] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fullscreenRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<HTMLDivElement>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tabCountRef = useRef(1);
  const pendingSessionsRef = useRef(new Map<string, string>());

  const getActiveTerminal = useCallback(() => {
    return xtermInstances.current.get(activeTabRef.current);
  }, []);

  const getTerminalBySessionId = useCallback((sessionId: string) => {
    for (const [tid, inst] of xtermInstances.current) {
      if (inst.sessionId === sessionId) return { tabId: tid, inst };
    }
    return null;
  }, []);

  const connectSession = useCallback((tabId: string) => {
    if (!socket) return;
    const inst = xtermInstances.current.get(tabId);
    if (!inst) return;
    const token = getToken();
    socket.emit('terminal.create', {
      instanceId,
      token,
      cols: inst.term.cols,
      rows: inst.term.rows,
    });
  }, [socket, instanceId]);

  const reconnectAllSessions = useCallback(() => {
    if (!socket) return;
    // Query backend for existing sessions. The onSessions handler
    // will either reconnect to existing sessions or create fresh ones.
    socket.emit('terminal.sessions');
  }, [socket]);

  const createTerminal = useCallback((tabId: string, container: HTMLDivElement) => {
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      convertEol: true,
      allowTransparency: true,
      theme: TERM_THEME,
      fontFamily: '"JetBrains Mono", "Geist Mono", "IBM Plex Mono", monospace',
      fontSize: 14,
      lineHeight: 1.0,
      letterSpacing: 0,
      scrollback: 100000,
      allowProposedApi: true,
      drawBoldTextInBrightColors: false,
      minimumContrastRatio: 1,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);

    try { term.loadAddon(new Unicode11Addon()); } catch (_) {}

    term.open(container);
    // Fit after DPI-aware open
    requestAnimationFrame(() => { fitAddon.fit(); });

    // WebGL with proper recovery
    let webgl: WebglAddon | null = null;
    const tryWebgl = () => {
      try {
        webgl = new WebglAddon();
        term.loadAddon(webgl);
        webgl.onContextLoss(() => {
          webgl?.dispose();
          webgl = null;
          // Retry WebGL after a delay
          setTimeout(tryWebgl, 3000);
        });
      } catch (_) {
        // Canvas fallback (already active)
      }
    };
    tryWebgl();

    const inst: TermInstance = { term, fitAddon, searchAddon };
    xtermInstances.current.set(tabId, inst);

    // Wire input and resize to socket
    const dataSub = term.onData((data: string) => {
      const i = xtermInstances.current.get(tabId);
      if (i?.sessionId && socket) {
        socket.emit('terminal.input', { sessionId: i.sessionId, data });
      }
    });
    const resizeSub = term.onResize((size) => {
      const i = xtermInstances.current.get(tabId);
      if (i?.sessionId && socket) {
        socket.emit('terminal.resize', { sessionId: i.sessionId, cols: size.cols, rows: size.rows });
      }
    });
    inst.dataUnsub = () => { dataSub.dispose(); };
    inst.resizeUnsub = () => { resizeSub.dispose(); };

    return inst;
  }, [socket]);

  // ─── Init: create main terminal and register socket handlers ───
  useEffect(() => {
    if (!socket) return;

    const mainContainer = terminalRefs.current.get('main');
    if (!mainContainer) return;

    // Create terminal only if not already created (handles strict mode double-run)
    if (!xtermInstances.current.has('main')) {
      createTerminal('main', mainContainer);
    }

    // Register ALL socket event handlers
    const onReady = (data: { sessionId: string; containerName?: string }) => {
      const pendingTabId = pendingSessionsRef.current.get(data.sessionId);
      const targetTabId = pendingTabId || activeTabRef.current;
      pendingSessionsRef.current.delete(data.sessionId);

      const inst = xtermInstances.current.get(targetTabId);
      if (inst) {
        inst.sessionId = data.sessionId;
        inst.containerName = data.containerName;
        setTabs(prev => prev.map(t =>
          t.id === targetTabId ? { ...t, containerName: data.containerName } : t
        ));
        inst.term.focus();
      }
      setIsConnected(true);
      setIsReconnecting(false);
      setConnectionError(null);
    };

    const onData = (data: { sessionId: string; data: string }) => {
      const match = getTerminalBySessionId(data.sessionId);
      if (match) match.inst.term.write(data.data);
    };

    const onError = (data: { message: string }) => {
      setConnectionError(data.message);
      setIsConnected(false);
    };

    const onExit = (data: { sessionId: string; exitCode: number }) => {
      const match = getTerminalBySessionId(data.sessionId);
      if (match) {
        match.inst.term.write(`\r\n\x1b[90m[Session ended with exit code ${data.exitCode}]\x1b[0m\r\n`);
      }
    };

    const onWarn = (data: { sessionId: string; message: string }) => {
      const match = getTerminalBySessionId(data.sessionId);
      if (match) {
        match.inst.term.write(`\r\n\x1b[33m${data.message}\x1b[0m\r\n`);
      }
    };

    const onSessions = (sessions: Array<{ id: string; instanceId: string; containerName?: string }>) => {
      // If we have existing sessions on the backend, try to reconnect each tab
      if (sessions.length > 0) {
        const usedSessionIds = new Set<string>();
        for (const [tabId, inst] of xtermInstances.current) {
          // Find a session for this tab that hasn't been taken
          const match = sessions.find(s =>
            s.instanceId === instanceId && !usedSessionIds.has(s.id)
          );
          if (match) {
            usedSessionIds.add(match.id);
            pendingSessionsRef.current.set(match.id, tabId);
            socket.emit('terminal.reconnect', { sessionId: match.id });
          } else if (!inst.sessionId) {
            // No matching backend session, create fresh
            connectSession(tabId);
          }
        }
      } else {
        // No existing sessions, create fresh ones for all tabs
        for (const [tabId, inst] of xtermInstances.current) {
          if (!inst.sessionId) connectSession(tabId);
        }
      }
    };

    const onDisconnect = () => {
      setIsConnected(false);
      setIsReconnecting(true);
    };

    const onConnect = () => {
      setIsReconnecting(false);
      setIsConnected(true);
      reconnectAllSessions();
    };

    socket.on('terminal.ready', onReady);
    socket.on('terminal.data', onData);
    socket.on('terminal.error', onError);
    socket.on('terminal.exit', onExit);
    socket.on('terminal.warn', onWarn);
    socket.on('terminal.sessions', onSessions);
    socket.on('disconnect', onDisconnect);
    socket.on('connect', onConnect);

    // Check for existing sessions on backend (e.g., after SPA navigation)
    // reconnectAllSessions will attach to existing sessions or create fresh ones
    socket.emit('terminal.sessions');

    return () => {
      socket.off('terminal.ready', onReady);
      socket.off('terminal.data', onData);
      socket.off('terminal.error', onError);
      socket.off('terminal.exit', onExit);
      socket.off('terminal.warn', onWarn);
      socket.off('terminal.sessions', onSessions);
      socket.off('disconnect', onDisconnect);
      socket.off('connect', onConnect);
      // Pending session mappings are no longer valid
      pendingSessionsRef.current.clear();
      // Dispose all terminal subscriptions and instances
      for (const [_, inst] of xtermInstances.current) {
        inst.dataUnsub?.();
        inst.resizeUnsub?.();
        inst.term.dispose();
      }
      xtermInstances.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, instanceId]);

  // Fit on resize — uses requestAnimationFrame for pixel-perfect alignment
  useEffect(() => {
    const fit = () => fitAll(xtermInstances.current);
    const obs = new ResizeObserver(fit);
    if (containerRef.current) obs.observe(containerRef.current);
    window.addEventListener('resize', fit);
    return () => { obs.disconnect(); window.removeEventListener('resize', fit); };
  }, []);

  // Session duration
  useEffect(() => {
    if (!isConnected) return;
    durationIntervalRef.current = setInterval(() => setSessionDuration(p => p + 1), 1000);
    return () => { if (durationIntervalRef.current) clearInterval(durationIntervalRef.current); };
  }, [isConnected]);

  // Latency ping
  useEffect(() => {
    if (!socket) return;
    const interval = setInterval(() => {
      if (isConnected) {
        const start = Date.now();
        socket.emit('ping');
        socket.once('pong', () => setLatency(Date.now() - start));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [socket, isConnected]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setShowSearch(p => { if (!p) setTimeout(() => searchInputRef.current?.focus(), 100); return !p; });
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'P') { e.preventDefault(); setShowShortcuts(p => !p); }
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isFullscreen, showSearch]);

  useEffect(() => {
    const click = () => setContextMenu(null);
    document.addEventListener('click', click);
    return () => document.removeEventListener('click', click);
  }, []);

  const toggleFullscreen = () => {
    const next = !isFullscreen;
    setIsFullscreen(next);
    if (next && fullscreenRef.current?.requestFullscreen) {
      fullscreenRef.current.requestFullscreen();
    } else if (!next && document.exitFullscreen) {
      document.exitFullscreen();
    }
    // Fit after fullscreen transition in next frame, then again after browser settles
    fitAll(xtermInstances.current);
    setTimeout(() => fitAll(xtermInstances.current), 300);
  };

  const searchNext = () => {
    const inst = getActiveTerminal();
    if (!inst) return;
    inst.searchAddon.findNext(searchValue, { regex: searchRegex, wholeWord: searchWholeWord, caseSensitive: searchCaseSensitive });
  };

  const searchPrev = () => {
    const inst = getActiveTerminal();
    if (!inst) return;
    inst.searchAddon.findPrevious(searchValue, { regex: searchRegex, wholeWord: searchWholeWord, caseSensitive: searchCaseSensitive });
  };

  const handleCopy = () => {
    const inst = getActiveTerminal();
    if (!inst) return;
    const sel = inst.term.getSelection();
    if (sel) navigator.clipboard.writeText(sel).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    setContextMenu(null);
  };

  const handlePaste = async () => {
    const inst = getActiveTerminal();
    if (!inst?.sessionId || !socket) return;
    try { socket.emit('terminal.input', { sessionId: inst.sessionId, data: await navigator.clipboard.readText() }); } catch {}
    setContextMenu(null);
  };

  const handleDownload = () => {
    const inst = getActiveTerminal();
    if (!inst) return;
    const serializeAddon = new SerializeAddon();
    inst.term.loadAddon(serializeAddon);
    const content = serializeAddon.serialize();
    serializeAddon.dispose();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `terminal-${instanceId}-${Date.now()}.log`;
    a.click(); URL.revokeObjectURL(url);
    setContextMenu(null);
  };

  const handleClear = () => { getActiveTerminal()?.term.clear(); setContextMenu(null); };

  const addTab = () => {
    tabCountRef.current += 1;
    const id = `tab-${tabCountRef.current}`;
    setTabs(prev => [...prev, { id, label: `Terminal ${tabCountRef.current}` }]);
    setActiveTab(id);
    setTimeout(() => {
      const container = terminalRefs.current.get(id);
      if (container && socket) {
        createTerminal(id, container);
        connectSession(id);
      }
    }, 50);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const inst = xtermInstances.current.get(tabId);
    if (inst) {
      if (inst.sessionId) socket?.emit('terminal.close', { sessionId: inst.sessionId });
      inst.dataUnsub?.();
      inst.resizeUnsub?.();
      inst.term.dispose();
      xtermInstances.current.delete(tabId);
    }
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTab === tabId) {
      const remaining = tabs.filter(t => t.id !== tabId);
      setActiveTab(remaining[remaining.length - 1]?.id || 'main');
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); };

  const formatDuration = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec}s` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  };

  const getRef = (tabId: string) => (el: HTMLDivElement | null) => {
    if (el) terminalRefs.current.set(tabId, el);
    else terminalRefs.current.delete(tabId);
  };

  return (
    <div ref={fullscreenRef} className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-[9999] bg-[#0a0a0b]' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0d0e] border-b border-zinc-800/60 select-none shrink-0">
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setContextMenu(null); }}
              className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t-md cursor-pointer transition-colors shrink-0 ${
                activeTab === tab.id
                  ? 'bg-[#0a0a0b] text-zinc-100 border-t border-l border-r border-zinc-800'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50'
              }`}
            >
              <TerminalIcon size={11} className="shrink-0" />
              <span className="truncate max-w-[120px]">{tab.label}</span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="ml-1 p-0.5 rounded hover:bg-zinc-700/50 text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          <button onClick={addTab} className="ml-1 p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition">
            <Plus size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSearch(p => !p)} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition" title="Search (Ctrl+Shift+F)"><SearchIcon size={13} /></button>
          <button onClick={handleDownload} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition" title="Download Logs"><Download size={13} /></button>
          <button onClick={handleClear} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition" title="Clear"><X size={13} /></button>
          <button onClick={toggleFullscreen} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition" title="Fullscreen (F11)">
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button onClick={() => setShowShortcuts(p => !p)} className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition text-[10px] font-mono" title="Shortcuts (Ctrl+Shift+P)">⌨</button>
        </div>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#121214] border-b border-zinc-800/60">
          <SearchIcon size={12} className="text-zinc-500 shrink-0" />
          <input ref={searchInputRef} value={searchValue} onChange={e => setSearchValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') searchNext(); if (e.key === 'Escape') setShowSearch(false); }}
            placeholder="Find..." className="flex-1 bg-transparent text-xs text-zinc-200 border-none outline-none placeholder-zinc-600" />
          <span className="text-[10px] text-zinc-600 shrink-0"></span>
          <div className="flex items-center gap-1">
            <button onClick={() => setSearchCaseSensitive(p => !p)} className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${searchCaseSensitive ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-600 hover:text-zinc-400'}`} title="Case Sensitive">Aa</button>
            <button onClick={() => setSearchWholeWord(p => !p)} className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${searchWholeWord ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-600 hover:text-zinc-400'}`} title="Whole Word">W</button>
            <button onClick={() => setSearchRegex(p => !p)} className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${searchRegex ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-600 hover:text-zinc-400'}`} title="Regex">.*</button>
          </div>
          <button onClick={searchPrev} className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg></button>
          <button onClick={searchNext} className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
          <button onClick={() => setShowSearch(false)} className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition"><X size={12} /></button>
        </div>
      )}

      {/* Terminal — rendering-critical: no line-height or spacing inheritance */}
      <div ref={containerRef}
        className="flex-1 relative min-h-[400px] bg-[#0a0a0b]"
        style={{ lineHeight: 'normal', letterSpacing: 0, wordSpacing: 0, fontVariant: 'normal' }}
        onContextMenu={handleContextMenu}>
        {(isReconnecting || !isConnected) && !connectionError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b]/80 z-10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw size={20} className="text-blue-400 animate-spin" />
              <span className="text-xs text-zinc-500">{isReconnecting ? 'Reconnecting...' : 'Connecting...'}</span>
            </div>
          </div>
        )}
        {connectionError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b]/80 z-10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 px-6">
              <AlertCircle size={20} className="text-red-400" />
              <span className="text-xs text-red-400 text-center">{connectionError}</span>
              <button onClick={() => { setConnectionError(null); connectSession(activeTabRef.current); }}
                className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-medium transition">
                Retry
              </button>
            </div>
          </div>
        )}
        {tabs.map(tab => (
          <div key={tab.id} ref={getRef(tab.id)}
            className={`absolute inset-0 ${activeTab === tab.id ? 'z-1' : 'z-0 pointer-events-none opacity-0'}`}
            onClick={() => { xtermInstances.current.get(tab.id)?.term.focus(); setContextMenu(null); }} />
        ))}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#121214] border-t border-zinc-800/60 text-[10px] text-zinc-500 select-none shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {isConnected ? <Wifi size={10} className="text-emerald-400" /> : isReconnecting ? <RefreshCw size={10} className="text-yellow-400 animate-spin" /> : <WifiOff size={10} className="text-red-400" />}
            <span className={isConnected ? 'text-emerald-400' : isReconnecting ? 'text-yellow-400' : 'text-red-400'}>
              {isConnected ? 'Connected' : isReconnecting ? 'Reconnecting...' : 'Disconnected'}
            </span>
          </div>
          <div className="flex items-center gap-1"><span className="text-zinc-600">⇄</span><span>{latency > 0 ? `${latency}ms` : '—'}</span></div>
          <div className="flex items-center gap-1"><Clock size={10} /><span>{formatDuration(sessionDuration)}</span></div>
        </div>
        <div className="flex items-center gap-3">
          {(() => { const i = getActiveTerminal(); return i ? <span>{i.term.rows}×{i.term.cols}</span> : null; })()}
          {tabs.find(t => t.id === activeTab)?.containerName && <span className="text-zinc-600">{tabs.find(t => t.id === activeTab)?.containerName}</span>}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div ref={contextRef} style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-[99999] bg-[#18181b] border border-zinc-800 rounded-lg shadow-2xl py-1 min-w-[180px]">
          {[
            { label: 'Copy', shortcut: 'Ctrl+Shift+C', action: handleCopy },
            { label: 'Paste', shortcut: 'Ctrl+Shift+V', action: handlePaste },
            { type: 'divider' },
            { label: 'Clear Terminal', action: handleClear },
            { label: 'Download Output', action: handleDownload },
            { type: 'divider' },
            { label: 'Search', shortcut: 'Ctrl+Shift+F', action: () => { setShowSearch(true); setContextMenu(null); } },
            { label: 'New Terminal Tab', action: () => { addTab(); setContextMenu(null); } },
            { type: 'divider' },
            { label: 'Select All', action: () => { getActiveTerminal()?.term.selectAll(); setContextMenu(null); } },
          ].map((item: any, i) =>
            item.type === 'divider' ? <div key={i} className="my-1 border-t border-zinc-800" /> : (
              <button key={i} onClick={item.action}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700/50 transition-colors">
                <span>{item.label}</span>
                {item.shortcut && <span className="text-zinc-600 text-[9px] font-mono ml-4">{item.shortcut}</span>}
              </button>
            )
          )}
        </div>
      )}

      {/* Shortcuts */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-zinc-500 hover:text-zinc-300 transition"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { keys: 'Ctrl+Shift+F', desc: 'Search' },
                { keys: 'Ctrl+Shift+P', desc: 'Show Shortcuts' },
                { keys: 'Ctrl+Shift+C', desc: 'Copy' },
                { keys: 'Ctrl+Shift+V', desc: 'Paste' },
                { keys: 'Ctrl+L', desc: 'Clear Terminal' },
                { keys: 'F11', desc: 'Toggle Fullscreen' },
                { keys: 'Esc', desc: 'Exit Fullscreen / Close Search' },
              ].map((sc, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300">{sc.desc}</span>
                  <kbd className="px-2 py-0.5 bg-zinc-800 rounded text-[10px] font-mono text-zinc-400 border border-zinc-700">{sc.keys}</kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {copied && (
        <div className="fixed bottom-6 right-6 z-[99999] flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs shadow-2xl animate-in">
          <Check size={14} /> Copied to clipboard
        </div>
      )}
    </div>
  );
};

export default Console;

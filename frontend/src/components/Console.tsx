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
  Play, Square, RotateCcw, Maximize2, Minimize2,
  Download, Search as SearchIcon, X, RefreshCw,
  Terminal as TerminalIcon, Plus, AlertCircle, Wifi, WifiOff,
  Clock, Copy, Check,
} from 'lucide-react';

interface ConsoleProps {
  instanceId: string;
  status: string;
  onPowerAction: (action: string) => Promise<void>;
  actionLoading?: string | null;
}

interface TermTab {
  id: string;
  label: string;
  containerName?: string;
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

  // Terminal state
  const [tabs, setTabs] = useState<TermTab[]>([{ id: 'main', label: 'Terminal 1' }]);
  const [activeTab, setActiveTab] = useState('main');
  const terminalRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const xtermInstances = useRef<Map<string, { term: Terminal; fitAddon: FitAddon; searchAddon: SearchAddon; sessionId?: string }>>(new Map());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchRegex, setSearchRegex] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [matchIndex, setMatchIndex] = useState(0);
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
  const lastPingRef = useRef<number>(0);
  const tabCountRef = useRef(1);

  const getActiveTerminal = useCallback(() => {
    return xtermInstances.current.get(activeTab);
  }, [activeTab]);

  const focusTerminal = useCallback(() => {
    const inst = getActiveTerminal();
    if (inst) inst.term.focus();
  }, [getActiveTerminal]);

  // Create a new terminal session
  const createTerminalSession = useCallback((tabId: string, container?: HTMLDivElement) => {
    if (!socket || !container) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 2,
      convertEol: true,
      allowTransparency: true,
      theme: TERM_THEME,
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", ui-monospace, monospace',
      fontSize: 14,
      lineHeight: 1.5,
      letterSpacing: 0,
      scrollback: 100000,
      allowProposedApi: true,
      smoothScrollDuration: 0,
      windowsMode: false,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(webLinksAddon);

    try {
      const unicodeAddon = new Unicode11Addon();
      term.loadAddon(unicodeAddon);
    } catch (_) {}

    term.open(container);
    fitAddon.fit();

    // WebGL renderer with Canvas fallback
    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
    } catch (_) {}

    xtermInstances.current.set(tabId, { term, fitAddon, searchAddon });

    // Connect to backend
    const token = getToken();
    socket.emit('terminal.create', {
      instanceId,
      token,
      cols: term.cols,
      rows: term.rows,
    });

    setIsConnected(true);
    setConnectionError(null);
    lastPingRef.current = Date.now();

    // Input handling
    term.onData((data: string) => {
      const inst = xtermInstances.current.get(tabId);
      if (inst?.sessionId) {
        socket.emit('terminal.input', { sessionId: inst.sessionId, data });
      }
    });

    // Resize handling
    term.onResize((size) => {
      const inst = xtermInstances.current.get(tabId);
      if (inst?.sessionId) {
        socket.emit('terminal.resize', { sessionId: inst.sessionId, cols: size.cols, rows: size.rows });
      }
    });

    return term;
  }, [socket, instanceId]);

  // Initialize the first terminal
  useEffect(() => {
    if (!socket) return;
    const container = terminalRefs.current.get('main');
    if (!container) return;
    createTerminalSession('main', container);
    return () => {
      socket.emit('terminal.close');
      xtermInstances.current.forEach((inst, id) => {
        inst.term.dispose();
      });
      xtermInstances.current.clear();
    };
  }, [socket, instanceId, createTerminalSession]);

  // Socket event handlers
  useEffect(() => {
    if (!socket) return;

    const onReady = (data: { sessionId: string; containerName: string }) => {
      const inst = xtermInstances.current.get(activeTab);
      if (inst) {
        inst.sessionId = data.sessionId;
        setTabs(prev => prev.map(t => t.id === activeTab ? { ...t, containerName: data.containerName } : t));
      }
      setIsConnected(true);
      setIsReconnecting(false);
      setConnectionError(null);
    };

    const onData = (data: string) => {
      const inst = xtermInstances.current.get(activeTab);
      if (inst) inst.term.write(data);
    };

    const onError = (data: { message: string }) => {
      setConnectionError(data.message);
      setIsConnected(false);
    };

    const onExit = (data: { sessionId: string; exitCode: number }) => {
      const inst = xtermInstances.current.get(activeTab);
      if (inst && inst.sessionId === data.sessionId) {
        inst.term.write(`\r\n\x1b[90m[Session ended with exit code ${data.exitCode}]\x1b[0m\r\n`);
      }
    };

    const onWarn = (data: { sessionId: string; message: string }) => {
      const inst = xtermInstances.current.get(activeTab);
      if (inst && inst.sessionId === data.sessionId) {
        inst.term.write(`\r\n\x1b[33m${data.message}\x1b[0m\r\n`);
      }
    };

    socket.on('terminal.ready', onReady);
    socket.on('terminal.data', onData);
    socket.on('terminal.error', onError);
    socket.on('terminal.exit', onExit);
    socket.on('terminal.warn', onWarn);

    // Reconnect handling
    socket.on('disconnect', () => {
      setIsConnected(false);
      setIsReconnecting(true);
    });

    socket.on('connect', () => {
      setIsReconnecting(false);
      setIsConnected(true);
      // Re-create terminal session
      const inst = xtermInstances.current.get(activeTab);
      if (inst) {
        const token = getToken();
        socket.emit('terminal.create', {
          instanceId,
          token,
          cols: inst.term.cols,
          rows: inst.term.rows,
        });
      }
    });

    return () => {
      socket.off('terminal.ready', onReady);
      socket.off('terminal.data', onData);
      socket.off('terminal.error', onError);
      socket.off('terminal.exit', onExit);
      socket.off('terminal.warn', onWarn);
    };
  }, [socket, instanceId, activeTab]);

  // Fit terminal on resize
  useEffect(() => {
    const handleResize = () => {
      xtermInstances.current.forEach((inst) => {
        try { inst.fitAddon.fit(); } catch (_) {}
      });
    };

    const observer = new ResizeObserver(handleResize);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Session duration timer
  useEffect(() => {
    if (!isConnected) return;
    durationIntervalRef.current = setInterval(() => {
      setSessionDuration(prev => prev + 1);
    }, 1000);
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [isConnected]);

  // Latency ping
  useEffect(() => {
    if (!socket) return;
    const pingInterval = setInterval(() => {
      if (isConnected) {
        const start = Date.now();
        socket.emit('ping');
        socket.once('pong', () => {
          setLatency(Date.now() - start);
        });
      }
    }, 5000);
    return () => clearInterval(pingInterval);
  }, [socket, isConnected]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+F: Search
      if (e.ctrlKey && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        setShowSearch(prev => !prev);
        if (!showSearch) setTimeout(() => searchInputRef.current?.focus(), 100);
      }
      // Ctrl+Shift+P: Shortcuts
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }
      // F11: Fullscreen
      if (e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      }
      // ESC: Exit fullscreen
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch, isFullscreen]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      if (fullscreenRef.current?.requestFullscreen) {
        fullscreenRef.current.requestFullscreen();
      }
      setIsFullscreen(true);
      setTimeout(() => {
        xtermInstances.current.forEach((inst) => {
          try { inst.fitAddon.fit(); } catch (_) {}
        });
      }, 200);
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      setIsFullscreen(false);
      setTimeout(() => {
        xtermInstances.current.forEach((inst) => {
          try { inst.fitAddon.fit(); } catch (_) {}
        });
      }, 200);
    }
  };

  const searchNext = () => {
    const inst = getActiveTerminal();
    if (!inst) return;
    const options = {
      regex: searchRegex,
      wholeWord: searchWholeWord,
      caseSensitive: searchCaseSensitive,
    };
    inst.searchAddon.findNext(searchValue, options);
  };

  const searchPrev = () => {
    const inst = getActiveTerminal();
    if (!inst) return;
    const options = {
      regex: searchRegex,
      wholeWord: searchWholeWord,
      caseSensitive: searchCaseSensitive,
    };
    inst.searchAddon.findPrevious(searchValue, options);
  };

  const handleCopy = () => {
    const inst = getActiveTerminal();
    if (!inst) return;
    const selection = inst.term.getSelection();
    if (selection) {
      navigator.clipboard.writeText(selection).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const handlePaste = async () => {
    const inst = getActiveTerminal();
    if (!inst || !inst.sessionId) return;
    try {
      const text = await navigator.clipboard.readText();
      socket?.emit('terminal.input', { sessionId: inst.sessionId, data: text });
    } catch {}
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
    a.href = url;
    a.download = `terminal-${instanceId}-${Date.now()}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    const inst = getActiveTerminal();
    if (inst) inst.term.clear();
  };

  const addTab = () => {
    tabCountRef.current += 1;
    const id = `tab-${tabCountRef.current}`;
    const newTab: TermTab = { id, label: `Terminal ${tabCountRef.current}` };
    setTabs(prev => [...prev, newTab]);
    setActiveTab(id);

    // Create terminal in next tick after DOM renders
    setTimeout(() => {
      const container = terminalRefs.current.get(id);
      if (container) createTerminalSession(id, container);
    }, 50);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const inst = xtermInstances.current.get(tabId);
    if (inst) {
      if (inst.sessionId) socket?.emit('terminal.close', { sessionId: inst.sessionId });
      inst.term.dispose();
      xtermInstances.current.delete(tabId);
    }
    setTabs(prev => prev.filter(t => t.id !== tabId));
    if (activeTab === tabId) {
      const remaining = tabs.filter(t => t.id !== tabId);
      setActiveTab(remaining[remaining.length - 1]?.id || 'main');
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const getPlaceholderRef = (tabId: string) => (el: HTMLDivElement | null) => {
    if (el) terminalRefs.current.set(tabId, el);
    else terminalRefs.current.delete(tabId);
  };

  return (
    <div ref={fullscreenRef} className={`flex flex-col ${isFullscreen ? 'fixed inset-0 z-[9999] bg-[#0a0a0b]' : ''}`}>
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#0d0d0e] border-b border-zinc-800/60 select-none shrink-0">
        {/* Tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
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
          <button
            onClick={addTab}
            className="ml-1 p-1 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSearch(prev => !prev)}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            title="Search (Ctrl+Shift+F)">
            <SearchIcon size={13} />
          </button>
          <button onClick={handleDownload}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            title="Download Logs">
            <Download size={13} />
          </button>
          <button onClick={handleClear}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            title="Clear">
            <X size={13} />
          </button>
          <button onClick={toggleFullscreen}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition"
            title="Fullscreen (F11)">
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
          <button onClick={() => setShowShortcuts(true)}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition text-[10px] font-mono"
            title="Shortcuts (Ctrl+Shift+P)">
            ⌨
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#121214] border-b border-zinc-800/60">
          <SearchIcon size={12} className="text-zinc-500 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') searchNext(); if (e.key === 'Escape') setShowSearch(false); }}
            placeholder="Find..."
            className="flex-1 bg-transparent text-xs text-zinc-200 border-none outline-none placeholder-zinc-600"
          />
          <span className="text-[10px] text-zinc-600 shrink-0">
            {matchCount > 0 ? `${matchIndex + 1}/${matchCount}` : ''}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setSearchCaseSensitive(!searchCaseSensitive); }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${searchCaseSensitive ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-600 hover:text-zinc-400'}`}
              title="Case Sensitive"
            >
              Aa
            </button>
            <button
              onClick={() => { setSearchWholeWord(!searchWholeWord); }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${searchWholeWord ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-600 hover:text-zinc-400'}`}
              title="Whole Word"
            >
              W
            </button>
            <button
              onClick={() => { setSearchRegex(!searchRegex); }}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${searchRegex ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-600 hover:text-zinc-400'}`}
              title="Regex"
            >
              .*
            </button>
          </div>
          <button onClick={searchPrev} className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition" title="Previous">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
          </button>
          <button onClick={searchNext} className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition" title="Next">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </button>
          <button onClick={() => setShowSearch(false)} className="p-1 rounded text-zinc-500 hover:text-zinc-300 transition">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Terminal Container */}
      <div
        ref={containerRef}
        className="flex-1 relative min-h-[400px] bg-[#0a0a0b]"
        onContextMenu={handleContextMenu}
      >
        {/* Reconnect overlay */}
        {(isReconnecting || !isConnected) && !connectionError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b]/80 z-10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2">
              <RefreshCw size={20} className="text-blue-400 animate-spin" />
              <span className="text-xs text-zinc-500">
                {isReconnecting ? 'Reconnecting...' : 'Connecting...'}
              </span>
            </div>
          </div>
        )}

        {/* Error overlay */}
        {connectionError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0b]/80 z-10 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-2 px-6">
              <AlertCircle size={20} className="text-red-400" />
              <span className="text-xs text-red-400 text-center">{connectionError}</span>
              <button
                onClick={() => {
                  setConnectionError(null);
                  const token = getToken();
                  socket?.emit('terminal.create', { instanceId, token, cols: 80, rows: 24 });
                }}
                className="mt-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-medium transition"
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Terminal instances (one per tab) */}
        {tabs.map(tab => (
          <div
            key={tab.id}
            ref={getPlaceholderRef(tab.id)}
            className={`absolute inset-0 ${activeTab === tab.id ? 'z-1' : 'z-0 pointer-events-none opacity-0'}`}
          />
        ))}
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#121214] border-t border-zinc-800/60 text-[10px] text-zinc-500 select-none shrink-0">
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-1">
            {isConnected ? (
              <Wifi size={10} className="text-emerald-400" />
            ) : isReconnecting ? (
              <RefreshCw size={10} className="text-yellow-400 animate-spin" />
            ) : (
              <WifiOff size={10} className="text-red-400" />
            )}
            <span className={isConnected ? 'text-emerald-400' : isReconnecting ? 'text-yellow-400' : 'text-red-400'}>
              {isConnected ? 'Connected' : isReconnecting ? 'Reconnecting...' : 'Disconnected'}
            </span>
          </div>
          {/* Latency */}
          <div className="flex items-center gap-1">
            <span className="text-zinc-600">⇄</span>
            <span>{latency > 0 ? `${latency}ms` : '—'}</span>
          </div>
          {/* Duration */}
          <div className="flex items-center gap-1">
            <Clock size={10} />
            <span>{formatDuration(sessionDuration)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Rows/Cols */}
          {(() => {
            const inst = getActiveTerminal();
            return inst ? (
              <span>{inst.term.rows}×{inst.term.cols}</span>
            ) : null;
          })()}
          {/* Container info */}
          {tabs.find(t => t.id === activeTab)?.containerName && (
            <span className="text-zinc-600">{tabs.find(t => t.id === activeTab)?.containerName}</span>
          )}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextRef}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          className="fixed z-[99999] bg-[#18181b] border border-zinc-800 rounded-lg shadow-2xl py-1 min-w-[180px]"
        >
          {[
            { label: 'Copy', shortcut: 'Ctrl+Shift+C', action: handleCopy },
            { label: 'Paste', shortcut: 'Ctrl+Shift+V', action: handlePaste },
            { type: 'divider' },
            { label: 'Clear Terminal', action: handleClear },
            { label: 'Download Output', action: handleDownload },
            { type: 'divider' },
            { label: 'Search', shortcut: 'Ctrl+Shift+F', action: () => setShowSearch(true) },
            { label: 'New Terminal Tab', action: addTab },
            { type: 'divider' },
            { label: 'Select All', action: () => { const inst = getActiveTerminal(); if (inst) inst.term.selectAll(); } },
          ].map((item: any, i) =>
            item.type === 'divider' ? (
              <div key={i} className="my-1 border-t border-zinc-800" />
            ) : (
              <button
                key={i}
                onClick={() => { item.action(); setContextMenu(null); }}
                className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700/50 transition-colors"
              >
                <span>{item.label}</span>
                {item.shortcut && <span className="text-zinc-600 text-[9px] font-mono ml-4">{item.shortcut}</span>}
              </button>
            )
          )}
        </div>
      )}

      {/* Keyboard Shortcuts Dialog */}
      {showShortcuts && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
          <div className="bg-[#18181b] border border-zinc-800 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100">Keyboard Shortcuts</h3>
              <button onClick={() => setShowShortcuts(false)} className="text-zinc-500 hover:text-zinc-300 transition">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { keys: 'Ctrl+Shift+F', desc: 'Search' },
                { keys: 'Ctrl+Shift+P', desc: 'Show Shortcuts' },
                { keys: 'Ctrl+Shift+C', desc: 'Copy' },
                { keys: 'Ctrl+Shift+V', desc: 'Paste' },
                { keys: 'Ctrl+L', desc: 'Clear Terminal' },
                { keys: 'Ctrl+K', desc: 'Clear to End' },
                { keys: 'F11', desc: 'Toggle Fullscreen' },
                { keys: 'Esc', desc: 'Exit Fullscreen / Close Search' },
              ].map((shortcut, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-zinc-300">{shortcut.desc}</span>
                  <kbd className="px-2 py-0.5 bg-zinc-800 rounded text-[10px] font-mono text-zinc-400 border border-zinc-700">
                    {shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Copied toast */}
      {copied && (
        <div className="fixed bottom-6 right-6 z-[99999] flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs shadow-2xl animate-in">
          <Check size={14} />
          Copied to clipboard
        </div>
      )}
    </div>
  );
};

export default Console;

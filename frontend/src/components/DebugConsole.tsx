'use client';

import { useEffect, useState, useRef } from 'react';

interface LogEntry {
  id: number;
  type: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: string;
}

interface DebugConsoleProps {
  enabled?: boolean;
}

export default function DebugConsole({ enabled = false }: DebugConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isVisible, setIsVisible] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const logIdRef = useRef(0);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Check if debug is enabled via prop or environment variable
  const isDebugEnabled = enabled || process.env.NEXT_PUBLIC_DEBUG_CONSOLE === 'true';

  useEffect(() => {
    if (!isDebugEnabled) return;
    // Override console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    const addLog = (type: LogEntry['type'], args: any[]) => {
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      }).join(' ');

      const timestamp = new Date().toLocaleTimeString('en-US', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3
      });

      setLogs(prev => {
        const newLogs = [...prev, { 
          id: logIdRef.current++, 
          type, 
          message, 
          timestamp 
        }];
        // Keep only last 50 logs
        return newLogs.slice(-50);
      });
    };

    console.log = (...args) => {
      originalLog(...args);
      addLog('log', args);
    };

    console.warn = (...args) => {
      originalWarn(...args);
      addLog('warn', args);
    };

    console.error = (...args) => {
      originalError(...args);
      addLog('error', args);
    };

    console.info = (...args) => {
      originalInfo(...args);
      addLog('info', args);
    };

    // Restore original console methods on cleanup
    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, [isDebugEnabled]);

  // Auto-scroll to bottom when new logs added
  useEffect(() => {
    if (consoleRef.current && !isMinimized) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs, isMinimized]);

  if (!isDebugEnabled || !isVisible) return null;

  const getLogColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'error': return 'text-red-600 bg-red-50';
      case 'warn': return 'text-yellow-700 bg-yellow-50';
      case 'info': return 'text-blue-600 bg-blue-50';
      default: return 'text-gray-700 bg-white';
    }
  };

  return (
    <div 
      className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t-2 border-gray-700 shadow-2xl"
      style={{ maxHeight: isMinimized ? '48px' : '40vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-green-400">🐛 DEBUG CONSOLE</span>
          <span className="text-xs text-gray-400">({logs.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLogs([])}
            className="text-xs px-2 py-1 bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
            title="Clear logs"
          >
            Clear
          </button>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="text-xs px-2 py-1 bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? '▲' : '▼'}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="text-xs px-2 py-1 bg-red-700 text-white rounded hover:bg-red-600"
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Logs */}
      {!isMinimized && (
        <div 
          ref={consoleRef}
          className="overflow-y-auto p-2 space-y-1"
          style={{ maxHeight: 'calc(40vh - 48px)' }}
        >
          {logs.length === 0 ? (
            <div className="text-center text-gray-500 text-xs py-4">
              No logs yet...
            </div>
          ) : (
            logs.map(log => (
              <div 
                key={log.id}
                className={`text-xs p-2 rounded font-mono whitespace-pre-wrap break-words ${getLogColor(log.type)}`}
              >
                <span className="text-gray-500 mr-2">[{log.timestamp}]</span>
                <span className="font-semibold mr-1 uppercase">{log.type}:</span>
                {log.message}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

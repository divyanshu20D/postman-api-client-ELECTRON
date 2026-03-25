import { useState } from 'react';
import type { HistoryEntryRecord, HttpMethod } from '@shared/models';
import { METHOD_COLOR } from '../utils/method-colors';

interface HistoryPanelProps {
  history: HistoryEntryRecord[];
  onSelectEntry(entry: HistoryEntryRecord): void;
  onClearHistory(): void;
}

interface ParsedSnapshot {
  name: string;
  method: HttpMethod;
  url: string;
}

function parseSnapshot(json: string): ParsedSnapshot | null {
  try {
    return JSON.parse(json) as ParsedSnapshot;
  } catch {
    return null;
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getStatusColor(code: number | null): string {
  if (!code) return 'text-pm-text-t';
  if (code < 300) return 'text-st-success';
  if (code < 400) return 'text-st-warning';
  return 'text-st-error';
}

export function HistoryPanel({ history, onSelectEntry, onClearHistory }: HistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = searchQuery
    ? history.filter((entry) => {
        const snap = parseSnapshot(entry.requestSnapshot);
        if (!snap) return false;
        return (
          snap.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
          snap.method.toLowerCase().includes(searchQuery.toLowerCase()) ||
          snap.name.toLowerCase().includes(searchQuery.toLowerCase())
        );
      })
    : history;

  return (
    <aside className="bg-pm-bg-sidebar border-r border-pm-border-s flex flex-col overflow-hidden max-lg:hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between pt-2.5 px-3 gap-2">
        <span className="text-xs font-semibold text-pm-text-s uppercase tracking-wide">History</span>
        {history.length > 0 && (
          <button
            className="text-[11px] text-st-error hover:text-red-400 transition-colors duration-150"
            onClick={onClearHistory}
            type="button"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          className="pm-input bg-pm-bg border-pm-border-s text-xs text-pm-text-t"
          placeholder="Filter history..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <div className="py-8 px-3 text-center text-pm-text-t text-xs">
            {history.length === 0 ? (
              <>
                <div className="text-2xl mb-2">&#128337;</div>
                <div className="font-medium text-pm-text-s mb-1">No history yet</div>
                <div>Send a request and it will appear here.</div>
              </>
            ) : (
              'No matching entries'
            )}
          </div>
        ) : (
          filtered.map((entry) => {
            const snap = parseSnapshot(entry.requestSnapshot);
            if (!snap) return null;

            return (
              <button
                key={entry.id}
                className="flex items-start gap-2 py-2 px-2 rounded w-full text-left transition-colors duration-150 hover:bg-pm-hover group"
                onClick={() => onSelectEntry(entry)}
                type="button"
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold min-w-[36px] text-center shrink-0 ${METHOD_COLOR[snap.method] ?? ''}`}>
                      {snap.method}
                    </span>
                    <span className="text-xs text-pm-text truncate">{snap.name}</span>
                  </div>
                  <div className="text-[11px] text-pm-text-t truncate pl-[44px]">{snap.url}</div>
                </div>
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                  {entry.statusCode && (
                    <span className={`text-[10px] font-semibold ${getStatusColor(entry.statusCode)}`}>
                      {entry.statusCode}
                    </span>
                  )}
                  <span className="text-[10px] text-pm-text-t">{formatTime(entry.createdAt)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

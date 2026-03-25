import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppBootstrap, SaveRequestDraftInput } from '@shared/ipc';
import type { ExecutionResult, HistoryEntryRecord, HttpMethod, RequestRecord } from '@shared/models';
import { EnvironmentsPanel } from './components/EnvironmentsPanel';
import { HistoryPanel } from './components/HistoryPanel';
import { ImportCurlModal } from './components/ImportCurlModal';
import { RequestEditor } from './components/RequestEditor';
import { ResponsePanel } from './components/ResponsePanel';
import { Sidebar } from './components/Sidebar';
import { parseCurl } from './utils/curl-parser';
import { METHOD_COLOR } from './utils/method-colors';

type RailTab = 'collections' | 'environments' | 'history';

/* ===== Tab model ===== */

interface RequestTab {
  tabId: string;
  draft: SaveRequestDraftInput;
  savedRequestId: string | null;
  isDirty: boolean;
  /** Response from last execution */
  response: ExecutionResult | null;
  /** Whether a request is in-flight */
  loading: boolean;
  /** Error message if execution failed */
  error: string | null;
  /** Console log lines */
  consoleLogs: string[];
}

let nextTabId = 1;
function generateTabId(): string {
  return `tab-${nextTabId++}-${Date.now()}`;
}

const EMPTY_METHOD: HttpMethod = 'GET';

function createDraft(workspaceId: string, name?: string): SaveRequestDraftInput {
  return {
    workspaceId,
    name: name ?? 'Untitled Request',
    method: EMPTY_METHOD,
    url: '',
    queryParams: '[]',
    headers: '[]',
    body: null,
    authType: null,
    authConfig: null,
  };
}

function createTab(draft: SaveRequestDraftInput, savedRequestId: string | null = null): RequestTab {
  return {
    tabId: savedRequestId ?? generateTabId(),
    draft,
    savedRequestId,
    isDirty: !savedRequestId,
    response: null,
    loading: false,
    error: null,
    consoleLogs: [],
  };
}

export function App() {
  const [bootstrap, setBootstrap] = useState<AppBootstrap | null>(null);
  const [tabs, setTabs] = useState<RequestTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('Loading workspace...');
  const [activeRail, setActiveRail] = useState<RailTab>('collections');
  const [showCurlModal, setShowCurlModal] = useState(false);

  const activeTab = tabs.find((t) => t.tabId === activeTabId) ?? null;
  const draft = activeTab?.draft ?? null;

  useEffect(() => {
    void window.appApi.getBootstrap().then((data) => {
      setBootstrap(data);
      // Open the first saved request as a tab, or create an empty one
      const initial = data.requests[0];
      const tab = initial
        ? createTab(requestToDraft(initial), initial.id)
        : createTab(createDraft(data.workspace.id));
      setTabs([tab]);
      setActiveTabId(tab.tabId);
      setStatus('Ready');
    });
  }, []);

  async function refreshBootstrap() {
    const data = await window.appApi.getBootstrap();
    setBootstrap(data);
  }

  /* ===== Tab helpers ===== */

  function updateActiveTab(updater: (tab: RequestTab) => RequestTab) {
    setTabs((prev) => prev.map((t) => (t.tabId === activeTabId ? updater(t) : t)));
  }

  function handleDraftChange(newDraft: SaveRequestDraftInput) {
    updateActiveTab((t) => ({ ...t, draft: newDraft, isDirty: true }));
  }

  function addTab(tab: RequestTab) {
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.tabId);
  }

  function closeTab(tabId: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.tabId !== tabId);
      if (next.length === 0 && bootstrap) {
        // Always keep at least one tab
        const empty = createTab(createDraft(bootstrap.workspace.id));
        setActiveTabId(empty.tabId);
        return [empty];
      }
      // If closing the active tab, switch to the nearest one
      if (tabId === activeTabId) {
        const closedIndex = prev.findIndex((t) => t.tabId === tabId);
        const newActive = next[Math.min(closedIndex, next.length - 1)];
        setActiveTabId(newActive.tabId);
      }
      return next;
    });
  }

  /* ===== Actions ===== */

  async function handleSave() {
    if (!draft || !bootstrap || !activeTab) return;
    setStatus('Saving...');
    const saved = await window.appApi.saveRequestDraft(draft);
    const requests = await window.appApi.listRequests();
    setBootstrap({ ...bootstrap, requests });
    // Update the tab with the saved ID
    setTabs((prev) =>
      prev.map((t) =>
        t.tabId === activeTabId
          ? { ...t, tabId: saved.id, draft: requestToDraft(saved), savedRequestId: saved.id, isDirty: false }
          : t,
      ),
    );
    setActiveTabId(saved.id);
    setStatus('Saved');
  }

  async function handleNewRequest(name?: string) {
    if (!bootstrap) return;
    const newDraft = createDraft(bootstrap.workspace.id, name);
    // Auto-save to DB so it appears in the sidebar
    const saved = await window.appApi.saveRequestDraft(newDraft);
    const requests = await window.appApi.listRequests();
    setBootstrap({ ...bootstrap, requests });
    const tab = createTab(requestToDraft(saved), saved.id);
    addTab(tab);
    setStatus('New request');
  }

  async function handleImportCurl(curlText: string) {
    if (!bootstrap) return;
    const parsed = parseCurl(curlText);
    const importedDraft: SaveRequestDraftInput = {
      workspaceId: bootstrap.workspace.id,
      name: extractNameFromUrl(parsed.url),
      method: parsed.method,
      url: parsed.url,
      queryParams: '[]',
      headers: JSON.stringify(parsed.headers, null, 2),
      body: parsed.body,
      authType: parsed.authType,
      authConfig: parsed.authConfig,
    };
    // Auto-save to DB so it appears in the sidebar
    const saved = await window.appApi.saveRequestDraft(importedDraft);
    const requests = await window.appApi.listRequests();
    setBootstrap({ ...bootstrap, requests });
    const tab = createTab(requestToDraft(saved), saved.id);
    addTab(tab);
    setShowCurlModal(false);
    setStatus('Imported from cURL');
  }

  async function handleRenameRequest(requestId: string, nextName: string) {
    if (!bootstrap) return;

    const request = bootstrap.requests.find((item) => item.id === requestId);
    const trimmedName = nextName.trim();
    if (!request || !trimmedName || trimmedName === request.name) {
      return;
    }

    setStatus('Renaming request...');

    const saved = await window.appApi.saveRequestDraft({
      id: request.id,
      workspaceId: request.workspaceId,
      collectionId: request.collectionId,
      folderId: request.folderId,
      name: trimmedName,
      method: request.method,
      url: request.url,
      queryParams: request.queryParams,
      headers: request.headers,
      body: request.body,
      authType: request.authType,
      authConfig: request.authConfig,
    });

    const requests = await window.appApi.listRequests();
    setBootstrap({ ...bootstrap, requests });
    setTabs((prev) =>
      prev.map((tab) =>
        tab.savedRequestId === requestId
          ? {
              ...tab,
              tabId: saved.id,
              draft: { ...tab.draft, name: saved.name },
            }
          : tab,
      ),
    );
    setStatus(`Renamed to ${saved.name}`);
  }

  async function handleSend() {
    if (!draft || !activeTab) return;

    if (!draft.url.trim()) {
      setStatus('Enter a URL first');
      return;
    }

    const time = new Date().toLocaleTimeString();

    // Mark loading
    updateActiveTab((t) => ({
      ...t,
      loading: true,
      error: null,
      consoleLogs: [
        ...t.consoleLogs,
        `[${time}] ${draft.method} ${draft.url}`,
        `[${time}] Sending request...`,
      ],
    }));
    setStatus('Sending...');

    try {
      const result = await window.appApi.executeRequest({
        workspaceId: draft.workspaceId,
        requestId: activeTab.savedRequestId ?? undefined,
        name: draft.name,
        method: draft.method,
        url: draft.url,
        queryParams: draft.queryParams,
        headers: draft.headers,
        body: draft.body,
        authType: draft.authType,
        authConfig: draft.authConfig,
      });

      const doneTime = new Date().toLocaleTimeString();
      updateActiveTab((t) => ({
        ...t,
        loading: false,
        response: result,
        consoleLogs: [
          ...t.consoleLogs,
          `[${doneTime}] ${result.statusCode} ${result.statusText} — ${result.durationMs}ms`,
        ],
      }));

      // Refresh bootstrap to update history
      void refreshBootstrap();

      setStatus(`${result.statusCode} ${result.statusText} — ${result.durationMs}ms`);
    } catch (err) {
      const errTime = new Date().toLocaleTimeString();
      const message = err instanceof Error ? err.message : String(err);
      updateActiveTab((t) => ({
        ...t,
        loading: false,
        error: message,
        consoleLogs: [...t.consoleLogs, `[${errTime}] ERROR: ${message}`],
      }));
      setStatus('Request failed');
    }
  }

  function handleSelectRequest(request: RequestRecord) {
    // If this request is already open in a tab, switch to it
    const existing = tabs.find((t) => t.savedRequestId === request.id);
    if (existing) {
      setActiveTabId(existing.tabId);
      setStatus(`Editing: ${request.name}`);
      return;
    }
    // Otherwise open a new tab
    const tab = createTab(requestToDraft(request), request.id);
    addTab(tab);
    setStatus(`Editing: ${request.name}`);
  }

  function handleSelectHistoryEntry(entry: HistoryEntryRecord) {
    if (!bootstrap) return;
    try {
      const snap = JSON.parse(entry.requestSnapshot) as RequestRecord;
      const tab = createTab({
        workspaceId: entry.workspaceId,
        name: snap.name ?? 'From History',
        method: snap.method ?? 'GET',
        url: snap.url ?? '',
        queryParams: snap.queryParams ?? '[]',
        headers: snap.headers ?? '[]',
        body: snap.body ?? null,
        authType: snap.authType ?? null,
        authConfig: snap.authConfig ?? null,
      });
      addTab(tab);
      setStatus('Loaded from history');
    } catch {
      setStatus('Failed to load history entry');
    }
  }

  async function handleClearHistory() {
    await window.appApi.clearHistory();
    await refreshBootstrap();
    setStatus('History cleared');
  }

  /* ===== Render ===== */

  if (!bootstrap || tabs.length === 0 || !draft) {
    return (
      <div className="h-screen grid place-items-center bg-pm-bg text-pm-text-s">
        <div className="text-center">
          <div className="text-3xl mb-3 text-pm-orange">&#9676;</div>
          <div>{status}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen grid grid-rows-[48px_1fr] bg-pm-bg">
      {/* ===== Top Bar ===== */}
      <header className="flex items-center gap-3 px-3 bg-pm-bg-topbar border-b border-pm-border-s z-50 [-webkit-app-region:drag]">
        <div className="flex items-center gap-0.5 [-webkit-app-region:no-drag]">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md font-bold text-sm text-pm-orange tracking-tight">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.66 0 3-4.03 3-9s-1.34-9-3-9m0 18c-1.66 0-3-4.03-3-9s1.34-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
            Postman
          </div>
          <div className="w-px h-6 bg-pm-border mx-1.5" />
          <nav className="flex items-center gap-px">
            <button className="px-3 py-1.5 rounded text-xs font-medium text-pm-text bg-pm-active transition-all duration-150" type="button">Home</button>
          </nav>
        </div>

        <div className="flex-1 flex justify-center [-webkit-app-region:no-drag]">
          <input className="pm-input max-w-[400px] bg-pm-bg rounded-lg text-xs text-pm-text-t pl-8 py-1.5" placeholder="&#128269;  Search APIs, collections..." readOnly />
        </div>

        <div className="flex items-center gap-2 [-webkit-app-region:no-drag]">
          <button className="px-3 py-1 rounded text-xs font-semibold text-pm-text-s border border-pm-border hover:bg-pm-hover hover:text-pm-text transition-all duration-150" type="button">Invite</button>
          <button className="w-8 h-8 flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150" type="button" title="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded text-pm-text-s hover:bg-pm-hover hover:text-pm-text transition-all duration-150" type="button" title="Notifications">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 01-3.46 0" />
            </svg>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-[42px_280px_1fr] min-h-0 overflow-hidden max-xl:grid-cols-[42px_240px_1fr] max-lg:grid-cols-[42px_1fr] max-sm:grid-cols-[1fr]">
        {/* ===== Left Icon Rail ===== */}
        <aside className="bg-pm-bg-s border-r border-pm-border-s flex flex-col items-center py-2 gap-0.5 max-sm:hidden">
          <RailButton title="Collections" active={activeRail === 'collections'} onClick={() => setActiveRail('collections')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
          </RailButton>
          <RailButton title="Environments" active={activeRail === 'environments'} onClick={() => setActiveRail('environments')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
            </svg>
          </RailButton>
          <RailButton title="History" active={activeRail === 'history'} onClick={() => setActiveRail('history')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </RailButton>
        </aside>

        {/* ===== Sidebar Panel ===== */}
        {activeRail === 'collections' && (
          <Sidebar
            workspaceName={bootstrap.workspace.name}
            requests={bootstrap.requests}
            activeRequestId={activeTab?.savedRequestId ?? null}
            historyCount={bootstrap.history.length}
            environmentCount={bootstrap.environments.length}
            onNewRequest={(name) => handleNewRequest(name)}
            onImportCurl={() => setShowCurlModal(true)}
            onRenameRequest={(requestId, name) => void handleRenameRequest(requestId, name)}
            onSelectRequest={handleSelectRequest}
          />
        )}
        {activeRail === 'environments' && (
          <EnvironmentsPanel
            workspaceId={bootstrap.workspace.id}
            environments={bootstrap.environments}
            onEnvironmentsChanged={() => void refreshBootstrap()}
          />
        )}
        {activeRail === 'history' && (
          <HistoryPanel
            history={bootstrap.history}
            onSelectEntry={handleSelectHistoryEntry}
            onClearHistory={() => void handleClearHistory()}
          />
        )}

        {/* ===== Main Workspace ===== */}
        <main className="flex flex-col min-w-0 min-h-0 bg-pm-bg overflow-hidden">
          {/* ===== Tab bar ===== */}
          <div className="flex items-stretch bg-pm-bg-s border-b border-pm-border-s min-h-[36px] overflow-x-auto [&::-webkit-scrollbar]:h-0">
            {tabs.map((tab) => {
              const isActive = tab.tabId === activeTabId;
              return (
                <button
                  key={tab.tabId}
                  className={`group flex items-center gap-1.5 px-3 text-xs border-r border-pm-border-s whitespace-nowrap transition-all duration-100 min-w-0 max-w-[200px] ${
                    isActive
                      ? 'tab-active-line'
                      : 'text-pm-text-s hover:bg-pm-hover hover:text-pm-text'
                  }`}
                  onClick={() => setActiveTabId(tab.tabId)}
                  type="button"
                >
                  <span className={`text-[9px] font-bold shrink-0 ${METHOD_COLOR[tab.draft.method] ?? ''}`}>
                    {tab.draft.method}
                  </span>
                  <span className="truncate">
                    {tab.draft.name || 'Untitled'}
                  </span>
                  {tab.isDirty && (
                    <span className="w-1.5 h-1.5 rounded-full bg-pm-orange shrink-0" title="Unsaved" />
                  )}
                  {tabs.length > 1 && (
                    <span
                      className="w-4 h-4 flex items-center justify-center rounded-sm text-[13px] text-pm-text-t shrink-0 opacity-0 group-hover:opacity-100 hover:bg-pm-active hover:text-pm-text transition-all duration-100"
                      onClick={(e) => { e.stopPropagation(); closeTab(tab.tabId); }}
                    >
                      &times;
                    </span>
                  )}
                </button>
              );
            })}
            <button
              className="px-3 text-pm-text-t text-base hover:text-pm-text hover:bg-pm-hover transition-all duration-150 shrink-0"
              type="button"
              onClick={() => handleNewRequest()}
              title="New tab"
            >
              +
            </button>
            <div className="ml-auto flex items-center px-2 gap-1.5 shrink-0">
              <select className="pm-input w-auto px-2 py-0.5 rounded text-[11px] text-pm-text-t border-pm-border-s bg-transparent">
                <option>No Environment</option>
                {bootstrap.environments.map((env) => (
                  <option key={env.id} value={env.id}>{env.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Request area with draggable splitter */}
          <SplitPane
            top={<RequestEditor draft={draft} onChange={handleDraftChange} onSave={handleSave} onSend={handleSend} />}
            bottom={
              <ResponsePanel
                response={activeTab?.response ?? null}
                loading={activeTab?.loading ?? false}
                error={activeTab?.error ?? null}
                consoleLogs={activeTab?.consoleLogs ?? []}
              />
            }
          />

          {/* Status bar */}
          <div className="flex items-center justify-between px-3 h-6 bg-pm-bg-s border-t border-pm-border-s text-[11px] text-pm-text-t shrink-0">
            <div className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-st-success" />
              <span>{status}</span>
            </div>
            <div className="flex items-center gap-3">
              <span>{tabs.length} tab{tabs.length !== 1 ? 's' : ''}</span>
              <span>Local</span>
            </div>
          </div>
        </main>
      </div>

      {/* ===== Import cURL Modal ===== */}
      {showCurlModal && (
        <ImportCurlModal
          onImport={handleImportCurl}
          onClose={() => setShowCurlModal(false)}
        />
      )}
    </div>
  );
}

/* ===== Helpers ===== */

function extractNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      return segments[segments.length - 1].replace(/[_-]/g, ' ');
    }
    return u.hostname;
  } catch {
    return 'Imported Request';
  }
}

function requestToDraft(r: RequestRecord): SaveRequestDraftInput {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    collectionId: r.collectionId,
    folderId: r.folderId,
    name: r.name,
    method: r.method,
    url: r.url,
    queryParams: r.queryParams,
    headers: r.headers,
    body: r.body,
    authType: r.authType,
    authConfig: r.authConfig,
  };
}

function RailButton({ title, active, onClick, children }: { title: string; active?: boolean; onClick?: () => void; children: React.ReactNode }) {
  return (
    <button
      className={`w-[34px] h-[34px] flex items-center justify-center rounded text-pm-text-t hover:bg-pm-hover hover:text-pm-text transition-all duration-150 ${
        active ? 'rail-active-indicator' : ''
      }`}
      type="button"
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/* ===== Draggable Split Pane ===== */

function SplitPane({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [topHeight, setTopHeight] = useState<number | null>(null);
  const dragging = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    function handleMouseMove(e: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newTop = Math.max(120, Math.min(e.clientY - rect.top, rect.height - 120));
      setTopHeight(newTop);
    }

    function handleMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div
        className="flex flex-col overflow-hidden shrink-0"
        style={{ height: topHeight ?? '50%' }}
      >
        {top}
      </div>
      <div
        className="h-[4px] bg-pm-border-s shrink-0 cursor-row-resize hover:bg-pm-orange active:bg-pm-orange transition-colors duration-100"
        onMouseDown={handleMouseDown}
      />
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {bottom}
      </div>
    </div>
  );
}

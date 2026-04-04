import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  HeaderRecord,
  InspectorRequestState,
  InspectorResourceType,
  NetworkInspectorEntry,
} from '@shared/models';
import {
  copyTextToClipboard,
  formatJson,
  getCollapsibleJsonPaths,
  HighlightedJsonView,
  JsonTreeView,
  parseJsonValue,
} from './JsonCodeBlock';

const FILTER_METHODS = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const FILTER_OUTCOMES = ['all', 'failed', 'success', 'pending'] as const;
const FILTER_RESOURCE_TYPES = ['api', 'all', 'xhr', 'fetch', 'document', 'script', 'stylesheet', 'image', 'other'] as const;
const SORT_OPTIONS = ['latest', 'slowest', 'status', 'url'] as const;
const WEBVIEW_PARTITION = 'reqkit-inspector';

type MethodFilter = (typeof FILTER_METHODS)[number];
type OutcomeFilter = (typeof FILTER_OUTCOMES)[number];
type ResourceFilter = (typeof FILTER_RESOURCE_TYPES)[number];
type SortOption = (typeof SORT_OPTIONS)[number];

interface NetworkInspectorPanelProps {
  onOpenCapturedRequest(entry: NetworkInspectorEntry): void;
}

/* ---------------------------------------------------------------------------
 * Reusable horizontal / vertical drag splitter hook
 * --------------------------------------------------------------------------- */

function useResizableSplit(
  direction: 'horizontal' | 'vertical',
  defaultFraction: number,
  minPx: number,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sizePx, setSizePx] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      dragging.current = true;
      setIsDragging(true);
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
    },
    [direction],
  );

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (direction === 'horizontal') {
        const newSize = Math.max(minPx, Math.min(event.clientX - rect.left, rect.width - minPx));
        setSizePx(newSize);
      } else {
        const newSize = Math.max(minPx, Math.min(event.clientY - rect.top, rect.height - minPx));
        setSizePx(newSize);
      }
    }

    function handleMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [direction, minPx]);

  const defaultSize = `${defaultFraction * 100}%`;

  return { containerRef, sizePx, defaultSize, handleMouseDown, isDragging };
}

export function NetworkInspectorPanel({ onOpenCapturedRequest }: NetworkInspectorPanelProps) {
  const webviewRef = useRef<Electron.WebviewTag | null>(null);
  const attachedWebContentsIdRef = useRef<number | null>(null);
  const [urlInput, setUrlInput] = useState('https://example.com');
  const [browserUrl, setBrowserUrl] = useState('https://example.com');
  const [entries, setEntries] = useState<NetworkInspectorEntry[]>([]);
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [methodFilter, setMethodFilter] = useState<MethodFilter>('ALL');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [resourceFilter, setResourceFilter] = useState<ResourceFilter>('api');
  const [sortBy, setSortBy] = useState<SortOption>('latest');
  const [searchText, setSearchText] = useState('');
  const [browserStatus, setBrowserStatus] = useState('Load a site and reproduce an issue to inspect its API traffic.');
  const [requestViewMode, setRequestViewMode] = useState<'tree' | 'raw'>('tree');
  const [responseViewMode, setResponseViewMode] = useState<'tree' | 'raw'>('tree');
  const [requestCollapsedPaths, setRequestCollapsedPaths] = useState<Set<string>>(new Set());
  const [responseCollapsedPaths, setResponseCollapsedPaths] = useState<Set<string>>(new Set());
  const [copyRequestLabel, setCopyRequestLabel] = useState('Copy request');
  const [copyResponseLabel, setCopyResponseLabel] = useState('Copy response');

  const deferredSearchText = useDeferredValue(searchText.trim().toLowerCase());

  // Resizable splits
  const mainSplit = useResizableSplit('horizontal', 0.5, 280);
  const rightVerticalSplit = useResizableSplit('vertical', 0.45, 120);

  useEffect(() => {
    let cancelled = false;

    void window.appApi.getNetworkInspectorEntries()
      .then((snapshot) => {
        if (cancelled) {
          return;
        }

        startTransition(() => {
          setEntries(snapshot);
          setSelectedEntryId((currentId) => currentId ?? snapshot[0]?.id ?? null);
        });
      })
      .catch(() => {
        // Keep the current empty state if the snapshot is unavailable.
      });

    const unsubscribe = window.appApi.onNetworkInspectorEvent((event) => {
      if (event.type === 'reset') {
        startTransition(() => {
          setEntries([]);
          setSelectedEntryId(null);
        });
        return;
      }

      startTransition(() => {
        setEntries((previousEntries) => {
          const existingIndex = previousEntries.findIndex((entry) => entry.id === event.entry.id);
          if (existingIndex === -1) {
            return [event.entry, ...previousEntries];
          }

          const nextEntries = [...previousEntries];
          nextEntries[existingIndex] = event.entry;
          return nextEntries;
        });
      });
      setSelectedEntryId((currentId) => currentId ?? event.entry.id);
    });

    return () => {
      cancelled = true;
      unsubscribe();
      attachedWebContentsIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }

    let attachAttemptTimeout: number | null = null;

    const attachInspector = () => {
      let webContentsId: number;

      try {
        webContentsId = webview.getWebContentsId();
      } catch {
        return;
      }

      if (!webContentsId || attachedWebContentsIdRef.current === webContentsId) {
        return;
      }

      attachedWebContentsIdRef.current = webContentsId;
      setBrowserStatus('Inspector connected. Start using the site and ReqKit will capture its requests.');
      void window.appApi.attachNetworkInspector({
        webContentsId,
      }).catch((error) => {
        if (attachedWebContentsIdRef.current === webContentsId) {
          attachedWebContentsIdRef.current = null;
        }
        const message = error instanceof Error ? error.message : String(error);
        setBrowserStatus(`Failed to attach inspector: ${message}`);
      });
    };

    const handleDomReady = () => {
      attachInspector();
    };

    const handleDidStartLoading = () => {
      setBrowserStatus('Loading page...');
    };

    const handleDidStopLoading = () => {
      setBrowserStatus('Page loaded. Requests will appear as the site runs.');
    };

    const handleDidFailLoad = (event: Event) => {
      const detail = event as unknown as {
        errorCode: number;
        errorDescription: string;
      };
      setBrowserStatus(`Browser failed to load: ${detail.errorDescription} (${detail.errorCode})`);
    };

    const handleConsoleMessage = (event: Event) => {
      const detail = event as unknown as {
        level: number;
        message: string;
      };
      if (detail.level >= 2) {
        setBrowserStatus(`Page console: ${detail.message}`);
      }
    };

    const handleDidAttach = () => {
      attachInspector();
    };

    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-attach', handleDidAttach as EventListener);
    webview.addEventListener('did-start-loading', handleDidStartLoading);
    webview.addEventListener('did-stop-loading', handleDidStopLoading);
    webview.addEventListener('did-fail-load', handleDidFailLoad as EventListener);
    webview.addEventListener('console-message', handleConsoleMessage as EventListener);

    attachInspector();
    attachAttemptTimeout = window.setTimeout(() => {
      attachInspector();
    }, 50);

    return () => {
      if (attachAttemptTimeout !== null) {
        window.clearTimeout(attachAttemptTimeout);
      }
      attachedWebContentsIdRef.current = null;
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-attach', handleDidAttach as EventListener);
      webview.removeEventListener('did-start-loading', handleDidStartLoading);
      webview.removeEventListener('did-stop-loading', handleDidStopLoading);
      webview.removeEventListener('did-fail-load', handleDidFailLoad as EventListener);
      webview.removeEventListener('console-message', handleConsoleMessage as EventListener);
    };
  }, [browserUrl]);

  const filteredEntries = useMemo(() => {
    const visibleEntries = entries.filter((entry) => {
      if (methodFilter !== 'ALL' && entry.method.toUpperCase() !== methodFilter) {
        return false;
      }

      if (outcomeFilter !== 'all' && entry.state !== outcomeFilter) {
        return false;
      }

      if (resourceFilter === 'api' && !isApiResource(entry.resourceType)) {
        return false;
      }

      if (resourceFilter !== 'all' && resourceFilter !== 'api' && entry.resourceType !== resourceFilter) {
        return false;
      }

      if (!deferredSearchText) {
        return true;
      }

      const haystack = `${entry.method} ${entry.url} ${entry.statusCode ?? ''} ${entry.errorText ?? ''}`.toLowerCase();
      return haystack.includes(deferredSearchText);
    });

    return visibleEntries.toSorted((left, right) => compareEntries(left, right, sortBy));
  }, [deferredSearchText, entries, methodFilter, outcomeFilter, resourceFilter, sortBy]);

  const selectedEntry = useMemo(
    () => filteredEntries.find((entry) => entry.id === selectedEntryId)
      ?? entries.find((entry) => entry.id === selectedEntryId)
      ?? filteredEntries[0]
      ?? null,
    [entries, filteredEntries, selectedEntryId],
  );

  const requestJson = useMemo(
    () => formatJson(selectedEntry?.requestBody ?? ''),
    [selectedEntry?.requestBody],
  );
  const parsedRequestBody = useMemo(
    () => parseJsonValue(selectedEntry?.requestBody ?? ''),
    [selectedEntry?.requestBody],
  );
  const responseJson = useMemo(
    () => formatJson(selectedEntry?.responseBody ?? ''),
    [selectedEntry?.responseBody],
  );
  const parsedResponseBody = useMemo(
    () => parseJsonValue(selectedEntry?.responseBody ?? ''),
    [selectedEntry?.responseBody],
  );

  useEffect(() => {
    setRequestViewMode('tree');
    setResponseViewMode('tree');
    setRequestCollapsedPaths(new Set());
    setResponseCollapsedPaths(new Set());
    setCopyRequestLabel('Copy request');
    setCopyResponseLabel('Copy response');
  }, [selectedEntry?.id]);

  function handleNavigate() {
    setBrowserUrl(normalizeUrl(urlInput));
  }

  function handleReload() {
    webviewRef.current?.reload();
  }

  async function handleClearLogs() {
    await window.appApi.clearNetworkInspector();
    setBrowserStatus('Inspector cleared. Keep using the page to capture new traffic.');
  }

  async function handleCopyRequestBody() {
    const copied = await copyTextToClipboard(selectedEntry?.requestBody ?? '');
    setCopyRequestLabel(copied ? 'Copied' : 'Copy failed');
    window.setTimeout(() => setCopyRequestLabel('Copy request'), 1200);
  }

  async function handleCopyResponseBody() {
    const copied = await copyTextToClipboard(selectedEntry?.responseBody ?? '');
    setCopyResponseLabel(copied ? 'Copied' : 'Copy failed');
    window.setTimeout(() => setCopyResponseLabel('Copy response'), 1200);
  }

  return (
    <section className="col-span-2 flex min-h-0 flex-col bg-pm-bg">
      {/* ── Top toolbar ── */}
      <div className="flex items-center gap-3 border-b border-pm-border-s bg-pm-bg-s px-4 py-2.5">
        <div className="min-w-0 shrink-0">
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pm-orange">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span className="text-xs font-semibold text-pm-text">Network Inspector</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          <input
            className="pm-input min-w-0 flex-1"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                handleNavigate();
              }
            }}
            placeholder="https://your-app.example.com"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={handleNavigate}
            className="rounded border border-pm-orange bg-pm-orange px-4 py-1.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-pm-orange-h"
          >
            Go
          </button>
          <button
            type="button"
            onClick={handleReload}
            className="rounded border border-pm-border px-3 py-1.5 text-xs font-semibold text-pm-text-s transition-all duration-150 hover:bg-pm-hover hover:text-pm-text"
            title="Reload page"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void handleClearLogs()}
            className="rounded border border-pm-border px-3 py-1.5 text-xs font-semibold text-pm-text-s transition-all duration-150 hover:bg-pm-hover hover:text-pm-text"
            title="Clear captured requests"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Main resizable horizontal split: Browser | Inspector ── */}
      <div
        ref={mainSplit.containerRef}
        className="relative flex min-h-0 flex-1"
      >
        {/* Transparent overlay during drag — prevents webview from stealing mouse events */}
        {mainSplit.isDragging && (
          <div className="absolute inset-0 z-50 cursor-col-resize" />
        )}

        {/* Left: browser pane */}
        <div
          className="flex min-h-0 shrink-0 flex-col overflow-hidden"
          style={{ width: mainSplit.sizePx ?? mainSplit.defaultSize }}
        >
          <div className="flex items-center justify-between gap-3 border-b border-pm-border-s bg-pm-bg px-4 py-1.5 text-[11px] text-pm-text-t">
            <span className="truncate font-mono">{browserUrl}</span>
            <span className="shrink-0 flex items-center gap-1.5 rounded-full bg-pm-bg-t px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-st-success">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-st-success" />
              Live
            </span>
          </div>
          <div className="flex-1 bg-[#0c1117] p-2">
            <div className="h-full overflow-hidden rounded-lg border border-pm-border bg-white shadow-lg">
              <webview
                ref={(node) => {
                  webviewRef.current = node;
                }}
                className="h-full w-full"
                partition={WEBVIEW_PARTITION}
                src={browserUrl}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-pm-border-s bg-pm-bg-s px-4 py-1.5 text-[11px] text-pm-text-t">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-pm-text-t">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span className="truncate">{browserStatus}</span>
          </div>
        </div>

        {/* Horizontal drag handle */}
        <div
          className="w-[4px] shrink-0 cursor-col-resize bg-pm-border-s transition-colors duration-100 hover:bg-pm-orange active:bg-pm-orange"
          onMouseDown={mainSplit.handleMouseDown}
        />

        {/* Right: request list + detail */}
        <div
          ref={rightVerticalSplit.containerRef}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        >
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-pm-border-s bg-pm-bg-s px-4 py-2">
            <div className="relative min-w-[180px] flex-1">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-pm-text-t">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="pm-input w-full pl-8"
                placeholder="Filter by URL, method, status..."
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </div>
            <FilterSelect value={methodFilter} onChange={setMethodFilter} options={FILTER_METHODS} />
            <FilterSelect value={outcomeFilter} onChange={setOutcomeFilter} options={FILTER_OUTCOMES} />
            <FilterSelect value={resourceFilter} onChange={setResourceFilter} options={FILTER_RESOURCE_TYPES} />
            <FilterSelect value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} />
          </div>

          {/* Request list (top half, resizable) */}
          <div
            className="flex min-h-0 flex-col overflow-hidden"
            style={{ height: rightVerticalSplit.sizePx ?? rightVerticalSplit.defaultSize }}
          >
            <div className="flex items-center justify-between bg-pm-bg px-4 py-1.5 text-[11px] uppercase tracking-wide text-pm-text-t">
              <span>Requests</span>
              <span className="rounded-full bg-pm-bg-t px-2 py-0.5 text-[10px] font-semibold tabular-nums">
                {filteredEntries.length}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              {filteredEntries.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-pm-text-t opacity-40">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <div className="text-xs text-pm-text-t">
                    Use the browser on the left and matching requests will appear here.
                  </div>
                </div>
              ) : (
                <table className="w-full table-fixed border-collapse text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-pm-bg-s">
                      <th className="w-[68px] border-b border-pm-border-s px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pm-text-t">Method</th>
                      <th className="border-b border-pm-border-s px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pm-text-t">URL</th>
                      <th className="w-[64px] border-b border-pm-border-s px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pm-text-t">Status</th>
                      <th className="w-[68px] border-b border-pm-border-s px-3 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pm-text-t">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry) => {
                      const isSelected = entry.id === selectedEntry?.id;
                      return (
                        <tr
                          key={entry.id}
                          className={`cursor-pointer transition-colors duration-100 ${isSelected ? 'bg-pm-active' : 'hover:bg-pm-hover'}`}
                          onClick={() => setSelectedEntryId(entry.id)}
                        >
                          <td className="border-b border-pm-border-s px-3 py-1.5">
                            <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${getMethodBadgeClassName(entry.method)}`}>
                              {entry.method}
                            </span>
                          </td>
                          <td className="border-b border-pm-border-s px-3 py-1.5 text-pm-text">
                            <div className="truncate font-mono text-[11px]">{formatUrlForList(entry.url)}</div>
                            <div className="truncate text-[10px] text-pm-text-t">{entry.resourceType}</div>
                          </td>
                          <td className={`border-b border-pm-border-s px-3 py-1.5 font-semibold tabular-nums ${getStateClassName(entry.state)}`}>
                            {entry.statusCode ?? statusLabelForState(entry.state)}
                          </td>
                          <td className="border-b border-pm-border-s px-3 py-1.5 tabular-nums text-pm-text-s">
                            {entry.durationMs !== null ? `${entry.durationMs}ms` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Vertical drag handle */}
          <div
            className="h-[4px] shrink-0 cursor-row-resize bg-pm-border-s transition-colors duration-100 hover:bg-pm-orange active:bg-pm-orange"
            onMouseDown={rightVerticalSplit.handleMouseDown}
          />

          {/* Detail pane (bottom half) */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-pm-border-s bg-pm-bg-s px-4 py-2">
              <div className="min-w-0">
                {selectedEntry ? (
                  <>
                    <div className="truncate font-mono text-xs text-pm-text">
                      {formatUrlForList(selectedEntry.url)}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-pm-text-t">
                      <span className={`font-semibold ${getMethodClassName(selectedEntry.method)}`}>{selectedEntry.method}</span>
                      <span className="text-pm-border-strong">/</span>
                      <span className={`font-semibold ${getStateClassName(selectedEntry.state)}`}>
                        {selectedEntry.statusCode ?? statusLabelForState(selectedEntry.state)}
                      </span>
                      <span className="text-pm-border-strong">/</span>
                      <span>{selectedEntry.durationMs !== null ? `${selectedEntry.durationMs}ms` : '-'}</span>
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-pm-text-t">Select a request to inspect</div>
                )}
              </div>
              {selectedEntry && (
                <button
                  type="button"
                  onClick={() => onOpenCapturedRequest(selectedEntry)}
                  className="flex items-center gap-1.5 rounded border border-pm-orange px-3 py-1.5 text-[11px] font-semibold text-pm-orange transition-all duration-150 hover:bg-pm-orange hover:text-white"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Open in Editor
                </button>
              )}
            </div>

            {selectedEntry ? (
              <div className="grid min-h-0 flex-1 grid-cols-2 max-lg:grid-cols-1">
                <InspectorBodySection
                  title="Request"
                  subtitle={`${selectedEntry.requestHeaders.length} headers`}
                  body={selectedEntry.requestBody}
                  headers={selectedEntry.requestHeaders}
                  jsonBody={requestJson}
                  parsedBody={parsedRequestBody}
                  viewMode={requestViewMode}
                  onViewModeChange={setRequestViewMode}
                  collapsedPaths={requestCollapsedPaths}
                  onCollapsedPathsChange={setRequestCollapsedPaths}
                  copyLabel={copyRequestLabel}
                  onCopy={() => void handleCopyRequestBody()}
                />
                <InspectorBodySection
                  title="Response"
                  subtitle={selectedEntry.errorText ?? `${selectedEntry.responseHeaders.length} headers`}
                  body={selectedEntry.responseBody}
                  headers={selectedEntry.responseHeaders}
                  jsonBody={responseJson}
                  parsedBody={parsedResponseBody}
                  viewMode={responseViewMode}
                  onViewModeChange={setResponseViewMode}
                  collapsedPaths={responseCollapsedPaths}
                  onCollapsedPathsChange={setResponseCollapsedPaths}
                  copyLabel={copyResponseLabel}
                  onCopy={() => void handleCopyResponseBody()}
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-pm-text-t opacity-40">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
                <div className="text-xs text-pm-text-t">
                  Pick a request to inspect its payload, headers, and response.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Inspector body section (Request / Response pane)
 * --------------------------------------------------------------------------- */

interface InspectorBodySectionProps {
  title: string;
  subtitle: string;
  body: string | null;
  headers: HeaderRecord[];
  jsonBody: string | null;
  parsedBody: ReturnType<typeof parseJsonValue>;
  viewMode: 'tree' | 'raw';
  onViewModeChange(nextMode: 'tree' | 'raw'): void;
  collapsedPaths: Set<string>;
  onCollapsedPathsChange(nextPaths: Set<string>): void;
  copyLabel: string;
  onCopy(): void;
}

function InspectorBodySection({
  title,
  subtitle,
  body,
  headers,
  jsonBody,
  parsedBody,
  viewMode,
  onViewModeChange,
  collapsedPaths,
  onCollapsedPathsChange,
  copyLabel,
  onCopy,
}: InspectorBodySectionProps) {
  const collapsiblePaths = useMemo(
    () => (parsedBody !== undefined ? getCollapsibleJsonPaths(parsedBody) : []),
    [parsedBody],
  );

  const bodySplit = useResizableSplit('vertical', 0.65, 80);

  return (
    <div className="flex min-h-0 flex-col border-r border-pm-border-s last:border-r-0 max-lg:border-r-0 max-lg:border-b">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3 border-b border-pm-border-s bg-pm-bg px-4 py-1.5 text-[11px] text-pm-text-t">
        <div className="min-w-0">
          <span className="font-semibold uppercase tracking-wider">{title}</span>
          <span className="ml-2 text-[10px]">{subtitle}</span>
        </div>
        <div className="flex items-center gap-1">
          <ToggleButton active={viewMode === 'tree'} onClick={() => onViewModeChange('tree')}>Tree</ToggleButton>
          <ToggleButton active={viewMode === 'raw'} onClick={() => onViewModeChange('raw')}>Raw</ToggleButton>
          <button
            type="button"
            onClick={onCopy}
            className="rounded border border-pm-border px-2 py-0.5 text-[10px] transition-all duration-150 hover:bg-pm-hover hover:text-pm-text"
          >
            {copyLabel}
          </button>
          {viewMode === 'tree' && parsedBody !== undefined && (
            <button
              type="button"
              onClick={() => onCollapsedPathsChange(new Set(collapsiblePaths))}
              className="rounded border border-pm-border px-2 py-0.5 text-[10px] transition-all duration-150 hover:bg-pm-hover hover:text-pm-text"
            >
              Collapse
            </button>
          )}
        </div>
      </div>

      {/* Body + Headers with resizable split */}
      <div ref={bodySplit.containerRef} className="flex min-h-0 flex-1 flex-col">
        <div
          className="min-h-0 overflow-auto bg-pm-bg"
          style={{ height: bodySplit.sizePx ?? bodySplit.defaultSize }}
        >
          {body ? (
            jsonBody && parsedBody !== undefined ? (
              viewMode === 'tree' ? (
                <JsonTreeView
                  value={parsedBody}
                  collapsedPaths={collapsedPaths}
                  onToggle={(path) => {
                    const nextPaths = new Set(collapsedPaths);
                    if (nextPaths.has(path)) {
                      nextPaths.delete(path);
                    } else {
                      nextPaths.add(path);
                    }
                    onCollapsedPathsChange(nextPaths);
                  }}
                />
              ) : (
                <HighlightedJsonView value={jsonBody} className="text-pm-text" />
              )
            ) : (
              <pre className="m-0 whitespace-pre-wrap break-all p-4 font-mono text-xs leading-[1.7] text-pm-text">
                {body}
              </pre>
            )
          ) : (
            <div className="flex h-full items-center justify-center p-6 text-center text-xs text-pm-text-t">
              No body captured.
            </div>
          )}
        </div>

        {/* Body/Headers drag handle */}
        <div
          className="h-[3px] shrink-0 cursor-row-resize bg-pm-border-s transition-colors duration-100 hover:bg-pm-orange active:bg-pm-orange"
          onMouseDown={bodySplit.handleMouseDown}
        />

        <div className="min-h-0 flex-1 overflow-auto bg-pm-bg-s">
          <table className="w-full table-fixed border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-pm-bg-s">
                <th className="w-[36%] border-b border-pm-border-s px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pm-text-t">Header</th>
                <th className="border-b border-pm-border-s px-4 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-pm-text-t">Value</th>
              </tr>
            </thead>
            <tbody>
              {headers.length > 0 ? (
                headers.map((header) => (
                  <tr key={`${header.key}-${header.value}`}>
                    <td className="border-b border-pm-border-s px-4 py-1.5 align-top font-medium text-pm-orange">{header.key}</td>
                    <td className="break-all border-b border-pm-border-s px-4 py-1.5 align-top font-mono text-[11px] text-pm-text">{header.value}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-center text-pm-text-t">
                    No headers captured.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Small helper components
 * --------------------------------------------------------------------------- */

function ToggleButton({ active, onClick, children }: { active: boolean; onClick(): void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded border px-2 py-0.5 text-[10px] transition-all duration-150 ${
        active
          ? 'border-pm-orange bg-pm-active text-pm-text'
          : 'border-pm-border hover:bg-pm-hover hover:text-pm-text'
      }`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Pure helpers
 * --------------------------------------------------------------------------- */

function normalizeUrl(value: string): string {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return 'about:blank';
  }

  if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

function compareEntries(left: NetworkInspectorEntry, right: NetworkInspectorEntry, sortBy: SortOption) {
  switch (sortBy) {
    case 'slowest':
      return (right.durationMs ?? -1) - (left.durationMs ?? -1);
    case 'status':
      return (right.statusCode ?? -1) - (left.statusCode ?? -1);
    case 'url':
      return left.url.localeCompare(right.url);
    case 'latest':
    default:
      return right.startedAt.localeCompare(left.startedAt);
  }
}

function isApiResource(resourceType: InspectorResourceType) {
  return resourceType === 'xhr' || resourceType === 'fetch';
}

function getMethodClassName(method: string) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'text-st-success';
    case 'POST':
      return 'text-[#facc15]';
    case 'PUT':
      return 'text-st-info';
    case 'PATCH':
      return 'text-[#a78bfa]';
    case 'DELETE':
      return 'text-st-error';
    default:
      return 'text-pm-text';
  }
}

function getMethodBadgeClassName(method: string) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'bg-st-success/15 text-st-success';
    case 'POST':
      return 'bg-[#facc15]/15 text-[#facc15]';
    case 'PUT':
      return 'bg-st-info/15 text-st-info';
    case 'PATCH':
      return 'bg-[#a78bfa]/15 text-[#a78bfa]';
    case 'DELETE':
      return 'bg-st-error/15 text-st-error';
    default:
      return 'bg-pm-bg-t text-pm-text';
  }
}

function getStateClassName(state: InspectorRequestState) {
  switch (state) {
    case 'success':
      return 'text-st-success';
    case 'failed':
      return 'text-st-error';
    case 'pending':
    default:
      return 'text-pm-text-t';
  }
}

function statusLabelForState(state: InspectorRequestState) {
  switch (state) {
    case 'success':
      return 'OK';
    case 'failed':
      return 'ERR';
    case 'pending':
    default:
      return '...';
  }
}

function formatUrlForList(url: string) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.hostname}${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    return url;
  }
}

interface FilterSelectProps<T extends string> {
  value: T;
  onChange(nextValue: T): void;
  options: readonly T[];
}

function FilterSelect<T extends string>({ value, onChange, options }: FilterSelectProps<T>) {
  return (
    <select
      className="pm-input w-auto min-w-[86px] bg-transparent px-2 py-0.5 text-[11px] text-pm-text-t"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
